# Mesure de la recherche — corpus annoté

Corpus bâti le 2026-09-09 sur 90 communes, 348 requêtes. Mesuré le 2026-09-09.

Chaque réponse attendue vient d’une source publique : **rien n’est écrit
de mémoire**. Une réponse compte comme juste quand elle tombe à moins de
du lieu attendu **dans le rayon que l’entrée déclare** : 200 m pour un
objet ponctuel, la taille de la commune pour une commune. La coordonnée,
jamais le libellé, qui change d’une source à l’autre.

**Ce qui n’est pas mesuré ici**, et qu’il faut savoir en lisant les
chiffres : l’application ARBITRE entre les deux pipelines dans son
composant de recherche, et cet arbitrage dépend de la vue de la carte.
Le reproduire dans le banc en ferait une copie qui dérive. Chaque
pipeline est donc mesuré sur les familles qui lui reviennent.

## Ensemble

| | Requêtes | Top-1 | Top-5 | MRR | Absentes |
|---|---:|---:|---:|---:|---:|
| **Tout** | 348 | 95,1 % | 98,6 % | 0,967 | 4 |

> Une moyenne d’ensemble mêle des familles de difficulté très inégale :
> elle sert de repère dans le temps, pas de verdict. Ce sont les lignes
> par famille qui se lisent.

### Pipeline « adresse » (Base Adresse Nationale)

| Famille | Requêtes | Top-1 | Top-5 | MRR | Absentes |
|---|---:|---:|---:|---:|---:|
| adresse-complete | 31 | 100,0 % | 100,0 % | 1,000 | 0 |
| adresse-sans-accents | 3 | 100,0 % | 100,0 % | 1,000 | 0 |
| adresse-sans-code | 31 | 100,0 % | 100,0 % | 1,000 | 0 |
| commune-seule | 90 | 93,3 % | 97,8 % | 0,956 | 2 |

### Pipeline « nom » (recherche multi-sources)

| Famille | Requêtes | Top-1 | Top-5 | MRR | Absentes |
|---|---:|---:|---:|---:|---:|
| ecole-commune | 55 | 87,3 % | 94,5 % | 0,909 | 2 |
| lieu-commune | 68 | 97,1 % | 100,0 % | 0,983 | 0 |
| lieu-sans-accents | 43 | 97,7 % | 100,0 % | 0,984 | 0 |
| lieu-seul | 27 | 96,3 % | 100,0 % | 0,972 | 0 |

## Les 5 requêtes hors des cinq premières

| Famille | Requête | Attendu | Rendu en tête | Rang |
|---|---|---|---|---:|
| commune-seule | Félines | Félines | Félines | absente |
| commune-seule | Beaulieu | Beaulieu | Beaulieu 18000 Bourges | absente |
| ecole-commune | Lycée professionnel Sainte-Chrétienne La Salle Saint-Avold | Lycée professionnel Sainte-Chrétienne La Salle | Lycée Professionnel Saint-Félix-la Salle | absente |
| ecole-commune | Ecole primaire des 4 Vents Boisseaux | Ecole primaire des 4 Vents | les Quatre Vents | absente |
| ecole-commune | Ecole primaire intercommunale Munwiller | Ecole primaire intercommunale | École Primaire Intercommunale | 6 |

