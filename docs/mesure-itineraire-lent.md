# Mesure — seuils de lenteur du calcul d'itinéraire (ITI-LENT-1, 12/09/2026)

Contexte : la contre-mesure du 12/09 (tâche C4, `recu7iXoI2DPdP5Pr`) a établi que
le délai de garde posé sur l'altimétrie ne couvre qu'un des trois appels tiers du
calcul de trajet. Sonde en session froide : l'itinéraire IGN ralenti à 3 s donne
un total de 5 198 ms — critère des 5 s dépassé — alors que l'altimétrie répondait
normalement. Cette page justifie les deux seuils posés en réponse, par la mesure
et non par recopie des valeurs proposées dans le mandat.

## 1. Latence réelle du service, mesurée le 12/09/2026

Huit appels directs et consécutifs au service d'itinéraire réellement utilisé par
l'application (`data.geopf.fr/navigation/itineraire`, moteur `bdtopo-osrm`,
paramètres identiques à `urlItineraire` dans `src/lib/itineraire.ts`), trajet
Paris (2.3522, 48.8566) → Lyon (4.8357, 45.7640) :

```
$ for i in 1 2 3 4 5 6 7 8; do
    curl -s -o /dev/null -w "essai=$i http_code=%{http_code} time_total=%{time_total}s\n" \
      --max-time 20 "https://data.geopf.fr/navigation/itineraire?resource=bdtopo-osrm&profile=car&optimization=fastest&start=2.3522,48.8566&end=4.8357,45.7640&geometryFormat=geojson&distanceUnit=meter&timeUnit=second"
  done
```

Résultat, horodaté (UTC) :

| Essai | HTTP | Temps total | Horodatage début |
|---|---|---|---|
| 1 | 200 | 0,277 s | 2026-09-12T19:04:00.349Z |
| 2 | 200 | 0,380 s | 2026-09-12T19:04:00.754Z |
| 3 | 200 | 0,311 s | 2026-09-12T19:04:01.290Z |
| 4 | 200 | 0,252 s | 2026-09-12T19:04:01.830Z |
| 5 | 200 | 0,246 s | 2026-09-12T19:04:02.217Z |
| 6 | 200 | 0,301 s | 2026-09-12T19:04:02.628Z |
| 7 | 200 | 0,327 s | 2026-09-12T19:04:03.188Z |
| 8 | 200 | 0,311 s | 2026-09-12T19:04:03.782Z |

Huit appels sur huit répondent entre **246 ms et 380 ms**. Ce n'est PAS une mesure
en session froide de navigateur (pas de cache HTTP/IndexedDB en jeu ici, la
requête d'itinéraire n'est de toute façon jamais mise en cache) — c'est la latence
du service tiers lui-même, exactement ce qui détermine si le seuil de lenteur se
déclenche à tort sur un usage normal.

## 2. D'où viennent les deux seuils

**`SEUIL_LENTEUR_ITINERAIRE_MS = 2500`** (constante exportée,
`src/carte/panneau-itineraire.ts`) — environ SEPT FOIS le pire des huit temps
mesurés ci-dessus (380 ms). Assez loin de la latence normale pour ne jamais se
déclencher sur un aléa ordinaire ; assez tôt pour prévenir avant que l'attente ne
devienne suspecte. Le scénario qui a révélé le problème (IGN ralenti à 3 s, total
5 198 ms) franchit ce seuil, comme voulu — voir §3.

**`SEUIL_ABANDON_ITINERAIRE_MS = 15000`** — `calculerItineraire`
(`src/lib/itineraire.ts`) retente une fois, avec un timeout de 8 s par essai
(`DELAI_MS = 8000`) et 500 ms d'attente entre les deux : la promesse elle-même ne
peut jamais mettre plus de `8000 × 2 + 500 = 16 500` ms à trancher, succès ou
échec. 15 000 ms tombe SOUS ce plafond dur : l'usager voit la porte de sortie
avant que le mécanisme interne n'ait fini de renoncer tout seul — jamais après un
calcul déjà résolu. `tests/iti-lent-seuils.test.ts` vérifie mécaniquement cette
inégalité (elle lit `DELAI_MS` dans `lib/itineraire.ts`) : si l'un des deux
fichiers change sans l'autre, le test rougit.

## 3. Comportement observé, ralenti à 3 s puis à 20 s

Le mécanisme (`signalerLenteur`, `src/lib/service-lent.ts`) est une fonction pure
qui ne touche jamais au réseau — elle observe une promesse et déclenche des
actions à deux échéances, sans jamais l'annuler ni la relancer. Il est donc
mesuré à sec, avec de vrais délais simulés et des minuteurs contrôlés
(`vi.useFakeTimers`), plutôt que par un vrai appel ralenti artificiellement (E2E,
hors périmètre de cette tâche — mission A du même cycle).

Commande réellement lancée : `npx vitest run tests/service-lent.test.ts`,
2026-09-12T19:08:55Z (build local, commit de départ `a304eb9`, avant l'ajout des
seuils dans `panneau-itineraire.ts`) puis reconfirmée dans la suite complète.

