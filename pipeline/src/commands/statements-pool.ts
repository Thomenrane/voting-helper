/**
 * `npm run statements:pool -- --party <id> | --votes [--model <id>]`
 *   `[--dry-run | --emit <file> | --ingest <file>] [--batch-size <n>]`
 *
 * Generates CANDIDATE statements for the 35-statement selection (#24), from
 * one of two harvest surfaces:
 * - `--party <id>`: mines the party's programme text layers chunk by chunk
 *   for concrete measures. The text layer is source-agnostic (#51): PDF (unpdf)
 *   AND web-chapter HTML (one chapter = one page), same machinery as
 *   extract:positions — so a party with no PDF (PTB-PVDA) is harvestable too.
 * - `--votes`: mines the titles of mechanically eligible voted dossiers
 *   (#23 eligibility criteria), one explicit decision per dossier.
 *
 * Output: data/statements/pool/<party|votes>.candidates.yaml — candidates
 * only. No candidate becomes one of the 35 without the human selection and
 * rewriting session (docs/methodologie/guide-redaction-enonces.md); ranking
 * support comes from `npm run statements:select`.
 *
 * Four modes share the one real harvest (#43/#61), on BOTH surfaces:
 *   (live)            calls the injected LLM client — needs ANTHROPIC_API_KEY.
 *   --dry-run         prints the plan (chunks/batches, sizes, token estimate)
 *                     WITHOUT calling the LLM. Keyless.
 *   --emit <file>     runs the harvest up to the LLM boundary and writes the
 *                     plan + per-unit prompts to <file>. No API call. Keyless.
 *   --ingest <file>   consumes externally-produced answers, RE-VALIDATES each
 *                     unit anchor (text_sha256 + unit_size), and assembles the
 *                     pool through the SAME merge rule. Keyless.
 *
 * For the programme surface, the fail-closed admission gate (#42) guards the
 * two pool-producing paths (live + ingest): a non-admitted party is refused
 * exactly as in extract:positions. --dry-run and --emit are keyless planning
 * steps and never assert admission (they produce no candidate).
 */
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { buildPartyAdmissionInput, type DocumentSignals } from '../admission/evidence.ts';
import { getExpectedIdentity } from '../admission/expected-identity.ts';
import { assertPartyAdmitted } from '../admission/gate.ts';
import { admitParty, type PartyAdmissionVerdict } from '../admission/verdict.ts';
import { computeRunCost, formatRunCost } from '../extraction/cost.ts';
import { createAnthropicClient, DEFAULT_EXTRACTION_MODEL } from '../extraction/llm-client.ts';
import { chunkLayer, type LayerInput } from '../extraction/position-extractor.ts';
import { ensureTextLayer } from '../extraction/text-layer-store.ts';
import { supportsTextLayer } from '../extraction/text-layer.ts';
import { classifyVoteEligibility } from '../linking/vote-eligibility.ts';
import { emptyManifest, latestSnapshot } from '../snapshot/manifest.ts';
import { loadManifest, saveManifest } from '../snapshot/snapshot-store.ts';
import {
  getPartyProgramme,
  getPartyProgrammeSources,
  PARTY_PROGRAMMES,
} from '../sources/party-programmes.ts';
import {
  batchDossiers,
  buildProgrammePoolPrompt,
  buildVotePoolPrompt,
  dedupeVotedDossiers,
  generateProgrammePool,
  generateVotePool,
  DEFAULT_DOSSIER_BATCH_SIZE,
  type CandidateStatement,
  type PersistHarvest,
  type PoolGenerationResult,
} from '../statements/candidate-pool.ts';
import {
  buildProgrammePoolEmit,
  buildVotePoolEmit,
  ingestProgrammePool,
  ingestVotePool,
  parsePoolResponsesFile,
  renderPoolEmitFile,
} from '../statements/pool-offline.ts';
import { mergePoolCandidates } from '../statements/pool-merge.ts';
import { parsePoolYaml, renderPoolYaml } from '../statements/pool-yaml.ts';
import { loadVotesDataset } from '../votes/load-dataset.ts';
import { fail, resolveRepoRoot, STATEMENTS_POOL_DIR } from './command-support.ts';

/** Which of the four modes a run is in — resolved once in `main`. */
interface RunMode {
  dryRun: boolean;
  emitPath?: string;
  ingestPath?: string;
}

const PROGRAMMES_MANIFEST_RELATIVE_PATH = 'data/manifests/programmes.manifest.json';
/** Rough FR/NL chars-per-token heuristic — dry-run estimate only. */
const CHARS_PER_TOKEN_ESTIMATE = 3.5;

