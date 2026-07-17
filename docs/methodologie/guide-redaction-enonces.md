# Guide de rédaction des énoncés

Ce document décrit comment les 35 énoncés du test sont produits, mesurés,
sélectionnés et rédigés. Il est publiable tel quel et fait foi : l'outillage
du pipeline (`pipeline/src/statements/`) implémente exactement les mesures
décrites ici, et toute évolution des règles passe par une mise à jour de ce
document dans la même pull request.

Un énoncé est une proposition concrète en une phrase, à laquelle
l'utilisateur répond sur 5 degrés (+2 à −2) ou « sans opinion ». Les mêmes
énoncés portent les deux scores du test : ce que les partis **promettent**
(programmes 2024) et ce qu'ils ont **voté** (votes nominatifs à la Chambre).
La qualité du test entier repose donc sur la qualité de ces 35 phrases.

## Les quatre règles

Chaque énoncé retenu satisfait les quatre règles, sans exception. Un énoncé
qui échoue à une seule règle est réécrit ou remplacé.

### 1. Discriminant — les partis se répartissent

Un énoncé sur lequel tous les partis sont d'accord n'apprend rien à
l'utilisateur et gaspille une des 35 places. Un bon énoncé sépare les partis
en camps identifiables.

- ✅ « Instaurer un impôt sur les patrimoines de plus de 5 millions
  d'euros. » — les positions documentées s'étalent de +2 à −2.
- ❌ « Lutter contre la fraude fiscale. » — tous les programmes le
  promettent : consensus, discriminance nulle.

La discriminance n'est pas un jugement : elle est **mesurée** sur les
positions codées par parti (voir « La mesure de discriminance » ci-dessous)
et le classement du pool est publié dans le rapport de sélection.

### 2. Une phrase simple — compréhensible par tout le monde

L'énoncé tient en une phrase, sans jargon, sans sigle non expliqué, sans
double négation, lisible sans connaissance politique préalable. La mesure
concrète exacte (chiffres, seuils, échéances) vit dans la note
(`note_concrete`), affichée sous l'énoncé — pas dans la phrase.

- ✅ « Relever l'âge légal de la pension à 67 ans. »
  (note : « Âge légal porté de 66 à 67 ans en 2030. »)
- ❌ « Réformer le premier pilier des pensions dans le cadre de
  l'enveloppe bien-être conformément au CSE. » — trois notions expertes
  dans une phrase.
- ❌ « Ne pas revenir sur l'interdiction de sortie du nucléaire. » —
  double négation : approuver la phrase, c'est refuser un refus.

Une seule mesure par énoncé : si la phrase contient « et », elle cache
probablement deux énoncés.

### 3. Traçable — au moins une mesure de programme ou un vote

Chaque énoncé doit pouvoir être scoré sur au moins une preuve : une mesure
identifiable dans au moins un programme officiel 2024 (citation exacte,
vérifiée mécaniquement), ou un vote nominatif en séance plénière liable
selon les critères publiés (`criteres-liaison-votes.md`). Un énoncé
inventé — même excellent — n'est pas testable et n'entre pas dans les 35.

- ✅ Un énoncé issu du pool : il porte ses sources (parti + page + snapshot,
  ou vote + dossier DOC) dès sa naissance.
- ❌ « Les politiciens devraient être plus honnêtes. » — aucune mesure de
  programme, aucun vote : rien à scorer.

C'est pourquoi le pool de candidats est généré **depuis le corpus**
(programmes snapshotés et dossiers votés) et jamais depuis l'imagination du
rédacteur ou du modèle.

### 4. Neutre — le framing ne souffle pas la réponse

La formulation ne doit pas laisser deviner la « bonne » réponse : pas de
vocabulaire valorisant ou péjoratif, pas de cause implicite, pas d'appel à
l'émotion. Test pratique : un militant convaincu de chaque bord doit
pouvoir lire l'énoncé et le trouver correctement posé.

- ✅ « Supprimer progressivement l'avantage fiscal des voitures de
  société. »
- ❌ « Supprimer enfin le privilège fiscal injuste des voitures de
  société. » — « enfin », « privilège », « injuste » : la réponse est
  soufflée.
- ❌ « Protéger nos pensions en travaillant plus longtemps. » — le bénéfice
  affirmé (« protéger ») est précisément ce qui est en débat.

