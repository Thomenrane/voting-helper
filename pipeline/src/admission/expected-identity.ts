/**
 * Registre d'identité ATTENDUE par parti — le contrat de référence du portail
 * d'admission des sources (#42).
 *
 * Le SHA-256 committé de #21 prouve l'INTÉGRITÉ (les octets extraits sont bien
 * ceux snapshotés), jamais la CORRECTION de la source : rien n'y garantit que
 * le document figé est bien le programme *fédéral 2024 officiel et complet*.
 * Ce registre formalise, parti par parti, ce que la source DOIT être — titre,
 * année, niveau, structure, pages attendues — pour que les contrôles
 * d'admission (auto-identification + complétude) aient une référence contre
 * laquelle statuer.
 *
 * Seedé depuis la note de recherche
 * `docs/research/programmes-partis.md` (branche research/programmes-partis,
 * vérifications du 16/07/2026). Chaque `source_id` référence PROGRAMME_SOURCES
 * (le registre #21) ; l'absence de dérive est vérifiée par
 * expected-identity.test.ts.
 */
import { PARTY_PROGRAMMES } from '../sources/party-programmes.ts';
import { PROGRAMME_SOURCES } from '../sources/programmes.sources.ts';

/**
 * Structure attendue du programme :
 * - `single-pdf` : un unique PDF complet (PS, MR, Vooruit…) ;
 * - `n-booklets` : plusieurs PDF séparés qui, ensemble, forment le programme
 *   (DéFI = 5 livrets « Axes » ; Open Vld = programme + plan chiffré) —
 *   l'incomplétude silencieuse la plus dangereuse est un livret manquant ;
 * - `web-chapters` : chapitres web sans PDF national (PTB/PVDA) ; la couche
 *   texte par page ne les couvre pas encore (limitation connue #22), donc les
 *   contrôles fondés sur les pages n'y sont pas applicables.
 */
export type ProgrammeStructure = 'single-pdf' | 'n-booklets' | 'web-chapters';

/** Niveau de scrutin attendu. Le corpus #25 ne vise que le fédéral 2024. */
export type GovernmentLevel = 'federal';

/** Une partie déclarée du programme (un PDF, ou un index de chapitres web). */
export interface ExpectedPart {
  /** `source_id` de PROGRAMME_SOURCES (#21). Jamais renommé. */
  source_id: string;
  /** Libellé humain de la partie (ex. « Axe 1 »). */
  label: string;
  /**
   * Pages attendues de CETTE partie (approximatif, cf. note de recherche).
   * `null` pour une structure `web-chapters` (pas de pagination PDF).
   */
  expected_pages: number | null;
}

/** Identité attendue d'un parti — la référence d'admission. */
export interface ExpectedIdentity {
  /** `party_id` canonique de PARTY_PROGRAMMES. */
  party_id: string;
  /** Titre attendu du programme 2024 (forme de la note de recherche). */
  title: string;
  /** Année d'édition attendue. */
  year: number;
  /** Niveau de scrutin attendu. */
  level: GovernmentLevel;
  structure: ProgrammeStructure;
  /**
   * Total de pages attendu sur l'ensemble des parties (approximatif).
   * `null` pour `web-chapters` (pas de pagination).
   */
  expected_pages: number | null;
  /** Parties déclarées (≥ 1). Pour `single-pdf`, exactement une. */
  parts: readonly ExpectedPart[];
}

/**
 * Le registre. Une entrée par parti de PARTY_PROGRAMMES ; les `source_id` des
 * parties sont exactement ceux du programme du parti dans le registre #21
 * (invariant vérifié par le test — toute dérive est une erreur).
 */
