/**
 * DONNÉES DE DÉMONSTRATION — positions de partis entièrement fictives.
 * Citations, sources, snapshots, dossiers et votes sont inventés.
 *
 * Cas volontairement couverts par ce jeu de données :
 * - Parti B : votes opposés au programme sur s1 et s5 (badge « promesse vs vote »).
 * - Parti C : position programme absente sur s2 (« position non documentée »).
 * - Parti D : aucun vote lié sur s4 et s6 (exclus du score « actes »).
 * - Parti F : record s7 en statut « en_attente » (exclu du calcul), aucun record s3.
 */
import type {
  Citation,
  DossierDirection,
  GroupVotePosition,
  LinkedVote,
  PartyPosition,
  PositionValue,
} from '../schema.ts';

/** Fabrique une citation fictive de démonstration. */
function demoCitation(partyId: string, statementId: string, page: number): Citation {
  return {
    texte: `Citation fictive de démonstration pour ${partyId} sur ${statementId}.`,
    url_source: `https://example.org/demo/programme-${partyId}-2024.pdf`,
    ref_snapshot: `snapshots/demo/${partyId}-2024.pdf`,
    page,
  };
}

/**
 * Fabrique un vote lié fictif de démonstration (schéma m3) : vote BRUT du
 * groupe sur le dossier + direction du dossier par rapport à l'énoncé. La
 * position relative (+2/0/−2) est toujours dérivée via deriveVotePosition.
 */
function demoVote(
  id: string,
  vote_groupe: GroupVotePosition,
  direction_dossier: DossierDirection = 'soutient',
): LinkedVote {
  return {
    id,
    date: '2025-03-15',
    dossier: `DOC 56 ${id.toUpperCase()}/001 (fictif)`,
    vote_groupe,
    direction_dossier,
    justification: 'Vote fictif de démonstration lié directement à la mesure de l’énoncé.',
  };
}

/**
 * Fabrique un record parti × énoncé complet (programme + votes). `votes`
 * donne le vote brut du groupe ; `directions` (optionnel, aligné par index)
 * la direction du dossier — 'soutient' par défaut.
 */
function demoPosition(
  partyId: string,
  statementId: string,
  position: PositionValue,
  votes: GroupVotePosition[],
  page: number,
  directions: DossierDirection[] = [],
): PartyPosition {
  return {
    party_id: partyId,
    statement_id: statementId,
    position,
    citation: demoCitation(partyId, statementId, page),
    votes_lies: votes.map((v, i) =>
      demoVote(`${partyId}-${statementId}-v${i + 1}`, v, directions[i] ?? 'soutient'),
    ),
    statut: 'valide',
    derniere_revision: '2026-06-01',
  };
}

export const PARTY_POSITIONS: PartyPosition[] = [
  // Parti A — couverture complète, votes cohérents avec le programme.
  demoPosition('parti-a', 's1', 2, ['oui'], 12),
  demoPosition('parti-a', 's2', 1, ['oui'], 18),
  demoPosition('parti-a', 's3', 1, ['oui'], 24),
  demoPosition('parti-a', 's4', -1, ['abstention'], 31),
  demoPosition('parti-a', 's5', 2, ['oui'], 40),
  demoPosition('parti-a', 's6', 0, ['abstention'], 47),
  demoPosition('parti-a', 's7', 1, ['oui'], 55),
  demoPosition('parti-a', 's8', -1, ['non'], 62),

  // Parti B — promesses proches du profil démo, mais votes opposés sur s1 et s5.
  // s1 exerce le chemin « contredit » du schéma m3 : le groupe a voté « oui »
  // sur un dossier qui contredit l'énoncé — position dérivée −2, identique à
  // un « non » sur un dossier qui le soutient (s5).
  demoPosition('parti-b', 's1', 2, ['oui'], 9, ['contredit']),
  demoPosition('parti-b', 's2', 1, ['oui'], 15),
  demoPosition('parti-b', 's3', 0, ['abstention'], 22),
  demoPosition('parti-b', 's4', -2, ['non'], 28),
  demoPosition('parti-b', 's5', 2, ['non'], 36),
  demoPosition('parti-b', 's6', 1, ['oui'], 44),
  demoPosition('parti-b', 's7', 2, ['oui'], 51),
  demoPosition('parti-b', 's8', -2, ['abstention'], 59),

  // Parti C — position programme absente sur s2 (votes présents malgré tout).
  demoPosition('parti-c', 's1', 1, ['oui'], 11),
  {
    party_id: 'parti-c',
    statement_id: 's2',
    votes_lies: [demoVote('parti-c-s2-v1', 'non')],
    statut: 'valide',
    derniere_revision: '2026-06-01',
  },
  demoPosition('parti-c', 's3', -1, ['non'], 25),
  demoPosition('parti-c', 's4', 1, ['oui'], 33),
  demoPosition('parti-c', 's5', -2, ['non'], 41),
  demoPosition('parti-c', 's6', 2, ['oui'], 48),
  demoPosition('parti-c', 's7', 0, ['abstention'], 54),
  demoPosition('parti-c', 's8', 1, ['oui'], 61),

  // Parti D — aucun vote lié sur s4 et s6 ; deux votes liés (moyenne) sur s5.
  demoPosition('parti-d', 's1', 0, ['abstention'], 8),
  demoPosition('parti-d', 's2', -1, ['non'], 14),
  demoPosition('parti-d', 's3', 2, ['oui'], 21),
  demoPosition('parti-d', 's4', -2, [], 29),
  demoPosition('parti-d', 's5', 1, ['oui', 'abstention'], 37),
  demoPosition('parti-d', 's6', -1, [], 45),
  demoPosition('parti-d', 's7', 1, ['oui'], 52),
  demoPosition('parti-d', 's8', 0, ['abstention'], 60),

  // Parti E — largement opposé au profil démo.
  demoPosition('parti-e', 's1', -2, ['non'], 10),
  demoPosition('parti-e', 's2', -2, ['non'], 16),
  demoPosition('parti-e', 's3', 1, ['oui'], 23),
  demoPosition('parti-e', 's4', 2, ['oui'], 30),
  demoPosition('parti-e', 's5', -2, ['non'], 38),
  demoPosition('parti-e', 's6', -1, ['abstention'], 46),
  demoPosition('parti-e', 's7', -1, ['non'], 53),
  demoPosition('parti-e', 's8', 2, ['oui'], 63),

  // Parti F — s7 en attente de validation (exclu), aucun record pour s3.
  demoPosition('parti-f', 's1', 1, ['oui'], 7),
  demoPosition('parti-f', 's2', 0, ['abstention'], 13),
  demoPosition('parti-f', 's4', -1, ['non'], 27),
  demoPosition('parti-f', 's5', 2, ['oui'], 35),
  demoPosition('parti-f', 's6', 1, ['oui'], 43),
  {
    party_id: 'parti-f',
    statement_id: 's7',
    position: 2,
    citation: demoCitation('parti-f', 's7', 50),
    votes_lies: [demoVote('parti-f-s7-v1', 'oui')],
    statut: 'en_attente',
    derniere_revision: '2026-06-15',
  },
  demoPosition('parti-f', 's8', -2, ['non'], 58),
];