**Équivalence FR/NL** : les deux versions doivent porter exactement la même
charge — même mesure, même intensité, même neutralité. Un énoncé neutre en
français et connoté en néerlandais est un énoncé raté. La relecture par un
locuteur natif néerlandophone des 35 énoncés est une **condition de
lancement public** (décision #7) ; d'ici là, les versions NL sont des
brouillons marqués comme tels.

## Thèmes et couverture

Les 35 énoncés couvrent les ~10 thèmes dérivés des compétences fédérales et
validés contre les descripteurs Eurovoc des votes de la législature
(décision #9), à raison de 3 à 4 énoncés par thème (cinq thèmes à 4, cinq
thèmes à 3) :

| Identifiant | Thème |
|---|---|
| `fiscalite` | Fiscalité |
| `emploi` | Emploi |
| `pensions-secu` | Pensions & sécurité sociale |
| `sante` | Santé |
| `migration` | Migration |
| `justice-securite` | Justice & sécurité |
| `energie-climat` | Énergie & climat |
| `mobilite` | Mobilité |
| `ethique-societe` | Éthique & société |
| `defense-europe` | Défense & Europe |

Une mesure qui ne relève d'aucun de ces thèmes (compétence régionale,
communautaire ou locale) est hors périmètre du test fédéral et n'entre pas
dans le pool. Le registre des thèmes vit dans
`pipeline/src/statements/theme-coverage.ts` ; le rapport de sélection
signale tout thème dont le pool offre moins de 3 candidats.

## La mesure de discriminance

