# Statut de vérification des sources — programmes fédéraux 2024

> Artefact généré par `npm run admit:report`. Ne pas éditer à la main.
> Généré le 2026-07-16.

Ce document publie, parti par parti, le verdict du portail d'admission des
sources (#42). Le portail est **fail-closed** : aucun parti n'entre dans le
corpus sans un verdict **PASS** net. Tout critère qui n'est pas nettement
satisfait donne **UNCERTAIN** (→ un humain recherche et fournit le bon
document via `npm run admit:source`, qui re-passe la porte). **FAIL** est
réservé au prouvé-faux (partie manquante, document tronqué).

**NON MATÉRIALISÉ** (#46) est distinct d'un doute : le binaire brut n'est
pas disponible localement, donc la couche texte n'a pas pu être matérialisée
et l'auto-identification n'a pas été évaluée. Ce n'est ni un doute de niveau
réel, ni un échec — c'est « pas encore évalué faute de binaire ». Quand le
binaire est présent, `admit:report` re-dérive la couche depuis le snapshot
épinglé (intégrité SHA-256 #21) et publie le VRAI PASS/UNCERTAIN/FAIL.

**PASS (attesté)** (#50) distingue un PASS obtenu par **ratification humaine**
d'un critère UNCERTAIN — un humain a vérifié le document et l'a ratifié via
`npm run admit:attest`, l'attestation étant liée à l'empreinte SHA-256 du
snapshot épinglé. Une attestation ne ratifie que le critère nommé et ne peut
PAS transformer un FAIL (prouvé-faux) ni un NON MATÉRIALISÉ en PASS ; remplacer
le document l'invalide. Chaque ratification est publiée ci-dessous (qui, quand,
pourquoi).

**Bilan :** 0 PASS · 0 UNCERTAIN · 0 FAIL · 12 NON MATÉRIALISÉ (12 partis).

| Parti | Verdict | Résumé |
|---|---|---|
| cdv | ⚪ NON MATÉRIALISÉ | year.not-materialized · level.not-materialized |
| defi | ⚪ NON MATÉRIALISÉ | year.not-materialized · level.not-materialized |
| ecolo | ⚪ NON MATÉRIALISÉ | year.not-materialized · level.not-materialized |
| groen | ⚪ NON MATÉRIALISÉ | year.not-materialized · level.not-materialized |
| les-engages | ⚪ NON MATÉRIALISÉ | year.not-materialized · level.not-materialized |
| mr | ⚪ NON MATÉRIALISÉ | year.not-materialized · level.not-materialized |
| nva | ⚪ NON MATÉRIALISÉ | year.not-materialized · level.not-materialized |
| open-vld | ⚪ NON MATÉRIALISÉ | year.not-materialized · level.not-materialized |
| ps | ⚪ NON MATÉRIALISÉ | year.not-materialized · level.not-materialized |
| ptb-pvda | ⚪ NON MATÉRIALISÉ | year.not-materialized · level.not-materialized |
| vlaams-belang | ⚪ NON MATÉRIALISÉ | year.not-materialized · level.not-materialized |
| vooruit | ⚪ NON MATÉRIALISÉ | year.not-materialized · level.not-materialized |

## Détail par parti

### cdv — ⚪ NON MATÉRIALISÉ

- **NOT_MATERIALIZED** `year.not-materialized` (auto-id-year) — Couche texte non matérialisée localement (binaire brut absent) : l'année n'a pas pu être évaluée — ce n'est pas un doute, c'est un contrôle non exécuté.
- **NOT_MATERIALIZED** `level.not-materialized` (auto-id-level) — Couche texte non matérialisée localement (binaire brut absent) : le niveau fédéral n'a pas pu être évalué — ce n'est pas un doute, c'est un contrôle non exécuté.
- **PASS** `parts.complete` (parts-inventory) — Les 1 partie(s) déclarée(s) sont présentes.
- **PASS** `toc.none` (toc-bounds) — Aucune table des matières exploitable détectée — contrôle de troncature non concluant (neutre).
- **PASS** `pages.within` (page-tolerance) — Nombre de pages (442) dans la tolérance de l'attendu (442 ± 67).

### defi — ⚪ NON MATÉRIALISÉ

- **NOT_MATERIALIZED** `year.not-materialized` (auto-id-year) — Couche texte non matérialisée localement (binaire brut absent) : l'année n'a pas pu être évaluée — ce n'est pas un doute, c'est un contrôle non exécuté.
- **NOT_MATERIALIZED** `level.not-materialized` (auto-id-level) — Couche texte non matérialisée localement (binaire brut absent) : le niveau fédéral n'a pas pu être évalué — ce n'est pas un doute, c'est un contrôle non exécuté.
- **PASS** `parts.complete` (parts-inventory) — Les 5 partie(s) déclarée(s) sont présentes.
- **PASS** `toc.none` (toc-bounds) — Aucune table des matières exploitable détectée — contrôle de troncature non concluant (neutre).
- **PASS** `pages.within` (page-tolerance) — Nombre de pages (292) dans la tolérance de l'attendu (292 ± 44).

### ecolo — ⚪ NON MATÉRIALISÉ

- **NOT_MATERIALIZED** `year.not-materialized` (auto-id-year) — Couche texte non matérialisée localement (binaire brut absent) : l'année n'a pas pu être évaluée — ce n'est pas un doute, c'est un contrôle non exécuté.
- **NOT_MATERIALIZED** `level.not-materialized` (auto-id-level) — Couche texte non matérialisée localement (binaire brut absent) : le niveau fédéral n'a pas pu être évalué — ce n'est pas un doute, c'est un contrôle non exécuté.
- **PASS** `parts.complete` (parts-inventory) — Les 1 partie(s) déclarée(s) sont présentes.
- **PASS** `toc.none` (toc-bounds) — Aucune table des matières exploitable détectée — contrôle de troncature non concluant (neutre).
- **PASS** `pages.within` (page-tolerance) — Nombre de pages (338) dans la tolérance de l'attendu (338 ± 51).

### groen — ⚪ NON MATÉRIALISÉ

- **NOT_MATERIALIZED** `year.not-materialized` (auto-id-year) — Couche texte non matérialisée localement (binaire brut absent) : l'année n'a pas pu être évaluée — ce n'est pas un doute, c'est un contrôle non exécuté.
- **NOT_MATERIALIZED** `level.not-materialized` (auto-id-level) — Couche texte non matérialisée localement (binaire brut absent) : le niveau fédéral n'a pas pu être évalué — ce n'est pas un doute, c'est un contrôle non exécuté.
- **PASS** `parts.complete` (parts-inventory) — Les 1 partie(s) déclarée(s) sont présentes.
- **PASS** `toc.none` (toc-bounds) — Aucune table des matières exploitable détectée — contrôle de troncature non concluant (neutre).
- **PASS** `pages.within` (page-tolerance) — Nombre de pages (45) dans la tolérance de l'attendu (45 ± 7).

### les-engages — ⚪ NON MATÉRIALISÉ

- **NOT_MATERIALIZED** `year.not-materialized` (auto-id-year) — Couche texte non matérialisée localement (binaire brut absent) : l'année n'a pas pu être évaluée — ce n'est pas un doute, c'est un contrôle non exécuté.
- **NOT_MATERIALIZED** `level.not-materialized` (auto-id-level) — Couche texte non matérialisée localement (binaire brut absent) : le niveau fédéral n'a pas pu être évalué — ce n'est pas un doute, c'est un contrôle non exécuté.
- **PASS** `parts.complete` (parts-inventory) — Les 1 partie(s) déclarée(s) sont présentes.
- **PASS** `toc.none` (toc-bounds) — Aucune table des matières exploitable détectée — contrôle de troncature non concluant (neutre).
- **PASS** `pages.within` (page-tolerance) — Nombre de pages (355) dans la tolérance de l'attendu (355 ± 54).

### mr — ⚪ NON MATÉRIALISÉ

- **NOT_MATERIALIZED** `year.not-materialized` (auto-id-year) — Couche texte non matérialisée localement (binaire brut absent) : l'année n'a pas pu être évaluée — ce n'est pas un doute, c'est un contrôle non exécuté.
- **NOT_MATERIALIZED** `level.not-materialized` (auto-id-level) — Couche texte non matérialisée localement (binaire brut absent) : le niveau fédéral n'a pas pu être évalué — ce n'est pas un doute, c'est un contrôle non exécuté.
- **PASS** `parts.complete` (parts-inventory) — Les 1 partie(s) déclarée(s) sont présentes.
- **PASS** `toc.none` (toc-bounds) — Aucune table des matières exploitable détectée — contrôle de troncature non concluant (neutre).
- **PASS** `pages.within` (page-tolerance) — Nombre de pages (311) dans la tolérance de l'attendu (311 ± 47).

### nva — ⚪ NON MATÉRIALISÉ

- **NOT_MATERIALIZED** `year.not-materialized` (auto-id-year) — Couche texte non matérialisée localement (binaire brut absent) : l'année n'a pas pu être évaluée — ce n'est pas un doute, c'est un contrôle non exécuté.
- **NOT_MATERIALIZED** `level.not-materialized` (auto-id-level) — Couche texte non matérialisée localement (binaire brut absent) : le niveau fédéral n'a pas pu être évalué — ce n'est pas un doute, c'est un contrôle non exécuté.
- **PASS** `parts.complete` (parts-inventory) — Les 1 partie(s) déclarée(s) sont présentes.
- **PASS** `toc.none` (toc-bounds) — Aucune table des matières exploitable détectée — contrôle de troncature non concluant (neutre).
- **PASS** `pages.within` (page-tolerance) — Nombre de pages (120) dans la tolérance de l'attendu (120 ± 18).

### open-vld — ⚪ NON MATÉRIALISÉ

- **NOT_MATERIALIZED** `year.not-materialized` (auto-id-year) — Couche texte non matérialisée localement (binaire brut absent) : l'année n'a pas pu être évaluée — ce n'est pas un doute, c'est un contrôle non exécuté.
- **NOT_MATERIALIZED** `level.not-materialized` (auto-id-level) — Couche texte non matérialisée localement (binaire brut absent) : le niveau fédéral n'a pas pu être évalué — ce n'est pas un doute, c'est un contrôle non exécuté.
- **PASS** `parts.complete` (parts-inventory) — Les 2 partie(s) déclarée(s) sont présentes.
- **PASS** `toc.none` (toc-bounds) — Aucune table des matières exploitable détectée — contrôle de troncature non concluant (neutre).
- **PASS** `pages.within` (page-tolerance) — Nombre de pages (186) dans la tolérance de l'attendu (186 ± 28).

### ps — ⚪ NON MATÉRIALISÉ

- **NOT_MATERIALIZED** `year.not-materialized` (auto-id-year) — Couche texte non matérialisée localement (binaire brut absent) : l'année n'a pas pu être évaluée — ce n'est pas un doute, c'est un contrôle non exécuté.
- **NOT_MATERIALIZED** `level.not-materialized` (auto-id-level) — Couche texte non matérialisée localement (binaire brut absent) : le niveau fédéral n'a pas pu être évalué — ce n'est pas un doute, c'est un contrôle non exécuté.
- **PASS** `parts.complete` (parts-inventory) — Les 1 partie(s) déclarée(s) sont présentes.
- **PASS** `toc.none` (toc-bounds) — Aucune table des matières exploitable détectée — contrôle de troncature non concluant (neutre).
- **PASS** `pages.within` (page-tolerance) — Nombre de pages (1220) dans la tolérance de l'attendu (1220 ± 183).

### ptb-pvda — ⚪ NON MATÉRIALISÉ

- **NOT_MATERIALIZED** `year.not-materialized` (auto-id-year) — Couche texte non matérialisée localement (binaire brut absent) : l'année n'a pas pu être évaluée — ce n'est pas un doute, c'est un contrôle non exécuté.
- **NOT_MATERIALIZED** `level.not-materialized` (auto-id-level) — Couche texte non matérialisée localement (binaire brut absent) : le niveau fédéral n'a pas pu être évalué — ce n'est pas un doute, c'est un contrôle non exécuté.
- **PASS** `parts.complete` (parts-inventory) — Les 2 partie(s) déclarée(s) sont présentes.
- **PASS** `toc.none` (toc-bounds) — Aucune table des matières exploitable détectée — contrôle de troncature non concluant (neutre).
- **PASS** `pages.not-applicable` (page-tolerance) — Pas de pagination attendue (chapitres web) — contrôle de taille non applicable (neutre).

### vlaams-belang — ⚪ NON MATÉRIALISÉ

- **NOT_MATERIALIZED** `year.not-materialized` (auto-id-year) — Couche texte non matérialisée localement (binaire brut absent) : l'année n'a pas pu être évaluée — ce n'est pas un doute, c'est un contrôle non exécuté.
- **NOT_MATERIALIZED** `level.not-materialized` (auto-id-level) — Couche texte non matérialisée localement (binaire brut absent) : le niveau fédéral n'a pas pu être évalué — ce n'est pas un doute, c'est un contrôle non exécuté.
- **PASS** `parts.complete` (parts-inventory) — Les 1 partie(s) déclarée(s) sont présentes.
- **PASS** `toc.none` (toc-bounds) — Aucune table des matières exploitable détectée — contrôle de troncature non concluant (neutre).
- **PASS** `pages.within` (page-tolerance) — Nombre de pages (100) dans la tolérance de l'attendu (100 ± 15).

### vooruit — ⚪ NON MATÉRIALISÉ

- **NOT_MATERIALIZED** `year.not-materialized` (auto-id-year) — Couche texte non matérialisée localement (binaire brut absent) : l'année n'a pas pu être évaluée — ce n'est pas un doute, c'est un contrôle non exécuté.
- **NOT_MATERIALIZED** `level.not-materialized` (auto-id-level) — Couche texte non matérialisée localement (binaire brut absent) : le niveau fédéral n'a pas pu être évalué — ce n'est pas un doute, c'est un contrôle non exécuté.
- **PASS** `parts.complete` (parts-inventory) — Les 1 partie(s) déclarée(s) sont présentes.
- **PASS** `toc.none` (toc-bounds) — Aucune table des matières exploitable détectée — contrôle de troncature non concluant (neutre).
- **PASS** `pages.within` (page-tolerance) — Nombre de pages (288) dans la tolérance de l'attendu (288 ± 44).
