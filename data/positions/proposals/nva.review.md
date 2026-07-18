# Positions extraites — N-VA

Run du 18/07/2026 — modèle `agent-played-llm-seam (pilote couverture #39)`, 104 chunk(s) de programme analysé(s).

**Toutes les positions sont proposées en statut `en_attente` : la review humaine de cette PR est la validation.**

## Bilan

- Positions proposées (citation vérifiée) : **2**
- Positions rejetées (citation non retrouvée — jamais publiées) : **0**
- Conflits à arbitrer (aucun enregistrement produit) : **0**
- Sans position documentée : **6**
- Taux de vérification : 2/2 citations proposées vérifiées mécaniquement
- Coût du run (agent-played-llm-seam (pilote couverture #39)) : 139707 input + 11415 output tokens — tarif inconnu pour ce modèle.

## Couverture du balayage

Balayage exhaustif : **104** chunk(s) bornés examinés. Détail complet dans le rapport de couverture committé (`<parti>.coverage.md`).

⚠️ **6 silence(s) à vérifier** — énoncés non publiés (sans position codée OU
citation rejetée) dont le scan lexical retrouve le sujet dans le programme. La review DOIT
confirmer qu’aucune position n’a été manquée :

- ⚠️ `s1` — Réduire les cotisations sociales sur les bas salaires.
  aucune position codée mais le sujet apparaît dans le programme — À VÉRIFIER
  Pages à occurrence lexicale : nva-programme-2024 p.16, nva-programme-2024 p.36, nva-programme-2024 p.8, nva-programme-2024 p.7, nva-programme-2024 p.9, nva-programme-2024 p.10, nva-programme-2024 p.23, nva-programme-2024 p.11 … +11
- ⚠️ `s2` — Instaurer un impôt sur les patrimoines de plus de 5 millions d’euros.
  aucune position codée mais le sujet apparaît dans le programme — À VÉRIFIER
  Pages à occurrence lexicale : nva-programme-2024 p.23, nva-programme-2024 p.10, nva-programme-2024 p.72, nva-programme-2024 p.95
- ⚠️ `s3` — Supprimer la TVA sur les billets de train.
  aucune position codée mais le sujet apparaît dans le programme — À VÉRIFIER
  Pages à occurrence lexicale : nva-programme-2024 p.22, nva-programme-2024 p.100
- ⚠️ `s4` — Supprimer progressivement l’avantage fiscal des voitures de société.
  aucune position codée mais le sujet apparaît dans le programme — À VÉRIFIER
  Pages à occurrence lexicale : nva-programme-2024 p.16, nva-programme-2024 p.23, nva-programme-2024 p.46, nva-programme-2024 p.24, nva-programme-2024 p.36, nva-programme-2024 p.3, nva-programme-2024 p.7, nva-programme-2024 p.8 … +3
- ⚠️ `s6` — Interdire les chaudières au mazout dans les constructions neuves.
  aucune position codée mais le sujet apparaît dans le programme — À VÉRIFIER
  Pages à occurrence lexicale : nva-programme-2024 p.52, nva-programme-2024 p.53, nva-programme-2024 p.98
- ⚠️ `s8` — Autoriser la vente de médicaments sans ordonnance en grande surface.
  aucune position codée mais le sujet apparaît dans le programme — À VÉRIFIER
  Pages à occurrence lexicale : nva-programme-2024 p.30, nva-programme-2024 p.52, nva-programme-2024 p.93, nva-programme-2024 p.118

## Détail par énoncé

| Énoncé | Texte | Position | Citation | Source / page | Vérification |
|---|---|---|---|---|---|
| `s1` | Réduire les cotisations sociales sur les bas salaires. | — | pas de position documentée | | ℹ️ le silence est une information |
| `s2` | Instaurer un impôt sur les patrimoines de plus de 5 millions d’euros. | — | pas de position documentée | | ℹ️ le silence est une information |
| `s3` | Supprimer la TVA sur les billets de train. | — | pas de position documentée | | ℹ️ le silence est une information |
| `s4` | Supprimer progressivement l’avantage fiscal des voitures de société. | — | pas de position documentée | | ℹ️ le silence est une information |
| `s5` | Prolonger deux réacteurs nucléaires de dix ans. | **+2** | « We kiezen voor het maximaal behoud van de bestaande kerncentrales en we bereiden de bouw van nieuwe kerncentrales voor, eventueel in samenwerking met buurlande… » | nva-programme-2024 p. 23 | ✅ vérifiée |
| `s6` | Interdire les chaudières au mazout dans les constructions neuves. | — | pas de position documentée | | ℹ️ le silence est une information |
| `s7` | Étendre le remboursement des consultations psychologiques. | **+1** | « Daarom pleiten we ervoor om raadplegingen bij een mentale zorgverlener voor jongeren voor het grootste deel terug te betalen. » | nva-programme-2024 p. 32 | ✅ vérifiée |
| `s8` | Autoriser la vente de médicaments sans ordonnance en grande surface. | — | pas de position documentée | | ℹ️ le silence est une information |

_Citations dans la langue source du programme ; « page » = page du PDF snapshoté
où la citation commence ; vérification par recherche textuelle normalisée dans la
couche texte dérivée (voir docs/spikes/extraction-couche-texte.md)._
