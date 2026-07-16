import { describe, expect, it } from 'vitest';

import { addUsage, computeRunCost, formatRunCost } from './cost.ts';

describe('computeRunCost', () => {
  it('prices claude-sonnet-5 at the published standard rates', () => {
    const cost = computeRunCost(
      { input_tokens: 1_000_000, output_tokens: 100_000 },
      'claude-sonnet-5',
      0.9,
    );
    expect(cost.usd).toBeCloseTo(3 + 1.5, 10);
    expect(cost.eur).toBeCloseTo(4.5 * 0.9, 10);
  });

  it('reports tokens without price for an unknown model', () => {
    const cost = computeRunCost({ input_tokens: 10, output_tokens: 5 }, 'mystery-model');
    expect(cost).toEqual({ input_tokens: 10, output_tokens: 5 });
    expect(formatRunCost(cost, 'mystery-model')).toContain('tarif inconnu');
  });

  it('formats a priced run with both currencies', () => {
    const line = formatRunCost(
      computeRunCost({ input_tokens: 500_000, output_tokens: 0 }, 'claude-sonnet-5', 0.9),
      'claude-sonnet-5',
    );
    expect(line).toContain('$1.5000');
    expect(line).toContain('1.3500 €');
  });
});

describe('addUsage', () => {
  it('accumulates both directions', () => {
    expect(
      addUsage({ input_tokens: 1, output_tokens: 2 }, { input_tokens: 10, output_tokens: 20 }),
    ).toEqual({ input_tokens: 11, output_tokens: 22 });
  });
});
