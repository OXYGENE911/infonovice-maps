# Roadmap — Infonovice Maps

Chaque ligne = une PR. Prompt court : « Implémente la PR #N de la roadmap ».
États : [ ] à faire · [~] en cours · [x] fusionnée.

## Fondations
- [ ] PR #1 — Scaffolding : Vite + TS + PWA + ESLint + Vitest + Playwright +
      GitHub Actions (CI + déploiement Pages) + CNAME maps.infonovice.fr +
      page « en construction »
- [ ] PR #2 — Carte MapLibre plein écran avec fond IGN Plan, contrôles
      zoom/boussole/géolocalisation navigateur, design tokens Infonovice
- [ ] PR #3 — Sélecteur de fonds : Plan IGN / Ortho satellite / Topo 25 /
      mode sombre auto
- [ ] PR #4 — Recherche d'adresse avec autocomplétion BAN + géocodage inverse
      au long-press + affichage coordonnées

## Navigation (planificateur)
- [ ] PR #5 — Calcul d'itinéraire A→B voiture/piéton/vélo via API
      Géoplateforme, tracé sur carte, distance/durée
- [ ] PR #6 — Itinéraires alternatifs + options éviter péages/autoroutes +
      waypoints multiples (drag & drop)
- [ ] PR #7 — Profil altimétrique de l'itinéraire (API altimétrie)
- [ ] PR #8 — Feuille de route imprimable + export GPX/KML + partage
      d'itinéraire par URL encodée (aucun serveur)

## POI & profil local
- [ ] PR #9 — Couches POI : carburants (avec prix), bornes IRVE, parkings
- [ ] PR #10 — Favoris et listes de POI en IndexedDB + export/import JSON +
      page « Vos données ne quittent jamais ce navigateur »
- [ ] PR #11 — Recherche le long de l'itinéraire

## Panoramax & météo
- [ ] PR #12 — Visionneuse Panoramax
- [ ] PR #13 — Météo à destination + vigilances Météo-France en bandeau

## Transports & trafic
- [ ] PR #14 — Couche info trafic / travaux (open data)
- [ ] PR #15 — Transports en commun : GTFS des principales agglos
- [ ] PR #16 — GTFS-RT temps réel là où disponible

## Offline & PWA avancée
- [ ] PR #17 — Mode hors ligne : cache des tuiles + install PWA + page offline
- [ ] PR #18 — Adressage « commune + mot + chiffres » (alternative What3Words)

## Vitrine & B2B
- [ ] PR #19 — Pages vitrine : accueil, manifeste souveraineté, FAQ RGPD,
      mentions légales, lien GitHub
- [ ] PR #20 — Page « Offre flottes B2B » + formulaire de contact
- [ ] PR #21 — SEO : sitemap, meta OG, schema.org

## Itérations suivantes (backlog ouvert)
- PR #22+ — Signalements communautaires (premier backend, hors périmètre 0 €),
  zones de danger, planificateur EV…
