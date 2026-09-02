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
      véhicules de ses membres, dédoublonnés à l'affichage (voir plus bas) ;
      le rectangle d'une région couvrait des villes qu'elle ne dessert pas,
      remplacé par une couverture en bandes de 0,2°.
      TROIS REVUES ADVERSES, chacune trouvant des défauts DANS les correctifs
      de la précédente — 17, puis 11, puis 10 :
      · le frein anti-rafale laissait la couche morte trente secondes après une
        hésitation sur la case ou un aller-retour de zoom (il borne désormais
        les requêtes, jamais l'affichage) ;
      · le dédoublonnage par identifiant SEUL effaçait onze véhicules réels de
        réseaux distincts qui numérotent tous « 1, 2, 3 » ;
      · écarter l'agrégat pour éviter ces doublons faisait perdre 64 % de ses
        véhicules — au Havre, 44 bus roulaient et le volet disait « aucun » ;
      · écarter les horodates d'avant 2020 transformait une position de 2017
        en « vue à l'instant » ;
      · la mémoire d'affichage rejouait la moisson d'une autre ville pendant
        qu'un appel était en vol.
      · le dédoublonnage borné effaçait encore de vrais autocars : chez
        certains producteurs l'identifiant d'entité est celui de la COURSE, et
        trois cars la partagent.
      DÉCISION FINALE, prise sur mesure : on NE dédoublonne PAS. Ni par
      identifiant (c'est parfois une course), ni par étiquette (absente des 57
      paires agrégat/membre), ni par distance (l'écart croît avec la vitesse,
      3,2 km relevés). Le volet PRÉVIENT à la place. Morale consignée :
      corriger un défaut est un changement comme un autre, il se relit avec la
      même sévérité — et une correction élégante qui n'est pas mesurée sur les
      données réelles est une régression qui s'ignore.

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
- [x] PR #18 — Adressage « commune + mot + chiffres » (alternative What3Words) :
      « Dijon-21 BAKE 4831 » désigne 10 m² n'importe où en France. Grille de
      4 096 × 4 096 cases autour du centre INSEE de la commune, 2 048 mots
      prononçables × 8 192 chiffres — la bijection est exacte, sans trou ni
      collision. Appui long pour l'obtenir et la copier, recherche pour y
      revenir. Refuse au-delà de 20,48 km du centre plutôt que de mentir ;
      propose les 6 homonymes ambigus (tous 97x) au lieu d'en élire un.
      Le répertoire des communes vient du réseau — 3,3 Mo ne tiennent pas
      dans un budget de 300 Ko, et la carte hors ligne ne le promet pas.

## Vitrine & B2B
- [x] PR #19 — Pages vitrine : « À propos » (manifeste de souveraineté,
      sources et licences vérifiées), « Vie privée » (ce qui est stocké, où,
      comment l'exporter et l'effacer), « Mentions légales » (éditeur repris
      des mentions d'infonovice.fr, hébergeur GitHub Pages, AGPL,
      attributions). VRAIES pages HTML multi-entrées Vite, ZÉRO JavaScript —
      un parcours E2E le prouve (aucun script, aucune origine tierce, aucun
      cookie). L'accueil marchand séparé n'est pas retenu : la carte EST
      l'accueil.
- [x] PR #20 — Page « Professionnels » (offre flottes) : ce que la carte sait
      faire pour une équipe de terrain, et surtout CE QU'ELLE NE FAIT PAS
      (pas de suivi de véhicule, pas d'optimisation de tournée, pas
      d'horaires, pas de comptes d'équipe). Contact par `mailto:` — PAS de
      formulaire : ces pages interdisent le script et l'envoi de formulaire
      dans leur propre CSP, et un formulaire enverrait la saisie à un serveur
      que ce site n'a pas. Le parcours e2e vérifie l'absence de <form>, de
      script, de cookie et de toute origine tierce.
      RESTE À TRANCHER PAR ARMELIN : tarifs, engagements de service et
      références clients sont volontairement absents — rien n'a été inventé.
- [x] PR #21 — Référencement : sitemap.xml, robots.txt, Open Graph et
      JSON-LD (WebApplication / AboutPage) sur les quatre pages, image de
      partage 1200x630 GÉNÉRÉE par script (aucun binaire opaque au dépôt).
      Un test unitaire compare le sitemap aux pages réelles : une page qui
      naît hors du sitemap ou sans canonical fait échouer la CI.

