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
 * Choix DÉLIBÉRÉMENT conservateur des marqueurs de niveau : le document doit se
 * DÉCLARER programme fédéral, pas seulement MENTIONNER le fédéral. Seules des
 * PHRASES FORTES d'auto-désignation fédérale comptent (« élections fédérales »,
 * « chambre des représentants », « federale verkiezingen », « kamer van
 * volksvertegenwoordigers », variantes proches). Les JETONS NUS (« fédéral »,
 * « federale », « federaal », « chambre », « kamer ») sont exclus : ils
 * apparaissent dans quasiment tout document politique belge — y compris un
 * programme régional/nationaliste flamand qui PARLE du fédéral (« de federale
 * overheid », « federale regering », « la Chambre ») sans être un programme
 * fédéral. Les compter donnerait un faux `level.present` (donc un faux PASS)
 * sur exactement les cas durs du ticket. De même, les formulations génériques
 * (« verkiezingsprogramma 2024 », « élections 2024 ») n'affirment aucun niveau :
 * le 9 juin 2024, les scrutins fédéral, régional et européen ont partagé la
 * date. C'est ce qui fait qu'un programme au titre régional-framé (N-VA,
 * « Voor Vlaamse Welvaart »), même quand il discute du fédéral, ne passe pas
 * nettement l'auto-ID sur le niveau et bascule en UNCERTAIN.
 *
 * ANNÉE : l'année attendue ne suffit pas isolée (« budget 2024 » ne dit rien) ;
 * elle doit apparaître À PROXIMITÉ d'un marqueur d'auto-désignation de
 * programme (« programme », « programma », « verkiezingsprogramma »).
 */
import { foldForLexical } from '../extraction/lexical-scan.ts';
import type { ProgrammeTextLayer } from '../extraction/text-layer.ts';
import type { ExpectedIdentity } from './expected-identity.ts';

/** Nombre de premières pages inspectées par défaut. */
export const AUTO_ID_DEFAULT_PAGES = 5;

/**
 * Marqueurs de niveau FÉDÉRAL (forme pliée : minuscules, sans accents),
 * FR + NL. PHRASES FORTES d'auto-désignation UNIQUEMENT — jamais de jeton nu
 * (voir l'en-tête de module). Le document doit se déclarer programme fédéral,
 * pas seulement mentionner le fédéral. Toutes multi-mots, matchées comme
 * phrases (espaces = un ou plusieurs séparateurs blancs).
 */
const FEDERAL_LEVEL_TERMS: readonly string[] = [
  // FR — le scrutin/l'institution fédéraux, nommés explicitement.
  'elections federales',
  'elections legislatives federales',
  'chambre des representants',
  // NL — idem.
  'federale verkiezingen',
  'federaal verkiezingsprogramma',
  'kamer van volksvertegenwoordigers',
];

/**
 * Marqueurs d'auto-désignation d'un programme (forme pliée), FR + NL.
 * L'année n'est retenue que si elle apparaît à proximité de l'un d'eux —
 * « verkiezingsprogramma » englobe « programma » par sous-chaîne.
 */
const PROGRAMME_MARKERS: readonly string[] = ['programme', 'programma'];

/** Distance max (caractères) entre l'année et un marqueur de programme. */
export const YEAR_PROXIMITY_CHARS = 80;

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

/** Indices de début de chaque occurrence entière de l'année dans le texte plié. */
function yearStarts(folded: string, year: number): number[] {
  const regex = new RegExp(`(?<![0-9])${year}(?![0-9])`, 'gu');
  const starts: number[] = [];
  for (let match = regex.exec(folded); match !== null; match = regex.exec(folded)) {
    starts.push(match.index);
  }
  return starts;
}

/** Indices de début de chaque marqueur d'auto-désignation de programme. */
function markerStarts(folded: string): number[] {
  const starts: number[] = [];
  for (const marker of PROGRAMME_MARKERS) {
    let from = folded.indexOf(marker);
    while (from !== -1) {
      starts.push(from);
      from = folded.indexOf(marker, from + 1);
    }
  }
  return starts;
}

/**
 * L'année attendue apparaît-elle À PROXIMITÉ (≤ YEAR_PROXIMITY_CHARS) d'un
 * marqueur de programme ? Une année isolée (« budget 2024 ») ne suffit pas.
 */
function yearNearProgramme(folded: string, year: number): boolean {
  const years = yearStarts(folded, year);
  if (years.length === 0) return false;
  const markers = markerStarts(folded);
  return years.some((y) => markers.some((m) => Math.abs(y - m) <= YEAR_PROXIMITY_CHARS));
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
  const yearPresent = yearNearProgramme(folded, expected.year);
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
