# Changelog — Infonovice Maps

Format : [semver] — date — résumé. Le détail vit dans les PR.

## [0.26.0] — 2026-08-25 — Les bornes portent leur puissance (PR #26)

- Un à trois éclairs sur chaque borne : jusqu'à 50 kW, de 50 à 150, au-delà.
  Ce que l'usager cherche des yeux n'est pas l'enseigne mais « puis-je
  recharger vite ici » — un logo de réseau l'oblige à savoir ce que ce réseau
  déploie.
- LES ICÔNES SONT DESSINÉES PAR LE CODE, sur un canevas, au démarrage. Le
  style n'embarque ni glyphes ni sprites (choix de la PR #2), et un PNG déposé
  au dépôt serait un binaire opaque — ce que la PR #21 s'interdit. Ce fichier
  se relit, se corrige et se voit en revue.
- Une puissance non déclarée porte une pastille NEUTRE, pas un éclair : une
  borne dont le producteur n'a rien dit ne doit pas se déguiser en borne lente.
- Le palier est écrit en toutes lettres dans la popup, avec le réseau et les
  connecteurs : les éclairs se voient, un lecteur d'écran ne voit rien.
- Une légende explique la lecture de la carte, sous les filtres.

## [0.25.0] — 2026-08-25 — Domicile et travail (PR #25)

- Deux repères à rôle unique, distincts des favoris : un favori est une
  collection ouverte que l'usager nomme, un repère est un rôle que
  l'application CONNAÎT. « Rentrer chez moi » doit être un geste, pas une
  recherche dans une liste.
- Ils se définissent par appui long, comme un favori, et le bouton n'ouvre
  qu'une fois l'adresse tranchée — sans quoi « chez moi » se figerait sous des
  coordonnées brutes.
- Tant qu'un repère n'est pas défini, l'interface écrit « non défini » plutôt
  que de se taire : une section vide n'apprend rien à personne.
- Ils vivent dans les préférences locales, donc dans l'export/import JSON de
  la PR #10 : ils suivent l'usager d'un appareil à l'autre sans qu'aucun
  serveur n'apprenne où il habite. C'est précisément la donnée qu'on ne
  confierait à personne.
- La validation n'accepte QUE les propriétés propres : un objet forgé par
  `Object.create({ lon, lat })` passait pour un repère valide. C'est le défaut
  attrapé à la revue du 22/08 sur les préférences POI, et il se reproduit
  partout où l'on lit une valeur venue du dehors.

## [0.24.0] — 2026-08-25 — Profil du véhicule et rayon d'action (PR #23-24)

- Un panneau « Véhicule » : batterie, santé (SOCE), charge (SOC) et autonomies
  constatées. TOUT RESTE DANS LE NAVIGATEUR — aucun compte, aucun serveur,
  comme les favoris de la PR #10.
- ON DEMANDE DES KILOMÈTRES, PAS DES kWh/100 km. Personne ne connaît sa
  consommation ; tout le monde sait jusqu'où il va avec une charge. Les
  consommations s'en déduisent, à un seul endroit — deux saisies pourraient se
  contredire.
- Trois anneaux d'autonomie sur la carte : ville, route, autoroute. Ce sont de
  vrais cercles GÉODÉSIQUES, pas des cercles en pixels : chaque sommet est à
  moins de 500 m du rayon demandé, vérifié jusqu'à la latitude de Dunkerque où
  un cercle tracé à l'écran se serait effondré.
- L'USURE SE DIT EN KILOMÈTRES : « 5,3 kWh perdus, soit environ 18 km
  d'autoroute » plutôt que « SOCE 94 % », qui ne dit rien à personne.
- ET CE QUE LE MODÈLE IGNORE EST ÉCRIT SOUS LE BILAN : ni le relief, ni le
  vent, ni la conduite. Tant qu'aucun véhicule n'est saisi, aucun anneau n'est
  dessiné — inventer une « voiture moyenne » afficherait un rayon crédible et
  faux.
