import { describe, expect, it } from 'vitest';
import type { ContextNote, Statement } from '@voting-helper/data';
import { contextNoteText, statementNote, statementText } from './bilingual.ts';

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

describe('contextNoteText', () => {
  const NOTE: ContextNote = {
    texte_fr: 'Note de contexte en français.',
    texte_nl: 'Contextnota in het Nederlands.',
    date: '2025-04-10',
    source_url: 'https://example.org/source',
  };

  it('returns the French text for fr', () => {
    expect(contextNoteText(NOTE, 'fr')).toBe('Note de contexte en français.');
  });

  it('returns the Dutch text for nl', () => {
    expect(contextNoteText(NOTE, 'nl')).toBe('Contextnota in het Nederlands.');
  });
});
