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

## Points d'intérêt (vérifiés 21-22/08/2026)
- CARBURANTS : `data.economie.gouv.fr/api/explore/v2.1/.../prix-des-carburants-en-france-flux-instantane-v2/records`
  + `where=in_bbox(geom,latS,lonO,latN,lonE)` (CET ORDRE) — prix du jour par
  carburant (`gazole_prix`…), `geom {lon,lat}` propre, CORS *. Plafond DUR
  `limit=100` (tout portail Opendatasoft).
- BORNES IRVE : `public.opendatasoft.com/.../mobilityref-france-irve-220/records`
  + `in_bbox(point_geo,…)` — republication à jour (18/08) du consolidé Etalab.
  ÉCARTÉ avec preuve : le jeu `bornes-irve` d'ODRE (figé 2019-09, lon/lat
  INVERSÉS sur tout le jeu — bbox inversée : 12 129 résultats, normale : 0).
  Attention : `coordonneesxy` y est du TEXTE, le champ géo est `point_geo`.
- PARKINGS : WFS Géoplateforme `data.geopf.fr/wfs/ows`, couche
  `PARKING.SUP.500:parkings_sup500m2` (> 500 m²), GetFeature GeoJSON,
  `BBOX=latS,lonO,latN,lonE,urn:ogc:def:crs:EPSG::4326`, MultiPolygones avec
  `surfm2`/`nomcom`. Même origine que nos tuiles.

## Photos de rue — Panoramax (vérifié 22/08/2026)
- Recherche STAC : `https://api.panoramax.xyz/api/search?bbox=O,S,E,N&limit=N`
  — CORS ouvert (renvoie l'origine appelante). Chaque `feature` : `geometry`
  Point, `properties` (`datetime`, `license`, `geovisio:producer`,
  `view:azimuth`), `assets` `hd` / `sd` / `thumb`.
- ATTENTION : les IMAGES sont servies par un AUTRE hôte,
  `panoramax.openstreetmap.fr` — deux origines à déclarer (connect-src pour
  l'API, img-src pour les photos).
- Licence des photos : CC-BY-SA-4.0 → l'attribution (producteur, licence,
  date) est une OBLIGATION, affichée sous l'image.

## Météo — Open-Meteo (vérifié 22/08/2026)
- `https://api.open-meteo.com/v1/forecast?latitude=&longitude=&hourly=temperature_2m,precipitation,weather_code,wind_speed_10m&timezone=auto&forecast_days=3`
  — sans clé, CORS `*`. `hourly` rend des TABLEAUX PARALLÈLES ; les heures
  sont locales AU LIEU et sans fuseau (`2026-08-22T14:00`) grâce à
  `timezone=auto`. Codes temps = OMM (WMO 4677), traduits chez nous.
- Service EUROPÉEN (allemand), pas français : écart de souveraineté décidé
  par Armelin le 22/08 et ÉCRIT sur la page « À propos » et sous la
  prévision elle-même. Seules les coordonnées de la DESTINATION partent.
- Les VIGILANCES Météo-France restent hors de portée (clé obligatoire) :
  l'interface ne les promet pas.

## Sources météo françaises testées et écartées (22/08/2026)

Aucune source météo ne satisfait les trois contraintes du projet à la fois
(publique française · sans clé exposée · CORS pour le navigateur). Sept pistes
testées par appels réels :

| Piste | Verdict |
|---|---|
| `public-api.meteofrance.fr` (API officielle) | **clé obligatoire** — sans elle, page HTML du portail |
| `donneespubliques.meteofrance.fr` | page HTML, **aucun en-tête CORS** |
| `meteo.data.gouv.fr` | portail web, pas d'API JSON avec CORS |
| data.gouv.fr, jeux Météo-France (122) | seul jeu vigilance = **archivé** (historique, pas temps réel) |
| Modèles ARPEGE / AROME | GRIB de plusieurs centaines de Mo + clé — inexploitable au navigateur |
| Miroir SYNOP `public.opendatasoft.com` | CORS OK mais **figé au 15/01/2026** (7 mois de retard) |
| Géoplateforme (WMTS/WFS) | **aucune couche météo** |
| infoclimat | HTTP 400 sans authentification |

Une clé Météo-France ne suffirait pas : sans backend, elle vivrait en clair
dans le JavaScript public. Trois issues possibles, toutes des DÉCISIONS
d'Armelin (voir ROADMAP PR #13) — aucune n'est prise unilatéralement.

ENDPOINTS INTERNES ÉCARTÉS PAR PRINCIPE : le site vigilance.meteofrance.fr
consomme des endpoints non documentés (`rpcache-*.meteofrance.com`). Les
utiliser serait fragile et hors des conditions d'usage : la règle du projet
est « API publiques documentées », elle ne se contourne pas.

## À vérifier avant leur PR (ne pas présumer)
- transport.data.gouv.fr GTFS/GTFS-RT (PR #15-16)
