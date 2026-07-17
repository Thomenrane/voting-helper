import { describe, expect, it } from 'vitest';

import type { LLMClient, LLMRequest } from '../extraction/llm-client.ts';
import type { LayerChunk, LayerInput } from '../extraction/position-extractor.ts';
import type { PlenaryVote } from '../votes/votes.types.ts';
import {
  batchDossiers,
  buildProgrammePoolPrompt,
  buildVotePoolPrompt,
  dedupeVotedDossiers,
  generateProgrammePool,
  generateVotePool,
  parseProgrammePoolResponse,
  parseVotePoolResponse,
  type VotedDossier,
} from './candidate-pool.ts';

function layerInput(sourceId: string, pages: string[]): LayerInput {
  return {
    layer: {
      source_id: sourceId,
      source_sha256: 'abc123',
      extractor: 'unpdf',
      page_count: pages.length,
      pages: pages.map((text, index) => ({ page: index + 1, text })),
    },
    raw_snapshot_id: `${sourceId}-2026-07-01`,
    url_source: `https://example.org/${sourceId}.pdf`,
  };
}

function chunkOf(input: LayerInput): LayerChunk {
  return {
    input,
    firstPage: 1,
    lastPage: input.layer.page_count,
    text: input.layer.pages.map(({ page, text }) => `[PAGE ${page}]\n${text}`).join('\n'),
  };
}

function plenaryVote(id: string, dossierId: string, date: string, title: string): PlenaryVote {
  return {
    id,
    legislature: '56',
    meeting_id: 'm1',
    vote_number: '1',
    date,
    title_fr: `Vote sur ${title}`,
    title_nl: `Stemming over ${title}`,
    dossier: { id: dossierId, title, document_type: null, status: null },
    document_id: null,
    motion_id: null,
    counts: { oui: 0, non: 0, abstention: 0 },
    ballots: [],
    groups: [],
    warnings: [],
  };
}

function fakeClient(
  answers: readonly string[],
  requests: LLMRequest[] = [],
): LLMClient {
  let call = 0;
  return {
    model: 'fake-model',
    complete: (request) => {
      requests.push(request);
      const text = answers[call];
      call += 1;
      if (text === undefined) {
        throw new Error('fake client exhausted');
      }
      return Promise.resolve({ text, usage: { input_tokens: 100, output_tokens: 10 } });
    },
  };
}

const VALID_ITEM =
  '{"texte_fr": "Supprimer la TVA sur les billets de train.", ' +
  '"note_concrete_fr": "TVA à 0 % sur le rail voyageurs.", "theme": "mobilite", "page": 2}';

describe('buildProgrammePoolPrompt', () => {
  it('carries the canonical themes, the party and the chunk text', () => {
    const input = layerInput('ps-programme-2024', ['Texte page 1.', 'Texte page 2.']);
    const prompt = buildProgrammePoolPrompt('PS', chunkOf(input));
    expect(prompt.system).toContain('fiscalite');
    expect(prompt.system).toContain('defense-europe');
    expect(prompt.system).toContain('« PS »');
    expect(prompt.system).toContain('tableau vide []');
    expect(prompt.user).toContain('[PAGE 2]');
    expect(prompt.user).toContain("document 'ps-programme-2024'");
  });
});

