/**
 * Results view (#19) — DOM glue between the scoring engine's output and the
 * server-rendered results panel (ResultsPanel.astro).
 *
 * Every element it touches is server-rendered (so Astro's scoped styles
 * apply); this module only reorders nodes, fills text and positions the
 * slope lines. All ordering/formatting decisions live in the pure, tested
 * module results-presentation.ts.
 */
import type { PartyScore } from '../scoring/scoring.ts';
import {
  formatEcart,
  formatScore,
  rankByDimension,
  slopeLines,
  type Dimension,
} from './results-presentation.ts';

/** The subset of UI strings the results view needs. */
export interface ResultsViewStrings {
  notAvailable: string;
  basedOn: (included: number, total: number) => string;
  ecartLabel: string;
  ecartMarquantLabel: string;
}

/** Latest scores per panel, so resize re-positions lines without re-render. */
const latestScores = new WeakMap<HTMLElement, readonly PartyScore[]>();

function renderColumn(
  panel: HTMLElement,
  dimension: Dimension,
  scores: readonly PartyScore[],
  strings: ResultsViewStrings,
  totalStatements: number,
): void {
  const list = panel.querySelector<HTMLElement>(`[data-slope-list="${dimension}"]`);
  if (!list) return;
  const scoreById = new Map(scores.map((s) => [s.partyId, s]));

  for (const ranked of rankByDimension(scores, dimension)) {
    const item = list.querySelector<HTMLElement>(`[data-party="${ranked.partyId}"]`);
    const party = scoreById.get(ranked.partyId);
    if (!item || !party) continue;

    const rank = item.querySelector<HTMLElement>('[data-rank]');
    if (rank) rank.textContent = `${ranked.rank}`;
    const score = item.querySelector<HTMLElement>('[data-score]');
    if (score) score.textContent = formatScore(ranked.score, strings.notAvailable);
    const denominator = item.querySelector<HTMLElement>('[data-denominator]');
    if (denominator) denominator.textContent = strings.basedOn(ranked.denominator, totalStatements);

    const badge = item.querySelector<HTMLElement>('[data-ecart]');
    if (badge) {
      badge.hidden = party.ecart === null;
      badge.classList.toggle('marquant', party.ecartMarquant);
      badge.textContent =
        party.ecart === null
          ? ''
          : `${party.ecartMarquant ? strings.ecartMarquantLabel : strings.ecartLabel} ${formatEcart(party.ecart)}`;
    }

    // Appending an existing node moves it — the column ends up in rank order.
    list.append(item);
  }
}

/** Reorder the audit drill-down to match the promesses column. */
function reorderAudit(panel: HTMLElement, scores: readonly PartyScore[]): void {
  const audit = panel.querySelector<HTMLElement>('[data-audit]');
  if (!audit) return;
  for (const ranked of rankByDimension(scores, 'promesses')) {
    const section = audit.querySelector<HTMLElement>(`[data-audit-party="${ranked.partyId}"]`);
    if (section) audit.append(section);
  }
}

/**
 * Position the slope lines between the two columns. The SVG spans the gap
 * column of the desktop grid; on mobile it is display:none (zero width) and
 * the whole pass is skipped — the stacked lists carry the information.
 */
function positionSlopeLines(panel: HTMLElement, scores: readonly PartyScore[]): void {
  const svg = panel.querySelector<SVGSVGElement>('[data-slope-svg]');
  const left = panel.querySelector<HTMLElement>('[data-slope-list="promesses"]');
  const right = panel.querySelector<HTMLElement>('[data-slope-list="actes"]');
  if (!svg || !left || !right) return;

  const svgRect = svg.getBoundingClientRect();
  if (svgRect.width === 0 || svgRect.height === 0) return;
  svg.setAttribute('viewBox', `0 0 ${svgRect.width} ${svgRect.height}`);

  const rowCenter = (list: HTMLElement, index: number): number | null => {
    const row = list.children[index];
    if (!(row instanceof HTMLElement)) return null;
    const rect = row.getBoundingClientRect();
    return rect.top + rect.height / 2 - svgRect.top;
  };

  for (const line of slopeLines(scores)) {
    const element = svg.querySelector<SVGLineElement>(`line[data-party="${line.partyId}"]`);
    const y1 = rowCenter(left, line.fromIndex);
    const y2 = rowCenter(right, line.toIndex);
    if (!element || y1 === null || y2 === null) continue;
    element.setAttribute('x1', '0');
    element.setAttribute('x2', String(svgRect.width));
    element.setAttribute('y1', String(y1));
    element.setAttribute('y2', String(y2));
    element.classList.toggle('marquant', line.marquant);
  }
}

/**
 * Render the results panel from the engine's scores: fill and reorder both
 * columns, reorder the audit drill-down, draw the slope lines. Idempotent —
 * called every time the results view is shown.
 */
export function renderResults(
  panel: HTMLElement,
  scores: readonly PartyScore[],
  strings: ResultsViewStrings,
  totalStatements: number,
): void {
  latestScores.set(panel, scores);
  renderColumn(panel, 'promesses', scores, strings, totalStatements);
  renderColumn(panel, 'actes', scores, strings, totalStatements);
  reorderAudit(panel, scores);
  positionSlopeLines(panel, scores);

  // Rows wrap differently across widths — re-position the lines on resize
  // (also covers the mobile ⇄ desktop breakpoint crossing). One observer
  // per panel for the page's lifetime.
  if (!panel.dataset.slopeObserved && typeof ResizeObserver !== 'undefined') {
    panel.dataset.slopeObserved = 'true';
    new ResizeObserver(() => {
      const current = latestScores.get(panel);
      if (current) positionSlopeLines(panel, current);
    }).observe(panel);
  }
}
