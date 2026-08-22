# Changelog — Infonovice Maps

Format : [semver] — date — résumé. Le détail vit dans les PR.

## [0.18.0] — 2026-08-22 — Mode hors ligne
- La carte déjà consultée s'ouvre sans réseau : tuiles en cache (14 jours,
  dans les bornes autorisées par l'IGN) et coquille complète précachée.
- Bandeau « Hors ligne » qui dit ce qui reste utilisable (carte vue, favoris)
  et ce qui attend le réseau (recherche, itinéraires, trafic, météo).
- Bouton d'installation de l'application, sans invite imposée.

## [0.17.0] — 2026-08-22 — Info trafic nationale
- Couche « Trafic » : les événements routiers de toute la France (Bison Futé),
  actualisés toutes les 3 minutes, avec le détail au clic.
- Reprojection Lambert-93 → WGS84 écrite à la main, sans dépendance.
- Frugalité : rien tant que la couche n'est pas cochée, et aucune requête
  quand l'onglet est en arrière-plan.

## [0.16.0] — 2026-08-22 — Météo à l'arrivée
- Section « Météo à l'arrivée » du planificateur : prévision à l'heure
  d'arrivée estimée (température, temps, pluie, vent), à la demande.
- Écart de souveraineté assumé et ÉCRIT : la prévision vient d'Open-Meteo,
  service européen — aucune source française n'est utilisable sans clé au
  navigateur (sept testées). Dit sur « À propos » et sous la prévision.

## [0.15.0] — 2026-08-22 — Photos de rue
- Panoramax : « Photos de rue » dans la popup d'appui long, visionneuse
  modale avec attribution CC-BY-SA (producteur, licence, date), Échap ferme
  et rend le focus. Un appel, et seulement sur demande.
- CSP élargie (décision tracée) : api.panoramax.xyz (recherche) et
  panoramax.openstreetmap.fr (images).

## [0.14.0] — 2026-08-22 — Sur le trajet
- Section « Sur le trajet » du planificateur : stations-service et bornes de
  recharge le long de l'itinéraire (1, 3 ou 10 km), triées par avancement,
  avec l'écart au trajet, le prix ou la puissance, et un marqueur par point.
- Frugalité : au plus six appels par recherche (plafond dur), rien tant que
  la section est fermée ; la précision vient d'un calcul local.

## [0.13.0] — 2026-08-22 — Référencement
- sitemap.xml, robots.txt, balises Open Graph et données structurées
  schema.org sur les quatre pages ; image de partage 1200x630 générée par
  script (l'encodeur PNG maison est désormais partagé avec les icônes).
- Un test unitaire tient le sitemap honnête : il échoue si une page du dépôt
  en est absente, ou s'il déclare une page qui n'existe pas.

## [0.12.0] — 2026-08-22 — Pages vitrine
- Trois pages de texte : À propos, Vie privée, Mentions légales — vraies
  pages HTML, lisibles sans JavaScript, sans script ni origine tierce.
- Pied de page discret sur la carte pour y accéder.
- Licences des sources vérifiées et citées (Licence Ouverte v2.0 Etalab pour
  les carburants et les bornes ; attribution IGN-F / Géoplateforme).

## [0.11.0] — 2026-08-22 — Favoris et portabilité des données
- Favoris : appui long → « Ajouter aux favoris », volet de gestion (aller,
  retirer), persistés en IndexedDB — jamais ailleurs.
- Export JSON intégral (favoris + préférences) et import qui restaure tout :
  la portabilité RGPD en deux boutons, sans compte, sans serveur.
- Corrigé au passage : la popup d'appui long se refermait au relâchement
  (closeOnClick) ; le volet ouvert prend l'ascendant sur la colonne.

## [0.10.0] — 2026-08-22 — Points d'intérêt
- Trois couches à la demande : carburants (prix du jour en popup), bornes de
  recharge, parkings > 500 m² — jamais sous le zoom 12, appel précédent
  annulé au déplacement, plafonds des portails affichés honnêtement.
- CSP élargie (décision tracée) : data.economie.gouv.fr,
  public.opendatasoft.com.

## [0.9.1] — 2026-08-22 — Le worker MapLibre manquait au build
- AUCUNE couche GeoJSON (tracé d'itinéraire compris) n'était rendue depuis la
  v0.5.0, production comprise — 404 silencieux du worker. Corrigé
  (`?worker&url` + setWorkerUrl) ; l'E2E vérifie désormais les PIXELS.

## [0.9.0] — 2026-08-21 — Options d'itinéraire + domaine
- **https://maps.infonovice.fr en service** (CNAME + domaine Pages + HTTPS
  forcé, build à la racine ; github.io redirige en 301).
- Étapes intermédiaires : ajout, retrait, réordonnancement par boutons
  accessibles au clavier ; marqueurs dédiés sur la carte.
- Éviter autoroutes / tunnels / ponts (contraintes vérifiées du service).
- Le lien de partage porte étapes et évitements — l'ancienne forme reste lue.

## [0.8.0] — 2026-08-21 — Feuille de route imprimable
- Étapes détaillées de l'itinéraire en français (traduction des codes OSRM,
  noms de voies BD TOPO dépliés : « R DE RIVOLI » → « Rue de Rivoli »).
- Impression de la feuille seule (rien d'autre sur la page).
- Chargée à la demande : au plus un appel par itinéraire.

## [0.7.0] — 2026-08-20 — Profil altimétrique
- Profil en long de l'itinéraire (API altimétrie Géoplateforme,
  elevationLine) : courbe SVG, dénivelés D+ / D−, altitudes min-max.