Pour un énoncé candidat dont les positions par parti sont codées (sur
l'échelle −2..+2), la discriminance publiée est **l'écart absolu moyen
entre deux partis codés, normalisé** :

```
discriminance = moyenne(|p_i − p_j|, sur toutes les paires de partis codés)
                ─────────────────────────────────────────────────────────
                écart moyen maximal atteignable avec ce nombre de partis
                (= répartition équilibrée entre +2 et −2)
```

Propriétés :

- **0 = consensus** — tous les partis partagent la même position, y compris
  un 0 partagé : l'énoncé ne sépare personne ;
- **1 = clivage maximal** — les partis se répartissent en deux camps
  équilibrés aux extrêmes ;
- un **dissident isolé** face à un consensus reste proche de 0 : c'est ce
  qui motive cette formule plutôt que la variance, qui classerait un unique
  ±2 dissident au-dessus de deux camps équilibrés à ±1 ;
- le score est toujours accompagné du **nombre de positions codées** qui le
  fondent : un score calculé sur 2 partis ne se compare pas à un score
  calculé sur 12.

Le score est calculé en direct par `npm run statements:select` — jamais
stocké dans les données (même principe que les scores du site : recalculés,
jamais figés). Moins de 2 positions codées → score « non codé », jamais un
0 silencieux. Implémentation et tests :
`pipeline/src/statements/discriminance.ts`.

## Le processus complet

Chaque étape est outillée, mais **la décision est humaine** de bout en
bout : le pipeline propose, mesure et classe ; il ne sélectionne ni ne
publie jamais seul.

1. **Pool de candidats (IA, tracé)** — `npm run statements:pool` moissonne
   les mesures concrètes du corpus : les programmes snapshotés, chunk par
   chunk (`--party <id>`), et les intitulés des dossiers votés éligibles
   (`--votes`). Chaque candidat naît avec ses sources (parti + page +
   snapshot, ou vote + dossier DOC) et un thème proposé parmi les 10.
   Sortie : `data/statements/pool/*.candidates.yaml`.
   **Règle de fusion** : relancer la commande ne détruit jamais le travail
   humain — les candidats existants (ids, `positions` codées, corrections
   manuelles) sont préservés tels quels, les candidats réellement nouveaux
   sont ajoutés à la suite (les ids ne sont jamais renumérotés), et tout
   cas ambigu (ids dupliqués, candidats indistinguables) fait échouer la
   commande bruyamment plutôt que d'écraser.
2. **Codage des positions** — pour mesurer la discriminance, les positions
   des partis sur les candidats pressentis sont codées dans le champ
   `positions` des fichiers du pool (à la main pour un tri grossier, ou via
   `extract:positions` quand le corpus extrait le permet). Les clés du
   champ sont validées contre le registre des partis : une coquille
   (`psx`, `PS`) fait échouer la commande au lieu de fausser le score.
3. **Mesure et classement** — `npm run statements:select` classe le pool
   par discriminance, vérifie la couverture des 10 thèmes et publie
   `data/statements/pool/selection.report.md`.
4. **Sélection humaine** — le porteur choisit les 35 (3-4 par thème) dans
   le pool classé : le rapport soutient la décision, il ne la prend pas.
5. **Réécriture** — chaque énoncé retenu est réécrit à la main selon les
   quatre règles ; la traçabilité vers ses sources d'origine est conservée.
6. **Version NL en brouillon** — chaque énoncé reçoit sa version
   néerlandaise, marquée brouillon tant que la relecture native n'a pas eu
   lieu.
7. **Relecture NL native (condition de lancement)** — un locuteur natif
   relit les 35 paires FR/NL pour l'équivalence de charge (règle n° 4)
   avant tout lancement public (décision #7).

## Session de sélection (parcours HITL)

La production des 35 énoncés réels est une session humaine outillée. Ce qui
suit est le mode d'emploi de cette session.

### Prérequis

- **Clé API** : `ANTHROPIC_API_KEY` dans l'environnement (jamais dans un
  fichier, jamais committée). Sans clé, chaque commande fonctionne en
  `--dry-run` et montre son plan exact (chunks, lots, estimation de
  tokens) sans rien inventer.
- **Corpus matérialisé** : les snapshots sont des binaires non versionnés —
  les re-matérialiser localement avec `npm run snapshot:programmes` et
  `npm run snapshot:votes` (l'intégrité est vérifiée contre les manifestes
  committés). L'extraction du corpus (#25), même partielle, améliore
  l'étape de codage mais n'est pas bloquante pour générer le pool.
- Ordre de grandeur du coût : le run complet du corpus se chiffre en
  dizaines d'euros maximum (spec #15) ; chaque commande affiche le coût
  réel de son run.

### Commandes, dans l'ordre

```bash
# 0. Vérifier le plan sans clé ni coût
npm run statements:pool -- --party ps --dry-run
npm run statements:pool -- --votes --dry-run

# 1. Générer le pool depuis les programmes (répéter par parti)
npm run statements:pool -- --party ps
npm run statements:pool -- --party mr
# … idem pour chaque parti à programme PDF snapshoté

# 2. Générer le pool depuis les dossiers votés
npm run statements:pool -- --votes

# 3. Coder les positions des candidats pressentis
#    (éditer le champ `positions` dans data/statements/pool/*.candidates.yaml)

# 4. Classer et vérifier la couverture — répétable à volonté, sans clé
npm run statements:select

# 5. Sélectionner, réécrire, traduire — humain, hors outillage
```

Les étapes 3-4 bouclent : coder quelques candidats, re-classer, resserrer.
Le rapport signale les thèmes en trou de couverture ; y répondre en
relançant `statements:pool` sur des sources couvrant ces thèmes, pas en
inventant des énoncés. Relancer est toujours sûr : la commande fusionne
dans le fichier existant sans jamais toucher aux ids ni aux `positions`
déjà codées.

**Reprise après incident** : le pool s'écrit sur disque au fil des chunks
et des lots. Si un run échoue en cours de route (réponse malformée, coupure
réseau), tout ce qui a réussi avant l'échec est déjà dans le fichier —
relancer la même commande complète le pool par fusion, sans re-perdre ni
re-payer ce qui est acquis.

### Format de sortie de la sélection

Les 35 énoncés finaux sont des enregistrements conformes au type
`Statement` du schéma partagé (`data/src/schema.ts`) :

```ts
{
  id: 'e01',                    // stable, jamais renommé
  theme: 'pensions-secu',       // un des 10 identifiants canoniques
  texte_fr: '…',                // la phrase finale, règles 1-4
  texte_nl: '…',                // BROUILLON jusqu'à la relecture native
  note_concrete_fr: '…',        // la mesure exacte (chiffres, échéances)
  note_concrete_nl: '…',        // BROUILLON jusqu'à la relecture native
}
```

- Les ids `e01`…`e35` sont définitifs : ils indexent les positions, les
  votes liés et les réponses sauvegardées des utilisateurs.
- Le statut brouillon des versions NL est porté par la PR de sélection
  (checklist « relecture NL native en attente », bloquante pour le
  lancement, décision #7) — le schéma ne porte pas de drapeau : aucune
  version non relue ne doit atteindre un lancement public.
- La PR de sélection cite, pour chaque énoncé, ses candidats d'origine dans
  le pool (et donc leurs sources) : la traçabilité de la règle n° 3 doit
  être auditable dans la review.
- Les fixtures de démonstration (`data/src/fixtures/statements.fixture.ts`,
  8 énoncés fictifs) sont remplacées par les 35 réels dans cette même PR ;
  les positions restent fictives jusqu'à l'extraction du corpus (#25).

## État actuel (mode démo)

Les 35 énoncés réels n'existent pas encore : le site tourne sur 8 énoncés
de démonstration entièrement fictifs. L'outillage décrit ici (pool,
discriminance, sélection) est implémenté et testé ; la session de sélection
humaine — génération du pool réel, codage, choix des 35, réécriture,
traduction — reste à tenir. Ce document en est le mode d'emploi.
