/**
 * Logique de verdict d'admission par parti (#42) — module pur.
 *
 * Agrège les constats des contrôles (auto-identification + complétude) en un
 * verdict PASS / UNCERTAIN / FAIL, avec des raisons lisibles par MACHINE (code)
 * ET par HUMAIN (texte). Deux principes non négociables du ticket :
 *
 * - CONSERVATEUR PAR DÉFAUT : tout critère qui n'est pas NETTEMENT satisfait
 *   pèse UNCERTAIN, jamais PASS. PASS exige que chaque critère soit
 *   positivement confirmé.
 * - FAIL réservé au prouvé-faux : une partie manquante (incomplétude) ou une
 *   TOC qui déborde les pages réelles (troncature). L'ambigu — année ou niveau
 *   non affirmés, taille hors tolérance, évidence indisponible — est UNCERTAIN
 *   (→ escalade humaine), pas FAIL.
 *
 * Le statut global est la pire sévérité rencontrée : un seul FAIL → FAIL ;
 * sinon un seul UNCERTAIN → UNCERTAIN ; sinon PASS.
 */
import type { AutoIdResult } from './auto-identification.ts';
import {
  checkPageTolerance,
  checkPartsInventory,
  checkTocWithinBounds,
} from './completeness.ts';
import type { ExpectedIdentity } from './expected-identity.ts';

export type AdmissionStatus = 'PASS' | 'UNCERTAIN' | 'FAIL';

/** Contrôles produisant une raison de verdict. */
export type AdmissionCheck =
  | 'auto-id-year'
  | 'auto-id-level'
  | 'parts-inventory'
  | 'toc-bounds'
  | 'page-tolerance';

export interface AdmissionReason {
  check: AdmissionCheck;
  /** Sévérité de CE constat (contribue au pire-cas global). */
  severity: AdmissionStatus;
  /** Code stable, lisible par machine (ex. 'level.absent'). */
  code: string;
  /** Raison lisible par un humain (FR). */
  human: string;
}

export interface PartyAdmissionVerdict {
  party_id: string;
  status: AdmissionStatus;
  reasons: AdmissionReason[];
}

/** Évidence d'admission pour UN document (une partie du programme). */
export interface DocumentEvidence {
  source_id: string;
  /** Résultat d'auto-identification, ou `null` si non évalué (couche texte indisponible). */
  autoId: AutoIdResult | null;
  /** Pages réelles de ce document, ou `null` si inconnu. */
  actualPages: number | null;
  /** Dernière page référencée par la TOC détectée, ou `null` (aucune/non évaluée). */
  tocLastPage: number | null;
}

export interface PartyAdmissionInput {
  expected: ExpectedIdentity;
  documents: readonly DocumentEvidence[];
  /** `source_id` présents/attestés pour ce parti. */
  presentSourceIds: readonly string[];
}

/** Pire sévérité de la liste (FAIL > UNCERTAIN > PASS). */
function worst(reasons: readonly AdmissionReason[]): AdmissionStatus {
  if (reasons.some((r) => r.severity === 'FAIL')) return 'FAIL';
  if (reasons.some((r) => r.severity === 'UNCERTAIN')) return 'UNCERTAIN';
  return 'PASS';
}

/** Pages réelles cumulées des parties attendues, ou `null` si une manque. */
function totalActualPages(input: PartyAdmissionInput): number | null {
  let total = 0;
  for (const part of input.expected.parts) {
    const doc = input.documents.find((d) => d.source_id === part.source_id);
    if (doc === undefined || doc.actualPages === null) return null;
    total += doc.actualPages;
  }
  return total;
}

function yearReason(input: PartyAdmissionInput): AdmissionReason {
  const evaluated = input.documents.filter((d) => d.autoId !== null);
  if (evaluated.length === 0) {
    return {
      check: 'auto-id-year',
      severity: 'UNCERTAIN',
      code: 'year.not-evaluated',
      human: "Auto-identification non exécutée (couche texte indisponible) : l'année n'a pas pu être confirmée.",
    };
  }
  if (evaluated.some((d) => d.autoId?.yearPresent === true)) {
    return {
      check: 'auto-id-year',
      severity: 'PASS',
      code: 'year.present',
      human: `Année ${input.expected.year} présente dans les premières pages.`,
    };
  }
  return {
    check: 'auto-id-year',
    severity: 'UNCERTAIN',
    code: 'year.absent',
    human: `Année ${input.expected.year} absente des premières pages (mauvaise édition possible) → à vérifier par un humain.`,
  };
}

