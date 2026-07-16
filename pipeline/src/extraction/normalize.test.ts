import { describe, expect, it } from 'vitest';

import { normalizeForSearch } from './normalize.ts';

describe('normalizeForSearch — documented typography rules', () => {
  it('folds ligatures via NFKC (ﬁ → fi, ﬂ → fl)', () => {
    expect(normalizeForSearch('la ﬁscalité déﬂation')).toBe('la fiscalité déflation');
  });

  it('keeps œ/æ intact — real French letters, not typography', () => {
    expect(normalizeForSearch('un vœu, un cæcum')).toBe('un vœu, un cæcum');
  });

  it('removes soft hyphens (PDF end-of-line hyphenation artifacts)', () => {
    expect(normalizeForSearch('gouver\u00ADnement')).toBe('gouvernement');
  });

  it('maps curly and angle quotes to straight quotes', () => {
    expect(normalizeForSearch('« l’État »')).toBe(`"l'État"`);
    expect(normalizeForSearch('“quote” en ‘nl’')).toBe(`"quote" en 'nl'`);
  });

  it('maps the dash family to a plain hyphen', () => {
    expect(normalizeForSearch('long–terme — oui − non')).toBe('long-terme - oui - non');
  });

  it('maps NBSP, narrow NBSP and thin spaces to plain spaces', () => {
    expect(normalizeForSearch('3\u00A0000\u202F€ et\u2009plus')).toBe('3 000 € et plus');
  });

  it('collapses whitespace runs (incl. newlines) and trims', () => {
    expect(normalizeForSearch('  un\n texte\t\tmulti  ligne ')).toBe('un texte multi ligne');
  });

  it('preserves case — a case change is an alteration, not typography', () => {
    expect(normalizeForSearch('La Chambre')).toBe('La Chambre');
    expect(normalizeForSearch('La Chambre')).not.toBe(normalizeForSearch('la chambre'));
  });
});
