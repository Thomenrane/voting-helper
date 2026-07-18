/**
 * Contrôles de complétude (#42) — modules purs.
 *
 * L'incomplétude silencieuse est le pire mode d'échec : un livret DéFI
 * manquant, des chapitres web absents, un PDF tronqué — tous passeraient le
 * SHA-256 de #21 (intégrité parfaite d'un document… incomplet). Trois
 * contrôles indépendants, chacun testé :
 *
 * 1. Inventaire des parties multiples — pour `n-booklets` / `web-chapters`,
 *    toutes les parties déclarées au registre d'identité sont présentes.
 * 2. TOC → dernière page — si une table des matières est détectée, sa dernière
 *    page référencée doit être ≤ au nombre réel de pages (sinon : troncature).
 * 3. Pages/taille — le nombre réel de pages est dans une tolérance de
 *    l'attendu (défend contre la synthèse servie à la place du complet).
 */
import type { ExpectedIdentity } from './expected-identity.ts';

// ---------------------------------------------------------------------------
// 1. Inventaire des parties
// ---------------------------------------------------------------------------

export interface PartsInventoryResult {
  status: 'complete' | 'incomplete';
  /** `source_id` attendus (toutes les parties déclarées). */
  expected: string[];
  /** `source_id` effectivement présents parmi les attendus. */
  present: string[];
  /** `source_id` attendus mais manquants — une seule suffit à l'incomplétude. */
  missing: string[];
}

/**
 * Toutes les parties déclarées sont-elles présentes ? Un livret manquant
 * (DéFI), un miroir absent (PTB/PVDA) rend l'inventaire incomplet.
 */
export function checkPartsInventory(
  expected: ExpectedIdentity,
  presentSourceIds: Iterable<string>,
): PartsInventoryResult {
  const present = new Set(presentSourceIds);
  const expectedIds = expected.parts.map((part) => part.source_id);
  const missing = expectedIds.filter((id) => !present.has(id));
  return {
    status: missing.length === 0 ? 'complete' : 'incomplete',
    expected: expectedIds,
    present: expectedIds.filter((id) => present.has(id)),
    missing,
  };
}

// ---------------------------------------------------------------------------
// 2. Table des matières → dernière page référencée
// ---------------------------------------------------------------------------

/** Nombre minimal d'entrées « libellé … numéro » pour reconnaître une TOC. */
export const TOC_MIN_ENTRIES = 3;

/**
 * Une entrée de table des matières : un libellé (contenant au moins une
 * lettre), un séparateur de points de conduite OU d'au moins deux espaces,
 * puis un numéro de page final (1 à 4 chiffres). Ancrée en fin de ligne pour
 * ne pas capter un numéro en milieu de phrase.
 */
const TOC_ENTRY = /^\s*(?=.*\p{L})(.*\S)[.… \t]{2,}(\d{1,4})\s*$/u;

/**
 * Détecte une TOC dans le texte fourni (typiquement les premières pages) et
 * renvoie la plus grande page référencée, ou `null` si aucune TOC plausible
 * (moins de TOC_MIN_ENTRIES entrées). Pur et déterministe.
 */
export function detectTocLastPage(text: string): number | null {
  const references: number[] = [];
  for (const line of text.split(/\r?\n/u)) {
    const match = TOC_ENTRY.exec(line);
    if (match === null) continue;
    const page = Number.parseInt(match[2] ?? '', 10);
    if (Number.isFinite(page)) references.push(page);
  }
  if (references.length < TOC_MIN_ENTRIES) return null;
  return Math.max(...references);
}

export type TocStatus = 'no-toc' | 'within' | 'exceeds';

export interface TocBoundsResult {
  status: TocStatus;
  /** Plus grande page référencée par la TOC, ou `null` si aucune TOC. */
  tocLastPage: number | null;
  actualPages: number;
}

/**
 * Confronte la dernière page d'une TOC détectée au nombre réel de pages.
 * `exceeds` = la TOC référence une page au-delà du document → troncature.
 * Absence de TOC → `no-toc` (non concluant, jamais un échec en soi).
 */
export function checkTocWithinBounds(
  tocLastPage: number | null,
  actualPages: number,
): TocBoundsResult {
  if (tocLastPage === null) {
    return { status: 'no-toc', tocLastPage: null, actualPages };
  }
  return {
    status: tocLastPage <= actualPages ? 'within' : 'exceeds',
    tocLastPage,
    actualPages,
  };
}

// ---------------------------------------------------------------------------
// 3. Tolérance de pages
// ---------------------------------------------------------------------------

/** Tolérance relative par défaut (±15 %) autour du nombre de pages attendu. */
export const PAGE_TOLERANCE_FRACTION = 0.15;

/** Plancher absolu de tolérance (pages), pour ne pas sur-serrer les petits documents. */
export const PAGE_TOLERANCE_FLOOR = 5;

/** Marge de pages tolérée autour de l'attendu : max(15 %, plancher). */
export function pageTolerance(expectedPages: number): number {
  return Math.max(Math.ceil(expectedPages * PAGE_TOLERANCE_FRACTION), PAGE_TOLERANCE_FLOOR);
}

export type PageToleranceStatus = 'within' | 'outside' | 'not-applicable';

export interface PageToleranceResult {
  status: PageToleranceStatus;
  expectedPages: number | null;
  actualPages: number | null;
  tolerance: number | null;
  /** |actuel − attendu|, ou `null` quand non applicable. */
  delta: number | null;
}

/**
 * Le nombre réel de pages est-il dans la tolérance de l'attendu ? Non
 * applicable quand l'attendu n'a pas de pagination (`web-chapters`) ou quand
 * aucune page réelle n'est disponible (couche texte non dérivée).
 */
export function checkPageTolerance(
  expectedPages: number | null,
  actualPages: number | null,
): PageToleranceResult {
  if (expectedPages === null || actualPages === null) {
    return {
      status: 'not-applicable',
      expectedPages,
      actualPages,
      tolerance: null,
      delta: null,
    };
  }
  const tolerance = pageTolerance(expectedPages);
  const delta = Math.abs(actualPages - expectedPages);
  return {
    status: delta <= tolerance ? 'within' : 'outside',
    expectedPages,
    actualPages,
    tolerance,
    delta,
  };
}