function levelReason(input: PartyAdmissionInput): AdmissionReason {
  const evaluated = input.documents.filter((d) => d.autoId !== null);
  if (evaluated.length === 0) {
    return {
      check: 'auto-id-level',
      severity: 'UNCERTAIN',
      code: 'level.not-evaluated',
      human: 'Auto-identification non exécutée (couche texte indisponible) : le niveau fédéral n\'a pas pu être confirmé.',
    };
  }
  if (evaluated.some((d) => d.autoId?.levelPresent === true)) {
    return {
      check: 'auto-id-level',
      severity: 'PASS',
      code: 'level.present',
      human: 'Niveau fédéral affirmé explicitement dans les premières pages.',
    };
  }
  return {
    check: 'auto-id-level',
    severity: 'UNCERTAIN',
    code: 'level.absent',
    human: 'Niveau fédéral non affirmé explicitement dans les premières pages → à vérifier par un humain (le scrutin fédéral, régional et européen partageaient la date du 9 juin 2024).',
  };
}

function partsReason(input: PartyAdmissionInput): AdmissionReason {
  const inventory = checkPartsInventory(input.expected, input.presentSourceIds);
  if (inventory.status === 'complete') {
    return {
      check: 'parts-inventory',
      severity: 'PASS',
      code: 'parts.complete',
      human: `Les ${inventory.expected.length} partie(s) déclarée(s) sont présentes.`,
    };
  }
  return {
    check: 'parts-inventory',
    severity: 'FAIL',
    code: 'parts.incomplete',
    human: `Partie(s) manquante(s) — programme incomplet : ${inventory.missing.join(', ')}.`,
  };
}

/** Une seule TOC qui déborde suffit à conclure à la troncature (FAIL). */
function tocReason(input: PartyAdmissionInput): AdmissionReason {
  let sawToc = false;
  for (const doc of input.documents) {
    if (doc.actualPages === null) continue;
    const bounds = checkTocWithinBounds(doc.tocLastPage, doc.actualPages);
    if (bounds.status === 'exceeds') {
      return {
        check: 'toc-bounds',
        severity: 'FAIL',
        code: 'toc.exceeds',
        human: `Table des matières de '${doc.source_id}' référençant la page ${String(bounds.tocLastPage)} alors que le document n'a que ${bounds.actualPages} pages : document tronqué.`,
      };
    }
    if (bounds.status === 'within') sawToc = true;
  }
  if (sawToc) {
    return {
      check: 'toc-bounds',
      severity: 'PASS',
      code: 'toc.within',
      human: 'Table des matières détectée, dernière page référencée dans les limites du document.',
    };
  }
  return {
    check: 'toc-bounds',
    severity: 'PASS',
    code: 'toc.none',
    human: 'Aucune table des matières exploitable détectée — contrôle de troncature non concluant (neutre).',
  };
}

function pagesReason(input: PartyAdmissionInput): AdmissionReason {
  if (input.expected.expected_pages === null) {
    return {
      check: 'page-tolerance',
      severity: 'PASS',
      code: 'pages.not-applicable',
      human: 'Pas de pagination attendue (chapitres web) — contrôle de taille non applicable (neutre).',
    };
  }
  const actual = totalActualPages(input);
  const result = checkPageTolerance(input.expected.expected_pages, actual);
  if (result.status === 'within') {
    return {
      check: 'page-tolerance',
      severity: 'PASS',
      code: 'pages.within',
      human: `Nombre de pages (${String(actual)}) dans la tolérance de l'attendu (${input.expected.expected_pages} ± ${String(result.tolerance)}).`,
    };
  }
  if (result.status === 'outside') {
    return {
      check: 'page-tolerance',
      severity: 'UNCERTAIN',
      code: 'pages.outside',
      human: `Nombre de pages (${String(actual)}) hors tolérance de l'attendu (${input.expected.expected_pages} ± ${String(result.tolerance)}) — synthèse à la place du complet ? → à vérifier.`,
    };
  }
  return {
    check: 'page-tolerance',
    severity: 'UNCERTAIN',
    code: 'pages.not-evaluated',
    human: 'Nombre de pages réel indisponible (couche texte non dérivée) : taille non confirmée.',
  };
}

/**
 * Verdict d'admission d'un parti. Émet exactement une raison par contrôle, puis
 * agrège au pire-cas. Conservateur : PASS exige que tous les critères soient
 * nettement satisfaits.
 */
export function admitParty(input: PartyAdmissionInput): PartyAdmissionVerdict {
  const reasons: AdmissionReason[] = [
    yearReason(input),
    levelReason(input),
    partsReason(input),
    tocReason(input),
    pagesReason(input),
  ];
  return {
    party_id: input.expected.party_id,
    status: worst(reasons),
    reasons,
  };
}
