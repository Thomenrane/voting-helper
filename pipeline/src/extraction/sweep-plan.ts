/**
 * Sweep planning for `extract:positions --dry-run` (#39).
 *
 * Pure and keyless: given the party's text layers and the statements, it
 * computes exactly what a real run would send — the number of bounded chunks
 * (one grouped LLM call each, all statements per call), the chars swept, and
 * a token/cost estimate — without calling the model. The estimate builds the
 * REAL prompt for each chunk (statements re-sent per chunk, the amortised
 * cost the ticket accepts) and converts chars to tokens with a documented
 * heuristic, so the maintainer sees the order of magnitude before spending.
 */
import type { Statement } from '@voting-helper/data';

import { computeRunCost, type RunCost } from './cost.ts';
import {
  buildExtractionPrompt,
  chunkLayer,
  DEFAULT_CHUNK_CHARS,
  type LayerInput,
} from './position-extractor.ts';

/** Rough FR/NL chars-per-token heuristic — order of magnitude, not truth. */
export const CHARS_PER_TOKEN_ESTIMATE = 3.5;

/**
 * Conservative output-token allowance per statement per call. Most answers
 * are `position: null` (a silence), but a run is dominated by input; this
 * upper-ish constant keeps the cost estimate from under-shooting.
 */
export const EST_OUTPUT_TOKENS_PER_STATEMENT = 40;

export interface SweepPlan {
  /** Bounded chunks the sweep examines — one grouped LLM call each. */
  chunk_count: number;
  /** LLM calls the run makes — equal to chunk_count (statements are grouped). */
  llm_call_count: number;
  /** Programme characters swept across all chunks. */
  total_chunk_chars: number;
  /** Estimated input tokens (prompts incl. re-sent statement list). */
  estimated_input_tokens: number;
  /** Estimated output tokens (one decision per statement per call). */
  estimated_output_tokens: number;
  /** Estimated run cost for `model` (undefined USD when model unpriced). */
  cost: RunCost;
}

export interface PlanSweepOptions {
  partyName: string;
  statements: readonly Statement[];
  layers: readonly LayerInput[];
  model: string;
  maxChunkChars?: number;
}

function tokensFromChars(chars: number): number {
  return Math.ceil(chars / CHARS_PER_TOKEN_ESTIMATE);
}

export function planSweep(options: PlanSweepOptions): SweepPlan {
  const { partyName, statements, layers, model, maxChunkChars = DEFAULT_CHUNK_CHARS } = options;
  const chunks = layers.flatMap((input) => chunkLayer(input, maxChunkChars));
  let totalChunkChars = 0;
  let estimatedInputTokens = 0;
  for (const chunk of chunks) {
    totalChunkChars += chunk.text.length;
    const { system, user } = buildExtractionPrompt(partyName, statements, chunk);
    estimatedInputTokens += tokensFromChars(system.length + user.length);
  }
  const estimatedOutputTokens = chunks.length * statements.length * EST_OUTPUT_TOKENS_PER_STATEMENT;
  const cost = computeRunCost(
    { input_tokens: estimatedInputTokens, output_tokens: estimatedOutputTokens },
    model,
  );
  return {
    chunk_count: chunks.length,
    llm_call_count: chunks.length,
    total_chunk_chars: totalChunkChars,
    estimated_input_tokens: estimatedInputTokens,
    estimated_output_tokens: estimatedOutputTokens,
    cost,
  };
}

export function formatSweepPlan(
  plan: SweepPlan,
  statementCount: number,
  model: string,
): string {
  const usd =
    plan.cost.usd === undefined
      ? `tarif inconnu pour ${model}`
      : `≈ $${plan.cost.usd.toFixed(2)}` +
        (plan.cost.eur === undefined ? '' : ` ≈ ${plan.cost.eur.toFixed(2)} €`);
  return [
    `Plan de balayage (dry-run, ${model}) :`,
    `  ${plan.chunk_count} chunk(s) bornés = ${plan.llm_call_count} appel(s) LLM ` +
      `(${statementCount} énoncés groupés par appel).`,
    `  ${plan.total_chunk_chars} chars de programme balayés.`,
    `  Estimation : ${plan.estimated_input_tokens} input + ${plan.estimated_output_tokens} ` +
      `output tokens ${usd} (heuristique ${CHARS_PER_TOKEN_ESTIMATE} chars/token, approximatif).`,
  ].join('\n');
}
