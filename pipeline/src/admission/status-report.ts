/**
 * Statut de vérification d'admission PUBLIÉ par parti (#42).
 *
 * Rend les verdicts d'admission en deux artefacts committés, cohérents avec la
 * transparence #26 : un JSON lisible par machine (pour la contestation et
 * d'éventuelles surfaces site) et un document markdown lisible par un humain.
 * Le statut publié liste, parti par parti, le verdict PASS/UNCERTAIN/FAIL et
 * ses raisons — il alimente le canal de contestation.
 *
 * Pur : ni I/O ni horloge (le `generated_at` est injecté).
 */
import type { AdmissionReason, AdmissionStatus, PartyAdmissionVerdict } from './verdict.ts';

export interface StatusReport {
  /** Date de génération (ISO, injectée). */
  generated_at: string;
  parties: PartyAdmissionVerdict[];
}

export interface StatusCounts {
  PASS: number;
  UNCERTAIN: number;
  FAIL: number;
  NOT_MATERIALIZED: number;
}

export function countStatuses(verdicts: readonly PartyAdmissionVerdict[]): StatusCounts {
  const counts: StatusCounts = { PASS: 0, UNCERTAIN: 0, FAIL: 0, NOT_MATERIALIZED: 0 };
  for (const verdict of verdicts) counts[verdict.status] += 1;
  return counts;
}

/**
 * Ordonne les partis par sévérité décroissante puis id : FAIL, UNCERTAIN,
 * NOT_MATERIALIZED, PASS (#46 — la non-matérialisation entre le doute et le
 * succès, honnête sur ce qui n'a pas encore été évalué).
 */
const SEVERITY_ORDER: Record<AdmissionStatus, number> = {
  FAIL: 0,
  UNCERTAIN: 1,
  NOT_MATERIALIZED: 2,
  PASS: 3,
};

export function buildStatusReport(
  verdicts: readonly PartyAdmissionVerdict[],
  generatedAt: string,
): StatusReport {
  const parties = [...verdicts].sort(
    (a, b) =>
      SEVERITY_ORDER[a.status] - SEVERITY_ORDER[b.status] ||
      a.party_id.localeCompare(b.party_id),
  );
  return { generated_at: generatedAt, parties };
}

