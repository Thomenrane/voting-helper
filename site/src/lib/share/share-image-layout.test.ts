/**
 * Tests for the share image layout (ticket #27).
 *
 * The module is the pure seam of the share feature: scores in, drawing
 * primitives out. No canvas here — text measurement is injected, so the
 * whole composition (ordering, truncation, wrapping, badges, footer) is
 * asserted without a DOM.
 */
import { describe, expect, it } from 'vitest';
import { formatEcart } from '../results/results-presentation.ts';
import { ECART_MARQUANT_THRESHOLD, type PartyScore } from '../scoring/scoring.ts';
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
    ecartMarquant:
      options.ecartMarquant ?? (ecart !== null && Math.abs(ecart) >= ECART_MARQUANT_THRESHOLD),
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
    // Each score shares the x anchor of ITS OWN column heading — a
    // promesses/actes swap would fail here.
    const promHeading = findText(items, STRINGS.promessesHeading);
    const actesHeading = findText(items, STRINGS.actesHeading);
    const prom = findText(items, '80');
    const actes = findText(items, '60');
    expect(promHeading).toBeDefined();
    expect(actesHeading).toBeDefined();
    expect(promHeading?.x).not.toBe(actesHeading?.x);
    expect(prom?.x).toBe(promHeading?.x);
    expect(actes?.x).toBe(actesHeading?.x);
    expect(prom?.align).toBe('right');
    expect(actes?.align).toBe('right');
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
    expect(findText(plain, `écart ${formatEcart(8)}`)).toBeDefined();

    const marquant = texts(input([score('a', 40, 63)]));
    expect(findText(marquant, `écart marquant ${formatEcart(-23)}`)).toBeDefined();
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

/** Approximate glyph bounding box: ~0.8 em ascent, ~0.25 em descent. */
interface GlyphBox {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

function glyphBox(item: TextItem): GlyphBox {
  const width = measure(item.text, item.font);
  const left =
    item.align === 'left' ? item.x : item.align === 'right' ? item.x - width : item.x - width / 2;
  return {
    left,
    right: left + width,
    top: item.y - item.font.px * 0.8,
    bottom: item.y + item.font.px * 0.25,
  };
}

function boxesOverlap(a: GlyphBox, b: GlyphBox): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

/**
 * A fleet of n parties with realistic long names, varied écarts (plain,
 * marquant, null) and the real 35-statement denominator space.
 */
function fleet(n: number): ShareImageInput {
  const scores = Array.from({ length: n }, (_, i) =>
    score(`p${i}`, 96 - i * 5, i % 4 === 3 ? null : 88 - i * 6, {
      promDen: 7 + (i % 3),
      actesDen: 5 + (i % 4),
    }),
  );
  return {
    scores,
    partyNames: new Map(
      scores.map((s, i) => [s.partyId, `Mouvement citoyen fédéral démocrate ${i + 1}`]),
    ),
    totalStatements: 35,
    strings: STRINGS,
  };
}

describe('share image geometry — target party counts', () => {
  // 6 = current fixtures; 13 = the real federal target; 15 = headroom. The
  // layout must not silently degrade: no two glyph boxes may collide.
  for (const n of [6, 13, 15]) {
    it(`keeps every glyph box collision-free and inside the canvas at ${n} parties`, () => {
      const layout = buildShareImageLayout(fleet(n), measure);
      const boxed = layout.items
        .filter((item): item is TextItem => item.kind === 'text')
        .map((item) => ({ item, box: glyphBox(item) }));
      for (const { item, box } of boxed) {
        expect(box.left, `"${item.text}" leaks left`).toBeGreaterThanOrEqual(0);
        expect(box.right, `"${item.text}" leaks right`).toBeLessThanOrEqual(layout.width);
        expect(box.top, `"${item.text}" leaks up`).toBeGreaterThanOrEqual(0);
        expect(box.bottom, `"${item.text}" leaks down`).toBeLessThanOrEqual(layout.height);
      }
      for (let i = 0; i < boxed.length; i += 1) {
        for (let j = i + 1; j < boxed.length; j += 1) {
          const a = boxed[i];
          const b = boxed[j];
          if (a === undefined || b === undefined) continue;
          expect(
            boxesOverlap(a.box, b.box),
            `"${a.item.text}" collides with "${b.item.text}"`,
          ).toBe(false);
        }
      }
    });
  }

  it('keeps both scores and denominators per party in the compact form (13 parties)', () => {
    const items = texts(fleet(13));
    // Top party: promesses 96 (7/35) and actes 88 (5/35) — still two columns.
    expect(findText(items, '96')).toBeDefined();
    expect(findText(items, '88')).toBeDefined();
    expect(findText(items, '7/35')).toBeDefined();
    expect(findText(items, '5/35')).toBeDefined();
    // Null actes still rendered as « n.d. ».
    expect(findText(items, 'n.d.')).toBeDefined();
  });

  it('replaces the écart pill with a compact signed marker when rows shrink', () => {
    const items = texts(fleet(13));
    // p8: 56 − 40 = +16 ≥ threshold → marquant, rendered as a marked signed
    // number, not the verbose pill label.
    expect(items.some((item) => item.text.includes(formatEcart(16)))).toBe(true);
    expect(items.some((item) => item.text.startsWith('écart'))).toBe(false);
  });
});
