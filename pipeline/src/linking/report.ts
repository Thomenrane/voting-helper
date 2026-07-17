/**
 * Human-readable review summary of a vote-linking run — the body of the
 * batch PR (#23). The human review of that PR IS the validation (spec #15),
 * so every element a reviewer needs is here: per statement, the retained
 * dossiers with their justification and proposed direction, the RAW vote
 * per group with the DERIVED position, the set-aside candidates with their
 * reasons, and the mechanical exclusion tallies of the published criteria.
 */
import { deriveVotePosition, type Statement } from '@voting-helper/data';

import type { RunCost } from '../extraction/cost.ts';
import { formatRunCost } from '../extraction/cost.ts';
import { formatDossierRef } from './dossier-ref.ts';
import type { PartyLinkedVote, PartyVoteAbsence } from './links-yaml.ts';
import type { RetainedLink, SetAsideLink } from './vote-preselection.ts';

/** Mechanical eligibility tallies over the whole dataset. */
export interface EligibilityStats {
  total: number;
  eligible: number;
  /** Exclusion reason → number of votes excluded for it. */
  excludedByReason: ReadonlyMap<string, number>;
}

/** Everything the review needs about one statement. */
export interface StatementLinkReport {
  statement: Statement;
  /** Mechanically eligible votes in the dataset (before lexical prefilter). */
  eligibleCount: number;
  /** Candidates actually sent to the model for this statement. */
  candidateCount: number;
  retained: readonly RetainedLink[];
  setAside: readonly SetAsideLink[];
  links: readonly PartyLinkedVote[];
  absences: readonly PartyVoteAbsence[];
}

export interface LinkingReviewInput {
  model: string;
  /** DD/MM/YYYY display date of the run. */
  runDate: string;
  /** Snapshot id of the derived votes dataset the run read. */
  datasetSnapshotId: string;
  eligibility: EligibilityStats;
  reports: readonly StatementLinkReport[];
  cost: RunCost;
}

function formatDerived(value: number): string {
  return value > 0 ? `+${value}` : value < 0 ? `−${Math.abs(value)}` : '0';
}

const ABSENCE_LABEL: Record<PartyVoteAbsence['reason'], string> = {
  groupe_absent: 'groupe absent du vote (aucun scrutin nominatif exprimé)',
  groupe_partage: 'groupe partagé (égalité oui/non/abstention) — aucun vote attribué',
};

function renderRetained(link: RetainedLink): string[] {
  const { vote } = link;
  const ref =
    vote.dossier === null ? vote.id : formatDossierRef(vote.legislature, vote.dossier.id);
  const dossierTitle = vote.dossier?.title ?? 'titre inconnu';
  return [
    `**${ref} — ${dossierTitle}**`,
    `- Vote : \`${vote.id}\` du ${vote.date} (${link.kind === 'amendement' ? 'amendement' : 'vote final'}) — ${vote.title_fr}`,
    `- Direction du dossier par rapport à l'énoncé : **${link.direction_dossier}**`,
    `- Pourquoi retenu : ${link.justification}`,
  ];
}

function renderPartyTable(
  voteId: string,
  links: readonly PartyLinkedVote[],
  absences: readonly PartyVoteAbsence[],
): string[] {
  const rows = links
    .filter((l) => l.linked_vote.id === voteId)
    .map(
      (l) =>
        `| ${l.party_id} | ${l.fraction} | ${l.linked_vote.vote_groupe} | ${l.linked_vote.direction_dossier} | ${formatDerived(deriveVotePosition(l.linked_vote.vote_groupe, l.linked_vote.direction_dossier))} |`,
    );
  const lines: string[] = [];
  if (rows.length > 0) {
    lines.push(
      '',
      '| Parti | Groupe | Vote brut | Direction | Position dérivée |',
      '|---|---|---|---|---|',
      ...rows,
    );
  }
  const missing = absences.filter((a) => a.vote_id === voteId);
  if (missing.length > 0) {
    lines.push(
      '',
      ...missing.map((a) => `- _${a.party_id} (${a.fraction}) : ${ABSENCE_LABEL[a.reason]}_`),
    );
  }
  return lines;
}

function renderStatement(report: StatementLinkReport): string[] {
  const { statement } = report;
  const lines: string[] = [
    '',
    `### \`${statement.id}\` — ${statement.texte_fr}`,
    '',
    `Candidats examinés par le modèle : ${report.candidateCount} (présélection lexicale sur ${report.eligibleCount} votes mécaniquement éligibles).`,
  ];
  if (report.retained.length === 0) {
    lines.push(
      '',
      '**Aucun vote retenu** — l’énoncé reste exclu du score « actes » de chaque parti (dénominateur visible, décision #8).',
    );
  } else {
    for (const link of report.retained) {
      lines.push('', ...renderRetained(link), ...renderPartyTable(link.vote.id, report.links, report.absences));
    }
  }
  if (report.setAside.length > 0) {
    lines.push('', '**Écartés par le classement sémantique :**', '');
    for (const aside of report.setAside) {
      const ref =
        aside.vote.dossier === null
          ? aside.vote.id
          : formatDossierRef(aside.vote.legislature, aside.vote.dossier.id);
      lines.push(`- \`${aside.vote.id}\` (${ref}) : ${aside.motif}`);
    }
  }
  return lines;
}

export function renderLinkingReview(input: LinkingReviewInput): string {
  const { model, runDate, datasetSnapshotId, eligibility, reports, cost } = input;
  const retainedTotal = reports.reduce((n, r) => n + r.retained.length, 0);
  const linksTotal = reports.reduce((n, r) => n + r.links.length, 0);
  const exclusionLines = [...eligibility.excludedByReason.entries()].map(
    ([reason, count]) => `- ${count} vote(s) exclus : ${reason}`,
  );
  return [
    '# Liaison des votes aux énoncés — lot de review',
    '',
    `Run du ${runDate} — modèle \`${model}\`, dataset \`${datasetSnapshotId}\`.`,
    '',
    '**Toutes les liaisons sont proposées en statut `en_attente` : la review humaine de cette PR est la validation.**',
    'Critères de sélection publiés : `docs/methodologie/criteres-liaison-votes.md` (appliqués mécaniquement quand c’est possible, sinon décidés par le classement sémantique et justifiés ci-dessous).',
    '',
    '## Bilan',
    '',
    `- Votes en plénière dans le dataset : **${eligibility.total}**`,
    `- Mécaniquement éligibles (critères publiés) : **${eligibility.eligible}**`,
    ...exclusionLines,
    `- Votes retenus (toutes liaisons énoncé × dossier) : **${retainedTotal}**`,
    `- Votes liés proposés (parti × énoncé × vote) : **${linksTotal}**`,
    `- ${formatRunCost(cost, model)}`,
    '',
    '## Détail par énoncé',
    ...reports.flatMap((report) => renderStatement(report)),
    '',
    '_Le « vote brut » est ce que le groupe a réellement voté sur le dossier ;',
    'la « position dérivée » vaut vote brut × direction du dossier',
    '(oui×soutient=+2, oui×contredit=−2, abstention=0, non×soutient=−2,',
    'non×contredit=+2 — schéma m3, dérivation partagée `deriveVotePosition`)._',
  ].join('\n');
}
