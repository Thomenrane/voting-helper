/**
 * Porte d'admission FAIL-CLOSED (#42).
 *
 * Le garde-fou du PO : aucun parti n'entre dans le corpus/l'extraction sans un
 * verdict PASS NET. `assertPartyAdmitted` est le point de contrôle unique que
 * l'extraction DOIT appeler avant de traiter un parti — un verdict UNCERTAIN ou
 * FAIL lève, refermant la porte. Le seul chemin de sortie est le ré-entrée
 * humaine (fournir manuellement le bon document attesté, qui re-passe la porte),
 * jamais un contournement.
 */
import type { PartyAdmissionVerdict } from './verdict.ts';

/** Levée quand un parti non-PASS est présenté à la porte. Fail-closed. */
export class SourceNotAdmittedError extends Error {
  readonly verdict: PartyAdmissionVerdict;

  constructor(verdict: PartyAdmissionVerdict) {
    const blocking = verdict.reasons
      .filter((reason) => reason.severity !== 'PASS')
      .map((reason) => `  - [${reason.severity}] ${reason.code} : ${reason.human}`)
      .join('\n');
    super(
      `Parti '${verdict.party_id}' NON ADMIS (verdict ${verdict.status}) — l'extraction est ` +
        `refusée (fail-closed). Motifs bloquants :\n${blocking}\n` +
        `Chemin de sortie : ré-entrée humaine — fournir le bon document attesté ` +
        `(npm run admit:source) pour re-passer la porte.`,
    );
    this.name = 'SourceNotAdmittedError';
    this.verdict = verdict;
  }
}

/** Vrai uniquement pour un verdict PASS net. */
export function isAdmitted(verdict: PartyAdmissionVerdict): boolean {
  return verdict.status === 'PASS';
}

/**
 * Garde fail-closed : ne fait rien pour un PASS, lève SourceNotAdmittedError
 * pour tout autre verdict. À appeler par l'extraction avant de traiter un parti.
 */
export function assertPartyAdmitted(verdict: PartyAdmissionVerdict): void {
  if (!isAdmitted(verdict)) {
    throw new SourceNotAdmittedError(verdict);
  }
}
