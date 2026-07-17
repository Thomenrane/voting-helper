/**
 * Share image layout (#27) — pure composition of the shareable result image.
 *
 * This module turns the scoring engine's output into a flat list of drawing
 * primitives (rects and texts) for a 1080×1350 canvas. It never touches the
 * canvas: text measurement is injected (`MeasureText`), so ordering,
 * truncation, wrapping and badge composition are all testable without a DOM.
 * The thin drawing layer (share-image.ts) only replays the primitives.
 *
 * 1080×1350 (4:5 portrait) is the choice over 1200×630: messaging apps and
 * social feeds render portrait images large, and the vertical format gives
 * every party row enough height for two large scores that stay legible in a
 * mobile preview.
 *
 * Colors are symbolic roles resolved by the drawing layer from the site's
 * CSS custom properties — the image reuses the accent palette, never a
 * Belgian party color. The two scores are rendered side by side per party,
 * NEVER fused into a single number.
 */
import { formatEcart, formatScore, rankByDimension } from '../results/results-presentation.ts';
import type { PartyScore } from '../scoring/scoring.ts';

export const SHARE_IMAGE_WIDTH = 1080;
export const SHARE_IMAGE_HEIGHT = 1350;

/** Outer margin of the composition. */
const MARGIN = 72;

/** Font request, resolved to a concrete font string by the drawing layer. */
export interface FontSpec {
  px: number;
  weight: 400 | 500 | 600 | 700;
  /** 'serif' → the site's Georgia stack; 'sans' → the system-ui stack. */
  family: 'sans' | 'serif';
}

/** Symbolic color, resolved from the site palette by the drawing layer. */
export type ColorRole =
  | 'ink'
  | 'ink-soft'
  | 'paper'
  | 'card'
  | 'line'
  | 'accent'
  | 'accent-deep'
  | 'accent-wash';

export interface TextItem {
  kind: 'text';
  text: string;
  /** Anchor x — left/right/center per `align`. */
  x: number;
  /** Baseline y. */
  y: number;
  align: 'left' | 'right' | 'center';
  font: FontSpec;
  color: ColorRole;
}

export interface RectItem {
  kind: 'rect';
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
  fill?: ColorRole;
  stroke?: ColorRole;
}

export type LayoutItem = TextItem | RectItem;

/** Measured width (px) of a text at a font — injected, canvas-free in tests. */
export type MeasureText = (text: string, font: FontSpec) => number;

/** The strings the image renders — all resolved from UI[lang] by the caller. */
export interface ShareImageStrings {
  /** Site name (current code name), the header eyebrow. */
  siteTitle: string;
  /** Signature tagline, the image title. */
  heading: string;
  /** Fictitious-data banner; null once real data replaces the fixtures. */
  demoBanner: string | null;
  /** « n.d. » — a null score, never rendered as 0. */
  notAvailable: string;
  promessesHeading: string;
  actesHeading: string;
  ecartLabel: string;
  ecartMarquantLabel: string;
  /** Legend for the per-score denominators, e.g. « x/8 : énoncés inclus… ». */
  denominatorLegend: string;
  /** Pre-formatted « Méthodologie v1 — données au DD/MM/YYYY » (#26). */
  versionLine: string;
}

export interface ShareImageInput {
  scores: readonly PartyScore[];
  /** Party id → display name. */
  partyNames: ReadonlyMap<string, string>;
  totalStatements: number;
  strings: ShareImageStrings;
}

export interface ShareImageLayout {
  width: number;
  height: number;
  background: ColorRole;
  items: LayoutItem[];
}

const ELLIPSIS = '…';

/** Truncate a text to a width, appending an ellipsis when it overflows. */
export function truncateToWidth(
  text: string,
  maxWidth: number,
  font: FontSpec,
  measure: MeasureText,
): string {
  if (measure(text, font) <= maxWidth) return text;
  let head = text;
  while (head.length > 1) {
    head = head.slice(0, -1).trimEnd();
    if (measure(head + ELLIPSIS, font) <= maxWidth) return head + ELLIPSIS;
  }
  return ELLIPSIS;
}

/** Greedy word wrap; a single overlong word stays on its own line. */
export function wrapToWidth(
  text: string,
  maxWidth: number,
  font: FontSpec,
  measure: MeasureText,
): string[] {
  const words = text.split(/\s+/).filter((word) => word.length > 0);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current === '' ? word : `${current} ${word}`;
    if (current !== '' && measure(candidate, font) > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current !== '') lines.push(current);
  return lines;
}

