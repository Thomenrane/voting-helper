/**
 * Shared derivation of a linked vote's statement-relative position (m3
 * decision, review of PR #28): `LinkedVote` stores the RAW group vote on the
 * dossier plus the dossier's direction relative to the statement, so the
 * parliamentary fact stays auditable; the ±2/0 position used by the « actes »
 * score is derived HERE and only here — pipeline and site both consume these
 * helpers, no caller re-implements the table.
 *
 * Published table: oui × soutient = +2, oui × contredit = −2,
 * abstention × * = 0, non × soutient = −2, non × contredit = +2.
 */
import type { DossierDirection, GroupVotePosition } from './schema.ts';

/** Positions a single linked vote can take on the −2..+2 scale. */
export type DerivedVotePosition = -2 | 0 | 2;

/**
 * Raw group vote read RELATIVE to the statement: on a dossier that contradicts
 * the statement, voting « oui » means opposing the statement (and vice versa);
 * an abstention stays an abstention in both directions.
 */
export function deriveRelativeVote(
  voteGroupe: GroupVotePosition,
  directionDossier: DossierDirection,
): GroupVotePosition {
  if (directionDossier === 'soutient' || voteGroupe === 'abstention') {
    return voteGroupe;
  }
  return voteGroupe === 'oui' ? 'non' : 'oui';
}

const RELATIVE_VOTE_VALUE: Record<GroupVotePosition, DerivedVotePosition> = {
  oui: 2,
  abstention: 0,
  non: -2,
};

/** Statement-relative position of one linked vote (+2 / 0 / −2). */
export function deriveVotePosition(
  voteGroupe: GroupVotePosition,
  directionDossier: DossierDirection,
): DerivedVotePosition {
  return RELATIVE_VOTE_VALUE[deriveRelativeVote(voteGroupe, directionDossier)];
}
