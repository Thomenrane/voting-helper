/**
 * Semantic preselection of candidate votes for one statement (#23).
 *
 * Zero network: the LLM is an injected fake (same seam as the position
 * extractor, #22). The tests lock the two safety properties inherited from
 * the #32 review: strict parsing (unknown ids, duplicates, malformed
 * directions are hard errors) and completeness (every submitted candidate
 * must be answered explicitly — silence never counts as a decision).
 */
import { describe, expect, it } from 'vitest';

import type { Statement } from '@voting-helper/data';

import type { LLMClient } from '../extraction/llm-client.ts';
import type { PlenaryVote } from '../votes/votes.types.ts';
import {
  buildLinkingPrompt,
  parseLinkingResponse,
  preselectVotesForStatement,
  rankCandidatesLexically,
  type EligibleVote,
} from './vote-preselection.ts';

const STATEMENT: Statement = {
  id: 's3',
  theme: 'mobilite',
  texte_fr: 'Supprimer la TVA sur les billets de train.',
  texte_nl: 'De btw op treintickets afschaffen.',
  note_concrete_fr: 'TVA à 0 % sur le transport ferroviaire de voyageurs.',
  note_concrete_nl: '0% btw op personenvervoer per spoor.',
};

function eligibleVote(id: string, titleFr: string, titleNl = ''): EligibleVote {
  const vote: PlenaryVote = {
    id,
    legislature: '56',
    meeting_id: '10',
    vote_number: id,
    date: '2025-03-15',
    title_fr: titleFr,
    title_nl: titleNl,
    dossier: { id: '228', title: titleFr, document_type: 'WETSONTWERP', status: null },
    document_id: null,
    motion_id: null,
    counts: { oui: 1, non: 0, abstention: 0 },
    ballots: [],
    groups: [],
    warnings: [],
  };
  return { vote, kind: 'vote_final' };
}

describe('rankCandidatesLexically', () => {
  const train = eligibleVote('v1', 'Projet de loi supprimant la TVA sur les billets de train');
  const pensions = eligibleVote('v2', 'Projet de loi portant réforme des pensions');
  const rail = eligibleVote('v3', 'Wetsontwerp btw personenvervoer', 'Wetsontwerp btw personenvervoer per spoor');

  it('ranks title-overlapping votes above unrelated ones and drops zero-overlap votes', () => {
    const ranked = rankCandidatesLexically(STATEMENT, [pensions, train, rail], 10);
    expect(ranked.map((c) => c.vote.id)).toEqual(['v1', 'v3']);
  });

  it('caps the candidate list at maxCandidates', () => {
    const ranked = rankCandidatesLexically(STATEMENT, [train, rail], 1);
    expect(ranked).toHaveLength(1);
  });
});

describe('parseLinkingResponse', () => {
  const candidates = [eligibleVote('v1', 'TVA train'), eligibleVote('v2', 'TVA rail')];

  it('parses retained and set-aside decisions', () => {
    const text = JSON.stringify([
      { vote_id: 'v1', retenu: true, direction_dossier: 'soutient', motif: 'Vote final sur la mesure.' },
      { vote_id: 'v2', retenu: false, direction_dossier: null, motif: 'Dossier connexe mais pas la mesure.' },
    ]);
    const parsed = parseLinkingResponse(text, candidates);
    expect(parsed).toEqual([
      { vote_id: 'v1', retenu: true, direction_dossier: 'soutient', motif: 'Vote final sur la mesure.' },
      { vote_id: 'v2', retenu: false, direction_dossier: null, motif: 'Dossier connexe mais pas la mesure.' },
    ]);
  });

  it('accepts fenced JSON and the contredit direction', () => {
    const text =
      '```json\n' +
      JSON.stringify([
        { vote_id: 'v1', retenu: true, direction_dossier: 'contredit', motif: 'Le dossier rétablit la TVA.' },
        { vote_id: 'v2', retenu: false, direction_dossier: null, motif: 'Hors sujet.' },
      ]) +
      '\n```';
    expect(parseLinkingResponse(text, candidates)[0]?.direction_dossier).toBe('contredit');
  });

  it('rejects an unknown vote id', () => {
    const text = JSON.stringify([
      { vote_id: 'v9', retenu: false, direction_dossier: null, motif: 'x' },
      { vote_id: 'v1', retenu: false, direction_dossier: null, motif: 'x' },
      { vote_id: 'v2', retenu: false, direction_dossier: null, motif: 'x' },
    ]);
    expect(() => parseLinkingResponse(text, candidates)).toThrow(/unknown vote 'v9'/);
  });

  it('rejects an incomplete answer — every candidate must be decided explicitly', () => {
    const text = JSON.stringify([
      { vote_id: 'v1', retenu: true, direction_dossier: 'soutient', motif: 'ok' },
    ]);
    expect(() => parseLinkingResponse(text, candidates)).toThrow(/incomplete.*v2/s);
  });

  it('rejects a duplicate decision for the same vote', () => {
    const text = JSON.stringify([
      { vote_id: 'v1', retenu: false, direction_dossier: null, motif: 'x' },
      { vote_id: 'v1', retenu: false, direction_dossier: null, motif: 'y' },
      { vote_id: 'v2', retenu: false, direction_dossier: null, motif: 'z' },
    ]);
    expect(() => parseLinkingResponse(text, candidates)).toThrow(/duplicate/);
  });

  it('rejects a retained vote without direction, and a direction without retention', () => {
    const noDirection = JSON.stringify([
      { vote_id: 'v1', retenu: true, direction_dossier: null, motif: 'ok' },
      { vote_id: 'v2', retenu: false, direction_dossier: null, motif: 'x' },
    ]);
    expect(() => parseLinkingResponse(noDirection, candidates)).toThrow(/direction/);
    const strayDirection = JSON.stringify([
      { vote_id: 'v1', retenu: false, direction_dossier: 'soutient', motif: 'x' },
      { vote_id: 'v2', retenu: false, direction_dossier: null, motif: 'x' },
    ]);
    expect(() => parseLinkingResponse(strayDirection, candidates)).toThrow(/direction/);
  });

  it('rejects an empty motif — every decision must be justified', () => {
    const text = JSON.stringify([
      { vote_id: 'v1', retenu: true, direction_dossier: 'soutient', motif: '  ' },
      { vote_id: 'v2', retenu: false, direction_dossier: null, motif: 'x' },
    ]);
    expect(() => parseLinkingResponse(text, candidates)).toThrow(/motif/);
  });
});

