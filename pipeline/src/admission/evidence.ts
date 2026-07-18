/**
 * Construction de l'évidence d'admission à partir des couches texte (#42).
 *
 * Fait le pont entre les artefacts existants (#21/#22 — couche texte par page,
 * pages attestées au manifeste) et la logique de verdict pure : pour chaque
 * document d'un parti, dérive l'auto-identification, le nombre réel de pages et
 * la dernière page référencée par la TOC. Deux niveaux d'évidence coexistent et
 * alimentent le MÊME verdict conservateur :
 *
 * - couche texte disponible → auto-ID + TOC réellement évaluées ;
 * - couche texte indisponible (HTML des chapitres web, ou couche non dérivée
 *   localement) → auto-ID/TOC non évaluées ; seules les pages connues du
 *   manifeste servent. Le verdict traite l'évidence absente en UNCERTAIN.
 */
import { checkLayerAutoIdentification, firstPagesText } from './auto-identification.ts';
import { detectTocLastPage } from './completeness.ts';
import type { ExpectedIdentity } from './expected-identity.ts';
import type { ProgrammeTextLayer } from '../extraction/text-layer.ts';
import type { DocumentEvidence, PartyAdmissionInput } from './verdict.ts';

/** Fenêtre de pages (front) balayée pour détecter une table des matières. */
export const ADMISSION_TOC_PAGES = 10;

/** Signaux disponibles pour UN document d'un parti. */
export interface DocumentSignals {
  source_id: string;
  /** Couche texte par page si dérivée/disponible, sinon `null`. */
  layer: ProgrammeTextLayer | null;
  /**
   * Pages connues même sans couche texte (ex. `quality.pages` du manifeste
   * #22). Ignoré quand `layer` est présent (la couche fait autorité).
   */
  knownPages: number | null;
}

/** Dérive l'évidence d'admission d'un document depuis ses signaux. */
export function documentEvidence(
  signals: DocumentSignals,
  expected: ExpectedIdentity,
): DocumentEvidence {
  if (signals.layer !== null) {
    const layer = signals.layer;
    return {
      source_id: signals.source_id,
      autoId: checkLayerAutoIdentification(layer, expected),
      actualPages: layer.page_count,
      tocLastPage: detectTocLastPage(firstPagesText(layer, ADMISSION_TOC_PAGES)),
    };
  }
  return {
    source_id: signals.source_id,
    autoId: null,
    actualPages: signals.knownPages,
    tocLastPage: null,
  };
}

/**
 * Assemble l'entrée de verdict d'un parti. Une évidence est produite pour
 * chaque partie ATTENDUE (ordre du registre d'identité) ; une partie sans
 * signal reçoit une évidence vide. `presentSourceIds` liste les sources
 * réellement attestées (snapshotées) — c'est l'inventaire des parties.
 */
export function buildPartyAdmissionInput(
  expected: ExpectedIdentity,
  signals: readonly DocumentSignals[],
  presentSourceIds: readonly string[],
): PartyAdmissionInput {
  const documents: DocumentEvidence[] = expected.parts.map((part) => {
    const signal =
      signals.find((s) => s.source_id === part.source_id) ??
      ({ source_id: part.source_id, layer: null, knownPages: null } satisfies DocumentSignals);
    return documentEvidence(signal, expected);
  });
  return { expected, documents, presentSourceIds };
}
