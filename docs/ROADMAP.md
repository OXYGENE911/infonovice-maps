# Roadmap — Infonovice Maps

Chaque ligne = une PR. Prompt court : « Implémente la PR #N de la roadmap ».
États : [ ] à faire · [~] en cours · [x] fusionnée.

## Fondations
- [x] PR #1 — Scaffolding : Vite + TS + PWA + ESLint + Vitest + Playwright +
      GitHub Actions (CI + déploiement Pages) + CNAME maps.infonovice.fr +
      page « en construction »
- [x] PR #2 — Carte MapLibre plein écran avec fond IGN Plan, contrôles
      zoom/boussole/géolocalisation navigateur, design tokens Infonovice
- [x] PR #3 — Sélecteur de fonds : Plan IGN / Satellite / Satellite+routes,
      surcouche Cadastre, mode sombre auto (fond plan). Topo 25 ÉCARTÉ :
      vérifié le 16/08, la couche SCAN25 répond 400 sans clé Géoplateforme —
      l'inscription (gratuite) est une démarche à faire par Armelin ; la
      roadmap la reprendra ensuite.
- [x] PR #4 — Recherche d'adresse avec autocomplétion BAN + géocodage inverse
      au long-press + affichage coordonnées

## Navigation (planificateur)
- [x] PR #5 — Calcul d'itinéraire A→B voiture/piéton via API Géoplateforme,
      tracé sur carte, distance/durée. VÉLO ÉCARTÉ avec preuve : le
      getcapabilities du service (16/08) n'offre que `car` et `pedestrian` —
      aucun moteur public IGN ne porte de profil vélo. À réintroduire via un
      moteur souverain à trouver (BRouter auto-hébergé = backend, hors 0 €).
- [x] PR #6 — Options d'itinéraire : étapes intermédiaires (ajout/retrait/
      réordonnancement par boutons ↑↓ — accessibles au clavier, là où le
      drag & drop de l'intitulé initial ne l'est pas) + éviter autoroutes/
      tunnels/ponts, le tout porté par le lien de partage. TROIS ÉCARTS avec
      preuve (getcapabilities du 21/08) : les PÉAGES n'existent sur aucun
      moteur public (seule clé waytype : autoroute|tunnel|pont) ; les
      itinéraires ALTERNATIFS ne sont pas un paramètre du service ; le
      drag & drop est remplacé par des boutons pour l'accessibilité.
- [x] PR #7 — Profil altimétrique de l'itinéraire (elevationLine, chargé À LA
      DEMANDE à l'ouverture de la section — un appel par itinéraire au plus)
- [x] PR #8 — Export GPX/KML + partage d'itinéraire par URL encodée (aucun
      serveur : tout vit dans le fragment #, jamais envoyé au serveur HTTP).
      La FEUILLE DE ROUTE IMPRIMABLE est scindée en PR #8bis : elle exige les
      étapes détaillées du service (getSteps), un chantier à part entière.
- [x] PR #8bis — Feuille de route imprimable : étapes getSteps traduites en
      français (codes OSRM), noms BD TOPO dépliés, impression sans rien
      d'autre sur la page — chargée à la demande, un appel par itinéraire

## POI & profil local
- [x] PR #9 — Couches POI : carburants (prix du jour), bornes IRVE
      (consolidé Etalab via public.opendatasoft.com — ODRE écarté avec preuve :
      figé 2019, coordonnées inversées), parkings > 500 m² (WFS Géoplateforme).
      Chargement à la demande, zoom ≥ 12, appel précédent annulé, plafond des
      portails affiché honnêtement (« 100 sur N »)
