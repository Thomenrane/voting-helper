/**
 * `npm run link:votes -- [--model <id>] [--max-candidates <n>] [--dry-run]`
 *
 * Second half of the pipeline (#23): for every statement (demo fixtures until
 * the editorial 35 exist), preselect candidate plenary votes from the typed
 * dataset and propose the links for human review:
 * 1. mechanical eligibility (published criteria: dossier-linked, final vote
 *    or direct amendment, procedural votes excluded — vote-eligibility.ts);
 * 2. lexical prefilter + semantic decision by the injected LLM (retained /
 *    set aside, one-sentence justification, dossier direction — m3);
 * 3. per party: RAW group vote from the group's nominal ballots (strict
 *    plurality), merged into data/positions/proposals/<party>.positions.yaml
 *    (statut en_attente) plus a global review summary,
 *    data/positions/proposals/votes-liaison.review.md.
 *
 * The API key comes exclusively from ANTHROPIC_API_KEY. With --dry-run the
 * command prints the exact plan (eligibility tallies, candidates per
 * statement, token estimate) WITHOUT calling the LLM.
 *
 * Next: `npm run positions:pr -- --votes` commits the lot for review — the
 * human review of that PR IS the validation (spec #15).
 */
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { STATEMENTS, type LinkedVote } from '@voting-helper/data';

import { computeRunCost, formatRunCost, addUsage } from '../extraction/cost.ts';
import { createAnthropicClient, DEFAULT_EXTRACTION_MODEL, type LLMUsage } from '../extraction/llm-client.ts';
import { parsePositionsYaml, renderPositionsYaml } from '../extraction/positions-yaml.ts';
import { emptyManifest, latestSnapshot, verifySnapshotIntegrity } from '../snapshot/manifest.ts';
import { loadManifest, sha256Hex } from '../snapshot/snapshot-store.ts';
import { DERIVED_VOTES_SOURCE } from '../sources/votes.sources.ts';
import { PARTY_PROGRAMMES } from '../sources/party-programmes.ts';
import type { PlenaryVote, VotesDataset } from '../votes/votes.types.ts';
import { buildPartyLinks, mergeStatementVotes } from '../linking/links-yaml.ts';
import { assertPartyGroupsConsistent, PARTY_GROUPS } from '../linking/party-groups.ts';
import { renderLinkingReview, type EligibilityStats, type StatementLinkReport } from '../linking/report.ts';
import { classifyVoteEligibility } from '../linking/vote-eligibility.ts';
import {
  buildLinkingPrompt,
  DEFAULT_MAX_CANDIDATES,
  preselectVotesForStatement,
  rankCandidatesLexically,
  type EligibleVote,
} from '../linking/vote-preselection.ts';
import { fail, resolveRepoRoot, VOTES_FILES_MANIFEST, VOTES_REVIEW_FILE } from './command-support.ts';

const MANIFEST_RELATIVE_PATH = 'data/manifests/votes.manifest.json';
const PROPOSALS_DIR = 'data/positions/proposals';
/** Rough FR/NL chars-per-token heuristic — dry-run estimate only. */
const CHARS_PER_TOKEN_ESTIMATE = 3.5;

async function loadVotesDataset(repoRoot: string): Promise<{ dataset: VotesDataset; snapshotId: string }> {
  const manifest = await loadManifest(join(repoRoot, MANIFEST_RELATIVE_PATH), emptyManifest('', ''));
  const entry = latestSnapshot(manifest, DERIVED_VOTES_SOURCE.id);
  if (entry === undefined) {
    throw new Error(
      `No derived votes dataset recorded in ${MANIFEST_RELATIVE_PATH}. Run 'npm run snapshot:votes' first.`,
    );
  }
  const absPath = join(repoRoot, entry.file);
  if (!existsSync(absPath)) {
    throw new Error(
      `Snapshot file '${entry.file}' is missing locally (binaries are gitignored). ` +
        `Re-run 'npm run snapshot:votes' to re-materialize it.`,
    );
  }
  const bytes = await readFile(absPath);
  verifySnapshotIntegrity(entry, sha256Hex(bytes));
  const dataset = JSON.parse(new TextDecoder().decode(bytes)) as VotesDataset;
  if (!Array.isArray(dataset.votes)) {
    throw new Error(`Snapshot '${entry.snapshot_id}' is not a votes dataset ('votes' missing).`);
  }
  return { dataset, snapshotId: entry.snapshot_id };
}

