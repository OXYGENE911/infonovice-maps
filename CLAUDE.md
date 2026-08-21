# Projet : Infonovice Maps

## Contexte
Application web de cartographie et de planification d'itinéraires souveraine
française, hébergée sur maps.infonovice.fr. Éditeur : INFONOVICE (auto-entrepreneur,
France). Positionnement : alternative française à Google Maps, zéro tracking,
données exclusivement issues d'API publiques françaises. Le client web est la
phase 1 (vitrine + planificateur PWA). L'app Android native (Kotlin, filtrage
GNSS Galileo) sera un repo séparé en phase 2 — ne jamais mélanger les deux.

Vocation transverse : les autres produits Infonovice (arpentine.infonovice.fr,
family.infonovice.fr…) consommeront à terme les mêmes briques. Phase 1 : le
client web expose ses modules (géocodage, itinéraire, carte) comme une petite
bibliothèque interne `/src/lib/` réutilisable — pas de backend.

## Contraintes ABSOLUES (jamais de dérogation)
1. Coût de production : 0 €. Aucun service payant, aucun backend, aucune BDD serveur.
2. Hébergement : GitHub Pages (repo public) + CNAME maps.infonovice.fr.
   Build et CI exclusivement via GitHub Actions (tier gratuit).
3. Souveraineté : API publiques françaises ou open data français par défaut.
   UNE dérogation existe, décidée par Armelin le 22/08/2026 et écrite sur la
   page publique « À propos » : les prévisions météo viennent d'Open-Meteo
   (européen), aucune source française n'étant utilisable sans clé au
   navigateur (huit testées, preuves dans docs/apis.md). Toute autre
   dérogation demande la même chose : une décision explicite ET une mention
   publique. Le reste : uniquement des API publiques françaises ou de l'open data
   français. INTERDITS : Google (Maps, Fonts, Analytics), AWS, Azure CDN,
   tout tracker tiers, tout cookie non essentiel.
4. RGPD by design : aucune donnée utilisateur ne quitte le navigateur.
   Favoris, historique, préférences → IndexedDB local uniquement, avec
   export/import JSON manuel.
5. Open source : licence AGPL-3.0, code lisible, commits en français.

## Stack imposée
- Vite + TypeScript strict + PWA (vite-plugin-pwa, service worker offline)
- MapLibre GL JS pour le rendu carte (JAMAIS Mapbox GL v2+, licence propriétaire)
- Zéro framework lourd par défaut : vanilla TS + Web Components.
  Si un framework devient nécessaire, proposer et justifier avant (Preact max).
- CSS : vanilla + custom properties, design tokens dans /src/styles/tokens.css
- Tests : Vitest (unitaires) + Playwright (E2E) — chaque PR inclut ses tests

## API à consommer (toutes gratuites, documenter chaque quota dans /docs/apis.md)
- Tuiles & fonds de carte : Géoplateforme IGN (WMTS + tuiles vectorielles)
  https://data.geopf.fr — flux essentiels sans clé
- Géocodage / autocomplétion : API Adresse BAN https://api-adresse.data.gouv.fr
- Itinéraires : API itinéraire Géoplateforme (moteurs OSRM/Valhalla IGN)
- Altimétrie : API altimétrie Géoplateforme
- Street view : API Panoramax https://api.panoramax.xyz
- Météo : Météo-France open data (via meteo.data.gouv.fr)
- Transports : transport.data.gouv.fr (GTFS/GTFS-RT)
- Carburants : prix-carburants.gouv.fr ; bornes IRVE : open data IRVE
- POI complémentaires : Overpass API OSM (avec cache local agressif,
  respecter l'usage policy)

## Règles de résilience API
- Toujours un timeout + retry exponentiel + message d'erreur utilisateur en français
- Cache : service worker (stale-while-revalidate) pour tuiles et POI
- Ne JAMAIS marteler les API publiques : debounce sur l'autocomplétion (300 ms),
  throttle sur les recalculs. Ces quotas sont un bien commun.

## Workflow Git (STRICT)
- main = production (déployée auto sur GitHub Pages). Branche protégée.
- 1 fonctionnalité = 1 branche feat/xxx = 1 Pull Request. Jamais de commit direct sur main.
- Chaque PR contient : le code, les tests, la mise à jour de /docs/CHANGELOG.md,
  et une description PR en français (Quoi / Pourquoi / Comment tester).
- Commits : Conventional Commits en français (feat:, fix:, docs:, chore:).
- CI GitHub Actions sur chaque PR : lint (ESLint) + typecheck + tests + build.
  Une PR ne se merge que si la CI est verte.
- Après chaque merge : tag de version (semver) si fonctionnalité visible.

## Qualité
- Lighthouse ≥ 90 sur Performance, Accessibilité, Best Practices, SEO
- Accessibilité : navigation clavier complète, ARIA sur les contrôles carte,
  contrastes AA
- i18n prévu dès le départ (fichiers fr.json), français par défaut
- Budget bundle : < 300 Ko gzippé hors MapLibre. Vérifier à chaque PR.
- Sécurité : CSP stricte dans les meta, aucune eval, dépendances auditées
  (npm audit en CI), Dependabot activé

## Ce que Claude Code doit faire à chaque session
1. Lire ce fichier + /docs/ROADMAP.md pour connaître la prochaine PR
2. Annoncer le plan de la PR avant de coder
3. Coder, tester, mettre à jour la doc
4. Préparer la description de PR
5. Ne JAMAIS entamer la PR suivante sans validation explicite
   (exception : une session explicitement mandatée « en autonomie » par
   Armelin peut enchaîner les PR dont la CI est verte, en le consignant)