## Limites connues, à traiter plus tard
- [x] RÉSOLU le 26/08/2026 (PR #31) — les panoramas 360° s'explorent au lieu
      d'être affichés à plat. LA BIBLIOTHÈQUE N'ÉTAIT PAS NÉCESSAIRE : un
      visualiseur écrit à la main coûte 2 Ko gzippés (bundle 40,5 → 42,5 Ko
      sur 300), là où un visualiseur du commerce en pèse deux cents. Même
      arbitrage que le décodeur protobuf de la PR #16.
      Repli soigné : sans WebGL, ou si la texture est refusée, l'image à plat
      reste affichée. Et la navigation se fait aussi AUX FLÈCHES.

- [x] RÉSOLU le 27/08/2026 (PR #48) — `<main id="carte" role="application">`
      — relevé le 26/08/2026 par
      l'audit « arbre d'accessibilité » de Lighthouse. `role="application"`
      est le bon choix pour une carte : il demande au lecteur d'écran de
      laisser passer les touches, sans quoi les flèches déplaceraient le
      curseur de lecture au lieu de la carte. Mais posé sur `<main>`, il
      ÉCRASE le point de repère principal de la page : un lecteur d'écran ne
      trouve plus « le contenu principal ».
      LE REMÈDE APPLIQUÉ : `<main>` reste le repère, le rôle vit sur un
      conteneur interne — qui EMPORTE l'id `#carte`. Ni la feuille de style ni
      les trente parcours E2E n'ont eu à bouger : ils désignent `#carte`, et
      `#carte` est toujours le nœud que MapLibre reçoit. Un parcours E2E
      verrouille la structure.
      Sans conséquence sur la note : les trois axes exigés par le projet
      restent à 100 (l'audit appartient à la catégorie « navigation
      agentique », hors périmètre).

## Ergonomie
- [x] PR #21bis — Trois zones : rail à gauche, réglages d'affichage en bas à
      droite, liens légaux en bas à gauche. Les panneaux poussent le rail au
      lieu de le recouvrir ; Échap et un clic à côté referment. Six parcours
      E2E comparent des BOÎTES ENGLOBANTES — ce que l'œil voit se prouve par
      des rectangles.

- [x] PR #27 — Deux points d'entrée : le trajet à gauche, les réglages
      derrière un menu unique en haut à droite. Le rail ne s'allonge plus.

## Planificateur EV — étude faite, chantiers ordonnés
Étude de faisabilité complète : docs/planificateur-ev.md (25/08/2026), chaque
verdict adossé à un appel réel daté.
- [x] PR #22bis — Filtre par RÉSEAU : les enseignes présentes dans la vue,
      demandées en facette au portail, avec leur nombre.
- [x] PR #22 — Filtres bornes : puissance, type de connecteur, réseau. Les
      champs EXISTENT déjà dans le jeu IRVE consommé depuis la PR #9
      (prise_type_combo_ccs, puissance_nominale, nom_operateur…) : meilleur
      rapport valeur/risque de toute la liste.
- [x] PR #23 — Profil véhicule en IndexedDB (batterie, SOC, SOCE, conso).
      Aucun compte, aucun serveur — comme les favoris de la PR #10.
- [x] PR #24 — Anneaux d'autonomie ville / route / autoroute, calculés en
      local. Ils disent « au mieux, à plat » et l'interface doit le dire.
- [x] PR #25 — Adresses domicile et travail, en repères à rôle unique.
- [x] PR #26 — Éclairs de puissance : un à trois selon le palier, dessinés
      par le code. Ni marque déposée, ni binaire au dépôt.
- [x] PR #28 — Arrêts suggérés : algorithme livré et testé (src/lib/arrets.ts,
      19 tests à sec). Il reste à le brancher à l'interface — le planificateur
      d'itinéraire lui fournira le tracé, le profil véhicule sa consommation,
      et « le long du trajet » (PR #11) ses bornes candidates.
      CE QU'IL SAIT DIRE : combien d'arrêts, où, avec quel SOC on arrive et
      repart, combien de minutes de charge. Et surtout DIRE NON, tôt, avec le
      kilomètre exact où la réserve serait entamée.
      CE QU'IL IGNORE, écrit en tête du fichier : relief, vent, trafic, et la
      vraie courbe de charge du véhicule (qui dépend de la température de la
      batterie et qu'aucune source publique ne donne).
- [x] PR #28bis — Arrêts suggérés branchés au planificateur : section « Arrêts
      de recharge », à la demande, avec le refus motivé quand le trajet n'est
      pas faisable. avec pourcentage d'arrivée visé. LE cœur d'un
      vrai planificateur, et un chantier à cadrer avant d'être codé.
- [x] PR #29 — Commodités des aires via Overpass (miroir OSM France), à la
      demande : enseigne, restauration, café, toilettes. Couverture MESURÉE
      avant d'être promise — voir docs/apis.md.
- [~] PR #30 — Disponibilité des bornes en direct : ÉCARTÉE le 26/08/2026,
      avec la mesure. Le jeu Belib' est techniquement parfait (CORS *, sans
      clé, identifiant d'itinérance qui joint l'IRVE) mais SEULS 6 % de ses
      statuts ont moins d'une heure — 123 points sur 1 967, dans une seule
      ville. Un « Disponible » vieux de cinq heures ne dit rien de l'instant,
      et l'erreur tomberait en arrivant à 8 % de batterie. Détail chiffré
      dans docs/apis.md.

- [x] PR #32 — LES ONZE RETOURS DU TERRAIN (26/08/2026). Armelin a testé la
      production le 25/08 : onze remarques, captures à l'appui, toutes
      traitées. Le détail vit dans docs/CHANGELOG.md ; ce qui mérite d'être
      retenu ici est ce qui a changé de STRUCTURE :
      · L'INDEX NATIONAL remplace la limite de zoom 12 pour les bornes. Les
        portails Opendatasoft plafonnent à 100 enregistrements : demander la
        France entière rendait cent bornes au hasard. L'export agrégé rend
        14 133 stations de 50 kW et plus en 709 Ko, gardés en local. Il sert
        aussi le planificateur, qui travaillait jusque-là sur un échantillon
        sans savoir qu'il en était un.
      · LA FRONTIÈRE GAUCHE/DROITE A BOUGÉ : chercher une borne n'est pas
        régler l'affichage de la carte, c'est préparer un trajet. Le volet
        « Recharge et services » rejoint le rail de gauche.
      · LE SUIVI D'ITINÉRAIRE existe, et refuse de s'appeler navigation.
      · SIX DÉFAUTS SILENCIEUX levés en chemin, listés au CHANGELOG.

- [~] PR #22bis AMENDÉE le 26/08 — le filtre par réseau n'est plus borné à la
      vue. La facette du portail ne proposait que ce que la carte montrait
      déjà, et changeait de contenu à chaque déplacement. Il se calcule
      désormais sur l'index national.

ÉCARTÉS AVEC PREUVE, voir docs/planificateur-ev.md :
- Comptes et base de données — heurtent les contraintes 1 et 4. Décision
  d'Armelin en attente.
- Filtre « éviter les péages » — mesuré impossible le 21/08 (PR #6) : aucun
  moteur public ne l'expose. Éviter les autoroutes en est l'approximation.
- Logos des réseaux — marques déposées, et « aucun binaire opaque au dépôt ».
- Lecture OBD — Web Bluetooth absent d'iOS ; c'est le travail de l'app native
  de la phase 2.
- Données du véhicule EN DIRECT SANS DONGLE — la question d'Armelin du 26/08,
  cherchée et tranchée le jour même (docs/apis.md). ABRP passe par les API
  CONSTRUCTEUR, via des agrégateurs (Enode, Tronity) ou l'API Tesla : le
  propriétaire autorise l'application sur son compte constructeur. Hors de
  portée ici pour trois raisons, dans l'ordre de leur poids : l'authentification
  exige un SECRET CLIENT, donc un serveur — le même obstacle que DATAtourisme ;
  la production n'est pas gratuite ; et la position et l'état de charge
  sortiraient du navigateur, ce que la page « Vie privée » exclut aujourd'hui
  sans nuance. Faisable AVEC le backend du niveau premium, et seulement au prix
  d'une décision explicite ET d'une mention publique — comme la dérogation
  Open-Meteo.

## Premium, rallyes AFUVE et cortèges — CADRAGE, rien d'engagé
Cadrage complet : docs/premium-et-evenements.md (25/08/2026). Trois projets
distincts, pas trois fonctionnalités — ils ne partagent que le besoin d'un
serveur.
- [ ] Décider le modèle (six questions listées au §5 du cadrage)
- [ ] Réécrire « Vie privée » en DEUX RÉGIMES — doit accompagner le premier
      octet de backend, jamais le suivre : la page affirme aujourd'hui sans
      nuance que rien ne quitte le navigateur.
- [ ] Socle premium : compte, itinéraires sauvegardés, comparaison A/B,
      historique de recharge. Le moins risqué, réutilisé par les deux autres.
- [ ] Cortèges entre amis — AVANT les rallyes : un cortège s'essaie un
      dimanche à trois voitures, un rallye est un événement daté qu'on ne peut
      pas rater.
- [~] Événements AFUVE (rallyes, classement, signalement de panne) :
      ABANDONNÉ le 25/08/2026, avec son motif. Trois raisons — le suivi exige
      l'app mobile de la PHASE 2 (un navigateur en arrière-plan n'émet pas de
      position, iOS l'arrête) ; la responsabilité de responsable de traitement
      est disproportionnée pour quelques week-ends par an ; et le motif
      « sécurité » ne peut pas être tenu là où le réseau manque. Détail dans
      docs/premium-et-evenements.md §2.B. Les CORTÈGES, eux, restent au
      programme.

RÈGLE QUI NE BOUGE PAS : le mode gratuit reste entièrement utilisable SANS
compte, en local, avec son export JSON. C'est ce qui distingue ce produit de
celui qu'il concurrence.

## Écarté pour l'instant, avec la mesure
- [~] Lieux culturels DATAtourisme (autour des arrêts, le long du trajet) :
      ABANDONNÉ le 25/08/2026 par décision d'Armelin. L'API convient (recherche
      géographique, CORS ouvert) mais exige une CLÉ — invisible sur un serveur,
      publique sur un site statique dans un dépôt public. Les deux voies
      possibles (extrait au build, ou dérogation avec mention publique) ont été
      présentées et écartées. Mesure conservée dans docs/apis.md.

## Le mandat du 27/08/2026 — session en autonomie, retours triés
Armelin a mandaté une session « en autonomie, dans cet ordre » avec une
vingtaine de retours (captures ABRP, Petal Maps et restautoroute à l'appui).
Triage consigné ici ; chaque ligne devient une PR ou une étude datée.

- [x] PR #47 — LE PLAN SE RÈGLE, ET SE CHOISIT SUR LA CARTE :
      · plafond de charge réglable (80/90/au besoin). L'ancien « plafond de
        confort » à 80 % était MORT — sa clause d'échappement le neutralisait
        toujours ; le réglage en fait un plafond dur, assumé jusqu'au refus
        motivé qui NOMME le remède ;
      · la réserve s'appelle désormais « Arriver aux bornes avec au moins » —
        le réglage existait, sous un intitulé qui ne répondait pas à la
        question ;
      · MODE TRAJET : le plan affiché, les bornes nationales s'effacent — ne
        restent que le corridor (cliquable) et les arrêts en pastilles
        numérotées ; le volet des couches le DIT ; effacer le trajet rend la
        carte. Frugalité : la couche masquée ne charge plus rien ;
      · la fiche d'une borne sait « Ajouter au plan de recharge » et
        « Retirer cet arrêt du plan » — sur le corridor seulement : hors
        trajet, aucun bouton qui mènerait à un plan impossible.
- [ ] Itinéraires alternatifs A/B/C (comme ABRP) — À ÉTUDIER D'ABORD : le
      service public IGN n'expose PAS d'alternatives (getcapabilities du
      21/08, PR #6). Pistes honnêtes : variantes par évitements, ou point de
      passage décalé. Ne rien promettre avant la mesure.
- [ ] Accessibilité `role="application"` (déjà au chapitre « Limites
      connues ») — sa propre PR.
- [x] Ménage Dependabot (PR #49) : ESLint 10.9, Vite 8.2.2 (mineures).
      TypeScript 7.0.2 ESSAYÉ ET ÉCARTÉ avec la preuve, le 27/08 : `tsc`
      lui-même passe sans une erreur, mais typescript-eslint REFUSE de
      démarrer (« typescript-eslint does not support TS 7.0 », suivi de
      compatibilité annoncé pour ≥ 7.1 — issue typescript-eslint #10940).
      La chaîne de lint est une porte de CI : à reprendre quand
      typescript-eslint suivra.
- [x] PR #50 — PETITES CORRECTIONS D'INTERFACE, groupées. Tout est au
      CHANGELOG 0.36.0 ; ce qui mérite la roadmap :
      · « Accès réservé » reformulé (badge/clientèle/résidents, « vérifiez
        avant le détour ») + 240 lignes aux encodages estropiés rattrapées ;
      · installation PWA bornée au mobile ; « Télécharger » remplace
        « Charger » ; éclairs SVG partout ; favoris renommables avec
        l'adresse en sous-titre ; générations et WLTP au catalogue (XPENG G6
        restylé ajouté, 451 kW sourcés).
      · BOUTON « TRANSPORTS EN COMMUN » : GARDÉ, DÉCISION À ARMELIN. La
        couche montre réellement les véhicules (cercles aux couleurs des
        réseaux, zoom ≥ 10, jusqu'à trois réseaux cochés) — l'impression
        « aucune différence visuelle » vient probablement d'un essai sans
        réseau coché ou sous le zoom 10. Les positions ne nourrissent AUCUN
        algorithme : supprimer le bouton, ce serait supprimer la
        fonctionnalité entière de la PR #16. Si Armelin le confirme après un
        essai zoomé avec un réseau coché, on retirera le tout proprement.
- [x] LES SIX ÉTUDES SONT FAITES, verdicts datés dans
      docs/etudes-mandat-27-08.md (27/08/2026). En une ligne chacune :
      · API pour les autres produits : le site n'a AUCUNE donnée en propre à
        servir — une API serait un proxy payant vers des services publics
        gratuits. Voie retenue : la bibliothèque /src/lib partagée + liens
        profonds, MAINTENANT ; API HTTP seulement avec le backend premium.
        DÉCISION D'ARMELIN ATTENDUE sur le mode de partage (paquet npm,
        sous-module, copie).
      · Péages : l'évitement reste impossible (moteur IGN), mais NOMMER les
        gares de péage du tracé (barrier=toll_booth, mécanique Overpass des
        commodités) est faisable → LIVRÉ, PR #54 : « Relever les péages du
        trajet » dans la page Options — à la demande, cabines FONDUES en
        gares (OSM cartographie chaque voie), kilométrage, limites dites
        (source OSM, pas de tarif). Filtre exact local sur le vrai tracé,
        polyligne décimée et plafonnée dans la requête.
      · Restauration façon restautoroute : les données sont déjà là
        (commodités PR #29), c'était un chantier de PRÉSENTATION → LIVRÉ,
        PR #55 : les commodités s'affichent en PUCES à pictogrammes dessinés
        (pompe, couverts, tasse, WC — jamais un logo de marque), nom en
        toutes lettres, distance qui décide, douze puces au plus et le reste
        compté. Dans le plan de recharge ET la fiche de borne. Rendu vérifié
        par capture avant livraison.
      · Monuments (base Mérimée) : LES TROIS MESURES FAITES le 27/08 sur le
        fichier du jour (46 760 notices) — 95 % de coordonnées ; index
        classés 890 Ko brut ; 14 990 classés vs 31 321 inscrits seuls (la
        coupe éditoriale : les classés). → LIVRÉ, PR #56 : page « Lieux
        d'exception » du planificateur — détour maximal 5/10/20 min, index
        ENGENDRÉ et versionné (scripts/generer-monuments.mjs, le CSV de
        100 Mo ne touche jamais le navigateur), calcul local sur le tracé,
        « Passer par là » ajoute le monument en ÉTAPE et recalcule.
        L'approximation à vol d'oiseau est écrite sous la liste.
        COMPLÉTÉ LE SOIR MÊME (PR #62, retour d'Armelin : « impossible de
        cliquer dessus pour avoir le détail ») : la fiche du lieu — même
        cartouche que les bornes — depuis la liste ET le marqueur, avec la
        notice Mérimée officielle à un clic ; index enrichi (référence
        100 %, siècle 85 %, adresse 27 % — 0,42 Mo gzippés).
      · Badges e-MSP : ÉCARTÉ avec le motif — aucune source publique ne dit
        quels badges une station accepte ; les réseaux préférés sont
        l'approximation honnête. À réévaluer si l'open data d'itinérance
        paraît.
      · Alternatives A/B/C : pas de moteur, pas de vraies alternatives →
        LIVRÉ, PR #57 : « Comparer avec et sans autoroute » dans la page
        Options — un appel au moteur pour la variante, les plans de recharge
        des DEUX tracés calculés localement (à neuf, sans les consignes du
        trajet courant — c'est écrit sous le résultat), le TOTAL
        route + charge affiché, et « Prendre cette variante » qui bascule
        l'évitement et recalcule. Les variantes sont nommées par ce qu'elles
        sont, jamais « itinéraire B ».
- [x] PR #52 — « Nom de station contient… » : le filtre est livré, envoyé au
      service (`suggest()`) au-delà du zoom 12, appliqué à l'index aplati
      (casse, accents, ponctuation sourds) en deçà, débounce 400 ms, persisté
      avec les autres filtres. Taper « mcdonald » répond au cas IZIVIA.
      L'origine, MESURÉE le 27/08, le fichier le permet :
      les stations en restaurant portent « Mc Donald's »/« McDonald's » dans
      `nom_station` (2 484 lignes IZIVIA FAST, ~36 McDo ; graphies
      inconstantes). La réponse générique est un FILTRE « nom de station
      contient… » : local sur l'index national, `suggest()` au portail par
      emprise. Sa propre PR.
- [~] NAVIGATION MOBILE — CADRÉ le 27/08/2026 dans docs/navigation-mobile.md :
      quatre PR découpées et deux études préalables (couverture maxspeed OSM
      pour l'ISA ; maquette de la barre de trafic sur les données Bison Futé
      réelles). La ligne ne bouge pas : le suivi refuse de s'appeler
      navigation tant que l'arrière-plan mobile n'existe pas (phase 2).
      · [x] PR #53 — LA CAMÉRA RENDUE À L'USAGER : un geste (glisser,
        molette, rotation) suspend le suivi de caméra ; « Recentrer » — ou
        vingt secondes d'immobilité — le rend. L'ÉCRAN RESTE ALLUMÉ pendant
        le suivi (Screen Wake Lock, repris au retour d'arrière-plan, rendu à
        l'arrêt, échec bénin). Et le bandeau SE RÉDUIT : manœuvre, restant
        et boutons — ce qu'on lit en roulant.
      · [x] PR #58 — LE CAP ET LA VITESSE GPS : la carte s'oriente au cap
        en mouvement (jamais sous 7 km/h — le cap d'un véhicule immobile est
        du bruit qui ferait tournoyer la carte au feu rouge), l'arrêt du
        suivi rend le nord ; la vitesse GPS s'affiche dans un cercle, cachée
        quand le récepteur ne la donne pas. Aucune permission nouvelle : le
        cap vient du fixe GPS, pas de DeviceOrientation.
      · [x] PR #59 — LA PROCHAINE MANŒUVRE EN GRAND : la manœuvre OSRM
        voyage désormais avec chaque étape (`manoeuvreDe`, normalisée) et le
        bandeau la DESSINE — une seule flèche, huit rotations, glyphes
        propres pour le rond-point et l'arrivée, rien de committé. Au
        départ, tout droit : le modifier du moteur dit le côté
        d'engagement, pas un ordre. La flèche disparaît hors route.
      · [x] PR #60 — LA VUE 3D, essayée AVANT d'être promise : capture du
        fond Plan IGN incliné à 60° sur Lyon (zoom du suivi) — champ proche
        net, lointain qui rapetisse (les étiquettes sont cuites dans le
        raster : limite connue et assumée). Livrée à 55° : la carte
        s'incline avec le suivi, « Vue à plat » la refuse (le choix tient
        la session), l'arrêt la redresse. Et une leçon d'animation : un
        easeTo FIGE ce qu'il ne nomme pas — l'inclinaison voyage avec
        chaque fixe GPS.
      LE CADRAGE NAVIGATION MOBILE EST SOLDÉ (PR #53, #58, #59, #60), ET
      SES DEUX ÉTUDES AUSSI (PR #61, mesures dans docs/navigation-mobile.md) :
      · maxspeed OSM : 97-100 % de couverture sur trois types d'axes →
        LIVRÉ, PR #63 : le disque cerclé de rouge du suivi — un appel
        Overpass par trajet (POST, polyligne serrée), lecture locale par
        INTERVALLES de tronçon, routes croisées écartées par leur empreinte,
        silence hors tronçon connu. Le démarrage du suivi n'attend pas
        Overpass. Jamais appelée « ISA ».
      · barre de trafic en dégradé : ÉCARTÉE avec la mesure — Bison Futé
        publie des événements PONCTUELS (359 nationaux le 27/08 à 20 h,
        SIX bouchons dans toute la France), aucune fluidité de tronçon.
        L'honnête et utile : annoncer les événements du corridor dans le
        suivi → LIVRÉ, PR #64 : « Travaux dans 12 km (Bison Futé) » dans le
        bandeau — effectifs seuls, 2 km du tracé, prochain devant soi
        jusqu'à 50 km, rafraîchi toutes les cinq minutes tant que le suivi
        tourne, silence derrière soi et hors route.

## Le mandat UX du 28/08/2026 — triage dans docs/mandat-ux-28-08.md
Cahier des charges complet transmis par Armelin après essai sur téléphone.
Le triage (déjà livré / contredit par mesure / à faire / à décider) vit dans
docs/mandat-ux-28-08.md ; chaque PR livrée s'y coche.
- [x] PR #69 — UX-1, le socle mobile : en-tête une rangée + place du Menu
      réservée, safe areas, jetons z-index, contrôles bas-droite espacés,
      contraste du contact Professionnels ; toucher fantôme cherché et NON
      reproduit (garde-fou posé).
- [x] PR #70 — UX-3, la planification allégée : favoris derrière un bouton
      « Favoris… (n) » ouvrant un <dialog> natif avec recherche (plus de
      liste sous chaque champ) ; « Effacer le trajet » seulement s'il y a
      matière ; « ⇅ Inverser » qui échange et recalcule.
- [x] PR #71 — UX-2, la fiche de destination : choisir une adresse ouvre
      une fiche compacte (Y aller / Ajouter aux favoris / Photos de rue /
      Copier les coordonnées) — plus de marqueur muet.
- [x] PR #72 — UX-4, « Pourquoi ce plan ? » : un volet sous le plan de
      recharge — consignes reprises, chaque arrêt motivé par le critère réel
      du calcul, puissance retenue nommée, aveu du modèle en clôture.
- [x] PR #73 — EV-1, réglages élargis : plafond 50-90, détour lieux 30 min,
      durée de charge écrite sous les pastilles du plan sur la carte.
- [x] PR #74 — NAV-1, l'orientation à trois états : cap / nord / libre au
      bandeau, cap lissé (arc court, tremblement ignoré), boussole à l'arrêt
      ouverte après geste et permission.
- [x] PR #75 — POI-1, la recherche par catégories : cinq catégories « dans
      la vue, à la demande » (un clic = un appel Overpass, jamais au
      déplacement, refus motivé sous le zoom 12, plafond annoncé).
      LE DÉCOUPAGE INITIAL DU MANDAT EST SOLDÉ (UX-1 à POI-1, PR #69-#75).
- [x] PR #76 — la frise verticale du trajet en suivi (candidate « après
      NAV-1 » du triage) : arrêts en pastilles numérotées, événements Bison
      Futé en losanges à leur kilomètre, curseur-voiture — des événements
      ponctuels, jamais une fluidité que la donnée ne contient pas.
- [x] PR #77 — « Le plus rapide / Le plus court » : les profils de trajet
      cadrés par la mesure (le moteur ne connaît que fastest/shortest) ;
      le réglage voyage dans le lien partagé (;opt=shortest).
      TOUTES LES CANDIDATES DU TRIAGE DU 28/08 SONT SOLDÉES.
- [x] PR #78 — BS-1, les feuilles basses (DÉCISION D'ARMELIN du 28/08 :
      « commence par les bottom sheets ») : planificateur et menu ancrés en
      bas sur téléphone, poignée, paliers mi/plein/fermer, rien ne change
      sur grand écran. BS-2 (fiches borne/lieu) si l'essai convainc.
- [x] PR #79 — le partage de favoris par lien (demande d'Armelin du 28/08) :
      #favs= de la main à la main, réception confirmée, repères exclus,
      doublons écartés par la position ; l'export JSON reste l'outil du
      déménagement complet.
- [x] PR #162 — RECHERCHE-3 (01/09) : la recherche par nom part enfin (la
      BAN rend toujours quelque chose) et interroge l'ÉGALITÉ indexée, la
      regex expirant (mesuré : 57 s). Expiration lue comme telle.
- [x] PR #178 — VERSION-1 + HIST-2/3 + PARK-3 + GUIDE-6 + FOND-3 + ERGO-3
      (02/09) : la version se lit et la mise à jour se force (« je ne sais pas
      si j'ai la bonne version en cache ») ; comparaison lisible et
      refermable ; feuille de parking au-dessus de son bouton ; écart
      hors-route selon le profil (30 m à pied) ; étiquettes blanches cernées de
      noir sur imagerie ; les filtres de recharge passent dans l'entonnoir.
- [x] PR #180 — VERSION-2 (02/09) : le numéro affiché vient du journal, plus
      de `package.json`. La production annonçait 1.31.0 en servant la 1.33.0 —
      j'avais oublié d'incrémenter deux fois. La discipline est supprimée, pas
      répétée.
- [x] PR #179 — PARK-4 (02/09) : les places libres en direct, là où une
      collectivité les publie. Aix-Marseille (à la minute) et Nantes (à
      l'heure) branchées ; Issy écartée (relevé d'avril 2025, tous pleins) et
      Paris n'expose pas d'occupation. Piège payé : Aix-Marseille horodate en
      heure de Paris sans le dire.
- [x] PR #182 — PONT-1 (02/09) : les passages limités en tonnage s'annoncent à
      mille mètres, quand la masse est déclarée. Zéro requête de plus — la
      clause entre dans le corridor existant. On AVERTIT, on n'évite pas : le
      moteur public n'accepte aucun paramètre de poids.
- [ ] RÈGLES DE CIRCULATION — DiaLog, demandé le 02/09. MESURÉ ET BLOQUÉ pour
      l'instant : la plateforme publie un DATEX II national de **100 Mo**, et
      elle IGNORE tout filtre (`?bbox=`, `?limit=` rendent les mêmes 100 Mo).
      Inexploitable sans backend, que le projet s'interdit. À rouvrir si
      DiaLog ajoute un filtrage par emprise — la demande vaut la peine d'être
      faite auprès d'eux.
- [x] PR #190 — MOTO-1 (02/09) : le mode deux-roues. LE CADRAGE ÉTAIT FAUX SUR
      UN POINT et la vérification l'a corrigé — l'interfile n'est plus une
      tolérance à géométrie départementale : le décret n° 2025-33 du 9 janvier
      2025 l'a GÉNÉRALISÉE à toute la France (article R. 412-11-3). On annonce
      donc les sections éligibles avec les conditions du texte, 300 m avant, et
      SANS toucher au tracé ni à l'heure d'arrivée. Zéro requête de plus : les
      tags `lanes` et `oneway` étaient déjà dans la réponse du corridor.
- [x] PR #183 — VÉHICULES (02/09) : six modèles sur quinze ajoutés (Alpine
      A390, MG Cyberster, Smart #5, BYD Atto 2, Seal U, Tang), d'une SEULE
      source cohérente qui distingue capacité brute et utile.
- [x] PR #189 — FOND-5 (02/09) : « existe-t-il des cartes 3D gouvernementales
      pour une navigation en 3D ? » Oui, et c'était déjà dans nos tuiles : la
      couche `bati_surf` du PLAN.IGN porte `hauteur`. Case dans Affichage,
      caméra inclinée à 50°, zéro requête de plus. Couverture mesurée sur cinq
      tuiles : 68 % en pavillonnaire, 82 % à Paris, 100 % en rural.
- [x] PR #186 — FOND-4 + RAYON-1 (02/09) : les noms de rue sur le satellite
      (la couche des odonymes manquait à mon extraction de FOND-1) ; le rayon
      d'action réduit du détour routier mesuré (médiane 1,19 sur huit trajets,
      facteur retenu 1,25).
- [x] PR #185 — ERGO-5 (02/09) : le doublon de catégories tombe (décision
      d'Armelin), une roue crantée remplace la ligne « Recharge et services »,
      et les trajets habituels se rangent derrière un bouton.
- [x] PR #184 — XPENG L03 (02/09) : ses quatre versions, capacités UTILES
      d'EV Database, crête de la Standard Range recoupée par XPENG France,
      autonomies du configurateur officiel. Armelin a fourni la source que je
      demandais.
- [x] PR #192 — RGPD-1 (02/09) : la page « Vie privée » affirmait « pas de
      trajets conservés » alors que l'application en garde depuis le 01/09 et
      qu'elle y écrit le tracé GPS depuis le 02/09. Corrigée, et désormais
      TESTÉE — le contrat n'était écrit qu'à un endroit et rien ne le
      regardait.
- [x] PR #191 — HIST-3 (02/09) : le dénivelé et la température, les deux
      manques qu'Armelin citait avec le tracé. Le dénivelé se lit dans les
      altitudes GNSS quand il y en a (zéro appel, seuil de bruit à 5 m), sinon
      UN appel au service d'altimétrie IGN à l'enregistrement ; la température
      vient d'UN appel météo sur le point d'arrivée, déjà interrogé pendant le
      trajet. La comparaison les affiche, le fichier de contribution les
      emporte, et l'absence se dit au lieu de s'écrire zéro.
- [x] PR #193 — ERGO-6 (02/09) : les trois défauts du premier retour
      utilisateur d'Armelin. Rappel ambre coincé dans la rangée flex des
      bornes (panneau de recharge illisible) ; roue crantée qui était un
      soleil ; `display:flex` battant l'attribut `hidden` sur les trajets
      habituels — un seul défaut CSS expliquait à la fois « le bouton ne fait
      rien » et « il faut scroller ». Règle globale `[hidden]` posée (sept
      classes étaient dans ce cas) et feuille basse dimensionnée à son
      contenu. ERGO-7 dans la même PR : les réglages de bornes ont leur propre
      page, avec flèche de retour.
- [x] PR #188 — HIST-2 (02/09) : « aucun moyen de relancer le même trajet
      depuis l'historique » et « l'historique ne conserve pas le tracé […] donc
      contribuer envoie trop peu ». Même cause : on gardait des CHIFFRES,
      jamais un LIEU. Le tracé s'enregistre (sans un appel de plus, +11 Ko par
      trajet), la destination aussi, et « Relancer » ouvre le planificateur
      dessus. Le fichier de contribution emporte le tracé AMPUTÉ de 500 m à
      chaque bout — un tracé entier commence devant une porte.
- [x] PR #187 — VEHIC-3 (02/09) : les seize modèles réclamés avec leurs liens
      officiels — Cupra Raval Endurance, VW ID. Polo 52 kWh, DS N°7 (trois
      versions), DS 3 E-Tense, BYD Atto 3 EVO (deux versions) et les huit
      Tesla 2026, millésime écrit DANS LE LIBELLÉ puisque c'est la seule chose
      qu'une liste déroulante montre. Fiches lues page par page sur EV
      Database ; l'Atto 3 EVO recoupé sur le communiqué de BYD France.
- [ ] RAVAL/ID. POLO 37 kWh — écartées : la même source donne 50 kW de charge
      à l'une et 88 kW à l'autre, même plate-forme et même batterie. À
      reprendre quand une seconde source tranchera.
- [x] PR #181 — ERGO-4 (02/09) : six menus rendus atteignables. Recharge en
      tête de l'entonnoir avec son picto ; panneau borné et défilant sur
      mobile ; historique extrait vers le Menu ; menu du trajet réduit à deux
      entrées permanentes ; version tout en bas ; clic dans le vide qui
      referme, sans casser le va-et-vient sur les points.
- [x] PR #177 — CARTE-1 / HIST-1 / BANDEAU-1 / PARK-2 / VOIX-3 (01/09) : les
      cinq retours du premier essai à pied. Carte noire après le trajet (perte
      de contexte WebGL, non gérée) ; historique illisible en sombre
      (contraste mesuré 1,1) ; cartouche qui mangeait la frise ; rond « P »
      déplacé et parkings ouverts d'eux-mêmes ; voix par défaut. Les deux
      dernières renversent des décisions antérieures, à sa demande.
- [x] PR #175 — PARTAGE-1 (01/09) : contribuer un parcours à INFONOVICE, sans
      se livrer. Le titre (qui porte les deux adresses) est retiré, l'instant
      du départ arrondi à l'heure ; le fichier est MONTRÉ en entier avant tout
      envoi, et l'application n'expédie rien elle-même.
- [x] PR #174 — IRVE-1 (01/09) : l'état déclaré des points de charge, DATÉ.
      Pas de reroutage automatique : mesuré, aucun relevé de moins de 9,6 h et
      45 % de plus de sept jours — le fichier national est déposé par lots, ce
      n'est pas un flux. Un seul appel, à l'ouverture de la fiche.
- [x] PR #173 — RECHERCHE-5 (01/09) : le collège se trouve enfin. RECHERCHE-4
      ne s'est jamais déclenché en production — seuil calibré sur des scores
      mesurés SANS `autocomplete` (0,48 relevé à la main, 0,945 réellement
      servi à l'application). Le score est remplacé par deux questions
      gratuites : la BAN rend-elle les mots tapés, et son résultat est-il dans
      la vue. Il faut les deux, car le lieu-dit de Thumeries porte les mots.
- [x] PR #171 — STATS-2 (01/09) : l'historique des trajets, ENREGISTRÉ SUR
      DEMANDE, avec comparaison côte à côte. Conception d'Armelin.
- [x] LIVRÉ par la PR #175 (PARTAGE-1) — le partage à INFONOVICE : bouton
      dédié, floutage des adresses de départ et d'arrivée, fichier montré
      avant envoi. L'appli EXPORTE, l'usager attache (un mailto ne porte pas
      de pièce jointe).
- [x] PR #172 — FOND-2 (01/09) : les étiquettes se posent sur `style.load`.
      FOND-1 les déclarait dans le style initial et la PRODUCTION ne les
      dessinait pas.
- [x] PR #169 — FOND-1 (01/09) : surcouche vectorielle d'étiquettes — les
      numéros de route sur tous les fonds, les noms de communes sur le
      satellite. Calques extraits du style officiel PLAN.IGN.
- [x] PR #168 — ITI-1 (01/09) : le pied du volet d'itinéraire colle —
      « Démarrer le suivi » et le résumé restent sous les yeux quand on défile.
- [x] PR #163 — ECOLES-1 (01/09) : l'annuaire de l'Éducation nationale,
      première brique de la consolidation. Il porte le collège qu'OSM ignore,
      et accepte un nom PARTIEL.
- [ ] CHANTIER OUVERT — consolider les bases publiques FRANÇAISES, autorisé
      par Armelin le 01/09 (Wikidata exclu, chercher un équivalent français
      pour les logos) : Éducation nationale (mesuré : le collège introuvable
      dans OSM y est), entreprises, Culture, DATAtourisme.
      MESURÉ LE 01/09, et cela réduit le chantier :
      - **Culture** : le portail ODS a déménagé sur `culture.data.gouv.fr` et
        n'expose plus l'API ODS à l'ancienne adresse ; la « Liste des musées
        de France » sur data.gouv est un jeu de CSV PAR TERRITOIRE datant de
        2021. Rien de mieux que la couche « Culture et visites » déjà servie
        par OSM, qui est vivante. À reprendre si le portail réouvre une API.
      - **Équipements sportifs** : le recensement national (RES) n'est publié
        qu'en WMS ou par lien vers son portail ; les jeux interrogeables sont
        RÉGIONAUX (Île-de-France), ce qui donnerait une couverture inégale.
        Mesuré côté OSM : 55 équipements NOMMÉS dans 8 km autour du
        Plessis-Trévise — la couche « Sport et stades » (POI-6) les porte
        déjà, et la recherche par nom les trouve depuis RECHERCHE-5.
      - **Logos** : aucune base française ne les expose (l'INPI n'a pas d'API
        d'images utilisable) et Wikidata est écarté par Armelin. La
        recommandation reste les pictogrammes maison.
      - **DATAtourisme, entreprises** : pas encore mesurés.
- [x] PR #167 — BORNES-8 (01/09) : le rappel des filtres rentre dans le
      panneau « Autour de moi » (un point sur l'entonnoir le remplace sur la
      carte) ; le bouton « Tout afficher » devient lisible en thème sombre.
- [x] PR #161 — BORNES-5 (01/09) : le filtre qui retranche se voit SUR la
      carte, avec « Tout afficher » sur place. BORNES-4 l'avait mis dans des
      volets repliés : personne ne l'a lu.
- [x] PR #170 — GUIDE-4/5 (01/09) : la carte suit la route, la flèche suit le
      téléphone ; recalcul à 40 m quand deux signaux s'accordent.
- [x] PR #170 — BORNES-9 + RECHERCHE-4 (01/09) : le filtre par nom élargit à
      10 km ; un homonyme lointain n'ancre plus la recherche.
- [x] PR #166 — BORNES-7 (01/09) : la liste des réseaux ne dit plus « aucun
      réseau » quand le filtre de NOM agit, et nomme les filtres cumulés.
      Mesuré : 443 écritures distinctes pour « McDonald's » — il n'y a rien à
      cocher, c'est le message qui était faux. StoreDot : absent du jeu IRVE.
- [x] PR #164 — BORNES-6 (01/09) : TRANCHÉ par Armelin — le filtre réseau et
      puissance vaut pour la carte ET le trajet. Le prédicat est unique.
- [x] PR #160 — GUIDE-2 (01/09) : la boussole reprend la main sur le cap du
      tracé pour ORIENTER la carte — régression de GUIDE-1, invisible aux
      parcours parce qu'ils testaient la boussole HORS route.
- [x] PR #159 — STATS-1 (01/09) : le bilan du trajet à l'arrivée (durée,
      vitesses max et moyenne pondérée, arrêts durables), sans une requête
      de plus. Temps de charge, historique et partage de trajet : chantiers
      à part, décision à prendre.
- [x] PR #158 — RECHERCHE-2 (01/09) : la recherche par NOM en dernier
      recours (Overpass, bornée à la vue, refus honnête sous le zoom 13).
      La consolidation BNCO/Culture/Éducation/DATAtourisme et les logos
      Wikidata restent un chantier à part — dérogation à décider.
- [x] PR #157 — ADRESSE-2 (01/09) : la graphie collée des numéros
      suffixés (15 points de score, mesurés) et le repli AVOUÉ quand le
      numéro n'est pas dans la BAN — le 23 bis d'Armelin n'y est pas.
- [x] PR #156 — POI-6 (01/09) : la famille « Écoles et universités »
      (toque de diplômé) et les stades dans « Sport et stades » — sans les
      terrains de quartier, qui noieraient la carte.
- [x] PR #155 — BORNES-4 (01/09) : le mystère ZUNDER élucidé (un filtre
      de réseau restauré en silence) — badge « filtres actifs », phrase
      d'état, « Tout afficher » qui corrige aussi la mémoire ; et la puce
      « Bornes de recharge » du filtre POI, second interrupteur de la
      couche du volet.
- [x] PR #154 — GUIDE-1 (01/09) : le curseur aimanté au tracé (30 m), le
      cap du tracé quand le heading GPS bruite, la mesure brute gardée pour
      la logique ; Galileo consigné comme chantier Android (phase 2).
- [x] PR #153 — FICHE-3 (01/09) : la fiche recadrée à l'écran, l'état
      d'ouverture par un évaluateur partiel honnête (qui se tait sur ce
      qu'il ne sait pas), le « Partage facile » par fragment #lieu=, et les
      cuisines en français.
- [x] PR #152 — FEUX-3, les feux quittent la carte (01/09) : la donnée OSM
      mêle péages et chantiers aux carrefours, et un point rouge muet
      n'explique rien. Le comptage par variante reste.
- [x] PR #151 — ARRIVEE-2, l'arrivée attend d'être vraie (31/08) : le
      constat à 20 m au lieu de 50, le côté de la chaussée dit mot pour mot
      quand l'angle le permet, et l'anneau qui pulse sur la destination.
- [x] PR #150 — PARK-1, se garer près de l'arrivée (31/08) : le panneau P à
      l'approche, la liste des parkings publics du plus près au plus loin de
      la destination, « Se garer » qui replanifie, « Finir à pied » qui
      propose la bascule piéton. « Places », jamais « places libres » — la
      disponibilité n'a aucune source nationale gratuite.
- [x] PR #149 — BORNES-3, chercher « McDonald » trouve les bornes du parking
      (31/08) : la recherche compare nom, enseigne ET exploitant — mesuré,
      « Carrefour » ne vivait que dans l'enseigne et 4 931 stations étaient
      invisibles au nom seul.
- [x] PR #148 — TRAFIC-2, des dessins au lieu de ronds (31/08) : chaque
      événement Bison Futé porte son pictogramme — voiture et éclat,
      dépanneuse, triangle de chantier jaune et rouge — en plus grand.
- [x] PR #147 — BORNES-2, les bornes du trajet suivent le filtre (31/08) :
      la couche du corridor ne filtrait que par réseau — une 50 kW passait le
      filtre « 150 kW et plus ». Et la durée d'arrêt quitte son halo pour une
      pilule étirable, lisible sur tout fond.
- [x] PR #146 — FICHE-2, la fiche se lit en sombre (31/08) : la bulle
      MapLibre gardait son blanc en dur sous nos textes clairs — ton sur ton
      sur téléphone. Horaires en tableau, pastilles du filtre au dessin de
      la carte.
- [x] PR #145 — passage en VERSION 1.0.0, décision d'Armelin du 31/08.
- [x] PR #144 — FAVORIS-3, importer ses favoris Google Maps (31/08) : lecture
      LOCALE d'un export Takeout, le nom du fichier fait la liste, ce qu'on
      ne sait pas situer est dit plutôt que deviné. Aucune requête ne part
      chez Google — un parcours les compte.
- [x] PR #143 — FAVORIS-2, des listes pour ranger ses lieux (31/08) : nom,
      émoji et couleur, plus les trois listes prédéfinies. Supprimer une
      liste rend ses lieux à « Lieux favoris » — ranger n'est pas jeter.
- [x] PR #142 — LIEUX-1, une fiche pour un lieu (31/08) : le détail était
      déjà dans la réponse d'Overpass, on le jetait. Horaires en français
      sans jamais conclure « ouvert », téléphone appelable, « Y aller » et
      favoris.
- [x] PR #140 — CORRIDOR-1, le couloir suivait la corde et non la route
      (31/08) : le tracé simplifié à 300 m sortait la route du couloir
      Overpass, et TOUT le corridor disparaissait en ville — limites,
      sorties, giratoires, voies — sans un mot. Douglas-Peucker borne
      l'écart à 8 m, et l'absence des repères se dit.
- [x] PR #141 — ACCENTS-1, rendre leurs accents aux noms de voies (31/08) :
      la source les a perdus (BD TOPO rend « IMP DU PROPHETE »), et la voix
      prononçait « Proph-eu-te ». Dictionnaire FERMÉ de 139 entrées ; ce qu'il
      ne connaît pas passe intact, et les mots ambigus sont écartés expres.
- [x] PR #139 — POI-4, un motif au lieu d'un rond (31/08) : le motif dit le
      type, la couleur dit la famille — ce qui permet d'honorer une liste de
      vingt-quatre dessins sans faire vingt pastilles à cocher. Sport, gares
      et aéroports deviennent cherchables ; « Pharmacies » devient « Santé ».
- [x] PR #138 — VÉHICULE-2, le rayon d'action dit à quelle charge il répond
      (31/08) : 480 saisis, 384 affichés — le calcul était juste (80 % de
      charge), mais rien ne le disait. La charge est nommée avant les
      chiffres, et le retour à la saisie est à portée de survol.
- [x] PR #137 — RELEVÉS-1, les feux et les péages tiennent leur promesse
      (31/08) : trois causes mesurées — une requête unique qui épuisait le
      budget d'Overpass, un client qui abandonnait avant le serveur, et une
      expiration qui se lisait « zéro ». Par tronçons : 48 gares en 17 s,
      55 carrefours en 122 s, et un relevé partiel qui s'annonce partiel.
- [x] PR #136 — POI-3, le filtre se passe de son bouton (31/08) : la
      recherche suit la carte, gardée par la mémoire des zones déjà
      couvertes ; la ligne d'état ne se tait plus ; le filtre ne chevauche
      plus le planificateur et porte un entonnoir.
- [x] PR #135 — POI-2, le filtre des lieux sur la carte (30/08) : une bulle
      sur la carte, douze familles au lieu de dix-sept cases, UNE requête
      Overpass pour l'union des familles cochées, aucune recherche spontanée,
      un état qui dit toujours pourquoi, et la couleur du point qui fait du
      panneau la légende de la carte.
- [x] PR #132 — COPILOTE-1 (30/08) : commodités structurées comme dans la
      fiche de borne (fonction extraite, pas recopiée), profil et météo sans
      clic supplémentaire, et le rond du véhicule sur le profil.
- [x] PR #131 — ERGO-3, des dessins au lieu d'un formulaire (30/08) : maison,
      immeuble et étoile sur les raccourcis d'itinéraire ; les autonomies
      prennent la couleur de leur anneau, ce qui donne au rayon d'action la
      légende qui lui manquait.
- [x] PR #130 — VOIX-2, les arrêts de recharge annoncés (demande du 30/08) :
      deux paliers (10 km, 1 km), la manœuvre d'abord, l'arrêt avant le
      trafic. Un défaut corrigé au passage : sans feuille de route, plus
      aucune annonce ne sortait.
- [x] PR #129 — ERGO-2, cinq retours du volant (30/08) : voiture basse dans
      l'écran, boussole qui bascule vraiment (deux défauts de la livraison du
      matin), points cardinaux, bouton 2D/3D en toutes lettres, pastille
      décollée de l'échelle et bulle des liens qui ne l'atteint plus.
- [x] PR #128 — FEUX-2, les feux du trajet sur la carte (demande du 30/08) :
      une case à cocher à côté du comptage, un point par carrefour, à la
      demande et une seule fois par trajet.
- [x] PR #127 — FEUX-1, les feux comptés sur les trois variantes (question
      du 30/08) : on ne sait pas optimiser dessus — le moteur ne prend aucun
      coût personnalisé — mais on compte les carrefours à feux de chaque
      tracé, et « la moins arrêtée » se désigne quand le minimum est unique.
- [x] PR #126 — ROND-2, une sortie interdite n'est pas une sortie (retour du
      volant du 30/08) : les branches à sens unique dont la circulation
      arrive sur l'anneau ne comptent plus dans le rang.
- [x] PR #125 — TERRAIN-1, six retours du volant (30/08) : panneau ISA
      au-dessus de la vitesse, voiture aux deux tiers de l'écran, panneau
      élargi et grossi avec le nom de la rue visée, barres muettes retirées,
      et une seule boussole — celle de la carte.
- [x] PR #124 — TRAFIC-1, les annonces de trafic parlées (demande du 30/08) :
      elles parlent dans les BLANCS de la navigation — silence tant qu'une
      manœuvre est à moins d'un kilomètre. Trois kilomètres de portée pour la
      voix, dix pour l'écran.
- [x] PR #123 — VOIX-1, le guidage vocal (demande du 30/08) : la synthèse
      du NAVIGATEUR, aucun service, rien qui quitte l'appareil ; voix locale
      préférée et réserve écrite sur la page « Vie privée ». Trois paliers,
      jamais deux fois le même, et silence sur ce qui ne se joue pas.
- [x] PR #122 — AFFECT-1, l'affectation par voie (demande du 30/08) :
      `turn:lanes` d'OpenStreetMap — la note qui la disait inexistante
      décrivait le service d'itinéraire, pas OSM. Chaque file porte ses
      flèches, plusieurs peuvent servir, et le repli déduit de VOIE-1 reste
      pour les sept manœuvres sur dix qui n'ont pas de marquage relevé.
- [x] PR #121 — ROND-1, le schéma de rond-point (demandes des 29 et 30/08) :
      le moteur ne nomme jamais les giratoires (revérifié sur les DEUX
      moteurs), donc le schéma est dessiné d'après l'anneau OSM et notre
      tracé — entrée, sens de rotation MESURÉ, rang de la sortie. Il
      remplace l'instruction du moteur au lieu de s'y ajouter.
- [x] PR #120 — SORTIE-1, le numéro de sortie et la destination (demande du
      30/08) : relevés dans OpenStreetMap, où ils existent — la note qui les
      disait absents avait cherché dans le service d'itinéraire. Un SEUL
      appel Overpass porte désormais limites, sorties et destinations
      (lib/corridor.ts) : le service est tenu par des bénévoles.
- [x] PR #119 — EURO-1, le cartouche vert européen (type E41) : porté par la
      MÊME requête que les voies, recousu de la même façon ; « E15/E50 »
      donne deux cartouches, deux au plus s'affichent. Il s'ajoute au
      cartouche national au lieu de le remplacer.
- [x] PR #118 — VOIE-1, la chaussée et où s'y placer (demandes des 29 et
      30/08) : deux itinéraires — les manœuvres sur osrm, `nombre_de_voies`
      sur pgr — recousus par projection, ce que la mesure autorise (même
      trajet, écart médian nul, 98,1 % sous 60 m). Les files se dessinent,
      celle où se mettre s'éclaire ; le côté est DÉDUIT de la manœuvre et
      l'interface le dit. Pas d'affectation par voie : la donnée ne la porte
      pas.
- [x] PR #117 — PAN-1, de vrais panneaux de direction (demande du 30/08) :
      l'IISR relevée puis appliquée — fonds bleu/vert/blanc, inscriptions et
      listels selon la règle, cartouches de numérotation E42 rouge et E43
      jaune, listel en retrait, couleurs insensibles au thème sombre. La
      note « aucun champ de voies » a été CORRIGÉE : le champ existe, sur
      une ressource sans instructions de manœuvre (docs/apis.md).
      docs/panneaux.md porte la règle et le prompt GPT-6.
- [x] PR #116 — BIS-1, l'itinéraire bis (demande du 30/08) : une icône dans
      la barre de suivi, quatre calculs réels par un point latéral (2,5 et
      5 km, gauche et droite), et une MESURE de divergence pour garder celui
      qui quitte la route actuelle le plus tôt ; refus explicite quand aucun
      ne s'écarte. Le moteur n'ayant aucun « éviter ce tronçon », le bouton
      ne promet pas d'éviter l'obstacle — il promet de s'écarter.
- [x] PR #115 — CAT-1, le catalogue se cherche et se replie (demande du
      30/08) : 32 marques repliées au lieu de 137 modèles à la file, une
      barre de recherche qui rend une MARQUE entière et dépliée mais ne
      filtre que les MODÈLES quand on cherche un modèle, accents et
      majuscules ignorés ; le <select> reste sous la peau pour le lecteur
      d'écran.