// ——— Type scale (px on the 1080-wide canvas) ———
const BANNER_FONT: FontSpec = { px: 26, weight: 600, family: 'sans' };
const EYEBROW_FONT: FontSpec = { px: 26, weight: 600, family: 'sans' };
const TITLE_FONT: FontSpec = { px: 52, weight: 500, family: 'serif' };
const COLUMN_FONT: FontSpec = { px: 23, weight: 600, family: 'sans' };
const RANK_FONT: FontSpec = { px: 30, weight: 500, family: 'serif' };
const NAME_FONT: FontSpec = { px: 33, weight: 600, family: 'sans' };
const SCORE_FONT: FontSpec = { px: 40, weight: 700, family: 'sans' };
const DENOMINATOR_FONT: FontSpec = { px: 21, weight: 400, family: 'sans' };
const BADGE_FONT: FontSpec = { px: 20, weight: 600, family: 'sans' };
const FOOTER_FONT: FontSpec = { px: 24, weight: 400, family: 'sans' };
const LEGEND_FONT: FontSpec = { px: 22, weight: 400, family: 'sans' };

/** Right anchors of the two score columns; the gap keeps them clearly apart. */
const ACTES_RIGHT = SHARE_IMAGE_WIDTH - MARGIN - 36;
const PROMESSES_RIGHT = ACTES_RIGHT - 210;

/**
 * Compose the full share image. Rows follow the promesses ranking (the same
 * primary order as the results screen and its audit drill-down); each row
 * carries both scores side by side with their denominators — never fused.
 */
