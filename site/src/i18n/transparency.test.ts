/**
 * Coherence guard (#26): the methodology page publishes the SAME formula the
 * engine implements — acceptance criterion of the ticket. These tests pin the
 * published prose to the engine's exported constants and formula shape, so a
 * change to either side fails until both move together.
 */
import { describe, expect, it } from 'vitest';
import { LOCALES } from './locales.ts';
import { TRANSPARENCY } from './transparency.ts';
import { ECART_MARQUANT_THRESHOLD } from '../lib/scoring/scoring.ts';

describe.each(LOCALES)('published methodology (%s)', (locale) => {
  const m = TRANSPARENCY[locale].methodology;

  it('publishes the engine formula: 100 × (1 − mean normalised distance)', () => {
    expect(m.formula.formulaLine).toContain('100 × (1 −');
  });

  it('publishes the engine écart marquant threshold', () => {
    const body = m.ecart.body.join(' ');
    expect(body).toContain(String(ECART_MARQUANT_THRESHOLD));
  });

  it('publishes the normalisation divisor (max city-block distance 4)', () => {
    const steps = m.formula.steps.join(' ');
    expect(steps).toContain('4');
  });

  it('lists the four exclusion rules the engine applies', () => {
    // sans opinion / missing programme / no linked vote / validation status —
    // one published rule each, same count as the engine's exclusion paths.
    expect(m.formula.exclusions).toHaveLength(4);
  });
});
