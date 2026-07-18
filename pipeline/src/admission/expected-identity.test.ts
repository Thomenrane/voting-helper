import { describe, expect, it } from 'vitest';

import {
  EXPECTED_IDENTITIES,
  expectedIdentityPartyIds,
  getExpectedIdentity,
  isKnownProgrammeSource,
  programmePartyIds,
} from './expected-identity.ts';

describe('EXPECTED_IDENTITIES — couverture et cohérence avec le registre #21', () => {
  it('couvre exactement les partis du registre des programmes (#21)', () => {
    expect([...expectedIdentityPartyIds()].sort()).toEqual([...programmePartyIds()].sort());
  });

  it("chaque partie référence un source_id connu de PROGRAMME_SOURCES (aucune dérive)", () => {
    for (const identity of EXPECTED_IDENTITIES) {
      for (const part of identity.parts) {
        expect(isKnownProgrammeSource(part.source_id)).toBe(true);
      }
    }
  });

  it('vise le fédéral 2024 pour tous les partis', () => {
    for (const identity of EXPECTED_IDENTITIES) {
      expect(identity.year).toBe(2024);
      expect(identity.level).toBe('federal');
    }
  });

  it('single-pdf a exactement une partie ; n-booklets en a plusieurs', () => {
    for (const identity of EXPECTED_IDENTITIES) {
      if (identity.structure === 'single-pdf') {
        expect(identity.parts).toHaveLength(1);
      }
      if (identity.structure === 'n-booklets') {
        expect(identity.parts.length).toBeGreaterThan(1);
      }
    }
  });

  it('web-chapters n\'a pas de pagination attendue (pages null)', () => {
    for (const identity of EXPECTED_IDENTITIES) {
      if (identity.structure === 'web-chapters') {
        expect(identity.expected_pages).toBeNull();
        for (const part of identity.parts) {
          expect(part.expected_pages).toBeNull();
        }
      }
    }
  });

  it('le total attendu des PDF égale la somme des pages des parties', () => {
    for (const identity of EXPECTED_IDENTITIES) {
      if (identity.expected_pages === null) continue;
      const sum = identity.parts.reduce((total, part) => total + (part.expected_pages ?? 0), 0);
      expect(sum).toBe(identity.expected_pages);
    }
  });

  it('modélise DéFI en 5 livrets et Open Vld en 2 documents (n-booklets)', () => {
    expect(getExpectedIdentity('defi').structure).toBe('n-booklets');
    expect(getExpectedIdentity('defi').parts).toHaveLength(5);
    expect(getExpectedIdentity('open-vld').parts).toHaveLength(2);
  });

  it('modélise PTB-PVDA en web-chapters à deux miroirs de langue', () => {
    const ptb = getExpectedIdentity('ptb-pvda');
    expect(ptb.structure).toBe('web-chapters');
    expect(ptb.parts).toHaveLength(2);
  });

  it('lève pour un parti inconnu', () => {
    expect(() => getExpectedIdentity('inexistant')).toThrow(/Aucune identité attendue/);
  });
});
