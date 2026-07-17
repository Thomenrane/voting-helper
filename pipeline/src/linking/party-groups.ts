/**
 * Mapping party (canonical `party_id`, shared with the programme registry)
 * → parliamentary group (fraction) in the Chamber, legislature 56.
 *
 * Fraction names must match the `fraction` column of the members file
 * exactly (they feed `PlenaryVote.groups[].group`). Two special cases:
 * - Ecolo and Groen sit in ONE group ('Ecolo-Groen'): both parties inherit
 *   the same group vote.
 * - PTB-PVDA is one unitary party, one group ('PVDA-PTB').
 * A fraction absent from a vote's tallies means the group cast no ballot —
 * the party then gets no linked vote for that plenary vote (never invented).
 */
import { PARTY_PROGRAMMES } from '../sources/party-programmes.ts';

export interface PartyGroup {
  /** Canonical party id — same universe as PARTY_PROGRAMMES.party_id. */
  party_id: string;
  /** Chamber fraction name, as printed in the members file (legislature 56). */
  fraction: string;
}

export const PARTY_GROUPS: readonly PartyGroup[] = [
  { party_id: 'ps', fraction: 'PS' },
  { party_id: 'mr', fraction: 'MR' },
  { party_id: 'les-engages', fraction: 'Les Engagés' },
  { party_id: 'ecolo', fraction: 'Ecolo-Groen' },
  { party_id: 'groen', fraction: 'Ecolo-Groen' },
  { party_id: 'defi', fraction: 'DéFI' },
  { party_id: 'nva', fraction: 'N-VA' },
  { party_id: 'vlaams-belang', fraction: 'Vlaams Belang' },
  { party_id: 'vooruit', fraction: 'Vooruit' },
  { party_id: 'cdv', fraction: 'CD&V' },
  { party_id: 'open-vld', fraction: 'Open Vld' },
  { party_id: 'ptb-pvda', fraction: 'PVDA-PTB' },
];

/** Known programme-registry ids — the two registries must not drift. */
export function assertPartyGroupsConsistent(): void {
  const known = new Set(PARTY_PROGRAMMES.map((p) => p.party_id));
  for (const { party_id } of PARTY_GROUPS) {
    if (!known.has(party_id)) {
      throw new Error(
        `PARTY_GROUPS references unknown party '${party_id}' — registry drift with PARTY_PROGRAMMES.`,
      );
    }
  }
  const mapped = new Set(PARTY_GROUPS.map((p) => p.party_id));
  for (const { party_id } of PARTY_PROGRAMMES) {
    if (!mapped.has(party_id)) {
      throw new Error(`Party '${party_id}' has no Chamber fraction in PARTY_GROUPS.`);
    }
  }
}
