/**
 * Shared position schema — single source of truth for pipeline and site.
 *
 * Encodes the decisions of ticket #10 (validated positions stored in the repo)
 * and ticket #8 (scoring methodology inputs).
 */

/** A position on the 5-point scale shared by users and parties. */
export type PositionValue = -2 | -1 | 0 | 1 | 2;

/**
 * A user's answer to one statement.
 * 'sans_opinion' excludes the statement from BOTH scores for this user.
 */
export type UserAnswer = PositionValue | 'sans_opinion';

/** User answers keyed by statement id. Statements without an entry are unanswered. */
export type UserAnswers = Readonly<Record<string, UserAnswer>>;

/** Statement (énoncé): one concrete, single-sentence proposition, bilingual. */
export interface Statement {
  id: string;
  theme: string;
  texte_fr: string;
  texte_nl: string;
  /** Concrete measure behind the statement, shown as a footnote (FR). */
  note_concrete_fr: string;
  /** Concrete measure behind the statement, shown as a footnote (NL). */
  note_concrete_nl: string;
}

/** A political party. */
export interface Party {
  id: string;
  name: string;
}

/** Exact programme quote backing a party's programme position. */
export interface Citation {
  /** Exact text as it appears in the source (mechanically verifiable). */
  texte: string;
  /** URL of the original source document. */
  url_source: string;
  /** Reference to the snapshot taken at ingestion time. */
  ref_snapshot: string;
  /** Page number in the source document. */
  page: number;
}

/** How the party's parliamentary group voted, relative to the vote itself. */
export type GroupVotePosition = 'oui' | 'abstention' | 'non';

/**
 * Direction of the dossier relative to the STATEMENT: adopting the dossier
 * either goes in the statement's direction ('soutient') or against it
 * ('contredit').
 */
export type DossierDirection = 'soutient' | 'contredit';

/**
 * A parliamentary vote linked to a statement for one party.
 *
 * m3 decision (review of PR #28): the record stores the RAW group vote on the
 * dossier plus the dossier's direction relative to the statement — the
 * parliamentary fact stays auditable and any sense inversion is an explicit
 * field, not prose. The statement-relative position (+2/0/−2) is DERIVED from
 * these two fields via `deriveVotePosition` (linked-vote.ts), never stored:
 * oui × soutient = +2, oui × contredit = −2, abstention = 0,
 * non × soutient = −2, non × contredit = +2.
 */
export interface LinkedVote {
  id: string;
  /** ISO date (YYYY-MM-DD) of the vote. */
  date: string;
  /** Parliamentary dossier reference (e.g. DOC number). */
  dossier: string;
  /** RAW group vote on the dossier — what the group actually voted. */
  vote_groupe: GroupVotePosition;
  /** Whether adopting the dossier supports or contradicts the statement. */
  direction_dossier: DossierDirection;
  /** One-sentence justification for linking this vote to the statement. */
  justification: string;
}

/** Review status of a party position record. Only 'valide' enters scoring. */
export type PositionStatus = 'valide' | 'en_attente' | 'rejete';

/**
 * Programme part of a party position.
 * Either both the position and its citation exist, or neither does:
 * an undocumented programme position ("position non documentée") excludes
 * the statement from this party's "promesses" score.
 */
export type ProgrammePosition =
  | { position: PositionValue; citation: Citation }
  | { position?: undefined; citation?: undefined };

/**
 * One party × one statement record.
 * - No programme position → statement excluded from the party's "promesses" score.
 * - Empty votes_lies → statement excluded from the party's "actes" score.
 */
export type PartyPosition = ProgrammePosition & {
  party_id: string;
  statement_id: string;
  votes_lies: LinkedVote[];
  statut: PositionStatus;
  /** ISO date (YYYY-MM-DD) of the last human review of this record. */
  derniere_revision: string;
};