- [x] PR #114 — PLAN-1, le plan reste le vôtre (six retours du 30/08 soir) :
      l'ajout d'un arrêt n'entraîne plus de recalcul (arrêt de courtoisie +
      bouton de recalcul volontaire), plus de dernier arrêt d'une minute
      (second passage sans cette borne), « Arrivée » au lieu d'« avec
      charges », lieux d'exception passés en CALQUE sous les arrêts (c'était
      DOM contre canevas), temps jusqu'à la prochaine borne, et fusion des
      deux champs de recherche réseau/nom de station.
- [x] PR #113 — PEAGE-1, le coût des péages (demande du 30/08) : prix par
      tronçon et total, grille AREA engendrée (16 Ko) ; ce qui n'est pas
      chiffrable est NOMMÉ. APRR écarté sur mesure — fichier corrompu à la
      source, reconstruction tentée et rejetée faute de preuve (docs/apis.md).
- [x] PR #112 — ITI-3, trois itinéraires A/B/C (demande du 30/08) : trois
      calculs RÉELS en parallèle (rapide, court, sans autoroute) — le
      service n'ayant pas d'« alternatives » —, tracés sur la carte et
      adoptables d'un bouton ; total ROUTE + CHARGES quand un véhicule est
      renseigné.
- [x] PR #111 — ZOOM-1, le zoom d'approche (demande du 30/08) : 17,2 sous
      260 m d'un vrai virage, retour à la vue TROUVÉE en entrant (pas à un
      défaut), hystérésis 260/420 contre le battement du récepteur.
