import { describe, expect, it } from 'vitest';

import type { PartyPosition } from '@voting-helper/data';

import type { PositionCandidate, StatementOutcome } from './position-extractor.ts';
import { parsePositionsYaml, renderPositionsYaml, toPartyPositions } from './positions-yaml.ts';

const CANDIDATE: PositionCandidate = {
  statement_id: 's1',
  position: 2,
  citation_texte: 'Nous réduirons les cotisations.',
  citation_page: 12,
  source_id: 'demo-doc',
  raw_snapshot_id: 'demo-doc@20260716T000000000Z',
  url_source: 'https://example.org/demo.pdf',
  verdict: { status: 'verified', page: 12, spans_next_page: false },
};

const OUTCOMES: StatementOutcome[] = [
  { kind: 'position', statement_id: 's1', position: 2, citation: CANDIDATE },
  {
    kind: 'rejected',
    statement_id: 's2',
    candidates: [
      { ...CANDIDATE, statement_id: 's2', position: -1, verdict: { status: 'not_found' } },
    ],
  },
  { kind: 'no_position', statement_id: 's3' },
  {
    kind: 'conflict',
    statement_id: 's4',
    candidates: [CANDIDATE, { ...CANDIDATE, position: -2 }],
  },
];

describe('toPartyPositions', () => {
  const positions = toPartyPositions('demo', OUTCOMES, '2026-07-16');

  it('proposes verified positions as en_attente with full citation provenance', () => {
    expect(positions[0]).toEqual({
      party_id: 'demo',
      statement_id: 's1',
      position: 2,
      citation: {
        texte: 'Nous réduirons les cotisations.',
        url_source: 'https://example.org/demo.pdf',
        ref_snapshot: 'demo-doc@20260716T000000000Z',
        page: 12,
      },
      votes_lies: [],
      statut: 'en_attente',
      derniere_revision: '2026-07-16',
    });
  });

  it('writes unverified citations as explicit rejete records', () => {
    expect(positions[1]).toMatchObject({ statement_id: 's2', statut: 'rejete', position: -1 });
  });

  it('records documented silence without position nor citation', () => {
    expect(positions[2]).toMatchObject({ statement_id: 's3', statut: 'en_attente' });
    expect(positions[2]).not.toHaveProperty('position');
    expect(positions[2]).not.toHaveProperty('citation');
  });

  it('produces no record for conflicts — human arbitration first', () => {
    expect(positions.map((p) => p.statement_id)).toEqual(['s1', 's2', 's3']);
  });
});