function displayDate(): { iso: string; display: string } {
  const iso = new Date().toISOString().slice(0, 10);
  const [year, month, day] = iso.split('-');
  return { iso, display: `${day}/${month}/${year}` };
}

/**
 * A pool file opened for a merging harvest. A re-run NEVER overwrites human
 * work (pool-merge.ts): existing candidates — ids, hand-coded positions —
 * are preserved verbatim, new candidates are appended, ambiguity fails
 * loudly. `persist` is handed to the generator so every parsed chunk lands
 * on disk immediately: a malformed answer late in a paid run loses nothing.
 */
interface PoolTarget {
  relative: string;
  existing: CandidateStatement[];
  persist: PersistHarvest;
}

async function openPoolTarget(
  repoRoot: string,
  origin: string,
  header: string,
): Promise<PoolTarget> {
  const poolDir = join(repoRoot, STATEMENTS_POOL_DIR);
  const relative = `${STATEMENTS_POOL_DIR}/${origin}.candidates.yaml`;
  const absolute = join(poolDir, `${origin}.candidates.yaml`);
  const knownPartyIds = new Set(PARTY_PROGRAMMES.map((party) => party.party_id));
  const existing = existsSync(absolute)
    ? parsePoolYaml(await readFile(absolute, 'utf8'), relative, knownPartyIds)
    : [];
  if (existing.length > 0) {
    console.log(
      `Merging into existing ${relative} — ${existing.length} candidate(s) preserved ` +
        '(ids and coded positions are never overwritten).',
    );
  }
  const persist: PersistHarvest = async (candidates) => {
    const merged = mergePoolCandidates(origin, existing, candidates);
    await mkdir(poolDir, { recursive: true });
    await writeFile(absolute, renderPoolYaml(merged, header));
  };
  return { relative, existing, persist };
}

async function reportRun(
  target: PoolTarget,
  origin: string,
  result: PoolGenerationResult,
  model: string,
): Promise<void> {
  // Idempotent final write — also covers a harvest with zero requests.
  await target.persist(result.candidates);
  const merged = mergePoolCandidates(origin, target.existing, result.candidates);
  const added = merged.length - target.existing.length;
  const byTheme = new Map<string, number>();
  for (const candidate of merged) {
    byTheme.set(candidate.theme, (byTheme.get(candidate.theme) ?? 0) + 1);
  }
  console.log(
    `\nDone: ${added} new candidate statement(s) harvested, ` +
      `${target.existing.length} preserved from previous runs — ${merged.length} in the pool.`,
  );
  for (const [theme, count] of [...byTheme.entries()].sort()) {
    console.log(`  ${theme}: ${count}`);
  }
  console.log(`  ${target.relative}`);
  console.log(`\n${formatRunCost(computeRunCost(result.usage, model), model)}`);
  console.log('Next: npm run statements:select');
}

function programmePoolHeader(partyName: string, display: string, model: string): string {
  return (
    `Énoncés candidats ${partyName} — pool mis à jour le ${display} (modèle ${model}).\n` +
    `Candidats SEULEMENT : la sélection des 35 et la réécriture sont humaines\n` +
    `(docs/methodologie/guide-redaction-enonces.md). 'positions' se code à la main\n` +
    `pendant la session HITL, puis 'npm run statements:select' classe le pool.\n` +
    `Un re-run fusionne : ids et positions codées sont toujours préservés.`
  );
}

