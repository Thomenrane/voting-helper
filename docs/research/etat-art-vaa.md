# État de l'art : tests électoraux existants et méthodologies VAA

> Note de recherche pour le ticket [#4](https://github.com/Thomenrane/voting-helper/issues/4).
> Rédigée le 16/07/2026 à partir des sources primaires (pages méthodologie officielles, notes méthodologiques des concepteurs, littérature académique). Chaque affirmation est citée avec son URL.

## Sommaire

1. [De Stemtest (VRT) et Test électoral (RTBF/La Libre) — le duo belge](#1-de-stemtest-vrt-et-test-électoral-rtbfla-libre)
2. [Wahl-O-Mat (Allemagne, bpb)](#2-wahl-o-mat-allemagne-bpb)
3. [smartvote (Suisse)](#3-smartvote-suisse)
4. [VAA et outils fondés sur les votes parlementaires réels](#4-vaa-et-outils-fondés-sur-les-votes-parlementaires-réels)
5. [Ce que dit la littérature académique](#5-ce-que-dit-la-littérature-académique)
6. [Enseignements pour notre différenciateur](#6-enseignements-pour-notre-différenciateur--programmes--votes-réels-à-la-chambre)

---

## 1. De Stemtest (VRT) et Test électoral (RTBF/La Libre)

**Correction préalable au ticket** : le partenaire média francophone du Test électoral est la **RTBF + IPM (La Libre, La DH)**, pas RTL ([UCLouvain/ISPOLE, 2019](https://uclouvain.be/fr/instituts-recherche/ispole/actualites/le-test-electoral-2019-est-a-present-accessible-pour-les-elections-regionales-federales-et-europeennes-du-26-mai.html) ; [La Libre, 2019](https://www.lalibre.be/belgique/politique-belge/2019/04/03/repondez-a-notre-test-electoral-et-decouvrez-de-quels-partis-vous-etes-le-plus-proche-T3W36RDEPJA5TJTRRLYJDA4CJA/)). De Stemtest (VRT/Mediahuis) et le Test électoral (RTBF/IPM) sont **le même outil** avec le même moteur et la même équipe académique : Stefaan Walgrave (UAntwerpen), Benoît Rihoux (UCLouvain) et Tree company (Michiel Nuytemans) ([nota méthodologique 2024, PDF](https://www.vrt.be/content/dam/vrtnieuws/bestanden/Stemtest.pdf) ; [UCLouvain, lancement 2024](https://www.uclouvain.be/fr/instituts-recherche/ispole/news/lancement-du-test-electoral)). L'ancêtre « Doe de Stemtest » (VRT, 2004) avait déjà réuni ~1 million d'utilisateurs ([Walgrave et al., Acta Politica 2008](https://link.springer.com/article/10.1057/palgrave.ap.5500209)) ; l'édition 2019 a dépassé 4,3 millions de tests ([UCLouvain](https://uclouvain.be/fr/instituts-recherche/ispole/actualites/le-test-electoral-2019-est-a-present-accessible-pour-les-elections-regionales-federales-et-europeennes-du-26-mai.html)).

### Positions des partis : auto-positionnement **vérifié par les chercheurs** (mixte)

Le processus 2024, documenté dans la [nota de stellingselectie publiée par la VRT](https://www.vrt.be/content/dam/vrtnieuws/bestanden/Stemtest.pdf), comporte 4 phases :

1. **Formulation** : ~1 000 propositions initiales issues des programmes, de l'actualité, des rédactions et de 33 experts (surtout académiques), réduites à 348 stellingen uniques soumises aux partis ; des citoyens ordinaires testent la compréhensibilité des formulations.
2. **Réponses des partis** : les partis répondent eux-mêmes (accord/désaccord) avec motivation (3 076 réponses et motivations traitées). **Contrôle clé** : quatre académiques par groupe linguistique pré-estiment les réponses attendues ; en cas d'écart, les chercheurs cherchent une **preuve écrite dans les documents officiels du parti** (programme, site, communiqués, presse). Sans preuve, le parti est invité à modifier sa réponse ; les contradictions entre réponse et motivation sont renvoyées au parti.
3. **Survey** : 5 174 citoyens (panel Bpact) répondent aux 235 stellingen des grands tests pour informer la sélection finale.
4. **Sélection finale** : logiciel combinatoire (KPsoft) qui optimise le paquet de 35 stellingen sous contraintes — équilibre gauche/droite des formulations (39 % « gauche », 38 % « droite », 23 % neutres), quotas thématiques min/max, communauté de stellingen entre groupes linguistiques, et maximisation du « bon classement » des électeurs auprès de leur parti d'intention de vote.

Les stellingen non discriminantes (tous les partis d'accord) sont éliminées — 62 sur 348 en 2024 (19 %), en forte hausse : les concepteurs constatent une dérive vers des **réponses « stratégiques »** des partis, alignées sur ce qu'ils croient majoritaire dans l'opinion ([nota 2024, p. 3](https://www.vrt.be/content/dam/vrtnieuws/bestanden/Stemtest.pdf)).

### Format des questions

35 stellingen par test (25 pour Bruxelles/UE), réponse **binaire** accord/désaccord, 12 tests différents (6 NL, 6 FR : générique, fédéral, régional, européen, bruxellois, jeunes). Système de « **shoot-out** » : si les deux premiers partis de l'utilisateur sont proches, 5 stellingen supplémentaires où ces deux partis divergent départagent le résultat ([nota 2024](https://www.vrt.be/content/dam/vrtnieuws/bestanden/Stemtest.pdf) ; [VRT NWS, 09/04/2024](https://www.vrt.be/vrtnws/nl/2024/04/09/de-stemtest-2024-wat-is-het-hoe-werkt-het-en-wat-kan-ik-eruit/)).

### Algorithme de matching et pondération

Deux pondérations se superposent ([nota 2024, section « Weging van de stellingen »](https://www.vrt.be/content/dam/vrtnieuws/bestanden/Stemtest.pdf)) :

- **Côté utilisateur** : « boost » de 20 % au total, réparti entre les stellingen que l'utilisateur marque comme importantes (1 stelling boostée = +20 %, 10 stellingen = +2 % chacune).
- **Côté partis** : le poids de chaque stelling **varie par parti**, dérivé d'une **analyse de contenu automatisée des programmes électoraux** (dictionnaires bilingues du Comparative Agendas Project, 23 domaines) mesurant l'attention que chaque parti porte au thème. Plancher de 1 % par thème, plafond ~20 % ; poids d'une stelling = poids du thème ÷ nombre de stellingen du thème (chaque stelling reçoit deux thèmes). Deux partis aux réponses identiques peuvent donc obtenir des scores différents via la saillance de leurs programmes.

Le résultat est un **classement de partis**, pas une recommandation unique ([VRT NWS](https://www.vrt.be/vrtnws/nl/2024/04/09/de-stemtest-2024-wat-is-het-hoe-werkt-het-en-wat-kan-ik-eruit/)).

### Transparence et critiques

- Transparence forte : nota méthodologique publique adressée aux partis, réponses des partis consultables dans l'outil ([UCLouvain](https://www.uclouvain.be/fr/instituts-recherche/ispole/news/lancement-du-test-electoral)).
- Critiques documentées : effet massif de la **sélection des stellingen** sur le conseil rendu, démontré sur le Stemtest 2004 par ses propres concepteurs ([Walgrave, Nuytemans & Pepermans, WEP 2009](https://www.tandfonline.com/doi/full/10.1080/01402380903230637)) ; réponses stratégiques croissantes des partis (reconnu dans la [nota 2024](https://www.vrt.be/content/dam/vrtnieuws/bestanden/Stemtest.pdf)) ; les concepteurs admettent aussi que même la meilleure combinaison de 35 stellingen classe mal une grande partie des électeurs déclarés de chaque parti (le vote dépend de bien plus que des positions sur 35 énoncés).

---

## 2. Wahl-O-Mat (Allemagne, bpb)

Outil de la **Bundeszentrale für politische Bildung** (agence fédérale d'éducation civique), depuis 2002.

### Positions des partis : auto-positionnement pur

Tous les partis admis au scrutin avec une liste sont invités ; ils répondent eux-mêmes aux thèses (~2 semaines) et peuvent **justifier chaque position en 500 caractères max** ; la bpb ne modifie ni réponses ni justifications, qui restent sous la responsabilité exclusive des partis ([FAQ bpb, Bundestagswahl 2025](https://www.bpb.de/themen/wahl-o-mat/bundestagswahl-2025/558464/haeufig-gestellte-fragen-zum-wahl-o-mat/)). En 2025, tous les partis invités ont répondu ([ibid.](https://www.bpb.de/themen/wahl-o-mat/bundestagswahl-2025/558464/haeufig-gestellte-fragen-zum-wahl-o-mat/)).

### Format des questions

38 thèses, élaborées en ateliers par une équipe de **jeunes électeurs (~24), d'experts scientifiques et de la bpb** : ~80 thèses tirées des programmes au premier atelier, réduites à 38 thèses pertinentes et clivantes au second ([FAQ bpb 2025](https://www.bpb.de/themen/wahl-o-mat/bundestagswahl-2025/558464/haeufig-gestellte-fragen-zum-wahl-o-mat/)). Échelle à 3 positions : « stimme zu » / « neutral » / « stimme nicht zu », plus « sauter la thèse » ([Wie funktioniert der Wahl-O-Mat?](https://www.bpb.de/themen/wahl-o-mat/294576/wie-funktioniert-der-wahl-o-mat/)).

### Algorithme de matching

Publié dans le [Rechenmodell officiel (PDF, bpb)](https://www.bpb.de/system/files/dokument_pdf/Rechenmodell_des_Wahl-O-Mat.pdf) : matrice de proximité — concordance exacte = 2 points, positions adjacentes (accord↔neutre, neutre↔désaccord) = 1 point, positions opposées = 0. L'utilisateur peut pondérer des thèses qui comptent **double** (4/2/0) ; les thèses sautées sortent du calcul. Score final = pourcentage des points maximums atteignables (le maximum varie selon les thèses pondérées/sautées).

### Transparence et critiques

- Transparence : modèle de calcul publié (PDF sous licence CC), FAQ détaillée, la bpb insiste : le Wahl-O-Mat « est une offre d'éducation politique et d'information, pas une recommandation de vote », et 38 thèses ne sont qu'un extrait des enjeux ([FAQ bpb 2025](https://www.bpb.de/themen/wahl-o-mat/bundestagswahl-2025/558464/haeufig-gestellte-fragen-zum-wahl-o-mat/)).
- Critiques documentées : réduction binaire d'enjeux complexes et sélection des thèmes jugée discutable ; équilibre thématique artificiel contraire aux résultats de la recherche sur l'agenda-setting (tous les thèmes pèsent pareil alors que la hiérarchie des enjeux décide des élections) ([wegewerk, analyse critique](https://www.wegewerk.com/de/blog/wahl-o-mat-binaer-aequilibrierter-unfug-ist-kein-spiel/)) ; désavantage possible des petits partis mono-thématiques, contesté par la bpb qui y voit au contraire une vitrine pour les petits partis ([Wikipedia DE, section Kritik](https://de.wikipedia.org/wiki/Wahl-O-Mat)). En 2008, un recalcul de Wagschal & König avait relancé le débat méthodologique allemand ([Wikipedia DE](https://de.wikipedia.org/wiki/Wahl-O-Mat)).

---

## 3. smartvote (Suisse)

Développé depuis 2003 par **Politools**, réseau de recherche politiquement neutre basé à Berne ([Wikipedia EN](https://en.wikipedia.org/wiki/Smartvote)).

### Positions : auto-positionnement des **candidats individuels**

Spécificité suisse (système très candidat-centré) : ce sont les **candidats eux-mêmes** qui remplissent le questionnaire pour créer leur profil ; en 2015, ~85 % des candidats aux fédérales avaient un profil smartvote ([Wikipedia EN](https://en.wikipedia.org/wiki/Smartvote)). Les idées de questions sont collectées auprès des partis, groupes d'intérêt, citoyens et médias, puis sélectionnées en plusieurs tours pour l'équilibre thématique ([FAQ smartvote](https://www.smartvote.ch/en/faq)).

### Format des questions

**75 questions** (version complète) — nettement plus long que les outils comparables, nécessaire pour différencier jusqu'à 800+ candidats par circonscription ([Wikipedia EN](https://en.wikipedia.org/wiki/Smartvote)) ; une version « rapid » raccourcie existe. Échelles de type oui / plutôt oui / plutôt non / non selon les questions.

### Algorithme de matching et pondération

Matching **par distance** dans l'espace des réponses : la FAQ officielle décrit un modèle « city block » ([FAQ smartvote](https://www.smartvote.ch/en/faq)), tandis que les déploiements internationaux du même moteur documentent une **distance euclidienne** ([méthodologie smartwielen 2024, Luxembourg](https://2024.smartwielen.lu/en/wiki/lux2024-methodology) ; [Wikipedia EN](https://en.wikipedia.org/wiki/Smartvote)). L'utilisateur pondère chaque question : **+1 (compte double)** ou **−0,5 (compte moitié)** ; la pondération n'affecte que le classement, pas les graphiques ([FAQ smartvote](https://www.smartvote.ch/en/faq)). Résultat : classement décroissant des candidats/listes.

### Visualisations et transparence

- **smartspider** : profil sur 8 axes thématiques (0–100, chaque axe ≥ 5 questions) ; **smartmap** : carte 2D gauche-droite × (selon les déploiements) libéral-conservateur ou intégration européenne ([FAQ smartvote](https://www.smartvote.ch/en/faq) ; [smartwielen](https://2024.smartwielen.lu/en/wiki/lux2024-methodology)).
- Transparence revendiquée « complète » : documents méthodologiques publiés (conception du questionnaire, algorithme, smartspider/smartmap), ancrage scientifique, financement par services (partis/médias) et dons ([FAQ smartvote](https://www.smartvote.ch/en/faq)). smartvote est aussi massivement réutilisé par la recherche pour cartographier les partis suisses ([Germann et al.](https://www.researchgate.net/publication/279259452_Exploiting_Smartvote_Data_for_the_Ideological_Mapping_of_Swiss_Political_Parties)).

---

## 4. VAA et outils fondés sur les votes parlementaires réels

### StemmenTracker (Pays-Bas, ProDemos) — le précédent le plus proche de notre projet

ProDemos (qui fait aussi le StemWijzer) publie le **StemmenTracker** : un « StemWijzer inversé » où les positions des partis ne viennent **pas** des programmes mais de leur **comportement de vote réel à la Tweede Kamer** ([Over de StemmenTracker](https://home.stemmentracker.nl/over-stemmentracker/) ; [ProDemos](https://prodemos.nl/nieuws/nieuwe-stemmentracker-online-hoe-stemde-de-tweede-kamer-afgelopen-regeerperiode/)).

- **Corpus** : 30 stellingen sélectionnées parmi les motions, amendements et projets de loi votés durant la législature écoulée (p. ex. mars 2021 → juillet 2023), sur des critères de **caractère discriminant, saillance et controverse publique** ([Over de StemmenTracker](https://home.stemmentracker.nl/over-stemmentracker/) ; [ProDemos](https://prodemos.nl/nieuws/check-hoe-partijen-de-afgelopen-kabinetsperiode-gestemd-hebben-in-de-stemmentracker/)).
- **Positions** : le vote effectif du groupe parlementaire = la position du parti ; pour chaque stelling, l'utilisateur peut lire **les motivations données par les partis** pour leur vote ([ProDemos](https://prodemos.nl/nieuws/nieuwe-stemmentracker-online-hoe-stemde-de-tweede-kamer-afgelopen-regeerperiode/)).
- **Positionnement produit** : explicitement complémentaire du StemWijzer (promesses) — « qui vote avec qui » vs « qui promet quoi » ([ProDemos](https://prodemos.nl/nieuws/nieuwe-stemmentracker-online-hoe-stemde-de-tweede-kamer-afgelopen-regeerperiode/)). Limite : la méthode publiée ne quantifie pas les critères de sélection des votes.

### TheyWorkForYou (Royaume-Uni, mySociety) — monitoring, pas VAA

Pas un test électoral, mais la référence pour **résumer des historiques de votes** par enjeu ([Voting information, TheyWorkForYou](https://www.theyworkforyou.com/voting-information/)) :

- Votes regroupés par « policy » selon 4 critères publiés : usage réel des pouvoirs du Parlement (pas symbolique), cohérence avec la policy, unicité (peu de chevauchement entre policies), caractère notable.
- Score 0–100 par député et par policy, traduit en formules graduées (« consistently voted for » … « consistently voted against ») ; distinction entre **votes « scoring »** (comptent dans le score) et **votes « informative »** (contexte seulement).
- **Limites reconnues publiquement** : consignes de vote (whip) non publiées → position de parti estimée en moyennant les votes des députés ; **absences exclues du score** (impossible de distinguer absence autorisée et rébellion) ; décisions adoptées sans vote (« on the nod ») = trous dans les données ([ibid.](https://www.theyworkforyou.com/voting-information/)).

### VoteWatch Europe (UE, 2009–2022) — et la critique du biais de sélection

VoteWatch agrégeait les **votes par appel nominal (roll-call)** des eurodéputés et du Conseil ([VoteWatch Europe, brochure](https://fasos.maastrichtuniversity.nl/weekly/wp-content/uploads/2021/01/VoteWatch-Europe-Brochure-2020.pdf) ; [Wikipedia](https://en.wikipedia.org/wiki/VoteWatch_Europe)). Deux critiques méthodologiques documentées, directement pertinentes pour nous :

1. **Biais du roll-call** : seuls certains votes sont enregistrés nominativement ; beaucoup de décisions passent par consensus ou à main levée, donc un indicateur fondé sur les seuls roll-calls déforme la cohésion et les positions réelles ([Wikipedia](https://en.wikipedia.org/wiki/VoteWatch_Europe)).
2. **Biais d'échantillonnage** : le rapport Clingendael (2014) a reproché à VoteWatch d'avoir comparé les votes néerlandais/UE sur **15 votes choisis parmi plus de 5 000**, échantillon non représentatif ([Wikipedia](https://en.wikipedia.org/wiki/VoteWatch_Europe)).

---

## 5. Ce que dit la littérature académique

Synthèse de l'état de l'art : [Garzia & Marschall (2016), *Research on VAAs: State of the Art and Future Directions*, Policy & Internet](https://onlinelibrary.wiley.com/doi/full/10.1002/poi3.140) ; vue d'ensemble design/effets : [Rosema, Anderson & Walgrave](https://medialibrary.uantwerpen.be/oldcontent/container2608/files/Rosema,%20Anderson,%20Walgrave%20-%20The%20design,%20purpose%20and%20effects%20of%20VAAs.pdf).

1. **L'algorithme n'est pas neutre.** Louwerse & Rosema (Acta Politica, 2014), sur les vraies réponses des utilisateurs du StemWijzer : **la majorité des utilisateurs auraient reçu un autre conseil si un autre modèle spatial** (agreement score, city-block, euclidien, dimensionnalité réduite ou non) avait été utilisé ([Springer](https://link.springer.com/article/10.1057/ap.2013.30) ; [page auteur](https://www.tomlouwerse.nl/publications/2014-louwerse-rosema-actapolitica/index.html)).
2. **La sélection des énoncés est le levier le plus puissant.** Walgrave, Nuytemans & Pepermans (West European Politics, 2009), à partir du Stemtest belge : des jeux d'énoncés différents mais également défendables produisent des conseils sensiblement différents ; le poids des énoncés joue un rôle décisif ([Taylor & Francis](https://www.tandfonline.com/doi/full/10.1080/01402380903230637)).
3. **L'échelle de réponse compte aussi.** Rosema & Louwerse (Policy & Internet, 2016) : des échelles différentes (binaire vs 5 points…) produisent des conseils différents, sauf pour les répondants au style extrême ([Wiley](https://onlinelibrary.wiley.com/doi/full/10.1002/poi3.139)).
4. **Le positionnement des partis est le maillon faible.** Gemenis (Acta Politica, 2013) documente les problèmes du **self-placement** (réponses stratégiques, non-réponse) et plaide pour des estimations fondées sur documents ([Springer](https://link.springer.com/article/10.1057/ap.2012.36)) ; il propose une méthode **Delphi itérative d'experts** codant les textes politiques avec feedback contrôlé entre tours, pour réduire erreur aléatoire et biais inter-codeurs ([Quality & Quantity, 2015](https://link.springer.com/article/10.1007/s11135-014-0109-5)). La dérive stratégique du self-placement est confirmée sur le terrain belge par les concepteurs du Stemtest eux-mêmes ([nota 2024](https://www.vrt.be/content/dam/vrtnieuws/bestanden/Stemtest.pdf)).
5. **Effets réels sur les électeurs.** L'usage des VAA est associé à une participation accrue, surtout chez les jeunes, et peut influencer les préférences de parti (expériences de terrain dans 5 pays européens : [Political Communication, 2023](https://www.tandfonline.com/doi/full/10.1080/10584609.2023.2181896) ; synthèse : [Garzia & Marschall 2016](https://onlinelibrary.wiley.com/doi/full/10.1002/poi3.140)). D'où une responsabilité méthodologique élevée.

---

## 6. Enseignements pour notre différenciateur : programmes + votes réels à la Chambre

Notre proposition — positions dérivées des **programmes** et des **votes réels à la Chambre des représentants**, avec **preuves citées** — se situe à l'intersection de deux familles qui n'ont jamais été combinées en Belgique : le VAA classique (Stemtest/Test électoral) et le tracker de votes (StemmenTracker/TheyWorkForYou). Enseignements directement exploitables :

1. **Le créneau est libre en Belgique.** Aucun VAA belge n'utilise le comportement de vote parlementaire ; le Stemtest/Test électoral repose sur le self-placement des partis (vérifié) et les programmes ne servent qu'à la pondération par saillance ([nota 2024](https://www.vrt.be/content/dam/vrtnieuws/bestanden/Stemtest.pdf)). Le StemmenTracker prouve que le concept « votes réels » fonctionne comme produit grand public ([ProDemos](https://prodemos.nl/nieuws/nieuwe-stemmentracker-online-hoe-stemde-de-tweede-kamer-afgelopen-regeerperiode/)).
2. **Le codage documentaire est validé académiquement.** Gemenis recommande précisément ce que nous voulons faire : dériver les positions de **documents vérifiables** plutôt que du self-placement stratégique ([Acta Politica 2013](https://link.springer.com/article/10.1057/ap.2012.36)) — idéalement avec plusieurs codeurs et itération type Delphi pour les cas ambigus ([Q&Q 2015](https://link.springer.com/article/10.1007/s11135-014-0109-5)). Notre « preuve citée » par position (extrait de programme + lien vers le vote à la Chambre) est l'opérationnalisation naturelle de cette recommandation, et va plus loin en transparence que tous les outils étudiés.
3. **Publier les critères de sélection des votes, sinon on reproduit le procès fait à VoteWatch.** Le biais d'échantillonnage (15 votes sur 5 000, critique Clingendael) et le biais des votes nominatifs sont les deux attaques documentées contre les outils « votes réels » ([Wikipedia VoteWatch](https://en.wikipedia.org/wiki/VoteWatch_Europe)). À faire : critères écrits et publics (à la TheyWorkForYou : pouvoir législatif réel, pertinence, unicité, notabilité — [source](https://www.theyworkforyou.com/voting-information/)), et documentation du taux de couverture (quels votes de la Chambre sont nominatifs, lesquels sont exclus et pourquoi).
4. **Gérer les cas limites des votes réels** identifiés par TheyWorkForYou : absences exclues du score (ambiguës), positions de groupe vs dissidents individuels, décisions sans vote ([TheyWorkForYou](https://www.theyworkforyou.com/voting-information/)). S'y ajoute, spécifique à un VAA « votes réels » : l'**asymétrie majorité/opposition** (les partis de la majorité votent la discipline de coalition, pas toujours leur programme) — c'est précisément l'écart promesse/comportement que notre outil peut rendre visible au lieu de le lisser, à condition d'afficher les deux sources côte à côte (à la StemmenTracker vs StemWijzer).
5. **La sélection des énoncés mérite plus d'investissement que l'algorithme — mais l'algorithme doit être documenté.** La littérature montre que le choix des énoncés ([Walgrave et al. 2009](https://www.tandfonline.com/doi/full/10.1080/01402380903230637)), l'échelle de réponse ([Rosema & Louwerse 2016](https://onlinelibrary.wiley.com/doi/full/10.1002/poi3.139)) et la méthode de calcul ([Louwerse & Rosema 2014](https://link.springer.com/article/10.1057/ap.2013.30)) changent chacun le conseil rendu pour une part importante des utilisateurs. Conséquences : (a) critères de qualité d'énoncé réutilisables tels quels depuis la nota Stemtest (concret, futur, une seule idée, pas de double négation, discriminant, équilibre gauche/droite des formulations — [nota 2024](https://www.vrt.be/content/dam/vrtnieuws/bestanden/Stemtest.pdf)) ; (b) publier le modèle de calcul comme la bpb ([Rechenmodell PDF](https://www.bpb.de/system/files/dokument_pdf/Rechenmodell_des_Wahl-O-Mat.pdf)) ; (c) tester la sensibilité du classement à l'algorithme avant de figer un choix.
6. **Pondération : deux mécanismes éprouvés à reprendre.** Boost utilisateur (Wahl-O-Mat : thèse ×2 ; Stemtest : +20 % réparti ; smartvote : ×2 / ×0,5) et, plus original, la **pondération par saillance dérivée des programmes** du Stemtest (analyse de contenu CAP) — réplicable chez nous puisque nous parsons déjà les programmes ([nota 2024](https://www.vrt.be/content/dam/vrtnieuws/bestanden/Stemtest.pdf)).
7. **Posture produit : information, pas injonction.** Tous les outils crédibles présentent un classement + accès aux justifications des partis, et se définissent explicitement comme éducation civique, pas recommandation de vote ([bpb](https://www.bpb.de/themen/wahl-o-mat/bundestagswahl-2025/558464/haeufig-gestellte-fragen-zum-wahl-o-mat/) ; [VRT](https://www.vrt.be/vrtnws/nl/2024/04/09/de-stemtest-2024-wat-is-het-hoe-werkt-het-en-wat-kan-ik-eruit/)). Pour chaque énoncé, montrer : position dérivée du programme (avec citation), vote(s) réel(s) à la Chambre (avec lien), et divergence éventuelle — c'est le cœur de notre valeur ajoutée.

---

### Tableau comparatif synthétique

| Outil | Positions des partis | Format | Matching | Pondération | Transparence | Critiques clés |
|---|---|---|---|---|---|---|
| [De Stemtest / Test électoral](https://www.vrt.be/content/dam/vrtnieuws/bestanden/Stemtest.pdf) | Auto-positionnement **vérifié contre documents** par 2 équipes académiques | 35 énoncés binaires + shoot-outs | Accord pondéré, classement | Boost user 20 % + saillance programme (CAP) par parti | Nota méthodologique publique | Réponses stratégiques des partis ; sensibilité à la sélection d'énoncés |
| [Wahl-O-Mat](https://www.bpb.de/themen/wahl-o-mat/294576/wie-funktioniert-der-wahl-o-mat/) | Auto-positionnement pur + justification 500 car. | 38 thèses, 3 positions + skip | Proximité 2/1/0, % du max | Thèses ×2 au choix de l'utilisateur | [Rechenmodell publié](https://www.bpb.de/system/files/dokument_pdf/Rechenmodell_des_Wahl-O-Mat.pdf) | Binarisation, équilibre thématique artificiel, petits partis |
| [smartvote](https://www.smartvote.ch/en/faq) | Auto-positionnement des **candidats** (~85 % de participation) | 75 questions, échelle à 4 niveaux | Distance (city-block / euclidienne) | ×2 / ×0,5 par question | Docs méthodo publiés ; données réutilisées par la recherche | Longueur ; dépend de la sincérité des candidats |
| [StemmenTracker](https://home.stemmentracker.nl/over-stemmentracker/) | **Votes réels** à la Tweede Kamer | 30 énoncés issus de motions/lois votées | Comparaison position user vs vote du parti | — | Motivations des partis affichées | Critères de sélection des votes peu quantifiés |
| [TheyWorkForYou](https://www.theyworkforyou.com/voting-information/) | **Votes réels** agrégés par policy (pas un VAA) | Scores 0–100 par enjeu | Formules graduées (« consistently voted… ») | Votes « scoring » vs « informative » | Critères et limites publiés | Absences, whip non observable, décisions sans vote |
| [VoteWatch Europe](https://en.wikipedia.org/wiki/VoteWatch_Europe) | **Votes roll-call** PE/Conseil (pas un VAA) | Statistiques de cohésion/loyauté | — | — | Méthodes publiées | Biais roll-call ; échantillons non représentatifs (Clingendael 2014) |