describe('renderPositionsYaml / parsePositionsYaml round-trip', () => {
  it('round-trips through YAML and validates against the shared schema', () => {
    const positions = toPartyPositions('demo', OUTCOMES, '2026-07-16');
    const yamlText = renderPositionsYaml(positions, 'Généré par extract:positions\nNe pas éditer à la main.');
    expect(yamlText.startsWith('# Généré par extract:positions\n# Ne pas éditer à la main.')).toBe(
      true,
    );
    expect(parsePositionsYaml(yamlText, 'demo.yaml')).toEqual(positions);
  });

  it('rejects a record whose position lacks its citation (joint optionality)', () => {
    const broken = `positions:\n  - party_id: demo\n    statement_id: s1\n    position: 2\n    votes_lies: []\n    statut: en_attente\n    derniere_revision: "2026-07-16"\n`;
    expect(() => parsePositionsYaml(broken, 'x.yaml')).toThrow(/jointly optional/);
  });

  it('rejects an unknown statut and an out-of-scale position', () => {
    const badStatut = `positions:\n  - party_id: demo\n    statement_id: s1\n    votes_lies: []\n    statut: publie\n    derniere_revision: "2026-07-16"\n`;
    expect(() => parsePositionsYaml(badStatut, 'x.yaml')).toThrow(/invalid statut 'publie'/);
    const badScale = `positions:\n  - party_id: demo\n    statement_id: s1\n    position: 5\n    citation: {texte: t, url_source: u, ref_snapshot: r, page: 1}\n    votes_lies: []\n    statut: en_attente\n    derniere_revision: "2026-07-16"\n`;
    expect(() => parsePositionsYaml(badScale, 'x.yaml')).toThrow(/out-of-scale/);
  });

  it('round-trips a record carrying linked votes (extended m3 schema)', () => {
    const withVotes: PartyPosition[] = [
      {
        party_id: 'demo',
        statement_id: 's1',
        votes_lies: [
          {
            id: '56-m10-v3',
            date: '2025-03-15',
            dossier: 'DOC 56 0228',
            vote_groupe: 'oui',
            direction_dossier: 'contredit',
            justification: 'Vote final sur le dossier qui contredit la mesure.',
          },
        ],
        statut: 'en_attente',
        derniere_revision: '2026-07-17',
      },
    ];
    const reloaded = parsePositionsYaml(renderPositionsYaml(withVotes, 'h'), 'demo.yaml');
    expect(reloaded).toEqual(withVotes);
  });

  it('rejects a linked vote with an invalid raw group vote or direction', () => {
    const vote = (voteGroupe: string, direction: string): string =>
      `positions:\n  - party_id: demo\n    statement_id: s1\n    votes_lies:\n      - id: v1\n        date: "2025-03-15"\n        dossier: DOC 56 0228\n        vote_groupe: ${voteGroupe}\n        direction_dossier: ${direction}\n        justification: j\n    statut: en_attente\n    derniere_revision: "2026-07-16"\n`;
    expect(() => parsePositionsYaml(vote('pour', 'soutient'), 'x.yaml')).toThrow(
      /invalid vote_groupe 'pour'/,
    );
    expect(() => parsePositionsYaml(vote('oui', 'inverse'), 'x.yaml')).toThrow(
      /invalid direction_dossier 'inverse'/,
    );
  });

  it('round-trips the votes_ecartes reviewer memory and rejects malformed ones', () => {
    const withEcartes: PartyPosition[] = [
      {
        party_id: 'demo',
        statement_id: 's1',
        votes_lies: [],
        votes_ecartes: ['56-m10-v3'],
        statut: 'valide',
        derniere_revision: '2026-07-17',
      },
    ];
    expect(parsePositionsYaml(renderPositionsYaml(withEcartes, 'h'), 'demo.yaml')).toEqual(
      withEcartes,
    );
    const bad = `positions:\n  - party_id: demo\n    statement_id: s1\n    votes_lies: []\n    votes_ecartes: [""]\n    statut: valide\n    derniere_revision: "2026-07-16"\n`;
    expect(() => parsePositionsYaml(bad, 'x.yaml')).toThrow(/votes_ecartes/);
  });

  it('rejects a linked vote missing its justification or date', () => {
    const noJustification = `positions:\n  - party_id: demo\n    statement_id: s1\n    votes_lies:\n      - id: v1\n        date: "2025-03-15"\n        dossier: DOC 56 0228\n        vote_groupe: oui\n        direction_dossier: soutient\n        justification: ""\n    statut: en_attente\n    derniere_revision: "2026-07-16"\n`;
    expect(() => parsePositionsYaml(noJustification, 'x.yaml')).toThrow(/justification/);
    const badDate = `positions:\n  - party_id: demo\n    statement_id: s1\n    votes_lies:\n      - id: v1\n        date: 15/03/2025\n        dossier: DOC 56 0228\n        vote_groupe: oui\n        direction_dossier: soutient\n        justification: j\n    statut: en_attente\n    derniere_revision: "2026-07-16"\n`;
    expect(() => parsePositionsYaml(badDate, 'x.yaml')).toThrow(/invalid date/);
  });

  it('keeps the YAML loadable as plain PartyPosition[] for the site', () => {
    const positions = toPartyPositions('demo', OUTCOMES, '2026-07-16');
    const reloaded: PartyPosition[] = parsePositionsYaml(
      renderPositionsYaml(positions, 'h'),
      'demo.yaml',
    );
    expect(reloaded.filter((p) => p.statut === 'en_attente')).toHaveLength(2);
  });
});