- Le modèle est étalonné sur un véhicule RÉEL et ses relevés au compteur : une
  VinFast VF8, 87,7 kWh, SOCE 94 %, 400 km en ville, 280 sur autoroute. Le
  calcul les retrouve à quelques kilomètres près.

## [0.23.0] — 2026-08-25 — Filtres des bornes de recharge (PR #22)

- Les bornes se filtrent par PUISSANCE minimale (22 / 50 / 150 / 300 kW) et
  par CONNECTEUR accepté (CCS Combo, Type 2, CHAdeMO, prise domestique). Les
  champs existaient depuis toujours dans le jeu IRVE consommé par la PR #9 :
  l'application ne les demandait simplement pas.
- LES FILTRES PARTENT AU SERVICE, ils ne trient pas l'acquis. Le portail
  plafonne à 100 enregistrements : filtrer localement aurait trié un ensemble
  DÉJÀ TRONQUÉ et montré trois bornes CCS là où la zone en compte cinquante.
  Ce n'est pas une optimisation, c'est une question de justesse.
- Les connecteurs partent en OU : un véhicule accepte l'un OU l'autre, et
  exiger qu'une même borne les porte tous ne rendrait presque rien.
- Le réseau et les prises de chaque borne sont désormais rendus. L'ENSEIGNE
  prime sur l'opérateur — c'est le nom peint sur la borne, celui qu'on cherche
  des yeux depuis la route ; l'opérateur est souvent une société technique
  dont le nom ne figure nulle part.
- TROIS DÉFAUTS TROUVÉS PAR LES TESTS, aucun visible à l'œil : le champ du
  Type 2 s'appelle `prise_type_2` et non `prise_type_2` déduit du motif — un
  champ inexistant ne renvoie rien plutôt qu'une erreur ; la restauration
  asynchrone des préférences écrasait un réglage fait entre-temps ; et le
  seuil anti-rechargement avalait les changements de filtre, si bien que
  cocher « CCS Combo » ne changeait rien à l'écran.
- Le filtre par RÉSEAU n'est pas livré : il demande une requête de facettes
  pour proposer les enseignes présentes dans la vue. Promis à personne.

## [0.22.1] — 2026-08-25 — Montées de version : sept sur huit

- Vite 8, ESLint 10, `@types/node` 26 et les quatre actions GitHub
  (checkout v7, setup-node v7, upload-pages-artifact v5, deploy-pages v5)
  passent : 253 tests unitaires, 44 parcours E2E, lint et build verts.
- Vite 8 a exigé une migration : Rollup n'accepte plus `manualChunks` en
  objet. La forme fonction remplace `{ maplibre: ['maplibre-gl'] }`, et
  MapLibre reste isolé dans son morceau (251,7 Ko gzippés) — le budget
  applicatif des 300 Ko n'est pas entamé.
- TYPESCRIPT 7 EST REFUSÉ, avec sa preuve : `typescript-eslint does not
  support TS 7.0`. La chaîne de lint le bloque, pas notre code. La montée
  attendra que `typescript-eslint` suive ; TypeScript reste en 5.9.3.

## [0.22.0] — 2026-08-25 — Ergonomie : trois zones, plus de superposition

- Les six pastilles flottantes de gauche devenaient un piège : le panneau
  ouvert se posait SUR les boutons voisins, au point qu'ils n'étaient plus
  seulement masqués mais INATTEIGNABLES — Playwright n'arrivait plus à cliquer
  « Favoris » quand « Autour » était ouvert. Les panneaux sont désormais en
  flux : ils poussent la colonne au lieu de la recouvrir.
- Échap et un clic à côté referment le panneau. Un menu qu'on ouvre à la
  souris et qu'on ne peut pas fermer au clavier n'est pas accessible.
- Le fond de carte rejoint le coin bas-droit, avec les réglages d'affichage.
  Le rail de gauche ne répond plus qu'à « où vais-je, que voir autour ».
