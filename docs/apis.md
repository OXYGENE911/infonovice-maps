# API consommées — endpoints vérifiés et quotas

Chaque entrée est VÉRIFIÉE par un appel réel avant d'entrer ici (date en tête).
Ces quotas sont un bien commun : debounce, cache, jamais de martèlement.

## Géoplateforme IGN — tuiles WMTS (vérifié 16/08/2026)
- Capabilities : `https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetCapabilities&VERSION=1.0.0` → 200
- Tuile Plan IGN v2 :
  `https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&FORMAT=image/png&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}`
  → 200, image/png (~80 Ko à z=5). Sans clé (flux « essentiels »).
- Ortho satellite : `LAYER=ORTHOIMAGERY.ORTHOPHOTOS`, `FORMAT=image/jpeg` → 200.
- Quota indicatif : usage raisonné, pas de clé requise sur les couches
  essentielles. Attribution obligatoire : « IGN-F / Géoplateforme ».

## Couches WMTS supplémentaires (vérifié 16/08/2026)
- `CADASTRALPARCELS.PARCELLAIRE_EXPRESS` (png) → 200 sans clé.
- `TRANSPORTNETWORKS.ROADS` (png) → 200 sans clé (surcouche du satellite).
- `GEOGRAPHICALGRIDSYSTEMS.MAPS*` (SCAN 25/Topo) → **400 sans clé** : flux
  soumis à inscription Géoplateforme (gratuite). À activer plus tard.

## API Adresse BAN (vérifié 16/08/2026)
- `https://api-adresse.data.gouv.fr/search/?q=<texte>&limit=5` → GeoJSON.
- Géocodage inverse : `/reverse/?lon=&lat=`.
- Quota : 50 requêtes/s/IP (doc officielle). Debounce 300 ms obligatoire.
- Licence : Licence Ouverte. Attribution : « données © BAN ».

## Itinéraire Géoplateforme (vérifié 16/08/2026)
- `https://data.geopf.fr/navigation/itineraire?resource=bdtopo-osrm&start=lon,lat&end=lon,lat&profile=car|pedestrian&optimization=fastest|shortest`
  → JSON avec `geometry` (GeoJSON), `distance`, `duration`.
- Ressource vérifiée : `bdtopo-osrm` (version 2026-07-12). Profils au
  getcapabilities (16/08) : `car`, `pedestrian` (+ `exceptionnal`) — PAS de
  vélo sur les moteurs publics. `bdtopo-valhalla` : mêmes profils.
- Un 404 du service = « aucun chemin entre ces points » (île, mer) : c'est
  une réponse, pas une panne — ne pas rejouer.
- Sans clé. Throttle sur les recalculs.

## Altimétrie Géoplateforme (vérifié 16/08/2026)
- `https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json?lon=&lat=&resource=ign_rge_alti_wld`
  → `{"elevations":[{"lon","lat","z","acc"}]}` (z en mètres).
- Multi-points : `lon=a|b|c&lat=d|e|f` — vérifié le 20/08/2026.
- Profil en long : `elevationLine.json?lon=…&lat=…&resource=ign_rge_alti_wld&sampling=N`
  échantillonne N points LE LONG de la polyligne fournie (vérifié 20/08/2026 :
  40 sommets ≈ 800 caractères d'URL, sampling=60 rendu intégralement). C'est
  l'endpoint du profil altimétrique (PR #7) ; « pas de donnée » = z très
  négatif (-99999), à écarter côté client.

## Options d'itinéraire (vérifié 21/08/2026)
- `intermediates=lon,lat|lon,lat` : étapes intermédiaires, réponse en
  `portions[]` (une par tronçon).
- `constraints={json}` : bannir `waytype` = `autoroute|tunnel|pont` sur
  bdtopo-osrm. PLUSIEURS contraintes se joignent par `|` DANS LE MÊME
  paramètre — le paramètre répété rend 500, le `;` rend 400 (testé).
- Pas de clé « péage » sur AUCUN moteur ; pas de paramètre « alternatives » :
  écarts consignés dans la roadmap (PR #6).

## Étapes d'itinéraire (vérifié 21/08/2026)
- `data.geopf.fr/navigation/itineraire` + `getSteps=true&waysAttributes=name`
  → `portions[].steps[]` avec `instruction` en CODES OSRM (`type`, `modifier`,
  parfois `exit`) — AUCUN texte : la traduction française est à notre charge.
- Noms de voies dans `attributes.name` : `nom_1_gauche` en MAJUSCULES ABRÉGÉES
  BD TOPO (« R DE RIVOLI »), `cpx_numero` pour les routes numérotées (« A6 »),
  `cpx_toponyme` en repli. Chaque étape porte `distance`, `duration`, `geometry`.

## À vérifier avant leur PR (ne pas présumer)
- Panoramax `https://api.panoramax.xyz` (PR #12)
- Météo-France open data (PR #13)
- transport.data.gouv.fr GTFS/GTFS-RT (PR #15-16)
- prix-carburants.gouv.fr + IRVE (PR #9)
- Overpass API + usage policy (PR #9)
