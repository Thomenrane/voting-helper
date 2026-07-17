/**
 * Merge of a fresh harvest into an existing pool file (#24).
 *
 * The pool files are the HITL working substrate: the maintainer codes
 * `positions` maps (and may fix themes/wording) by hand, then the guide
 * recommends re-running statements:pool in a loop. A re-run must therefore
 * NEVER overwrite that human work:
 * - existing candidates are preserved verbatim — ids, coded positions,
 *   human edits — whether or not the new harvest re-produces them;
 * - a harvested candidate identical to an existing one (same normalized
 *   text + same source anchor) is dropped as already known;
 * - genuinely new candidates are appended with ids continuing after the
 *   highest existing number — ids are never renumbered;
 * - anything ambiguous (duplicate ids, two existing candidates
 *   indistinguishable by text + source) fails loudly instead of guessing.
 *
 * Pure module — the command reads the existing YAML once, then calls this
 * after every chunk/batch so partial progress persists without ever
 * touching the human baseline.
 */
import type { CandidateSource, CandidateStatement, HarvestedCandidate } from './candidate-pool.ts';

/** Whitespace-insensitive text form — LLM re-runs vary spacing, not words. */
function normalizeText(text: string): string {
  return text.trim().replace(/\s+/gu, ' ');
}

/**
 * Identity anchor of a source: what makes the same measure "the same"
 * across runs. Deliberately excludes ref_snapshot and url_source — a
 * re-snapshot of unchanged content must not duplicate the pool.
 */
function sourceKey(source: CandidateSource): string {
  return source.kind === 'programme'
    ? `programme|${source.party_id}|${source.source_id}|${source.page}`
    : `vote|${source.vote_id}`;
}

function candidateKey(candidate: HarvestedCandidate): string {
  const first = candidate.sources[0];
  if (first === undefined) {
    throw new Error('Candidate without sources — traceability is mandatory.');
  }
  return `${normalizeText(candidate.texte_fr)}||${sourceKey(first)}`;
}

/**
 * Merges harvested candidates into the existing pool of one origin file.
 * Returns existing candidates unchanged (original order) followed by the
 * genuinely new ones.
 */
export function mergePoolCandidates(
  origin: string,
  existing: readonly CandidateStatement[],
  harvested: readonly HarvestedCandidate[],
): CandidateStatement[] {
  const ids = new Set<string>();
  for (const candidate of existing) {
    if (ids.has(candidate.id)) {
      throw new Error(
        `Existing pool file carries a duplicate candidate id '${candidate.id}' — ` +
          'fix the file by hand before re-running the harvest.',
      );
    }
    ids.add(candidate.id);
  }

  const byKey = new Map<string, CandidateStatement>();
  for (const candidate of existing) {
    const key = candidateKey(candidate);
    const clash = byKey.get(key);
    if (clash !== undefined) {
      throw new Error(
        `Existing candidates '${clash.id}' and '${candidate.id}' are indistinguishable ` +
          '(same text and source) — merging cannot decide between them; deduplicate the ' +
          'file by hand before re-running the harvest.',
      );
    }
    byKey.set(key, candidate);
  }

  const idPattern = new RegExp(`^${origin}-c(\\d+)$`, 'u');
  let nextNumber =
    existing.reduce((max, candidate) => {
      const match = idPattern.exec(candidate.id);
      return match === null ? max : Math.max(max, Number(match[1]));
    }, 0) + 1;

  const merged = [...existing];
  const seenNew = new Set<string>();
  for (const candidate of harvested) {
    const key = candidateKey(candidate);
    if (byKey.has(key) || seenNew.has(key)) {
      continue; // already known — the existing (possibly hand-edited) record wins
    }
    seenNew.add(key);
    merged.push({ id: `${origin}-c${String(nextNumber).padStart(3, '0')}`, ...candidate });
    nextNumber += 1;
  }
  return merged;
}
