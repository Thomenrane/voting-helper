/**
 * `npm run admit:attest` — chemin de RATIFICATION humaine du portail
 * d'admission (#50), distinct de `admit:source` (qui REMPLACE un document).
 *
 * Ici le document est déjà le bon et déjà snapshoté ; un humain RATIFIE un
 * critère UNCERTAIN que la porte n'arrive pas à auto-confirmer — cas réel : le
 * scrutin du 9 juin 2024 était fédéral + régional + européen le même jour, si
 * bien que la plupart des couvertures disent « Élections du 9 juin 2024 » sans
 * le mot « fédéral » et `auto-id-level` reste UNCERTAIN sur le bon document.
 *
 * Usage :
 *   npm run admit:attest -- --party ps --criteria auto-id-level[,auto-id-year] \
 *     --by "Thomas" --note "Couverture « Élections du 9 juin 2024 » vérifiée à la main"
 *
 * La commande :
 *   1. recalcule le verdict courant du parti (matérialisation locale, #46) ;
 *   2. REFUSE tout critère qui n'est pas UNCERTAIN — un FAIL (prouvé-faux) ou un
 *      NON MATÉRIALISÉ (non évalué) n'est pas ratifiable, un PASS n'a rien à
 *      ratifier ;
 *   3. attache une attestation de critère au(x) snapshot(s) brut(s) ACTUELLEMENT
 *      épinglé(s) du parti, liée à leur empreinte SHA-256 (invalidation si le
 *      document est remplacé) ;
 *   4. sauvegarde le manifeste, recalcule et imprime le nouveau verdict.
 *
 * Sans réseau ni clé : purement local, dérivé du manifeste et du binaire épinglé.
 * PAS de `--file` : le document est déjà snapshoté (utiliser `admit:source` pour
 * en fournir un nouveau). Régénérer le statut publié : `npm run admit:report`.
 */
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { admitPartyFromManifest, fileLayerLoader } from '../admission/admission-service.ts';
import { getExpectedIdentity } from '../admission/expected-identity.ts';
import { ATTESTABLE_CHECKS, isAttestableCheck } from '../admission/verdict.ts';
import {
  attachCriterionAttestation,
  emptyManifest,
  latestSnapshot,
  type CriterionAttestation,
  type SnapshotEntry,
} from '../snapshot/manifest.ts';
import { loadManifest, saveManifest } from '../snapshot/snapshot-store.ts';
import { fail, resolveRepoRoot } from './command-support.ts';

const MANIFEST_RELATIVE_PATH = 'data/manifests/programmes.manifest.json';

function required(value: string | undefined, flag: string): string {
  if (value === undefined || value.trim() === '') {
    throw new Error(
      `Missing --${flag}. Usage: npm run admit:attest -- --party <id> ` +
        `--criteria <check[,check]> --by "<name>" --note "<text>"`,
    );
  }
  return value;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      party: { type: 'string' },
      criteria: { type: 'string' },
      by: { type: 'string' },
      note: { type: 'string' },
    },
  });

  const partyId = required(values.party, 'party');
  const by = required(values.by, 'by');
  const note = required(values.note, 'note');
  const criteria = required(values.criteria, 'criteria')
    .split(',')
    .map((c) => c.trim())
    .filter((c) => c !== '');
  if (criteria.length === 0) {
    throw new Error('--criteria est vide : nomme au moins un critère à ratifier.');
  }
  for (const criterion of criteria) {
    if (!isAttestableCheck(criterion)) {
      throw new Error(
        `Critère '${criterion}' non ratifiable. Critères ratifiables : ${ATTESTABLE_CHECKS.join(', ')}.`,
      );
    }
  }

  const expected = getExpectedIdentity(partyId);
  const repoRoot = resolveRepoRoot();
  const manifestPath = join(repoRoot, MANIFEST_RELATIVE_PATH);
  let manifest = await loadManifest(manifestPath, emptyManifest('', ''));
  const loadLayer = fileLayerLoader(repoRoot);

  // Verdict courant : seul un critère UNCERTAIN est ratifiable (fail-closed).
  const before = await admitPartyFromManifest(manifest, expected, loadLayer);
  for (const criterion of criteria) {
    const reason = before.reasons.find((r) => r.check === criterion);
    if (reason === undefined) {
      throw new Error(`Le critère '${criterion}' n'est pas évalué pour le parti '${partyId}'.`);
    }
    if (reason.severity === 'UNCERTAIN') continue;
    const why =
      reason.severity === 'FAIL'
        ? `est FAIL (prouvé-faux : ${reason.code}). Une attestation ne transforme jamais un ` +
          `échec en succès — corrige le document ou fournis-en un correct via admit:source.`
        : reason.severity === 'NOT_MATERIALIZED'
          ? `est NON MATÉRIALISÉ (${reason.code}) : le binaire brut n'est pas disponible ` +
            `localement, le critère n'a pas été évalué — matérialise le snapshot d'abord.`
          : `est déjà PASS (${reason.code}) : rien à ratifier.`;
    throw new Error(`Refus de ratifier '${criterion}' pour '${partyId}' : le critère ${why}`);
  }

  // Attache l'attestation au(x) snapshot(s) brut(s) épinglé(s) du parti.
  const targets: SnapshotEntry[] = [];
  for (const part of expected.parts) {
    const raw = latestSnapshot(manifest, part.source_id);
    if (raw !== undefined) targets.push(raw);
  }
  if (targets.length === 0) {
    throw new Error(
      `Aucun snapshot brut épinglé pour '${partyId}' — rien à attester (snapshote d'abord la source).`,
    );
  }

  const at = new Date().toISOString();
  for (const target of targets) {
    const attestation: CriterionAttestation = {
      criteria,
      by,
      at,
      note,
      snapshot_sha256: target.sha256,
    };
    manifest = attachCriterionAttestation(manifest, target.snapshot_id, attestation);
  }
  await saveManifest(manifestPath, manifest);
  console.log(
    `+ Attestation enregistrée pour '${partyId}' : critère(s) ${criteria.join(', ')} — par ${by}.`,
  );
  console.log(
    `  Liée à l'empreinte : ${targets.map((t) => `${t.source_id} (sha256 ${t.sha256.slice(0, 12)}…)`).join(', ')}`,
  );

  // Re-passe la porte d'admission.
  const after = await admitPartyFromManifest(manifest, expected, loadLayer);
  console.log(`\nNouveau verdict d'admission pour '${partyId}' : ${after.status}`);
  for (const reason of after.reasons) {
    console.log(`  - [${reason.severity}] ${reason.code} — ${reason.human}`);
  }
  if (after.status === 'PASS') {
    console.log('\n✅ Parti ADMIS (critère(s) attesté(s)). Régénère le statut : npm run admit:report');
  } else {
    const mark = after.status === 'FAIL' ? '⛔' : after.status === 'NOT_MATERIALIZED' ? '⚪' : '🟠';
    console.log(
      `\n${mark} Toujours non-PASS : d'autres critères bloquent (voir ci-dessus). ` +
        'La porte reste fermée.',
    );
  }
}

main().catch(fail);