export const EXPECTED_IDENTITIES: readonly ExpectedIdentity[] = [
  {
    party_id: 'ps',
    title: 'Programme du Parti Socialiste — élections du 9 juin 2024',
    year: 2024,
    level: 'federal',
    structure: 'single-pdf',
    expected_pages: 1220,
    parts: [{ source_id: 'ps-programme-2024', label: 'Programme complet', expected_pages: 1220 }],
  },
  {
    party_id: 'mr',
    // Le PDF « complet » (311 p.), PAS la synthèse (100 p.) : le piège type que
    // la tolérance de pages doit détecter si les deux se retrouvaient inversés.
    title: 'MR — Programme 2024 (complet)',
    year: 2024,
    level: 'federal',
    structure: 'single-pdf',
    expected_pages: 311,
    parts: [{ source_id: 'mr-programme-2024', label: 'Programme complet', expected_pages: 311 }],
  },
  {
    party_id: 'les-engages',
    title: 'Les Engagés — « Regardons la réalité. Changeons de modèle. »',
    year: 2024,
    level: 'federal',
    structure: 'single-pdf',
    expected_pages: 355,
    parts: [
      { source_id: 'les-engages-programme-2024', label: 'Programme complet', expected_pages: 355 },
    ],
  },
  {
    party_id: 'ecolo',
    title: 'Ecolo — Programme 2024 consolidé',
    year: 2024,
    level: 'federal',
    structure: 'single-pdf',
    expected_pages: 338,
    parts: [
      { source_id: 'ecolo-programme-2024', label: 'Programme consolidé', expected_pages: 338 },
    ],
  },
  {
    party_id: 'defi',
    title: 'DéFI — 5 livrets « Axes de campagne »',
    year: 2024,
    level: 'federal',
    structure: 'n-booklets',
    expected_pages: 292,
    parts: [
      { source_id: 'defi-axe-1-2024', label: 'Axe 1 — Belgique en état de fonctionner', expected_pages: 44 },
      { source_id: 'defi-axe-2-2024', label: 'Axe 2 — Laïcité politique', expected_pages: 28 },
      { source_id: 'defi-axe-3-2024', label: "Axe 3 — Esprit d'entreprendre", expected_pages: 36 },
      { source_id: 'defi-axe-4-2024', label: 'Axe 4 — Contrat social plus juste', expected_pages: 84 },
      { source_id: 'defi-axe-5-2024', label: 'Axe 5 — Développement durable', expected_pages: 100 },
    ],
  },
  {
    party_id: 'nva',
    // Programme combiné (volets flamand, fédéral et européen) au titre framé
    // « flamand ». Le volet fédéral 2024 existe mais le niveau n'est pas
    // affirmé nettement en couverture — cas concret à trancher (#42).
    title: 'N-VA — « Voor Vlaamse Welvaart » (verkiezingsprogramma 2024)',
    year: 2024,
    level: 'federal',
    structure: 'single-pdf',
    expected_pages: 120,
    parts: [{ source_id: 'nva-programme-2024', label: 'Programme complet', expected_pages: 120 }],
  },
  {
    party_id: 'vlaams-belang',
    title: 'Vlaams Belang — « Vlaanderen weer van ons »',
    year: 2024,
    level: 'federal',
    structure: 'single-pdf',
    expected_pages: 100,
    parts: [
      { source_id: 'vlaams-belang-programme-2024', label: 'Programme complet', expected_pages: 100 },
    ],
  },
  {
    party_id: 'vooruit',
    title: 'Vooruit — Verkiezingsprogramma 2024',
    year: 2024,
    level: 'federal',
    structure: 'single-pdf',
    expected_pages: 288,
    parts: [
      { source_id: 'vooruit-programme-2024', label: 'Programme complet', expected_pages: 288 },
    ],
  },
  {
    party_id: 'cdv',
    title: 'CD&V — « Kies zekerheid » (congrès 21/04/2024)',
    year: 2024,
    level: 'federal',
    structure: 'single-pdf',
    expected_pages: 442,
    parts: [{ source_id: 'cdv-programme-2024', label: 'Programme complet', expected_pages: 442 }],
  },
  {
    party_id: 'open-vld',
    title: 'Open Vld (→ Anders.) — Partijprogramma v1.0.9 + Becijferd groeiplan',
    year: 2024,
    level: 'federal',
    structure: 'n-booklets',
    expected_pages: 186,
    parts: [
      { source_id: 'open-vld-partijprogramma-2024', label: 'Partijprogramma v1.0.9', expected_pages: 156 },
      { source_id: 'open-vld-becijferd-groeiplan-2024', label: 'Becijferd groeiplan', expected_pages: 30 },
    ],
  },
  {
    party_id: 'groen',
    title: 'Groen — « Groen voor verandering »',
    year: 2024,
    level: 'federal',
    structure: 'single-pdf',
    // 45 pages PDF en planches doubles (≈85 pages imprimées). La couche texte
    // compte les pages PDF, donc l'attendu est 45.
    expected_pages: 45,
    parts: [{ source_id: 'groen-programme-2024', label: 'Programme complet', expected_pages: 45 }],
  },
  {
    party_id: 'ptb-pvda',
    // Parti unitaire, deux miroirs de langue. Chapitres web, aucun PDF national :
    // la couche texte par page ne les couvre pas → contrôles fondés sur les
    // pages non applicables ; l'admission reste conservatrice (UNCERTAIN).
    title: 'PTB-PVDA — Programme (chapitres web, miroirs FR + NL)',
    year: 2024,
    level: 'federal',
    structure: 'web-chapters',
    expected_pages: null,
    parts: [
      { source_id: 'ptb-programme-2024', label: 'PTB — chapitres web (FR)', expected_pages: null },
      { source_id: 'pvda-programme-2024', label: 'PVDA — chapitres web (NL)', expected_pages: null },
    ],
  },
];

/** Identité attendue d'un parti. Lève si le parti est inconnu du registre. */
export function getExpectedIdentity(partyId: string): ExpectedIdentity {
  const identity = EXPECTED_IDENTITIES.find((entry) => entry.party_id === partyId);
  if (identity === undefined) {
    const known = EXPECTED_IDENTITIES.map((entry) => entry.party_id).join(', ');
    throw new Error(`Aucune identité attendue pour le parti '${partyId}'. Partis connus : ${known}.`);
  }
  return identity;
}

/** Vrai si un `source_id` du registre #21 existe. Sert au garde anti-dérive. */
export function isKnownProgrammeSource(sourceId: string): boolean {
  return PROGRAMME_SOURCES.some((source) => source.id === sourceId);
}

/** Les `party_id` couverts par le registre d'identité attendue. */
export function expectedIdentityPartyIds(): string[] {
  return EXPECTED_IDENTITIES.map((entry) => entry.party_id);
}

/** Les `party_id` du registre #21 des programmes (référence de couverture). */
export function programmePartyIds(): string[] {
  return PARTY_PROGRAMMES.map((entry) => entry.party_id);
}
