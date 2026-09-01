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

## Commodités des aires — Overpass / OSM (mesuré 25-26/08/2026)

L'étude EV promettait de mesurer la couverture avant de rien promettre. C'est
fait, et le premier verdict était trompeur.

**L'ENSEIGNE N'EST PAS SUR L'AIRE.** Sur les 698 aires de service françaises
(`highway=services`, comptage Overpass du 25/08) :

| Balise | Renseignée |
|---|---|
| `name` | 518 (74 %) |
| `toilets` | 384 (55 %) |
| `website` | 127 (18 %) |
| `operator` | 89 (13 %) |
| `opening_hours` | 20 (3 %) |
| **`brand`** | **1 aire sur 698 (0 %)** |

**MAIS ELLE EST SUR LES OBJETS À L'INTÉRIEUR.** Relevé sur le corridor
Beaune-Chalon (emprise 46,6-47,2 / 4,6-5,2) : **9 aires sur 9** ont au moins
une commodité à moins de 400 m. 43 commodités rattachées — 17 stations-service,
11 toilettes, 7 restaurations rapides, 6 restaurants, 2 cafés — dont **74 %
portent une identité** (`brand`, `operator` ou `name`).

D'où le choix du module : on interroge AUTOUR du point d'arrêt, jamais l'aire.

### Le miroir français (vérifié 26/08/2026)

`overpass.openstreetmap.fr`, opéré par OpenStreetMap France, répond aussi bien
que l'instance de référence allemande — HTTP 200, `Access-Control-Allow-Origin: *`,
JSON. C'est lui que l'application interroge.

### Overpass tombe, et il faut le prévoir

Deux `Dispatcher_Client::request_read_and_idx::timeout` reçus pendant le
développement même de ce module, après quelques requêtes rapprochées. C'est un
service BÉNÉVOLE : la requête est étroite (cinq types nommés, jamais
`["amenity"]` en entier), bornée à 25 s, et n'est émise QU'À LA DEMANDE — un
clic sur un arrêt, jamais au fil de la carte.

En surcharge, Overpass rend une page **HTML**, pas du JSON. La lire sans
précaution lèverait une exception illisible : le module la traduit en message
français, et le bouton reste réessayable.

## Disponibilité des bornes en direct — ÉCARTÉE, avec la mesure (26/08/2026)

Le jeu Belib' « Points de recharge — **disponibilité temps réel** » (Paris,
`parisdata.opendatasoft.com`) est techniquement parfait : HTTP 200,
`Access-Control-Allow-Origin: *`, aucune clé, filtre par emprise, et un
`id_pdc` au format d'itinérance qui joint le jeu IRVE statique. Tout invitait
à le brancher.

**LA FRAÎCHEUR L'INTERDIT.** Comptage EXACT sur les 1 967 points du jeu, le
26/08/2026 :

| Âge du statut | Points | Part |
|---|---|---|
| moins d'**1 h** | 123 | **6 %** |
| moins de 6 h | 1 090 | 55 % |
| moins de 24 h | 1 910 | 97 % |

Les extrêmes confirment que le flux est bien vivant pour une minorité : les
plus frais datent de 0,0 h, les plus anciens de **13 474 h** — dix-huit mois,
tous au statut « Inconnu ».

**Pourquoi cela suffit à décliner.** Un « Disponible » vieux de cinq heures ne
dit rien de l'instant : une borne libre à 9 h est prise à 14 h. Et l'erreur
tomberait exactement quand elle coûte le plus cher — en arrivant à 8 % de
batterie sur la foi d'un affichage. Rapporté au parc français, 6 % de
fraîcheur dans UNE ville font environ **123 bornes fiables sur ~120 000**.

Ce que cela aurait coûté par ailleurs : une origine de plus dans la CSP, un
rapprochement à maintenir entre deux jeux, et une promesse d'interface que la
donnée ne tient pas.

**Décision du 26/08/2026 : écartée.** Rien n'est promis dans l'interface. Le
jour où un producteur publiera un flux réellement continu — ou si Belib'
resserre sa cadence —, cette mesure sera le point de comparaison.

Répartition des statuts, pour mémoire : Disponible 65 %, Occupé 29 %,
Inconnu 3 %, En maintenance 3 %.

## Index national des bornes rapides — export agrégé (mesuré 26/08/2026)

