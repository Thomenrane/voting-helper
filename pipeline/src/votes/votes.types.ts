/**
 * Typed internal format for Chamber plenary votes (ticket #21).
 *
 * This is the pipeline-internal contract produced by vote ingestion and
 * consumed later by the vote-preselection stage (#10). It is source-agnostic:
 * the zijwerkenvooru Parquet ingestion fills it today, the future CRIV/FLWB
 * scraper (#2) must produce the same shape.
 */
import type { GroupVotePosition } from '@voting-helper/data';

/** One deputy's ballot in one plenary vote. */
export interface MemberBallot {
  /** Deputy full name as printed in the source. */
  name: string;
  /** Parliamentary group (fraction); null when the deputy could not be resolved. */
  group: string | null;
  position: GroupVotePosition;
}

/** Ballot counts of one parliamentary group in one vote. */
export interface GroupTally {
  group: string;
  oui: number;
  non: number;
  abstention: number;
}

/** Legislative dossier context of a vote, when the source links one. */
export interface VoteDossier {
  /** Dossier number within the legislature (e.g. '228' → DOC 56 0228). */
  id: string;
  title: string | null;
  document_type: string | null;
  status: string | null;
}

/** One nominal vote in a plenary session of the Chamber. */
export interface PlenaryVote {
  /** Unique id: `<legislature>-m<meeting>-v<vote number>`. */
  id: string;
  legislature: string;
  meeting_id: string;
  vote_number: string;
  /** ISO date (YYYY-MM-DD) of the plenary session. */
  date: string;
  title_fr: string;
  title_nl: string;
  /** Null when the source does not link the vote to a dossier (e.g. motions). */
  dossier: VoteDossier | null;
  document_id: string | null;
  motion_id: string | null;
  /** Counts as announced by the source. */
  counts: { oui: number; non: number; abstention: number };
  /** Per-deputy detail. */
  ballots: MemberBallot[];
  /** Per-group detail, derived from resolved ballots. */
  groups: GroupTally[];
  /** Data-quality notes (count mismatch, unresolved deputy, …). Empty when clean. */
  warnings: string[];
}

/** The complete typed dataset produced by one vote-ingestion run. */
export interface VotesDataset {
  /** Ingestion source id (e.g. 'zijwerkenvooru-parquet'). */
  source_id: string;
  legislature: string;
  /** ISO 8601 UTC datetime at which the dataset was generated. */
  generated_at: string;
  vote_count: number;
  votes: PlenaryVote[];
}