function classifyDataset(votes: readonly PlenaryVote[]): {
  eligible: EligibleVote[];
  stats: EligibilityStats;
} {
  const eligible: EligibleVote[] = [];
  const excludedByReason = new Map<string, number>();
  for (const vote of votes) {
    const result = classifyVoteEligibility(vote);
    if (result.eligible) {
      eligible.push({ vote, kind: result.kind });
    } else {
      excludedByReason.set(result.reason, (excludedByReason.get(result.reason) ?? 0) + 1);
    }
  }
  return {
    eligible,
    stats: { total: votes.length, eligible: eligible.length, excludedByReason },
  };
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      model: { type: 'string', default: DEFAULT_EXTRACTION_MODEL },
      'max-candidates': { type: 'string', default: String(DEFAULT_MAX_CANDIDATES) },
      'dry-run': { type: 'boolean', default: false },
    },
  });
  const model = values.model;
  const dryRun = values['dry-run'];
  const maxCandidates = Number(values['max-candidates']);
  if (!Number.isInteger(maxCandidates) || maxCandidates < 1) {
    throw new Error(`--max-candidates must be a positive integer, got '${values['max-candidates']}'.`);
  }
  assertPartyGroupsConsistent();

  const repoRoot = resolveRepoRoot();
  const { dataset, snapshotId } = await loadVotesDataset(repoRoot);
  const { eligible, stats } = classifyDataset(dataset.votes);
  console.log(
    `${stats.total} plenary votes (legislature ${dataset.legislature}), ` +
      `${stats.eligible} mechanically eligible (published criteria).`,
  );
  for (const [reason, count] of stats.excludedByReason) {
    console.log(`  - ${count} excluded: ${reason}`);
  }

  const candidatesByStatement = STATEMENTS.map((statement) => ({
    statement,
    candidates: rankCandidatesLexically(statement, eligible, maxCandidates),
  }));

  if (dryRun) {
    let estimatedChars = 0;
    for (const { statement, candidates } of candidatesByStatement) {
      if (candidates.length > 0) {
        const prompt = buildLinkingPrompt(statement, candidates);
        estimatedChars += prompt.system.length + prompt.user.length;
      }
      console.log(`  ${statement.id}: ${candidates.length} candidate(s) after lexical prefilter`);
    }
    console.log(
      `\nDry-run: ${candidatesByStatement.filter((e) => e.candidates.length > 0).length} ` +
        `LLM request(s) planned (≈ ${Math.round(estimatedChars / CHARS_PER_TOKEN_ESTIMATE)} input ` +
        'tokens, heuristic). No LLM call was made, no proposal was written. Re-run without ' +
        '--dry-run with ANTHROPIC_API_KEY set to execute the linking.',
    );
    return;
  }

  const client = createAnthropicClient(model);
  console.log(`Linking with ${model}…`);
  let usage: LLMUsage = { input_tokens: 0, output_tokens: 0 };
  const reports: StatementLinkReport[] = [];
  const votesByPartyStatement = new Map<string, Map<string, LinkedVote[]>>();
  for (const { statement, candidates } of candidatesByStatement) {
    console.log(`  ${statement.id} — ${candidates.length} candidate(s)…`);
    const selection = await preselectVotesForStatement({ statement, candidates, client });
    usage = addUsage(usage, selection.usage);
    const submittedIds = new Set(candidates.map((c) => c.vote.id));
    const notSubmitted = eligible
      .filter((c) => !submittedIds.has(c.vote.id))
      .map((c) => ({ id: c.vote.id, title_fr: c.vote.title_fr }));
    const { links, absences } = buildPartyLinks(selection.retained, PARTY_GROUPS);
    for (const link of links) {
      const byStatement = votesByPartyStatement.get(link.party_id) ?? new Map<string, LinkedVote[]>();
      const list = byStatement.get(statement.id) ?? [];
      list.push(link.linked_vote);
      byStatement.set(statement.id, list);
      votesByPartyStatement.set(link.party_id, byStatement);
    }
    reports.push({
      statement,
      eligibleCount: eligible.length,
      candidateCount: candidates.length,
      notSubmitted,
      retained: selection.retained,
      setAside: selection.setAside,
      links,
      absences,
    });
  }

  const runDateIso = new Date().toISOString().slice(0, 10);
  const [year, month, day] = runDateIso.split('-');
  const runDateDisplay = `${day}/${month}/${year}`;
  const proposalsDir = join(repoRoot, PROPOSALS_DIR);
  await mkdir(proposalsDir, { recursive: true });

  const partyNameById = new Map(PARTY_PROGRAMMES.map((p) => [p.party_id, p.name]));
  const updatedRelatives: string[] = [];
  for (const [partyId, byStatement] of votesByPartyStatement) {
    const yamlPath = join(proposalsDir, `${partyId}.positions.yaml`);
    const yamlRelative = `${PROPOSALS_DIR}/${partyId}.positions.yaml`;
    const existing = existsSync(yamlPath)
      ? parsePositionsYaml(await readFile(yamlPath, 'utf8'), yamlRelative)
      : [];
    const merged = mergeStatementVotes(existing, partyId, byStatement, runDateIso);
    const header =
      `Positions ${partyNameById.get(partyId) ?? partyId} — votes liés par link:votes du ${runDateDisplay}\n` +
      `(modèle ${model}, dataset ${snapshotId}). Statut en_attente : la review humaine\n` +
      `de la PR de lot est la validation. Généré — ne pas éditer à la main hors review.`;
    await writeFile(yamlPath, renderPositionsYaml(merged, header));
    updatedRelatives.push(yamlRelative);
    console.log(`  ~ ${yamlRelative} (${byStatement.size} statement(s) linked)`);
  }
  updatedRelatives.sort();
  // Sidecar manifest: positions:pr --votes commits exactly this run's files.
  await writeFile(
    join(proposalsDir, VOTES_FILES_MANIFEST),
    `${JSON.stringify({ updated: updatedRelatives }, null, 2)}\n`,
  );

  const cost = computeRunCost(usage, model);
  const review = renderLinkingReview({
    model,
    runDate: runDateDisplay,
    datasetSnapshotId: snapshotId,
    eligibility: stats,
    reports,
    cost,
  });
  await writeFile(join(proposalsDir, VOTES_REVIEW_FILE), `${review}\n`);

  const retainedTotal = reports.reduce((n, r) => n + r.retained.length, 0);
  const withoutVotes = reports.filter((r) => r.retained.length === 0).length;
  console.log(
    `\nDone: ${retainedTotal} vote link(s) retained across ${STATEMENTS.length} statements ` +
      `(${withoutVotes} statement(s) without retained vote — excluded from the actes score), ` +
      `${updatedRelatives.length} party file(s) updated.`,
  );
  console.log(`  ${PROPOSALS_DIR}/${VOTES_REVIEW_FILE}`);
  console.log(`\n${formatRunCost(cost, model)}`);
  console.log('Next: npm run positions:pr -- --votes');
}

main().catch(fail);