- Chargé À LA DEMANDE à l'ouverture de la section, au plus un appel par
  itinéraire — les quotas publics sont un bien commun.

## [0.6.2] — 2026-08-20 — Correctifs de mise en ligne
- Le site fonctionne sur github.io (base publique configurable, icônes du
  manifeste PWA en chemins relatifs) — première version testable en ligne.
- Le rejeu d'un lien partagé n'échoue plus quand le calcul aboutit avant le
  chargement du style (pose du tracé différée au style.load).
- E2E : tuiles IGN simulées (déterminisme, zéro quota consommé par la CI).

## [0.1.0] — 2026-08-16 — Fondations
- Scaffolding Vite + TypeScript strict + PWA (manifeste, service worker,
  icônes générées par script).
- Page « en construction » avec CSP stricte (seules origines : data.geopf.fr,
  api-adresse.data.gouv.fr) et design tokens Infonovice.
- Première brique de la bibliothèque partagée : `lib/coordonnees` (format
  français, analyse défensive).
- CI GitHub Actions : lint + typecheck + Vitest + Playwright + build + audit
  bloquant (high) + budget bundle (< 300 Ko gzippé hors MapLibre).
- Déploiement GitHub Pages automatique sur main, CNAME maps.infonovice.fr.
- Test E2E de souveraineté : la page ne contacte AUCUN domaine externe.
- Dependabot hebdomadaire (npm + actions).

## [0.2.0] — 2026-08-16 — La carte
- Carte MapLibre plein écran, fond Plan IGN v2 (WMTS Géoplateforme, sans clé),
  attribution IGN obligatoire.
- Contrôles zoom / boussole / géolocalisation / échelle, ENTIÈREMENT en
  français (locale MapLibre surchargée) — la géolocalisation est un geste de
  l'utilisateur, jamais demandée à l'arrivée.
- En-tête flottant, lien d'évitement clavier, page sans JavaScript expliquée.
- MapLibre isolé dans son propre chunk (252 Ko gzippé) ; code applicatif :
  4,2 Ko gzippé — budget respecté.
- E2E : tuiles IGN réellement servies (200), souveraineté mesurée (aucune
  origine hors liste blanche), contrôles français visibles.

## [0.3.0] — 2026-08-16 — Les fonds
- Sélecteur de fonds (premier Web Component) : Plan IGN, Satellite,
  Satellite + routes ; surcouche Parcelles cadastrales (utile à Arpentine).
- Préférence persistée en IndexedDB (`lib/stockage`, socle des favoris à
  venir) et rétablie au chargement — prouvé par E2E avec rechargement.
- Mode sombre automatique du fond Plan (filtre calibré, canevas seul) ;
  le satellite reste intouché.
- Topo 25 écarté avec preuve : SCAN25 répond 400 sans clé. À réintroduire
  après inscription Géoplateforme (gratuite).
- Deux défauts attrapés par les tests avant l'œil : l'en-tête intercepait
  les clics du sélecteur ; le panneau se reconstruisait en plein clic.

## [0.4.0] — 2026-08-16 — La recherche
- Barre de recherche BAN dans l'en-tête : combobox ARIA complète (flèches,
  Entrée, Échap, aria-activedescendant), débounce 300 ms, annulation de la
  requête précédente — le quota BAN est un bien commun.
- Sélection → marqueur + vol vers l'adresse (zoom 13 pour une commune, 17
  pour un numéro).
- Appui long (500 ms, souris comme doigt) → adresse inverse + coordonnées au
  format maison + bouton copier ; le déplacement annule l'appui.
- `lib/adresse` : timeout 5 s, UNE reprise à délai croissant, erreurs en
  français ; une frappe annulée ne se rejoue jamais. 7 tests réseau à sec.
- E2E : BAN simulée par interception (déterministe, zéro quota consommé) ;
  la sélection se prouve AU CLAVIER.

## [0.5.0] — 2026-08-16 — Le planificateur
- Itinéraire A→B (Géoplateforme bdtopo-osrm, sans clé) : voiture et à pied,
  tracé bleu à liseré blanc lisible sur tout fond, marqueurs départ/arrivée,
  distance et durée au format français, vol vers l'emprise du trajet.
- Les deux champs réutilisent le composant de recherche BAN (rien dupliqué).
- LE TRACÉ SURVIT AU CHANGEMENT DE FOND : setStyle détruit les sources,
  le panneau repose le trajet à chaque style.load — prouvé par E2E.
- Un 404 du service = « aucun itinéraire », sans seconde tentative ;
  vélo écarté avec preuve (getcapabilities : car et pedestrian seulement).
- 7 tests unitaires (formats français, 404-est-une-réponse, URL du service),
  E2E complet Paris→Lyon simulé.

## [0.6.0] — 2026-08-16 — Exporter et partager
- Export GPX 1.1 et KML 2.2 du trajet, fabriqués à la main (20 lignes chacun),
  nom échappé (il vient des libellés BAN). GPX : lat PUIS lon dans trkpt —
  l'inverse du GeoJSON, l'erreur classique, verrouillée par test.
- Partage par URL SANS serveur : l'itinéraire vit dans le fragment (#), qui
  n'est jamais envoyé au serveur HTTP. Un lien ouvert rejoue le trajet tout
  seul ; un fragment forgé rend null, jamais une exception.
- Feuille de route imprimable scindée en PR #8bis (exige getSteps).