- Les liens légaux ne se posent plus sur l'attribution IGN — obligation de la
  Géoplateforme, pas un ornement. Leur décalage était un nombre magique calé
  sur une attribution d'une ligne ; il est maintenant MESURÉ, comme l'est la
  hauteur de l'en-tête depuis la PR #3.
- Ce que la mesure a corrigé en cours de route : se caler sur la hauteur de
  l'attribution laissait deux pixels de recouvrement (elle garde 10 px de
  marge propre — c'est son SOMMET qu'il faut dégager) ; et dégager
  l'attribution posait aussitôt le pied sur le bouton « Fonds » fraîchement
  déplacé. Les liens sont passés à gauche : une séparation structurelle plutôt
  qu'un équilibre de pixels entre trois voisins.
- Six parcours E2E comparent des BOÎTES ENGLOBANTES : ce que l'œil voit se
  prouve par des rectangles, pas par des captures d'écran.

## [0.21.1] — 2026-08-24 — Consignes des agents : une seule source

- `CLAUDE.md` devient la source unique des règles du projet. `AGENTS.md`
  (Codex) et `GEMINI.md` (Gemini) n'y renvoient et ne portent plus que le
  mandat propre à chaque contradicteur : Gemini attaque le plan avant le
  code, Codex attaque le diff après.
- Un test unitaire fait échouer la CI si l'un des deux pointeurs se remet à
  recopier une contrainte : trois fichiers de consignes qui se ressemblent
  finissent par diverger, et une règle corrigée à un seul endroit devient
  un mensonge aux deux autres.
- Aucun octet ajouté au bundle : c'est de la documentation et un test.

## [0.21.0] — 2026-08-22 — Page « Professionnels »

- Une page pour les flottes et les équipes de terrain : ce que la carte sait
  faire pour elles (adresses de sites sans rue, hors ligne quatorze jours,
  tournées à six étapes, trafic, transports en direct) — et, en aussi gros,
  CE QU'ELLE NE FAIT PAS : ni suivi de véhicule, ni optimisation de tournée,
  ni horaires de transport, ni comptes d'équipe. Personne ne doit découvrir
  la limite un mardi matin.
- Le contact passe par la messagerie de l'usager, pas par un serveur. Il n'y
  a pas de formulaire sur cette page, et c'est le sujet : un formulaire
  enverrait la saisie quelque part, ce que ce site ne fait nulle part
  ailleurs. Ces pages interdisent d'ailleurs le script et l'envoi de
  formulaire dans leur propre CSP.
- Aucun tarif, aucun engagement de service, aucune référence client : rien
  n'a été inventé faute de décision.

## [0.20.0] — 2026-08-22 — Adresse en mots

- Tout point de France a désormais une adresse dictable : « Dijon-21 BAKE 4831 ».
  Un appui long sur la carte la donne et la copie ; la barre de recherche la
  comprend et y vole. Une cabane, un champ, une entrée de service : ce que la
  Base Adresse Nationale ne nomme pas, ce format le désigne à 10 m près.
- Le format tient en trois morceaux : la commune et son département, un mot
  parmi 2 048 (consonne-voyelle, prononçables, sans mot malheureux ni doublon
  visuel), et quatre chiffres. Rien d'autre à retenir, rien à installer.
- Réversible et STABLE : l'adresse ne dépend que du centre officiel de la
  commune. Une adresse dictée aujourd'hui désigne le même endroit dans dix ans,
  sans serveur, sans compte, sans licence — contrairement aux formats
  propriétaires équivalents.
- La Corse écrit son département 2A et 2B, pas un nombre : le format le lit
  comme les autres, en majuscule comme en minuscule.
- Refuse plutôt que de mentir : au-delà de 20,48 km du centre de la commune, le
  codage s'arrête et le dit. Les six couples nom/département ambigus (tous
  outre-mer) sont proposés à l'usager, jamais arbitrés.
