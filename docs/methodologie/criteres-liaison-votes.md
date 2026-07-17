# Critères de liaison des votes aux énoncés

Ce document décrit comment un vote nominatif de la Chambre des représentants
est lié à un énoncé du test. Il est publiable tel quel et fait foi : le code
du pipeline (`pipeline/src/linking/`) implémente exactement ces règles, et
toute évolution des règles passe par une mise à jour de ce document dans la
même pull request.

## Principe

Le score « actes » d'un parti sur un énoncé repose exclusivement sur des
votes nominatifs en séance plénière, liés à l'énoncé selon les critères
ci-dessous. Chaque liaison est proposée par le pipeline avec une
justification d'une phrase, puis **validée par une review humaine en pull
request** : aucune liaison n'atteint la production sans contrôle humain.

Un énoncé sans vote validé est **exclu du score « actes »** du parti — il
n'est jamais compté comme neutre, et le dénominateur affiché le rend
visible (« actes : basé sur N/35 énoncés »).

Les décisions humaines priment sur les runs : un lien **supprimé en
review** est consigné sur le record (champ `votes_ecartes`) et n'est
**jamais re-proposé** par les runs suivants ; un run qui n'apporte aucune
information nouvelle ne modifie ni le statut ni la date de révision d'un
record existant.

## Critères d'inclusion

Un vote est liable à un énoncé si et seulement si :

1. **Il porte sur un dossier législatif identifié** (numéro DOC de la
   Chambre). Les scrutins sans dossier lié — motions, votes d'organisation —
   sont exclus mécaniquement.
2. **Il s'agit d'un vote final en plénière sur ce dossier, ou d'un vote
   d'amendement portant directement sur la mesure de l'énoncé.** Le type
   (vote final / amendement) est classé à partir de l'intitulé du scrutin.
3. **Le dossier porte directement sur la mesure concrète de l'énoncé** — pas
   seulement sur le même thème. Ce jugement de pertinence est proposé par le
   classement sémantique du pipeline et justifié en une phrase ; en cas de
   doute, le candidat est écarté (la review peut supprimer un lien faible,
   elle ne peut pas inventer un lien manquant).

## Critères d'exclusion mécaniques

Sont exclus **avant** tout jugement de pertinence, par règle codée sur les
métadonnées du vote (`pipeline/src/linking/vote-eligibility.ts`) :

- les votes **sans dossier législatif lié** (critère n° 1) ;
- les votes **purement procéduraux**, reconnus par motifs publiés dans
  l'intitulé (FR et NL, insensible à la casse et aux accents) — critère
  n° 2 :
  - prise en considération / inoverwegingneming ;
  - renvoi en commission / verzending (terugzending) naar de commissie ;
  - ajournement / verdaging ;
  - ordre des travaux / regeling van de werkzaamheden ;
  - demande d'urgence / urgentieverzoek ;
  - consultation du Conseil d'État / advies van de Raad van State ;
  - motion d'ordre / ordemotie.

  Les motifs sont ancrés sur ces formules procédurales complètes, jamais sur
  des mots isolés : un « plan d'urgence hivernal » ou une « réforme du
  Conseil d'État » sont des dossiers de fond et ne sont pas exclus.

Chaque run publie le décompte des exclusions par motif dans son résumé de
review.

## Présélection des candidats

Pour chaque énoncé, les votes mécaniquement éligibles sont d'abord classés
par similarité lexicale entre l'énoncé (texte FR/NL et mesure concrète) et
les intitulés du vote et du dossier ; les meilleurs candidats (30 par
défaut) sont ensuite soumis au classement sémantique, qui décide pour
**chaque** candidat : retenu ou écarté, avec un motif d'une phrase dans les
deux cas. Le résumé de review montre donc, énoncé par énoncé, pourquoi
chaque candidat a été retenu **ou écarté**.

**Règle publiée du préfiltre :** un vote éligible sans recouvrement lexical
avec l'énoncé n'est pas soumis au modèle — c'est une limite du signal
actuel (intitulés seuls), en attendant les descripteurs Eurovoc de
l'ingestion CRIV/FLWB. Pour que cette limite reste contrôlable, le résumé
de review liste, énoncé par énoncé, les votes éligibles **non soumis** au
modèle (identifiant + intitulé, liste plafonnée avec décompte exact) : la
review peut repêcher un vote écarté à tort par le préfiltre.

> Note : le jeu de données actuel (législature 56) n'expose pas les
> descripteurs Eurovoc des dossiers. Quand l'ingestion CRIV/FLWB les
> fournira, ils deviendront un signal mécanique supplémentaire de
> présélection, en amont de la similarité sémantique.

## Position de vote par parti

Pour chaque vote retenu, la position de chaque parti est dérivée du vote
nominatif de son groupe parlementaire :

1. **Vote brut du groupe** (`vote_groupe`) : la pluralité stricte des
   suffrages oui/non/abstention exprimés par les députés du groupe. En cas
   d'égalité, ou si le groupe n'a exprimé aucun suffrage, **aucun vote n'est
   attribué** au parti pour ce scrutin — jamais de position inventée ;
   l'absence est signalée dans le résumé de review.
2. **Direction du dossier** (`direction_dossier`) : adopter le dossier va
   dans le sens de l'énoncé (`soutient`) ou contre lui (`contredit`). La
   direction qualifie le **dossier**, pas le vote ; elle est proposée par le
   pipeline et validée en review.
3. **Position dérivée** : elle vaut vote brut × direction, et n'est jamais
   stockée — elle est recalculée partout par la dérivation partagée
   (`deriveVotePosition`) :

| Vote brut du groupe | Dossier `soutient` l'énoncé | Dossier `contredit` l'énoncé |
|---|---|---|
| oui | +2 | −2 |
| abstention | 0 | 0 |
| non | −2 | +2 |

Lorsque plusieurs votes validés sont liés au même énoncé pour un parti,
leurs positions dérivées sont moyennées (décision #8).

Les deux partis d'un groupe commun (Ecolo et Groen, groupe Ecolo-Groen)
héritent du même vote brut de groupe ; PTB-PVDA est un parti unitaire à
groupe unique (PVDA-PTB).

## Traçabilité

Chaque vote lié conserve : l'identifiant du scrutin, sa date, la référence
DOC du dossier, le vote brut du groupe, la direction du dossier et la
justification d'une phrase. Le jeu de votes source est snapshoté, daté et
empreinté (SHA-256) ; le résumé de review de chaque run cite le snapshot
exact utilisé.
