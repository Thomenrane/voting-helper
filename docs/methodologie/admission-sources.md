# Admission des sources : identité et complétude des programmes

Ce document décrit comment une source (le programme d'un parti) est admise —
ou non — dans le corpus. Il est publiable tel quel et fait foi : le code du
pipeline (`pipeline/src/admission/`) implémente exactement ces règles, et toute
évolution passe par une mise à jour de ce document dans la même pull request.

## Pourquoi une porte d'admission

Le SHA-256 committé (#21) garantit l'**intégrité** : le document dont on extrait
est identique au bit près à celui qui a été snapshoté. Il ne garantit **pas la
correction de la source** : on peut avoir figé, avec une empreinte parfaite, le
*mauvais* document — mauvaise année (2019), mauvais niveau (régional au lieu de
fédéral), une synthèse à la place du programme complet, ou un document
silencieusement incomplet (un livret manquant, un PDF tronqué). Une source
erronée empoisonnerait toute l'extraction en aval.

La porte d'admission est **fail-closed** : aucun parti n'entre dans le corpus
sans un verdict **PASS** net. Le point de contrôle est unique
(`assertPartyAdmitted`, `pipeline/src/admission/gate.ts`) et l'extraction
l'appelle avant tout traitement d'un parti — un parti non-PASS est refusé,
sans contournement possible.

## La référence : le registre d'identité attendue

Pour chaque parti, un registre (`expected-identity.ts`, seedé depuis
`docs/research/programmes-partis.md`) fixe ce que la source **doit** être :

- **titre** attendu du programme 2024 ;
- **année** attendue (2024) ;
- **niveau** attendu (fédéral) ;
- **structure** attendue : `single-pdf` (un PDF complet), `n-booklets`
  (plusieurs PDF formant ensemble le programme — DéFI = 5 livrets, Open Vld =
  programme + plan chiffré) ou `web-chapters` (chapitres web sans PDF national —
  PTB/PVDA) ;
- **pages/taille** approximatives, par partie et au total.

## Les critères d'admission

Chaque critère est un module pur, testé. Le verdict agrège leurs constats.

### 1. Auto-identification (année + niveau)

Les premières pages (5 par défaut) doivent porter **l'année attendue** ET **le
niveau fédéral**, dans les deux langues (FR + NL). La normalisation est
partagée avec le reste du pipeline (`foldForLexical`) : la comparaison est
insensible à la casse et aux accents.

Le choix des marqueurs de niveau est **délibérément conservateur** : le
document doit **se déclarer** programme fédéral, pas seulement **mentionner** le
fédéral. Seules des **phrases fortes d'auto-désignation** comptent — «
élections fédérales », « Chambre des représentants », « federale verkiezingen »,
« kamer van volksvertegenwoordigers » (et variantes proches). Les **jetons nus**
(« fédéral », « federale », « federaal », « Chambre », « Kamer ») sont
**exclus** : ils apparaissent dans quasiment tout document politique belge, y
compris un programme régional/nationaliste flamand qui *parle* du fédéral (« de
federale overheid », « federale regering », « in de Kamer ») sans en être un ;
les compter donnerait un faux `level.present` — donc un faux PASS — sur
exactement les cas durs. Une formulation générique — « verkiezingsprogramma
2024 », « élections 2024 » — n'affirme **aucun** niveau non plus : le 9 juin
2024, les scrutins fédéral, régional et européen ont eu lieu le même jour.

L'**année** attendue ne suffit pas isolée (« budget 2024 » ne dit rien) : elle
doit apparaître **à proximité** d'un marqueur d'auto-désignation de programme
(« programme », « programma », « verkiezingsprogramma »).

> **Cas tranché — N-VA « Voor Vlaamse Welvaart ».** L'année 2024 est présente,
> mais le titre est framé « flamand » et le document combine des volets
> flamand, fédéral et européen. Même quand ses premières pages **discutent** du
> fédéral (« de federale overheid », « federale regering », « in de Kamer »),
> aucune **phrase forte d'auto-désignation fédérale** n'y figure : le niveau
> fédéral n'est pas affirmé nettement. Verdict conservateur : **UNCERTAIN**,
> jamais un PASS par défaut → un humain confirme (voir « ré-entrée »
> ci-dessous). C'est précisément le durcissement qui empêche un faux PASS sur ce
> cas.

Absence de l'année (ou année isolée), ou niveau non affirmé par une phrase forte
→ le critère n'est pas nettement satisfait → **UNCERTAIN**.

### 2. Complétude

- **Inventaire des parties multiples.** Pour `n-booklets` / `web-chapters`,
  toutes les parties déclarées au registre doivent être présentes (snapshotées).
  Une partie manquante (un livret DéFI, un miroir PTB/PVDA) est une incomplétude
  **prouvée** → **FAIL**.
- **Table des matières → dernière page.** Si une TOC est détectée, la dernière
  page qu'elle référence doit être ≤ au nombre réel de pages. Une TOC qui
  déborde révèle une **troncature** → **FAIL**. Absence de TOC exploitable :
  contrôle non concluant (neutre), jamais un échec en soi.
- **Pages/taille.** Le nombre réel de pages doit être dans une tolérance de
  l'attendu (± 15 %, plancher de 5 pages). Hors tolérance (p. ex. la synthèse
  MR de 100 p. servie à la place du programme complet de 311 p.) → **UNCERTAIN**.

### 3. Le verdict

`PASS` / `UNCERTAIN` / `FAIL`, avec des raisons lisibles par **machine** (codes
stables) et par **humain**. Deux principes :

- **Conservateur par défaut.** PASS exige que **chaque** critère soit
  positivement confirmé. Tout critère non nettement satisfait — année/niveau non
  affirmés, taille hors tolérance, évidence indisponible — pèse **UNCERTAIN**,
  jamais PASS.
- **FAIL réservé au prouvé-faux.** Seules une incomplétude (partie manquante) ou
  une troncature (TOC qui déborde) donnent FAIL. L'ambigu est UNCERTAIN, pas
  FAIL.

Le statut global est la pire sévérité rencontrée (un FAIL → FAIL ; sinon un
UNCERTAIN → UNCERTAIN ; sinon PASS). Un critère UNCERTAIN **ratifié** par une
attestation humaine valide (voir `admit:attest` ci-dessous) devient PASS
**attesté** ; un FAIL ou un NON MATÉRIALISÉ n'est jamais ratifiable.

## Le chemin de ré-entrée humain (garde-fou)

Quand un parti est UNCERTAIN ou FAIL, la porte reste fermée et un humain
intervient. La commande `npm run admit:source` (`admit-source.ts`) :

1. prend un document fourni manuellement (téléchargé en navigateur pour
   contourner un blocage anti-bot, ou trouvé à la bonne source) ;
2. le **snapshote en réutilisant la machinerie #21** : empreinte SHA-256, entrée
   immuable datée, canal `manual`, avec une **attestation** — qui, quand, quelle
   source (URL ou description), et une note optionnelle ;
3. l'attestation est **enregistrée au manifeste** et **publiée** par
   `npm run admit:report` ;
4. re-dérive la couche texte du nouveau document et **re-passe la porte** ;
5. le nouveau verdict est imprimé. Si toujours non-PASS, la porte reste fermée.

## La ratification d'un critère (attestation humaine) — `admit:attest`

`admit:source` **remplace** un document ; il ne répond pas au cas où le document
est **déjà le bon** mais où la porte n'arrive pas à **auto-confirmer** un
critère. Cas réel : le scrutin du 9 juin 2024 était fédéral, régional et
européen le même jour, si bien que la plupart des couvertures disent «
Élections du 9 juin 2024 » ou « Verkiezingsprogramma 2024 » sans le mot «
fédéral ». Le document est correct, mais `auto-id-level` reste **UNCERTAIN**, et
re-fournir le même bon PDF via `admit:source` ne change rien.

`npm run admit:attest` est le chemin de **ratification** : un humain vérifie le
document et **ratifie un critère UNCERTAIN précis**, ce qui le fait passer à
**PASS attesté** — publié *distinctement* d'un PASS automatique.

```
npm run admit:attest -- --party ps --criteria auto-id-level \
  --by "Thomas" --note "Couverture « Élections du 9 juin 2024 » vérifiée à la main"
```

La commande recalcule le verdict courant, attache une **attestation de critère**
(qui, quand, note, et le **SHA-256** du snapshot épinglé) au snapshot brut
**actuellement épinglé** du parti, sauvegarde le manifeste et re-passe la porte.
Sans réseau ni clé, sans `--file` (le document est déjà snapshoté).

### Ce qu'une attestation peut et ne peut PAS outrepasser

- **Seul un critère UNCERTAIN est ratifiable.** Un critère **FAIL** (prouvé-faux
  — partie manquante, TOC qui déborde) ou **NON MATÉRIALISÉ** (binaire absent,
  non évalué) est **refusé** : on corrige le document ou on matérialise le
  snapshot d'abord, on ne « ratifie » jamais un échec ou un contrôle non
  exécuté. Les contrôles qui ne produisent que PASS/FAIL (`parts-inventory`,
  `toc-bounds`) ne sont pas ratifiables du tout ; seuls le sont ceux qui peuvent
  valoir UNCERTAIN : `auto-id-year`, `auto-id-level`, `page-tolerance`.
- **Périmètre du critère.** Une attestation ne ratifie que le(s) critère(s)
  **nommé(s)**. Les autres continuent d'être évalués normalement : un
  `toc.exceeds` réel reste FAIL même si `auto-id-level` est attesté, et le parti
  ne sort **pas** PASS (l'agrégation pire-cas est préservée).
- **Liée à l'empreinte.** L'attestation référence le SHA-256 du snapshot au
  moment de la ratification. Si le document change (re-fetch / remplacement via
  `admit:source`), l'empreinte courante diverge, l'attestation est **invalidée**
  et le critère **redevient UNCERTAIN**. On ne peut pas attester le document A
  puis lui substituer B en gardant le PASS.

### Comment elle est publiée

`admit:report` marque un tel verdict **`✅ PASS (attesté)`**, distinct d'un `✅
PASS` automatique, compte les partis attestés dans le bilan, et liste chaque
critère ratifié avec **attestant, date et note** — dans le résumé du tableau et
le détail par parti. Le lecteur voit ainsi ce qui est **machine** (auto-confirmé)
vs **humain** (ratifié). Le JSON machine porte la trace d'attestation pour la
contestation.

## Statut publié

`npm run admit:report` génère deux artefacts committés — un statut humain
(`docs/admission/statut-verification.md`) et un JSON machine
(`data/admission/statut-verification.json`) — listant le verdict et les raisons
par parti. C'est la surface de transparence (cohérente avec #26) qui alimente
le canal de contestation.

## Sources web-chapitres : matérialisation et contrôle (#51)

PTB-PVDA — le parti unitaire qui ne publie **aucun PDF national** — expose son
programme comme un **index web de chapitres** (`ptb.be/programme`,
`pvda.be/programma`). L'investigation #51 a établi que l'index n'est qu'une
**table de liens** (aucun contenu inline) : le corpus réel vit dans une page par
chapitre (48 FR + 47 NL). La couche texte par page (#22) étant PDF-only, ces
partis restaient **NON MATÉRIALISÉ** — absents du corpus pour une pure raison de
format. #51 lève ce blocage sans dégrader aucune garantie :

1. **Crawl borné (`snapshot:programme-chapters`).** Depuis l'index snapshoté
   (intégrité #21 vérifiée), on extrait les liens de chapitres avec une
   **allowlist stricte** : même origine que l'index, exactement **un** segment
   sous le chemin de programme (`/programme/<slug>`, `/programma/<slug>`), slugs
   path-safe, dédupliqués, ordonnés, **plafonnés** (`MAX_CHAPTERS_PER_INDEX`).
   Aucune découverte libre, aucune récursion. Chaque chapitre est snapshoté par
   la **même** machinerie #21 (entrée datée immuable, empreinte SHA-256).
2. **Couche texte par chapitre.** Chaque chapitre = une « page » de la même
   structure `ProgrammeTextLayer` que le PDF — l'admission et l'extraction
   restent **agnostiques à la source**. L'extraction HTML→texte retire le
   boilerplate (nav/menus/pied de page/bannière cookie du thème `drupack`) et
   conserve le `<main>`. Chaque page-chapitre est **ancrée au SHA-256 de son
   propre snapshot** ; l'empreinte de la couche est un composite déterministe de
   ces empreintes.
3. **Intégrité fail-closed.** La couche n'est matérialisée que si **tous** les
   chapitres sont présents localement **et** authentiques (octets concordant
   avec l'empreinte committée). Un chapitre manquant (crawl partiel) ou
   **falsifié** ⇒ **aucune** couche ⇒ retour à NON MATÉRIALISÉ, jamais un verdict
   faussé.
4. **Verdict réel.** Une fois les chapitres crawlés, `admit:report` matérialise
   la couche et rend un **vrai** PASS/UNCERTAIN/FAIL (auto-identification année +
   niveau sur le texte des chapitres). Les contrôles à pagination
   (`toc-bounds`, `page-tolerance`) restent `not-applicable`/neutres — la
   complétude s'appuie sur l'inventaire des chapitres attendus, pas sur un
   nombre de pages.

Tant que le crawl n'a pas tourné (chapitres non encore snapshotés), le parti
reste honnêtement **NON MATÉRIALISÉ** — distinct d'un doute réel.

## Résidu irréductible

Certains cas ne sont pas mécaniquement tranchables et restent **UNCERTAIN par
conception**, pour escalade humaine :

- **Un document authentique mais au périmètre ambigu** : le programme N-VA
  combine plusieurs niveaux ; « le volet fédéral est-il celui-ci ? » ne se
  décide pas sur les seules premières pages.
- **Une structure sans pagination** (`web-chapters`, PTB/PVDA) : les contrôles à
  pagination (tolérance de pages, TOC) n'y sont pas applicables — par
  construction, et non par défaut de matérialisation (voir « Sources
  web-chapitres » ci-dessous). L'auto-identification, elle, **est** exécutée sur
  le texte des chapitres depuis #51.
- **Une refonte/édition intermédiaire** entre deux congrès : intègre-t-elle le
  bon texte de référence ? Question éditoriale, pas mécanique.
- **Une TOC absente ou non structurée** : la troncature ne peut alors pas être
  détectée par ce contrôle.

Ce résidu est **publié**, pas caché : le statut par parti expose exactement quel
critère bloque, pour que la contestation et la review humaine s'y appliquent.

## Option opérationnelle : demander confirmation au parti

Pour lever un UNCERTAIN persistant sur l'identité d'une source (typiquement « ce
document est-il bien votre programme fédéral 2024 complet ? »), l'option la plus
robuste est de **demander confirmation directe au parti** et d'archiver la
réponse comme attestation. Selon le cas, on ratifie alors le critère UNCERTAIN
via `admit:attest` (le document épinglé est le bon) ou on re-fournit le document
via `admit:source` (il faut le remplacer). C'est une démarche **opérationnelle
documentée** : elle transforme un doute mécanique irréductible en une
attestation humaine sourcée et publiée. À réserver aux cas où
l'auto-identification et la review ne suffisent pas à trancher.

## État actuel du frontend (mode démo)

L'admission s'exécute côté pipeline (commandes `admit:report`, `admit:source`,
`admit:attest`, et la porte câblée dans `extract:positions`). Le statut publié est un document
committé ; aucune page de site dédiée n'est encore exposée. En l'absence des
binaires de couche texte en local (gitignorés, #21), le statut de référence est
conservateur — tous les partis en UNCERTAIN tant que l'auto-identification n'est
pas exécutée sur le contenu réel — ce qui illustre exactement le « jamais PASS
par défaut ».
