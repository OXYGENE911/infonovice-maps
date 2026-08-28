# Mandat UX du 28/08/2026 — triage avant tout code

Armelin a testé la production sur téléphone (captures : accueil satellite
avec amas, planificateur ouvert) et transmis un cahier des charges complet
de refonte UX (rédigé avec GPT-6, 21 sections). Ce document le TRIE selon la
règle du projet : rien ne se promet sans mesure, rien ne se réimplémente en
double, et ce qui contredit une décision mesurée se discute au lieu de
s'écraser.

## 1. Déjà livré (le cahier des charges le redemande)

- Plafond de charge et cible d'arrivée réglables (PR #47) ; arrêts imposés
  (« verrouillés ») qui survivent aux recalculs DU MÊME trajet (PR #28/#47) ;
- fiche compacte cliquable des bornes (PR #33/#44) et des lieux (PR #62) ;
- pictogrammes cohérents dessinés par le code (éclairs, commodités,
  manœuvres — PR #50, #55, #59) ;
- favoris renommables, Maison/Travail, export/import (PR #10, #50) ;
- suivi : caméra rendue à l'usager, wake lock, bandeau réduit, cap GPS,
  vitesse, flèches, vue 3D, limite cartographiée, trafic annoncé
  (PR #53, #58, #59, #60, #63, #64) ;
- météo à l'arrivée avec source et péremption (PR #13) ; profil altimétrique
  (PR #7) ; lieux d'exception avec détour réglable (PR #56/#62) ;
- « Y aller maintenant » : la destination suffit, la position connue sert de
  départ (PR #46) ; itinéraire depuis toute fiche.

## 2. Contredit par une décision MESURÉE — ne pas réimplémenter sans nouvelle donnée

- **Itinéraires alternatifs multiples (A/B/C)** : le moteur public IGN ne
  rend pas d'alternatives (getcapabilities du 21/08). Livré à la place :
  « Comparer avec et sans autoroute » (PR #57), recharge comprise. « Plus
  fiable », « plus confortable », « touristique » : aucune donnée publique ne
  porte ces axes — les proposer serait des étiquettes vides.
- **Coût estimé / péages tarifés** : aucun tarif de péage en source publique
  (mesuré PR #54). Les GARES sont nommées ; le coût ne peut pas l'être.
- **Barre verticale de trafic en dégradé** : écartée avec la mesure
  (27/08 : flux Bison Futé 100 % ponctuel, 6 bouchons nationaux à 20 h).
  Le cahier des charges lui-même exige « ne jamais afficher du vert sans
  donnée fiable » — or il n'y a JAMAIS de donnée de fluidité : la barre
  serait grise en permanence. Livré à la place : l'annonce du prochain
  événement (PR #64). Une TIMELINE d'événements/arrêts/péages (sans
  couleurs de fluidité) reste possible → candidate, voir §4.
- **Disponibilité temps réel des bornes** : écartée avec mesure (6 % de
  statuts frais — PR #30). Redemandée sous « si une source fiable existe » :
  elle n'existe pas, c'est déjà écrit partout où il faut.
- **Badges/abonnements → filtrage de compatibilité** : aucune source
  publique (étude du 27/08 §5). Les réseaux favoris/à éviter existent.
- **Vigilances météo** : hors de portée sans clé (PR #13).
- **Navigation vocale, bouton son** : aucune voix n'existe ni n'est promise.

## 3. À faire — le cœur du mandat, découpé en PR

- **PR UX-1 (celle-ci)** : header mobile compact + safe areas + jetons de
  z-index + contraste du bouton contact Professionnels (cause TROUVÉE :
  `.page-corps a` (0-1-1) écrase la couleur de `.page-action` (0-1-0) —
  bleu sur bleu) + toucher fantôme des suggestions CHERCHÉ ET
  NON REPRODUIT : le preventDefault() du pointerdown supprime déjà les
  événements souris de compatibilité (spec Pointer Events) — un correctif
  écrit puis saboté pour vérification passait dans les deux cas, donc non
  gardé ; un parcours de recouvrement reste en garde-fou. À réévaluer si
  Armelin le reproduit sur appareil avec les étapes exactes + espacement des
  contrôles bas-droite qui se chevauchaient (capture).
- **PR UX-2 — LIVRÉE (PR #71, 0.46.0)** : état « destination
  sélectionnée » — fiche compacte au choix d'une adresse. Les 4 actions
  demandées (Y aller / Planifier / Favori / Options) sont rendues avec ce
  qui est MESURÉ : « Y aller » et « Planifier » sont le même geste ici
  (allerVers ouvre le volet, nomme la destination, déduit ou demande le
  départ) ; « Options » devient les deux gestes qui existent — Photos de
  rue et Copier les coordonnées.
- **PR UX-3 — LIVRÉE (PR #70, 0.45.0)** : planification allégée — bouton
  « Effacer » seulement si un trajet existe ; favoris derrière un bouton
  « Favoris… (n) » ouvrant un <dialog> natif avec recherche, plus en liste
  permanente sous les champs ; « ⇅ Inverser » qui échange points, libellés
  et champs puis recalcule.
- **PR UX-4 — LIVRÉE (PR #72, 0.47.0)** : « Pourquoi ce plan ? » — volet
  sous le plan de recharge, qui n'explique qu'avec ce que le calcul sait :
  consignes (réserve, plafond, cible), choix de l'usager (réseaux, imposées,
  écartées), critère réel par arrêt (compromis distance gagnée / puissance /
  détour), puissance retenue, aveu du modèle. Jamais d'invention.
- **PR EV-1 — LIVRÉE (PR #73, 0.48.0)** : plafond 50-90 (le modèle bornait
  déjà à [50, 100]) ; détour lieux 30 min ; durée de charge sous chaque
  pastille du plan (« sans recharge » pour un arrêt imposé sans besoin).
- **PR NAV-1 — LIVRÉE (PR #74, 0.49.0)** : orientation à trois états au
  bandeau (cap / nord / libre, le choix tient la session) ; cap lissé sur
  l'arc court (35 % par mesure, < 3° ignoré) ; boussole à l'arrêt via
  DeviceOrientation, ouverte APRÈS geste, permission iOS demandée alors,
  alphas relatifs refusés.
- **PR POI-1 — LIVRÉE (PR #75, 0.50.0)** : cinq catégories (Pharmacies,
  Restaurants, Boulangeries, Supermarchés, Toilettes — les parkings sont
  déjà une couche) « dans la vue, à la demande » : un clic = un appel, rien
  au déplacement, refus motivé sous le zoom 12, plafond de 100 annoncé.
  LE DÉCOUPAGE INITIAL EST SOLDÉ : UX-1 à POI-1 livrées (PR #69 à #75).
- **Timeline verticale d'ÉVÉNEMENTS en suivi — LIVRÉE (PR #76, 0.51.0)** :
  position, arrêts de recharge, événements Bison Futé (pas de fluidité — la
  donnée n'en contient pas). Les PÉAGES n'y sont PAS : leur relevé est un
  geste à la demande (PR #54, frugalité Overpass) — les y poser d'office
  déclencherait l'appel à chaque suivi. À réévaluer si Armelin le demande.
- **Profils de trajet — CADRÉS ET LIVRÉS (PR #77, 0.52.0)** : la mesure
  (getcapabilities du 28/08) ne laisse que DEUX optimisations, fastest et
  shortest → « Le plus rapide / Le plus court » sur la page Options, réglage
  porté par le lien partagé (;opt=shortest). « Économe » (pas de modèle de
  consommation côté moteur) et « Sans péage » (pas de contrainte de péage)
  sont ÉCARTÉS avec la mesure ; les évitements autoroutes/tunnels/ponts
  couvraient déjà le reste du levier réel.

## 4. Demande une décision d'Armelin

- Bottom sheets généralisées vs panneaux actuels : refonte lourde de
  l'ergonomie mobile — valider la direction avant d'y engager des semaines ;
- profils de pauses « humaines » (famille, bébé, animal…) : le cadrage
  est séduisant mais chaque profil doit être honoré par des DONNÉES
  (Overpass les porte en partie) — valider le périmètre ;
- mode copilote, routines locales, mode « arrivée réelle » : à cadrer
  individuellement, chacun est un chantier.

Chaque PR de cette série reprend la discipline habituelle : mesures avant
promesses, tests avec chaque livraison, CI verte avant fusion, consignation
ici et au CHANGELOG.
