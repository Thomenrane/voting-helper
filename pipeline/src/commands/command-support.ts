/**
 * Shared plumbing for snapshot commands: repo-root resolution and run
 * reporting. Commands stay thin — all behaviour lives in tested modules.
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { SnapshotEntry } from '../snapshot/manifest.ts';
import { SnapshotRunError, type SnapshotRunResult } from '../snapshot/snapshot-runner.ts';

/** Repo root, resolved from this file's location (pipeline/src/commands/). */
export function resolveRepoRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
}

/**
 * Review summary of the latest vote-linking run (link:votes), inside
 * data/positions/proposals/. Shared between link-votes (writer) and
 * prepare-position-pr --votes (PR body) — command files must never import
 * each other (they execute on import).
 */
export const VOTES_REVIEW_FILE = 'votes-liaison.review.md';

/**
 * Sidecar manifest of the latest vote-linking run: the repo-relative YAML
 * files the run actually updated. prepare-position-pr --votes commits
 * exactly these files — never a directory glob that could sweep unrelated
 * proposals into the batch.
 */
export const VOTES_FILES_MANIFEST = 'votes-liaison.files.json';

/**
 * Candidate-statement pool directory (#24), shared between statements-pool
 * (writer) and statements-select (reader) — command files must never import
 * each other (they execute on import).
 */
export const STATEMENTS_POOL_DIR = 'data/statements/pool';

export function describeEntry(entry: SnapshotEntry): string {
  const unchanged =
    entry.content_unchanged_from === undefined
      ? ''
      : ` (content unchanged since ${entry.content_unchanged_from})`;
  return `  + ${entry.snapshot_id} — ${entry.bytes} bytes, sha256 ${entry.sha256.slice(0, 12)}…${unchanged}`;
}

/**
 * Prints the run outcome and raises when any source failed — successes are
 * already persisted, but the command must fail loudly naming each source.
 */
export function reportRun(result: SnapshotRunResult, manifestPath: string): void {
  for (const entry of result.succeeded) {
    console.log(describeEntry(entry));
  }
  console.log(`Manifest updated: ${manifestPath} (${result.succeeded.length} new snapshot(s)).`);
  if (result.failed.length > 0) {
    throw new SnapshotRunError(result.failed, result.succeeded.length);
  }
}

/** One index's chapters that had no in-window Wayback capture at crawl time (#58). */
export interface UnavailableChapters {
  indexId: string;
  slugs: string[];
}

/**
 * Raised by the chapter crawl when at least one chapter has no in-window Wayback
 * capture. Successful chapters are already snapshotted (never lost) — but the
 * operator must SEE the incompleteness immediately, at crawl time, via a
 * non-zero exit, not only later at the admission gate.
 */
export class IncompleteChaptersError extends Error {
  readonly unavailable: UnavailableChapters[];

  constructor(unavailable: UnavailableChapters[]) {
    const total = unavailable.reduce((sum, u) => sum + u.slugs.length, 0);
    const lines = unavailable.map(
      (u) => `  - ${u.indexId}: ${u.slugs.length} sans capture — ${u.slugs.join(', ')}`,
    );
    super(
      `Crawl incomplet : ${total} chapitre(s) sans capture Wayback dans la fenêtre du scrutin ` +
        `(snapshots réussis conservés ; 'chapters-inventory' échouera tant qu'ils manquent) :\n${lines.join('\n')}`,
    );
    this.name = 'IncompleteChaptersError';
    this.unavailable = unavailable;
  }
}

/**
 * Fails the command (non-zero exit via the thrown error) when any index has
 * chapters with no in-window capture. No-op when everything resolved. MUST be
 * called AFTER snapshots are persisted so successful work is never lost.
 */
export function assertChaptersComplete(unavailable: readonly UnavailableChapters[]): void {
  const withGaps = unavailable.filter((u) => u.slugs.length > 0);
  if (withGaps.length > 0) throw new IncompleteChaptersError(withGaps);
}

/** Uniform fatal-error exit for command entry points. */
export function fail(error: unknown): never {
  console.error(error instanceof Error ? `\n${error.message}` : `\n${String(error)}`);
  process.exit(1);
}
