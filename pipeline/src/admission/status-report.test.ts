import { describe, expect, it } from 'vitest';

import {
  buildStatusReport,
  countStatuses,
  renderStatusJson,
  renderStatusMarkdown,
} from './status-report.ts';
import type { PartyAdmissionVerdict } from './verdict.ts';

const PASS_VERDICT: PartyAdmissionVerdict = {
  party_id: 'ps',
  status: 'PASS',
  reasons: [
    { check: 'auto-id-year', severity: 'PASS', code: 'year.present', human: 'année là' },
    { check: 'auto-id-level', severity: 'PASS', code: 'level.present', human: 'niveau là' },
  ],
};

const UNCERTAIN_VERDICT: PartyAdmissionVerdict = {
  party_id: 'nva',
  status: 'UNCERTAIN',
  reasons: [
    { check: 'auto-id-level', severity: 'UNCERTAIN', code: 'level.absent', human: 'niveau non affirmé' },
  ],
};

const FAIL_VERDICT: PartyAdmissionVerdict = {
  party_id: 'defi',
  status: 'FAIL',
  reasons: [
    { check: 'parts-inventory', severity: 'FAIL', code: 'parts.incomplete', human: 'livret manquant' },
  ],
};

const NOT_MATERIALIZED_VERDICT: PartyAdmissionVerdict = {
  party_id: 'ecolo',
  status: 'NOT_MATERIALIZED',
  reasons: [
    {
      check: 'auto-id-level',
      severity: 'NOT_MATERIALIZED',
      code: 'level.not-materialized',
      human: 'binaire brut absent',
    },
  ],
};

const VERDICTS = [PASS_VERDICT, UNCERTAIN_VERDICT, FAIL_VERDICT, NOT_MATERIALIZED_VERDICT];

describe('countStatuses', () => {
  it('compte par statut, y compris NOT_MATERIALIZED', () => {
    expect(countStatuses(VERDICTS)).toEqual({ PASS: 1, UNCERTAIN: 1, FAIL: 1, NOT_MATERIALIZED: 1 });
  });
});

describe('buildStatusReport', () => {
  it('ordonne par sévérité décroissante (FAIL, UNCERTAIN, NOT_MATERIALIZED, PASS)', () => {
    const report = buildStatusReport(VERDICTS, '2026-07-18');
    expect(report.parties.map((p) => p.party_id)).toEqual(['defi', 'nva', 'ecolo', 'ps']);
    expect(report.generated_at).toBe('2026-07-18');
  });

  it('ne mute pas l\'entrée', () => {
    const original = [...VERDICTS];
    buildStatusReport(VERDICTS, '2026-07-18');
    expect(VERDICTS).toEqual(original);
  });
});

describe('renderStatusJson', () => {
  it('rend un JSON stable re-parsable, terminé par un saut de ligne', () => {
    const json = renderStatusJson(buildStatusReport(VERDICTS, '2026-07-18'));
    expect(json.endsWith('\n')).toBe(true);
    const parsed = JSON.parse(json) as { generated_at: string; parties: PartyAdmissionVerdict[] };
    expect(parsed.parties).toHaveLength(4);
    expect(parsed.parties[0]?.status).toBe('FAIL');
  });
});

describe('renderStatusMarkdown', () => {
  const md = renderStatusMarkdown(buildStatusReport(VERDICTS, '2026-07-18'));

  it('publie le bilan, un tableau et le détail par parti', () => {
    expect(md).toContain('Statut de vérification des sources');
    expect(md).toContain('1 PASS · 1 UNCERTAIN · 1 FAIL · 1 NON MATÉRIALISÉ');
    expect(md).toContain('| Parti | Verdict | Résumé |');
    expect(md).toContain('## Détail par parti');
  });

  it('publie le quatrième état, distinct d\'un doute (#46)', () => {
    expect(md).toContain('NON MATÉRIALISÉ');
    expect(md).toContain('level.not-materialized');
  });

  it('affiche le verdict et les raisons machine+humain', () => {
    expect(md).toContain('level.absent');
    expect(md).toContain('niveau non affirmé');
    expect(md).toContain('parts.incomplete');
  });

  it('rappelle le caractère fail-closed et le chemin de ré-entrée', () => {
    expect(md).toContain('fail-closed');
    expect(md).toContain('admit:source');
  });
});
