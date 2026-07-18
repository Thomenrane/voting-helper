/**
 * `npm run admit:report` — génère le statut de vérification d'admission PUBLIÉ
 * par parti (#42), depuis le manifeste des programmes (#21).
 *
 * Pour chaque parti du registre d'identité attendue, calcule le verdict
 * PASS/UNCERTAIN/FAIL/NON MATÉRIALISÉ (auto-identification + complétude) et
 * écrit deux artefacts committés, cohérents avec la transparence #26 :
 *   docs/admission/statut-verification.md    (lisible par un humain)
 *   data/admission/statut-verification.json  (lisible par machine)
 *
 * Sans réseau ni clé : purement dérivé du manifeste committé et, quand le
 * binaire brut d'un parti est présent localement (binaires gitignorés),
 * MATÉRIALISE sa couche texte — re-dérivée du snapshot épinglé, intégrité
 * vérifiée contre l'empreinte #21 — pour publier le VRAI verdict (#46). Un
 * binaire absent laisse le parti en NON MATÉRIALISÉ (distinct d'un doute
 * réel), jamais faussement PASS.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import {
  admitPartyFromManifest,
  fileChapterInventoryLoader,
  fileLayerLoader,
  manifestAsOfDate,
} from '../admission/admission-service.ts';
import { EXPECTED_IDENTITIES } from '../admission/expected-identity.ts';
import {
  buildStatusReport,
  countStatuses,
  renderStatusJson,
  renderStatusMarkdown,
} from '../admission/status-report.ts';
import type { PartyAdmissionVerdict } from '../admission/verdict.ts';
import { emptyManifest } from '../snapshot/manifest.ts';
import { loadManifest } from '../snapshot/snapshot-store.ts';
import { fail, resolveRepoRoot } from './command-support.ts';

const MANIFEST_RELATIVE_PATH = 'data/manifests/programmes.manifest.json';
const MD_RELATIVE_PATH = 'docs/admission/statut-verification.md';
const JSON_RELATIVE_PATH = 'data/admission/statut-verification.json';

async function main(): Promise<void> {
  const repoRoot = resolveRepoRoot();
  const manifestPath = join(repoRoot, MANIFEST_RELATIVE_PATH);
  const manifest = await loadManifest(manifestPath, emptyManifest('', ''));
  if (manifest.snapshots.length === 0) {
    throw new Error(`No programme snapshots recorded. Run 'npm run snapshot:programmes' first.`);
  }

  const loadLayer = fileLayerLoader(repoRoot, manifest);
  const loadInventory = fileChapterInventoryLoader(repoRoot, manifest);
  const verdicts: PartyAdmissionVerdict[] = [];
  for (const expected of EXPECTED_IDENTITIES) {
    verdicts.push(await admitPartyFromManifest(manifest, expected, loadLayer, loadInventory));
  }

  // Déterministe (#46) : la date du snapshot épinglé, PAS une horloge de build —
  // régénérer sans nouvelle donnée reproduit un artefact byte-identique.
  const generatedAt = manifestAsOfDate(manifest);
  const report = buildStatusReport(verdicts, generatedAt);

  const mdPath = join(repoRoot, MD_RELATIVE_PATH);
  const jsonPath = join(repoRoot, JSON_RELATIVE_PATH);
  await mkdir(dirname(mdPath), { recursive: true });
  await mkdir(dirname(jsonPath), { recursive: true });
  await writeFile(mdPath, renderStatusMarkdown(report));
  await writeFile(jsonPath, renderStatusJson(report));

  const counts = countStatuses(verdicts);
  console.log(
    `Statut d'admission généré : ${counts.PASS} PASS, ${counts.UNCERTAIN} UNCERTAIN, ` +
      `${counts.FAIL} FAIL, ${counts.NOT_MATERIALIZED} NON MATÉRIALISÉ (${verdicts.length} partis).`,
  );
  console.log(`  ${MD_RELATIVE_PATH}`);
  console.log(`  ${JSON_RELATIVE_PATH}`);
}

main().catch(fail);
