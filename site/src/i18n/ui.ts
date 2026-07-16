/**
 * UI strings, keyed by locale. The /nl route consumes the same dictionary —
 * route structure and strings are ready even though only /fr is built for
 * the tracer bullet (#16).
 */
export const LOCALES = ['fr', 'nl'] as const;
export type Locale = (typeof LOCALES)[number];

interface UiStrings {
  siteTitle: string;
  metaDescription: string;
  demoBanner: string;
  heading: string;
  intro: string;
  promessesLabel: string;
  actesLabel: string;
  /** e.g. « basé sur 7/8 énoncés » */
  basedOn: (included: number, total: number) => string;
  notAvailable: string;
  ecartLabel: string;
  ecartMarquantLabel: string;
  contradictionBadge: (count: number) => string;
  methodologyNote: string;
}

export const UI: Record<Locale, UiStrings> = {
  fr: {
    siteTitle: 'Test électoral fédéral — démonstration',
    metaDescription:
      'Classement de démonstration : alignement promesses et actes par parti, calculé sur des données fictives.',
    demoBanner: 'Démonstration — partis et positions entièrement fictifs.',
    heading: 'Ce qu’ils promettent. Ce qu’ils votent.',
    intro:
      'Pour chaque parti, deux scores distincts — jamais fusionnés : votre alignement sur son programme (promesses) et sur ses votes à la Chambre (actes).',
    promessesLabel: 'Promesses',
    actesLabel: 'Actes',
    basedOn: (included, total) => `basé sur ${included}/${total} énoncés`,
    notAvailable: 'n.d.',
    ecartLabel: 'écart',
    ecartMarquantLabel: 'écart marquant',
    contradictionBadge: (count) =>
      count === 1 ? '1 promesse vs vote' : `${count} promesses vs votes`,
    methodologyNote:
      'Score = 100 × (1 − distance moyenne normalisée) sur les énoncés où une position est documentée. Un énoncé sans opinion, sans position programme ou sans vote lié est exclu du score concerné — jamais compté comme neutre.',
  },
  nl: {
    siteTitle: 'Federale stemtest — demonstratie',
    metaDescription:
      'Demonstratieklassement: overeenstemming met beloften en daden per partij, berekend op fictieve gegevens.',
    demoBanner: 'Demonstratie — partijen en standpunten zijn volledig fictief.',
    heading: 'Wat ze beloven. Wat ze stemmen.',
    intro:
      'Per partij twee aparte scores — nooit samengevoegd: uw overeenstemming met het programma (beloften) en met de stemmingen in de Kamer (daden).',
    promessesLabel: 'Beloften',
    actesLabel: 'Daden',
    basedOn: (included, total) => `op basis van ${included}/${total} stellingen`,
    notAvailable: 'n.b.',
    ecartLabel: 'kloof',
    ecartMarquantLabel: 'opvallende kloof',
    contradictionBadge: (count) =>
      count === 1 ? '1 belofte vs stem' : `${count} beloften vs stemmen`,
    methodologyNote:
      'Score = 100 × (1 − genormaliseerde gemiddelde afstand) over de stellingen met een gedocumenteerd standpunt. Een stelling zonder mening, zonder programmastandpunt of zonder gekoppelde stemming wordt uitgesloten van de betrokken score — nooit als neutraal geteld.',
  },
};