- [x] PR #109 — NAV-4, la barre s'annonce et se tait de loin (deux retours du
      30/08) : poignée + chevron pivotant (rien ne disait qu'on pouvait
      déplier), travaux et prochain arrêt annoncés à 10 km au lieu de 50 —
      et rendus par le dépliage, qui rejoue le dernier fixe pour répondre
      tout de suite.
- [x] PR #108 — MOB-1, les chevauchements du bas d'écran (quatre captures du
      30/08) : rond de vitesse au-dessus de l'échelle mesurée, trois chiffres
      sur une ligne (l'heure d'arrivée redevient visible), barre du trajet
      au-dessus de « Recentrer », liens légaux dans la bulle du « i »
      (repliée sur téléphone, ouverte au bureau).
- [x] PR #107 — MEM-1, ce qui était réglé se souvient (trois oublis du
      30/08) : masse et bridages relus (la reconstruction champ par champ
      les perdait), réglages d'arrêt gardés sous une clé commune — et la
      classe `recharge-reserve`, qui nommait deux choses, faisait échouer
      la relecture en silence ; le seuil de zoom des recherches « dans la
      vue » se dit AVANT le clic.
- [x] PR #106 — FEN-6 (trois retours du 29/08 au soir) : le plafond du rail
      ne s'applique plus aux panneaux nichés (fin de la double barre
      d'ascenseur), le choix du repère remonte en tête de « Mon véhicule »,
      et la recherche des lieux d'exception affiche une attente RÉELLEMENT
      peinte — deux trames avant le calcul bloquant.
