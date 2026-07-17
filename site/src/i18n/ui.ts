/**
 * UI strings, keyed by locale. The /nl route consumes the same dictionary —
 * route structure and strings are ready even though only /fr is built for
 * the tracer bullet (#16).
 */
import type { GroupVotePosition, PositionValue } from '@voting-helper/data';
import type { Locale } from './locales.ts';

/** One degree of the 5-point answer scale, in display order. */
interface ScaleOption {
  value: PositionValue;
  label: string;
}

interface UiStrings {
  siteTitle: string;
  metaDescription: string;
  /** Accessible name of the language switcher nav. */
  languageSwitcherLabel: string;
  demoBanner: string;
  heading: string;
  intro: string;
  /** e.g. « basé sur 7/8 énoncés » */
  basedOn: (included: number, total: number) => string;
  notAvailable: string;
  ecartLabel: string;
  ecartMarquantLabel: string;
  contradictionBadge: (count: number) => string;
  methodologyNote: string;
  // Test wizard (#18)
  /** Display label for a statement theme id; falls back to the raw id. */
  themeLabel: (theme: string) => string;
  /** e.g. « Question 3 sur 8 » */
  questionProgress: (current: number, total: number) => string;
  noteLabel: string;
  scaleGroupLabel: string;
  /** The five degrees, strongest agreement first (+2 → −2). */
  scaleOptions: readonly ScaleOption[];
  noOpinionLabel: string;
  noOpinionHint: string;
  previousLabel: string;
  nextLabel: string;
  seeResultsLabel: string;
  resultsHeading: string;
  resultsPrivacyNote: string;
  restartLabel: string;
  noscriptNotice: string;
  // Results screen (#19)
  promessesColumnHeading: string;
  actesColumnHeading: string;
  auditHeading: string;
  auditIntro: string;
  programmeEvidenceLabel: string;
  votesEvidenceLabel: string;
  /** e.g. « Position : Tout à fait d'accord » — label from scaleOptions. */
  positionLabel: (scaleLabel: string) => string;
  positionNotDocumented: string;
  positionNotDocumentedHint: string;
  noLinkedVotes: string;
  /** Short badge on a statement where the party voted against its programme. */
  contradictionTag: string;
  /** How the party's group voted, relative to the statement's direction. */
  voteDirection: Record<GroupVotePosition, string>;
  exactQuoteLabel: string;
  pageRef: (page: number) => string;
  sourceLinkLabel: string;
}

const THEME_LABELS_FR: Record<string, string> = {
  fiscalite: 'Fiscalité',
  mobilite: 'Mobilité',
  'energie-climat': 'Énergie & climat',
  sante: 'Santé',
};

const THEME_LABELS_NL: Record<string, string> = {
  fiscalite: 'Fiscaliteit',
  mobilite: 'Mobiliteit',
  'energie-climat': 'Energie & klimaat',
  sante: 'Gezondheid',
};

