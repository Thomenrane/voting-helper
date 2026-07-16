/**
 * `npm run snapshot:programmes` — snapshots the official 2024 programme
 * sources of the 13 federal parties (ticket #21).
 *
 * Storage decision: the manifest (metadata + SHA-256) is committed at
 * `data/manifests/programmes.manifest.json`; the binaries land in the
 * gitignored `data/snapshots/programmes/`. Snapshots are immutable: every
 * run appends new dated versions, nothing is ever overwritten. A failing
 * source never truncates the run silently — the command records successes,
 * then exits non-zero naming every failed source.
 */
import { join } from 'node:path';

import { fetchBytes } from '../snapshot/fetcher.ts';
import { emptyManifest } from '../snapshot/manifest.ts';
import { snapshotSources } from '../snapshot/snapshot-runner.ts';
import { loadManifest, saveManifest, writeSnapshotFile } from '../snapshot/snapshot-store.ts';
import { PROGRAMME_SOURCES } from '../sources/programmes.sources.ts';
import { fail, reportRun, resolveRepoRoot } from './command-support.ts';

const MANIFEST_RELATIVE_PATH = 'data/manifests/programmes.manifest.json';
const SNAPSHOTS_DIR = 'data/snapshots/programmes';

async function main(): Promise<void> {
  const repoRoot = resolveRepoRoot();
  const manifestPath = join(repoRoot, MANIFEST_RELATIVE_PATH);
  const manifest = await loadManifest(
    manifestPath,
    emptyManifest(
      'Dated immutable snapshots of the official 2024 programmes of the 13 federal parties. ' +
        'Binaries live in the gitignored data/snapshots/programmes/; the committed SHA-256 ' +
        'fingerprints guarantee their integrity pending durable object storage.',
      'docs/research/programmes-partis.md (branch research/programmes-partis)',
    ),
  );

  console.log(`Snapshotting ${PROGRAMME_SOURCES.length} programme sources…`);
  const result = await snapshotSources({
    sources: PROGRAMME_SOURCES,
    manifest,
    kind: 'raw',
    snapshotsDir: SNAPSHOTS_DIR,
    fetchBytes,
    persistSnapshot: (entry, bytes) => writeSnapshotFile(repoRoot, entry, bytes),
  });
  await saveManifest(manifestPath, result.manifest);
  reportRun(result, MANIFEST_RELATIVE_PATH);
}

main().catch(fail);
