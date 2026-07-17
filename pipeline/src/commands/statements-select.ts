/**
 * `npm run statements:select`
 *
 * Ranks the candidate pool by discriminance and flags theme-coverage gaps
 * (#24). No LLM, no API key, no network: it reads every
 * data/statements/pool/*.candidates.yaml (including hand-coded `positions`
 * maps from the HITL session), computes the published discriminance measure
 * live, and writes the selection report:
 *   data/statements/pool/selection.report.md
 *
 * The report is decision SUPPORT for the human selection session — the 35
 * statements are chosen and rewritten by a human following
 * docs/methodologie/guide-redaction-enonces.md.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { PARTY_PROGRAMMES } from '../sources/party-programmes.ts';
import type { CandidateStatement } from '../statements/candidate-pool.ts';
import { parsePoolYaml } from '../statements/pool-yaml.ts';
import {
  assessPoolCoverage,
  rankCandidates,
  renderSelectionReport,
} from '../statements/selection.ts';
import { fail, resolveRepoRoot, STATEMENTS_POOL_DIR } from './command-support.ts';

const REPORT_FILE = 'selection.report.md';

async function main(): Promise<void> {
  const repoRoot = resolveRepoRoot();
  const poolDir = join(repoRoot, STATEMENTS_POOL_DIR);
  let fileNames: string[];
  try {
    fileNames = (await readdir(poolDir)).filter((name) => name.endsWith('.candidates.yaml')).sort();
  } catch {
    fileNames = [];
  }
  if (fileNames.length === 0) {
    throw new Error(
      `No pool file found in ${STATEMENTS_POOL_DIR}/. ` +
        `Run 'npm run statements:pool -- --party <id>' and/or '--votes' first.`,
    );
  }

  const knownPartyIds = new Set(PARTY_PROGRAMMES.map((party) => party.party_id));
  const poolFiles: string[] = [];
  const candidates: CandidateStatement[] = [];
  for (const name of fileNames) {
    const relative = `${STATEMENTS_POOL_DIR}/${name}`;
    const parsed = parsePoolYaml(await readFile(join(poolDir, name), 'utf8'), relative, knownPartyIds);
    poolFiles.push(relative);
    candidates.push(...parsed);
    console.log(`  ${relative}: ${parsed.length} candidate(s)`);
  }

  const ranked = rankCandidates(candidates);
  const coverage = assessPoolCoverage(candidates);
  const iso = new Date().toISOString().slice(0, 10);
  const [year, month, day] = iso.split('-');
  const report = renderSelectionReport({
    runDate: `${day}/${month}/${year}`,
    poolFiles,
    ranked,
    coverage,
  });
  const reportRelative = `${STATEMENTS_POOL_DIR}/${REPORT_FILE}`;
  await writeFile(join(poolDir, REPORT_FILE), `${report}\n`);

  const coded = ranked.filter((entry) => entry.discriminance.score !== null).length;
  const gaps = coverage.filter((entry) => entry.status === 'gap');
  console.log(
    `\nDone: ${ranked.length} candidate(s) ranked (${coded} coded), ` +
      `${gaps.length} theme(s) below the selection minimum` +
      `${gaps.length > 0 ? ` (${gaps.map((entry) => entry.theme.id).join(', ')})` : ''}.`,
  );
  console.log(`  ${reportRelative}`);
  console.log(
    '\nNext: human selection session — see the « Session de sélection » section of ' +
      'docs/methodologie/guide-redaction-enonces.md.',
  );
}

main().catch(fail);
