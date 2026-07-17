import { describe, expect, it } from 'vitest';

import { PROGRAMME_SOURCES } from './programmes.sources.ts';
import {
  getPartyProgramme,
  getPartyProgrammeSources,
  PARTY_PROGRAMMES,
} from './party-programmes.ts';

describe('PARTY_PROGRAMMES registry invariants', () => {
  it('references only existing programme sources', () => {
    const known = new Set(PROGRAMME_SOURCES.map((s) => s.id));
    for (const party of PARTY_PROGRAMMES) {
      for (const sourceId of party.source_ids) {
        expect(known.has(sourceId), `${party.party_id} → ${sourceId}`).toBe(true);
      }
    }
  });

  it('covers every programme source exactly once', () => {
    const referenced = PARTY_PROGRAMMES.flatMap((p) => [...p.source_ids]);
    expect(referenced.sort()).toEqual(PROGRAMME_SOURCES.map((s) => s.id).sort());
    expect(new Set(referenced).size).toBe(referenced.length);
  });

  it('uses path-safe unique party ids', () => {
    const ids = PARTY_PROGRAMMES.map((p) => p.party_id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^[a-z0-9-]+$/);
    }
  });
});

describe('getPartyProgramme', () => {
  it('resolves a known party', () => {
    expect(getPartyProgramme('defi').source_ids).toHaveLength(5);
  });

  it('names known parties when the id is unknown', () => {
    expect(() => getPartyProgramme('nope')).toThrow(/Unknown party 'nope'.*ps, mr/);
  });
});

describe('getPartyProgrammeSources', () => {
  it('resolves full source records in reading order', () => {
    const sources = getPartyProgrammeSources('open-vld');
    expect(sources.map((s) => s.id)).toEqual([
      'open-vld-partijprogramma-2024',
      'open-vld-becijferd-groeiplan-2024',
    ]);
    expect(sources[0]?.mediaType).toBe('application/pdf');
  });
});
