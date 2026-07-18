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

Le choix des marqueurs de niveau est **délibérément conservateur** : seuls des
termes fédéraux **explicites** comptent (« fédéral/federaal », « élections
fédérales/federale verkiezingen », « Chambre des représentants / Kamer van
volksvertegenwoordigers »). Une formulation générique — « verkiezingsprogramma
2024 », « élections 2024 » — n'affirme **aucun** niveau : le 9 juin 2024, les
scrutins fédéral, régional et européen ont eu lieu le même jour. Un intitulé
régional-framé qui ne cite pas explicitement le fédéral ne satisfait donc pas
nettement ce critère.

> **Cas tranché — N-VA « Voor Vlaamse Welvaart ».** L'année 2024 est présente,
> mais le titre est framé « flamand » et le document combine des volets
> flamand, fédéral et européen : le niveau fédéral n'est pas affirmé nettement
> dans les premières pages. Verdict conservateur : **UNCERTAIN**, jamais un
> PASS par défaut → un humain confirme (voir « ré-entrée » ci-dessous).

Absence de l'année, ou niveau non affirmé → le critère n'est pas nettement
satisfait → **UNCERTAIN**.

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
UNCERTAIN → UNCERTAIN ; sinon PASS).

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

## Statut publié

`npm run admit:report` génère deux artefacts committés — un statut humain
(`docs/admission/statut-verification.md`) et un JSON machine
(`data/admission/statut-verification.json`) — listant le verdict et les raisons
par parti. C'est la surface de transparence (cohérente avec #26) qui alimente
le canal de contestation.

## Résidu irréductible

Certains cas ne sont pas mécaniquement tranchables et restent **UNCERTAIN par
conception**, pour escalade humaine :

- **Un document authentique mais au périmètre ambigu** : le programme N-VA
  combine plusieurs niveaux ; « le volet fédéral est-il celui-ci ? » ne se
  décide pas sur les seules premières pages.
- **Une structure sans pagination** (`web-chapters`, PTB/PVDA) : la couche texte
  par page ne couvre pas le HTML (limitation #22) ; l'auto-identification et la
  détection de troncature n'y sont pas exécutables.
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
réponse comme attestation via le chemin de ré-entrée. C'est une démarche
**opérationnelle documentée**, hors code : elle transforme un doute mécanique
irréductible en une attestation humaine sourcée et publiée. À réserver aux cas
où l'auto-identification et la review ne suffisent pas à trancher.

## État actuel du frontend (mode démo)

L'admission s'exécute côté pipeline (commandes `admit:report`, `admit:source`,
et la porte câblée dans `extract:positions`). Le statut publié est un document
committé ; aucune page de site dédiée n'est encore exposée. En l'absence des
binaires de couche texte en local (gitignorés, #21), le statut de référence est
conservateur — tous les partis en UNCERTAIN tant que l'auto-identification n'est
pas exécutée sur le contenu réel — ce qui illustre exactement le « jamais PASS
par défaut ».
