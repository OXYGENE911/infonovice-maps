# Mesure — Paris 15e → Lyon Part-Dieu, VinFast VF8 Plus, 80 %

Tâche T3 (recDF5ZaSt7nXSM0I), mission Ingénierie du 11/09/2026. Objectif :
savoir, chiffres à l'appui, si ce calcul d'itinéraire — plan de recharge
automatique inclus (PR #84) — tient sous 5 secondes, et où part le temps
sinon. **Cette tâche mesure ; elle ne corrige rien.**

## Le banc

`tests-e2e/mesure-paris-lyon.spec.ts` — pas dans la CI par défaut (`test.skip`
conditionné à `MESURE=1`). S'exécute contre les **vraies API** (aucune tuile
ni requête simulée) :

```
npm run build && npm run preview   # dans un terminal
MESURE=1 npx playwright test tests-e2e/mesure-paris-lyon.spec.ts
```

**Trajet.** Départ « Paris 15e » (Base Adresse Nationale : *Paris 15e
Arrondissement*, 2.295289, 48.84162, meilleur résultat, score 0,87 — vérifié
par appel réel le 11/09/2026), arrivée « Place Charles Béraudier » (le parvis
de la gare de Lyon Part-Dieu, 4.858748, 45.760597, score 0,97). Véhicule :
VinFast VF8 Plus (catalogue, 87,7 kWh), 80 % de batterie au départ.

**Chronomètre.** Il n'existe pas de bouton « Calculer » séparé
(`panneau-itineraire.ts`) : sélectionner l'adresse d'arrivée déclenche
`void this.#calculer()` en direct. C'est ce clic qui démarre la mesure. Elle
s'arrête à l'affichage du résumé final (`.iti-resultat`) — après le plan de
recharge, pas seulement le tracé : voir « Le piège » plus bas.

**Dix exécutions, une même session de navigateur** (pas dix rechargements de
page) : c'est ce qui rend visible le cache de l'index IRVE — voir plus bas.

## Résultats (trois passages, tous verts, réseau réel)

| Passage | min | médiane | p95 |
|---|---|---|---|
| 1 | 3 380 ms | 3 995 ms | **7 351 ms** |
| 2 | 3 910 ms | 4 467 ms | **6 405 ms** |
| 3 | 3 641 ms | 4 509 ms | **6 265 ms** |

p95 sur 10 valeurs, rang au plus proche (`ceil(0,95 × 10) = 10`, soit le
maximum des dix mesures).

**p95 ≥ 5 s dans les trois passages — la barre n'est pas tenue.**

### Détail du passage 3 (celui pris comme référence ci-dessous)

Trajet retenu : 464 km, 4 h 47 de route, **un arrêt de recharge de 36 min**,
arrivée à 10 % de batterie.

| # | Total | Itinéraire IGN | Attente fixe | Bloc parallèle (altim. + météo + IRVE) | Calcul local | IRVE |
|---|---|---|---|---|---|---|
| 1 | 6 265 ms | 131 ms | 1 445 ms | 1 248 ms | 3 441 ms | téléchargé (288 ms) |
| 2 | 5 122 ms | 8 ms | 1 213 ms | 47 ms | 3 854 ms | cache |
| 3 | 4 774 ms | 11 ms | 1 213 ms | 35 ms | 3 515 ms | cache |
| 4 | 4 536 ms | 11 ms | 1 211 ms | 42 ms | 3 272 ms | cache |
| 5 | 4 517 ms | 13 ms | 1 225 ms | 47 ms | 3 232 ms | cache |
| 6 | 3 641 ms | 10 ms | 1 221 ms | 46 ms | 2 364 ms | cache |
| 7 | 4 459 ms | 11 ms | 1 220 ms | 42 ms | 3 186 ms | cache |
| 8 | 4 501 ms | 8 ms | 1 221 ms | 55 ms | 3 217 ms | cache |
| 9 | 4 003 ms | 12 ms | 1 225 ms | 43 ms | 2 723 ms | cache |
| 10 | 3 792 ms | 12 ms | 1 231 ms | 46 ms | 2 503 ms | cache |

Découpage des colonnes :
- **Itinéraire IGN** — `calculerItineraire`, `data.geopf.fr/navigation/itineraire`.
- **Attente fixe** — l'écart mesuré entre la fin de l'appel itinéraire et le
  début du bloc suivant : le débounce volontaire de 1 200 ms
  (`#minuteurPlanAuto`, panneau-itineraire.ts, « le plan part tout seul, une
  seconde après le calme ») plus la lecture (locale, IndexedDB) du véhicule.
