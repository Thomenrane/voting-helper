/**
 * Mechanical inclusion/exclusion rules of the vote-linking stage (#23).
 *
 * This module IS the coded half of the published selection criteria
 * (docs/methodologie/criteres-liaison-votes.md — keep both in sync):
 * - only votes linked to a legislative dossier are considered;
 * - purely procedural votes are excluded on title patterns (FR/NL);
 * - the remaining votes are classified « vote final » (default) or
 *   « amendement » (title names one or more amendments).
 *
 * Everything here works on the vote's METADATA only — relevance to a given
 * statement is the semantic stage's job (vote-preselection.ts). Note: the
 * current dataset (zijwerkenvooru, legislature 56) carries no Eurovoc
 * descriptors; when the CRIV/FLWB scraper (#2) lands, dossier descriptors
 * become an additional mechanical signal — the published criteria already
 * anticipate it.
 */
import type { PlenaryVote } from '../votes/votes.types.ts';

export type EligibleVoteKind = 'vote_final' | 'amendement';

export type VoteEligibility =
  | { eligible: true; kind: EligibleVoteKind }
  | { eligible: false; reason: string };

/** Case/diacritic-insensitive normalisation for title-pattern matching. */
function normalizeTitle(title: string): string {
  return title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/**
 * Published procedural patterns (normalized, matched on FR and NL titles).
 * Each entry carries the human-readable label used in exclusion reasons —
 * the review summary must say WHY a vote was set aside.
 */
const PROCEDURAL_PATTERNS: readonly { pattern: RegExp; label: string }[] = [
  { pattern: /prise en consideration|inoverwegingneming/, label: 'prise en considération' },
  {
    pattern: /renvoi (a la|en) commission|(verzending|terugzending) naar (de )?commissie/,
    label: 'renvoi en commission',
  },
  { pattern: /ajournement|verdaging/, label: 'ajournement' },
  {
    pattern: /ordre des travaux|regeling van (de )?werkzaamheden/,
    label: 'ordre des travaux',
  },
  { pattern: /\burgence\b|\burgentie/, label: "demande d'urgence" },
  {
    pattern: /conseil d.etat|raad van state/,
    label: "consultation du Conseil d'État",
  },
  { pattern: /motion d.ordre|ordemotie/, label: "motion d'ordre" },
];

const AMENDMENT_PATTERN = /\bamendement/;

/**
 * Classifies one plenary vote against the published mechanical criteria.
 * Exclusion reasons are review-ready French sentences (one per rule).
 */
export function classifyVoteEligibility(vote: PlenaryVote): VoteEligibility {
  if (vote.dossier === null) {
    return {
      eligible: false,
      reason:
        'vote sans dossier législatif lié (motion ou vote de procédure) — critère publié n° 1',
    };
  }
  const title = `${normalizeTitle(vote.title_fr)}\n${normalizeTitle(vote.title_nl)}`;
  for (const { pattern, label } of PROCEDURAL_PATTERNS) {
    if (pattern.test(title)) {
      return {
        eligible: false,
        reason: `vote procédural (« ${label} ») — critère publié n° 2`,
      };
    }
  }
  return {
    eligible: true,
    kind: AMENDMENT_PATTERN.test(title) ? 'amendement' : 'vote_final',
  };
}