- [x] PR #105 — NAV-3, la barre de suivi minimale (spécifiée par Armelin le
      29/08) : trois chiffres en 22 px (restant, temps, arrivée), croix rouge
      de 48 px, le reste déplié d'un appui OU d'un glissement ; boussole
      « pressoir » et vue inclinée en icônes ; boutons + et − retirés
      (écran tactile) ; la barre du trajet ne coupe plus les commandes.
- [x] PR #104 — GUID-3, la manœuvre de retard (défaut le plus grave à ce
      jour, relevé au volant le 29/08) : on annonce la manœuvre À VENIR et la
      voie VISÉE, plus celle qu'on vient de quitter ; seuil hors-route 150 →
      80 m, constat 8 → 4 s, repos 30 → 15 s, et le DEMI-TOUR détecté par le
      recul de l'avancement (le tour de rond-point ne réveillait rien).
- [x] PR #103 — FEN-5, la fenêtre AU CENTRE (« je n'ai toujours pas de
      fenêtre flottante », 2e retour) : page centrée sur carte voilée,
      croix de fermeture dans la tête de page, ombre et arrivée propres.
      DEUX FAMILLES séparées par la mesure : les pages qui COMMANDENT la
      carte (couches, recharge, menu réglages) gardent la colonne — douze
      parcours ont montré qu'une fenêtre centrée couvre l'endroit qu'on
      clique.
