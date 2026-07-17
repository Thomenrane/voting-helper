/**
 * Run-cost accounting, displayed at the end of every extraction run
 * (acceptance criterion of #22).
 *
 * USD prices are the published per-MTok rates; EUR is an approximation via a
 * fixed default rate overridable with the USD_TO_EUR env var — the point is
 * an order of magnitude for the maintainer, not accounting truth.
 */
import type { LLMUsage } from './llm-client.ts';

interface ModelPricing {
  /** USD per million input tokens. */
  inputUsdPerMTok: number;
  /** USD per million output tokens. */
  outputUsdPerMTok: number;
}

/**
 * Published standard rates (platform.claude.com pricing, 07/2026). Note:
 * claude-sonnet-5 has introductory pricing ($2/$10) through 31/08/2026 —
 * the standard rate is used here so estimates stay conservative.
 */
const MODEL_PRICING: Record<string, ModelPricing> = {
  'claude-sonnet-5': { inputUsdPerMTok: 3, outputUsdPerMTok: 15 },
  'claude-opus-4-8': { inputUsdPerMTok: 5, outputUsdPerMTok: 25 },
  'claude-haiku-4-5': { inputUsdPerMTok: 1, outputUsdPerMTok: 5 },
};

const DEFAULT_USD_TO_EUR = 0.86;

export interface RunCost {
  input_tokens: number;
  output_tokens: number;
  /** Undefined when the model has no known pricing — tokens still reported. */
  usd?: number;
  eur?: number;
}

export function addUsage(total: LLMUsage, usage: LLMUsage): LLMUsage {
  return {
    input_tokens: total.input_tokens + usage.input_tokens,
    output_tokens: total.output_tokens + usage.output_tokens,
  };
}

export function computeRunCost(
  usage: LLMUsage,
  model: string,
  usdToEur = readUsdToEurRate(),
): RunCost {
  const pricing = MODEL_PRICING[model];
  if (pricing === undefined) {
    return { ...usage };
  }
  const usd =
    (usage.input_tokens / 1_000_000) * pricing.inputUsdPerMTok +
    (usage.output_tokens / 1_000_000) * pricing.outputUsdPerMTok;
  return { ...usage, usd, eur: usd * usdToEur };
}

export function formatRunCost(cost: RunCost, model: string): string {
  const tokens = `${cost.input_tokens} input + ${cost.output_tokens} output tokens`;
  if (cost.usd === undefined || cost.eur === undefined) {
    return `Coût du run (${model}) : ${tokens} — tarif inconnu pour ce modèle.`;
  }
  return (
    `Coût du run (${model}) : ${tokens} = $${cost.usd.toFixed(4)} ≈ ${cost.eur.toFixed(4)} €` +
    ` (taux ${(cost.eur / cost.usd || 0).toFixed(2)} USD→EUR, approximatif)`
  );
}

function readUsdToEurRate(): number {
  const raw = process.env['USD_TO_EUR'];
  if (raw === undefined || raw === '') {
    return DEFAULT_USD_TO_EUR;
  }
  const rate = Number(raw);
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error(`USD_TO_EUR must be a positive number, got '${raw}'.`);
  }
  return rate;
}
