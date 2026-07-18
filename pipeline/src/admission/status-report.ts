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
import type { AdmissionStatus, PartyAdmissionVerdict } from './verdict.ts';

export interface StatusReport {
  /** Date de génération (ISO, injectée). */
  generated_at: string;
  parties: PartyAdmissionVerdict[];
}

export interface StatusCounts {
  PASS: number;
  UNCERTAIN: number;
  FAIL: number;
}

export function countStatuses(verdicts: readonly PartyAdmissionVerdict[]): StatusCounts {
  const counts: StatusCounts = { PASS: 0, UNCERTAIN: 0, FAIL: 0 };
  for (const verdict of verdicts) counts[verdict.status] += 1;
  return counts;
}

/** Ordonne les partis par sévérité décroissante (FAIL, UNCERTAIN, PASS) puis id. */
const SEVERITY_ORDER: Record<AdmissionStatus, number> = { FAIL: 0, UNCERTAIN: 1, PASS: 2 };

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
};

/** Statut publié, en markdown lisible par un humain. */
export function renderStatusMarkdown(report: StatusReport): string {
  const counts = countStatuses(report.parties);
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
    `**Bilan :** ${counts.PASS} PASS · ${counts.UNCERTAIN} UNCERTAIN · ${counts.FAIL} FAIL ` +
      `(${report.parties.length} partis).`,
    '',
    '| Parti | Verdict | Résumé |',
    '|---|---|---|',
  ];
  for (const verdict of report.parties) {
    const summary = verdict.reasons
      .filter((reason) => reason.severity !== 'PASS')
      .map((reason) => reason.code)
      .join(', ');
    lines.push(
      `| ${verdict.party_id} | ${BADGE[verdict.status]} | ${summary === '' ? 'tous critères satisfaits' : summary} |`,
    );
  }
  lines.push('');
  lines.push('## Détail par parti');
  for (const verdict of report.parties) {
    lines.push('');
    lines.push(`### ${verdict.party_id} — ${BADGE[verdict.status]}`);
    lines.push('');
    for (const reason of verdict.reasons) {
      lines.push(`- **${reason.severity}** \`${reason.code}\` (${reason.check}) — ${reason.human}`);
    }
  }
  return `${lines.join('\n')}\n`;
}
