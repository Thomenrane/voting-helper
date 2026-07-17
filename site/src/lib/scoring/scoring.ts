/**
 * Scoring engine — seam n°1 of the project (ticket #16).
 *
 * Pure function implementing the methodology decided in ticket #8:
 * - Per dimension: score = 100 × (1 − mean(|answer − position| / 4)) over the
 *   included statements, rounded to the nearest integer.
 * - « sans opinion » (or no answer) excludes a statement from BOTH scores.
 * - Missing programme position excludes it from « promesses » only.
 * - Zero linked votes excludes it from « actes » only.
 * - Each linked vote's ±2/0 position is DERIVED from the raw group vote and
 *   the dossier direction (deriveVotePosition, schema m3 — never stored);
 *   several linked votes are averaged.
 * - Zero denominator → score null (« n.d. »), never 0.
 * - Écart = promesses − actes on the rounded (displayed) scores;
 *   « écart marquant » when |écart| ≥ 15 and both scores exist.
 * - Contradiction « promesse vs vote » per statement: programme and vote
 *   positions of opposite signs, one ≥ +1 and the other ≤ −1. This is a
 *   property of the party's data, independent of the user's answers.
 * - Only records with statut 'valide' enter any computation.
 * - Two valid records for the same party × statement are refused (throw) —
 *   inconsistent data must never be silently averaged.
 * - The two scores are NEVER fused into a single number.
 */
import {
  deriveVotePosition,
  type Party,
  type PartyPosition,
  type PositionValue,
  type UserAnswers,
} from '@voting-helper/data';
import { validRecordsByStatement } from '../positions/valid-records.ts';

/** One dimension (promesses or actes) of a party's result. */
export interface DimensionScore {
  /** 0–100 integer, or null when no statement is included (« n.d. »). */
  score: number | null;
  /** Number of statements included in the mean. Always reported. */
  denominator: number;
}

/** Full scoring result for one party. The two dimensions stay separate. */
export interface PartyScore {
  partyId: string;
  promesses: DimensionScore;
  actes: DimensionScore;
  /** promesses − actes (rounded scores), or null if either score is null. */
  ecart: number | null;
  /** True when écart is non-null and |écart| ≥ 15. */
  ecartMarquant: boolean;
  /** Statement ids flagged « promesse vs vote » for this party. */
  contradictions: string[];
}

/** |écart| threshold above which the promesses/actes gap is highlighted. */
export const ECART_MARQUANT_THRESHOLD = 15;

/**
 * Maximum city-block distance between two positions on the −2..+2 scale —
 * the normalisation divisor of the published formula. Exported so the
 * methodology-coherence test (transparency.test.ts) pins the published prose
 * to the engine's value.
 */
export const MAX_DISTANCE = 4;

/**
 * Minimum strength (in scale degrees) each side must reach, with opposite
 * signs, for a « promesse vs vote » contradiction: programme ≥ +1 and vote
 * ≤ −1, or the mirror. Exported for the same prose-pinning test.
 */
export const CONTRADICTION_MIN_STRENGTH = 1;

/**
 * Vote-derived position for one record: mean of the mapped linked votes,
 * or null when no vote is linked (statement excluded from « actes »).
 */
function votePosition(record: PartyPosition): number | null {
  if (record.votes_lies.length === 0) return null;
  const sum = record.votes_lies.reduce(
    (acc, v) => acc + deriveVotePosition(v.vote_groupe, v.direction_dossier),
    0,
  );
  return sum / record.votes_lies.length;
}

/** Score one dimension from the normalised distances of included statements. */
function dimensionScore(distances: number[]): DimensionScore {
  if (distances.length === 0) return { score: null, denominator: 0 };
  const mean = distances.reduce((acc, d) => acc + d, 0) / distances.length;
  return { score: Math.round(100 * (1 - mean)), denominator: distances.length };
}

/** « Promesse vs vote »: opposite signs, one side ≥ +1 and the other ≤ −1. */
function isContradiction(programme: PositionValue, vote: number): boolean {
  return (
    (programme >= CONTRADICTION_MIN_STRENGTH && vote <= -CONTRADICTION_MIN_STRENGTH) ||
    (programme <= -CONTRADICTION_MIN_STRENGTH && vote >= CONTRADICTION_MIN_STRENGTH)
  );
}

function scoreParty(
  answers: UserAnswers,
  partyId: string,
  positions: readonly PartyPosition[],
): PartyScore {
  const promessesDistances: number[] = [];
  const actesDistances: number[] = [];
  const contradictions: string[] = [];

  // Shared visibility rule (valid-records.ts): statut 'valide' only, and an
  // electoral tool must refuse inconsistent data, not average it — two valid
  // records for the same party × statement throw there.
  for (const record of validRecordsByStatement(partyId, positions).values()) {
    const vote = votePosition(record);
    if (record.position !== undefined && vote !== null && isContradiction(record.position, vote)) {
      contradictions.push(record.statement_id);
    }

    // Own-property lookup only: an inherited key (e.g. 'constructor') must
    // never be mistaken for an answer.
    const answer = Object.hasOwn(answers, record.statement_id)
      ? answers[record.statement_id]
      : undefined;
    if (answer === undefined || answer === 'sans_opinion') continue;
    if (record.position !== undefined) {
      promessesDistances.push(Math.abs(answer - record.position) / MAX_DISTANCE);
    }
    if (vote !== null) {
      actesDistances.push(Math.abs(answer - vote) / MAX_DISTANCE);
    }
  }

  const promesses = dimensionScore(promessesDistances);
  const actes = dimensionScore(actesDistances);
  const ecart = promesses.score !== null && actes.score !== null ? promesses.score - actes.score : null;

  return {
    partyId,
    promesses,
    actes,
    ecart,
    ecartMarquant: ecart !== null && Math.abs(ecart) >= ECART_MARQUANT_THRESHOLD,
    contradictions,
  };
}

/**
 * Score every party against the user's answers.
 * Pure function — no I/O; parties are returned in input order.
 * Throws when the dataset holds two valid records for one party × statement.
 */
export function scoreParties(
  answers: UserAnswers,
  parties: readonly Party[],
  positions: readonly PartyPosition[],
): PartyScore[] {
  return parties.map((party) => scoreParty(answers, party.id, positions));
}