**Pourquoi cette route existe.** Les portails Opendatasoft plafonnent DUREMENT
`limit` à 100 enregistrements. Demander les bornes de la France entière rendait
donc cent bornes au hasard — un affichage qui ment sans le dire. C'est la cause
unique des deux reproches d'Armelin du 25/08 : « les points de charge ne
s'affichent qu'entre 0 et 1 km de zoom » et « le filtre réseau devrait
fonctionner quel que soit le niveau de zoom ».

**La route qui lève le plafond.** L'endpoint `/exports/json` du même portail
n'est PAS plafonné, et il accepte `group_by` — donc une agrégation par station
faite côté serveur.

```
https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/
  mobilityref-france-irve-220/exports/json
  ?where=puissance_nominale>=50
  &group_by=id_station_itinerance,nom_station,nom_enseigne,condition_acces,
           prise_type_combo_ccs,prise_type_chademo,prise_type_2
  &select=max(puissance_nominale) as p, sum(nbre_pdc) as pdc,
          max(consolidated_longitude) as lon, max(consolidated_latitude) as lat
```

| Mesure | Valeur |
|---|---|
| Lignes rendues | 21 555 (station × combinaison de prises) |
| Stations après fusion locale | 14 133 |
| Poids sur le fil (gzip du serveur) | **709 Ko** |
| Durée | 1,7 s en fibre |
| Comparaison seuil 150 kW | 10 136 lignes, 354 Ko |
| Comparaison sans les prises | 17 290 lignes, 622 Ko |

Les connecteurs coûtent donc 87 Ko (+14 %) et évitent une réserve dans
l'interface : ils sont retenus.

### Deux pièges, mesurés, à ne pas redécouvrir

**1. `longitude` est typé TEXTE, `consolidated_longitude` est numérique.**
Toute agrégation sur le premier est refusée :

```
ODSQLError : StatAggregation only supports numeric or date expression.
```

Deux champs d'apparence interchangeable, un seul qui marche. Un test verrouille
le bon (`tests/index-bornes.test.ts`).

**2. `group_by` sur un champ géographique est refusé.**

```
Aggregation on geo point field is not possible.
Use the geo_cluster(point_geo, int_precision) aggregation function instead.
```

D'où l'agrégation sur les coordonnées consolidées. À noter pour plus tard :
`geo_cluster(point_geo, précision)` existe et rendrait des amas calculés côté
serveur — piste si l'index venait à trop peser.

### Ce que le seuil de 50 kW omet, et pourquoi

En deçà, on ne s'arrête pas en voyage : on se gare pour la nuit. Descendre à
toutes les bornes ferait 224 541 lignes, plusieurs mégaoctets, pour des prises
domestiques que personne ne cherche sur une carte de France. **L'interface
annonce ce seuil** : un index muet sur ce qu'il omet serait le même mensonge
que les cent bornes au hasard.

---

## Détail d'une station IRVE — ce que le fichier porte vraiment (mesuré 26/08/2026)

La couche de la carte ne demandait que six champs. Le fichier consolidé en
porte une quarantaine. Taux de remplissage relevés sur les **224 541** lignes :

| Champ | Couverture | Ce qu'on y trouve |
|---|---|---|
| `condition_acces` | **100 %** | Accès libre 198 954 · **Accès réservé 23 901 (11 %)** |
| `horaires` | 98 % | « 24/7 » 194 781 (87 %) |
| `implantation_station` | 100 % | Voirie 79 814 · parking privé 63 665 · station rapide 27 287 |
| `accessibilite_pmr` | 100 % | mais « inconnue » sur 144 646 (64 %) |
| `paiement_acte` | 100 % | oui sur 181 021 (81 %) |
| `paiement_cb` | 92 % | oui sur 74 257 (36 %) |
| `telephone_operateur` | **76 %** | 170 072 lignes, préfixées `tel:` |
| `reservation` | 100 % | oui sur 28 419 |
| `station_deux_roues` | 100 % | oui sur 5 719 |
| `gratuit` | 83 % | oui sur **679 seulement** |
| `tarification` | **24 %** | texte libre : « 0,29 €/kWh », mais aussi `https://belib.paris` |

**Trois conséquences pour l'interface.**

1. **L'accès réservé passe en tête du cartouche.** Onze pour cent des stations
   sont fermées à une flotte ou à des résidents ; les afficher comme les autres
   envoie l'usager vers une borne où il ne pourra pas brancher.
