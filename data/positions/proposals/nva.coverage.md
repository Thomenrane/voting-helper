# Couverture de l’extraction — N-VA

Run du 18/07/2026 — modèle `agent-played-llm-seam (pilote couverture #39)`.

Balayage **exhaustif** : chaque chunk de la couche texte est examiné, avec une
décision explicite par énoncé × chunk. Une « non documentée » n’est publiée que si
AUCUN chunk n’a produit de position à citation mécaniquement vérifiée. Le scan lexical
déterministe (sans clé) ne coupe rien — il ne fait que **signaler les silences douteux**.

## Bilan

- Chunks examinés : **104** — nva-programme-2024 (104 chunk(s))
- Énoncés : **8**
- Silences signalés (à vérifier) : **6**

## Silences à vérifier

**6 silence(s) à vérifier** — énoncés non publiés (sans position codée
OU citation rejetée) avec occurrences lexicales du sujet : le relecteur DOIT confirmer
qu’aucune position n’a été manquée.

- ⚠️ `s1` — Réduire les cotisations sociales sur les bas salaires.
  aucune position codée mais le sujet apparaît dans le programme — À VÉRIFIER
  Pages à occurrence : nva-programme-2024 p.16 (5 mots-clés), nva-programme-2024 p.36 (5 mots-clés), nva-programme-2024 p.8 (4 mots-clés), nva-programme-2024 p.7 (3 mots-clés), nva-programme-2024 p.9 (3 mots-clés), nva-programme-2024 p.10 (3 mots-clés), nva-programme-2024 p.23 (3 mots-clés), nva-programme-2024 p.11 (2 mots-clés), nva-programme-2024 p.15 (2 mots-clés), nva-programme-2024 p.18 (2 mots-clés), nva-programme-2024 p.24 (2 mots-clés), nva-programme-2024 p.45 (2 mots-clés), nva-programme-2024 p.50 (2 mots-clés), nva-programme-2024 p.62 (2 mots-clés), nva-programme-2024 p.86 (2 mots-clés) … +4 autre(s)
- ⚠️ `s2` — Instaurer un impôt sur les patrimoines de plus de 5 millions d’euros.
  aucune position codée mais le sujet apparaît dans le programme — À VÉRIFIER
  Pages à occurrence : nva-programme-2024 p.23 (3 mots-clés), nva-programme-2024 p.10 (2 mots-clés), nva-programme-2024 p.72 (2 mots-clés), nva-programme-2024 p.95 (2 mots-clés)
- ⚠️ `s3` — Supprimer la TVA sur les billets de train.
  aucune position codée mais le sujet apparaît dans le programme — À VÉRIFIER
  Pages à occurrence : nva-programme-2024 p.22 (2 mots-clés), nva-programme-2024 p.100 (2 mots-clés)
- ⚠️ `s4` — Supprimer progressivement l’avantage fiscal des voitures de société.
  aucune position codée mais le sujet apparaît dans le programme — À VÉRIFIER
  Pages à occurrence : nva-programme-2024 p.16 (4 mots-clés), nva-programme-2024 p.23 (4 mots-clés), nva-programme-2024 p.46 (4 mots-clés), nva-programme-2024 p.24 (3 mots-clés), nva-programme-2024 p.36 (3 mots-clés), nva-programme-2024 p.3 (2 mots-clés), nva-programme-2024 p.7 (2 mots-clés), nva-programme-2024 p.8 (2 mots-clés), nva-programme-2024 p.29 (2 mots-clés), nva-programme-2024 p.101 (2 mots-clés), nva-programme-2024 p.102 (2 mots-clés)
- ⚠️ `s6` — Interdire les chaudières au mazout dans les constructions neuves.
  aucune position codée mais le sujet apparaît dans le programme — À VÉRIFIER
  Pages à occurrence : nva-programme-2024 p.52 (2 mots-clés), nva-programme-2024 p.53 (2 mots-clés), nva-programme-2024 p.98 (2 mots-clés)
- ⚠️ `s8` — Autoriser la vente de médicaments sans ordonnance en grande surface.
  aucune position codée mais le sujet apparaît dans le programme — À VÉRIFIER
  Pages à occurrence : nva-programme-2024 p.30 (2 mots-clés), nva-programme-2024 p.52 (2 mots-clés), nva-programme-2024 p.93 (2 mots-clés), nva-programme-2024 p.118 (2 mots-clés)

## Détail par énoncé

| Énoncé | Texte | Issue | Chunks-candidats (✅ vérifié / ❌ rejeté) | Pages lexicales |
|---|---|---|---|---|
| `s1` ⚠️ | Réduire les cotisations sociales sur les bas salaires. | non documentée | — | 19 |
| `s2` ⚠️ | Instaurer un impôt sur les patrimoines de plus de 5 millions d’euros. | non documentée | — | 4 |
| `s3` ⚠️ | Supprimer la TVA sur les billets de train. | non documentée | — | 2 |
| `s4` ⚠️ | Supprimer progressivement l’avantage fiscal des voitures de société. | non documentée | — | 11 |
| `s5` | Prolonger deux réacteurs nucléaires de dix ans. | position documentée (citation vérifiée) | nva-programme-2024 p.23-23 ✅ | 12 |
| `s6` ⚠️ | Interdire les chaudières au mazout dans les constructions neuves. | non documentée | — | 3 |
| `s7` | Étendre le remboursement des consultations psychologiques. | position documentée (citation vérifiée) | nva-programme-2024 p.32-32 ✅ | 6 |
| `s8` ⚠️ | Autoriser la vente de médicaments sans ordonnance en grande surface. | non documentée | — | 4 |

_Résidu irréductible publié : une position formulée sans aucun mot-clé attendu et
non surfacée par le scan lexical peut échapper — voir
`docs/methodologie/couverture-extraction.md`._