- [x] PR #10 — Favoris en IndexedDB (appui long → « Ajouter aux favoris »,
      volet de gestion, vol vers le lieu) + export/import JSON intégral
      (favoris + préférences — la portabilité RGPD en deux boutons) + la
      promesse « Vos données ne quittent jamais ce navigateur » affichée en
      toutes lettres (la page vitrine complète arrive en PR #19)
- [x] PR #11 — Recherche le long de l'itinéraire : stations-service et
      bornes à moins de 1/3/10 km du TRACÉ (pas de l'écran), triées par
      avancement, avec l'écart au trajet et le prix. Le trajet est découpé en
      SIX tronçons au plus — six appels par recherche, plafond dur — et la
      précision vient d'un filtre local exact (distance point-polyligne), pas
      d'une rafale de requêtes.

## Panoramax & météo
- [x] PR #12 — Photos de rue Panoramax (le commun français d'imagerie de
      rue) : bouton « Photos de rue » dans la popup d'appui long, visionneuse
      modale avec attribution CC-BY-SA obligatoire (producteur, licence,
      date), fermeture à Échap et focus rendu. À LA DEMANDE seulement — aucun
      appel tant que l'usager ne clique pas.
- [x] PR #13 — Météo à L'HEURE D'ARRIVÉE estimée (départ maintenant + durée
      du trajet), à la demande, un appel par itinéraire. ÉCART DE
      SOUVERAINETÉ ASSUMÉ : source Open-Meteo (service européen allemand) —
      décision d'Armelin du 22/08 après que huit sources françaises se sont
      révélées inutilisables (clé obligatoire, pas de CORS, ou données
      figées ; preuves dans docs/apis.md). L'écart est écrit sur la page
      « À propos » ET sous la prévision. Les VIGILANCES Météo-France restent
      hors de portée (clé) : non promises dans l'interface.

## Transports & trafic
- [x] PR #14 — Couche info trafic NATIONALE (Bison Futé, ministère chargé
      des transports) : travaux, accidents, coupures, bouchons, intempéries,
      rafraîchis toutes les 3 minutes — et seulement si la couche est active
      ET l'onglet visible. Reprojection Lambert-93 → WGS84 écrite à la main
      (aucune dépendance), validée sur l'origine conventionnelle et par
      contrôle départemental. Détail au clic, réduit en texte.
      À FAIRE PLUS TARD : les fluidités d'agglomération (Bordeaux, Nantes,
      Rennes) fonctionnent aussi — sources listées dans docs/apis.md.
- [~] PR #15 — GTFS statique des agglos : ABANDONNÉ, avec la mesure. Le
      fichier national consolidé des arrêts pèse 578 Mo (GeoPackage) ou 302 Mo
      (GeoJSON compressé) ; un seul réseau moyen, 11,5 Mo à décompresser et
      indexer dans le navigateur. Sans serveur pour le pré-mâcher — et le
      projet n'en veut pas — horaires et arrêts ne sont pas tenables. Écrit
      dans docs/apis.md, sur la page « À propos » et dans le volet lui-même,
      plutôt que promis à moitié.
