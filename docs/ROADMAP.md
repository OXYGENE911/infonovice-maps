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
