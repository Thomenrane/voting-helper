/**
 * Loader of the derived plenary-votes dataset attested in the votes
 * manifest (#21). Shared by link:votes (#23) and statements:pool (#24) —
 * command files must never import each other (they execute on import), so
 * the loading logic lives here.
 */
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { emptyManifest, latestSnapshot, verifySnapshotIntegrity } from '../snapshot/manifest.ts';
import { loadManifest, sha256Hex } from '../snapshot/snapshot-store.ts';
import { DERIVED_VOTES_SOURCE } from '../sources/votes.sources.ts';
import type { VotesDataset } from './votes.types.ts';

export const VOTES_MANIFEST_RELATIVE_PATH = 'data/manifests/votes.manifest.json';

export interface LoadedVotesDataset {
  dataset: VotesDataset;
  /** Snapshot id of the dataset — cited by every downstream review summary. */
  snapshotId: string;
}

/** Loads and integrity-checks the latest derived votes dataset. */
export async function loadVotesDataset(repoRoot: string): Promise<LoadedVotesDataset> {
  const manifest = await loadManifest(
    join(repoRoot, VOTES_MANIFEST_RELATIVE_PATH),
    emptyManifest('', ''),
  );
  const entry = latestSnapshot(manifest, DERIVED_VOTES_SOURCE.id);
  if (entry === undefined) {
    throw new Error(
      `No derived votes dataset recorded in ${VOTES_MANIFEST_RELATIVE_PATH}. ` +
        `Run 'npm run snapshot:votes' first.`,
    );
  }
  const absPath = join(repoRoot, entry.file);
  if (!existsSync(absPath)) {
    throw new Error(
      `Snapshot file '${entry.file}' is missing locally (binaries are gitignored). ` +
        `Re-run 'npm run snapshot:votes' to re-materialize it.`,
    );
  }
  const bytes = await readFile(absPath);
  verifySnapshotIntegrity(entry, sha256Hex(bytes));
  const dataset = JSON.parse(new TextDecoder().decode(bytes)) as VotesDataset;
  if (!Array.isArray(dataset.votes)) {
    throw new Error(`Snapshot '${entry.snapshot_id}' is not a votes dataset ('votes' missing).`);
  }
  return { dataset, snapshotId: entry.snapshot_id };
}
