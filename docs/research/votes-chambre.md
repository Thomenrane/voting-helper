# Sources de données : votes nominatifs à la Chambre des représentants

> Ticket : [#2 — Sources de données : votes nominatifs à la Chambre](https://github.com/Thomenrane/voting-helper/issues/2) (part of #1)
> Date de l'enquête : 16/07/2026. Toutes les affirmations ci-dessous ont été vérifiées contre la source primaire citée à la date de l'enquête.

## TL;DR

Il n'existe **aucune source officielle structurée** (API, dump) pour les votes nominatifs de la Chambre. L'API open data officielle (`data.lachambre.be`) ne couvre pas les votes. La seule source primaire exhaustive est le **compte rendu intégral (CRIV)** de chaque séance plénière, publié en HTML et PDF sur lachambre.be/dekamer.be, dont l'annexe « Détail des votes nominatifs » liste, vote par vote, les noms des députés ayant voté oui / non / abstention. Le lien vote → dossier → thème passe par les **fiches FLWB** des dossiers législatifs (statut, date du vote, descripteurs Eurovoc). Un projet tiers sérieux, **zijwerkenvooru** (open source, CC0, référencé sur data.gov.be), scrape déjà ces pages et publie des fichiers Parquet, mais ne couvre que la législature 56.

---

## 1. Compte rendu intégral des séances plénières (CRIV) — lachambre.be / dekamer.be

**La** source primaire des votes nominatifs. Chaque séance plénière produit un compte rendu intégral bilingue dont la fin contient la section **« DETAIL VAN DE NAAMSTEMMINGEN / DETAIL DES VOTES NOMINATIFS »** : chaque vote est numéroté (« Naamstemming - Vote nominatif : N »), avec le décompte Oui/Non/Abstentions puis les **listes nominatives complètes des députés par catégorie de vote** (vérifié sur le CRIV de la séance 79, législature 56 : « Ja 77 Oui / Bacquelaine Daniel, Bergers Jeroen, Bertels Jan… »).

- **URLs** (patrons stables, versions FR et NL interchangeables via lachambre.be / dekamer.be) :
  - PDF : `https://www.lachambre.be/doc/PCRI/pdf/{législature}/ip{NNN}.pdf` — ex. [56/ip079.pdf](https://www.lachambre.be/doc/PCRI/pdf/56/ip079.pdf), [55/ip158.pdf](https://www.lachambre.be/doc/PCRI/pdf/55/ip158.pdf), [51/ip225.pdf](https://www.dekamer.be/doc/PCRI/pdf/51/ip225.pdf)
  - HTML : `https://www.lachambre.be/doc/PCRI/html/{législature}/ip{NNN}x.html` — ex. [56/ip079x.html](https://www.lachambre.be/doc/PCRI/html/56/ip079x.html) (contenu intégral vérifié, y compris le détail nominatif)
  - Index par législature : [liste des comptes rendus plénière](https://www.lachambre.be/kvvcr/showpage.cfm?section=/cricra&language=fr&cfm=dcricra.cfm?type=plen&cricra=cri&count=all)
- **Couverture temporelle** : l'index en ligne propose les **législatures 50 à 56** (1999 → aujourd'hui), plus une rubrique d'archives « 1830-1999 » (documents historiques numérisés, non exploitables tels quels). Vérifié sur [la page d'index CRIV](https://www.lachambre.be/kvvcr/showpage.cfm?section=/cricra&language=fr&cfm=dcricra.cfm?type=plen&cricra=cri&count=all&legislat=49) : la législature 49 n'est pas proposée comme option distincte.
- **Granularité** : **vote individuel par député** (nom + prénom), par vote nominatif numéroté. Le corps du compte rendu relie chaque numéro de vote au point de l'ordre du jour et au numéro de document (`DOC 56 XXXX/00X`), donc au dossier législatif. Les « pairages » (abstention convenue avec un absent) sont annoncés avant les votes.
- **Format** : HTML et PDF non structurés → **scraping + parsing obligatoires**. Pas de XML, pas de JSON, pas d'API.
- **Fraîcheur** : une **version provisoire** du compte rendu (marquée « Ne pas citer sans mentionner la source », ex. [IP001_PR.pdf](https://www.lachambre.be/kvvcr/pdf_sections/spcri/IP001_PR.pdf)) est publiée rapidement après la séance ; la version définitive suit. Les séances plénières avec votes ont lieu typiquement chaque jeudi en période de session.
- **Licence / conditions** : **aucune licence ouverte explicite** sur le site. La [page d'information juridique](https://www.lachambre.be/accessible/laChambre_servJurid_info.htm) ne contient qu'un disclaimer d'exactitude, aucune clause de réutilisation ; les versions provisoires exigent la mention de la source. Régime par défaut : documents parlementaires officiels, réutilisation de fait tolérée avec mention de la source (et loi belge PSI/open data), mais à clarifier avec la Chambre pour un usage en production.
- **Point d'attention opérationnel** : le site est derrière un **WAF qui rejette les clients non-navigateurs** (réponse « Request Rejected » observée sur toute requête `curl`, y compris avec User-Agent navigateur). Un scraper doit se comporter comme un navigateur et prévoir cache + throttling.

## 2. Fiches des dossiers législatifs (FLWB) — lachambre.be

Le maillon **vote → dossier → thème**. Chaque dossier législatif a une fiche FLWB.

- **URL** : `https://www.lachambre.be/kvvcr/showpage.cfm?section=flwb&language=fr&cfm=/site/wwwcfm/flwb/flwbn.cfm?lang=FR&legislat={législature}&dossierID={NNNN}` — ex. [56K0483](https://www.lachambre.be/kvvcr/showpage.cfm?section=flwb&language=fr&rightmenu=right&cfm=/site/wwwcfm/flwb/flwbn.cfm?lang%3DFR&legislat=56&dossierID=0483)
- **Contenu vérifié** (fiche 56K0483) : identifiant du dossier, date de dépôt, **date du vote Chambre (04/12/2025) et résultat (« ADOPTE CHAMBRE »)**, publication au Moniteur, sous-documents (amendements, rapports, textes adoptés), et surtout **descripteurs Eurovoc** (descripteur principal + descripteurs associés, ex. « DROIT CIVIL ; DIVORCE ; LOGEMENT ; VIOLENCE DOMESTIQUE… ») + mots-clés libres.
- **Granularité** : niveau dossier (résultat global du vote, pas le détail par député) — c'est le CRIV qui porte le détail nominatif ; la jointure se fait par numéro de dossier/document et date de séance.
- **Format** : HTML uniquement → scraping. Couverture : législature 48+ (des fiches de la législature 47-48 existent, ex. [47K0847](https://www.lachambre.be/FLWB/html/47/F/47K0847.html)).
- **Thématisation** : les descripteurs **Eurovoc** ([thésaurus multilingue de l'UE](https://eur-lex.europa.eu/browse/eurovoc.html?locale=fr)) fournissent une taxonomie thématique normalisée et multilingue — exactement ce qu'il faut pour rattacher un vote à un thème d'une voting advice application.

## 3. Portail open data officiel — data.lachambre.be / data.dekamer.be

- **URL** : [data.lachambre.be](https://data.lachambre.be/) — API REST XML/JSON, documentation Swagger sur [/v0/api/index.html](https://data.lachambre.be/v0/api/index.html), spec sur `/v0/swagger.json`.
- **Collections disponibles** (vérifié dans le swagger, liste exhaustive des paths) : `ACTR` (acteurs politiques), `ORGN` (organes), `QRVA` (questions écrites, avec archives zip XML+JSON par législature), `INQO` (interpellations et questions orales, législature 54). **Aucun endpoint votes, séances plénières ou dossiers législatifs.**
- **Maturité** : la page d'accueil annonce une « phase conceptuelle », des « données de test… pas nécessairement à jour et complètes », version 0.0.6 du **08/11/2016** — le portail n'a pas évolué depuis près de dix ans.
- **Licence** : non précisée sur le portail.
- **Conclusion** : inutilisable pour les votes ; utile au mieux comme référentiel des députés (ACTR) et groupes (ORGN). À surveiller au cas où la Chambre étendrait enfin l'offre.

## 4. Projet tiers : zijwerkenvooru (« Zij werken voor u »)

Projet open source sérieux, référencé sur le portail fédéral data.gov.be, qui fait exactement le scraping décrit ci-dessus.

- **Code** : [github.com/thepycoder/zijwerkenvooru](https://github.com/thepycoder/zijwerkenvooru) (Rust ; scrapers plénière + commissions ; parsing des pages HTML de dekamer.be et public.regimand.be ; cache des sources ; GitHub Actions planifié). Site : [zijwerkenvooru.be](https://www.zijwerkenvooru.be).
- **Données publiées** : fichiers **Parquet** dont `votes.parquet` (votes en séance plénière), `meetings.parquet`, `dossiers.parquet`, `subdocuments.parquet`, `members.parquet`, `propositions.parquet`… Le README confirme un détail **par député et par parti** pour chaque vote.
- **Référencement officiel** : dataset « Données parlementaires – Chambre des représentants » sur [data.gov.be](https://data.gov.be/fr/datasets/datafederaalparlement) — **licence CC0 (CC Zero)**, mise à jour **hebdomadaire** (le README parle d'un workflow planifié quotidien), couverture déclarée **2024-07-04 → 2029-06-09**.
- **Limites** : couvre **uniquement la législature 56 (2024-2029)** (« The scraper is capable of scraping older data as well, but this is currently not enabled » — README) ; « best-effort basis », complétude non garantie ; projet individuel (bus factor = 1) ; la licence CC0 porte sur les fichiers produits, pas sur les données amont de la Chambre (voir §1).

## 5. Pistes écartées

- **openbesluitvorming.nl / Open State Foundation** : écosystème néerlandais (Tweede Kamer via [opendata.tweedekamer.nl](https://opendata.tweedekamer.nl/)) ; ne couvre pas le parlement fédéral belge.
- **data.gov.be côté Chambre** : hormis le dataset zijwerkenvooru et une [visualisation des questions parlementaires](https://data.gov.be/nl/app/visualisatie-parlementaire-vragen), pas de dataset officiel de votes publié par la Chambre elle-même.
- **Archives 1830-1999** : annales numérisées (scans), hors périmètre d'un pipeline automatisé.

---

## Recommandation

**Voie d'ingestion recommandée : scraper les sources primaires de la Chambre (CRIV HTML + fiches FLWB), en s'appuyant sur zijwerkenvooru comme référence d'implémentation et comme bootstrap de données.**

1. **Détail nominatif** : parser les CRIV **HTML** (`/doc/PCRI/html/{leg}/ip{NNN}x.html`) — plus robuste que le PDF, même contenu, section « Détail des votes nominatifs » bien délimitée. Couverture possible législatures 50 → 56 (1999 → aujourd'hui), soit largement assez pour une voting advice application (les législatures 55-56 suffisent probablement au produit).
2. **Contexte et thème** : joindre chaque vote à sa fiche **FLWB** via le numéro `DOC {leg} XXXX` cité dans le compte rendu ; en tirer statut, date du vote, sous-documents et **descripteurs Eurovoc** pour la thématisation.
3. **Référentiel députés/groupes** : l'API officielle `ACTR`/`ORGN` de data.lachambre.be peut servir de référentiel d'identités (avec prudence vu son statut « données de test »), sinon `members.parquet` de zijwerkenvooru (CC0).
4. **Court terme** : pour prototyper sur la législature 56, consommer directement les Parquet CC0 de [data.gov.be/datafederaalparlement](https://data.gov.be/fr/datasets/datafederaalparlement) — zéro coût d'ingestion, granularité par député. Basculer sur notre propre scraper (ou un fork du leur) dès qu'il faut : l'historique < 2024, une fraîcheur garantie, ou une indépendance vis-à-vis d'un projet individuel.
5. **Risques à gérer** : WAF de lachambre.be (se comporter en navigateur, cache agressif, throttling) ; absence de licence ouverte explicite côté Chambre → contacter le service compétent de la Chambre pour valider la réutilisation avant mise en production ; versions provisoires vs définitives des CRIV (re-scraper la version définitive).
6. **À surveiller** : toute extension du portail officiel data.lachambre.be à des collections « votes » ou « FLWB », qui rendrait le scraping obsolète.