- **Ralenti à 3 s** (`troisSecondes`, test « scénario ralenti à 3 s ») :
  - à 2 499 ms : rien ne s'est encore déclenché ;
  - à 2 500 ms : `surLenteur` se déclenche UNE fois (le bandeau « répond
    lentement » s'affiche dans l'application) ;
  - à 3 000 ms (avant les 15 000 ms d'abandon) : le service répond, la promesse
    résout normalement, `surAbandon` n'est JAMAIS appelé.
  - Comportement applicatif : le bandeau de lenteur s'affiche puis disparaît dès
    que le trajet arrive — l'utilisateur voit une prévenance, jamais un blocage.

- **Ralenti à 20 s** (`vingtSecondes`, test « scénario ralenti à 20 s ») :
  - à 2 500 ms : `surLenteur` se déclenche ;
  - à 15 000 ms : `surAbandon` se déclenche EN PLUS — le bandeau de lenteur se
    referme, l'écran cesse de tourner en silence, le bouton « Réessayer »
    apparaît ;
  - à 20 000 ms : le service répond enfin. La promesse d'origine n'a JAMAIS été
    abandonnée : sa valeur (`'itinéraire tardif'`) résout normalement, sans
    second appel. Dans l'application, `#calculer` vérifie alors le jeton de
    séquence : si l'usager n'a rien reprovoqué entre-temps, le trajet tardif
    s'affiche quand même ; s'il a cliqué « Réessayer », le jeton a changé et
    cette réponse tardive est ignorée — comme toute réponse tardive l'était déjà
    avant cette tâche (jeton de séquence, revue du 21/08).

Résultat de la commande (4 tests, 2026-09-12T19:08:55Z) :

```
 Test Files  1 passed (1)
      Tests  4 passed (4)
```

## 4. Bundle et suite complète

Mesuré par deux `npm run build` consécutifs sur le même poste, l'un sur
`git stash` (état `staging`, commit `a304eb9`), l'autre avec les changements de
cette tâche :

| | `panneau-itineraire-*.js` | gzip |
|---|---|---|
| avant (staging, a304eb9) | 123,62 Ko | 39,99 Ko |
| après (cette tâche, avant revue Codex) | 125,34 Ko | 40,56 Ko |
| après correction du bogue trouvé par Codex (§5) | 125,45 Ko | 40,57 Ko |
| delta final | +1,83 Ko | **+0,58 Ko** |

Bien dans le budget « ±5 Ko » du critère d'acceptation.

`npm test` (2026-09-12T19:22:04Z, commit de départ `a304eb9`, branche
`feat/recaAomQQUEykgE5f-iti-lent`) : 117 fichiers, **1 680 tests verts** avant
la revue Codex. Vérifié par contre-épreuve (`git stash` sans `-u`, qui ne
remet PAS les nouveaux fichiers non suivis, donc les 7 tests nouveaux restent
présents) : `npm test` sur `panneau-itineraire.ts` remis à l'état `staging`
donne **1 677 passés + 3 échoués** (les trois tests de
`iti-lent-seuils.test.ts` qui vérifient précisément l'existence des
constantes ajoutées par cette tâche) — soit un total de 1 680 tests recensés
dans les deux cas, ce qui confirme que les 4 tests de `service-lent.test.ts`
(mécanisme pur, indépendant du fichier modifié) ET les 3 de
`iti-lent-seuils.test.ts` s'ajoutent bien à une base de **1 673 tests
préexistants sur `staging`**, sans qu'aucun test existant n'ait été modifié ou
supprimé.

Après correction du bogue trouvé par Codex (§5, un 4ᵉ test ajouté) :
`npm test` (2026-09-12T19:28:53Z) donne **117 fichiers, 1 681 tests verts**.
`npm run lint` et `npm run build` (`tsc --noEmit` inclus) sans erreur sur
l'état final.

## 5. Revue Codex (`codex exec -s read-only`, 2026-09-12T19:25:28Z, commit
`57350a7`)

**Verdict initial : BLOQUANT.** `#effacer()` (bouton « Effacer le trajet »)
n'incluait pas le nettoyage des deux nouveaux bandeaux. Le jeton de séquence
change au tout début de `#effacer()`, donc le succès ou l'échec tardif de
`#calculer()` — dont c'est normalement le rôle de nettoyer ces éléments — ne
le fait jamais dans ce cas précis (son propre garde `if (jeton !== this.#sequence) return;`
l'en empêche). Scénario d'échec décrit par Codex : lancer un calcul, attendre
2,5 s ou 15 s sans réponse, cliquer « Effacer le trajet » → le bandeau reste
affiché sur un panneau vidé.

**Corrigé** : `#effacer()` masque désormais explicitement
`.iti-lenteur-service` et `.iti-abandon-service`. Verrouillé par un test
dédié dans `tests/iti-lent-seuils.test.ts`, dont la contre-épreuve a été
faite manuellement (correctif temporairement retiré → le test échoue ; remis
→ il passe), avant de committer la version finale.

Reste de la revue : minuteurs nettoyés au succès comme au rejet, callbacks
déclenchés une seule fois, réponses obsolètes neutralisées par le jeton de
séquence, aucun double calcul possible via « Réessayer », seuils cohérents
avec la documentation, CSS conforme à la règle `hidden` du projet (ERGO-6).

**Second passage (2026-09-12T19:31:11Z, commit `65d141b`) : NON BLOQUANT.**
Le correctif est confirmé — « les lignes … masquent les deux bandeaux …
après 2,5 s comme après 15 s ». Une remarque mineure : le test dédié
vérifiait la PRÉSENCE TEXTUELLE des deux affectations sans exclure qu'elles
soient commentées (`//`), ce qui les aurait laissées passer à tort si le
correctif avait été retiré de cette façon précise. Corrigé par un ancrage
`^\s*` en début de ligne (drapeau `m`) — contre-épreuve refaite : les deux
affectations commentées font rougir le test, restaurées il repasse au vert.
