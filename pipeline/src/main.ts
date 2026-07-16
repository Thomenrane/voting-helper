/**
 * Batch pipeline — skeleton only (tracer bullet #16).
 *
 * Planned stages (decisions of ticket #10):
 *   1. Snapshot each source document (programme PDFs, CRIV, FLWB).
 *   2. LLM extraction of positions per statement, with the exact citation
 *      mechanically verified against the snapshot.
 *   3. Preselection of candidate votes (Eurovoc themes + similarity).
 *   4. Open a batch PR — human review of the PR is the validation.
 *
 * The output of every stage conforms to the shared schema in
 * `@voting-helper/data` (PartyPosition), which is the pipeline↔site contract.
 */
import type { PartyPosition } from '@voting-helper/data';

function main(): void {
  const produced: PartyPosition[] = []; // No stages implemented yet.
  console.log(
    `voting-helper pipeline skeleton — 0 stages implemented, ${produced.length} positions produced.`,
  );
}

main();
