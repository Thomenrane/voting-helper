/**
 * `npm run snapshot:verify` — confronts every snapshot file present on disk
 * with the SHA-256 fingerprints committed in the manifests.
 *
 * Report per entry: ok / corrupted / missing. A locally missing binary is
 * expected (snapshots are gitignored — fresh clones only carry manifests);
 * any corruption makes the command exit non-zero, naming the files.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { emptyManifest } from '../snapshot/manifest.ts';
import { loadManifest } from '../snapshot/snapshot-store.ts';
import { verifyManifestFiles, type SnapshotVerification } from '../snapshot/verify.ts';
import { fail, resolveRepoRoot } from './command-support.ts';

const MANIFEST_RELATIVE_PATHS = [
  'data/manifests/programmes.manifest.json',
  'data/manifests/votes.manifest.json',
];

async function main(): Promise<void> {
  const repoRoot = resolveRepoRoot();
  const corrupted: SnapshotVerification[] = [];

  for (const relativePath of MANIFEST_RELATIVE_PATHS) {
    const manifestPath = join(repoRoot, relativePath);
    if (!existsSync(manifestPath)) {
      console.log(`${relativePath}: no manifest yet — skipped.`);
      continue;
    }
    const manifest = await loadManifest(manifestPath, emptyManifest('', ''));
    const results = await verifyManifestFiles(repoRoot, manifest);
    const counts = { ok: 0, corrupted: 0, missing: 0 };
    for (const result of results) {
      counts[result.status] += 1;
      if (result.status === 'corrupted') {
        corrupted.push(result);
        console.log(
          `  ✗ ${result.entry.snapshot_id} — '${result.entry.file}' is corrupted: ` +
            `manifest sha256=${result.entry.sha256}, actual sha256=${result.actualSha256}`,
        );
      }
    }
    console.log(
      `${relativePath}: ${results.length} snapshot(s) — ${counts.ok} ok, ` +
        `${counts.corrupted} corrupted, ${counts.missing} missing locally.`,
    );
  }

  if (corrupted.length > 0) {
    throw new Error(
      `${corrupted.length} snapshot file(s) no longer match their committed fingerprint: ` +
        corrupted.map((r) => r.entry.snapshot_id).join(', '),
    );
  }
}

main().catch(fail);