- [x] PR #102 — FEN-4, le correctif du bureau (retour d'Armelin du 29/08 :
      « la fenêtre est grisée […] et je n'ai toujours pas les fenêtres
      flottantes ») : montée du conteneur porteur sur TOUS les écrans (le
      voile recouvrait le panneau), page et menu détachés en fenêtre au
      bureau, voile allégé sur grand écran.
- [x] PR #101 — FEN-3, l'habit de fenêtre pour TOUTES les surfaces
      flottantes (fiches borne/lieu, copilote) + voile étendu aux
      cartouches, jamais en suivi ; pied de page qui se tait dessous. Et la
      MESURE qui ferme les schémas de manœuvre : ni voies ni ronds-points
      dans la réponse du moteur (docs/apis.md).
- [x] PR #100 — PIC-2, les pictos des options (demande du 29/08) : six
      tracés de plus (piéton, chronomètre, ligne droite, chaussée, voûte,
      arc) dans la famille de PIC-1 ; l'état coché se voit sur le libellé ET
      sur le picto. Le sélecteur de frère adjacent, rompu par l'insertion du
      picto, est passé en frère général — mesuré par le parcours.
- [x] PR #99 — PHOTO-1, la photo des lieux d'exception (DÉCISION d'Armelin
      du 29/08 : « OK pour Wikimedia ») : Wikidata (P380 → P18) puis Commons
      pour la vignette ET son crédit, à l'ouverture d'une fiche seulement.
      DEUXIÈME dérogation de souveraineté du projet, écrite sur « À propos »
      comme la première ; attribution obligatoire sous chaque image.