- Le répertoire des communes vient de `geo.api.gouv.fr` : deux appels par
  adresse, aucun tant que l'usager n'en demande pas. Les 34 969 communes
  pèseraient 3,3 Mo — plus que le budget entier du paquet.

## [0.19.0] — 2026-08-22 — Transports en commun, en direct
- Volet « Transports » : la position des bus, cars et trams telle que les
  réseaux la publient (GTFS-RT), pour 44 réseaux français. Clic sur un
  véhicule : ligne, destination, vitesse et fraîcheur de la position.
- Décodeur protobuf écrit à la main, moins de 2 Ko : la bibliothèque de
  référence en aurait coûté 120, pour lire quatre champs.
- Frugalité : rien tant que la case n'est pas cochée, jamais sous le zoom 10,
  trois réseaux au plus par vue, un frein qui empêche un déplacement, une
  hésitation sur la case ou un aller-retour de zoom de relancer un appel, et
  plus rien dès que l'onglet passe en arrière-plan. Un service en panne est
  MOINS sollicité qu'un service sain, jamais plus.
- Les réseaux sont choisis sur les communes qu'ils desservent, pas sur un
  rectangle : regarder Rennes n'interroge plus le car des Pays de la Loire
  garé à 97 km.
- Le frein borne les REQUÊTES, jamais l'affichage : décocher puis recocher la
  case, ou revenir d'un zoom arrière, réaffiche aussitôt ce qu'on venait de
  voir, sans un appel de plus.
- Un agrégat régional republie les véhicules de ses réseaux membres : quand les
  deux sont affichés, le volet PRÉVIENT qu'un même véhicule peut apparaître
  deux fois. On ne l'efface pas — aucune clé ne le permet sûrement, et trois
  ont été essayées puis abandonnées sur mesure. Effacer un bus qui roule est
  pire que d'en dessiner un en double.
- Honnêteté : les positions de plus de dix minutes sont écartées, le compte
  distingue la vue du réseau entier et suit la carte, une source qui ne répond
  pas n'est pas maquillée en « aucun véhicule », tous les réseaux muets sont
  nommés, et le volet DIT ce qu'il ne montre pas — ni horaires ni arrêts,
  faute de serveur pour digérer des GTFS de dizaines de mégaoctets.
- Aucune vitesse chiffrée : trois réseaux sur neuf publient des km/h là où la
  spécification dit des m/s, et rien ne permet de les distinguer. Seul
  « à l'arrêt » est affiché — il se lit pareil dans les deux unités.

## [0.18.0] — 2026-08-22 — Mode hors ligne
- La carte déjà consultée s'ouvre sans réseau : tuiles en cache (14 jours,
  dans les bornes autorisées par l'IGN) et coquille complète précachée.
- UNE RÉSERVE PAR COUCHE (plan, satellite, routes, cadastre) : avec un
  plafond commun, une flânerie en satellite chassait les tuiles du plan que
  le bandeau promet pourtant de garder.
- Le TYPE MIME est vérifié avant toute mise en cache : une page de blocage
  rendue en « 200 text/html » par un portail captif s'écrivait dans le cache
  et se resservait 14 jours, réseau revenu.
- Bandeau « Hors ligne » qui dit ce qui reste utilisable (carte vue, favoris)
  et ce qui attend le réseau — la liste nomme AUSSI les points d'intérêt et
  les photos de rue, et se termine par sa règle plutôt que par une
  énumération qu'on pouvait croire complète. La région live se remplit à la
  coupure, sans quoi les lecteurs d'écran n'annonçaient rien.
- L'en-tête s'enroule et ne pousse plus le champ de recherche hors de
  l'écran ; les volets de la carte suivent sa hauteur réelle au lieu d'un
  décalage figé qui les laissait recouverts.
- La page « Vie privée » dit ce que ce cache est : une trace des endroits
  regardés, sur l'appareil, quatorze jours, et comment l'effacer.
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
