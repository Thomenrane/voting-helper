/**
 * `npm run extract:positions -- --party <id> [--model <id>] [--dry-run]`
 *
 * Extracts one party's positions on the current statements (demo fixtures
 * until the editorial 35 exist) from its programme text layers (#22):
 * ensure the derived layers are attested in the manifest, send page-aligned
 * chunks to the LLM (default model claude-sonnet-5 — ticket decision), verify
 * every citation mechanically, and write:
 *   data/positions/proposals/<party>.positions.yaml  (statut en_attente/rejete)
 *   data/positions/proposals/<party>.review.md       (batch-PR review body)
 * The run cost (tokens, USD, ≈EUR) is printed at the end.
 *
 * The API key comes exclusively from ANTHROPIC_API_KEY. With --dry-run the
 * command prepares the layers and prints the exact plan (chunks, sizes,
 * token estimate) WITHOUT calling the LLM — it never invents model output.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { STATEMENTS } from '@voting-helper/data';

import { chunkLayer, extractPositions, type LayerInput } from '../extraction/position-extractor.ts';
import { computeRunCost, formatRunCost } from '../extraction/cost.ts';
import { createAnthropicClient, DEFAULT_EXTRACTION_MODEL } from '../extraction/llm-client.ts';
import { renderPositionsYaml, toPartyPositions } from '../extraction/positions-yaml.ts';
import { countOutcomes, renderReviewSummary } from '../extraction/report.ts';
import { ensureTextLayer } from '../extraction/text-layer-store.ts';
import { emptyManifest } from '../snapshot/manifest.ts';
import { loadManifest, saveManifest } from '../snapshot/snapshot-store.ts';
import { getPartyProgramme, getPartyProgrammeSources } from '../sources/party-programmes.ts';
import { fail, resolveRepoRoot } from './command-support.ts';

const MANIFEST_RELATIVE_PATH = 'data/manifests/programmes.manifest.json';
const PROPOSALS_DIR = 'data/positions/proposals';
/** Rough FR/NL chars-per-token heuristic — dry-run estimate only. */
const CHARS_PER_TOKEN_ESTIMATE = 3.5;

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
    const { layer, manifest: next } = await ensureTextLayer(repoRoot, manifest, source);
    manifest = next;
    layers.push(layer.input);
    console.log(
      `  ${layer.created ? '+' : '='} ${layer.entry.snapshot_id} — ` +
        `${layer.input.layer.page_count} pages${layer.created ? ' (derived + attested)' : ' (reused)'}`,
    );
  }
  await saveManifest(manifestPath, manifest);

  const chunks = layers.flatMap((input) => chunkLayer(input));
  const totalChars = chunks.reduce((n, c) => n + c.text.length, 0);
  console.log(
    `${STATEMENTS.length} statements × ${chunks.length} chunk(s), ` +
      `${totalChars} chars of programme text ` +
      `(≈ ${Math.round(totalChars / CHARS_PER_TOKEN_ESTIMATE)} input tokens, heuristic).`,
  );

  if (dryRun) {
    console.log(
      '\nDry-run: no LLM call was made, no positions were produced. ' +
        'Re-run without --dry-run with ANTHROPIC_API_KEY set to execute the extraction.',
    );
    return;
  }

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
  const summary = renderReviewSummary({
    partyName: party.name,
    model,
    runDate: runDateDisplay,
    statements: STATEMENTS,
    result,
    cost,
  });

  const proposalsDir = join(repoRoot, PROPOSALS_DIR);
  await mkdir(proposalsDir, { recursive: true });
  const yamlPath = join(proposalsDir, `${party.party_id}.positions.yaml`);
  const reviewPath = join(proposalsDir, `${party.party_id}.review.md`);
  await writeFile(yamlPath, yamlText);
  await writeFile(reviewPath, `${summary}\n`);

  const counts = countOutcomes(result.outcomes);
  console.log(
    `\nDone: ${counts.position} proposed, ${counts.rejected} rejected (citation not found), ` +
      `${counts.conflict} conflict(s), ${counts.no_position} without documented position.`,
  );
  console.log(`  ${PROPOSALS_DIR}/${party.party_id}.positions.yaml`);
  console.log(`  ${PROPOSALS_DIR}/${party.party_id}.review.md`);
  console.log(`\n${formatRunCost(cost, model)}`);
  console.log(`Next: npm run positions:pr -- --party ${party.party_id}`);
}

main().catch(fail);
