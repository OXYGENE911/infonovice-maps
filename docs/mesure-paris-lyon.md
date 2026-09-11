# Mesure — Paris 15e → Lyon Part-Dieu, VinFast VF8 Plus, 80 %

Tâche T3 (recDF5ZaSt7nXSM0I), mission Ingénierie du 11/09/2026. Objectif :
savoir, chiffres à l'appui, si ce calcul d'itinéraire — plan de recharge
automatique inclus (PR #84) — tient sous 5 secondes, et où part le temps
sinon. **Cette tâche mesure ; elle ne corrige rien** (l'optimisation elle-même
est une autre tâche, une autre branche : `feat/recgTL2LqMYAZf0mB-optim-paris-lyon`).

## Le banc corrigé (21h, mission du 11/09) — ce que la revue Codex a trouvé

La revue Codex de la PR #305 (`handoffs/2026-09-11-0110-codex-mesure-pr305.md`,
VERDICT BLOQUANT) a relevé quatre biais dans une première version du banc.
Tous corrigés dans `tests-e2e/mesure-paris-lyon.spec.ts` — le détail technique
est dans l'en-tête du fichier, résumé ici :

1. **Le chronomètre incluait le délai de scrutation de Playwright.**
   `expect.poll`/`waitForFunction` réinterrogent le DOM à intervalles — jusqu'à
   1 s de retard pouvait s'ajouter au temps réellement mesuré, des deux côtés
   du chronomètre (avant le `.click()`, qui attend l'actionnabilité ; après,
   en attendant la détection du résultat). **Corrigé** : le départ et la fin
   sont maintenant datés par le NAVIGATEUR lui-même, en `performance.now()` —
   le départ sur l'événement DOM `itineraire-lance` (déjà émis par
   `#calculer()`, sa toute première ligne), la fin sur un `MutationObserver`
   posé une fois pour toutes qui note l'instant exact où
   `.iti-recharge-corps` reçoit son enfant final.
2. **L'attente du texte transitoire pouvait expirer à cache chaud.** L'ancien
   banc guettait la phrase précise « … calcul des arrêts de recharge… » avant
   sa disparition ; à cache chaud, cette phrase peut ne jamais s'afficher si
   le calcul synchrone qui suit va assez vite pour sauter directement au
   résultat final entre deux scrutations — l'assertion expirait alors sur un
   calcul pourtant réussi. **Corrigé** : la fin du calcul se reconnaît
   maintenant à la PRÉSENCE DES ARRÊTS (`.recharge-resume` ou
   `.recharge-refus` dans `.iti-recharge-corps`), jamais à un texte
   transitoire.
