/**
 * `npm run statements:pool -- --party <id> | --votes [--model <id>] [--dry-run]`
 *
 * Generates CANDIDATE statements for the 35-statement selection (#24), from
 * one of two harvest surfaces:
 * - `--party <id>`: mines the party's programme text layers chunk by chunk
 *   for concrete measures (same layer machinery as extract:positions, #22);
 * - `--votes`: mines the titles of mechanically eligible voted dossiers
 *   (#23 eligibility criteria), one explicit decision per dossier.
 *
 * Output: data/statements/pool/<party|votes>.candidates.yaml — candidates
 * only. No candidate becomes one of the 35 without the human selection and
 * rewriting session (docs/methodologie/guide-redaction-enonces.md); ranking
 * support comes from `npm run statements:select`.
 *
 * The API key comes exclusively from ANTHROPIC_API_KEY. With --dry-run the
 * command prints the exact plan (chunks or batches, sizes, token estimate)
 * WITHOUT calling the LLM — it never invents model output.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { computeRunCost, formatRunCost } from '../extraction/cost.ts';
import { createAnthropicClient, DEFAULT_EXTRACTION_MODEL } from '../extraction/llm-client.ts';
import { chunkLayer, type LayerInput } from '../extraction/position-extractor.ts';
import { ensureTextLayer } from '../extraction/text-layer-store.ts';
import { classifyVoteEligibility } from '../linking/vote-eligibility.ts';
import { emptyManifest } from '../snapshot/manifest.ts';
import { loadManifest, saveManifest } from '../snapshot/snapshot-store.ts';
import { getPartyProgramme, getPartyProgrammeSources } from '../sources/party-programmes.ts';
import {
  batchDossiers,
  buildProgrammePoolPrompt,
  buildVotePoolPrompt,
  dedupeVotedDossiers,
  generateProgrammePool,
  generateVotePool,
  DEFAULT_DOSSIER_BATCH_SIZE,
  type PoolGenerationResult,
} from '../statements/candidate-pool.ts';
import { renderPoolYaml } from '../statements/pool-yaml.ts';
import { loadVotesDataset } from '../votes/load-dataset.ts';
import { fail, resolveRepoRoot, STATEMENTS_POOL_DIR } from './command-support.ts';

const PROGRAMMES_MANIFEST_RELATIVE_PATH = 'data/manifests/programmes.manifest.json';
/** Rough FR/NL chars-per-token heuristic — dry-run estimate only. */
const CHARS_PER_TOKEN_ESTIMATE = 3.5;

function displayDate(): { iso: string; display: string } {
  const iso = new Date().toISOString().slice(0, 10);
  const [year, month, day] = iso.split('-');
  return { iso, display: `${day}/${month}/${year}` };
}

async function writePool(
  repoRoot: string,
  origin: string,
  result: PoolGenerationResult,
  header: string,
): Promise<string> {
  const poolDir = join(repoRoot, STATEMENTS_POOL_DIR);
  await mkdir(poolDir, { recursive: true });
  const relative = `${STATEMENTS_POOL_DIR}/${origin}.candidates.yaml`;
  await writeFile(join(repoRoot, relative), renderPoolYaml(result.candidates, header));
  return relative;
}

function reportRun(result: PoolGenerationResult, relative: string, model: string): void {
  const byTheme = new Map<string, number>();
  for (const candidate of result.candidates) {
    byTheme.set(candidate.theme, (byTheme.get(candidate.theme) ?? 0) + 1);
  }
  console.log(`\nDone: ${result.candidates.length} candidate statement(s) harvested.`);
  for (const [theme, count] of [...byTheme.entries()].sort()) {
    console.log(`  ${theme}: ${count}`);
  }
  console.log(`  ${relative}`);
  console.log(`\n${formatRunCost(computeRunCost(result.usage, model), model)}`);
  console.log('Next: npm run statements:select');
}

