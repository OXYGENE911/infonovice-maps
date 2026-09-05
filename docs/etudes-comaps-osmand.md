# Étude — CoMaps et OsmAnd face à Infonovice Maps (05/09/2026)

Demande d'amis d'Armelin, rapportée le 05/09 : « étudier comaps.app et
osmand.net ». Lecture des sites officiels le 05/09/2026 (pages d'accueil,
documentation des greffons et des achats). Pas d'essai sur appareil : ce qui
suit compare des promesses publiées, pas des mesures. Ce que nous n'avons pas
mesuré est dit tel quel.

## Les deux en une phrase

- **CoMaps** — fourche communautaire d'Organic Maps (lui-même issu de
  Maps.Me), hébergée sur Codeberg, gouvernance collective ; cartes et
  itinéraires HORS LIGNE (voiture, vélo, piéton, métro dans quelques villes),
  mode « plein air » (sentiers, campings, points d'eau, courbes de niveau,
  Wikipédia hors ligne), zéro traçage (audit Exodus cité). Préinstallée sur
  CalyxOS et iodéOS. Gratuite, dons.
- **OsmAnd** — l'application OSM la plus complète : navigation hors ligne
  voiture / vélo / piéton, topographie (courbes, ombrage, pentes, relief 3D),
  enregistrement de traces, dix-huit greffons (nautique, ski, Mapillary,
  météo 7 jours, OBD-II, édition OSM…), Android Auto. Gratuit limité à 7
  téléchargements de cartes par mois ; **Maps+ 69,99 € une fois ou 39,99 €/an**
  (Android Auto, topographie, bâtiments 3D, cartes illimitées) ; **Pro
  5,99 €/mois ou 39,99 €/an** (relief 3D, mises à jour horaires, météo,
  OBD-II, nuage OsmAnd).

## Ce qu'ils font et que nous ne faisons pas

| Eux | Nous, au 05/09 | Avis |
|---|---|---|
| Cartes et itinéraires **entièrement hors ligne** (tuiles vectorielles et graphe routier téléchargés) | Tuiles en cache (service worker), itinéraire = service IGN en ligne | Hors de portée d'un client web sans backend : le graphe routier de la France ne tient pas dans un navigateur. À dire honnêtement sur la page « À propos » ; un mode « couloir hors ligne » (tuiles du trajet pré-chargées) est faisable. |
| **Topographie** (courbes, ombrage, pentes, relief 3D) | Relief 3D IGN (terrain), profil altimétrique du trajet | Courbes de niveau et pentes : la Géoplateforme sert des flux (SCAN 25, courbes) — chantier RANDO-1. |
| **Enregistrement de traces GPX**, import / export | Tracé GPS du trajet gardé dans l'historique | Export GPX d'un trajet = une fonction pure de plus (HIST). |
| **Sentiers et mode plein air** | Non | RANDO-1 (étude) : un autre produit, ou un mode piéton étendu. |
| Greffons (nautique, ski, astronomie, AIS…) | Non | Hors cible : GPS routier pour le salon de l'automobile. |
| **Android Auto** (OsmAnd, payant) | Non | Étude docs/android-apk-et-android-auto.md : natif Kotlin, phase 2, Pro. |
| Météo 7 jours (OsmAnd Pro) | METEO-VILLE-1 : météo d'une ville, 24 h + 7 jours, libre | Nous l'offrons gratuitement là où OsmAnd la vend. |
| OBD-II / métriques du véhicule (OsmAnd Pro) | Profil véhicule saisi ; partenariats constructeurs en cours | Pro (connexion véhicule). |
| Édition OSM depuis l'app, Mapillary | Liens de signalement (note OSM, cartes.gouv.fr) ; Panoramax | Panoramax = notre Mapillary, souverain. |

## Ce que nous faisons et qu'ils ne font pas

- **Planificateur véhicule électrique** : capacité, santé, relevés
  d'autonomie, arrêts de recharge par réseau, bridages froid / chaud, batterie
  à l'arrivée pendant le suivi. Ni CoMaps ni OsmAnd ne planifient la recharge.
- **Données publiques françaises en direct** : trafic Bison Futé, prix des
  carburants, bornes IRVE nationales, parkings (dont temps réel Aix-Marseille
  et Nantes), aires d'autoroute et commodités, IGN (fonds, BD TOPO,
  altimétrie), BAN. Eux : OSM seul, hors ligne.
- **Guidage routier soigné** : chaussée fléchée, numéros de sortie, schémas de
  rond-point, limite de vitesse, annonces vocales, recalcul hors route, aires
  à venir, Copilote. OsmAnd guide bien ; CoMaps est plus sobre.
- **Recherche à six sources** (IGN, SIRENE, Overpass, Éducation, BAN,
  annuaire) classée par rang — eux : recherche OSM locale.
- **Zéro installation** : une URL, une PWA, mise à jour instantanée. Eux : des
  gigaoctets de cartes à télécharger et à tenir à jour.
- **Vie privée écrite et testée** (RGPD-1 : pages publiques gardées par un
  parcours). CoMaps a le même discours ; OsmAnd a un nuage payant.

## Ce qu'il faut leur emprunter (par ordre d'intérêt pour le salon)

1. **Le hors-ligne dit clairement** : une page « Sans réseau » qui explique ce
   qui marche (tuiles vues, favoris, historique, mesure) et ce qui ne marche
   pas (itinéraire, recherche). Peu de code, beaucoup de confiance.
2. **Export GPX** du trajet et de son tracé GPS (HIST-4) : fonction pure,
   testable à sec, attendue des randonneurs et des motards.
3. **Courbes de niveau / pentes IGN en option d'affichage** (RANDO-1, première
   marche) : un calque WMTS de la Géoplateforme, pas un nouveau moteur.
4. **Pré-chargement des tuiles du trajet** avant de partir (« couloir hors
   ligne ») : le service worker sait déjà mettre en cache ; il manque le
   geste et la jauge.

## Ce qu'il ne faut pas leur emprunter

- Le modèle « fonctions de sécurité payantes » (Android Auto, météo, relief
  derrière Maps+ / Pro chez OsmAnd). Notre ligne : la voix, le guidage, la
  météo restent libres ; le Pro vend la connexion véhicule, les cercles, le
  temps réel et le SaaS flotte (docs Maps Pro).
- Les dix-huit greffons : la profondeur d'OsmAnd est aussi son reproche le plus
  courant (interface chargée). Un GPS de salon se juge en trente secondes.

## Prix, pour la grille Maps Pro

OsmAnd Pro : 5,99 €/mois, 39,99 €/an. Notre proposition B2C (3,99 €/mois ou
39 €/an) est dans la même eau à l'année et moins chère au mois — cohérent
avec un produit plus jeune. CoMaps est gratuit et vit de dons : c'est le
référentiel du libre, et le nôtre reste libre aussi.

Sources : comaps.app (accueil), osmand.net/docs/user/plugins,
osmand.net/docs/user/purchases/android — lus le 05/09/2026.
