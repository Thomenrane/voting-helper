# Spike — Couche texte intermédiaire pour l'extraction LLM des positions (#22)

Date : 16/07/2026. Décision préalable obligatoire consignée sur le ticket #22
(commentaire du brainstorm du 16/07/2026 avec le porteur).

## Question

Entre les PDF snapshotés (#21) et l'extraction LLM des positions, quelle couche
texte intermédiaire utiliser ? La couche retenue devient un **snapshot dérivé**
(`kind: derived`) attesté dans le manifeste : la vérification mécanique des
citations (couture de test n°2) se fait contre un artefact fingerprinté, pas
contre une conversion volatile.

## Critère de victoire (unique)

Le taux de citations extraites retrouvables **mécaniquement** dans la couche
texte, **avec la bonne page** — l'exigence n°1 du schéma partagé
(`Citation { texte, page }`) et du garde-fou anti-hallucination.

## Candidats

| | Candidat | Nature |
|---|---|---|
| a | [markitdown](https://github.com/microsoft/markitdown) 0.1.6 (Microsoft, MIT) | PDF → Markdown, Python (pdfminer.six), invoqué en subprocess |
| b | Extraction par page en TypeScript ([unpdf](https://github.com/unjs/unpdf), moteur pdf.js) | `extractText(pdf, { mergePages: false })` → un texte par page |
| c | PDF natif de l'API Claude | Envoi des pages PDF directement au modèle, pagination conservée |

## Méthode

Corpus : 3 programmes réels snapshotés (empreintes SHA-256 committées dans
`data/manifests/programmes.manifest.json`) :

- `ps-programme-2024` — 1 220 pages, FR (le pire cas du corpus) ;
- `vlaams-belang-programme-2024` — 100 pages, NL ;
- `defi-axe-1-2024` — 44 pages, FR (mise en page graphique).

Protocole (script de mesure, RNG seedé, 30 fragments par document et par
direction) :

1. Extraire chaque document avec (a) et (b), chronométré.
2. Échantillonner des fragments « façon citation » (phrases de 60 à 200
   caractères) dans chaque couche, page d'origine connue quand la couche la
   fournit.
3. Rechercher chaque fragment dans l'autre couche après la normalisation
   typographique prévue pour le vérificateur (NFKC, espaces insécables, tirets
   typographiques, guillemets, traits d'union conditionnels, casse conservée),
   et vérifier si la **page** peut être attribuée correctement.
4. Contrôle interne : chaque fragment doit être retrouvable dans sa propre
   couche avec sa page (sanity check de la normalisation).

Candidat (c) : **non testé** — aucune clé `ANTHROPIC_API_KEY` disponible dans
l'environnement d'exécution. Deux constats structurels le disqualifient
néanmoins pour ce rôle précis : (1) l'API accepte au maximum 600 pages / 32 Mo
par document, or le pire cas réel (PS) fait 1 220 pages — il faudrait découper
et re-mapper la pagination ; (2) il ne produit **aucune couche texte
mécaniquement interrogeable** : le vérificateur de citations aurait de toute
façon besoin d'une couche (a) ou (b) pour la recherche textuelle. (c) reste
pertinent comme *entrée du LLM*, pas comme couche de vérification.

## Chiffres

Temps d'extraction :

| Document | (a) markitdown | (b) unpdf |
|---|---|---|
| PS (1 220 p., 9,5 Mo) | 178,6 s | **19,2 s** |
| Vlaams Belang (100 p., 28,8 Mo) | 17,0 s | **1,2 s** |
| DéFI axe 1 (44 p., 1,7 Mo) | 3,9 s | **0,4 s** |

Retrouvabilité mécanique (30 fragments/document/direction, normalisation
identique des deux côtés) :

| Mesure | PS | Vlaams Belang | DéFI axe 1 |
|---|---|---|---|
| (b) fragment retrouvé dans sa propre couche **avec la bonne page** | **30/30** | **30/30** | **30/30** |
| (a) séparateurs de page présents dans le markdown (`\f`) | non (0) | oui (99) | non (0) |
| Fragments (b) retrouvés dans (a) — texte seul | 30/30 | 26/30 | 11/30 |
| Fragments (b) retrouvés dans (a) **avec la bonne page** | **0/30**¹ | 26/30 | **0/30**¹ |
| Fragments (a) retrouvés dans (b) **avec la bonne page** | n/a¹ | 29/30 | n/a¹ |

¹ structurellement impossible : la sortie markitdown de ces documents ne
contient aucun marqueur de page — le markdown est aplati.

## Verdict

**Candidat (b) — extraction par page en TypeScript (unpdf/pdf.js) — retenu.**

- Critère unique : 90/90 fragments retrouvables avec la bonne page, y compris
  sur le pire cas de 1 220 pages. markitdown ne préserve la pagination que sur
  1 document sur 3 (comportement pdfminer non garanti) : 0 % « avec la bonne
  page » sur les deux autres.
- Sur DéFI (mise en page graphique), les deux extracteurs divergent fortement
  (11/30 de recouvrement croisé) : la couche de vérification DOIT être celle
  qui a servi à l'extraction — un argument de plus pour une couche unique,
  dérivée et attestée, plutôt que deux toolchains.
- Aucun second toolchain : pas de subprocess Python dans le pipeline TS ;
  ~9× plus rapide sur le pire cas.

Conséquences d'implémentation (ce ticket) :

- `pipeline/src/extraction/text-layer.ts` dérive la couche par page depuis les
  bytes du snapshot brut (intégrité SHA-256 vérifiée avant dérivation) ;
- la couche est stockée en JSON déterministe (sans timestamp, référencée par le
  sha256 du PDF source) et attestée `kind: derived` dans
  `data/manifests/programmes.manifest.json` — même mécanique que le dataset de
  votes dérivé (#21) ;
- le vérificateur de citations recherche dans cette couche uniquement, avec la
  normalisation typographique documentée dans
  `pipeline/src/extraction/normalize.ts` (testée : espaces insécables,
  ligatures, tirets, guillemets, citations à cheval sur deux pages).

Limite connue : les programmes PTB/PVDA sont des pages web (`text/html`, pas de
PDF national) — hors périmètre de cette couche par page ; à traiter dans un
suivi (extraction HTML sans pagination, la « page » du schéma devra pointer la
section/URL du chapitre).
