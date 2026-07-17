/**
 * Discriminance measure of a candidate statement (#24).
 *
 * A good statement SPREADS the parties (decision #9): if every party takes
 * the same position — including a shared neutral 0 — the statement teaches
 * the user nothing and wastes one of the 35 slots.
 *
 * Published formula — normalized mean absolute pairwise distance (Gini mean
 * difference): the average disagreement between two randomly chosen coded
 * parties, divided by the maximum average disagreement achievable with the
 * same number of parties (a perfectly balanced ±2 split).
 *
 *   score = mean(|p_i − p_j| over all pairs) / maxMean(n)
 *   maxMean(n) = 4 · ⌊n/2⌋ · ⌈n/2⌉ / C(n, 2)
 *
 * Why this over plain variance: variance rewards a single ±2 outlier against
 * a consensus MORE than two genuinely balanced ±1 camps (0.31 vs 0.25 for 12
 * parties) — the wrong ordering for a voting test, where a lone dissenter is
 * near-consensus. The pairwise formula orders them correctly (0.31 vs 0.50)
 * while keeping the same anchors: 0 = full consensus (any shared value),
 * 1 = perfectly balanced maximal split.
 *
 * Pure module: no I/O, no LLM — positions come from human/HITL coding of the
 * candidate pool (they do not exist before the #25 corpus work).
 */
import type { PositionValue } from '@voting-helper/data';

/** Width of the position scale (−2..+2). */
const POSITION_RANGE = 4;

export interface DiscriminanceResult {
  /**
   * Normalized score in [0, 1]; null when fewer than 2 coded positions
   * exist — disagreement is undefined, never silently 0.
   */
  score: number | null;
  /** Number of coded positions the score is based on (its reliability). */
  coded: number;
}

/**
 * Computes the discriminance of one candidate from its coded party
 * positions. Missing positions are simply absent from the input — the
 * caller reports `coded` alongside the score so a high score based on 2
 * parties is never mistaken for one based on 12.
 */
export function computeDiscriminance(
  positions: readonly PositionValue[],
): DiscriminanceResult {
  const n = positions.length;
  if (n < 2) {
    return { score: null, coded: n };
  }
  let sum = 0;
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      sum += Math.abs((positions[i] as number) - (positions[j] as number));
    }
  }
  const maxSum = POSITION_RANGE * Math.floor(n / 2) * Math.ceil(n / 2);
  return { score: sum / maxSum, coded: n };
}
