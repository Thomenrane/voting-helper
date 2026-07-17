/**
 * Human-readable review summary of an extraction run — the body of the batch
 * PR (#22): positions, citations, pages, verification rate. The PR review of
 * this material IS the validation (spec #15).
 */
import type { Statement } from '@voting-helper/data';

import type { RunCost } from './cost.ts';
import { formatRunCost } from './cost.ts';
import type { PartyExtractionResult, StatementOutcome } from './position-extractor.ts';

function truncate(text: string, max = 160): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function describeOutcome(outcome: StatementOutcome): string {
  switch (outcome.kind) {
    case 'position':
      return `**${outcome.position >= 0 ? '+' : ''}${outcome.position}** | « ${truncate(outcome.citation.citation_texte)} » | ${outcome.citation.source_id} p. ${outcome.citation.citation_page} | ✅ vérifiée${outcome.citation.verdict.status === 'verified' && outcome.citation.verdict.spans_next_page ? ' (à cheval sur la page suivante)' : ''}`;
    case 'rejected': {
      const first = outcome.candidates[0];
      const where =
        first === undefined ? '' : ` | ${first.source_id} p. ${first.citation_page}`;
      const texte = first === undefined ? '' : ` | « ${truncate(first.citation_texte)} »`;
      const reason =
        first !== undefined && first.verdict.status === 'found_elsewhere'
          ? `citation retrouvée p. ${first.verdict.pages.join(', ')} mais pas p. ${first.citation_page} (page à corriger ?)`
          : 'citation introuvable dans la couche texte';
      return `rejetée${texte}${where} | ❌ ${reason} — position REJETÉE (statut rejete)`;
    }
    case 'conflict': {
      const detail = outcome.candidates
        .map((c) => `${c.position >= 0 ? '+' : ''}${c.position} (${c.source_id} p. ${c.citation_page})`)
        .join(' vs ');
      return `conflit | — | ${detail} | ⚠️ citations vérifiées mais positions divergentes — arbitrage humain, aucun enregistrement produit`;
    }
    case 'no_position':
      return `— | pas de position documentée | | ℹ️ le silence est une information`;
  }
}

export interface ReportInput {
  partyName: string;
  model: string;
  runDate: string;
  statements: readonly Statement[];
  result: PartyExtractionResult;
  cost: RunCost;
}

export function countOutcomes(outcomes: readonly StatementOutcome[]) {
  return {
    position: outcomes.filter((o) => o.kind === 'position').length,
    rejected: outcomes.filter((o) => o.kind === 'rejected').length,
    conflict: outcomes.filter((o) => o.kind === 'conflict').length,
    no_position: outcomes.filter((o) => o.kind === 'no_position').length,
  };
}

export function renderReviewSummary(input: ReportInput): string {
  const { partyName, model, runDate, statements, result, cost } = input;
  const byId = new Map(statements.map((s) => [s.id, s]));
  const counts = countOutcomes(result.outcomes);
  const proposed = counts.position + counts.rejected + counts.conflict;
  const verificationRate =
    proposed === 0
      ? 'n/a (aucune citation proposée)'
      : `${counts.position + counts.conflict}/${proposed} citations proposées vérifiées mécaniquement`;

  const rows = result.outcomes.map((outcome) => {
    const statement = byId.get(outcome.statement_id);
    const texte = statement === undefined ? outcome.statement_id : truncate(statement.texte_fr, 90);
    return `| \`${outcome.statement_id}\` | ${texte} | ${describeOutcome(outcome)} |`;
  });

  return [
    `# Positions extraites — ${partyName}`,
    '',
    `Run du ${runDate} — modèle \`${model}\`, ${result.chunk_count} chunk(s) de programme analysé(s).`,
    '',
    `**Toutes les positions sont proposées en statut \`en_attente\` : la review humaine de cette PR est la validation.**`,
    '',
    '## Bilan',
    '',
    `- Positions proposées (citation vérifiée) : **${counts.position}**`,
    `- Positions rejetées (citation non retrouvée — jamais publiées) : **${counts.rejected}**`,
    `- Conflits à arbitrer (aucun enregistrement produit) : **${counts.conflict}**`,
    `- Sans position documentée : **${counts.no_position}**`,
    `- Taux de vérification : ${verificationRate}`,
    `- ${formatRunCost(cost, model)}`,
    '',
    '## Détail par énoncé',
    '',
    '| Énoncé | Texte | Position | Citation | Source / page | Vérification |',
    '|---|---|---|---|---|---|',
    ...rows,
    '',
    '_Citations dans la langue source du programme ; « page » = page du PDF snapshoté',
    'où la citation commence ; vérification par recherche textuelle normalisée dans la',
    'couche texte dérivée (voir docs/spikes/extraction-couche-texte.md)._',
  ].join('\n');
}