- [x] PR #98 — GUID-2, le cartouche d'instruction (quatre retours du
      29/08) : la barre du bas collée en bas, vidée de la manœuvre et des
      textes d'explication (partis au copilote), ne masquant plus zoom,
      géolocalisation ni attribution (elle publie sa hauteur) ; l'instruction
      flotte en haut à gauche dans un cartouche coloré par la classe de
      route, écusson compris. Les schémas de voies restent NON promis : le
      service n'expose aucun champ de voies (mesuré).
- [x] PR #97 — FRISE-2, la barre du trajet (trois retours du 29/08) : à
      DROITE (elle coupait le panneau de vitesse), plus longue et plus
      épaisse, peinte aux couleurs du trafic — vert = AUCUN INCIDENT
      SIGNALÉ, jamais « ça roule » : Bison Futé publie des événements, pas
      un débit —, drapeau à damier à l'arrivée, et plus rien dessus que les
      arrêts planifiés.
- [x] PR #96 — NAV-2, le curseur du véhicule (Armelin, 29/08 : « un objet
      fantôme qui se déplace ») : un repère orienté pendant tout le suivi —
      cap GPS, ou déduit de deux fixes quand le récepteur se tait —, en
      flèche, voiture ou point au choix, gardé sur l'appareil. Dessiné par
      le code ; des images plus travaillées ne changeraient que la table
      des formes.
