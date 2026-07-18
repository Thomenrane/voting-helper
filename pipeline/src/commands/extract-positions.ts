/**
 * `npm run extract:positions -- --party <id> [--model <id>] [--dry-run]`
 *
 * Auditable coverage sweep (#39). Extracts one party's positions on the
 * current statements (demo fixtures until the editorial 35 exist) from its
 * programme text layers (#22): ensure the derived layers are attested in the
 * manifest, then EXHAUSTIVELY sweep every bounded chunk of the text layer —
 * each small chunk is one grouped LLM call (all statements per call), so the
 * model never sees a large context and cannot get lost in the middle. Every
 * citation is verified mechanically; a « non documentée » holds only when NO
 * chunk produced a verified citation. A deterministic, keyless lexical scan
 * then flags any silence whose subject still occurs in the programme.
 *
 * Writes:
 *   data/positions/proposals/<party>.positions.yaml  (statut en_attente/rejete)
 *   data/positions/proposals/<party>.review.md       (batch-PR review body)
 *   data/positions/proposals/<party>.coverage.md      (auditable coverage)
 * The run cost (tokens, USD, ≈EUR) is printed at the end.
 *
 * The API key comes exclusively from ANTHROPIC_API_KEY. With --dry-run the
 * command prepares the layers and prints the sweep plan (bounded chunks =
 * grouped LLM calls, chars, token/cost estimate) WITHOUT calling the LLM — it
 * never invents model output.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { STATEMENTS } from '@voting-helper/data';

import { buildPartyAdmissionInput, type DocumentSignals } from '../admission/evidence.ts';
import { getExpectedIdentity } from '../admission/expected-identity.ts';
import { assertPartyAdmitted } from '../admission/gate.ts';
import { admitParty } from '../admission/verdict.ts';
import { extractPositions, type LayerInput } from '../extraction/position-extractor.ts';
import { buildCoverageReport, renderCoverageReport } from '../extraction/coverage-report.ts';
import { computeRunCost, formatRunCost } from '../extraction/cost.ts';
import { scanLayersForStatement } from '../extraction/lexical-scan.ts';
import { createAnthropicClient, DEFAULT_EXTRACTION_MODEL } from '../extraction/llm-client.ts';
import { renderPositionsYaml, toPartyPositions } from '../extraction/positions-yaml.ts';
import { countOutcomes, renderReviewSummary } from '../extraction/report.ts';
import { formatSweepPlan, planSweep } from '../extraction/sweep-plan.ts';
import { ensureTextLayer } from '../extraction/text-layer-store.ts';
import { emptyManifest, latestSnapshot } from '../snapshot/manifest.ts';
import { loadManifest, saveManifest } from '../snapshot/snapshot-store.ts';
import { getPartyProgramme, getPartyProgrammeSources } from '../sources/party-programmes.ts';
import { fail, resolveRepoRoot } from './command-support.ts';

const MANIFEST_RELATIVE_PATH = 'data/manifests/programmes.manifest.json';
const PROPOSALS_DIR = 'data/positions/proposals';

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      party: { type: 'string' },
      model: { type: 'string', default: DEFAULT_EXTRACTION_MODEL },
      'dry-run': { type: 'boolean', default: false },
    },
  });
  if (values.party === undefined) {
    throw new Error(
      "Missing --party. Usage: npm run extract:positions -- --party ps [--model claude-sonnet-5] [--dry-run]",
    );
  }
  const party = getPartyProgramme(values.party);
  const model = values.model;
  const dryRun = values['dry-run'];

  const repoRoot = resolveRepoRoot();
  const manifestPath = join(repoRoot, MANIFEST_RELATIVE_PATH);
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
      `Party '${party.party_id}' has no PDF programme source — extraction not supported yet.`,
    );
  }

  console.log(`Preparing text layers for ${party.name} (${pdfSources.length} document(s))…`);
  const layers: LayerInput[] = [];
  for (const source of pdfSources) {
    // A dry-run mutates nothing: missing layers are derived in memory only.
    const { layer, manifest: next } = await ensureTextLayer(
      repoRoot,
      manifest,
      source,
      undefined,
      { persist: !dryRun },
    );
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

  // Porte d'admission FAIL-CLOSED (#42) : aucun parti n'est extrait sans un
  // verdict PASS net. L'évidence est construite à partir des couches texte que
  // l'on vient de préparer (en mémoire en dry-run, attestées sinon).
  const expected = getExpectedIdentity(party.party_id);
  const layerBySource = new Map(layers.map((input) => [input.layer.source_id, input.layer]));
  const admissionSignals: DocumentSignals[] = expected.parts.map((part) => ({
    source_id: part.source_id,
    layer: layerBySource.get(part.source_id) ?? null,
    knownPages: null,
  }));
  const presentSourceIds = expected.parts
    .filter((part) => latestSnapshot(manifest, part.source_id) !== undefined)
    .map((part) => part.source_id);
  const verdict = admitParty(
    buildPartyAdmissionInput(expected, admissionSignals, presentSourceIds),
  );
  console.log(`\nAdmission (#42) — verdict pour ${party.name} : ${verdict.status}`);
  for (const reason of verdict.reasons.filter((r) => r.severity !== 'PASS')) {
    console.log(`  - [${reason.severity}] ${reason.code} — ${reason.human}`);
  }

  const plan = planSweep({ partyName: party.name, statements: STATEMENTS, layers, model });
  console.log(`\n${formatSweepPlan(plan, STATEMENTS.length, model)}`);

  if (dryRun) {
    if (verdict.status !== 'PASS') {
      console.log(
        `\nAdmission: verdict ${verdict.status} — un run réel serait REFUSÉ (fail-closed #42). ` +
          'Chemin de sortie : npm run admit:source (ré-entrée humaine).',
      );
    }
    console.log(
      '\nDry-run: no LLM call was made, no positions were produced. ' +
        'Re-run without --dry-run with ANTHROPIC_API_KEY set to execute the extraction.',
    );
    return;
  }

  // Fail-closed : refuse tout parti non-PASS avant toute extraction.
  assertPartyAdmitted(verdict);

  const client = createAnthropicClient(model);
  console.log(`Extracting with ${model}…`);
  const result = await extractPositions({
    partyId: party.party_id,
    partyName: party.name,
    statements: STATEMENTS,
    layers,
    client,
    log: (line) => console.log(line),
  });

  const runDateIso = new Date().toISOString().slice(0, 10);
  const [year, month, day] = runDateIso.split('-');
  const runDateDisplay = `${day}/${month}/${year}`;
  const positions = toPartyPositions(party.party_id, result.outcomes, runDateIso);
  const yamlText = renderPositionsYaml(
    positions,
    `Positions ${party.name} — extraction LLM du ${runDateDisplay} (modèle ${model}).\n` +
      `Statuts: en_attente = à valider en review de PR; rejete = citation non retrouvée\n` +
      `mécaniquement, jamais publiée. Généré par 'npm run extract:positions' — ne pas\n` +
      `éditer à la main hors review.`,
  );
  const cost = computeRunCost(result.usage, model);

  // Deterministic, keyless coverage net: for every statement, where does its
  // subject lexically occur across the full text layers? A « non documentée »
  // with occurrences is flagged for mandatory human attention.
  const lexicalScans = STATEMENTS.map((statement) =>
    scanLayersForStatement(
      statement,
      layers.map((input) => input.layer),
    ),
  );
  const coverage = buildCoverageReport({
    partyId: party.party_id,
    statements: STATEMENTS,
    outcomes: result.outcomes,
    candidates: result.candidates,
    chunks: result.chunks,
    lexicalScans,
  });

  const summary = renderReviewSummary({
    partyName: party.name,
    model,
    runDate: runDateDisplay,
    statements: STATEMENTS,
    result,
    cost,
    coverage,
  });
  const coverageMd = renderCoverageReport(coverage, {
    partyName: party.name,
    model,
    runDate: runDateDisplay,
    statements: STATEMENTS,
  });

  const proposalsDir = join(repoRoot, PROPOSALS_DIR);
  await mkdir(proposalsDir, { recursive: true });
  const yamlPath = join(proposalsDir, `${party.party_id}.positions.yaml`);
  const reviewPath = join(proposalsDir, `${party.party_id}.review.md`);
  const coveragePath = join(proposalsDir, `${party.party_id}.coverage.md`);
  await writeFile(yamlPath, yamlText);
  await writeFile(reviewPath, `${summary}\n`);
  await writeFile(coveragePath, `${coverageMd}\n`);

  const counts = countOutcomes(result.outcomes);
  console.log(
    `\nDone: ${counts.position} proposed, ${counts.rejected} rejected (citation not found), ` +
      `${counts.conflict} conflict(s), ${counts.no_position} without documented position.`,
  );
  console.log(
    `Coverage: ${result.chunk_count} chunk(s) examined, ${coverage.flagged_count} silence(s) flagged for review.`,
  );
  console.log(`  ${PROPOSALS_DIR}/${party.party_id}.positions.yaml`);
  console.log(`  ${PROPOSALS_DIR}/${party.party_id}.review.md`);
  console.log(`  ${PROPOSALS_DIR}/${party.party_id}.coverage.md`);
  console.log(`\n${formatRunCost(cost, model)}`);
  console.log(`Next: npm run positions:pr -- --party ${party.party_id}`);
}

main().catch(fail);
