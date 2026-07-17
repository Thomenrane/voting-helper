/**
 * `npm run positions:pr -- --party <id>` — batch PR for one party's
 * extracted positions (#22).
 * `npm run positions:pr -- --votes` — batch PR for a vote-linking run (#23):
 * commits every updated positions proposal plus the global review summary
 * (votes-liaison.review.md), which becomes the PR body.
 *
 * Both modes create a dated branch, commit the YAML proposals and the
 * human-readable review summary, and print the exact push/PR commands.
 *
 * Opening the PR itself needs push rights and an authenticated `gh` — when
 * they are not available in the environment, the branch and the review body
 * are ready for manual PR creation; the printed commands document the batch
 * flow (the human review of that PR IS the validation — spec #15).
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { getPartyProgramme } from '../sources/party-programmes.ts';
import { fail, resolveRepoRoot, VOTES_REVIEW_FILE } from './command-support.ts';

const PROPOSALS_DIR = 'data/positions/proposals';

function git(repoRoot: string, ...args: string[]): string {
  return execFileSync('git', ['-C', repoRoot, ...args], { encoding: 'utf8' }).trim();
}

interface Batch {
  branch: string;
  files: string[];
  commitMessage: string;
  title: string;
  bodyFile: string;
}

function partyBatch(repoRoot: string, partyId: string, stamp: string): Batch {
  const party = getPartyProgramme(partyId);
  const yamlRelative = `${PROPOSALS_DIR}/${party.party_id}.positions.yaml`;
  const reviewRelative = `${PROPOSALS_DIR}/${party.party_id}.review.md`;
  for (const relative of [yamlRelative, reviewRelative]) {
    if (!existsSync(join(repoRoot, relative))) {
      throw new Error(
        `'${relative}' is missing — run 'npm run extract:positions -- --party ${party.party_id}' first.`,
      );
    }
  }
  return {
    branch: `positions/${party.party_id}-${stamp}`,
    files: [yamlRelative, reviewRelative],
    commitMessage:
      `Positions ${party.name} — lot d'extraction (statut en_attente)\n\n` +
      `Propositions générées par extract:positions, citations vérifiées\n` +
      `mécaniquement contre la couche texte dérivée. La review humaine de\n` +
      `cette PR est la validation (#22).`,
    title: `Positions ${party.name} — lot d'extraction du ${stamp.slice(6)}/${stamp.slice(4, 6)}/${stamp.slice(0, 4)}`,
    bodyFile: reviewRelative,
  };
}

function votesBatch(repoRoot: string, stamp: string): Batch {
  const reviewRelative = `${PROPOSALS_DIR}/${VOTES_REVIEW_FILE}`;
  if (!existsSync(join(repoRoot, reviewRelative))) {
    throw new Error(`'${reviewRelative}' is missing — run 'npm run link:votes' first.`);
  }
  const yamlFiles = readdirSync(join(repoRoot, PROPOSALS_DIR))
    .filter((file) => file.endsWith('.positions.yaml'))
    .sort()
    .map((file) => `${PROPOSALS_DIR}/${file}`);
  if (yamlFiles.length === 0) {
    throw new Error(`No positions proposals found in ${PROPOSALS_DIR} — run 'npm run link:votes' first.`);
  }
  return {
    branch: `votes/liaison-${stamp}`,
    files: [...yamlFiles, reviewRelative],
    commitMessage:
      `Liaison des votes aux énoncés — lot de review (statut en_attente)\n\n` +
      `Liens proposés par link:votes selon les critères publiés\n` +
      `(docs/methodologie/criteres-liaison-votes.md) : vote brut du groupe,\n` +
      `direction du dossier, position dérivée. La review humaine de cette PR\n` +
      `est la validation (#23).`,
    title: `Liaison des votes — lot du ${stamp.slice(6)}/${stamp.slice(4, 6)}/${stamp.slice(0, 4)}`,
    bodyFile: reviewRelative,
  };
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: { party: { type: 'string' }, votes: { type: 'boolean', default: false } },
  });
  if (values.votes === (values.party !== undefined)) {
    throw new Error(
      'Pass exactly one mode: --party <id> (extraction batch) or --votes (vote-linking batch).',
    );
  }

  const repoRoot = resolveRepoRoot();
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const batch = values.votes ? votesBatch(repoRoot, stamp) : partyBatch(repoRoot, values.party as string, stamp);
  const startBranch = git(repoRoot, 'rev-parse', '--abbrev-ref', 'HEAD');

  git(repoRoot, 'checkout', '-b', batch.branch);
  git(repoRoot, 'add', ...batch.files);
  git(repoRoot, 'commit', '-m', batch.commitMessage);

  console.log(`Branch '${batch.branch}' created from '${startBranch}' with the batch commit.`);
  console.log('\nTo open the batch PR (push rights + authenticated gh required):');
  console.log(`  git push -u origin ${batch.branch}`);
  console.log(
    `  gh pr create --draft --title ${JSON.stringify(batch.title)} --body-file ${batch.bodyFile}`,
  );
  console.log(
    '\nIf gh is unavailable, the branch and the review summary above are ready for a manual PR.',
  );
  console.log(`To come back: git checkout ${startBranch}`);
}

main().catch(fail);
