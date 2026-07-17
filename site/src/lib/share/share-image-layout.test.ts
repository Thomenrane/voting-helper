/**
 * Tests for the share image layout (ticket #27).
 *
 * The module is the pure seam of the share feature: scores in, drawing
 * primitives out. No canvas here — text measurement is injected, so the
 * whole composition (ordering, truncation, wrapping, badges, footer) is
 * asserted without a DOM.
 */
import { describe, expect, it } from 'vitest';
import type { PartyScore } from '../scoring/scoring.ts';
import {
  buildShareImageLayout,
  SHARE_IMAGE_HEIGHT,
  SHARE_IMAGE_WIDTH,
  truncateToWidth,
  wrapToWidth,
  type FontSpec,
  type MeasureText,
  type ShareImageInput,
  type ShareImageStrings,
  type TextItem,
} from './share-image-layout.ts';

/** Deterministic measurer: every character is 0.5 × font size wide. */
const measure: MeasureText = (text, font) => text.length * font.px * 0.5;

const FONT: FontSpec = { px: 20, weight: 400, family: 'sans' };

/** Minimal PartyScore factory — only the fields the layout reads. */
function score(
  partyId: string,
  promesses: number | null,
  actes: number | null,
  options: { promDen?: number; actesDen?: number; ecartMarquant?: boolean } = {},
): PartyScore {
  const ecart = promesses !== null && actes !== null ? promesses - actes : null;
  return {
    partyId,
    promesses: { score: promesses, denominator: options.promDen ?? 7 },
    actes: { score: actes, denominator: options.actesDen ?? 5 },
    ecart,
    ecartMarquant: options.ecartMarquant ?? (ecart !== null && Math.abs(ecart) >= 15),
    contradictions: [],
  };
}

const STRINGS: ShareImageStrings = {
  siteTitle: 'Test électoral fédéral — démonstration',
  heading: 'Ce qu’ils promettent. Ce qu’ils votent.',
  demoBanner: 'Démonstration — partis et positions entièrement fictifs.',
  notAvailable: 'n.d.',
  promessesHeading: 'Promesses',
  actesHeading: 'Actes',
  ecartLabel: 'écart',
  ecartMarquantLabel: 'écart marquant',
  denominatorLegend: 'x/8 : énoncés inclus dans le calcul du score',
  versionLine: 'Méthodologie v1 — données au 16/07/2026',
};

function input(scores: PartyScore[], strings: ShareImageStrings = STRINGS): ShareImageInput {
  return {
    scores,
    partyNames: new Map(scores.map((s) => [s.partyId, `Parti ${s.partyId.toUpperCase()}`])),
    totalStatements: 8,
    strings,
  };
}

function texts(layoutInput: ShareImageInput): TextItem[] {
  return buildShareImageLayout(layoutInput, measure).items.filter(
    (item): item is TextItem => item.kind === 'text',
  );
}

function findText(items: TextItem[], text: string): TextItem | undefined {
  return items.find((item) => item.text === text);
}

describe('truncateToWidth', () => {
  it('returns a fitting text unchanged', () => {
    expect(truncateToWidth('court', 200, FONT, measure)).toBe('court');
  });

  it('truncates with an ellipsis and stays within the width', () => {
    const truncated = truncateToWidth('un nom de parti vraiment interminable', 100, FONT, measure);
    expect(truncated.endsWith('…')).toBe(true);
    expect(measure(truncated, FONT)).toBeLessThanOrEqual(100);
    expect(truncated.length).toBeLessThan('un nom de parti vraiment interminable'.length);
  });
});

describe('wrapToWidth', () => {
  it('keeps a fitting text on one line', () => {
    expect(wrapToWidth('deux mots', 500, FONT, measure)).toEqual(['deux mots']);
  });

  it('wraps on word boundaries without losing words', () => {
    const lines = wrapToWidth('aaa bbb ccc ddd', 70, FONT, measure);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join(' ')).toBe('aaa bbb ccc ddd');
    for (const line of lines) expect(measure(line, FONT)).toBeLessThanOrEqual(70);
  });
});

