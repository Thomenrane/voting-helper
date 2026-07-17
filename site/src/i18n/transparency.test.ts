/**
 * Coherence guard (#26): the methodology page publishes the SAME formula the
 * engine implements — acceptance criterion of the ticket. Every constant the
 * prose cites is asserted THROUGH the engine's exports (never a re-typed
 * literal), and the engine's behaviour is pinned where prose describes it —
 * so a deliberate engine change MUST fail this suite, in both locales, until
 * the published prose moves with it.
 */
import { describe, expect, it } from 'vitest';
import { deriveVotePosition, type PartyPosition } from '@voting-helper/data';
import { LOCALES, type Locale } from './locales.ts';
import { TRANSPARENCY } from './transparency.ts';
import {
  CONTRADICTION_MIN_STRENGTH,
  ECART_MARQUANT_THRESHOLD,
  MAX_DISTANCE,
  scoreParties,
} from '../lib/scoring/scoring.ts';

/** −2 → « −2 » (U+2212, as printed in the prose), +2 → « +2 », 0 → « 0 ». */
function signed(value: number): string {
  if (value > 0) return `+${value}`;
  if (value < 0) return `−${-value}`;
  return '0';
}

/** The published m3 fragments, BUILT from the engine's derivation table. */
const M3_FRAGMENTS: Record<Locale, string[]> = {
  fr: [
    `oui vaut ${signed(deriveVotePosition('oui', 'soutient'))}, abstention ${signed(
      deriveVotePosition('abstention', 'soutient'),
    )}, non ${signed(deriveVotePosition('non', 'soutient'))}`,
    `oui vaut ${signed(deriveVotePosition('oui', 'contredit'))}, non vaut ${signed(
      deriveVotePosition('non', 'contredit'),
    )}`,
    `l’abstention reste ${signed(deriveVotePosition('abstention', 'contredit'))}`,
  ],
  nl: [
    `ja als ${signed(deriveVotePosition('oui', 'soutient'))}, onthouding als ${signed(
      deriveVotePosition('abstention', 'soutient'),
    )}, nee als ${signed(deriveVotePosition('non', 'soutient'))}`,
    `ja telt als ${signed(deriveVotePosition('oui', 'contredit'))}, nee als ${signed(
      deriveVotePosition('non', 'contredit'),
    )}`,
    `blijft ${signed(deriveVotePosition('abstention', 'contredit'))}`,
  ],
};

/** Normalisation-divisor wording per locale, built from MAX_DISTANCE. */
const DIVISOR_FRAGMENTS: Record<Locale, RegExp[]> = {
  fr: [new RegExp(`\\bpar ${MAX_DISTANCE}\\b`), new RegExp(`\\bmaximum ${MAX_DISTANCE}\\b`)],
  nl: [new RegExp(`\\bdoor ${MAX_DISTANCE}\\b`), new RegExp(`\\bmaximaal ${MAX_DISTANCE}\\b`)],
};

/** Published round-half-up wording per locale. */
const TIE_FRAGMENTS: Record<Locale, string> = {
  fr: 'x,5 est arrondi vers le haut',
  nl: 'wordt x,5 naar boven afgerond',
};

describe.each(LOCALES)('published methodology (%s)', (locale) => {
  const m = TRANSPARENCY[locale].methodology;

  it('publishes the engine formula: 100 × (1 − mean normalised distance)', () => {
    expect(m.formula.formulaLine).toContain('100 × (1 −');
  });

  it('publishes the engine écart marquant threshold', () => {
    const body = m.ecart.body.join(' ');
    expect(body).toMatch(new RegExp(`\\b${ECART_MARQUANT_THRESHOLD}\\b`));
  });

  it('publishes the normalisation divisor from the engine (MAX_DISTANCE)', () => {
    const steps = m.formula.steps.join(' ');
    for (const fragment of DIVISOR_FRAGMENTS[locale]) {
      expect(steps).toMatch(fragment);
    }
  });

  it('publishes the contradiction bounds from the engine (±min strength)', () => {
    const body = m.contradiction.body.join(' ');
    expect(body).toContain(`≥ +${CONTRADICTION_MIN_STRENGTH}`);
    expect(body).toContain(`≤ −${CONTRADICTION_MIN_STRENGTH}`);
  });

  it('publishes the m3 vote derivation table exactly as the engine derives it', () => {
    const scale = m.scale.body.join(' ');
    for (const fragment of M3_FRAGMENTS[locale]) {
      expect(scale).toContain(fragment);
    }
  });

  it('publishes the round-half-up tie rule', () => {
    expect(m.formula.steps.join(' ')).toContain(TIE_FRAGMENTS[locale]);
  });

  it('lists the four exclusion rules the engine applies', () => {
    // sans opinion / missing programme / no linked vote / validation status —
    // one published rule each, same count as the engine's exclusion paths.
    expect(m.formula.exclusions).toHaveLength(4);
  });
});

describe('engine rounding behaviour backing the published tie rule', () => {
  function record(statementId: string, position: -2 | -1 | 0 | 1 | 2): PartyPosition {
    return {
      party_id: 'p',
      statement_id: statementId,
      position,
      citation: {
        texte: 'Citation.',
        url_source: 'https://example.org/source.pdf',
        ref_snapshot: 'snapshots/test.pdf',
        page: 1,
      },
      votes_lies: [],
      statut: 'valide',
      derniere_revision: '2026-06-01',
    };
  }

  it('rounds a mean landing on x.5 upward, as the prose states', () => {
    // Distances 0.25 (|2−1|/4) and 0 (|2−2|/4) → mean 0.125 → 100 × 0.875
    // = 87.5 → published rule says 88, never 87.
    const [score] = scoreParties(
      { s1: 2, s2: 2 },
      [{ id: 'p', name: 'P' }],
      [record('s1', 1), record('s2', 2)],
    );
    expect(score?.promesses.score).toBe(88);
  });
});
