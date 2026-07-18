import { describe, expect, it } from 'vitest';

import { assertPartyAdmitted, isAdmitted, SourceNotAdmittedError } from './gate.ts';
import type { PartyAdmissionVerdict } from './verdict.ts';

function verdict(status: PartyAdmissionVerdict['status']): PartyAdmissionVerdict {
  return {
    party_id: 'nva',
    status,
    reasons: [
      {
        check: 'auto-id-level',
        severity: status === 'PASS' ? 'PASS' : 'UNCERTAIN',
        code: status === 'PASS' ? 'level.present' : 'level.absent',
        human: 'niveau fédéral',
      },
    ],
  };
}

describe('assertPartyAdmitted — fail-closed', () => {
  it('laisse passer un PASS net', () => {
    expect(() => assertPartyAdmitted(verdict('PASS'))).not.toThrow();
    expect(isAdmitted(verdict('PASS'))).toBe(true);
  });

  it('REFUSE un parti UNCERTAIN (un parti non-PASS ne peut pas être extrait)', () => {
    expect(() => assertPartyAdmitted(verdict('UNCERTAIN'))).toThrow(SourceNotAdmittedError);
    expect(isAdmitted(verdict('UNCERTAIN'))).toBe(false);
  });

  it('REFUSE un parti FAIL', () => {
    expect(() => assertPartyAdmitted(verdict('FAIL'))).toThrow(SourceNotAdmittedError);
    expect(isAdmitted(verdict('FAIL'))).toBe(false);
  });

  it('le message nomme le verdict, les motifs bloquants et le chemin de ré-entrée', () => {
    try {
      assertPartyAdmitted(verdict('UNCERTAIN'));
      throw new Error('devait lever');
    } catch (error) {
      expect(error).toBeInstanceOf(SourceNotAdmittedError);
      const message = (error as SourceNotAdmittedError).message;
      expect(message).toContain("'nva'");
      expect(message).toContain('UNCERTAIN');
      expect(message).toContain('level.absent');
      expect(message).toContain('admit:source');
      expect((error as SourceNotAdmittedError).verdict.status).toBe('UNCERTAIN');
    }
  });
});
