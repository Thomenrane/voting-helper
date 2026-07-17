import { describe, expect, it } from 'vitest';

import type { CandidateStatement } from './candidate-pool.ts';
import { parsePoolYaml, renderPoolYaml } from './pool-yaml.ts';

const PROGRAMME_CANDIDATE: CandidateStatement = {
  id: 'parti-alpha-c001',
  theme: 'mobilite',
  texte_fr: 'Instaurer la mesure fictive Alpha.',
  note_concrete_fr: 'Seuil fictif de démonstration.',
  sources: [
    {
      kind: 'programme',
      party_id: 'parti-alpha',
      source_id: 'parti-alpha-programme-fictif',
      ref_snapshot: 'parti-alpha-programme-fictif-2026-07-01',
      url_source: 'https://example.org/parti-alpha.pdf',
      page: 12,
    },
  ],
};

const VOTE_CANDIDATE: CandidateStatement = {
  id: 'votes-c001',
  theme: 'pensions-secu',
  texte_fr: 'Instaurer la mesure fictive Gamma.',
  note_concrete_fr: 'Échéance fictive de démonstration : 2030.',
  sources: [{ kind: 'vote', vote_id: '56-m1-v1', dossier: 'DOC 56 0228', date: '2025-01-15' }],
  positions: { 'parti-alpha': -2, 'parti-beta': 2 },
};

describe('pool YAML round-trip', () => {
  it('renders a commented header and parses back identical candidates', () => {
    const text = renderPoolYaml([PROGRAMME_CANDIDATE, VOTE_CANDIDATE], 'Pool candidats\nrun test');
    expect(text.startsWith('# Pool candidats\n# run test\n')).toBe(true);
    expect(parsePoolYaml(text, 'pool.yaml')).toEqual([PROGRAMME_CANDIDATE, VOTE_CANDIDATE]);
  });
});

describe('parsePoolYaml validation', () => {
  function mutate(change: (candidate: Record<string, unknown>) => void): string {
    const candidate = JSON.parse(JSON.stringify(VOTE_CANDIDATE)) as Record<string, unknown>;
    change(candidate);
    return renderPoolYaml([candidate as unknown as CandidateStatement], 'h');
  }

  it('rejects a file without candidates array', () => {
    expect(() => parsePoolYaml('positions: []', 'bad.yaml')).toThrow(/missing 'candidates' array/);
  });

  it('rejects a candidate with a non-canonical theme', () => {
    const text = mutate((c) => {
      c['theme'] = 'enseignement';
    });
    expect(() => parsePoolYaml(text, 'pool.yaml')).toThrow(/unknown theme 'enseignement'/);
  });

  it('rejects a candidate without sources — traceability is mandatory', () => {
    const text = mutate((c) => {
      c['sources'] = [];
    });
    expect(() => parsePoolYaml(text, 'pool.yaml')).toThrow(/no sources/);
  });

  it('rejects malformed sources per kind', () => {
    const missingPage = mutate((c) => {
      c['sources'] = [{ kind: 'programme', party_id: 'parti-alpha', source_id: 's', ref_snapshot: 'r', url_source: 'u' }];
    });
    expect(() => parsePoolYaml(missingPage, 'pool.yaml')).toThrow(/invalid page/);
    const badDate = mutate((c) => {
      c['sources'] = [{ kind: 'vote', vote_id: 'v', dossier: 'd', date: '15/01/2025' }];
    });
    expect(() => parsePoolYaml(badDate, 'pool.yaml')).toThrow(/invalid date/);
    const badKind = mutate((c) => {
      c['sources'] = [{ kind: 'tweet' }];
    });
    expect(() => parsePoolYaml(badKind, 'pool.yaml')).toThrow(/unknown source kind 'tweet'/);
  });

  it('rejects out-of-scale coded positions', () => {
    const text = mutate((c) => {
      c['positions'] = { 'parti-alpha': 3 };
    });
    expect(() => parsePoolYaml(text, 'pool.yaml')).toThrow(/out-of-scale position for 'parti-alpha': 3/);
  });

  it('validates positions keys against known parties when the registry is provided', () => {
    const text = renderPoolYaml([VOTE_CANDIDATE], 'h');
    const known = new Set(['parti-alpha', 'parti-beta']);
    expect(parsePoolYaml(text, 'pool.yaml', known)).toEqual([VOTE_CANDIDATE]);
    expect(() => parsePoolYaml(text, 'pool.yaml', new Set(['parti-alpha']))).toThrow(
      /unknown party 'parti-beta'/,
    );
    const typo = mutate((c) => {
      c['positions'] = { 'parti-alphx': 2 };
    });
    expect(() => parsePoolYaml(typo, 'pool.yaml', known)).toThrow(/unknown party 'parti-alphx'/);
    const caseTypo = mutate((c) => {
      c['positions'] = { 'PARTI-ALPHA': 2 };
    });
    expect(() => parsePoolYaml(caseTypo, 'pool.yaml', known)).toThrow(/unknown party 'PARTI-ALPHA'/);
  });

  it('accepts an absent positions map — coding happens later in the HITL loop', () => {
    const [parsed] = parsePoolYaml(renderPoolYaml([PROGRAMME_CANDIDATE], 'h'), 'pool.yaml');
    expect(parsed?.positions).toBeUndefined();
  });
});
