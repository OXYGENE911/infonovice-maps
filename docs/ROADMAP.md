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
- [ ] PR #15 — Transports en commun : GTFS des principales agglos
- [ ] PR #16 — GTFS-RT temps réel là où disponible

## Offline & PWA avancée
- [ ] PR #17 — Mode hors ligne : cache des tuiles + install PWA + page offline
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
