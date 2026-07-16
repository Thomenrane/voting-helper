/**
 * `npm run snapshot:votes` — ingests the Chamber plenary votes (ticket #21).
 *
 * Two stages, one manifest (`data/manifests/votes.manifest.json`):
 * 1. Snapshot the raw CC0 Parquet files (zijwerkenvooru, legislature 56)
 *    verbatim — dated, immutable, fingerprinted.
 * 2. Transform them into the typed internal dataset (vote, date, dossier,
 *    per-deputy and per-group detail) and store it as a `derived` snapshot.
 *
 * The derived stage only runs when EVERY raw source succeeded: a partial
 * ingestion is never produced silently. Raw successes are still recorded
 * before the command exits non-zero naming the failed sources.
 */
import { join } from 'node:path';

import { fetchBytes } from '../snapshot/fetcher.ts';
import { appendSnapshot, buildSnapshotEntry, emptyManifest } from '../snapshot/manifest.ts';
import { snapshotSources } from '../snapshot/snapshot-runner.ts';
import {
  loadManifest,
  saveManifest,
  sha256Hex,
  writeSnapshotFile,
} from '../snapshot/snapshot-store.ts';
import { DERIVED_VOTES_SOURCE, ZIJWERKENVOORU_VOTES_SOURCE } from '../sources/votes.sources.ts';
import { summarizeVoteQuality } from '../votes/votes.transform.ts';
import { describeEntry, fail, reportRun, resolveRepoRoot } from './command-support.ts';

const MANIFEST_RELATIVE_PATH = 'data/manifests/votes.manifest.json';
const SNAPSHOTS_DIR = 'data/snapshots/votes';

async function main(): Promise<void> {
  const repoRoot = resolveRepoRoot();
  const manifestPath = join(repoRoot, MANIFEST_RELATIVE_PATH);
  const source = ZIJWERKENVOORU_VOTES_SOURCE;
  let manifest = await loadManifest(
    manifestPath,
    emptyManifest(
      'Dated immutable snapshots of Chamber plenary votes: raw CC0 Parquet files ' +
        '(zijwerkenvooru, legislature 56) plus the typed dataset derived from them. ' +
        'Binaries live in the gitignored data/snapshots/votes/; the committed SHA-256 ' +
        'fingerprints guarantee their integrity pending durable object storage.',
      'docs/research/votes-chambre.md (branch research/votes-chambre)',
    ),
  );

  console.log(`Snapshotting ${source.rawSources.length} raw vote sources (${source.id})…`);
  const rawBySourceId = new Map<string, Uint8Array>();
  const rawResult = await snapshotSources({
    sources: [...source.rawSources],
    manifest,
    kind: 'raw',
    snapshotsDir: SNAPSHOTS_DIR,
    fetchBytes,
    persistSnapshot: async (entry, bytes) => {
      await writeSnapshotFile(repoRoot, entry, bytes);
      rawBySourceId.set(entry.source_id, bytes);
    },
  });
  manifest = rawResult.manifest;
  await saveManifest(manifestPath, manifest);

  if (rawResult.failed.length > 0) {
    // Raw successes are recorded above; the derived dataset is NOT produced
    // from an incomplete set of inputs. reportRun raises, naming each source.
    reportRun(rawResult, MANIFEST_RELATIVE_PATH);
  }

  const dataset = await source.toDataset(rawBySourceId);
  const quality = summarizeVoteQuality(dataset.votes);
  console.log(
    `Typed ${dataset.vote_count} plenary votes (legislature ${dataset.legislature}, ` +
      `${quality.votes_with_warnings} vote(s) carrying data-quality warnings).`,
  );
  for (const vote of dataset.votes) {
    for (const warning of vote.warnings) {
      console.log(`  ! ${vote.id} (${vote.date}): ${warning}`);
    }
  }

  // The dataset payload is timestamp-free (deterministic for identical
  // inputs); the generation datetime lives in the manifest entry only.
  const bytes = new TextEncoder().encode(JSON.stringify(dataset));
  const derivedEntry = buildSnapshotEntry({
    source: DERIVED_VOTES_SOURCE,
    kind: 'derived',
    retrievedAt: new Date().toISOString(),
    sha256: sha256Hex(bytes),
    bytes: bytes.byteLength,
    snapshotsDir: SNAPSHOTS_DIR,
    quality: { ...quality },
  });
  manifest = appendSnapshot(manifest, derivedEntry);
  const appended = manifest.snapshots[manifest.snapshots.length - 1];
  if (appended === undefined) {
    throw new Error('Derived dataset entry was not appended to the manifest.');
  }
  await writeSnapshotFile(repoRoot, appended, bytes);
  await saveManifest(manifestPath, manifest);

  reportRun(rawResult, MANIFEST_RELATIVE_PATH);
  console.log(describeEntry(appended));
}

main().catch(fail);