- **Bloc parallèle** — altimétrie (`data.geopf.fr/altimetrie`), météo départ +
  arrivée (`api.open-meteo.com`, deux appels) et IRVE
  (`public.opendatasoft.com`) quand il télécharge, les quatre lancés en
  `Promise.all`.
- **Calcul local** — le reste : filtrage spatial de l'index national contre
  le corridor de la route (`stationsDuTrajet`), planification des arrêts
  (`planifierArrets`), pose des marqueurs sur la carte MapLibre réelle
  (`#poserBornesTrajet`) et rendu.

## Le piège du chronomètre (et pourquoi il compte)

Le résumé (`#majResume`) passe par **trois textes**, et deux d'entre eux se
ressemblent dangereusement :
1. « Calcul de l'itinéraire… » — dès le clic.
2. dès que la route est connue, **immédiatement** : « … de route, hors
   recharge » — **sans points de suspension**, alors que le plan n'a pas
   encore démarré (`this.#planEnCours` porte encore sa valeur d'avant).
3. 1 200 ms plus tard, le vrai plan démarre : « … calcul des arrêts de
   recharge… ».

Une première version du banc guettait la simple absence de points de
suspension et concluait le calcul ~1 200 ms à ~4 s trop tôt (127 à 494 ms
mesurés, plan JAMAIS lancé) — un résultat qui semblait excellent et qui était
faux. Le banc final attend la phrase précise de l'étape 3 avant de guetter sa
disparition. Détail dans les commentaires du spec.

## Les trois points chauds (p95 ≥ 5 s)

1. **Le calcul local après le réseau — le plus gros poste, devant le réseau
   lui-même.** Mesuré : 2 364 à 3 854 ms selon les exécutions (passage 3),
   2 108 à 3 750 ms (passages 1-2). Sur les neuf exécutions à cache IRVE
   chaud, il représente à lui seul plus de 60 % du total. Pas décomposé plus
   finement dans ce banc (pas de sous-mesure par sous-étape) : la piste, pour
   S3, est `stationsDuTrajet` (le filtrage spatial des 14 133 stations de
   l'index rapide contre le corridor de 464 km — la seule étape dont le coût
   dépend de la taille de l'index nationale, pas de ce trajet précis) et
   `#poserBornesTrajet` (la pose réelle des marqueurs numérotés sur la
   carte MapLibre).
2. **Le débounce fixe de planification — une taxe garantie de 1,2 s sur
   CHAQUE calcul.** Mesuré : 1 211 à 1 549 ms, sur les 30 exécutions des
   trois passages, sans exception. Code : `panneau-itineraire.ts`,
   `this.#minuteurPlanAuto = setTimeout(() => { void this.#planifierRecharge(true); }, 1200);`
   — un choix délibéré (éviter de relancer un relevé à chaque case cochée en
   rafale), pas un bug, mais un coût fixe et non négociable sur le chemin
   mesuré.
3. **Le téléchargement de l'index IRVE, au premier calcul de la session.**
   Mesuré : 1 964 à 2 040 ms (passages 1-2), 288 ms (passage 3 — variance
   large, probablement liée à la latence DNS/TLS du tout premier appel du
   navigateur plutôt qu'au poids du fichier lui-même, ~700 Ko gzippés en
   temps normal d'après `lib/index-bornes.ts`). C'est spécifiquement CE
   surcoût, absent des neuf exécutions suivantes (cache IndexedDB, 30 jours),
   qui a fait franchir les 5 s au p95 dans les passages 1 et 2 : sans lui, le
   maximum des dix mesures serait resté sous 5 s dans ces deux passages
   (le passage 3 dépasse 5 s dès la 2ᵉ exécution, cache déjà chaud — preuve
   que le calcul local suffit, à lui seul, à franchir la barre sur un poste
   assez lent).

## Ce que ce banc NE dit PAS

- Il ne décompose pas le « calcul local » en sous-étapes chronométrées : une
  session de profilage CPU (même méthode que PERF-2) serait le bon outil
  pour S3.
- L'itinéraire et l'altimétrie retombent à quelques millisecondes dès la
  deuxième exécution identique (12 ms en médiane contre 131-207 ms au premier
  appel) — vraisemblablement le cache HTTP du navigateur sur une requête
  GET strictement identique. Dix calculs du MÊME trajet ne mesurent donc pas
  dix fois le pire cas réseau : un usager qui calcule dix trajets DIFFÉRENTS
  ne bénéficierait pas de ce rabais.
- La machine de mesure est un poste de développement, pas un mobile en 4G :
  les temps réseau mesurés ici sont ceux d'une bonne connexion filaire.
