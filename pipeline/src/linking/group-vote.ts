/**
 * Party raw vote from the group's nominal ballots (#23): the RAW group vote
 * stored on a LinkedVote (schema m3) is the strict plurality of the group's
 * oui/non/abstention ballots. A tie (or an empty tally) yields null — the
 * pipeline never invents a group position, the party simply gets no linked
 * vote for that plenary vote and the review summary says so.
 */
import type { GroupVotePosition } from '@voting-helper/data';

import type { GroupTally } from '../votes/votes.types.ts';

/** Strict plurality of a group tally, or null on tie / no ballots. */
export function groupMajorityVote(tally: GroupTally): GroupVotePosition | null {
  const entries: readonly [GroupVotePosition, number][] = [
    ['oui', tally.oui],
    ['non', tally.non],
    ['abstention', tally.abstention],
  ];
  let best: GroupVotePosition | null = null;
  let bestCount = 0;
  let tied = false;
  for (const [position, count] of entries) {
    if (count > bestCount) {
      best = position;
      bestCount = count;
      tied = false;
    } else if (count === bestCount && count > 0) {
      tied = true;
    }
  }
  return tied || bestCount === 0 ? null : best;
}
