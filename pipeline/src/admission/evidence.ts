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
 * - couche texte non matérialisée (HTML des chapitres web, ou binaire brut
 *   absent localement) → auto-ID/TOC non évaluées ; seules les pages attestées
 *   au manifeste servent. Le verdict traite la couche absente en
 *   NOT_MATERIALIZED (distinct d'un doute réel, #46), jamais faussement PASS.
 */
import { checkLayerAutoIdentification, firstPagesText } from './auto-identification.ts';
import { detectTocLastPage, type ChapterInventory } from './completeness.ts';
import type { ExpectedIdentity } from './expected-identity.ts';
import type { ProgrammeTextLayer } from '../extraction/text-layer.ts';
import type { CriterionAttestation } from '../snapshot/manifest.ts';
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
  /** SHA-256 du snapshot brut épinglé de ce document (#50), ou `null`. */
  snapshotSha256?: string | null;
  /** Attestations de critère portées par le snapshot épinglé (#50). */
  attestations?: readonly CriterionAttestation[];
  /**
   * Inventaire des chapitres pour une source web-chapitres (#51), ou `null`/
   * absent quand non applicable (source paginée) ou non évaluable (index brut
   * absent localement). Alimente le contrôle `chapters-inventory`.
   */
  chapterInventory?: ChapterInventory | null;
}

/** Dérive l'évidence d'admission d'un document depuis ses signaux. */
export function documentEvidence(
  signals: DocumentSignals,
  expected: ExpectedIdentity,
): DocumentEvidence {
  const attested = {
    snapshotSha256: signals.snapshotSha256 ?? null,
    attestations: signals.attestations ?? [],
    chapterInventory: signals.chapterInventory ?? null,
  };
  if (signals.layer !== null) {
    const layer = signals.layer;
    return {
      source_id: signals.source_id,
      autoId: checkLayerAutoIdentification(layer, expected),
      actualPages: layer.page_count,
      // #49 : borne la détection au nombre réel de pages pour écarter les
      // artefacts des TDM multi-colonnes (faux toc.exceeds), sans neutraliser
      // la détection de troncature cohérente.
      tocLastPage: detectTocLastPage(firstPagesText(layer, ADMISSION_TOC_PAGES), layer.page_count),
      ...attested,
    };
  }
  return {
    source_id: signals.source_id,
    autoId: null,
    actualPages: signals.knownPages,
    tocLastPage: null,
    ...attested,
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
