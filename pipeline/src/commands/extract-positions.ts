/**
 * `npm run extract:positions -- --party <id> [--model <id>]`
 *   `[--dry-run | --emit <file> | --ingest <file>]`
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
 * Four modes share the one real orchestration (#43):
 *   (live)            calls the injected LLM client — needs ANTHROPIC_API_KEY.
 *   --dry-run         prints the sweep plan (bounded chunks, chars, token/cost
 *                     estimate) WITHOUT calling the LLM. Keyless.
 *   --emit <file>     runs the sweep up to the LLM boundary and writes the plan
 *                     + per-chunk prompts to <file>. No API call. Keyless. A
 *                     subscription agent / human / API then fills the responses.
 *   --ingest <file>   consumes those externally-produced answers and re-enters
 *                     the SAME orchestration (strict+complete parsing,
 *                     verifyCitation, mergeCandidates, coverage) — a missing
 *                     chunk or an omitted statement is a HARD ERROR. Keyless.
 *
 * Writes (live + ingest):
 *   data/positions/proposals/<party>.positions.yaml  (statut en_attente/rejete)
 *   data/positions/proposals/<party>.review.md       (batch-PR review body)
 *   data/positions/proposals/<party>.coverage.md      (auditable coverage)
 * The run cost (tokens, USD, ≈EUR) is printed at the end (zero for --ingest).
 *
 * The LLM client is INJECTED (createAnthropicClient by default); the API key
 * comes exclusively from ANTHROPIC_API_KEY, read only on the live path. --emit,
 * --ingest and --dry-run never build a client and never invent model output.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { STATEMENTS } from '@voting-helper/data';

import { buildPartyAdmissionInput, type DocumentSignals } from '../admission/evidence.ts';
import { getExpectedIdentity } from '../admission/expected-identity.ts';
import { assertPartyAdmitted } from '../admission/gate.ts';
import { admitParty } from '../admission/verdict.ts';
import {
  extractPositions,
  type LayerInput,
  type PartyExtractionResult,
} from '../extraction/position-extractor.ts';
import { buildCoverageReport, renderCoverageReport } from '../extraction/coverage-report.ts';
import { computeRunCost, formatRunCost } from '../extraction/cost.ts';
import { scanLayersForStatement } from '../extraction/lexical-scan.ts';
import {
  createAnthropicClient,
  DEFAULT_EXTRACTION_MODEL,
  type LLMClient,
} from '../extraction/llm-client.ts';
import {
  buildEmitFile,
  ingestPositions,
  parseResponsesFile,
  renderEmitFile,
} from '../extraction/offline-extraction.ts';
import { renderPositionsYaml, toPartyPositions } from '../extraction/positions-yaml.ts';
import { countOutcomes, renderReviewSummary } from '../extraction/report.ts';
import { formatSweepPlan, planSweep } from '../extraction/sweep-plan.ts';
import { ensureTextLayer } from '../extraction/text-layer-store.ts';
import { supportsTextLayer } from '../extraction/text-layer.ts';
import { emptyManifest, latestSnapshot } from '../snapshot/manifest.ts';
import { loadManifest, saveManifest } from '../snapshot/snapshot-store.ts';
import { getPartyProgramme, getPartyProgrammeSources } from '../sources/party-programmes.ts';
import { fail, resolveRepoRoot } from './command-support.ts';

const MANIFEST_RELATIVE_PATH = 'data/manifests/programmes.manifest.json';
const PROPOSALS_DIR = 'data/positions/proposals';

/** Injectable dependencies — the seam that makes the LLM client swappable (#43). */
export interface ExtractPositionsDeps {
  /** Live-path LLM client factory; defaults to the real Anthropic client. */
  clientFactory?: (model: string) => LLMClient;
  /** Clock, injectable so runs are reproducible in tests. */
  now?: () => Date;
}

