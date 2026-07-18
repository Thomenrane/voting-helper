/**
 * `npm run admit:source` — chemin de ré-entrée HUMAIN du portail d'admission
 * (#42), le garde-fou du PO.
 *
 * Usage :
 *   npm run admit:source -- \
 *     --party nva --source-id nva-programme-2024 \
 *     --file ./le-bon-programme.pdf \
 *     --by "Thomas" --source "https://www.n-va.be/… (téléchargé en navigateur)" \
 *     [--note "programme fédéral complet vérifié à la main"]
 *
 * Quand un parti est UNCERTAIN/FAIL à la porte, un humain trouve et fournit le
 * bon document. La commande :
 *   1. snapshote le fichier fourni en réutilisant la machinerie #21
 *      (fingerprint SHA-256, entrée immuable datée), canal `manual`, avec une
 *      ATTESTATION (qui / quand / source / note) enregistrée au manifeste ;
 *   2. re-dérive la couche texte (#22) du nouveau document ;
 *   3. re-passe la porte d'admission et imprime le nouveau verdict.
 *
 * Sans réseau ni clé : le document vient du disque local. L'attestation est
 * committée au manifeste et publiée par `npm run admit:report`.
 */
import { readFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { parseArgs } from 'node:util';

import { admitPartyFromManifest, fileLayerLoader } from '../admission/admission-service.ts';
import { getExpectedIdentity } from '../admission/expected-identity.ts';
import { ensureTextLayer } from '../extraction/text-layer-store.ts';
import {
  appendSnapshot,
  buildSnapshotEntry,
  emptyManifest,
  type SnapshotSource,
} from '../snapshot/manifest.ts';
import { loadManifest, saveManifest, sha256Hex, writeSnapshotFile } from '../snapshot/snapshot-store.ts';
import { PROGRAMME_SOURCES } from '../sources/programmes.sources.ts';
import { fail, resolveRepoRoot } from './command-support.ts';

const MANIFEST_RELATIVE_PATH = 'data/manifests/programmes.manifest.json';
const SNAPSHOTS_DIR = 'data/snapshots/programmes';

function required(value: string | undefined, flag: string): string {
  if (value === undefined || value.trim() === '') {
    throw new Error(
      `Missing --${flag}. Usage: npm run admit:source -- --party <id> --source-id <id> ` +
        `--file <path> --by "<name>" --source "<url|description>" [--note "<text>"]`,
    );
  }
  return value;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      party: { type: 'string' },
      'source-id': { type: 'string' },
      file: { type: 'string' },
      by: { type: 'string' },
      source: { type: 'string' },
      note: { type: 'string' },
    },
  });

  const partyId = required(values.party, 'party');
  const sourceId = required(values['source-id'], 'source-id');
  const filePath = required(values.file, 'file');
  const by = required(values.by, 'by');
  const attestationSource = required(values.source, 'source');

  const expected = getExpectedIdentity(partyId);
  if (!expected.parts.some((part) => part.source_id === sourceId)) {
    const known = expected.parts.map((part) => part.source_id).join(', ');
    throw new Error(
      `Source '${sourceId}' n'est pas une partie attendue du parti '${partyId}'. Parties : ${known}.`,
    );
  }
  const registrySource = PROGRAMME_SOURCES.find((source) => source.id === sourceId);
  if (registrySource === undefined) {
    throw new Error(`Source '${sourceId}' inconnue du registre #21 — dérive de registre.`);
  }

  const repoRoot = resolveRepoRoot();
  const manifestPath = join(repoRoot, MANIFEST_RELATIVE_PATH);
  let manifest = await loadManifest(manifestPath, emptyManifest('', ''));

  const absFilePath = isAbsolute(filePath) ? filePath : join(process.cwd(), filePath);
  const bytes = await readFile(absFilePath);
  const now = new Date();

  // Snapshot manuel : réutilise la machinerie #21, canal `manual` + attestation.
  const manualSource: SnapshotSource = { ...registrySource, channel: 'manual' };
  const entry = buildSnapshotEntry({
    source: manualSource,
    kind: 'raw',
    retrievedAt: now.toISOString(),
    sha256: sha256Hex(bytes),
    bytes: bytes.byteLength,
    snapshotsDir: SNAPSHOTS_DIR,
    attestation: {
      by,
      at: now.toISOString(),
      source: attestationSource,
      ...(values.note !== undefined ? { note: values.note } : {}),
    },
  });
  manifest = appendSnapshot(manifest, entry);
  const appended = manifest.snapshots[manifest.snapshots.length - 1];
  if (appended === undefined) {
    throw new Error(`Manifest append produced no entry for manual source '${sourceId}'.`);
  }
  await writeSnapshotFile(repoRoot, appended, bytes);
  await saveManifest(manifestPath, manifest);
  console.log(
    `+ Document attesté snapshoté : ${appended.snapshot_id} ` +
      `(${appended.bytes} octets, sha256 ${appended.sha256.slice(0, 12)}…, canal manual).`,
  );
  console.log(`  Attestation : ${by} — ${attestationSource}`);

  // Re-dérive la couche texte du nouveau document (PDF uniquement).
  if (manualSource.mediaType === 'application/pdf') {
    const result = await ensureTextLayer(repoRoot, manifest, manualSource);
    manifest = result.manifest;
    await saveManifest(manifestPath, manifest);
    console.log(
      `= Couche texte ${result.layer.created ? 'dérivée + attestée' : 'réutilisée'} : ` +
        `${result.layer.input.layer.page_count} pages.`,
    );
  } else {
    console.warn(
      `! Source ${manualSource.mediaType} : la couche texte par page ne la couvre pas ` +
        '(limitation connue #22) — l\'auto-identification restera non évaluée.',
    );
  }

  // Re-passe la porte d'admission.
  const verdict = await admitPartyFromManifest(manifest, expected, fileLayerLoader(repoRoot, manifest));
  console.log(`\nNouveau verdict d'admission pour '${partyId}' : ${verdict.status}`);
  for (const reason of verdict.reasons) {
    console.log(`  - [${reason.severity}] ${reason.code} — ${reason.human}`);
  }
  if (verdict.status === 'PASS') {
    console.log('\n✅ Parti ADMIS. Régénère le statut publié : npm run admit:report');
  } else {
    console.log(
      `\n${verdict.status === 'FAIL' ? '⛔' : '🟠'} Toujours non-PASS : la porte reste fermée. ` +
        'Fournis un document correct/complet et relance admit:source.',
    );
  }
}

main().catch(fail);