describe('buildShareImageLayout', () => {
  it('uses the messaging-friendly 1080×1350 portrait canvas', () => {
    const layout = buildShareImageLayout(input([score('a', 80, 60)]), measure);
    expect(layout.width).toBe(SHARE_IMAGE_WIDTH);
    expect(layout.height).toBe(SHARE_IMAGE_HEIGHT);
    expect(SHARE_IMAGE_WIDTH).toBe(1080);
    expect(SHARE_IMAGE_HEIGHT).toBe(1350);
  });

  it('carries the fictitious-data banner while fixtures are in place', () => {
    const items = texts(input([score('a', 80, 60)]));
    expect(findText(items, STRINGS.demoBanner as string)).toBeDefined();
  });

  it('omits the banner once real data replaces the fixtures', () => {
    const items = texts(input([score('a', 80, 60)], { ...STRINGS, demoBanner: null }));
    expect(findText(items, 'Démonstration — partis et positions entièrement fictifs.')).toBe(
      undefined,
    );
  });

  it('names the site and both score columns — the two scores are never fused', () => {
    const items = texts(input([score('a', 80, 60)]));
    expect(findText(items, STRINGS.siteTitle)).toBeDefined();
    expect(findText(items, STRINGS.promessesHeading)).toBeDefined();
    expect(findText(items, STRINGS.actesHeading)).toBeDefined();
    // Both scores appear as distinct items in distinct columns.
    const prom = findText(items, '80');
    const actes = findText(items, '60');
    expect(prom).toBeDefined();
    expect(actes).toBeDefined();
    expect(prom?.x).not.toBe(actes?.x);
  });

  it('orders the rows by the promesses ranking', () => {
    const items = texts(input([score('low', 40, 90), score('high', 90, 10), score('mid', 60, 50)]));
    const rows = ['Parti LOW', 'Parti HIGH', 'Parti MID']
      .map((name) => findText(items, name))
      .filter((item): item is TextItem => item !== undefined);
    expect(rows).toHaveLength(3);
    const byY = [...rows].sort((a, b) => a.y - b.y).map((item) => item.text);
    expect(byY).toEqual(['Parti HIGH', 'Parti MID', 'Parti LOW']);
  });

  it('shows both denominators for every party, plus the legend', () => {
    const items = texts(input([score('a', 80, 60, { promDen: 7, actesDen: 4 })]));
    expect(findText(items, '7/8')).toBeDefined();
    expect(findText(items, '4/8')).toBeDefined();
    expect(findText(items, STRINGS.denominatorLegend)).toBeDefined();
  });

  it('renders a null score as the locale « n.d. » label', () => {
    const items = texts(input([score('a', 80, null)]));
    expect(findText(items, 'n.d.')).toBeDefined();
  });

  it('labels the écart with its sign, and marks a marquant écart', () => {
    const plain = texts(input([score('a', 70, 62)]));
    expect(findText(plain, 'écart +8')).toBeDefined();

    const marquant = texts(input([score('a', 40, 63)]));
    expect(findText(marquant, 'écart marquant -23')).toBeDefined();
  });

  it('shows no écart badge when either score is null', () => {
    const items = texts(input([score('a', 80, null)]));
    expect(items.some((item) => item.text.startsWith('écart'))).toBe(false);
  });

  it('stamps the methodology version + data date line', () => {
    const items = texts(input([score('a', 80, 60)]));
    expect(findText(items, STRINGS.versionLine)).toBeDefined();
  });

  it('truncates an overlong party name instead of overflowing the score columns', () => {
    const scores = [score('a', 80, 60)];
    const layoutInput: ShareImageInput = {
      ...input(scores),
      partyNames: new Map([['a', 'Rassemblement Démocratique des Citoyens Fédéralistes Unis']]),
    };
    const items = texts(layoutInput);
    const name = items.find((item) => item.text.endsWith('…'));
    expect(name).toBeDefined();
  });

  it('keeps every item inside the canvas', () => {
    const layout = buildShareImageLayout(
      input([
        score('a', 90, 10),
        score('b', 80, 60),
        score('c', 70, null),
        score('d', null, null),
        score('e', 55, 54),
        score('f', 20, 80),
      ]),
      measure,
    );
    for (const item of layout.items) {
      if (item.kind === 'rect') {
        expect(item.x).toBeGreaterThanOrEqual(0);
        expect(item.y).toBeGreaterThanOrEqual(0);
        expect(item.x + item.width).toBeLessThanOrEqual(layout.width);
        expect(item.y + item.height).toBeLessThanOrEqual(layout.height);
      } else {
        expect(item.y).toBeGreaterThanOrEqual(0);
        expect(item.y).toBeLessThanOrEqual(layout.height);
      }
    }
  });
});