2. **Le téléphone de l'opérateur est affiché en lien `tel:`.** On le cherche
   quand la borne refuse de démarrer, généralement depuis un téléphone.
3. **La tarification est rendue TELLE QUELLE, avec sa provenance.** Un champ
   rempli une fois sur quatre, en texte libre, ne se transforme pas en prix
   affiché sans inventer une précision.

### Doublons dans le fichier

Une station relevée le 26/08 rendait **28 lignes pour 14 points de charge
déclarés**. Le dédoublonnage se fait sur `id_pdc_itinerance` ; sans lui, le
cartouche annonçait le double de bornes. Quand la somme comptée et la somme
déclarée divergent malgré tout, l'interface montre **les deux** plutôt que de
trancher pour le producteur.

---

## Caractéristiques des véhicules électriques — AUCUNE source publique (cherché 26/08/2026)

Armelin, le 25/08 : « ABRP dispose d'une base de données des véhicules ».
Recherche menée avant d'écrire quoi que ce soit à la main :

- **data.gouv.fr** : 691 jeux répondent à « véhicules électriques ». Tous
  portent sur le **parc** — immatriculations, points de charge, part dans les
  ventes. Aucun sur les **modèles**.
- **ADEME** : publie les consommations d'homologation (car labelling). La
  **capacité de batterie n'est pas une donnée d'homologation** et n'y figure
  donc pas.

Sans capacité, un catalogue est inutile à un planificateur d'autonomie. D'où
`src/lib/catalogue-vehicules.ts`, écrit à la main, quarante modèles, avec :

- la capacité **utile** (et non brute, celle de la publicité) ;
- l'autonomie **WLTP**, annoncée pour ce qu'elle est — un cycle de laboratoire ;
- un coefficient autoroutier de **0,63**, calibré sur un relevé réel (VF 8 :
  447 km WLTP annoncés, 280 km constatés) et présenté comme une **hypothèse du
  projet**, pas comme une donnée constructeur.

Le catalogue propose, la mesure dispose : chaque champ reste modifiable, et le
premier trajet réellement parcouru remplace le WLTP.

---

## Données du véhicule en direct SANS dongle — comment ABRP fait, et pourquoi nous ne pouvons pas (cherché 26/08/2026)

Armelin, le 26/08 : « ABRP propose de connecter l'application directement aux
données de sa voiture avec la version payante. Mais je ne sais pas comment ils
font sans dongle OBD. Il faut se renseigner s'il n'existe pas de service tiers
proposant les mêmes services. »

**Réponse : ils passent par les API constructeur, via des agrégateurs.**

| Voie | Ce que c'est |
|---|---|
| **Tesla** | API constructeur directe ; le propriétaire lie son compte Tesla |
| **Enode** | Agrégateur d'API constructeur ; ABRP le vend sous « Live Data » premium |
| **Tronity** | Agrégateur concurrent ; couvre notamment le groupe VW (ID.3/4/5, Born, Enyaq) |

Aucun dongle : le propriétaire **autorise l'application** sur son compte
constructeur, et l'agrégateur lit l'état de charge et la position.

**Pourquoi c'est hors de portée de ce projet en l'état — trois obstacles, dans
l'ordre de leur poids :**

1. **Il faut un secret client, donc un serveur.** L'authentification Enode se
   fait en OAuth 2.0 *client credentials* : un `client_id` ET un
   `client_secret`. Un site statique ne peut pas détenir un secret — le publier
   dans le navigateur revient à le donner. C'est exactement l'obstacle qui a
   fait écarter DATAtourisme le 25/08.
2. **Ce n'est pas gratuit en production.** Le palier d'essai d'Enode est limité
   (cinq véhicules, bac à sable) ; les identifiants de production se demandent
   commercialement. Tronity est un abonnement. La contrainte 1 du projet est
   « 0 € ».
3. **Les données du véhicule sortiraient du navigateur.** Position et état de
   charge transiteraient par un tiers. La page « Vie privée » affirme
   aujourd'hui, sans nuance, que rien ne sort. Cette phrase deviendrait fausse.

**Conclusion.** C'est faisable — mais seulement avec le backend qu'exige déjà
le niveau premium (voir `docs/premium-et-evenements.md`, §A), et cela demande
la même chose que la dérogation Open-Meteo : **une décision explicite
d'Armelin ET une mention publique**. Ce n'est pas une fonctionnalité à glisser
dans une PR ; c'est un changement de nature du produit.