export async function runExtractPositions(deps: ExtractPositionsDeps = {}): Promise<void> {
  const clientFactory = deps.clientFactory ?? createAnthropicClient;
  const now = deps.now ?? ((): Date => new Date());
  const { values } = parseArgs({
    options: {
      party: { type: 'string' },
      model: { type: 'string', default: DEFAULT_EXTRACTION_MODEL },
      'dry-run': { type: 'boolean', default: false },
      emit: { type: 'string' },
      ingest: { type: 'string' },
    },
  });
  if (values.party === undefined) {
    throw new Error(
      'Missing --party. Usage: npm run extract:positions -- --party ps ' +
        '[--model claude-sonnet-5] [--dry-run | --emit <file> | --ingest <file>]',
    );
  }
  const emitPath = values.emit;
  const ingestPath = values.ingest;
  const dryRun = values['dry-run'];
  const activeModes = [dryRun && '--dry-run', emitPath && '--emit', ingestPath && '--ingest'].filter(
    Boolean,
  );
  if (activeModes.length > 1) {
    throw new Error(`Modes ${activeModes.join(', ')} are mutually exclusive — pick one.`);
  }
  const party = getPartyProgramme(values.party);
  const model = values.model;
  // Only the live and ingest paths produce real proposal artefacts and attest
  // layers; --emit and --dry-run are keyless planning steps that mutate nothing.
  const persistLayers = !(dryRun || emitPath !== undefined);

  const repoRoot = resolveRepoRoot();
  const manifestPath = join(repoRoot, MANIFEST_RELATIVE_PATH);
  let manifest = await loadManifest(manifestPath, emptyManifest('', ''));
  if (manifest.snapshots.length === 0) {
    throw new Error(`No programme snapshots recorded. Run 'npm run snapshot:programmes' first.`);
  }

  const sources = getPartyProgrammeSources(party.party_id);
  // #51 : la couche texte couvre le PDF (#22) ET les chapitres web HTML — même
  // structure `ProgrammeTextLayer`, l'extraction reste agnostique à la source.
  // `ensureTextLayer` matérialise les chapitres HTML depuis leurs snapshots
  // (échoue avec un message actionnable si le crawl n'a pas tourné, ou si
  // l'inventaire des chapitres est incomplet — fail-closed #51). La liste des
  // types supportés est centralisée dans `supportsTextLayer`.
  const supportedSources = sources.filter((source) => supportsTextLayer(source.mediaType));
  for (const skipped of sources.filter((source) => !supportsTextLayer(source.mediaType))) {
    console.warn(
      `! Skipping '${skipped.id}' (${skipped.mediaType}) — no text-layer support for this media type.`,
    );
  }
  if (supportedSources.length === 0) {
    throw new Error(
      `Party '${party.party_id}' has no text-layer-capable programme source — extraction not supported.`,
    );
  }

  console.log(`Preparing text layers for ${party.name} (${supportedSources.length} document(s))…`);
  const layers: LayerInput[] = [];
  for (const source of supportedSources) {
    // Keyless planning modes (--dry-run, --emit) mutate nothing: missing layers
    // are derived in memory only, never attested.
    const { layer, manifest: next } = await ensureTextLayer(
      repoRoot,
      manifest,
      source,
      undefined,
      { persist: persistLayers },
    );
    manifest = next;
    layers.push(layer.input);
    const state = layer.created
      ? persistLayers
        ? ' (derived + attested)'
        : ' (derived in memory — planning only, not attested)'
      : ' (reused)';
    console.log(
      `  ${layer.created ? '+' : '='} ${layer.entry.snapshot_id} — ` +
        `${layer.input.layer.page_count} pages${state}`,
    );
  }
  if (persistLayers) {
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

  if (emitPath !== undefined) {
    // Run the sweep up to the LLM boundary and freeze the per-chunk prompts.
    const emit = buildEmitFile({
      partyId: party.party_id,
      partyName: party.name,
      model,
      statements: STATEMENTS,
      layers,
    });
    await writeFile(emitPath, renderEmitFile(emit));
    console.log(
      `\nEmitted ${emit.chunks.length} chunk prompt(s) (${STATEMENTS.length} statements grouped ` +
        `per chunk) to ${emitPath} — no LLM call.`,
    );
    console.log(
      'Fill one structured answer per chunk (same JSON shape the live path parses), then run ' +
        `'npm run extract:positions -- --party ${party.party_id} --ingest <responses-file>'.`,
    );
    return;
  }

  // Porte d'admission FAIL-CLOSED (#42) : placée AVANT le bloc partagé
  // live+ingest, elle couvre les DEUX chemins producteurs de positions — un
  // parti non-PASS ne peut produire de positions ni en live ni via --ingest.
  // (--dry-run et --emit sont sortis plus haut : ils ne produisent aucune
  // position.) Le seul chemin de sortie reste la ré-entrée humaine.
  assertPartyAdmitted(verdict);

  // Live and ingest share the single real orchestration; only who produces the
  // per-chunk LLM outputs differs. Ingest replays externally-filled answers
  // (keyless), live calls the injected client (needs ANTHROPIC_API_KEY).
  let result: PartyExtractionResult;
  if (ingestPath !== undefined) {
    const responses = parseResponsesFile(await readFile(ingestPath, 'utf8'), ingestPath);
    console.log(`Ingesting external answers from ${ingestPath} (keyless — no LLM call)…`);
    result = await ingestPositions({
      partyId: party.party_id,
      partyName: party.name,
      statements: STATEMENTS,
      layers,
      model,
      responses,
      log: (line) => console.log(line),
    });
  } else {
    const client = clientFactory(model);
    console.log(`Extracting with ${model}…`);
    result = await extractPositions({
      partyId: party.party_id,
      partyName: party.name,
      statements: STATEMENTS,
      layers,
      client,
      log: (line) => console.log(line),
    });
  }

  const runDateIso = now().toISOString().slice(0, 10);
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

runExtractPositions().catch(fail);