async function runProgrammePool(partyId: string, model: string, dryRun: boolean): Promise<void> {
  const party = getPartyProgramme(partyId);
  const repoRoot = resolveRepoRoot();
  const manifestPath = join(repoRoot, PROGRAMMES_MANIFEST_RELATIVE_PATH);
  let manifest = await loadManifest(manifestPath, emptyManifest('', ''));
  if (manifest.snapshots.length === 0) {
    throw new Error(`No programme snapshots recorded. Run 'npm run snapshot:programmes' first.`);
  }

  const sources = getPartyProgrammeSources(party.party_id);
  const pdfSources = sources.filter((source) => source.mediaType === 'application/pdf');
  for (const skipped of sources.filter((source) => source.mediaType !== 'application/pdf')) {
    console.warn(
      `! Skipping '${skipped.id}' (${skipped.mediaType}) — the text layer only covers PDF ` +
        'programmes for now (spike doc, known limitation).',
    );
  }
  if (pdfSources.length === 0) {
    throw new Error(
      `Party '${party.party_id}' has no PDF programme source — pool harvest not supported yet.`,
    );
  }

  console.log(`Preparing text layers for ${party.name} (${pdfSources.length} document(s))…`);
  const layers: LayerInput[] = [];
  for (const source of pdfSources) {
    // A dry-run mutates nothing: missing layers are derived in memory only.
    const { layer, manifest: next } = await ensureTextLayer(repoRoot, manifest, source, undefined, {
      persist: !dryRun,
    });
    manifest = next;
    layers.push(layer.input);
    const state = layer.created
      ? dryRun
        ? ' (derived in memory — dry-run, not attested)'
        : ' (derived + attested)'
      : ' (reused)';
    console.log(
      `  ${layer.created ? '+' : '='} ${layer.entry.snapshot_id} — ` +
        `${layer.input.layer.page_count} pages${state}`,
    );
  }
  if (!dryRun) {
    await saveManifest(manifestPath, manifest);
  }

  const chunks = layers.flatMap((input) => chunkLayer(input));
  const promptChars = chunks.reduce((total, chunk) => {
    const prompt = buildProgrammePoolPrompt(party.name, chunk);
    return total + prompt.system.length + prompt.user.length;
  }, 0);
  console.log(
    `${chunks.length} chunk(s) planned ` +
      `(≈ ${Math.round(promptChars / CHARS_PER_TOKEN_ESTIMATE)} input tokens, heuristic).`,
  );

  if (dryRun) {
    console.log(
      '\nDry-run: no LLM call was made, no candidate was produced. ' +
        'Re-run without --dry-run with ANTHROPIC_API_KEY set to harvest the pool.',
    );
    return;
  }

  const client = createAnthropicClient(model);
  console.log(`Harvesting candidate statements with ${model}…`);
  const result = await generateProgrammePool({
    partyId: party.party_id,
    partyName: party.name,
    layers,
    client,
    log: (line) => console.log(line),
  });
  const { display } = displayDate();
  const relative = await writePool(
    repoRoot,
    party.party_id,
    result,
    `Énoncés candidats ${party.name} — pool généré le ${display} (modèle ${model}).\n` +
      `Candidats SEULEMENT : la sélection des 35 et la réécriture sont humaines\n` +
      `(docs/methodologie/guide-redaction-enonces.md). 'positions' se code à la main\n` +
      `pendant la session HITL, puis 'npm run statements:select' classe le pool.`,
  );
  reportRun(result, relative, model);
}

async function runVotePool(model: string, dryRun: boolean, batchSize: number): Promise<void> {
  const repoRoot = resolveRepoRoot();
  const { dataset, snapshotId } = await loadVotesDataset(repoRoot);
  const eligibleVotes = dataset.votes.filter((vote) => classifyVoteEligibility(vote).eligible);
  const dossiers = dedupeVotedDossiers(eligibleVotes);
  console.log(
    `${dataset.votes.length} plenary votes (legislature ${dataset.legislature}, ` +
      `dataset ${snapshotId}), ${eligibleVotes.length} mechanically eligible, ` +
      `${dossiers.length} distinct voted dossier(s).`,
  );

  const batches = batchDossiers(dossiers, batchSize);
  const promptChars = batches.reduce((total, batch) => {
    const prompt = buildVotePoolPrompt(batch);
    return total + prompt.system.length + prompt.user.length;
  }, 0);
  console.log(
    `${batches.length} batch(es) of ≤ ${batchSize} dossiers planned ` +
      `(≈ ${Math.round(promptChars / CHARS_PER_TOKEN_ESTIMATE)} input tokens, heuristic).`,
  );

  if (dryRun) {
    console.log(
      '\nDry-run: no LLM call was made, no candidate was produced. ' +
        'Re-run without --dry-run with ANTHROPIC_API_KEY set to harvest the pool.',
    );
    return;
  }

  const client = createAnthropicClient(model);
  console.log(`Harvesting candidate statements with ${model}…`);
  const result = await generateVotePool({
    dossiers,
    client,
    batchSize,
    log: (line) => console.log(line),
  });
  const { display } = displayDate();
  const relative = await writePool(
    repoRoot,
    'votes',
    result,
    `Énoncés candidats issus des dossiers votés — pool généré le ${display}\n` +
      `(modèle ${model}, dataset ${snapshotId}). Candidats SEULEMENT : la sélection\n` +
      `des 35 et la réécriture sont humaines (docs/methodologie/\n` +
      `guide-redaction-enonces.md).`,
  );
  reportRun(result, relative, model);
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      party: { type: 'string' },
      votes: { type: 'boolean', default: false },
      model: { type: 'string', default: DEFAULT_EXTRACTION_MODEL },
      'batch-size': { type: 'string', default: String(DEFAULT_DOSSIER_BATCH_SIZE) },
      'dry-run': { type: 'boolean', default: false },
    },
  });
  const usage =
    'Usage: npm run statements:pool -- --party ps [--dry-run] | --votes [--batch-size 40] [--dry-run]';
  if ((values.party === undefined) === !values.votes) {
    throw new Error(`Pick exactly one harvest surface. ${usage}`);
  }
  const batchSize = Number(values['batch-size']);
  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new Error(`--batch-size must be a positive integer, got '${values['batch-size']}'.`);
  }
  if (values.party !== undefined) {
    await runProgrammePool(values.party, values.model, values['dry-run']);
  } else {
    await runVotePool(values.model, values['dry-run'], batchSize);
  }
}

main().catch(fail);
