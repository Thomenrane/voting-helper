# Sources de données : programmes des partis fédéraux FR + NL

> Recherche wayfinder — ticket [#3](https://github.com/Thomenrane/voting-helper/issues/3)
> Vérifications effectuées le **16/07/2026**. Chaque PDF cité a été téléchargé et son nombre de pages
> compté (pypdf) ; chaque page web a été testée (code HTTP). Les cas où le site bloque les requêtes
> automatisées sont signalés — la vérification est alors passée par la Wayback Machine.

---

## Tableau récapitulatif

| Parti | Titre du programme 2024 | Format | Pages | Vérifié |
|---|---|---|---|---|
| PS | Programme du Parti Socialiste — élections du 9 juin 2024 | PDF | 1 220 | HTTP 200 (live) |
| MR | Programme 2024 (complet + synthèse) | 2 PDF | 311 + 100 | HTTP 200 (live) |
| Les Engagés | « Regardons la réalité. Changeons de modèle. » | PDF | 355 | HTTP 200 (live) |
| Ecolo | Programme 2024 consolidé | PDF | 338 | Wayback (site anti-bot) |
| PTB | Programme (chapitres web) | Web | ~15 chapitres | HTTP 200 (live) |
| DéFI | 5 livrets « Axes de campagne » | 5 PDF | 292 (total) | HTTP 200 (live) |
| N-VA | « Voor Vlaamse Welvaart » | PDF | 120 | Wayback (site anti-bot) |
| Vlaams Belang | « Vlaanderen weer van ons » | PDF | 100 | HTTP 200 (live) |
| Vooruit | Verkiezingsprogramma 2024 | PDF | 288 | HTTP 200 (live) |
| CD&V | « Kies zekerheid » (congrès 21/04/2024) | PDF | 442 | HTTP 200 (live) |
| Open Vld (→ Anders.) | Partijprogramma v1.0.9 + Becijferd groeiplan | 2 PDF | 156 + 30 | Wayback (liens d'origine morts) |
| Groen | « Groen voor verandering » | PDF | 45 (planches doubles, ≈85 p. imprimées) | HTTP 200 (live) |
| PVDA | Programma (chapitres web, miroir NL du PTB) | Web | 12+ sections | HTTP 200 (live) |

---

## Côté francophone

### PS — Parti Socialiste
- **Page programme** : <https://www.ps.be/programme-2024> (⚠️ renvoie 403 aux clients automatisés — accessible en navigateur).
- **PDF complet** : <https://assets.nationbuilder.com/psbe/pages/2953/attachments/original/1709026101/Programme_PS_2024.pdf> — vérifié HTTP 200, `application/pdf`, 9,5 Mo, **1 220 pages** (de loin le plus volumineux des 13). Le CDN NationBuilder reste librement accessible même quand ps.be bloque.
- Synthèse « 10 priorités » : <https://www.ps.be/priorites-politique-programme-ps-elections-2024-vote>.

### MR — Mouvement Réformateur
- **Page programme** : <https://www.mr.be/programme2024/> — vérifiée HTTP 200 ; propose deux PDF et une déclinaison en 15 chapitres web. Programme voté au congrès du 04/02/2024.
- **PDF complet** : <https://www.mr.be/wp-content/uploads/2024/02/PROGRAMME-GEN-2024-1.pdf> — vérifié HTTP 200, 2,5 Mo, **311 pages**.
- **PDF synthèse** : <https://www.mr.be/wp-content/uploads/2024/02/PROGRAMME-SYNTH-2024-2.pdf> — vérifié HTTP 200, 3,9 Mo, **100 pages**.

### Les Engagés
- **Page programme** : <https://www.lesengages.be/actualite/le-programme-les-engages-elections-2024/>.
- **PDF complet** : <https://www.lesengages.be/wp-content/uploads/2024/02/lesengages_programme2024_complet_2_v2.pdf> — vérifié HTTP 200, 10,1 Mo, **355 pages**.
- Version FALC (facile à lire) : <https://www.lesengages.be/wp-content/uploads/2024/05/programme-les-engages-falc.pdf>.
- Synthèse web « 111 propositions phares » : <https://www.lesengages.be/111-propositions-phares-pour-changer-de-modele/> — vérifiée HTTP 200.

### Ecolo
- **Page programme** : <https://ecolo.be/programme-2024/> (⚠️ ecolo.be coupe les connexions automatisées — accessible en navigateur).
- **PDF consolidé** : <https://ecolo.be/wp-content/uploads/2024/02/2024-Programme-consolide-final.pdf> — vérifié via la Wayback Machine (`https://web.archive.org/web/2024id_/https://ecolo.be/wp-content/uploads/2024/02/2024-Programme-consolide-final.pdf`), HTTP 200, 4,0 Mo, **338 pages**.

### PTB (aile FR du parti unitaire PTB-PVDA)
- **Format web uniquement** : <https://www.ptb.be/programme> — vérifié HTTP 200. ~15 catégories thématiques (justice fiscale, pouvoir d'achat, politique climatique sociale, démocratie, emploi, santé, mobilité, etc.), chacune avec des sous-pages. Aucun PDF national de programme 2024 n'est exposé sur la page.
- PTB et PVDA sont **un seul parti national** : le contenu NL (<https://www.pvda.be/programma>) est le miroir du contenu FR — une seule ingestion, deux langues.

### DéFI
- **Pages** : <https://www.defi.be/nos-idees/> (positions en articles web, 14 pages de listing) et <https://www.defi.be/nos-publications/> (PDF) — vérifiées HTTP 200.
- **Programme fédéral 2024 = 5 livrets « Axes »** (tous vérifiés HTTP 200, total **292 pages**) :
  1. Remettre la Belgique en état de fonctionner — <https://www.defi.be/wp-content/uploads/livret-axe-1-corr-0324-bd.pdf> (44 p.)
  2. Laïcité politique — <https://www.defi.be/wp-content/uploads/livret-axe-2-corr-0324-bd.pdf> (28 p.)
  3. Libérer l'esprit d'entreprendre — <https://www.defi.be/wp-content/uploads/0523_livret_axe_3_bd.pdf> (36 p.)
  4. Rendre le contrat social plus juste — <https://www.defi.be/wp-content/uploads/livret_axe-_4_corr2024_bd.pdf> (84 p.)
  5. Développement durable, économie et libertés — <https://www.defi.be/wp-content/uploads/0624_livret_axe_5_bd.pdf> (100 p.)
- Notes thématiques complémentaires (justice, logement, environnement, Bruxelles) sur la page publications.
- ⚠️ Piège : le PDF `programme-defi-elections-du-13-octobre-2024-.pdf` trouvé en recherche est le programme des **communales** d'octobre 2024, pas le fédéral.

---

## Côté néerlandophone

### N-VA
- **Page programme** : <https://www.n-va.be/verkiezingen/programma> (⚠️ n-va.be renvoie 403 aux clients automatisés, y compris sur le PDF — accessible en navigateur).
- **PDF** : « Voor Vlaamse Welvaart — verkiezingsprogramma 2024 » (volets flamand, fédéral et européen, 24 domaines) — <https://www.n-va.be/sites/n-va.be/files/2024-04/Verkiezingsprogramma.pdf> — vérifié via Wayback (`https://web.archive.org/web/2024id_/…`), 6,0 Mo, **120 pages**.

### Vlaams Belang
- **Page programme** : <https://www.vlaamsbelang.org/programma> — vérifiée HTTP 200.
- **PDF** : « Vlaanderen weer van ons » — <https://www.vlaamsbelang.org/sites/default/files/2024-03/202403_Verkiezingsprogramma_DEF_Web.pdf> — vérifié HTTP 200, 28,8 Mo, **100 pages**, ~40 chapitres.

### Vooruit
- **PDF** : Verkiezingsprogramma 2024 — <https://assets.nationbuilder.com/vooruit/pages/11936/attachments/original/1709800485/Verkiezingsprogramma_2024.pdf> — vérifié HTTP 200, 2,1 Mo, **288 pages**.
- Positions web : <https://www.vooruit.org/standpunten> (⚠️ 403 pour les bots — accessible en navigateur) ; actualités : <https://nieuws.vooruit.org>.

### CD&V
- **PDF** : « Kies zekerheid » — version congrès du 21/04/2024 — <https://assets.nationbuilder.com/cdenv/pages/8534/attachments/original/1713685808/VKprog_vcongresapril.pdf> — vérifié HTTP 200, 4,9 Mo, **442 pages** (le plus volumineux côté NL).
- Positions web : <https://www.cdenv.be/onze_standpunten> (⚠️ 403 pour les bots).

### Open Vld → « Anders. » ⚠️ rebranding
- Le parti s'est **rebaptisé « Anders. »** : `openvld.be` fait aujourd'hui une redirection 301 vers <https://anders.be/> (vérifié le 16/07/2026). **Toutes les URL historiques openvld.be sont mortes** (404), et les assets NationBuilder du parti renvoient 403.
- **PDF programme 2024** (récupérable uniquement via la Wayback Machine) :
  - Partijprogramma Open Vld v1.0.9 — **156 pages**, 2,7 Mo — <https://web.archive.org/web/20240530063900id_/https://assets.nationbuilder.com/openvld/pages/29787/attachments/original/1716445819/Partijprogramma_1.0.9.pdf> (vérifié HTTP 200).
  - « Becijferd groeiplan » (programme chiffré, 24,7 Md€ d'économies) — **30 pages** — <https://web.archive.org/web/20240814083658id_/https://assets.nationbuilder.com/openvld/pages/29661/attachments/original/1711725852/Becijferd_groeiplan.pdf?1711725852> (vérifié HTTP 200).
- Positions actuelles : blog/actualités sur <https://anders.be/> (vérifié HTTP 200).

### Groen
- **Page programme** : <https://www.groen.be/programma-2024> (⚠️ 403 pour les bots — accessible en navigateur).
- **PDF** : « Groen voor verandering » — <https://assets.nationbuilder.com/groen/pages/16938/attachments/original/1710591090/Programma_Groen.pdf?1710591090=> — vérifié HTTP 200, 2,6 Mo, **45 pages PDF en planches doubles** (pagination interne jusqu'à ±85 pages imprimées). Le plus compact des programmes 2024.
- Positions web : <https://www.groen.be/standpunten>.

### PVDA
- **Format web uniquement** : <https://www.pvda.be/programma> — vérifié HTTP 200. 12 grandes sections (eerlijke belastingen, koopkracht, sociaal klimaatbeleid, democratie, werk, gezondheidszorg, etc.). Miroir néerlandophone du programme PTB (parti unitaire — une seule source de contenu à ingérer).

---

## Cadre juridique belge : citation et réutilisation

> ⚠️ Note de recherche, pas un avis juridique. À faire valider avant lancement public.

### Statut des programmes
- Les programmes électoraux sont des **œuvres protégées par le droit d'auteur** (Code de droit économique, Livre XI). Les partis sont des associations de droit privé (ASBL/VZW) : leurs programmes ne sont **ni** des « actes officiels de l'autorité » (exclus du droit d'auteur par l'art. XI.172, al. 2 CDE), **ni** des informations du secteur public — la législation open data / réutilisation des informations du secteur public (directive (UE) 2019/1024, loi du 4 mai 2016) **ne s'applique donc pas**. Réf. : <https://economie.fgov.be/fr/themes/propriete-intellectuelle/droits-de-propriete/droits-dauteur-et-droits/droits-dauteur>.

### Ce qui est permis
1. **Exception de citation — art. XI.189, §1er CDE** : les citations tirées d'une œuvre licitement publiée, effectuées dans un but de **critique, de polémique, de revue, d'enseignement ou de recherche scientifique**, conformément aux usages honnêtes de la profession et dans la mesure justifiée par le but poursuivi, ne portent pas atteinte au droit d'auteur. **La source et le nom de l'auteur doivent être mentionnés.** Une VAA qui cite de courts extraits de programmes pour comparer/analyser les positions relève typiquement de la critique/revue. Réf. : <https://economie.fgov.be/en/themes/intellectual-property/intellectual-property-rights/copyright-and-related-rights/copyright/use-protected-works/exceptions-copyright>.
2. **Idées et faits non protégés** : le droit d'auteur protège l'expression, pas les idées. **Paraphraser une position** (« le parti X propose de limiter les allocations de chômage à 2 ans ») est libre — c'est la voie principale recommandée pour la base de positions, chaque paraphrase étant accompagnée d'une courte citation sourcée à titre de preuve.
3. **Fouille de textes et de données (TDM) — art. XI.190, 20° CDE** (transposition de l'art. 4 de la directive DSM par la loi du 19 juin 2022) : l'extraction/analyse automatisée est licite si l'accès au contenu est licite et si le titulaire n'a pas réservé ses droits — pour le contenu en ligne, la réserve n'est valable que si elle est exprimée par des **moyens lisibles par machine** (robots.txt, métadonnées). L'art. XI.191/1, §1er, 7° prévoit une exception TDM plus large pour la recherche scientifique. Réf. : <https://www.twobirds.com/en/trending-topics/copyright-directive/copyright-directive-countries/belgium>.
4. **Discours politiques — art. XI.172, al. 1er CDE** : les discours prononcés dans les assemblées délibérantes et les réunions politiques peuvent être **librement reproduits et communiqués au public** (seul le tirage à part reste réservé à l'auteur).
5. **Documents parlementaires** : comptes rendus, votes et documents de la Chambre (<https://www.lachambre.be>) sont des actes officiels / documents publics librement réutilisables.

### Garde-fous pour le produit
- Citations **courtes** (1–2 phrases max par position), toujours attribuées : parti + document + URL + date de consultation.
- **Pas de republication intégrale** des PDF (pas de miroir public des programmes) ; conserver des copies internes d'archivage (couvert par TDM/usage interne) et renvoyer l'utilisateur vers le document officiel.
- Respecter les opt-out lisibles par machine (robots.txt) lors de toute collecte automatisée ; plusieurs sites de partis bloquent activement les bots (voir ci-dessous).

---

## Stratégie de rafraîchissement d'ici 2029

Les programmes 2029 n'existeront probablement pas avant **T1–T2 2029** (en 2024, les congrès programmatiques se sont tenus 2 à 4 mois avant le scrutin : MR le 04/02, Vlaams Belang en mars, Open Vld le 09/03, CD&V le 21/04). D'ici là, quatre couches de « positions vivantes » :

1. **Pages de positions maintenues en continu** (mises à jour hors cycle électoral) :
   `n-va.be/standpunten`, `cdenv.be/onze_standpunten`, `vooruit.org/standpunten`, `groen.be/standpunten`, `pvda.be/programma` / `ptb.be/programme`, `defi.be/nos-idees`, plus les sections idées/actualités de ps.be, mr.be, lesengages.be, ecolo.be, vlaamsbelang.org, anders.be.
2. **Communiqués et actualités** : sections nieuws/actualités de chaque site de parti (ex. `nieuws.vooruit.org`, `vlaamsbelang.org/nieuws`, `lesengages.be/actualite`, blog `anders.be`). Signal rapide mais bruité — à réserver aux sujets chauds.
3. **Comportement parlementaire réel** : votes nominatifs et propositions de loi par groupe politique à la Chambre (<https://www.lachambre.be> / <https://www.dekamer.be>). Donnée objective, libre de droits, automatisable — la meilleure source pour objectiver l'écart programme/pratique. L'accord de gouvernement fédéral (coalition « Arizona », 2025) documente en outre les positions effectives de N-VA, MR, Les Engagés, Vooruit et CD&V.
4. **Résolutions de congrès** : les congrès idéologiques/thématiques entre deux scrutins actualisent officiellement la ligne (couverts par l'art. XI.172 pour les discours ; les textes de résolution restent des œuvres → citation courte).

### Points opérationnels
- **Anti-bot** : `ps.be`, `ecolo.be`, `groen.be`, `vooruit.org`, `cdenv.be`, `n-va.be` renvoient 403/reset aux clients automatisés (constaté le 16/07/2026). Prévoir téléchargement manuel ou navigateur headless, en respectant les opt-out TDM.
- **CDN NationBuilder** : `assets.nationbuilder.com` sert les PDF de PS, Vooruit, CD&V et Groen sans blocage — canal d'ingestion stable.
- **Liens périssables** : le rebranding Open Vld → Anders. a tué toutes les URL openvld.be en ~1 an. **Snapshotter chaque source (Wayback Machine + copie interne horodatée) au moment de l'ingestion** ; ne jamais dépendre d'une URL de parti comme unique référence.
- **PTB/PVDA** : parti unitaire, un seul corpus bilingue — dédupliquer à l'ingestion.