async function runProgrammePool(partyId: string, model: string, mode: RunMode): Promise<void> {
  const party = getPartyProgramme(partyId);
  const repoRoot = resolveRepoRoot();
  const manifestPath = join(repoRoot, PROGRAMMES_MANIFEST_RELATIVE_PATH);
  let manifest = await loadManifest(manifestPath, emptyManifest('', ''));
  if (manifest.snapshots.length === 0) {
    throw new Error(`No programme snapshots recorded. Run 'npm run snapshot:programmes' first.`);
  }

  // #51 : la couche texte est agnostique à la source — PDF (unpdf) ET chapitres
  // web HTML (un chapitre = une page). On matérialise toute source capable d'une
  // couche texte (`supportsTextLayer`), exactement comme extract:positions ; le
  // filtre PDF-only et l'erreur « no PDF » ont disparu (PTB-PVDA devient
  // moissonnable). La liste des types supportés est centralisée dans
  // `supportsTextLayer`.
  const sources = getPartyProgrammeSources(party.party_id);
  const supportedSources = sources.filter((source) => supportsTextLayer(source.mediaType));
  for (const skipped of sources.filter((source) => !supportsTextLayer(source.mediaType))) {
    console.warn(
      `! Skipping '${skipped.id}' (${skipped.mediaType}) — no text-layer support for this media type.`,
    );
  }
  if (supportedSources.length === 0) {
    throw new Error(
      `Party '${party.party_id}' has no text-layer-capable programme source — pool harvest not supported.`,
    );
  }

  // Only the live and ingest paths produce real candidates and attest layers;
  // --emit and --dry-run are keyless planning steps that mutate nothing.
  const persistLayers = !(mode.dryRun || mode.emitPath !== undefined);

  console.log(`Preparing text layers for ${party.name} (${supportedSources.length} document(s))…`);
  const layers: LayerInput[] = [];
  for (const source of supportedSources) {
    const { layer, manifest: next } = await ensureTextLayer(repoRoot, manifest, source, undefined, {
      persist: persistLayers,
    });
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

  // Porte d'admission FAIL-CLOSED (#42), MÊME garde-fou que extract:positions :
  // l'évidence est construite depuis les couches qu'on vient de préparer.
  const verdict = admitProgramme(party.party_id, manifest, layers);
  console.log(`\nAdmission (#42) — verdict pour ${party.name} : ${verdict.status}`);
  for (const reason of verdict.reasons.filter((r) => r.severity !== 'PASS')) {
    console.log(`  - [${reason.severity}] ${reason.code} — ${reason.human}`);
  }

  const chunks = layers.flatMap((input) => chunkLayer(input));
  const promptChars = chunks.reduce((total, chunk) => {
    const prompt = buildProgrammePoolPrompt(party.name, chunk);
    return total + prompt.system.length + prompt.user.length;
  }, 0);
  console.log(
    `\n${chunks.length} chunk(s) planned ` +
      `(≈ ${Math.round(promptChars / CHARS_PER_TOKEN_ESTIMATE)} input tokens, heuristic).`,
  );

  if (mode.dryRun) {
    if (verdict.status !== 'PASS') {
      console.log(
        `\nAdmission: verdict ${verdict.status} — un run réel serait REFUSÉ (fail-closed #42). ` +
          'Chemin de sortie : npm run admit:source (ré-entrée humaine).',
      );
    }
    console.log(
      '\nDry-run: no LLM call was made, no candidate was produced. ' +
        'Re-run without --dry-run with ANTHROPIC_API_KEY set to harvest the pool.',
    );
    return;
  }

  if (mode.emitPath !== undefined) {
    // Run the harvest up to the LLM boundary and freeze the per-chunk prompts.
    const emit = buildProgrammePoolEmit({
      partyId: party.party_id,
      partyName: party.name,
      model,
      layers,
    });
    await writeFile(mode.emitPath, renderPoolEmitFile(emit));
    console.log(
      `\nEmitted ${emit.units.length} chunk prompt(s) to ${mode.emitPath} — no LLM call.`,
    );
    console.log(
      'Fill one JSON answer per unit (same shape the live path parses), then run ' +
        `'npm run statements:pool -- --party ${party.party_id} --ingest <responses-file>'.`,
    );
    return;
  }

  // Porte d'admission FAIL-CLOSED (#42) : placée AVANT le bloc partagé
  // live+ingest, elle couvre les DEUX chemins producteurs de candidats — un
  // parti non-PASS ne peut moissonner ni en live ni via --ingest.
  assertPartyAdmitted(verdict);

  const { display } = displayDate();
  const target = await openPoolTarget(
    repoRoot,
    party.party_id,
    programmePoolHeader(party.name, display, model),
  );

  let result: PoolGenerationResult;
  if (mode.ingestPath !== undefined) {
    const responses = parsePoolResponsesFile(
      await readFile(mode.ingestPath, 'utf8'),
      mode.ingestPath,
    );
    console.log(`Ingesting external answers from ${mode.ingestPath} (keyless — no LLM call)…`);
    result = await ingestProgrammePool({
      partyId: party.party_id,
      partyName: party.name,
      layers,
      model,
      responses,
      persist: target.persist,
      log: (line) => console.log(line),
    });
  } else {
    const client = createAnthropicClient(model);
    console.log(`Harvesting candidate statements with ${model}…`);
    result = await generateProgrammePool({
      partyId: party.party_id,
      partyName: party.name,
      layers,
      client,
      persist: target.persist,
      log: (line) => console.log(line),
    });
  }
  await reportRun(target, party.party_id, result, model);
}

/**
 * Builds the fail-closed admission verdict for a programme harvest — the same
 * evidence assembly extract:positions uses: auto-id/TOC from the just-prepared
 * text layers, present sources from the manifest.
 */
function admitProgramme(
  partyId: string,
  manifest: ReturnType<typeof emptyManifest>,
  layers: readonly LayerInput[],
): PartyAdmissionVerdict {
  const expected = getExpectedIdentity(partyId);
  const layerBySource = new Map(layers.map((input) => [input.layer.source_id, input.layer]));
  const admissionSignals: DocumentSignals[] = expected.parts.map((part) => ({
    source_id: part.source_id,
    layer: layerBySource.get(part.source_id) ?? null,
    knownPages: null,
  }));
  const presentSourceIds = expected.parts
    .filter((part) => latestSnapshot(manifest, part.source_id) !== undefined)
    .map((part) => part.source_id);
  return admitParty(buildPartyAdmissionInput(expected, admissionSignals, presentSourceIds));
}

async function runVotePool(model: string, mode: RunMode, batchSize: number): Promise<void> {
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

  if (mode.dryRun) {
    console.log(
      '\nDry-run: no LLM call was made, no candidate was produced. ' +
        'Re-run without --dry-run with ANTHROPIC_API_KEY set to harvest the pool.',
    );
    return;
  }

  if (mode.emitPath !== undefined) {
    const emit = buildVotePoolEmit({ model, dossiers, batchSize });
    await writeFile(mode.emitPath, renderPoolEmitFile(emit));
    console.log(`\nEmitted ${emit.units.length} batch prompt(s) to ${mode.emitPath} — no LLM call.`);
    console.log(
      'Fill one JSON answer per unit (same shape the live path parses), then run ' +
        `'npm run statements:pool -- --votes --ingest <responses-file>'.`,
    );
    return;
  }

  const { display } = displayDate();
  const target = await openPoolTarget(
    repoRoot,
    'votes',
    `Énoncés candidats issus des dossiers votés — pool mis à jour le ${display}\n` +
      `(modèle ${model}, dataset ${snapshotId}). Candidats SEULEMENT : la sélection\n` +
      `des 35 et la réécriture sont humaines (docs/methodologie/\n` +
      `guide-redaction-enonces.md). Un re-run fusionne : ids et positions codées\n` +
      `sont toujours préservés.`,
  );

  let result: PoolGenerationResult;
  if (mode.ingestPath !== undefined) {
    const responses = parsePoolResponsesFile(
      await readFile(mode.ingestPath, 'utf8'),
      mode.ingestPath,
    );
    console.log(`Ingesting external answers from ${mode.ingestPath} (keyless — no LLM call)…`);
    result = await ingestVotePool({
      dossiers,
      model,
      responses,
      batchSize,
      persist: target.persist,
      log: (line) => console.log(line),
    });
  } else {
    const client = createAnthropicClient(model);
    console.log(`Harvesting candidate statements with ${model}…`);
    result = await generateVotePool({
      dossiers,
      client,
      batchSize,
      persist: target.persist,
      log: (line) => console.log(line),
    });
  }
  await reportRun(target, 'votes', result, model);
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      party: { type: 'string' },
      votes: { type: 'boolean', default: false },
      model: { type: 'string', default: DEFAULT_EXTRACTION_MODEL },
      'batch-size': { type: 'string', default: String(DEFAULT_DOSSIER_BATCH_SIZE) },
      'dry-run': { type: 'boolean', default: false },
      emit: { type: 'string' },
      ingest: { type: 'string' },
    },
  });
  const usage =
    'Usage: npm run statements:pool -- --party ps | --votes [--batch-size 40] ' +
    '[--dry-run | --emit <file> | --ingest <file>]';
  if ((values.party === undefined) === !values.votes) {
    throw new Error(`Pick exactly one harvest surface. ${usage}`);
  }
  const activeModes = [
    values['dry-run'] && '--dry-run',
    values.emit !== undefined && '--emit',
    values.ingest !== undefined && '--ingest',
  ].filter(Boolean);
  if (activeModes.length > 1) {
    throw new Error(`Modes ${activeModes.join(', ')} are mutually exclusive — pick one. ${usage}`);
  }
  const mode: RunMode = {
    dryRun: values['dry-run'],
    ...(values.emit !== undefined ? { emitPath: values.emit } : {}),
    ...(values.ingest !== undefined ? { ingestPath: values.ingest } : {}),
  };
  const batchSize = Number(values['batch-size']);
  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new Error(`--batch-size must be a positive integer, got '${values['batch-size']}'.`);
  }
  if (values.party !== undefined) {
    await runProgrammePool(values.party, values.model, mode);
  } else {
    await runVotePool(values.model, mode, batchSize);
  }
}

main().catch(fail);
