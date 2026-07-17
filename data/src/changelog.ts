/**
 * Public data changelog (#26) — the structured source of truth the /changelog
 * page is generated from at build time.
 *
 * Why a committed file rather than `git log`: the production build (Cloudflare
 * Pages) clones the repository shallowly, so the git history is truncated at
 * build time and cannot be a reliable source. A typed, committed file is
 * deterministic, reviewable in the same PR as the data it describes, and
 * survives any clone depth.
 *
 * Maintenance rule: every PR that merges data (positions added or modified,
 * votes linked, sources snapshot) appends one entry here, in the same PR —
 * the pipeline's PR-preparation command is the natural place to automate it.
 */

/** What kind of data a changelog entry describes. */
export type ChangelogEntryKind = 'positions' | 'votes' | 'sources' | 'methodologie';

/** One public changelog entry: what changed, when, and the proof link. */
export interface ChangelogEntry {
  /** ISO date (YYYY-MM-DD) of the data merge. */
  date: string;
  kind: ChangelogEntryKind;
  titre_fr: string;
  titre_nl: string;
  detail_fr: string;
  detail_nl: string;
  /** Link to the merged PR — the public proof of the change. */
  url_preuve: string;
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    date: '2026-07-16',
    kind: 'positions',
    titre_fr: 'Jeu de démonstration initial',
    titre_nl: 'Initiële demonstratieset',
    detail_fr:
      '6 partis fictifs, 8 énoncés sur 4 thèmes et 46 positions validées (citations et votes liés fictifs), pour exercer le moteur de bout en bout.',
    detail_nl:
      '6 fictieve partijen, 8 stellingen over 4 thema’s en 46 gevalideerde standpunten (fictieve citaten en gekoppelde stemmingen), om de motor end-to-end te testen.',
    url_preuve: 'https://github.com/Thomenrane/voting-helper/pull/28',
  },
  {
    date: '2026-07-16',
    kind: 'sources',
    titre_fr: 'Snapshots des sources officielles',
    titre_nl: 'Snapshots van de officiële bronnen',
    detail_fr:
      'Snapshots datés et empreintes SHA-256 des 13 programmes fédéraux 2024 et des votes nominatifs de la Chambre (législature 56).',
    detail_nl:
      'Gedateerde snapshots en SHA-256-vingerafdrukken van de 13 federale programma’s 2024 en de hoofdelijke stemmingen van de Kamer (legislatuur 56).',
    url_preuve: 'https://github.com/Thomenrane/voting-helper/pull/30',
  },
  {
    date: '2026-07-17',
    kind: 'votes',
    titre_fr: 'Critères de liaison des votes publiés',
    titre_nl: 'Koppelingscriteria voor stemmingen gepubliceerd',
    detail_fr:
      'Les critères qui décident quels votes de la Chambre sont liés à un énoncé (vote final ou amendement direct, procéduraux exclus) sont publiés et implémentés par le pipeline ; les votes liés enregistrent désormais le vote brut du groupe et le sens du dossier.',
    detail_nl:
      'De criteria die bepalen welke Kamerstemmingen aan een stelling worden gekoppeld (eindstemming of rechtstreeks amendement, procedurele uitgesloten) zijn gepubliceerd en door de pipeline geïmplementeerd; gekoppelde stemmingen registreren voortaan de ruwe fractiestem en de richting van het dossier.',
    url_preuve: 'https://github.com/Thomenrane/voting-helper/pull/34',
  },
  {
    date: '2026-07-17',
    kind: 'positions',
    titre_fr: 'Note de contexte datée sur un énoncé',
    titre_nl: 'Gedateerde contextnota bij een stelling',
    detail_fr:
      'Le schéma accepte une note de contexte datée sur un énoncé × parti (revirement documenté) — affichée dans l’audit, sans effet sur le score. Une position de démonstration l’illustre.',
    detail_nl:
      'Het schema aanvaardt een gedateerde contextnota bij een stelling × partij (gedocumenteerde ommekeer) — getoond in de audit, zonder invloed op de score. Eén demostandpunt illustreert dit.',
    url_preuve: 'https://github.com/Thomenrane/voting-helper/pull/35',
  },
];