describe('parseProgrammePoolResponse', () => {
  const chunk = chunkOf(layerInput('ps-programme-2024', ['p1', 'p2', 'p3']));

  it('accepts a valid answer, including a fenced one', () => {
    const items = parseProgrammePoolResponse(`\`\`\`json\n[${VALID_ITEM}]\n\`\`\``, chunk);
    expect(items).toEqual([
      {
        texte_fr: 'Supprimer la TVA sur les billets de train.',
        note_concrete_fr: 'TVA à 0 % sur le rail voyageurs.',
        theme: 'mobilite',
        page: 2,
      },
    ]);
  });

  it('accepts an empty array — a chunk may contain no usable measure', () => {
    expect(parseProgrammePoolResponse('[]', chunk)).toEqual([]);
  });

  it('rejects non-JSON and non-array answers', () => {
    expect(() => parseProgrammePoolResponse('Voici les mesures…', chunk)).toThrow(/not valid JSON/);
    expect(() => parseProgrammePoolResponse('{"a": 1}', chunk)).toThrow(/not an array/);
  });

  it('rejects an unknown theme', () => {
    const bad = VALID_ITEM.replace('"mobilite"', '"enseignement"');
    expect(() => parseProgrammePoolResponse(`[${bad}]`, chunk)).toThrow(/unknown theme 'enseignement'/);
  });

  it('rejects empty texte_fr and note_concrete_fr', () => {
    const noText = VALID_ITEM.replace('Supprimer la TVA sur les billets de train.', ' ');
    expect(() => parseProgrammePoolResponse(`[${noText}]`, chunk)).toThrow(/empty texte_fr/);
    const noNote = VALID_ITEM.replace('TVA à 0 % sur le rail voyageurs.', '');
    expect(() => parseProgrammePoolResponse(`[${noNote}]`, chunk)).toThrow(/empty note_concrete_fr/);
  });

  it('rejects a page outside the submitted chunk', () => {
    const outside = VALID_ITEM.replace('"page": 2', '"page": 7');
    expect(() => parseProgrammePoolResponse(`[${outside}]`, chunk)).toThrow(
      /page 7, outside the submitted chunk \(pages 1-3\)/,
    );
    const invalid = VALID_ITEM.replace('"page": 2', '"page": "deux"');
    expect(() => parseProgrammePoolResponse(`[${invalid}]`, chunk)).toThrow(/invalid page/);
  });
});

describe('generateProgrammePool', () => {
  it('mines every chunk and stamps full provenance on each candidate', async () => {
    const input = layerInput('ps-programme-2024', ['x'.repeat(30), 'y'.repeat(30)]);
    const requests: LLMRequest[] = [];
    // maxChunkChars forces two chunks → two answers.
    const client = fakeClient([`[${VALID_ITEM.replace('"page": 2', '"page": 1')}]`, '[]'], requests);
    const result = await generateProgrammePool({
      partyId: 'ps',
      partyName: 'PS',
      layers: [input],
      client,
      maxChunkChars: 40,
    });
    expect(requests).toHaveLength(2);
    expect(result.request_count).toBe(2);
    expect(result.usage).toEqual({ input_tokens: 200, output_tokens: 20 });
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toEqual({
      id: 'ps-c001',
      theme: 'mobilite',
      texte_fr: 'Supprimer la TVA sur les billets de train.',
      note_concrete_fr: 'TVA à 0 % sur le rail voyageurs.',
      sources: [
        {
          kind: 'programme',
          party_id: 'ps',
          source_id: 'ps-programme-2024',
          ref_snapshot: 'ps-programme-2024-2026-07-01',
          url_source: 'https://example.org/ps-programme-2024.pdf',
          page: 1,
        },
      ],
    });
  });
});

describe('dedupeVotedDossiers / batchDossiers', () => {
  it('keeps one representative vote per dossier — the earliest', () => {
    const votes = [
      plenaryVote('56-m2-v1', '228', '2025-03-01', 'Réforme des pensions'),
      plenaryVote('56-m1-v1', '228', '2025-01-15', 'Réforme des pensions'),
      plenaryVote('56-m3-v1', '412', '2025-05-01', 'Taxe kérosène'),
    ];
    const dossiers = dedupeVotedDossiers(votes);
    expect(dossiers).toHaveLength(2);
    expect(dossiers.map((d) => d.vote.id).sort()).toEqual(['56-m1-v1', '56-m3-v1']);
    expect(dossiers[0]?.dossier_ref).toBe('DOC 56 0228');
  });

  it('refuses a vote without dossier — eligibility must filter upstream', () => {
    const vote = { ...plenaryVote('56-m1-v9', '1', '2025-01-01', 'x'), dossier: null };
    expect(() => dedupeVotedDossiers([vote])).toThrow(/has no dossier/);
  });

  it('batches dossiers deterministically and rejects invalid sizes', () => {
    const dossiers = dedupeVotedDossiers([
      plenaryVote('56-m1-v1', '1', '2025-01-01', 'a'),
      plenaryVote('56-m1-v2', '2', '2025-01-01', 'b'),
      plenaryVote('56-m1-v3', '3', '2025-01-01', 'c'),
    ]);
    expect(batchDossiers(dossiers, 2).map((b) => b.length)).toEqual([2, 1]);
    expect(() => batchDossiers(dossiers, 0)).toThrow(/positive integer/);
  });
});

