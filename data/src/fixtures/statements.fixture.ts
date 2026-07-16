/**
 * DONNÉES DE DÉMONSTRATION — entièrement fictives.
 * 8 énoncés sur 4 thèmes, utilisés par le tracer bullet (#16).
 * Aucun de ces énoncés n'a été validé éditorialement.
 */
import type { Statement } from '../schema.ts';

export const STATEMENTS: Statement[] = [
  {
    id: 's1',
    theme: 'fiscalite',
    texte_fr: 'Réduire les cotisations sociales sur les bas salaires.',
    texte_nl: 'De sociale bijdragen op lage lonen verlagen.',
    note_concrete_fr: 'Mesure fictive de démonstration : réduction ciblée sous 3 000 € brut.',
    note_concrete_nl: 'Fictieve demomaatregel: gerichte verlaging onder 3.000 € bruto.',
  },
  {
    id: 's2',
    theme: 'fiscalite',
    texte_fr: 'Instaurer un impôt sur les patrimoines de plus de 5 millions d’euros.',
    texte_nl: 'Een belasting invoeren op vermogens van meer dan 5 miljoen euro.',
    note_concrete_fr: 'Mesure fictive de démonstration : taux progressif à partir de 5 M€.',
    note_concrete_nl: 'Fictieve demomaatregel: progressief tarief vanaf 5 miljoen euro.',
  },
  {
    id: 's3',
    theme: 'mobilite',
    texte_fr: 'Supprimer la TVA sur les billets de train.',
    texte_nl: 'De btw op treintickets afschaffen.',
    note_concrete_fr: 'Mesure fictive de démonstration : TVA à 0 % sur le transport ferroviaire de voyageurs.',
    note_concrete_nl: 'Fictieve demomaatregel: 0% btw op personenvervoer per spoor.',
  },
  {
    id: 's4',
    theme: 'mobilite',
    texte_fr: 'Supprimer progressivement l’avantage fiscal des voitures de société.',
    texte_nl: 'Het fiscale voordeel van bedrijfswagens geleidelijk afschaffen.',
    note_concrete_fr: 'Mesure fictive de démonstration : extinction du régime sur dix ans.',
    note_concrete_nl: 'Fictieve demomaatregel: uitdoving van het stelsel over tien jaar.',
  },
  {
    id: 's5',
    theme: 'energie-climat',
    texte_fr: 'Prolonger deux réacteurs nucléaires de dix ans.',
    texte_nl: 'Twee kernreactoren met tien jaar verlengen.',
    note_concrete_fr: 'Mesure fictive de démonstration : prolongation au-delà de 2035.',
    note_concrete_nl: 'Fictieve demomaatregel: verlenging tot na 2035.',
  },
  {
    id: 's6',
    theme: 'energie-climat',
    texte_fr: 'Interdire les chaudières au mazout dans les constructions neuves.',
    texte_nl: 'Stookolieketels verbieden in nieuwbouw.',
    note_concrete_fr: 'Mesure fictive de démonstration : interdiction à partir de 2027.',
    note_concrete_nl: 'Fictieve demomaatregel: verbod vanaf 2027.',
  },
  {
    id: 's7',
    theme: 'sante',
    texte_fr: 'Étendre le remboursement des consultations psychologiques.',
    texte_nl: 'De terugbetaling van psychologische consultaties uitbreiden.',
    note_concrete_fr: 'Mesure fictive de démonstration : vingt séances remboursées par an.',
    note_concrete_nl: 'Fictieve demomaatregel: twintig terugbetaalde sessies per jaar.',
  },
  {
    id: 's8',
    theme: 'sante',
    texte_fr: 'Autoriser la vente de médicaments sans ordonnance en grande surface.',
    texte_nl: 'De verkoop van vrij verkrijgbare geneesmiddelen in supermarkten toestaan.',
    note_concrete_fr: 'Mesure fictive de démonstration : hors monopole officinal pour les OTC.',
    note_concrete_nl: 'Fictieve demomaatregel: buiten het apotheekmonopolie voor OTC.',
  },
];
