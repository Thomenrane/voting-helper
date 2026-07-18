import { describe, expect, it } from 'vitest';

import type { AutoIdResult } from './auto-identification.ts';
import { getExpectedIdentity } from './expected-identity.ts';
import {
  admitParty,
  type DocumentEvidence,
  type PartyAdmissionInput,
} from './verdict.ts';

const PASS_AUTO_ID: AutoIdResult = {
  yearPresent: true,
  levelPresent: true,
  matchedLevelTerms: ['federal'],
  pagesScanned: 5,
};

/** A single-pdf party whose one document clearly satisfies every criterion. */
function fullPassInput(): PartyAdmissionInput {
  const expected = getExpectedIdentity('nva'); // single-pdf, 120 p.
  const doc: DocumentEvidence = {
    source_id: 'nva-programme-2024',
    autoId: PASS_AUTO_ID,
    actualPages: 120,
    tocLastPage: 118,
  };
  return { expected, documents: [doc], presentSourceIds: ['nva-programme-2024'] };
}

function codes(input: PartyAdmissionInput): string[] {
  return admitParty(input).reasons.map((r) => r.code);
}

describe('admitParty — PASS exige que TOUT soit nettement satisfait', () => {
  it('PASS quand année + niveau + parties + tolérance + TOC sont tous satisfaits', () => {
    const verdict = admitParty(fullPassInput());
    expect(verdict.status).toBe('PASS');
    expect(codes(fullPassInput())).toEqual([
      'year.present',
      'level.present',
      'parts.complete',
      'toc.within',
      'pages.within',
    ]);
  });

  it('PASS toléré sans TOC (le contrôle de troncature est neutre en son absence)', () => {
    const input = fullPassInput();
    const verdict = admitParty({
      ...input,
      documents: [{ ...input.documents[0]!, tocLastPage: null }],
    });
    expect(verdict.status).toBe('PASS');
  });
});

describe('admitParty — conservateur : le doute donne UNCERTAIN, jamais PASS', () => {
  it('année absente → UNCERTAIN', () => {
    const input = fullPassInput();
    const verdict = admitParty({
      ...input,
      documents: [{ ...input.documents[0]!, autoId: { ...PASS_AUTO_ID, yearPresent: false } }],
    });
    expect(verdict.status).toBe('UNCERTAIN');
    expect(verdict.reasons.find((r) => r.check === 'auto-id-year')?.code).toBe('year.absent');
  });

  it('niveau non affirmé → UNCERTAIN (cas N-VA « Voor Vlaamse Welvaart »)', () => {
    const input = fullPassInput();
    const verdict = admitParty({
      ...input,
      documents: [
        { ...input.documents[0]!, autoId: { ...PASS_AUTO_ID, levelPresent: false, matchedLevelTerms: [] } },
      ],
    });
    expect(verdict.status).toBe('UNCERTAIN');
    expect(verdict.reasons.find((r) => r.check === 'auto-id-level')?.code).toBe('level.absent');
  });

  it('auto-ID non évaluée (pas de couche texte) → UNCERTAIN', () => {
    const input = fullPassInput();
    const verdict = admitParty({
      ...input,
      documents: [{ ...input.documents[0]!, autoId: null }],
    });
    expect(verdict.status).toBe('UNCERTAIN');
    expect(codes({ ...input, documents: [{ ...input.documents[0]!, autoId: null }] })).toContain(
      'year.not-evaluated',
    );
  });

  it('pages hors tolérance (synthèse à la place du complet) → UNCERTAIN', () => {
    const mr = getExpectedIdentity('mr'); // 311 p. attendues
    const verdict = admitParty({
      expected: mr,
      documents: [
        { source_id: 'mr-programme-2024', autoId: PASS_AUTO_ID, actualPages: 100, tocLastPage: null },
      ],
      presentSourceIds: ['mr-programme-2024'],
    });
    expect(verdict.status).toBe('UNCERTAIN');
    expect(verdict.reasons.find((r) => r.check === 'page-tolerance')?.code).toBe('pages.outside');
  });
});

describe('admitParty — FAIL réservé au prouvé-faux', () => {
  it('livret DéFI manquant → FAIL (incomplétude)', () => {
    const defi = getExpectedIdentity('defi');
    const documents: DocumentEvidence[] = defi.parts
      .filter((p) => p.source_id !== 'defi-axe-4-2024')
      .map((p) => ({
        source_id: p.source_id,
        autoId: PASS_AUTO_ID,
        actualPages: p.expected_pages,
        tocLastPage: null,
      }));
    const verdict = admitParty({
      expected: defi,
      documents,
      presentSourceIds: documents.map((d) => d.source_id),
    });
    expect(verdict.status).toBe('FAIL');
    const parts = verdict.reasons.find((r) => r.check === 'parts-inventory');
    expect(parts?.code).toBe('parts.incomplete');
    expect(parts?.human).toContain('defi-axe-4-2024');
  });

  it('TOC qui déborde les pages réelles → FAIL (troncature)', () => {
    const mr = getExpectedIdentity('mr');
    const verdict = admitParty({
      expected: mr,
      documents: [
        { source_id: 'mr-programme-2024', autoId: PASS_AUTO_ID, actualPages: 100, tocLastPage: 311 },
      ],
      presentSourceIds: ['mr-programme-2024'],
    });
    expect(verdict.status).toBe('FAIL');
    expect(verdict.reasons.find((r) => r.check === 'toc-bounds')?.code).toBe('toc.exceeds');
  });

  it('un FAIL prime sur les UNCERTAIN (pire-cas)', () => {
    const defi = getExpectedIdentity('defi');
    // Un livret manquant (FAIL) ET auto-ID non évaluée (UNCERTAIN) → FAIL.
    const documents: DocumentEvidence[] = defi.parts
      .filter((p) => p.source_id !== 'defi-axe-1-2024')
      .map((p) => ({ source_id: p.source_id, autoId: null, actualPages: null, tocLastPage: null }));
    const verdict = admitParty({
      expected: defi,
      documents,
      presentSourceIds: documents.map((d) => d.source_id),
    });
    expect(verdict.status).toBe('FAIL');
  });
});

describe('admitParty — web-chapters (PTB-PVDA)', () => {
  it('reste UNCERTAIN : pas de couche texte HTML → auto-ID non évaluée', () => {
    const ptb = getExpectedIdentity('ptb-pvda');
    const verdict = admitParty({
      expected: ptb,
      documents: ptb.parts.map((p) => ({
        source_id: p.source_id,
        autoId: null,
        actualPages: null,
        tocLastPage: null,
      })),
      presentSourceIds: ptb.parts.map((p) => p.source_id),
    });
    expect(verdict.status).toBe('UNCERTAIN');
    // La taille n'est pas un blocage (non applicable), les parties sont là.
    expect(verdict.reasons.find((r) => r.check === 'page-tolerance')?.code).toBe(
      'pages.not-applicable',
    );
    expect(verdict.reasons.find((r) => r.check === 'parts-inventory')?.code).toBe('parts.complete');
  });
});