/** JSON stable (indenté), terminé par un saut de ligne. */
export function renderStatusJson(report: StatusReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

const BADGE: Record<AdmissionStatus, string> = {
  PASS: '✅ PASS',
  UNCERTAIN: '🟠 UNCERTAIN',
  FAIL: '⛔ FAIL',
  NOT_MATERIALIZED: '⚪ NON MATÉRIALISÉ',
};

/** Raisons portant une attestation humaine (#50) — critères ratifiés. */
function attestedReasons(verdict: PartyAdmissionVerdict): AdmissionReason[] {
  return verdict.reasons.filter((reason) => reason.attestation !== undefined);
}

/**
 * Badge publié. Un PASS obtenu (en partie) par ratification humaine est marqué
 * `✅ PASS (attesté)`, distinct d'un `✅ PASS` automatique : le lecteur voit ce
 * qui est machine vs humain (#50).
 */
function badgeFor(verdict: PartyAdmissionVerdict): string {
  if (verdict.status === 'PASS' && attestedReasons(verdict).length > 0) {
    return '✅ PASS (attesté)';
  }
  return BADGE[verdict.status];
}

/** Ligne « Résumé » du tableau : critères bloquants + critères ratifiés (#50). */
function summaryFor(verdict: PartyAdmissionVerdict): string {
  const blocking = verdict.reasons
    .filter((reason) => reason.severity !== 'PASS')
    .map((reason) => reason.code);
  const ratified = attestedReasons(verdict).map(
    (reason) => `${reason.code} (par ${reason.attestation?.by ?? '?'})`,
  );
  const parts = [...blocking];
  if (ratified.length > 0) parts.push(`attesté : ${ratified.join(', ')}`);
  return parts.length === 0 ? 'tous critères satisfaits' : parts.join(' · ');
}

/** Statut publié, en markdown lisible par un humain. */
export function renderStatusMarkdown(report: StatusReport): string {
  const counts = countStatuses(report.parties);
  const attestedCount = report.parties.filter((v) => attestedReasons(v).length > 0).length;
  const passLabel =
    attestedCount > 0
      ? `${counts.PASS} PASS (dont ${attestedCount} attesté${attestedCount > 1 ? 's' : ''})`
      : `${counts.PASS} PASS`;
  const lines: string[] = [
    '# Statut de vérification des sources — programmes fédéraux 2024',
    '',
    '> Artefact généré par `npm run admit:report`. Ne pas éditer à la main.',
    `> Généré le ${report.generated_at}.`,
    '',
    'Ce document publie, parti par parti, le verdict du portail d\'admission des',
    'sources (#42). Le portail est **fail-closed** : aucun parti n\'entre dans le',
    'corpus sans un verdict **PASS** net. Tout critère qui n\'est pas nettement',
    'satisfait donne **UNCERTAIN** (→ un humain recherche et fournit le bon',
    'document via `npm run admit:source`, qui re-passe la porte). **FAIL** est',
    'réservé au prouvé-faux (partie manquante, document tronqué).',
    '',
    '**NON MATÉRIALISÉ** (#46) est distinct d\'un doute : le binaire brut n\'est',
    'pas disponible localement, donc la couche texte n\'a pas pu être matérialisée',
    'et l\'auto-identification n\'a pas été évaluée. Ce n\'est ni un doute de niveau',
    'réel, ni un échec — c\'est « pas encore évalué faute de binaire ». Quand le',
    'binaire est présent, `admit:report` re-dérive la couche depuis le snapshot',
    'épinglé (intégrité SHA-256 #21) et publie le VRAI PASS/UNCERTAIN/FAIL.',
    '',
    '**PASS (attesté)** (#50) distingue un PASS obtenu par **ratification humaine**',
    'd\'un critère UNCERTAIN — un humain a vérifié le document et l\'a ratifié via',
    '`npm run admit:attest`, l\'attestation étant liée à l\'empreinte SHA-256 du',
    'snapshot épinglé. Une attestation ne ratifie que le critère nommé et ne peut',
    'PAS transformer un FAIL (prouvé-faux) ni un NON MATÉRIALISÉ en PASS ; remplacer',
    'le document l\'invalide. Chaque ratification est publiée ci-dessous (qui, quand,',
    'pourquoi).',
    '',
    `**Bilan :** ${passLabel} · ${counts.UNCERTAIN} UNCERTAIN · ${counts.FAIL} FAIL · ` +
      `${counts.NOT_MATERIALIZED} NON MATÉRIALISÉ (${report.parties.length} partis).`,
    '',
    '| Parti | Verdict | Résumé |',
    '|---|---|---|',
  ];
  for (const verdict of report.parties) {
    lines.push(`| ${verdict.party_id} | ${badgeFor(verdict)} | ${summaryFor(verdict)} |`);
  }
  lines.push('');
  lines.push('## Détail par parti');
  for (const verdict of report.parties) {
    lines.push('');
    lines.push(`### ${verdict.party_id} — ${badgeFor(verdict)}`);
    lines.push('');
    for (const reason of verdict.reasons) {
      lines.push(`- **${reason.severity}** \`${reason.code}\` (${reason.check}) — ${reason.human}`);
    }
    const ratified = attestedReasons(verdict);
    if (ratified.length > 0) {
      lines.push('');
      lines.push('  Critère(s) ratifié(s) par attestation humaine (#50) :');
      for (const reason of ratified) {
        const att = reason.attestation;
        if (att === undefined) continue;
        lines.push(
          `  - \`${reason.code}\` — ratifié par **${att.by}** le ${att.at.slice(0, 10)} : ${att.note}`,
        );
      }
    }
  }
  return `${lines.join('\n')}\n`;
}