export const UI: Record<Locale, UiStrings> = {
  fr: {
    siteTitle: 'Test électoral fédéral — démonstration',
    metaDescription:
      'Répondez à des énoncés concrets et comparez votre alignement avec ce que les partis promettent et ce qu’ils votent — données fictives de démonstration.',
    languageSwitcherLabel: 'Choix de la langue',
    demoBanner: 'Démonstration — partis et positions entièrement fictifs.',
    heading: 'Ce qu’ils promettent. Ce qu’ils votent.',
    intro:
      'Pour chaque parti, deux scores distincts — jamais fusionnés : votre alignement sur son programme (promesses) et sur ses votes à la Chambre (actes).',
    basedOn: (included, total) => `basé sur ${included}/${total} énoncés`,
    notAvailable: 'n.d.',
    ecartLabel: 'écart',
    ecartMarquantLabel: 'écart marquant',
    contradictionBadge: (count) =>
      count === 1 ? '1 promesse vs vote' : `${count} promesses vs votes`,
    methodologyNote:
      'Score = 100 × (1 − distance moyenne normalisée) sur les énoncés où une position est documentée. Un énoncé sans opinion, sans position programme ou sans vote lié est exclu du score concerné — jamais compté comme neutre.',
    themeLabel: (theme) => THEME_LABELS_FR[theme] ?? theme,
    questionProgress: (current, total) => `Question ${current} sur ${total}`,
    noteLabel: 'Mesure concrète',
    scaleGroupLabel: 'Votre position sur cet énoncé',
    scaleOptions: [
      { value: 2, label: 'Tout à fait d’accord' },
      { value: 1, label: 'Plutôt d’accord' },
      { value: 0, label: 'Neutre' },
      { value: -1, label: 'Plutôt contre' },
      { value: -2, label: 'Tout à fait contre' },
    ],
    noOpinionLabel: 'Sans opinion',
    noOpinionHint: 'Cet énoncé ne comptera pas dans votre calcul.',
    previousLabel: 'Précédent',
    nextLabel: 'Suivant',
    seeResultsLabel: 'Voir mes résultats',
    resultsHeading: 'Vos résultats',
    resultsPrivacyNote:
      'Calculés dans votre navigateur — vos réponses ne le quittent jamais.',
    restartLabel: 'Recommencer le test',
    noscriptNotice:
      'Le test se déroule entièrement dans votre navigateur et nécessite JavaScript. Activez-le pour répondre aux énoncés.',
    promessesColumnHeading: 'Ce qu’ils promettent',
    actesColumnHeading: 'Ce qu’ils ont voté',
    auditHeading: 'Vérifier les preuves',
    auditIntro:
      'Chaque score se vérifie : ouvrez un parti, puis un énoncé, pour lire la citation exacte du programme et les votes liés.',
    programmeEvidenceLabel: 'Programme',
    votesEvidenceLabel: 'Votes liés',
    positionLabel: (scaleLabel) => `Position : ${scaleLabel}`,
    positionNotDocumented: 'Position non documentée',
    positionNotDocumentedHint:
      'Aucune position validée dans le programme de ce parti sur cet énoncé — exclu de son score promesses.',
    noLinkedVotes: 'Aucun vote lié — énoncé exclu du score actes.',
    contradictionTag: 'Promesse vs vote',
    voteDirection: {
      oui: 'A voté pour',
      abstention: 'S’est abstenu',
      non: 'A voté contre',
    },
    exactQuoteLabel: 'Citation exacte (langue source)',
    pageRef: (page) => `p. ${page}`,
    sourceLinkLabel: 'Source',
  },
  nl: {
    siteTitle: 'Federale stemtest — demonstratie',
    metaDescription:
      'Beantwoord concrete stellingen en vergelijk uw overeenstemming met wat partijen beloven en wat ze stemmen — fictieve demonstratiegegevens.',
    languageSwitcherLabel: 'Taalkeuze',
    demoBanner: 'Demonstratie — partijen en standpunten zijn volledig fictief.',
    heading: 'Wat ze beloven. Wat ze stemmen.',
    intro:
      'Per partij twee aparte scores — nooit samengevoegd: uw overeenstemming met het programma (beloften) en met de stemmingen in de Kamer (daden).',
    basedOn: (included, total) => `op basis van ${included}/${total} stellingen`,
    notAvailable: 'n.b.',
    ecartLabel: 'kloof',
    ecartMarquantLabel: 'opvallende kloof',
    contradictionBadge: (count) =>
      count === 1 ? '1 belofte vs stem' : `${count} beloften vs stemmen`,
    methodologyNote:
      'Score = 100 × (1 − genormaliseerde gemiddelde afstand) over de stellingen met een gedocumenteerd standpunt. Een stelling zonder mening, zonder programmastandpunt of zonder gekoppelde stemming wordt uitgesloten van de betrokken score — nooit als neutraal geteld.',
    themeLabel: (theme) => THEME_LABELS_NL[theme] ?? theme,
    questionProgress: (current, total) => `Vraag ${current} van ${total}`,
    noteLabel: 'Concrete maatregel',
    scaleGroupLabel: 'Uw standpunt over deze stelling',
    scaleOptions: [
      { value: 2, label: 'Helemaal akkoord' },
      { value: 1, label: 'Eerder akkoord' },
      { value: 0, label: 'Neutraal' },
      { value: -1, label: 'Eerder tegen' },
      { value: -2, label: 'Helemaal tegen' },
    ],
    noOpinionLabel: 'Geen mening',
    noOpinionHint: 'Deze stelling telt niet mee in uw berekening.',
    previousLabel: 'Vorige',
    nextLabel: 'Volgende',
    seeResultsLabel: 'Bekijk mijn resultaten',
    resultsHeading: 'Uw resultaten',
    resultsPrivacyNote: 'Berekend in uw browser — uw antwoorden verlaten hem nooit.',
    restartLabel: 'De test opnieuw beginnen',
    noscriptNotice:
      'De test verloopt volledig in uw browser en vereist JavaScript. Schakel het in om de stellingen te beantwoorden.',
    promessesColumnHeading: 'Wat ze beloven',
    actesColumnHeading: 'Wat ze stemden',
    auditHeading: 'Controleer het bewijs',
    auditIntro:
      'Elke score is controleerbaar: open een partij en daarna een stelling om het exacte programmacitaat en de gekoppelde stemmingen te lezen.',
    programmeEvidenceLabel: 'Programma',
    votesEvidenceLabel: 'Gekoppelde stemmingen',
    positionLabel: (scaleLabel) => `Standpunt: ${scaleLabel}`,
    positionNotDocumented: 'Geen gedocumenteerd standpunt',
    positionNotDocumentedHint:
      'Geen gevalideerd standpunt in het programma van deze partij over deze stelling — uitgesloten van haar score beloften.',
    noLinkedVotes: 'Geen gekoppelde stemming — stelling uitgesloten van de score daden.',
    contradictionTag: 'Belofte vs stem',
    voteDirection: {
      oui: 'Stemde voor',
      abstention: 'Onthield zich',
      non: 'Stemde tegen',
    },
    exactQuoteLabel: 'Exact citaat (brontaal)',
    pageRef: (page) => `p. ${page}`,
    sourceLinkLabel: 'Bron',
  },
};
