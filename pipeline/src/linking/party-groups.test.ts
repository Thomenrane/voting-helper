/**
 * Registry invariants: the party ↔ fraction mapping must cover exactly the
 * parties of the programme registry (no drift in either direction), and the
 * two single-group cases (Ecolo-Groen, PVDA-PTB) must stay encoded.
 */
import { describe, expect, it } from 'vitest';

import { PARTY_PROGRAMMES } from '../sources/party-programmes.ts';
import { assertPartyGroupsConsistent, PARTY_GROUPS } from './party-groups.ts';

describe('PARTY_GROUPS', () => {
  it('covers exactly the programme-registry parties', () => {
    expect(() => {
      assertPartyGroupsConsistent();
    }).not.toThrow();
    expect(new Set(PARTY_GROUPS.map((p) => p.party_id))).toEqual(
      new Set(PARTY_PROGRAMMES.map((p) => p.party_id)),
    );
  });

  it('maps Ecolo and Groen to the single Ecolo-Groen fraction', () => {
    const fractions = PARTY_GROUPS.filter((p) => p.party_id === 'ecolo' || p.party_id === 'groen');
    expect(fractions.map((p) => p.fraction)).toEqual(['Ecolo-Groen', 'Ecolo-Groen']);
  });

  it('maps at most one party per fraction except the shared groups', () => {
    const byFraction = new Map<string, string[]>();
    for (const { party_id, fraction } of PARTY_GROUPS) {
      byFraction.set(fraction, [...(byFraction.get(fraction) ?? []), party_id]);
    }
    for (const [fraction, parties] of byFraction) {
      if (fraction === 'Ecolo-Groen') continue;
      expect(parties, fraction).toHaveLength(1);
    }
  });
});
