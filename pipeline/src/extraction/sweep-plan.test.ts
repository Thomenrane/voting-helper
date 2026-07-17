import { describe, expect, it } from 'vitest';

import type { Statement } from '@voting-helper/data';

import type { LayerInput } from './position-extractor.ts';
import { CHARS_PER_TOKEN_ESTIMATE, formatSweepPlan, planSweep } from './sweep-plan.ts';
import type { ProgrammeTextLayer } from './text-layer.ts';

const STATEMENTS: Statement[] = [
  {
    id: 's1',
    theme: 'fiscalite',
    texte_fr: 'Réduire les cotisations sociales sur les bas salaires.',
    texte_nl: 'De sociale bijdragen op lage lonen verlagen.',
    note_concrete_fr: 'Réduction ciblée.',
    note_concrete_nl: 'Gerichte verlaging.',
  },
  {
    id: 's2',
    theme: 'mobilite',
    texte_fr: 'Supprimer la TVA sur les billets de train.',
    texte_nl: 'De btw op treintickets afschaffen.',
    note_concrete_fr: 'TVA à 0 %.',
    note_concrete_nl: '0% btw.',
  },
];

function layerInput(pageCount: number, charsPerPage: number): LayerInput {
  const layer: ProgrammeTextLayer = {
    source_id: 'doc',
    source_sha256: 'sha',
    extractor: 'unpdf',
    page_count: pageCount,
    pages: Array.from({ length: pageCount }, (_, i) => ({
      page: i + 1,
      text: 'x'.repeat(charsPerPage),
    })),
  };
  return { layer, raw_snapshot_id: 'doc@x', url_source: 'https://example.org/doc.pdf' };
}

describe('planSweep', () => {
  it('counts one grouped LLM call per bounded chunk', () => {
    const plan = planSweep({
      partyName: 'Demo',
      statements: STATEMENTS,
      layers: [layerInput(10, 2000)], // ~20k chars → 2 pages/chunk → 5 chunks
      model: 'claude-sonnet-5',
      maxChunkChars: 6000,
    });
    expect(plan.chunk_count).toBe(5);
    expect(plan.llm_call_count).toBe(plan.chunk_count);
    expect(plan.total_chunk_chars).toBeGreaterThanOrEqual(20_000);
  });

  it('estimates input tokens above the raw chunk chars (prompt + statements overhead)', () => {
    const plan = planSweep({
      partyName: 'Demo',
      statements: STATEMENTS,
      layers: [layerInput(4, 3000)],
      model: 'claude-sonnet-5',
      maxChunkChars: 6000,
    });
    const rawChunkTokens = Math.ceil(plan.total_chunk_chars / CHARS_PER_TOKEN_ESTIMATE);
    // The re-sent statement list + system prompt push the estimate above the
    // bare programme-chars tokens — the amortised cost the ticket accepts.
    expect(plan.estimated_input_tokens).toBeGreaterThan(rawChunkTokens);
    expect(plan.estimated_output_tokens).toBe(plan.chunk_count * STATEMENTS.length * 40);
  });

  it('prices a known model and formats a human plan', () => {
    const plan = planSweep({
      partyName: 'Demo',
      statements: STATEMENTS,
      layers: [layerInput(4, 3000)],
      model: 'claude-sonnet-5',
      maxChunkChars: 6000,
    });
    expect(plan.cost.usd).toBeGreaterThan(0);
    const text = formatSweepPlan(plan, STATEMENTS.length, 'claude-sonnet-5');
    expect(text).toContain('appel(s) LLM');
    expect(text).toContain('énoncés groupés par appel');
    expect(text).toMatch(/\$\d/);
  });

  it('reports tokens without a price for an unknown model', () => {
    const plan = planSweep({
      partyName: 'Demo',
      statements: STATEMENTS,
      layers: [layerInput(2, 3000)],
      model: 'mystery-model',
    });
    expect(plan.cost.usd).toBeUndefined();
    expect(formatSweepPlan(plan, STATEMENTS.length, 'mystery-model')).toContain('tarif inconnu');
  });
});
