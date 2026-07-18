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
      // #51 : nouveau contrôle, neutre pour un PDF (pas de chapitres web attendus).
      'chapters.not-applicable',
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

describe('admitParty — NOT_MATERIALIZED : couche absente, distinct d\'un doute réel (#46)', () => {
  it('couche non matérialisée → NOT_MATERIALIZED, PAS UNCERTAIN', () => {
    const input = fullPassInput();
    const noLayer = { ...input, documents: [{ ...input.documents[0]!, autoId: null }] };
    const verdict = admitParty(noLayer);
    expect(verdict.status).toBe('NOT_MATERIALIZED');
    // Les codes portent explicitement la non-matérialisation (pas .absent).
    expect(codes(noLayer)).toContain('year.not-materialized');
    expect(codes(noLayer)).toContain('level.not-materialized');
    const year = verdict.reasons.find((r) => r.check === 'auto-id-year');
    expect(year?.severity).toBe('NOT_MATERIALIZED');
    expect(year?.code).not.toBe('year.absent');
  });

  it('un vrai doute (level.absent) prime sur la non-matérialisation → UNCERTAIN', () => {
    // Couche PRÉSENTE mais niveau non affirmé : c'est un doute réel, jamais
    // confondu avec « non matérialisé ».
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

  it('une taille attestée hors tolérance prime sur la couche absente → UNCERTAIN', () => {
    // auto-ID non matérialisée MAIS pages attestées (manifeste) hors tolérance :
    // le doute réel de taille n'est pas masqué par la non-matérialisation.
    const mr = getExpectedIdentity('mr'); // 311 p. attendues
    const verdict = admitParty({
      expected: mr,
      documents: [
        { source_id: 'mr-programme-2024', autoId: null, actualPages: 100, tocLastPage: null },
      ],
      presentSourceIds: ['mr-programme-2024'],
    });
    expect(verdict.status).toBe('UNCERTAIN');
    expect(verdict.reasons.find((r) => r.check === 'page-tolerance')?.code).toBe('pages.outside');
    expect(verdict.reasons.find((r) => r.check === 'auto-id-year')?.code).toBe('year.not-materialized');
  });
});

describe('admitParty — attestation humaine d\'un critère UNCERTAIN (#50)', () => {
  const SHA = 'f'.repeat(64);

  /** N-VA « Voor Vlaamse Welvaart » : année là, niveau non affirmé → level.absent. */
  function levelUncertainInput(): PartyAdmissionInput {
    const input = fullPassInput();
    return {
      ...input,
      documents: [
        {
          ...input.documents[0]!,
          autoId: { ...PASS_AUTO_ID, levelPresent: false, matchedLevelTerms: [] },
          snapshotSha256: SHA,
        },
      ],
    };
  }

  function attestLevel(sha: string): readonly [{ criteria: string[]; by: string; at: string; note: string; snapshot_sha256: string }] {
    return [
      {
        criteria: ['auto-id-level'],
        by: 'Thomas',
        at: '2026-07-18T10:00:00.000Z',
        note: 'Couverture « Élections du 9 juin 2024 » vérifiée à la main.',
        snapshot_sha256: sha,
      },
    ];
  }

  it('UNCERTAIN nommé + attestation valide (empreinte concordante) → PASS attesté', () => {
    const input = levelUncertainInput();
    const verdict = admitParty({
      ...input,
      documents: [{ ...input.documents[0]!, attestations: attestLevel(SHA) }],
    });
    expect(verdict.status).toBe('PASS');
    const level = verdict.reasons.find((r) => r.check === 'auto-id-level');
    expect(level?.severity).toBe('PASS');
    expect(level?.code).toBe('level.attested');
    expect(level?.attestation?.by).toBe('Thomas');
    expect(level?.human).toContain('Thomas');
    expect(level?.human).toContain('2026-07-18');
  });

  it('empreinte divergente (document remplacé) → attestation ignorée → UNCERTAIN', () => {
    const input = levelUncertainInput();
    const verdict = admitParty({
      ...input,
      // Attestation faite sur un ancien SHA ; le snapshot courant a changé.
      documents: [{ ...input.documents[0]!, attestations: attestLevel('a'.repeat(64)) }],
    });
    expect(verdict.status).toBe('UNCERTAIN');
    expect(verdict.reasons.find((r) => r.check === 'auto-id-level')?.code).toBe('level.absent');
  });

  it('UNCERTAIN non attesté laisse le parti UNCERTAIN (fail-closed intact)', () => {
    const verdict = admitParty(levelUncertainInput());
    expect(verdict.status).toBe('UNCERTAIN');
    expect(verdict.reasons.find((r) => r.check === 'auto-id-level')?.code).toBe('level.absent');
  });

  it('NOT_MATERIALIZED nommé par une attestation n\'est JAMAIS converti en PASS', () => {
    const input = fullPassInput();
    const verdict = admitParty({
      ...input,
      documents: [
        { ...input.documents[0]!, autoId: null, snapshotSha256: SHA, attestations: attestLevel(SHA) },
      ],
    });
    // auto-ID non matérialisée : le critère reste NOT_MATERIALIZED, pas attesté.
    const level = verdict.reasons.find((r) => r.check === 'auto-id-level');
    expect(level?.severity).toBe('NOT_MATERIALIZED');
    expect(level?.code).toBe('level.not-materialized');
    expect(level?.attestation).toBeUndefined();
  });

  it('FAIL réel + level attesté → le parti ne sort PAS PASS (agrégation préservée)', () => {
    const mr = getExpectedIdentity('mr');
    const verdict = admitParty({
      expected: mr,
      documents: [
        {
          source_id: 'mr-programme-2024',
          autoId: { ...PASS_AUTO_ID, levelPresent: false, matchedLevelTerms: [] },
          actualPages: 100,
          tocLastPage: 311, // TOC déborde → FAIL réel
          snapshotSha256: SHA,
          attestations: attestLevel(SHA),
        },
      ],
      presentSourceIds: ['mr-programme-2024'],
    });
    // level est attesté (PASS) mais la troncature reste FAIL → pire-cas FAIL.
    expect(verdict.reasons.find((r) => r.check === 'auto-id-level')?.code).toBe('level.attested');
    expect(verdict.reasons.find((r) => r.check === 'toc-bounds')?.code).toBe('toc.exceeds');
    expect(verdict.status).toBe('FAIL');
  });

  it('une attestation ne ratifie que le critère nommé (autre UNCERTAIN préservé)', () => {
    const input = fullPassInput();
    const verdict = admitParty({
      ...input,
      documents: [
        {
          ...input.documents[0]!,
          // année ET niveau absents ; seul le niveau est attesté.
          autoId: { ...PASS_AUTO_ID, yearPresent: false, levelPresent: false, matchedLevelTerms: [] },
          snapshotSha256: SHA,
          attestations: attestLevel(SHA),
        },
      ],
    });
    expect(verdict.reasons.find((r) => r.check === 'auto-id-level')?.code).toBe('level.attested');
    expect(verdict.reasons.find((r) => r.check === 'auto-id-year')?.code).toBe('year.absent');
    expect(verdict.status).toBe('UNCERTAIN');
  });
});

describe('admitParty — web-chapters (PTB-PVDA)', () => {
  it('couche texte HTML non matérialisée → NOT_MATERIALIZED (pas un doute réel)', () => {
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
    expect(verdict.status).toBe('NOT_MATERIALIZED');
    // La taille n'est pas un blocage (non applicable), les parties sont là.
    expect(verdict.reasons.find((r) => r.check === 'page-tolerance')?.code).toBe(
      'pages.not-applicable',
    );
    expect(verdict.reasons.find((r) => r.check === 'parts-inventory')?.code).toBe('parts.complete');
  });
});
