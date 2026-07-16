/**
 * `npm run positions:pr -- --party <id>`
 *
 * Prepares the batch PR for one party's extracted positions (#22): creates a
 * dated `positions/<party>-<yyyymmdd>` branch, commits the YAML proposals and
 * the human-readable review summary, and prints the exact push/PR commands.
 *
 * Opening the PR itself needs push rights and an authenticated `gh` — when
 * they are not available in the environment, the branch and the review body
 * are ready for manual PR creation; the printed commands document the batch
 * flow (the human review of that PR IS the validation — spec #15).
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { getPartyProgramme } from '../sources/party-programmes.ts';
import { fail, resolveRepoRoot } from './command-support.ts';

const PROPOSALS_DIR = 'data/positions/proposals';

function git(repoRoot: string, ...args: string[]): string {
  return execFileSync('git', ['-C', repoRoot, ...args], { encoding: 'utf8' }).trim();
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { party: { type: 'string' } } });
  if (values.party === undefined) {
    throw new Error('Missing --party. Usage: npm run positions:pr -- --party ps');
  }
  const party = getPartyProgramme(values.party);

  const repoRoot = resolveRepoRoot();
  const yamlRelative = `${PROPOSALS_DIR}/${party.party_id}.positions.yaml`;
  const reviewRelative = `${PROPOSALS_DIR}/${party.party_id}.review.md`;
  for (const relative of [yamlRelative, reviewRelative]) {
    if (!existsSync(join(repoRoot, relative))) {
      throw new Error(
        `'${relative}' is missing — run 'npm run extract:positions -- --party ${party.party_id}' first.`,
      );
    }
  }

  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const branch = `positions/${party.party_id}-${stamp}`;
  const startBranch = git(repoRoot, 'rev-parse', '--abbrev-ref', 'HEAD');

  git(repoRoot, 'checkout', '-b', branch);
  git(repoRoot, 'add', yamlRelative, reviewRelative);
  git(
    repoRoot,
    'commit',
    '-m',
    `Positions ${party.name} — lot d'extraction (statut en_attente)\n\n` +
      `Propositions générées par extract:positions, citations vérifiées\n` +
      `mécaniquement contre la couche texte dérivée. La review humaine de\n` +
      `cette PR est la validation (#22).`,
  );

  const title = `Positions ${party.name} — lot d'extraction du ${stamp.slice(6)}/${stamp.slice(4, 6)}/${stamp.slice(0, 4)}`;
  console.log(`Branch '${branch}' created from '${startBranch}' with the batch commit.`);
  console.log('\nTo open the batch PR (push rights + authenticated gh required):');
  console.log(`  git push -u origin ${branch}`);
  console.log(
    `  gh pr create --draft --title ${JSON.stringify(title)} --body-file ${reviewRelative}`,
  );
  console.log(
    '\nIf gh is unavailable, the branch and the review summary above are ready for a manual PR.',
  );
  console.log(`To come back: git checkout ${startBranch}`);
}

main().catch(fail);