- [x] PR #95 — FEN-2, les fenêtres flottantes POUR DE BON (Armelin, 29/08 :
      la configuration n'en était toujours pas une) : chaque page du
      planificateur et le menu des réglages se détachent en fenêtre haute
      comme son contenu, sur un voile ; l'accueil reste la feuille de BS-1.
      Deux défauts mesurés tombent avec : la poignée étirée (72 px de vide)
      et le sous-menu Fonds hors écran (y = 852 sur 844).
- [x] PR #93 — le partage par la feuille du SYSTÈME (demande des amis
      d'Armelin, 29/08) : navigator.share pour le lien du trajet et les
      fichiers GPX/KML (Web Share niveau 2) — les deux niveaux d'Android
      (applis puis Copier/Imprimer/Enregistrer) fournis par l'appareil,
      zéro service tiers ; bouton visible seulement où l'API existe,
      téléchargement d'avant intact partout ailleurs.
- [x] PR #92 — PIC-1, les pictogrammes de menu (variante A CHOISIE par
      Armelin le 29/08 — « si cela ne me convient pas, on partira sur la
      variante B ») : onze pictos au trait engendrés par le code
      (icone-menu.ts), posés à côté des libellés dans les sept rangées du
      planificateur et les quatre pastilles ; décoratifs par contrat
      (aria-hidden, aucune couleur en dur). La variante B reste en réserve
      pour une éventuelle barre d'outils du copilote.
- [x] PR #91 — FEN-1, la fenêtre flottante (proposition maquettée en
      artefact, VALIDÉE par Armelin le 29/08) : volet borné à 680 px qui
      défile dedans, coins 16 px + ombre `--ombre-flottante` dès 641 px
      (réglages d'affichage compris), réserve basse qui laisse le pied de
      page cliquable — il se peint PAR-DESSUS le volet. PIC-1 (pictos de
      menu) suit dans sa propre PR.
- [x] PR #90 — le mode « arrivée réelle » (DERNIÈRE décision du §4) :
      l'heure d'arrivée compte les charges (suivi et copilote, « charges
      comprises ») ; « Départ à » décale l'arrivée affichée ET la météo du
      plan. LE §4 DU TRIAGE EST SOLDÉ.
- [x] PR #89 — finitions du 29/08 : pastilles d'arrêts en bleu marque,
      durée à droite, theme-color au fond (fin de la barre noire mobile),
      marque sous 400 px, un seul ascenseur dans le planificateur.
- [x] PR #88 — les routines locales (DÉCISION d'Armelin du 29/08) : repères
      au bon moment + habitudes apprises localement (3 trajets = 1 routine),
      visibles et effaçables d'un bouton — jamais hors de l'appareil.
- [x] PR #87 — le recalcul automatique hors-route (demande du 29/08) : le
      bandeau constate l'écart qui dure, le planificateur refait depuis la
      position, le suivi repart tout seul — étapes passées abandonnées.
- [x] PR #86 — les repères se définissent PAR ADRESSE (retour du 29/08) :
      le boulot se saisit depuis chez soi — « Définir ici » et l'appui long
      restent.
- [x] PR #85 — le menu du planificateur s'allège (retours du 29/08) :
      « Sur le trajet » et « Météo à l'arrivée » retirés, « Profil
      altimétrique » déménagé dans le copilote, « Lieux d'exception »
      remonté — sept entrées deviennent quatre.
- [x] PR #84 — le plan de recharge se calcule TOUT SEUL (retours du
      29/08) : déclenché au calcul du trajet quand un véhicule est renseigné,
      annoncé dans le résumé pendant le travail ; les réseaux du filtre carte
      arrivent cochés dans le plan (fin du doublon).
- [x] PR #83 — RETRAIT des transports en commun (décision d'Armelin
      CONFIRMÉE après essai le 29/08, comme la roadmap le prévoyait) :
      panneau, couche, GTFS-RT, annuaire et tests — le tout, proprement.
- [x] PR #82 — le mode copilote (DÉCISION d'Armelin du 28/08) : un panneau
      pour le passager pendant le suivi — recharges à venir avec SOC prévus
      et commodités à la demande, tous les événements devant soi, arrivée et
      météo sur demande. Tout local sauf les boutons ; le partage de position
      entre appareils est ÉCARTÉ d'office (zéro serveur).
- [x] PR #81 — les profils de pauses humaines (DÉCISION d'Armelin du
      28/08) : pause minimale qui PAIE la charge, intervalle 2 h/3 h qui
      force l'arrêt (refus nommé quand c'est lui qui borne), profils
      famille/animal/repas honorés par la mesure OSM (union de disques —
      le corridor saturait Overpass) en préférence, jamais en filtre.
- [x] PR #80 — le plan de recharge sent les conditions (demande d'Armelin du
      28/08) : température aux deux bouts (Open-Meteo), dénivelé (altimétrie
      IGN, en kWh), vitesse du parcours (durée du moteur), bridage BMS
      froid/canicule déclaré par véhicule (VF 8 : relevés d'Armelin au
      catalogue). Relevés une fois par itinéraire ; sans relevés, rien ne
      change ; tout est dit dans « Pourquoi ce plan ? », limite air/batterie
      comprise.
- DÉCISIONS D'ARMELIN : bottom sheets généralisées ; profils de pauses ;
  copilote / routines / arrivée réelle (§4 du triage).

## Itérations suivantes (backlog ouvert)
- PR #28+ — Signalements communautaires (premier backend, hors périmètre 0 €),
  zones de danger…
