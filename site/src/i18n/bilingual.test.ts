import { describe, expect, it } from 'vitest';
import type { Statement } from '@voting-helper/data';
import { statementNote, statementText } from './bilingual.ts';

const STATEMENT: Statement = {
  id: 's-test',
  theme: 'fiscalite',
  texte_fr: 'Énoncé en français.',
  texte_nl: 'Stelling in het Nederlands.',
  note_concrete_fr: 'Note concrète en français.',
  note_concrete_nl: 'Concrete maatregel in het Nederlands.',
};

describe('statementText', () => {
  it('returns the French text for fr', () => {
    expect(statementText(STATEMENT, 'fr')).toBe('Énoncé en français.');
  });

  it('returns the Dutch text for nl', () => {
    expect(statementText(STATEMENT, 'nl')).toBe('Stelling in het Nederlands.');
  });
});

describe('statementNote', () => {
  it('returns the French note for fr', () => {
    expect(statementNote(STATEMENT, 'fr')).toBe('Note concrète en français.');
  });

  it('returns the Dutch note for nl', () => {
    expect(statementNote(STATEMENT, 'nl')).toBe('Concrete maatregel in het Nederlands.');
  });
});
