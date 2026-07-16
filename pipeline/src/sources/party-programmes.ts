/**
 * Mapping party → programme documents, the unit the extraction command works
 * on. Source ids reference PROGRAMME_SOURCES (the #21 registry); the invariant
 * is enforced by party-programmes.test.ts.
 *
 * `party_id` is the canonical identifier used in the positions YAML — stable,
 * path-safe, never renamed (it will also key the real Party records when the
 * demo fixtures are replaced).
 */
import { PROGRAMME_SOURCES } from './programmes.sources.ts';

export interface PartyProgramme {
  /** Canonical party id used in data/positions/ YAML files. Path-safe. */
  party_id: string;
  /** Display name (source language of the party). */
  name: string;
  /** Programme documents, in reading order. Ids from PROGRAMME_SOURCES. */
  source_ids: readonly string[];
}

export const PARTY_PROGRAMMES: readonly PartyProgramme[] = [
  { party_id: 'ps', name: 'PS', source_ids: ['ps-programme-2024'] },
  { party_id: 'mr', name: 'MR', source_ids: ['mr-programme-2024'] },
  { party_id: 'les-engages', name: 'Les Engagés', source_ids: ['les-engages-programme-2024'] },
  { party_id: 'ecolo', name: 'Ecolo', source_ids: ['ecolo-programme-2024'] },
  {
    party_id: 'defi',
    name: 'DéFI',
    source_ids: [
      'defi-axe-1-2024',
      'defi-axe-2-2024',
      'defi-axe-3-2024',
      'defi-axe-4-2024',
      'defi-axe-5-2024',
    ],
  },
  { party_id: 'nva', name: 'N-VA', source_ids: ['nva-programme-2024'] },
  {
    party_id: 'vlaams-belang',
    name: 'Vlaams Belang',
    source_ids: ['vlaams-belang-programme-2024'],
  },
  { party_id: 'vooruit', name: 'Vooruit', source_ids: ['vooruit-programme-2024'] },
  { party_id: 'cdv', name: 'CD&V', source_ids: ['cdv-programme-2024'] },
  {
    party_id: 'open-vld',
    name: 'Open Vld (→ Anders.)',
    source_ids: ['open-vld-partijprogramma-2024', 'open-vld-becijferd-groeiplan-2024'],
  },
  { party_id: 'groen', name: 'Groen', source_ids: ['groen-programme-2024'] },
  {
    // Unitary party, two language mirrors. Both sources are text/html chapter
    // indexes (no national PDF): the per-page text layer does not cover them
    // yet — the extraction command reports them as unsupported (see the spike
    // doc's known-limitation section).
    party_id: 'ptb-pvda',
    name: 'PTB-PVDA',
    source_ids: ['ptb-programme-2024', 'pvda-programme-2024'],
  },
];

export function getPartyProgramme(partyId: string): PartyProgramme {
  const party = PARTY_PROGRAMMES.find((entry) => entry.party_id === partyId);
  if (party === undefined) {
    const known = PARTY_PROGRAMMES.map((entry) => entry.party_id).join(', ');
    throw new Error(`Unknown party '${partyId}'. Known parties: ${known}.`);
  }
  return party;
}

/** Programme sources of one party, resolved against the #21 registry. */
export function getPartyProgrammeSources(partyId: string) {
  return getPartyProgramme(partyId).source_ids.map((sourceId) => {
    const source = PROGRAMME_SOURCES.find((entry) => entry.id === sourceId);
    if (source === undefined) {
      throw new Error(
        `Party '${partyId}' references unknown programme source '${sourceId}' — registry drift.`,
      );
    }
    return source;
  });
}