describe('vote pool prompt and parsing', () => {
  const batch: VotedDossier[] = dedupeVotedDossiers([
    plenaryVote('56-m1-v1', '228', '2025-01-15', 'Relèvement de l’âge légal de la pension'),
    plenaryVote('56-m2-v4', '412', '2025-03-02', 'Taxe sur le kérosène'),
  ]);

  it('lists every dossier with its DOC reference in the prompt', () => {
    const prompt = buildVotePoolPrompt(batch);
    expect(prompt.user).toContain('56-m1-v1');
    expect(prompt.user).toContain('DOC 56 0412');
    expect(prompt.system).toContain('exactement une fois');
  });

  it('accepts a complete answer mixing candidates and explicit nulls', () => {
    const answer =
      '[{"vote_id": "56-m1-v1", "candidat": {"texte_fr": "Relever l’âge légal de la pension à 67 ans.", ' +
      '"note_concrete_fr": "Âge légal porté à 67 ans en 2030.", "theme": "pensions-secu"}}, ' +
      '{"vote_id": "56-m2-v4", "candidat": null}]';
    const items = parseVotePoolResponse(answer, batch);
    expect(items).toHaveLength(2);
    expect(items[0]?.candidat?.theme).toBe('pensions-secu');
    expect(items[1]).toEqual({ vote_id: '56-m2-v4', candidat: null });
  });

  it('rejects an incomplete answer — silence is not a decision', () => {
    const answer = '[{"vote_id": "56-m1-v1", "candidat": null}]';
    expect(() => parseVotePoolResponse(answer, batch)).toThrow(
      /incomplete: missing decision\(s\) for 56-m2-v4/,
    );
  });

  it('rejects unknown and duplicated vote ids', () => {
    expect(() =>
      parseVotePoolResponse('[{"vote_id": "56-m9-v9", "candidat": null}]', batch),
    ).toThrow(/unknown vote '56-m9-v9'/);
    const duplicated =
      '[{"vote_id": "56-m1-v1", "candidat": null}, {"vote_id": "56-m1-v1", "candidat": null}]';
    expect(() => parseVotePoolResponse(duplicated, batch)).toThrow(/duplicate decision/);
  });

  it('rejects a candidate with an unknown theme', () => {
    const answer =
      '[{"vote_id": "56-m1-v1", "candidat": {"texte_fr": "x", "note_concrete_fr": "y", ' +
      '"theme": "enseignement"}}, {"vote_id": "56-m2-v4", "candidat": null}]';
    expect(() => parseVotePoolResponse(answer, batch)).toThrow(/unknown theme/);
  });
});

describe('generateVotePool', () => {
  it('harvests candidates across batches with vote provenance', async () => {
    const dossiers = dedupeVotedDossiers([
      plenaryVote('56-m1-v1', '228', '2025-01-15', 'Relèvement de l’âge légal de la pension'),
      plenaryVote('56-m2-v4', '412', '2025-03-02', 'Taxe sur le kérosène'),
    ]);
    const answers = [
      '[{"vote_id": "56-m1-v1", "candidat": {"texte_fr": "Relever l’âge légal de la pension à 67 ans.", ' +
        '"note_concrete_fr": "Âge légal porté à 67 ans en 2030.", "theme": "pensions-secu"}}]',
      '[{"vote_id": "56-m2-v4", "candidat": null}]',
    ];
    const result = await generateVotePool({
      dossiers,
      client: fakeClient(answers),
      batchSize: 1,
    });
    expect(result.request_count).toBe(2);
    expect(result.candidates).toEqual([
      {
        id: 'votes-c001',
        theme: 'pensions-secu',
        texte_fr: 'Relever l’âge légal de la pension à 67 ans.',
        note_concrete_fr: 'Âge légal porté à 67 ans en 2030.',
        sources: [
          { kind: 'vote', vote_id: '56-m1-v1', dossier: 'DOC 56 0228', date: '2025-01-15' },
        ],
      },
    ]);
  });
});
