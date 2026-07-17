/**
 * Output stage of the vote-linking run (#23): turns the retained candidates
 * into per-party LinkedVote records (schema m3: RAW group vote + dossier
 * direction, position always derived) and merges them into the party's
 * positions proposals — the same YAML file the positions:pr flow commits,
 * so vote links ride the existing batch-PR review.
 */
import type { LinkedVote, PartyPosition } from '@voting-helper/data';

import { formatDossierRef } from './dossier-ref.ts';
import { groupMajorityVote } from './group-vote.ts';
import type { PartyGroup } from './party-groups.ts';
import type { RetainedLink } from './vote-preselection.ts';

/** One party's LinkedVote for one retained plenary vote. */
export interface PartyLinkedVote {
  party_id: string;
  fraction: string;
  linked_vote: LinkedVote;
}

/** Why a party got NO LinkedVote for a retained plenary vote. */
export interface PartyVoteAbsence {
  party_id: string;
  fraction: string;
  vote_id: string;
  /** groupe_absent: no ballot cast; groupe_partage: tie — never invented. */
  reason: 'groupe_absent' | 'groupe_partage';
}

/**
 * Builds per-party LinkedVotes for the retained candidates: the raw group
 * vote is the strict plurality of the party's fraction tally; a missing
 * fraction or a tie yields an explicit absence, never an invented vote.
 */
export function buildPartyLinks(
  retained: readonly RetainedLink[],
  partyGroups: readonly PartyGroup[],
): { links: PartyLinkedVote[]; absences: PartyVoteAbsence[] } {
  const links: PartyLinkedVote[] = [];
  const absences: PartyVoteAbsence[] = [];
  for (const link of retained) {
    const { vote } = link;
    const dossierRef =
      vote.dossier === null ? vote.id : formatDossierRef(vote.legislature, vote.dossier.id);
    const tallyByGroup = new Map(vote.groups.map((tally) => [tally.group, tally]));
    for (const { party_id, fraction } of partyGroups) {
      const tally = tallyByGroup.get(fraction);
      if (tally === undefined) {
        absences.push({ party_id, fraction, vote_id: vote.id, reason: 'groupe_absent' });
        continue;
      }
      const majority = groupMajorityVote(tally);
      if (majority === null) {
        absences.push({ party_id, fraction, vote_id: vote.id, reason: 'groupe_partage' });
        continue;
      }
      links.push({
        party_id,
        fraction,
        linked_vote: {
          id: vote.id,
          date: vote.date,
          dossier: dossierRef,
          vote_groupe: majority,
          direction_dossier: link.direction_dossier,
          justification: link.justification,
        },
      });
    }
  }
  return { links, absences };
}

/**
 * Merges one party's proposed vote links into its positions proposals.
 *
 * - An existing record gets its votes_lies REPLACED (re-runs are idempotent,
 *   never accumulating duplicates) and its revision date refreshed.
 * - A 'valide' record receiving new votes returns to 'en_attente': new
 *   material always goes through review again. A 'rejete' record stays
 *   'rejete' — the rejected citation still bars publication.
 * - A statement without a record gets a votes-only 'en_attente' record
 *   (the shared schema allows programme-less records).
 * Statements absent from `votesByStatement` pass through untouched.
 */
export function mergeStatementVotes(
  existing: readonly PartyPosition[],
  partyId: string,
  votesByStatement: ReadonlyMap<string, LinkedVote[]>,
  revisionDate: string,
): PartyPosition[] {
  const remaining = new Map(votesByStatement);
  const merged = existing.map((record): PartyPosition => {
    if (record.party_id !== partyId) return record;
    const votes = remaining.get(record.statement_id);
    if (votes === undefined) return record;
    remaining.delete(record.statement_id);
    return {
      ...record,
      votes_lies: votes,
      statut: record.statut === 'rejete' ? 'rejete' : 'en_attente',
      derniere_revision: revisionDate,
    };
  });
  for (const [statementId, votes] of remaining) {
    merged.push({
      party_id: partyId,
      statement_id: statementId,
      votes_lies: votes,
      statut: 'en_attente',
      derniere_revision: revisionDate,
    });
  }
  return merged;
}
