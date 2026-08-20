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

## API Adresse BAN (vérifié 16/08/2026)
- `https://api-adresse.data.gouv.fr/search/?q=<texte>&limit=5` → GeoJSON.
- Géocodage inverse : `/reverse/?lon=&lat=`.
- Quota : 50 requêtes/s/IP (doc officielle). Debounce 300 ms obligatoire.
- Licence : Licence Ouverte. Attribution : « données © BAN ».

## Itinéraire Géoplateforme (vérifié 16/08/2026)
- `https://data.geopf.fr/navigation/itineraire?resource=bdtopo-osrm&start=lon,lat&end=lon,lat&profile=car|pedestrian&optimization=fastest|shortest`
  → JSON avec `geometry` (GeoJSON), `distance`, `duration`.
- Ressource vérifiée : `bdtopo-osrm` (version 2026-07-12). `bdtopo-valhalla`
  existe aussi (à vérifier avant usage — options péages/vélo).
- Sans clé. Throttle sur les recalculs.

## Altimétrie Géoplateforme (vérifié 16/08/2026)
- `https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json?lon=&lat=&resource=ign_rge_alti_wld`
  → `{"elevations":[{"lon","lat","z","acc"}]}` (z en mètres).
- Multi-points : paramètres `lon=a|b|c&lat=d|e|f` (à vérifier en PR #7).

## À vérifier avant leur PR (ne pas présumer)
- Panoramax `https://api.panoramax.xyz` (PR #12)
- Météo-France open data (PR #13)
- transport.data.gouv.fr GTFS/GTFS-RT (PR #15-16)
- prix-carburants.gouv.fr + IRVE (PR #9)
- Overpass API + usage policy (PR #9)
