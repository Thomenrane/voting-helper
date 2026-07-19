# Couverture de l'extraction des positions

Ce document décrit comment le pipeline extrait la position d'un parti sur un
énoncé à partir de son programme, et surtout **comment il rend le silence
(« position non documentée ») auditable**. Il est publiable tel quel et fait
foi : le code (`pipeline/src/extraction/`) implémente exactement ces règles,
et toute évolution passe par une mise à jour de ce document dans la même pull
request.

## Le risque visé : le faux négatif

Le vérificateur mécanique de citations (`criteres` implicites de #22) règle le
faux **positif** : une citation inventée ou altérée est rejetée, jamais
publiée. Ce document attaque le problème inverse, le faux **négatif** : une
position réellement prise dans le programme mais qu'aucun appel au modèle n'a
regardée deviendrait une « non documentée » trompeuse. Tant que le modèle lit
le document « librement », le silence est un acte de *confiance*. On veut un
acte *auditable*.

## Principe : balayage exhaustif, pas de récupération sélective

Le pipeline **balaye tout le document** (map sur l'intégralité de la couche
texte). Il n'utilise **pas** de récupération sélective type RAG top-K : aller
chercher les *k* passages les plus proches est perdant en rappel par
conception — on ne peut pas prouver qu'on n'a rien manqué si on n'a pas tout
regardé.

La faiblesse connue des grands modèles sur un gros contexte
(« lost-in-the-middle ») est contournée non pas en faisant confiance au
modèle, mais en **bornant chaque appel** :

- La couche texte est découpée en **chunks petits** (budget par défaut ~6 000
  caractères, quelques pages — `DEFAULT_CHUNK_CHARS`). Le modèle ne voit
  jamais un gros contexte.
- **Un appel LLM par chunk**, avec **tous les énoncés groupés** dans l'appel.
  Le chunk est le contexte coûteux ; on l'amortit en évaluant tous les énoncés
  dessus d'un coup.
- Pour **chaque énoncé × chaque chunk**, le modèle rend une décision
  explicite : soit une position (−2..+2) accompagnée d'une **citation
  verbatim** dans la langue source, soit `null` (« pas de position dans ce
  chunk »).

Le rappel vient donc du fait qu'on **examine tous les chunks**, pas d'un gros
contexte.

### Parsing strict et complet

La réponse du modèle est parsée défensivement (leçons des reviews #32/#34) :
**chaque énoncé demandé doit être décidé explicitement** dans la réponse. Un
énoncé omis — réponse tronquée, tableau vide, injection dans le texte du PDF —
est une **erreur dure**, jamais un silence éditorial. La « non documentée » est
une décision explicite (`position: null`), jamais l'absence d'une réponse.

## Source de la couche texte : PDF ou chapitres web (#51)

Le balayage opère sur une couche texte `ProgrammeTextLayer` — **la même
structure quelle que soit la source**, de sorte que l'admission et l'extraction
sont **agnostiques au format** :

- **PDF (#22)** — une « page » = une page physique du PDF, extraite via unpdf.
- **Chapitres web HTML (#51)** — pour un parti sans PDF national (PTB-PVDA),
  une « page » = **un chapitre** du programme web. Les chapitres sont crawlés de
  façon **bornée** (`snapshot:programme-chapters`) et snapshotés par la
  machinerie #21 ; l'extraction HTML→texte retire le boilerplate (nav, menus,
  pied de page, bannière cookie) et conserve le `<main>`. Chaque page-chapitre
  est **ancrée au SHA-256 de son snapshot** ; un chapitre falsifié ou un crawl
  partiel ⇒ **aucune couche** (fail-closed), donc jamais d'extraction sur un
  contenu non authentique. Voir `docs/methodologie/admission-sources.md` §
  « Sources web-chapitres ».
  **Sourcing Wayback mi-2024 (#58).** Contrairement aux 12 autres partis (tous
  datés 2024), le programme web PTB-PVDA est **évolutif** : le site live crawlé
  en 2026 a dérivé du programme figé du scrutin du 9 juin 2024 (pied de page
  « © 2023-2026 », des chapitres citant 2025). PTB-PVDA sont donc sourcés depuis
  une capture **Wayback Machine mi-2024** (canal `wayback`, `originUrl`
  canonique conservée en provenance) — la version gelée de la page désignée,
  comme les PDF Ecolo/N-VA/Open Vld. En mode Wayback, l'index **et** chaque
  chapitre sont fetchés depuis la capture datée (`web/<ts>id_/<origine>`) ; les
  bornes de crawl s'appliquent sur l'URL **d'origine décodée** de l'enveloppe
  Wayback, jamais sur `web.archive.org`.

`extract:positions` prépare ces couches via `ensureTextLayer` (PDF dérivé et
attesté ; HTML assemblé depuis les snapshots de chapitres). Tant que le crawl
des chapitres n'a pas tourné, l'extraction d'un parti web-chapitres échoue avec
un message actionnable pointant vers `snapshot:programme-chapters`.

## Fusion inter-chunks

Chaque citation proposée par un chunk est **vérifiée mécaniquement** contre
cette même couche texte (`verifyCitation`, réutilisé inchangé). Les candidats
sont ensuite fusionnés en une issue par énoncé :

- **Position documentée** — au moins un chunk a produit une position dont la
  citation est mécaniquement vérifiée. Une position vérifiée **gagne**.
- **Non documentée** — **si et seulement si aucun chunk** n'a produit de
  position à citation vérifiée. C'est la définition auditable du silence.
- **Citation rejetée** — des positions ont été proposées, mais aucune citation
  n'a survécu à la vérification (jamais publiée).
- **Conflit inter-chunks** — deux chunks produisent des positions **vérifiées
  mais divergentes** pour le même énoncé.

### Arbitrage d'un conflit inter-chunks

Décision retenue (cohérente avec #22/#32) : un conflit **n'est jamais tranché
automatiquement**. On ne choisit pas « le plus fort » : deux citations
authentiques qui codent différemment le même énoncé signalent une vraie
ambiguïté du programme (par ex. une position générale à un endroit, une
exception à un autre). Le conflit est **signalé en review, aucun
enregistrement n'est produit** — l'arbitrage est humain. Coder d'office
l'emporterait sur une information réelle ; le silence explicite (record
`en_attente` absent) est préférable à un faux consensus.

## Filet déterministe : le scan lexical

Le balayage exhaustif donne déjà le rappel. Le scan lexical ne **coupe
jamais** rien — il sert uniquement à **prioriser l'attention humaine** et à
**signaler les silences douteux**.

- **Sans clé, sans réseau, déterministe.**
- Pour chaque énoncé, des **mots-clés bilingues FR + NL** sont dérivés du
  texte de l'énoncé lui-même (qui est bilingue) et de sa mesure concrète,
  moins une liste publiée de mots-outils, plus un **registre de synonymes
  publié** (`STATEMENT_KEYWORD_SYNONYMS`).
- Le scan cherche ces mots-clés sur le **texte intégral** de la couche, avec la
  **même normalisation que le vérificateur** (`normalizeForSearch`) complétée
  d'un repli de casse et d'accents (la présence lexicale est insensible à la
  casse et aux accents, contrairement à une citation verbatim).
- Une page est retenue comme **occurrence** seulement si **au moins deux
  mots-clés distincts co-occurrent** (`LEXICAL_COOCCURRENCE_MIN`) — un mot
  générique isolé n'est pas une preuve que le sujet est traité.

## Rapport de couverture

Chaque run committe `data/positions/proposals/<parti>.coverage.md` :

- le **nombre de chunks examinés** (preuve que le balayage est exhaustif) ;
- par énoncé, les **chunks ayant produit un candidat** (✅ vérifié / ❌ rejeté) ;
- par énoncé non publié, les **pages où le sujet apparaît lexicalement** ;
- un **FLAG explicite** (⚠️) sur tout énoncé **non publié** ayant des
  occurrences lexicales : le relecteur **doit** le vérifier.

Un énoncé est « non publié » quand la fusion n'a produit aucun enregistrement.
Deux cas mènent au même silence côté utilisateur, et sont donc tous deux
signalés :

- **« non documentée »** (`no_position`) — aucune position codée, mais le sujet
  apparaît : mention *« aucune position codée mais le sujet apparaît… — À
  VÉRIFIER »*.
- **« citation rejetée »** (`rejected`, notamment `found_elsewhere` : citation
  verbatim correcte mais mauvaise page) — une position candidate existait mais
  n'a pas survécu à la vérification : mention *« position candidate rejetée —
  citation retrouvée à une autre page ? — À VÉRIFIER »*.

Le flag couvre donc **tous** les énoncés non publiés à occurrence lexicale, pas
seulement les `no_position` : un `rejected` non signalé apparaîtrait comme un
silence à l'utilisateur alors que la position est bien dans le programme —
exactement le faux négatif que ce ticket combat.

Les énoncés signalés sont aussi repris en tête du corps de PR
(`<parti>.review.md`). Objectif : vérifier un silence en 30 secondes au lieu
de relire 120 pages.

## Planification sans clé (`--dry-run`)

`extract:positions --dry-run` planifie le balayage sans clé ni appel :
nombre de chunks bornés (= nombre d'appels LLM groupés), caractères balayés,
et **estimation de tokens et de coût**. Un balayage complet du PS (1 220 pages,
~3,57 M caractères) se planifie ainsi en ~610 appels bornés (heuristique
3,5 caractères/token), soit un ordre de grandeur de quelques euros — l'ordre de
grandeur, pas une vérité comptable.

## Mode d'extraction sans clé (`--emit` → remplissage → `--ingest`)

L'étape LLM peut être **externalisée en deux temps**, sans changer la moindre
garantie : le balayage exhaustif, la complétude, la vérification mécanique des
citations, la fusion et le rapport de couverture restent la vraie machinerie.
Seul *qui produit les sorties LLM* change (stratégie du corpus par abonnement :
un agent ou un humain joue le LLM, coût marginal nul).

1. **`extract:positions --emit <fichier>`** exécute la vraie orchestration
   *jusqu'à la frontière LLM* et écrit le **plan de balayage + les prompts par
   chunk** (un chunk de contexte chacun, tous les énoncés groupés). Déterministe,
   **aucun appel API, sans clé**. Le fichier est un JSON
   `kind: voting-helper/extraction-emit` : `party_id`, `model`, `chunk_chars`,
   `statement_ids`, et `chunks[]` où chaque entrée porte `index`, l'identité du
   chunk (`source_id`, `first_page`, `last_page`, `chars`), un **hash court et
   déterministe du texte du chunk** (`text_sha256`, l'ancre de contenu) et les
   prompts `system` / `user` exacts — identiques byte pour byte à la voie live.
2. **Remplissage externe.** Un LLM (agent sur abonnement, humain, ou API) produit
   **une réponse structurée par chunk** dans le format déjà attendu par le
   parseur strict (un tableau JSON, un objet par énoncé). Le fichier de réponses
   est un JSON `kind: voting-helper/extraction-responses` : `party_id`,
   `chunk_chars` et `responses[]`, chaque réponse reprenant l'identité du chunk
   émis (`index`, `source_id`, `first_page`, `last_page`, `text_sha256`) plus
   `answer` (le texte brut du modèle).
3. **`extract:positions --ingest <fichier>`** ré-entre la **même** orchestration
   avec ces réponses injectées via le seam `LLMClient` : parsing strict +
   complet, `verifyCitation`, `mergeCandidates`, rapport de couverture. **Un
   chunk manquant, en trop, d'identité incohérente, un `text_sha256` divergent
   (le texte du chunk a changé depuis l'emit), un `chunk_chars` différent, ou un
   énoncé omis dans une réponse → erreur dure** : la complétude bout-à-bout est
   préservée (leçons #32/#34/#39). Le `text_sha256` est la vraie garantie que la
   réponse figée correspond au texte exact qu'on a montré au modèle — une
   couche re-dérivée aux mêmes frontières de pages mais au texte différent est
   ainsi rejetée, là où l'identité `(source_id, pages)` seule passerait. Les artefacts produits (`<parti>.positions.yaml` `en_attente`
   et `<parti>.coverage.md`) sont **identiques** à ceux d'une passe live pour
   les mêmes sorties LLM ; le coût affiché est nul (aucun token dépensé).

Le déterminisme du round-trip est testé : pour les mêmes sorties LLM,
`emit → remplissage → ingest` rend un YAML et un `coverage.md` byte-identiques à
la voie live (`offline-extraction.test.ts`). Le seam `LLMClient` étant
injectable, jouer le LLM sans clé ne demande plus de **répliquer**
l'orchestration dans un driver jetable (ce que le pilote N-VA #41 avait dû
faire) : il suffit d'émettre, remplir, ré-ingérer.

## Résidu irréductible (publié)

Comme la limite du préfiltre lexical des votes est déjà publiée, celle-ci
l'est aussi. Deux limites subsistent :

1. **Le scan lexical peut manquer une paraphrase.** Une position formulée
   **sans aucun des mots-clés attendus** (ni FR, ni NL, ni synonyme publié),
   ou dont le sujet n'apparaît sur aucune page avec au moins deux mots-clés
   co-occurrents, ne sera **pas signalée** : un tel silence resterait un faux
   négatif non détecté. Le balayage exhaustif l'aura *examinée* (tous les
   chunks sont vus par le modèle) ; c'est la *priorisation d'attention* qui la
   raterait, pas la lecture.
2. **Le modèle peut, sur un chunk donné, ne pas coder une position réellement
   présente.** Le balayage exhaustif réduit ce risque (chaque passage est vu au
   moins une fois dans un petit contexte), sans l'annuler.

Ces deux résidus sont la raison pour laquelle **la review humaine reste la
validation** : le pipeline propose, il ne publie pas.

## Hors périmètre (suite)

Le **widener sémantique** — des embeddings pour rattraper les paraphrases que
le scan lexical rate — est une suite. Il nécessite un **modèle d'embeddings
local** pour rester sans clé. Il ne changerait pas le rappel (on regarde déjà
tout) : comme le scan lexical, il ne servirait qu'à *prioriser l'attention* et
à *signaler des silences douteux*, **jamais à couper** (jamais de top-K).
