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
(publique française · sans clé exposée · CORS pour le navigateur). Huit pistes
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

## Info trafic — Bison Futé (vérifié 22/08/2026)
- SOURCE NATIONALE, CORS `*`, aucune clé, rafraîchie toutes les 3 minutes.
- L'URL N'EST PAS FIXE. Deux requêtes :
  1. `https://www.bison-fute.gouv.fr/data/iteration/date.json` → `[horodateMs]`
  2. `https://www1.bison-fute.gouv.fr/data/data-AAAAMMJJ-HHMMSS/evenementsOL6/maintenant/tfs/evenements/evenementsOL6.json`
     — le dossier se compose en HEURE DE PARIS. Une URL notée un jour rend un
     fichier VIDE le lendemain (deux contre-vérifications de la revue s'y sont
     laissé prendre).
- COORDONNÉES EN LAMBERT-93 (EPSG:2154), pas en WGS84 : reprojection maison
  dans `src/lib/lambert93.ts` (aucune dépendance ; proj4js pèserait ~40 Ko
  gzippés pour cette seule projection). Validée sur l'origine conventionnelle
  ET sémantiquement : A5 → Seine-et-Marne, N20 → Ariège, A103 → Seine-Saint-Denis.
- 243 événements observés : TRAVAUX 104, OBSTACLE 46, RESTRICTION 28,
  COUPURE 26, MESURE_GESTION_TRAFIC 20, ACCIDENT 10, INFORMATION 5,
  INTEMPERIES 2, INTERDICTION_PL 1, BOUCHON 1. `etat_evenement` : EFFECTIF,
  PREVISIONNEL, TERMINE (écarté à l'affichage), ou vide.
- Détail par événement (`urlcpc`) : tableau imbriqué CONTENANT DU HTML avec
  entités numériques (`jusqu&#39;au`) — réduit en texte côté client, jamais
  injecté en balises. ~100 Ko pour toute la France (gzip ~12 Ko).

## Sources trafic écartées (22/08/2026, mêmes vérifications)
- `tipi.bison-fute.gouv.fr` (flux DATEX II référencés par transport.data.gouv.fr) :
  répond en HTTPS mais **sans aucun en-tête CORS** — inutilisable au navigateur.
- Miroir `transport.data.gouv.fr/resources/NNNNN/download` : **HTTP 500**.
- Bordeaux `ci_evenmt_p` : 3 entrées, plus rien depuis le 19/05/2026.
- Montpellier : le chemin ODS n'existe pas (404, page Drupal).
- Géoplateforme : **aucune couche trafic ou travaux** (WFS/WMTS inspectés).
- ÉCARTÉES POUR PLUS TARD (fonctionnent, mais couverture d'agglomération) :
  Bordeaux `ci_trafi_l` (fluidité temps réel, 687 tronçons, 376 Ko),
  Rennes `etat-du-trafic-en-temps-reel` (2 859 tronçons, 2,3 Mo — trop lourd
  en chargement intégral), Nantes `fluidite-axes-routiers` (889 tronçons),
  Paris `chantiers-perturbants` (122), Toulouse `chantiers-en-cours` (987).

## Mise en cache des tuiles IGN — ce que le serveur autorise (vérifié 22/08/2026)
- `data.geopf.fr/wmts` répond `Cache-Control: private, max-age=1814400`, soit
  **21 jours de cache PRIVÉ** — le serveur autorise donc lui-même la mise en
  cache navigateur, et en fixe la durée. Notre service worker s'arrête à
  14 jours, en deçà de ce que l'IGN accorde ; le cache vit dans le navigateur
  de l'usager, jamais sur un serveur partagé (ce que « private » exige).
- Une tuile pèse ~47 Ko (mesuré) : les plafonds par couche — 400 plan, 250
  satellite, 150 routes, 150 cadastre — bornent le disque à ~45 Mo au pire,
  avec purge automatique sur erreur de quota.

## Transports en commun temps réel — transport.data.gouv.fr (vérifié 22/08/2026)
- Catalogue : `GET https://transport.data.gouv.fr/api/datasets?type=public-transit`
  → 200, 2,4 Mo, **781 jeux de données**. Formats recensés : 551 GTFS,
  377 GTFS-RT, 169 NeTEx, 84 SIRI.
- Sur ces 377 ressources GTFS-RT, **150 déclarent `vehicle_positions`**, et
  **47 seulement passent par `proxy.transport.data.gouv.fr`** — les autres
  pointent des URL d'opérateurs SANS en-tête CORS, donc inatteignables depuis
  un navigateur. Après regroupement par réseau : **44 flux exploitables**.
- CORS et fraîcheur, mesurés flux par flux (`Origin: https://maps.infonovice.fr`) :
  ```
  star-rennes-integration-gtfs-rt-vehicle-position  200  access-control-allow-origin: *
  divia-dijon-gtfs-rt-vehicle-position              200  application/octet-stream   108 o
  bibus-brest-gtfs-rt-vehicle-position              200  15 o (flux vide)
  lemet-metz-gtfs-rt-vehicle-position               200  15 o (flux vide)
  aleop-pdl-gtfs-rt-vehicle-position                200  application/x-protobuf     157 o
  ```
  `cache-control: max-age=0, private, must-revalidate` partout : le producteur
  demande explicitement qu'on ne garde rien. On ne garde rien.
- **Les tailles minuscules ci-dessus sont l'heure, pas la source** : relevé à
  03 h 57 (Paris), deux véhicules circulaient dans toute la France proxifiée.
  Contrôlé à 04 h 22 sur Dijon depuis l'application : 4 véhicules Divia.
- Contenu décodé, réellement obtenu (Aléop, Pays de la Loire) :
  `id RTVP:T:2644377402`, ligne `206`, `47.8137 / -0.0871`, étiquette
  « Malicorne-sur-Sarthe », horodate à la seconde. Et (Divia, Dijon) :
  véhicule `3631`, ligne `4-93`, `47.3170 / 5.0748`, cap 323°, 17 m/s.
- Emprises des réseaux : `geo.api.gouv.fr`. Les EPCI et communes rendent leur
  contour (`?format=geojson&geometry=contour`) ; **les départements et régions
  ne le rendent PAS** — leur emprise est calculée à partir des centres de
  leurs communes (`/communes?codeRegion=..&fields=centre`), élargie de 0,1°.
  Table engendrée par `node scripts/reseaux-temps-reel.mjs`, versionnée.

## GTFS statique — écarté, avec la mesure (22/08/2026)
La PR #15 visait « le GTFS des principales agglomérations ». Ce n'est pas
tenable sans serveur, et le chiffre le dit :
- Fichier national consolidé « Position des arrêts de transport et tracés de
  lignes » (data.gouv.fr, `5f186dca05ac2c31888a2262`) :
  **578 Mo en GeoPackage, 302 Mo en GeoJSON compressé**.
- Un seul réseau moyen : `gtfs-citea-sept2024.zip` = **11,5 Mo**, à décompresser
  et indexer dans le navigateur — pour une agglomération de 65 000 habitants.
Un navigateur ne digère pas cela à chaque visite, et le projet n'a pas de
serveur pour le pré-mâcher. La couche livrée montre donc les VÉHICULES, pas
les horaires, et le dit sur la page « À propos » comme dans le volet.


## Ce que les producteurs GTFS-RT publient VRAIMENT (relevé 22/08/2026, 06 h 15)
44 flux interrogés, 44 réponses 200. 21 portaient des véhicules, **416 au total**.
Tailles : min 13 o, médiane 15 o, max 18 014 o (Atoumod, toute la Normandie).
Quatre écarts à la spécification, tous mesurés, tous traités dans le code :

- **`timestamp: 0`** — Bibus (Brest) le publie pour ses **27 véhicules sur 27**.
  Pris pour une date, cela les situe en 1970 et la règle de fraîcheur efface le
  réseau entier : mesuré, 0 affiché sur 27. Le décodeur traduit donc **le zéro
  et lui seul** en « inconnue » — en protobuf, un entier à zéro est
  indiscernable d'un champ absent, ce n'est pas une interprétation.
  ON NE VA PAS PLUS LOIN : une première écriture écartait tout ce qui sortait
  de [2020, 2100], ce qui transformait une position datée de 2017 en
  « fraîcheur inconnue » puis, par repli sur l'en-tête, en « vu à l'instant ».
  Une date ancienne est une information : elle doit vieillir et se faire
  écarter par la fraîcheur, pas effacer par le décodeur.
- **Identifiants NeTEx en guise de nom de ligne** — `ATOUMOD003:Line:6xC7:LOC`,
  sur **102 véhicules des 416** (atoumod, seine-eure-semo, transurbain-evreux,
  deepmob-dieppe). Le segment qui suit `:Line:` est le nom attendu (6xC7, T1, 5).
- **Vitesses indéchiffrables** — la spécification dit des m/s. Cohérents en m/s :
  Metz 13,0 · Rennes 12,8 · Alterneo 13,0 · Amiens 11,0 · Cannes 9,0 · Aléop 19,6.
  Incohérents : **Dijon 69,0 · Le Mans 62,0 · Bourg-en-Bresse 37,0** — soit 248,
  223 et 133 km/h. Trois producteurs sur neuf publient vraisemblablement des
  km/h, et rien dans le flux ne le dit. **Aucune vitesse chiffrée n'est donc
  affichée** ; seul « à l'arrêt » l'est, et seulement quand le réseau remplit
  vraiment le champ (10 réseaux sur 21 le font ; aucun ne publie que des zéros).
- **Horloges en avance** — en-têtes relevés à -63 s (Atoumod) et -85 s (SETRAM).
  Une tolérance d'une minute effaçait ces réseaux entiers. Portée à trois minutes,
  et l'avance est DITE dans le volet.

## Doublons entre agrégats et réseaux membres (mesuré 22/08/2026)
L'agrégat normand `atoumod` republie les véhicules de ses réseaux membres, avec
**le même identifiant d'entité** :

```
transurbain-evreux    4 véhicules, dont 3 déjà dans atoumod
seine-eure-semo      11 véhicules, dont 11 déjà dans atoumod
deepmob-dieppe        3 véhicules, dont  3 déjà dans atoumod
témoin Aléop/SETRAM  27 véhicules, dont  0 en commun
```

Sans traitement, chaque bus normand était dessiné deux fois et compté deux fois.

**ON NE LES DÉDOUBLONNE PAS** — trois clés essayées, les trois cassées par les
données réelles :

1. **L'identifiant** (`FeedEntity.id`). Il n'identifie pas un véhicule chez
   tout le monde : Aléop y met l'identifiant de COURSE. Relevé le 22/08,
   `RTVP:T:2652202525` est porté par **TROIS autocars** (parcs 40148, 40149,
   25405) séparés de 70 à 736 m — dédoublonner là-dessus efface de vrais
   véhicules DANS UN SEUL FLUX. MAT Saint-Malo présente le même cas. Et entre
   réseaux sans lien, les identifiants nus (« 3 », « 4 ») se télescopent :
   onze bus réels effacés, mesurés sur cinq paires de réseaux.
2. **L'étiquette** (`VehicleDescriptor`). Elle identifierait le véhicule, mais
   les agrégats ne la publient pas : sur les **57 paires agrégat/membre**
   relevées, 57 sans étiquette d'un côté. Elle n'est pas non plus unique
   (trois doublons d'étiquette dans Aléop).
3. **La distance**. L'écart entre l'agrégat et son membre n'est pas du bruit
   de position : c'est un décalage d'échantillonnage (**210 s de médiane**)
   multiplié par la vitesse. Mesuré jusqu'à **3 187 m** sur un car ; à
   80 km/h il dépasse 4 km. Aucun seuil ne tient.

Alors la carte dessine tout, et le volet PRÉVIENT quand un agrégat est affiché
avec un autre réseau : « un même véhicule peut apparaître deux fois ».
Effacer un bus qui roule est pire que d'en dessiner un en double ; se taire
sur un doublon connu serait pire que les deux.

**ÉCARTER L'AGRÉGAT N'ÉTAIT PAS LA SOLUTION NON PLUS.** Une écriture
intermédiaire le retirait dès qu'un réseau propre desservait la même vue :
elle coûtait **100 des 156 véhicules de l'agrégat** (64 %), qui n'ont aucun
homologue chez un réseau propre. Au Havre, 44 bus roulaient et le volet
affichait « aucun véhicule », parce qu'un réseau de Honfleur — deux véhicules,
à 20 km — effleurait la vue par arrondi de grille ; sur un balayage de la
Normandie, 160 vues sur 621 n'affichaient plus rien. L'agrégat est donc un
candidat comme les autres, simplement classé DERNIER (plus vaste étendue) :
là où trois réseaux locaux desservent, le plafond l'évince de lui-même, et
aucun doublon n'apparaît.

## Emprises : pourquoi un rectangle ne suffit pas (mesuré 22/08/2026)
`geo.api.gouv.fr` ne rend le contour que des communes et des EPCI ; pour un
département ou une région il faut passer par leurs communes. Le rectangle qui en
résulte est deux fois plus vaste que le territoire : celui des Pays de la Loire
**couvre Rennes**, à 97 km du car Aléop le plus proche. La table porte donc une
`couverture` — des bandes [ligne, colonneMin, colonneMax] sur une grille de 0,2°
(~22 km) déduite des communes desservies, 121 bandes pour 44 réseaux. Effet
mesuré : Rennes n'interroge plus que le STAR (au lieu de STAR + Aléop +
Atoumod), Saint-Malo que le MAT, Fougères deux réseaux au lieu de trois.

## Répertoire des communes — geo.api.gouv.fr (vérifié 22/08/2026)

Socle de l'adressage en mots. Service public, sans clé, CORS ouvert.

| Usage | Requête | Mesure |
|---|---|---|
| Commune d'un point | `GET /communes?lat=47.322&lon=5.0415&fields=nom,code,centre&format=json` | 200 en 0,12 s |
| Commune par nom | `GET /communes?nom=Dijon&fields=nom,code,centre&format=json&limit=20` | 200 |

- CORS : `access-control-allow-origin` reflète l'origine appelante — vérifié
  avec `Origin: https://maps.infonovice.fr`.
- `cache-control: public, max-age=3600, immutable` : le navigateur garde la
  réponse une heure. Une adresse relue plusieurs fois ne coûte qu'un appel.
- Aucun en-tête de quota publié. On s'en tient à deux appels par adresse
  (un au codage, un au décodage) et à rien du tout tant que l'usager
  ne demande pas une adresse en mots.

### `nom=` est une recherche APPROCHÉE — le piège

Demander « Dijon » rend **sept** communes, dont six fausses :

```
Dijon (21231, score 1)          Plombières-lès-Dijon (21485, 0,63)
Fontaine-lès-Dijon (21278, 0,75) Sennecey-lès-Dijon  (21605, 0,63)
Asnières-lès-Dijon (21027, 0,69) Perrigny-lès-Dijon  (21481, 0,67)
Hauteville-lès-Dijon (21315, 0,69)
```

Le centre de Fontaine-lès-Dijon est à 2 km de celui de Dijon : décoder une
adresse sur la mauvaise commune la déplace d'autant, **sans rien signaler**.
`communesParNom` exige donc le nom exact (accents et casse mis à part) puis le
département. Le test « ÉCARTE les communes dont le nom n'est pas exactement
celui demandé » est la sentinelle de ce filtre — son retrait le fait échouer.

### Pourquoi le répertoire n'est pas embarqué

Les 34 969 communes avec leur centre pèsent 3,3 Mo bruts. Même réduites au
strict nécessaire, elles dépasseraient à elles seules le budget de 300 Ko du
paquet. L'adressage en mots demande donc le réseau — c'est écrit dans
l'interface, et la carte hors ligne n'en promet rien.

### Mesures sur les 34 969 communes (22/08/2026)

- Préfixer le nom par le département ne laisse que **6 collisions d'homonymes**,
  toutes en outre-mer (97x). Elles sont proposées à l'usager, jamais arbitrées.
- Commune médiane : 11 km². 99,9ᵉ centile : 652 km².
- La fenêtre d'adressage (40,96 km de côté, soit ±20,48 km autour du centre)
  couvre donc toutes les communes sauf les plus vastes, où `coder` refuse
  explicitement plutôt que de rendre une adresse fausse.

## DATAtourisme — écarté POUR L'INSTANT, avec la mesure (25/08/2026)

Armelin dispose d'une clé gratuite et souhaitait afficher les lieux culturels
autour des arrêts de recharge et le long du trajet. Deux mesures ont suffi à
suspendre l'idée.

```
GET https://api.datatourisme.fr/v1/catalog   (sans clé, Origin: maps.infonovice.fr)
→ HTTP 401                          la clé est OBLIGATOIRE
→ Access-Control-Allow-Origin: *    le CORS, lui, est ouvert
```

L'API est une recherche géographique — paramètres `latitude`, `longitude`,
`radius`, `page`, `theme` relevés dans sa documentation — et non un flux en
masse. Elle conviendrait donc parfaitement au besoin.

**LE BLOCAGE N'EST PAS TECHNIQUE, IL EST STRUCTUREL.** Ce site est statique,
servi depuis un dépôt public : une clé livrée au navigateur est lisible par
quiconque ouvre les outils de développement. Le quota d'Armelin serait
siphonnable et sa clé révocable. C'est exactement le motif qui a écarté huit
sources météo françaises plus haut dans ce document.

Deux voies existaient, et elles ont été présentées :

| Voie | Ce qu'elle coûte |
|---|---|
| **Extraction au build** — clé en secret GitHub Actions, extrait statique par département servi à la demande (comme le répertoire des communes) | Un script à écrire et à maintenir ; données figées entre deux constructions — sans importance pour des musées |
| **Clé dans le navigateur** | Une dérogation formelle : décision écrite ET mention publique, comme Open-Meteo le 22/08. Clé exposée. |

**Décision d'Armelin du 25/08 : abandonner pour l'instant.** Ni l'une ni
l'autre. Rien n'est promis dans l'interface, et le sujet reste ouvert : la
mesure ci-dessus reste valable le jour où il le rouvrira.

**Ce qui a aussi pesé :** la documentation ne publie qu'un schéma, pas de
réponse réelle. Or ce dépôt exige des fixtures au format réel des services,
vérifiées par appels réels. Sans clé, aucun décodeur ne pouvait être écrit
honnêtement.

## À vérifier avant leur PR (ne pas présumer)
- Adressage « commune + mot + chiffres » (PR #18) : rien n'est encore vérifié.