3. **Une panne IRVE (503) passait pour une mesure réussie.** Quand l'index
   national des bornes échoue, `#planifierRecharge` retombe sur
   « hors recharge » (`panneau-itineraire.ts:1838`) — sans ellipse, un texte
   qui ressemble à un résultat définitif. L'ancien banc l'acceptait tel quel.
   **Corrigé** : le test surveille désormais le code de statut HTTP de chaque
   requête IRVE et météo (`page.on('requestfinished')`, `response.status()`)
   et échoue EXPLICITEMENT, avec le détail de la requête en cause, si l'une
   d'elles est revenue en erreur pendant la fenêtre mesurée — y compris quand
   la météo échoue en silence (elle ne bloque pas le plan, `#chargerConditions`
   absorbe son erreur et repart à 20 °C ; le test le signale quand même, la
   mesure n'aurait plus décrit les mêmes conditions).
4. **Les requêtes réseau réellement échouées disparaissaient du découpage.**
   `requestfinished` ne se déclenche jamais sur un échec réseau (DNS, timeout,
   abandon) — sans écoute dédiée, cette attente retombait dans le calcul
   local, gonflant le poste qu'on cherche justement à isoler. **Corrigé** :
   `page.on('requestfailed')` est maintenant écouté et ses durées apparaissent
   dans le découpage (colonne « Échecs » des tableaux ci-dessous, vide dans un
   passage sain).

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
`void this.#calculer()` en direct — l'événement `itineraire-lance`, sa
première ligne, en date le départ. La mesure s'arrête à la présence réelle du
plan de recharge (arrêts posés, ou refus motivé), pas seulement le tracé : le
détail complet est dans l'en-tête du spec.

**Dix exécutions, une même session de navigateur** (pas dix rechargements de
page) : c'est ce qui rend visible le cache de l'index IRVE — voir plus bas.

## Résultats — RÉFÉRENCE AVANT OPTIMISATION (trois passages, banc corrigé, tous verts, réseau réel, 11/09/2026 21h)

| Passage | min | médiane | p95 |
|---|---|---|---|
| 1 | 4 399 ms | 4 600 ms | **9 454 ms** |
| 2 | 4 520 ms | 4 679 ms | **7 193 ms** |
| 3 | 4 466 ms | 4 764 ms | **6 704 ms** |

p95 sur 10 valeurs, rang au plus proche (`ceil(0,95 × 10) = 10`, soit le
maximum des dix mesures).

**p95 ≥ 5 s dans les trois passages, aucun échec réseau IRVE/météo détecté —
la barre n'est pas tenue. C'est cette table qui sert de « avant » à la tâche
d'optimisation (feat/recgTL2LqMYAZf0mB).**

### Détail du passage 3 (celui pris comme référence ci-dessous)

Trajet retenu : 464 km, ~4 h 45 de route, un arrêt de recharge.

| # | Total | Itinéraire IGN | Attente fixe | Bloc parallèle (altim. + météo + IRVE) | Calcul local | Échecs | IRVE |
|---|---|---|---|---|---|---|---|
| 1 | 6 704 ms | 142 ms | 1 547 ms | 1 457 ms | 3 558 ms | — | téléchargé (339 ms) |
| 2 | 5 600 ms | 10 ms | 1 212 ms | 56 ms | 4 322 ms | — | cache |
| 3 | 5 323 ms | 8 ms | 1 212 ms | 52 ms | 4 051 ms | — | cache |
| 4 | 4 882 ms | 10 ms | 1 209 ms | 74 ms | 3 589 ms | — | cache |
| 5 | 5 506 ms | 11 ms | 1 212 ms | 48 ms | 4 235 ms | — | cache |
| 6 | 4 646 ms | 11 ms | 1 214 ms | 59 ms | 3 362 ms | — | cache |
| 7 | 4 642 ms | 11 ms | 1 213 ms | 50 ms | 3 368 ms | — | cache |
| 8 | 4 466 ms | 11 ms | 1 221 ms | 51 ms | 3 183 ms | — | cache |
| 9 | 4 565 ms | 10 ms | 1 213 ms | 53 ms | 3 289 ms | — | cache |
| 10 | 4 560 ms | 8 ms | 1 214 ms | 44 ms | 3 294 ms | — | cache |

Découpage des colonnes :
- **Itinéraire IGN** — `calculerItineraire`, `data.geopf.fr/navigation/itineraire`.
- **Attente fixe** — l'écart mesuré entre la fin de l'appel itinéraire et le
  début du bloc suivant : le débounce volontaire de 1 200 ms
  (`#minuteurPlanAuto`, panneau-itineraire.ts, « le plan part tout seul, une
  seconde après le calme ») plus la lecture (locale, IndexedDB) du véhicule.
- **Bloc parallèle** — altimétrie (`data.geopf.fr/altimetrie`), météo départ +
  arrivée (`api.open-meteo.com`, deux appels) et IRVE
  (`public.opendatasoft.com`) quand il télécharge, les quatre lancés en
  `Promise.all` (déjà le cas avant cette mission — voir plus bas, cible 3 de
  l'optimisation).
- **Calcul local** — le reste : filtrage spatial de l'index national contre
  le corridor de la route (`stationsDuTrajet`), planification des arrêts
  (`planifierArrets`), pose des marqueurs sur la carte MapLibre réelle
  (`#poserBornesTrajet`) et rendu.
- **Échecs** — requêtes IRVE/météo en échec (réseau ou HTTP ≥ 400) pendant la
  fenêtre mesurée de cette exécution ; une seule aurait fait échouer le test
  (voir plus haut, correction n° 3 et 4). Vide sur les trois passages.

## Les trois points chauds (p95 ≥ 5 s), sur les trois passages du banc corrigé

1. **Le calcul local après le réseau — le plus gros poste, et de loin.**
   Mesuré (les 27 exécutions à cache IRVE chaud, itérations 2 à 10 des trois
   passages) : **3 138 à 4 322 ms**, soit typiquement 70 à 80 % du total.
   Piste pour la cible 4 de l'optimisation : `stationsDuTrajet` (le filtrage
   spatial des 14 133 stations de l'index rapide contre le corridor de
   464 km) — le pré-filtre par boîte englobante existe déjà dans le code
   (`tronconner`/`dansUneBoite`), mais chaque candidat retenu est ensuite
   projeté sur TOUS les segments du tracé (`situerSurLeTrace`), un coût qui
   grandit avec la longueur du trajet, pas avec le nombre de candidats déjà
   réduit.
2. **Le débounce fixe de planification — une taxe garantie d'environ 1,2 s
   sur CHAQUE calcul.** Mesuré : 1 207 à 1 578 ms, sur les 30 exécutions des
   trois passages, sans exception. Code : `panneau-itineraire.ts`,
   `this.#minuteurPlanAuto = setTimeout(() => { void this.#planifierRecharge(true); }, 1200);`
   — un choix délibéré (éviter de relancer un relevé à chaque case cochée en
   rafale), pas un bug, mais un coût fixe et non négociable sur le chemin
   mesuré. Cible 1 de l'optimisation.
3. **Le téléchargement de l'index IRVE, au premier calcul de la session.**
   Mesuré : 339 à 3 727 ms selon le passage (variance large, probablement
   liée à la latence DNS/TLS du tout premier appel du navigateur plutôt qu'au
   poids du fichier lui-même, ~700 Ko gzippés en temps normal d'après
   `lib/index-bornes.ts`). C'est ce surcoût, absent des neuf exécutions
   suivantes (cache IndexedDB, 30 jours), qui fait le plus souvent franchir
   les 5 s au p95 : sur les trois passages, la 1ʳᵉ exécution est la plus
   lente des dix à chaque fois. Cible 2 de l'optimisation (précharger pendant
   la saisie de la destination, pas au calcul).

## Ce que ce banc NE dit PAS

- Il ne décompose pas le « calcul local » en sous-étapes chronométrées : une
  session de profilage CPU serait le bon outil pour aller plus loin que
  `stationsDuTrajet`/`#poserBornesTrajet`.
- L'itinéraire et l'altimétrie retombent à quelques millisecondes dès la
  deuxième exécution identique (8-13 ms en médiane contre 118-142 ms au
  premier appel) — vraisemblablement le cache HTTP du navigateur sur une
  requête GET strictement identique. Dix calculs du MÊME trajet ne mesurent
  donc pas dix fois le pire cas réseau : un usager qui calcule dix trajets
  DIFFÉRENTS ne bénéficierait pas de ce rabais.
- La machine de mesure est un poste de développement, pas un mobile en 4G :
  les temps réseau mesurés ici sont ceux d'une bonne connexion filaire.