- [x] PR #16 — Transports en commun EN DIRECT : la position des bus, cars et
      trams (GTFS-RT), 44 réseaux relayés avec CORS par le Point d'Accès
      National. Décodeur protobuf minimal écrit à la main (moins de 2 Ko,
      contre ~120 Ko pour gtfs-realtime-bindings), éprouvé sur des captures
      réelles ET sur des octets hostiles (varint sans fin, longueur
      mensongère, type inconnu). Table des emprises engendrée par script et
      versionnée : la CI ne dépend d'aucun tiers. Frugalité : rien sans la
      case, jamais sous le zoom 10, trois réseaux au plus, un frein qui
      empêche un déplacement de relancer un appel, arrêt en arrière-plan.
      Positions de plus de dix minutes écartées — une carte du direct ne
      montre pas des véhicules rentrés au dépôt.
      CE QUE LA MESURE DU TERRAIN A CORRIGÉ (44 flux, 416 véhicules, le
      22/08 à 06 h 15 — détail chiffré dans docs/apis.md) : Brest publie
      `timestamp: 0` et disparaissait entièrement (0 sur 27) ; un quart des
      lignes s'affichaient en identifiant NeTEx ; trois réseaux sur neuf
      publient des km/h là où la spécification dit des m/s, si bien qu'AUCUNE
      vitesse chiffrée n'est affichée ; l'agrégat normand republie les
      véhicules de ses membres et n'est donc plus jamais interrogé avec eux ;
      le rectangle d'une région couvrait des villes qu'elle ne dessert pas,
      remplacé par une couverture en bandes de 0,2°.
      DEUX REVUES ADVERSES, et la seconde a trouvé des défauts DANS les
      correctifs de la première : le frein anti-rafale laissait la couche morte
      trente secondes après une hésitation sur la case ou un aller-retour de
      zoom (il borne désormais les requêtes, jamais l'affichage) ; le
      dédoublonnage par identifiant effaçait onze véhicules réels de réseaux
      distincts qui numérotent tous « 1, 2, 3 » ; et écarter les horodates
      d'avant 2020 transformait une position de 2017 en « vue à l'instant ».
      Morale consignée : corriger un défaut est un changement comme un autre,
      il se relit avec la même sévérité.

## Offline & PWA avancée
- [x] PR #17 — Mode hors ligne : cache des tuiles IGN (CacheFirst, 14 jours,
      UNE RÉSERVE PAR COUCHE — 400 plan, 250 satellite, 150 routes, 150
      cadastre, DANS les bornes que le serveur annonce lui-même :
      `private, max-age=1814400`), type MIME vérifié avant mise en cache,
      coquille complète précachée, bandeau qui dit HONNÊTEMENT ce qui marche
      sans réseau et ce qui l'attend, bouton d'installation PWA.
      ÉCART ASSUMÉ, mesuré le 22/08 : aucun outil de Playwright ni de CDP ne
      coupe le réseau du SERVICE WORKER en laissant la page demander
      (`setOffline` n'atteint que la page ; `route(abort)` n'intercepte pas
      le worker ; `setBlockedURLs` bloque en amont de lui ;
      `clearBrowserCache` efface aussi le Cache Storage). Le test E2E prouve
      donc les deux moitiés séparément : la coquille se recharge sans réseau
      de page, et les tuiles vues sont dans la réserve du worker, relisibles,
      signature PNG vérifiée. Le service, lui, est le travail de workbox.
- [ ] PR #18 — Adressage « commune + mot + chiffres » (alternative What3Words)

## Vitrine & B2B
- [x] PR #19 — Pages vitrine : « À propos » (manifeste de souveraineté,
      sources et licences vérifiées), « Vie privée » (ce qui est stocké, où,
      comment l'exporter et l'effacer), « Mentions légales » (éditeur repris
      des mentions d'infonovice.fr, hébergeur GitHub Pages, AGPL,
      attributions). VRAIES pages HTML multi-entrées Vite, ZÉRO JavaScript —
      un parcours E2E le prouve (aucun script, aucune origine tierce, aucun
      cookie). L'accueil marchand séparé n'est pas retenu : la carte EST
      l'accueil.
- [ ] PR #20 — Page « Offre flottes B2B » + formulaire de contact
- [x] PR #21 — Référencement : sitemap.xml, robots.txt, Open Graph et
      JSON-LD (WebApplication / AboutPage) sur les quatre pages, image de
      partage 1200x630 GÉNÉRÉE par script (aucun binaire opaque au dépôt).
      Un test unitaire compare le sitemap aux pages réelles : une page qui
      naît hors du sitemap ou sans canonical fait échouer la CI.

## Limites connues, à traiter plus tard
- Les photos Panoramax sont souvent des panoramas 360° (équirectangulaires) :
  la visionneuse les affiche À PLAT, donc très larges et déformées. Un vrai
  visualiseur 360 demanderait une bibliothèque supplémentaire — à peser
  contre le budget bundle (< 300 Ko hors MapLibre).

## Itérations suivantes (backlog ouvert)
- PR #22+ — Signalements communautaires (premier backend, hors périmètre 0 €),
  zones de danger, planificateur EV…