export function buildShareImageLayout(
  input: ShareImageInput,
  measure: MeasureText,
): ShareImageLayout {
  const { scores, partyNames, totalStatements, strings } = input;
  const items: LayoutItem[] = [];

  // ——— Fictitious-data banner (same caveat as the site header) ———
  let cursorY = 0;
  if (strings.demoBanner !== null) {
    const bannerHeight = 64;
    items.push({
      kind: 'rect',
      x: 0,
      y: 0,
      width: SHARE_IMAGE_WIDTH,
      height: bannerHeight,
      radius: 0,
      fill: 'ink',
    });
    items.push({
      kind: 'text',
      text: truncateToWidth(strings.demoBanner, SHARE_IMAGE_WIDTH - 2 * MARGIN, BANNER_FONT, measure),
      x: SHARE_IMAGE_WIDTH / 2,
      y: 41,
      align: 'center',
      font: BANNER_FONT,
      color: 'paper',
    });
    cursorY = bannerHeight;
  }

  // ——— Header: site name eyebrow + serif tagline ———
  const contentWidth = SHARE_IMAGE_WIDTH - 2 * MARGIN;
  cursorY += 92;
  items.push({
    kind: 'text',
    text: truncateToWidth(strings.siteTitle, contentWidth, EYEBROW_FONT, measure),
    x: MARGIN,
    y: cursorY,
    align: 'left',
    font: EYEBROW_FONT,
    color: 'accent-deep',
  });

  const titleLines = wrapToWidth(strings.heading, contentWidth, TITLE_FONT, measure);
  const cappedTitle =
    titleLines.length <= 2
      ? titleLines
      : [
          titleLines[0] as string,
          truncateToWidth(titleLines.slice(1).join(' '), contentWidth, TITLE_FONT, measure),
        ];
  cursorY += 74;
  for (const line of cappedTitle) {
    items.push({
      kind: 'text',
      text: line,
      x: MARGIN,
      y: cursorY,
      align: 'left',
      font: TITLE_FONT,
      color: 'ink',
    });
    cursorY += 62;
  }
  cursorY -= 62; // back to the last title baseline

  // ——— Column headings over the two score columns ———
  cursorY += 84;
  items.push({
    kind: 'text',
    text: strings.promessesHeading,
    x: PROMESSES_RIGHT,
    y: cursorY,
    align: 'right',
    font: COLUMN_FONT,
    color: 'ink-soft',
  });
  items.push({
    kind: 'text',
    text: strings.actesHeading,
    x: ACTES_RIGHT,
    y: cursorY,
    align: 'right',
    font: COLUMN_FONT,
    color: 'ink-soft',
  });

  // ——— Footer anchors (composed bottom-up so the list gets the rest) ———
  const footerBaseline = SHARE_IMAGE_HEIGHT - 60;
  const footerRuleY = SHARE_IMAGE_HEIGHT - 104;
  const legendBaseline = footerRuleY - 28;

  items.push({
    kind: 'rect',
    x: MARGIN,
    y: footerRuleY,
    width: contentWidth,
    height: 2,
    radius: 0,
    fill: 'line',
  });
  items.push({
    kind: 'text',
    text: truncateToWidth(strings.denominatorLegend, contentWidth, LEGEND_FONT, measure),
    x: MARGIN,
    y: legendBaseline,
    align: 'left',
    font: LEGEND_FONT,
    color: 'ink-soft',
  });
  items.push({
    kind: 'text',
    text: truncateToWidth(strings.versionLine, contentWidth, FOOTER_FONT, measure),
    x: MARGIN,
    y: footerBaseline,
    align: 'left',
    font: FOOTER_FONT,
    color: 'ink-soft',
  });

  // ——— Party rows, promesses ranking order ———
  const listTop = cursorY + 24;
  const listBottom = legendBaseline - LEGEND_FONT.px - 28;
  const rowGap = 16;
  const rowCount = Math.max(scores.length, 1);
  const rowHeight = Math.min(
    116,
    Math.floor((listBottom - listTop - (rowCount - 1) * rowGap) / rowCount),
  );

  const scoreById = new Map(scores.map((s) => [s.partyId, s]));
  const nameLeft = MARGIN + 88;
  const nameMaxWidth = PROMESSES_RIGHT - 150 - nameLeft;

  rankByDimension(scores, 'promesses').forEach((ranked, index) => {
    const party = scoreById.get(ranked.partyId);
    if (party === undefined) return;
    const top = listTop + index * (rowHeight + rowGap);
    const baseline1 = top + Math.round(rowHeight * 0.42);
    const baseline2 = top + Math.round(rowHeight * 0.8);

    items.push({
      kind: 'rect',
      x: MARGIN,
      y: top,
      width: contentWidth,
      height: rowHeight,
      radius: 14,
      fill: 'card',
      stroke: 'line',
    });
    items.push({
      kind: 'text',
      text: String(ranked.rank),
      x: MARGIN + 30,
      y: baseline1,
      align: 'left',
      font: RANK_FONT,
      color: 'ink-soft',
    });
    items.push({
      kind: 'text',
      text: truncateToWidth(
        partyNames.get(party.partyId) ?? party.partyId,
        nameMaxWidth,
        NAME_FONT,
        measure,
      ),
      x: nameLeft,
      y: baseline1,
      align: 'left',
      font: NAME_FONT,
      color: 'ink',
    });

    // The two scores, side by side — separate columns, never one number.
    items.push({
      kind: 'text',
      text: formatScore(party.promesses.score, strings.notAvailable),
      x: PROMESSES_RIGHT,
      y: baseline1,
      align: 'right',
      font: SCORE_FONT,
      color: 'ink',
    });
    items.push({
      kind: 'text',
      text: formatScore(party.actes.score, strings.notAvailable),
      x: ACTES_RIGHT,
      y: baseline1,
      align: 'right',
      font: SCORE_FONT,
      color: 'ink',
    });

    // Denominators — always displayed, one per dimension.
    items.push({
      kind: 'text',
      text: `${party.promesses.denominator}/${totalStatements}`,
      x: PROMESSES_RIGHT,
      y: baseline2,
      align: 'right',
      font: DENOMINATOR_FONT,
      color: 'ink-soft',
    });
    items.push({
      kind: 'text',
      text: `${party.actes.denominator}/${totalStatements}`,
      x: ACTES_RIGHT,
      y: baseline2,
      align: 'right',
      font: DENOMINATOR_FONT,
      color: 'ink-soft',
    });

    // Écart badge — mirrors the mobile results badge; accent-filled pill
    // when the engine flags the écart as marquant.
    if (party.ecart !== null) {
      const label = party.ecartMarquant ? strings.ecartMarquantLabel : strings.ecartLabel;
      const badgeText = `${label} ${formatEcart(party.ecart)}`;
      const badgeWidth = Math.ceil(measure(badgeText, BADGE_FONT)) + 32;
      const badgeHeight = 32;
      const pill: RectItem = {
        kind: 'rect',
        x: nameLeft,
        y: baseline2 - 23,
        width: badgeWidth,
        height: badgeHeight,
        radius: badgeHeight / 2,
      };
      if (party.ecartMarquant) pill.fill = 'accent';
      else pill.stroke = 'line';
      items.push(pill);
      items.push({
        kind: 'text',
        text: badgeText,
        x: nameLeft + 16,
        y: baseline2,
        align: 'left',
        font: BADGE_FONT,
        color: party.ecartMarquant ? 'paper' : 'accent-deep',
      });
    }
  });

  return {
    width: SHARE_IMAGE_WIDTH,
    height: SHARE_IMAGE_HEIGHT,
    background: 'paper',
    items,
  };
}
