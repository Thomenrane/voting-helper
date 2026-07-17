# Positions extraites — N-VA (pilote #25)

Run du 17/07/2026 — extraction par **agent (abonnement Claude)**, pas via
`ANTHROPIC_API_KEY` (absente de l'environnement). L'agent a lu lui-même la
couche texte dérivée du programme officiel N-VA 2024 (« Voor Vlaamse welvaart »,
120 pages, 3 pages sans texte extractible), a déterminé la position sur chaque
énoncé et a recopié **verbatim** une citation, puis a passé chaque citation par
le vérificateur mécanique du pipeline (`verifyCitation`, recherche textuelle
normalisée). Tout le reste de la chaîne réutilise les modules testés du repo
(`mergeCandidates`, `toPartyPositions`, `renderPositionsYaml`, `parsePositionsYaml`).

**Toutes les positions sont proposées en statut `en_attente` : la review humaine de cette PR est la validation.**

Énoncés évalués : les **8 énoncés fixtures de démonstration** (les 35 énoncés
éditoriaux n'existent pas encore — ce pilote valide la MÉCANIQUE, pas le corpus final).

## Bilan

- Positions proposées (citation vérifiée) : **3**
- Positions rejetées (citation non retrouvée — jamais publiées) : **0**
- Conflits à arbitrer (aucun enregistrement produit) : **0**
- Sans position documentée : **5**
- Taux de vérification : **3/3 citations proposées vérifiées mécaniquement** (0 recorrigée)
- Provenance : snapshot brut `nva-programme-2024@20260716T132530Z`
  (sha256 `6e8a38c6…bb69`, 120 p.), couche texte dérivée
  `nva-programme-2024-text@20260716T215335009Z` (sha256 `172d4ad8…00a4`) —
  binaires re-matérialisés depuis les empreintes committées, `snapshot:verify` OK.

## Détail par énoncé

| Énoncé | Texte (FR) | Position | Citation (langue source, verbatim) | Page | Vérif. |
|---|---|---|---|---|---|
| `s1` | Réduire les cotisations sociales sur les bas salaires | **+1** | « Concreet pleiten we voor een verdere verlaging van de loonkosten. » | p. 16 | ✅ |
| `s2` | Instaurer un impôt sur les patrimoines de plus de 5 M€ | — | pas de position documentée | | ℹ️ |
| `s3` | Supprimer la TVA sur les billets de train | — | pas de position documentée | | ℹ️ |
| `s4` | Supprimer progressivement l'avantage fiscal des voitures de société | — | pas de position documentée | | ℹ️ |
| `s5` | Prolonger deux réacteurs nucléaires de dix ans | **+2** | « De wet op de kernuitstap schaffen we af. We kiezen voor het maximaal behoud van de bestaande kerncentrales en we bereiden de bouw van nieuwe kerncentrales voor, eventueel in samenwerking met buurlanden. » | p. 23 | ✅ |
| `s6` | Interdire les chaudières au mazout dans les constructions neuves | — | pas de position documentée | | ℹ️ |
| `s7` | Étendre le remboursement des consultations psychologiques | **+1** | « Daarom pleiten we ervoor om raadplegingen bij een mentale zorgverlener voor jongeren voor het grootste deel terug te betalen. » | p. 32 | ✅ |
| `s8` | Autoriser la vente de médicaments sans ordonnance en grande surface | — | pas de position documentée | | ℹ️ |

## Notes de review (points d'attention pour le validateur humain)

- **s1 (+1)** : le programme plaide pour une baisse générale des coûts salariaux
  (`loonkosten`), pas explicitement ciblée « bas salaires ». La N-VA finance
  cette baisse par la suppression de subventions salariales existantes
  (« afschaffen van tal van bestaande fiscale en sociale loonsubsidies »), ce qui
  peut jouer en sens inverse sur les réductions ciblées bas salaires — nuance à
  arbitrer. Codé +1 (plutôt favorable) sur la direction générale.
- **s5 (+2)** : position nette et sans ambiguïté (abrogation de la loi de sortie
  du nucléaire, maintien maximal des centrales, construction de nouvelles).
- **s7 (+1)** : soutien au remboursement des consultations en santé mentale, mais
  formulé pour **les jeunes** et « pour la plus grande partie » (`voor het grootste
  deel`) — d'où +1 plutôt que +2.
- **s2, s3, s4, s6, s8 — « non documentée »** : recherches menées dans la couche
  texte (`vermogensbelasting` / impôt fortune, `trein`+`btw` / TVA train,
  `bedrijfswagen`+`salariswagen` / voitures de société, `stookolie`+`mazout`+
  `verwarming` / chaudières mazout, `geneesmiddelen`+`supermarkt` / OTC en grande
  surface) : aucune phrase du programme ne prend position verbatim sur la mesure
  précise de l'énoncé. Le silence est traité comme une information, jamais comme
  un « neutre » — ces énoncés seront exclus du score promesses de la N-VA.

_Citations dans la langue source du programme (néerlandais) ; « page » = page
physique du PDF snapshoté où la citation commence ; vérification par recherche
textuelle normalisée dans la couche texte dérivée (voir
docs/spikes/extraction-couche-texte.md)._
