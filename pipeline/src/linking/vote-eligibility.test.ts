/**
 * Mechanical inclusion/exclusion rules of the vote-linking stage (#23).
 *
 * These rules ARE the published criteria (docs/methodologie/
 * criteres-liaison-votes.md): they must stay boring, metadata-driven and
 * testable — no judgement call is coded here, only the mechanical part of
 * « vote final en plénière ou amendement direct, procéduraux exclus ».
 */
import { describe, expect, it } from 'vitest';

import type { PlenaryVote } from '../votes/votes.types.ts';
import { classifyVoteEligibility } from './vote-eligibility.ts';

function vote(overrides: Partial<PlenaryVote>): PlenaryVote {
  return {
    id: '56-m10-v1',
    legislature: '56',
    meeting_id: '10',
    vote_number: '1',
    date: '2025-03-15',
    title_fr: "Projet de loi portant des dispositions fiscales diverses — vote sur l'ensemble",
    title_nl: 'Wetsontwerp houdende diverse fiscale bepalingen — stemming over het geheel',
    dossier: { id: '228', title: 'Dispositions fiscales diverses', document_type: 'WETSONTWERP', status: 'AANGENOMEN' },
    document_id: null,
    motion_id: null,
    counts: { oui: 80, non: 40, abstention: 10 },
    ballots: [],
    groups: [],
    warnings: [],
    ...overrides,
  };
}

describe('classifyVoteEligibility — inclusion', () => {
  it('classifies an explicit whole-text vote as vote_final (FR and NL)', () => {
    expect(classifyVoteEligibility(vote({}))).toEqual({ eligible: true, kind: 'vote_final' });
    const nl = vote({ title_fr: '…', title_nl: 'Stemming over het geheel van het wetsontwerp' });
    expect(classifyVoteEligibility(nl)).toEqual({ eligible: true, kind: 'vote_final' });
  });

  it('uses the neutral scrutin_dossier kind when the type is not determinable (m2)', () => {
    // Never claim « vote final » by default: an undeterminable title gets
    // the neutral « scrutin lié au dossier » label.
    const v = vote({
      title_fr: 'Projet de loi portant des dispositions fiscales diverses',
      title_nl: 'Wetsontwerp houdende diverse fiscale bepalingen',
    });
    expect(classifyVoteEligibility(v)).toEqual({ eligible: true, kind: 'scrutin_dossier' });
  });

  it('classifies a vote on amendments as amendement (FR title)', () => {
    const v = vote({ title_fr: 'Amendement n° 4 de M. Dupont au projet de loi', title_nl: '…' });
    expect(classifyVoteEligibility(v)).toEqual({ eligible: true, kind: 'amendement' });
  });

  it('classifies a vote on amendments as amendement (NL title)', () => {
    const v = vote({ title_fr: '…', title_nl: 'Amendementen nrs. 2 en 3 op het wetsontwerp' });
    expect(classifyVoteEligibility(v)).toEqual({ eligible: true, kind: 'amendement' });
  });
});

describe('classifyVoteEligibility — mechanical exclusions', () => {
  it('excludes a vote without a linked legislative dossier', () => {
    const result = classifyVoteEligibility(vote({ dossier: null }));
    expect(result).toMatchObject({ eligible: false });
    if (!result.eligible) expect(result.reason).toMatch(/dossier/);
  });

  it('excludes procedural votes by published FR title patterns', () => {
    const cases = [
      'Prise en considération de propositions',
      'Renvoi en commission du projet de loi',
      "Ajournement de la discussion",
      "Ordre des travaux — motion",
      "Demande d'urgence du gouvernement",
      "Consultation du Conseil d'État",
    ];
    for (const title_fr of cases) {
      const result = classifyVoteEligibility(vote({ title_fr, title_nl: '…' }));
      expect(result.eligible, title_fr).toBe(false);
      if (!result.eligible) expect(result.reason).toMatch(/procédur/);
    }
  });

  it('excludes procedural votes by published NL title patterns', () => {
    const cases = [
      'Inoverwegingneming van voorstellen',
      'Verzending naar de commissie',
      'Verdaging van de bespreking',
      'Regeling van de werkzaamheden',
      'Urgentieverzoek van de regering',
      'Advies van de Raad van State',
    ];
    for (const title_nl of cases) {
      const result = classifyVoteEligibility(vote({ title_fr: '…', title_nl }));
      expect(result.eligible, title_nl).toBe(false);
    }
  });

  it('matches patterns case- and diacritic-insensitively', () => {
    const v = vote({ title_fr: 'PRISE EN CONSIDERATION de propositions', title_nl: '…' });
    expect(classifyVoteEligibility(v).eligible).toBe(false);
  });

  it('does not exclude a substantive title merely mentioning a commission', () => {
    const v = vote({
      title_fr: "Projet de loi instituant une commission d'enquête sur la fraude fiscale",
      title_nl: 'Wetsontwerp tot oprichting van een onderzoekscommissie',
    });
    expect(classifyVoteEligibility(v).eligible).toBe(true);
  });

  it('does not exclude a substantive dossier mentioning « urgence » (anchored pattern)', () => {
    // The published criterion is « demande d'urgence », not the word alone:
    // a winter emergency plan is a substantive measure, not procedure.
    const v = vote({
      title_fr: "Projet de loi instaurant un plan d'urgence hivernal pour les sans-abri",
      title_nl: 'Wetsontwerp tot invoering van een winternoodplan',
    });
    expect(classifyVoteEligibility(v).eligible).toBe(true);
  });

  it('does not exclude a reform OF the Conseil d’État (anchored pattern)', () => {
    // Only the « consultation du Conseil d'État » procedure is excluded —
    // legislating about the institution itself is substantive.
    const v = vote({
      title_fr: "Projet de loi portant réforme du Conseil d'État",
      title_nl: 'Wetsontwerp tot hervorming van de Raad van State',
    });
    expect(classifyVoteEligibility(v).eligible).toBe(true);
  });
});