describe('preselectVotesForStatement — injected fake client, zero network', () => {
  const train = eligibleVote('v1', 'Projet de loi supprimant la TVA sur les billets de train');
  const rail = eligibleVote(
    'v3',
    'Projet de loi rétablissant la TVA sur le transport ferroviaire (train)',
  );

  function fakeClient(answer: unknown): LLMClient {
    return {
      model: 'fake-model',
      complete: async () => ({
        text: JSON.stringify(answer),
        usage: { input_tokens: 100, output_tokens: 50 },
      }),
    };
  }

  it('returns retained links with direction and justification, and set-aside reasons', async () => {
    const client = fakeClient([
      { vote_id: 'v1', retenu: true, direction_dossier: 'soutient', motif: 'Vote final sur la suppression de la TVA train.' },
      { vote_id: 'v3', retenu: false, direction_dossier: null, motif: 'Dossier inverse examiné séparément.' },
    ]);
    const result = await preselectVotesForStatement({
      statement: STATEMENT,
      candidates: [train, rail],
      client,
    });
    expect(result.retained).toEqual([
      {
        vote: train.vote,
        kind: 'vote_final',
        direction_dossier: 'soutient',
        justification: 'Vote final sur la suppression de la TVA train.',
      },
    ]);
    expect(result.setAside).toEqual([
      { vote: rail.vote, kind: 'vote_final', motif: 'Dossier inverse examiné séparément.' },
    ]);
    expect(result.usage).toEqual({ input_tokens: 100, output_tokens: 50 });
  });

  it('sends the statement and every candidate to the model', async () => {
    let seen: string | undefined;
    const client: LLMClient = {
      model: 'fake-model',
      complete: async ({ user }) => {
        seen = user;
        return {
          text: JSON.stringify([
            { vote_id: 'v1', retenu: false, direction_dossier: null, motif: 'x' },
            { vote_id: 'v3', retenu: false, direction_dossier: null, motif: 'x' },
          ]),
          usage: { input_tokens: 1, output_tokens: 1 },
        };
      },
    };
    await preselectVotesForStatement({ statement: STATEMENT, candidates: [train, rail], client });
    expect(seen).toContain(STATEMENT.texte_fr);
    expect(seen).toContain('v1');
    expect(seen).toContain('v3');
    expect(seen).toContain('DOC 56 0228');
  });

  it('returns nothing (and never calls the model) when no candidate survives the prefilter', async () => {
    const client: LLMClient = {
      model: 'fake-model',
      complete: async () => {
        throw new Error('must not be called');
      },
    };
    const result = await preselectVotesForStatement({ statement: STATEMENT, candidates: [], client });
    expect(result.retained).toEqual([]);
    expect(result.setAside).toEqual([]);
    expect(result.usage).toEqual({ input_tokens: 0, output_tokens: 0 });
  });
});

describe('buildLinkingPrompt', () => {
  it('demands strict JSON with one decision per candidate', () => {
    const { system, user } = buildLinkingPrompt(STATEMENT, [
      eligibleVote('v1', 'TVA train'),
    ]);
    expect(system).toContain('JSON');
    expect(system).toContain('soutient');
    expect(system).toContain('contredit');
    expect(user).toContain('v1');
  });
});