Sources : [ABRP — Live data via Enode](https://abrp.featurebase.app/help/articles/3872028-live-data-via-enode),
[ABRP — Live data via Tesla](https://abrp.featurebase.app/en/help/articles/8025463-live-data-via-tesla),
[Tronity — intégration ABRP](https://help.tronity.io/hc/en-us/articles/4621326224274-How-does-the-ABRP-integration-work-and-how-can-I-set-it-up-VW-ID-series),
[Enode — tarifs](https://enode.com/pricing),
[Enode — référence API](https://developers.enode.com/api/reference).

---

## Photos des lieux d'exception — pistes mesurées (29/08/2026)

La question d'Armelin du 29/08 : afficher une ou plusieurs photos d'un
monument dans la liste des Lieux d'exception — « comment les récupérer
automatiquement et sur quelle base de données se positionner ? ». Trois
pistes sondées par appels réels, sur un échantillon de 24 monuments
CLASSÉS tirés de l'index à pas régulier (métropole) :

| Piste | Couverture mesurée | Verdict |
|---|---|---|
| **Wikimedia Commons via Wikidata** (P380 réf. Mérimée → P18 image) | **23/24 (96 %)** | vraies photos cadrées du monument (héritage « Wiki Loves Monuments ») ; sans clé, CORS `origin=*`, licences libres AVEC attribution obligatoire. MAIS fondation américaine : **dérogation souveraineté**, même chemin qu'Open-Meteo — décision d'Armelin + mention publique |
| **Panoramax** (`api.panoramax.xyz`, déjà approuvée) | 18/24 (75 %) à ≤ 150 m | photos DE RUE, pas cadrées sur le monument ; souverain, zéro décision à prendre — conviendrait à un bouton « Voir la rue », pas à illustrer une notice |
| **POP / base Mémoire** (ministère de la Culture) | — | `api.pop.culture.gouv.fr` : 404 sur les motifs documentés, AUCUN en-tête CORS ; et les photos Mémoire sont © Médiathèque du patrimoine — droits NON libres, inutilisables même si l'API répondait |

La requête Wikidata coûterait UN appel SPARQL par page de résultats (les
références en lot), puis les vignettes viennent de `upload.wikimedia.org`
(`Special:FilePath/<nom>?width=320`) — deux origines à déclarer en CSP
(connect-src + img-src), attribution (auteur, licence) affichée sous
chaque image via `extmetadata`. Frugalité : photos chargées à l'OUVERTURE
de la notice seulement, jamais en lot.

RIEN N'EST LIVRÉ : la voie à 96 % demande la dérogation. C'est une
DÉCISION d'Armelin, pas un choix technique.

## Tarifs de peage : une grille sur cinq est exploitable (mesure du 30/08/2026)

Armelin, le 30/08 : « est-ce possible d'afficher une estimation du cout en
peage sur chaque troncon ? » Sept recherches sur data.gouv.fr, et une
inspection ligne a ligne des fichiers trouves :

| Reseau | Ce qui est publie | Verdict |
|---|---|---|
| **AREA** | grille complete avec IDENTIFIANTS de gare — 955 lignes, 52 gares, 480 paires, classes 1 a 5, Licence Ouverte | **UTILISE** : index engendre (16 Ko), couvre A41, A43, A48, A49, A51 nord |
| **APRR** | grille de 21 505 lignes… **corrompue a la source** | ecartee, voir ci-dessous |
| Vinci (ASF, Cofiroute, Escota) | rien | impossible |
| Sanef, SAPN, ATMB | rien | impossible |

**LE DEFAUT D'APRR, ET POURQUOI ON NE LE REPARE PAS.** Sa colonne
`gare_sortie` porte **6 911 valeurs distinctes** la ou le reseau compte
environ deux cents gares. La cause se lit sur une ligne : le separateur
entre les deux gares est devenu une espace, et une espace INTERNE au nom de
la gare d'entree est devenue la virgule.

    attendu : MACON CENTRE,AMBERIEU,69.84,6.7,…
    publie  : MACON,CENTRE AMBERIEU,69.84,6.7,…

Les quatre millesimes publies (2023-02, 2024-09, 2025-01, 2026-02) portent le
meme defaut.

**UNE RECONSTRUCTION A ETE TENTEE, PUIS REJETEE — et c'est le point
important.** Le fichier a une structure forte (21 505 lignes = toutes les
paires de ~208 gares) qui donne un moyen de VERIFIER un decodage : chaque
paire doit apparaitre une fois et une seule. Un decodage par frequence des
suffixes rend 195 noms de gares plausibles, mais seulement **10 738 paires
distinctes sur 18 915 attendues** : la moitie des lignes se replient sur une
paire deja vue. Le decodage n'est donc pas prouve. Un tarif attribue a la
mauvaise paire serait pire que pas de tarif — c'est sur lui qu'on deciderait
d'eviter l'autoroute. Le script `scripts/generer-tarifs-peage.mjs` porte
cette mesure en commentaire, pour qu'on ne recommence pas.

A signaler au producteur : le fichier APRR redeviendrait exploitable d'un
simple export correct.

## Schémas de manœuvre : ce que le moteur ne dit pas (mesuré le 29/08/2026)

Armelin, le 29/08 : « pourquoi pas afficher des schémas complexes pour
indiquer un rond-point ou des flèches pour préciser où se placer sur la
chaussée pour tourner à une intersection ou pour sortir d'une autoroute ».
Deux mesures ont été faites sur le service d'itinéraire de la Géoplateforme
avant d'écrire la moindre ligne :

| Ce qu'il faudrait | Ce que le service donne | Verdict |
|---|---|---|
| Les VOIES d'une intersection (où se placer) | **aucun champ de voies** dans la réponse — cherché sur deux itinéraires complets, zéro occurrence de `lane`/`nb_voies` | impossible : on ne dessine pas ce qu'on ne sait pas |
| Le ROND-POINT et son numéro de sortie | le décodeur du projet sait lire `instruction.exit`… mais **le moteur n'émet jamais `roundabout` ni `rotary`** : quatre itinéraires traversant des giratoires (rocade de Rennes, Niort, Chartres, Vannes — 63 étapes) rendent `turn`, `fork`, `continue`, `end of road`, jamais un rond-point. **Revérifié le 30/08 sur les DEUX moteurs** (`bdtopo-osrm` et `bdtopo-valhalla`, même giratoire de Chartres, 9 et 7 étapes) : aucun ne le nomme | **LIVRÉ AUTREMENT** (ROND-1) : le schéma est dessiné d'après l'anneau OSM et notre tracé — voir docs/panneaux.md |
| Le NUMÉRO de la route (l'écusson des panneaux) | `attributes.name.cpx_numero` — relevé « D39 », « D415 », « D606 » | **LIVRÉ** (GUID-2) : cartouche coloré par classe de route |
| Le NUMÉRO DE SORTIE et la DESTINATION | rien dans le service d'itinéraire — mais **tout dans OpenStreetMap** (voir la correction ci-dessous) | **LIVRÉ** (SORTIE-1) |

Ce qui reste possible sans nouvelle donnée : la flèche de manœuvre (livrée),
l'écusson (livré), et la couleur de classe (livrée). Le reste attend un
moteur qui le publie — pas une invention de notre part.

### CORRECTION DU 30/08 (3) : `turn:lanes` existe, lui aussi — dans OSM

Troisième note prise en défaut le même jour, et toujours la même erreur de
méthode : il était écrit « il n'existe pas de `turn:lanes` ici ». C'était
vrai du service d'itinéraire, et faux d'OpenStreetMap — où `turn:lanes` EST
l'étiquette standard de l'affectation par voie.

Relevé le 30/08 :

| Mesure | Résultat |
|---|---|
| Chemins portant `turn:lanes*` dans Paris intra-muros | **503** |
| Le long d'un trajet de 16,5 km à travers Paris | **30** chemins |
| Manœuvres de ce trajet avec une affectation à moins de 60 m | **5 sur 17 (29 %)** |
| Valeurs les plus fréquentes | `left|through|through`, `through|through;right`, `left;through|through;right` |
| Valeur réelle du périphérique | `through|through|through|slight_right` et `|||slight_right|slight_right` |

La couverture est PARTIELLE — sept manœuvres sur dix n'en ont pas. On montre
quand on sait, on retombe sur le conseil de placement déduit (VOIE-1) sinon,
et les deux ne se ressemblent pas à l'écran.

### CORRECTION DU 30/08 (2) : « numéro de sortie » et « destination » existent — dans OSM

Deuxième note prise en défaut le même jour, et la même erreur de méthode :
elle disait « absent » après avoir cherché dans le SERVICE D'ITINÉRAIRE, sans
regarder OpenStreetMap — que ce projet consomme déjà pour les limites de
vitesse. Relevé le 30/08 sur un corridor Paris → Melun (71 km, un appel
Overpass de 19 s, rayon 40 m autour du tracé décimé) :

| Ce qu'il faut | Où c'est | Couverture relevée |
|---|---|---|
| **Numéro de sortie** | nœud `highway=motorway_junction`, étiquette `ref` | 18 nœuds numérotés sur 46 relevés — « 5 », « 1 », « 16 », « 14a » |
| **Nom de la sortie** | même nœud, étiquette `name` | « Châtillon-la-Borde », « Sens » |
| **Destinations** | bretelle `*_link`, étiquette `destination` | 82 bretelles sur le corridor ; « Lyon;Évry », « Troyes;Corbeil-Essonnes;Sénart;Melun » |
| **Route rejointe** | même bretelle, `destination:ref` | « A 6a », « N 104 » |
| Couleur réglementaire par destination | `destination:colour` | **4 bretelles sur 437** dans le carré mesuré — trop rare pour être utilisée ; la couleur se déduit de la classe (lib/panneau.ts) |

Ce qui a été ÉCARTÉ après vérification : `nat_ref`, présent sur 82 % des
bretelles, ressemble à un numéro mais n'en est pas un — ce sont des
identifiants de gestionnaire (`89A901905CD_1D`).

La couverture est PARTIELLE, et c'est la règle de la maison qui tranche : on
affiche ce qu'on a, on se tait sur le reste. Un numéro de sortie absent n'est
pas un numéro faux ; c'est un panneau qui n'en porte pas.

**UN SEUL APPEL** : ces éléments voyagent dans la même requête Overpass que
les limites de vitesse (`lib/corridor.ts`). Overpass est tenu par des
bénévoles, et le CLAUDE.md du projet en fait une règle.

### CORRECTION DU 30/08 : la ligne « aucun champ de voies » était fausse

Elle a été mesurée sur la RÉPONSE, pas sur le CATALOGUE — l'erreur de
méthode vaut d'être écrite. Le `getcapabilities` du service liste, ressource
par ressource, les `waysAttributes` qu'elle accepte :

| Ressource | `waysAttributes` acceptés | Instructions de manœuvre |
|---|---|---|
| `bdtopo-osrm` (celle du guidage) | **`name` seul** | oui — `depart`, `turn`, `fork`, `continue`… |
| `bdtopo-valhalla` | `name` seul | oui |
| `bdtopo-pgr`, `graphe_routier_*` (11 ressources) | 30 attributs, dont **`nombre_de_voies`**, `cpx_classement_administratif`, `cpx_numero_route_europeenne`, `cpx_gestionnaire`, `vitesse_moyenne_vl`, `importance` | **AUCUNE** |

Mesure du 30/08 sur `bdtopo-pgr`, Melun → Provins (59 km, réponse en 1,0 s,
203 tronçons) :

- `cpx_classement_administratif` : `Autoroute`, `Nationale/Route nommée`,
  `Départementale`, ou vide — la classe ADMINISTRATIVE, meilleure que celle
  qu'on déduit du numéro ;
- `cpx_numero_route_europeenne` : `E15/E50`, `E54` — de quoi dessiner le
  cartouche vert européen (type E41) ;
- `nombre_de_voies` : `1` à `4` — de quoi répondre un jour au « où se placer
  sur la chaussée » ;
- **`instruction` : vide sur les 203 tronçons.** Aucune manœuvre, aucun
  « tournez à droite ». Cette ressource décrit une route, elle ne guide pas.

CE QU'ON EN FAIT, ET CE QU'ON N'EN FAIT PAS. Rien aujourd'hui : basculer le
guidage sur `bdtopo-pgr` échangerait les instructions — le cœur du suivi —
contre des attributs. Les faire coexister demande DEUX itinéraires par
trajet et un appariement de géométries qui n'ont aucune raison d'être
identiques : c'est une PR à part entière, à mesurer avant de la promettre.
Le découpage des numéros européens (`routesEuropeennes`) et le cartouche
vert existent déjà, prêts, dans `src/lib/panneau.ts`.

## Feux tricolores : la donnée existe, l'optimisation non (mesuré le 30/08/2026)

Armelin : « existe-t-il un moyen d'afficher les feux rouges sur la carte,
afin de pouvoir optimiser les trajets les plus courts avec le moins de feux
rouges ? »

| Question | Réponse | Mesure |
|---|---|---|
| La donnée existe-t-elle ? | **oui** | `highway=traffic_signals` — **1 204 feux** dans un carré de Paris centre-nord, un appel Overpass de 0,8 s |
| Peut-on OPTIMISER dessus ? | **non** | le service d'itinéraire ne prend aucun coût personnalisé et ne rend pas d'alternatives (mesuré en PR #6, reconfirmé le 29/08) |
| Que peut-on faire alors ? | **compter** | les feux de chacun des trois itinéraires A/B/C déjà calculés — chiffre compté sur le tracé réel, pas estimé |

**LE PIÈGE DU COMPTAGE, et c'est le cœur du module `lib/feux.ts`** : un
carrefour à feux porte PLUSIEURS nœuds — un par branche d'accès. Compter les
nœuds donnerait quatre feux pour un seul croisement, soit un facteur trois à
quatre. On regroupe donc les nœuds proches **le long du trajet** (40 m) et
l'on compte les CARREFOURS : c'est ce qu'un conducteur compte, lui qui
s'arrête une fois.

**UN SEUL APPEL POUR LES TROIS VARIANTES** : leurs corridors se recouvrent
largement, on demande donc leur union et l'on attribue ensuite chaque feu par
la géométrie. Overpass est tenu par des bénévoles.

Limite assumée : un feu **traversé deux fois** (boucle, demi-tour) ne compte
qu'une fois — la projection retient le point le plus proche. Le cas est rare,
et le chiffre sert à COMPARER trois itinéraires, pas à promettre un décompte
exact.

## État des points de charge — IRVE dynamique (mesuré 01/09/2026)

Armelin, le 01/09 : « il existe une base de données de l'état dynamique des
bornes […] montrer les points libres ou occupés et proposer un reroutage
automatique quand une station est trop chargée, en interrogeant la base à
intervalles quand on s'en approche ».

**La base existe, elle est française, publique, gratuite et sans clé.** Elle
n'est simplement **pas vivante**, et c'est ce qui décide de tout ce qui suit.

Point d'entrée :
`https://tabular-api.data.gouv.fr/api/resources/411443b1-6667-473f-8217-1c57c167408f/data/`
— `access-control-allow-origin: *` vérifié, appelable depuis le navigateur.

| Question | Réponse | Mesure du 01/09 |
|---|---|---|
| La donnée existe-t-elle ? | **oui** | consolidation nationale, champs `etat_pdc`, `occupation_pdc`, `horodatage` |
| Est-elle en direct ? | **NON** | sur 1 400 points tirés au hasard, **aucun relevé de moins de 9,6 h** ; 45 % ont plus de sept jours |
| Couvre-t-elle le terrain ? | **en partie** | autour du Plessis-Trévise, **14 points sur 40** portent un relevé |
| Peut-on rerouter dessus ? | **non** | rerouter sur une occupation d'avant-hier détournerait quelqu'un pour rien |
| Que peut-on en faire ? | **dater** | l'état HORS SERVICE (8,5 % des points) ne se périme pas comme une place ; l'occupation ne s'affiche que datée, et pas au-delà de sept jours |

**LE PIÈGE DE LA JOINTURE, et il coûte une requête vide** : l'identifiant de
STATION n'est **pas** un préfixe de celui de ses POINTS. Mesuré : la station
`FRALLPGO000669` porte le point `FRALLEGO6000361`. Une recherche par préfixe
rend zéro. Ce sont les `id_pdc_itinerance`, et eux seuls, qui joignent le
fichier statique au fichier d'état.

**UN SEUL APPEL PAR STATION** : le filtre `id_pdc_itinerance__in` accepte la
liste entière — quarante identifiants tiennent dans une URL de 838 caractères.
Un appel par point aurait multiplié par quarante la charge pour la même
réponse. Et **jamais en boucle** : interroger « à intervalles en approchant »
redemanderait la même valeur de la veille.

Le catalogue confirme la nature du jeu : les producteurs y **déposent** des
fichiers (`IRVE Statique + Dynamique`, dépôt du 06/07 pour la partie dynamique),
ils n'y publient pas un flux. Aucune source publique française ne diffuse
l'occupation en direct à l'échelle nationale — seuls les opérateurs la
connaissent, dans leurs propres applications.

## À vérifier avant leur PR (ne pas présumer)
- Adressage « commune + mot + chiffres » (PR #18) : rien n'est encore vérifié.
