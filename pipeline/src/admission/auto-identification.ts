/**
 * Contrôle d'auto-identification (#42) — module pur.
 *
 * Les premières pages d'un programme doivent porter l'ANNÉE attendue ET le
 * NIVEAU attendu (fédéral). C'est le garde-fou contre la mauvaise
 * année/édition (2019, « projet de société » permanent) et le mauvais niveau
 * (régional au lieu de fédéral). Absence ou écart → le critère n'est PAS
 * nettement satisfait, ce que la logique de verdict traduit en non-PASS.
 *
 * Normalisation COHÉRENTE avec l'existant : on réutilise `foldForLexical`
 * (typographie partagée avec le vérificateur de citations, puis pliage des
 * diacritiques et casse) — la présence d'un terme d'identité est
 * insensible à la casse et aux accents, exactement comme le filet lexical #39.
 * Ainsi « fédéral », « federale » (NL) et « FÉDÉRAL » sont un même terme.
 *
 * Choix DÉLIBÉRÉMENT conservateur des marqueurs de niveau : seuls des termes
 * fédéraux EXPLICITES comptent (« fédéral/federaal », Chambre/Kamer,
 * « élections fédérales »). Les formulations génériques — « verkiezings-
 * programma », « élections 2024 » — ne sont PAS retenues : le 9 juin 2024, le
 * scrutin fédéral, régional et européen ont eu lieu le même jour, donc un
 * intitulé générique n'affirme aucun niveau. C'est ce qui fait qu'un
 * programme au titre régional-framé (N-VA, « Voor Vlaamse Welvaart ») ne
 * passe pas nettement l'auto-ID sur le niveau et bascule en UNCERTAIN.
 */
import { foldForLexical } from '../extraction/lexical-scan.ts';
import type { ProgrammeTextLayer } from '../extraction/text-layer.ts';
import type { ExpectedIdentity } from './expected-identity.ts';

/** Nombre de premières pages inspectées par défaut. */
export const AUTO_ID_DEFAULT_PAGES = 5;

/**
 * Marqueurs de niveau FÉDÉRAL (forme pliée : minuscules, sans accents),
 * FR + NL. Termes explicites uniquement — voir l'en-tête de module pour le
 * choix conservateur. Les entrées multi-mots sont matchées comme phrases.
 */
const FEDERAL_LEVEL_TERMS: readonly string[] = [
  // FR
  'federal',
  'federale',
  'federales',
  'elections federales',
  'chambre des representants',
  'chambre',
  // NL
  'federaal',
  'federale verkiezingen',
  'kamer van volksvertegenwoordigers',
  'kamer',
];

export interface AutoIdResult {
  /** L'année attendue apparaît dans les premières pages. */
  yearPresent: boolean;
  /** Au moins un marqueur de niveau fédéral explicite apparaît. */
  levelPresent: boolean;
  /** Marqueurs de niveau effectivement trouvés (forme pliée). */
  matchedLevelTerms: string[];
  /** Nombre de pages effectivement inspectées. */
  pagesScanned: number;
}

/** Concatène le texte brut des `count` premières pages d'une couche. */
export function firstPagesText(layer: ProgrammeTextLayer, count = AUTO_ID_DEFAULT_PAGES): string {
  return layer.pages
    .slice(0, count)
    .map((page) => page.text)
    .join('\n');
}

/** Matcher terme→présence : mot entier, ou phrase pour un terme multi-mots. */
function termMatcher(term: string): RegExp {
  const escape = (word: string): string => word.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const body = term.includes(' ')
    ? term.split(/\s+/u).map(escape).join('\\s+')
    : escape(term);
  return new RegExp(`(?<![a-z0-9])${body}(?![a-z0-9])`, 'u');
}

/** L'année (4 chiffres) apparaît-elle comme nombre entier dans le texte plié ? */
function yearMatcher(year: number): RegExp {
  return new RegExp(`(?<![0-9])${year}(?![0-9])`, 'u');
}

/**
 * Contrôle d'auto-identification sur un texte de premières pages déjà extrait
 * (ex. la concaténation de `firstPagesText`). Pur et déterministe.
 */
export function checkAutoIdentification(
  firstPages: string,
  expected: ExpectedIdentity,
  pagesScanned = AUTO_ID_DEFAULT_PAGES,
): AutoIdResult {
  const folded = foldForLexical(firstPages);
  const yearPresent = yearMatcher(expected.year).test(folded);
  const matchedLevelTerms = FEDERAL_LEVEL_TERMS.filter((term) => termMatcher(term).test(folded));
  return {
    yearPresent,
    levelPresent: matchedLevelTerms.length > 0,
    matchedLevelTerms,
    pagesScanned,
  };
}

/** Contrôle d'auto-identification directement à partir d'une couche texte. */
export function checkLayerAutoIdentification(
  layer: ProgrammeTextLayer,
  expected: ExpectedIdentity,
  pages = AUTO_ID_DEFAULT_PAGES,
): AutoIdResult {
  const scanned = Math.min(pages, layer.pages.length);
  return checkAutoIdentification(firstPagesText(layer, pages), expected, scanned);
}
