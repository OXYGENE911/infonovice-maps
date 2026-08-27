# Études du mandat du 27/08/2026

Six questions d'Armelin qui demandent une mesure ou un cadrage avant tout
code. Chaque section se termine par un VERDICT : faisable (et comment),
écarté (et pourquoi), ou à mesurer (et quoi exactement).

## 1. Une « API maps.infonovice.fr » pour les autres produits Infonovice

La demande : « étudier la possibilité de créer une API qui permettrait
d'interroger maps.infonovice.fr pour l'intégrer à d'autres applications du
repository GitHub (FOOD COMMUNITY, SPORTS COMMUNITY, FAMILY CIRCLE…) »,
publique ou à clé, éventuellement bornée aux sous-domaines infonovice.fr.

### Ce qu'il faut d'abord dire : ce site n'a pas de données à servir

maps.infonovice.fr est un site STATIQUE. Il ne possède aucune donnée en
propre : géocodage (BAN), itinéraires (Géoplateforme), bornes (IRVE),
météo (Open-Meteo) viennent d'API publiques que N'IMPORTE QUELLE
application peut appeler directement, gratuitement, sans clé. Une « API
maps.infonovice.fr » serait donc un PROXY : un serveur qui rappelle ces
services et rend leurs réponses. Elle coûterait de l'hébergement (contrainte
1 : 0 €), engagerait notre responsabilité sur les quotas d'autrui, et
ralentirait chaque appel d'un rebond — pour ne rien offrir que les services
d'origine n'offrent déjà.

### Ce que la phase 1 sait offrir, dès aujourd'hui, sans serveur

1. **La bibliothèque `/src/lib`** — c'est même sa raison d'être, écrite dans
   le CLAUDE.md du projet depuis le premier jour : « le client web expose ses
   modules (géocodage, itinéraire, carte) comme une petite bibliothèque
   interne réutilisable ». `adresse.ts`, `itineraire.ts`, `arrets.ts`,
   `index-bornes.ts`… sont des modules TypeScript purs, sans dépendance au
   DOM pour la plupart, testés à sec. Family Circle ou Food Community les
   consomment en les important — par paquet npm privé du monorepo, par
   sous-module git, ou par simple copie versionnée. C'est la voie recommandée.
2. **Les liens profonds** — le fragment `#iti=…` porte un itinéraire complet
   sans serveur : n'importe quelle application peut CONSTRUIRE un lien
   « voir le trajet sur Infonovice Maps » aujourd'hui même. Un adressage en
   mots (`Dijon-21 BAKE 4831`) se partage pareil.
3. **L'intégration en iframe** — la carte dans une page d'un autre produit,
   avec `postMessage` pour piloter centre/zoom/itinéraire. Faisable, mais à
   ne construire QUE si un produit le demande vraiment : c'est une surface
   d'API à maintenir.

### Et l'API HTTP, alors ?

Elle n'a de sens qu'avec le backend du niveau premium (cadré dans
docs/premium-et-evenements.md) et pour des données QUE NOUS produirions :
itinéraires sauvegardés, cortèges. Ce jour-là : clé d'API par produit, CORS
restreint à `*.infonovice.fr`, quotas par clé. Pas avant.

**VERDICT : bibliothèque partagée + liens profonds MAINTENANT (zéro code
serveur, zéro coût) ; API HTTP seulement avec le backend premium, pour nos
propres données.** Une décision d'Armelin est requise sur le MODE de partage
de `/src/lib` (paquet npm du monorepo, sous-module, ou copie).

## 2. Les péages : OpenStreetMap peut-il rendre l'évitement ?

La demande : « récupérer la liste des péages dans OpenStreetMap pour
l'intégrer à l'algorithme […] éviter les autoroutes fausse l'algorithme, car
certaines portions d'autoroutes sont gratuites. »

Le constat de la PR #6 tient toujours : le moteur public IGN n'expose PAS
d'évitement des péages (seul `waytype` : autoroute|tunnel|pont), et le
CALCUL d'itinéraire lui appartient — on ne peut pas lui injecter un coût
OSM. Recalculer nous-mêmes un itinéraire pondéré exigerait un graphe routier
en mémoire (BRouter & co) : c'est un backend, hors 0 €.

Mais il y a une valeur honnête SANS toucher au moteur : **compter et nommer
les gares de péage du tracé calculé**. OSM les cartographie
(`barrier=toll_booth`), Overpass sait les chercher le long d'une polyligne —
exactement le mécanisme des commodités (PR #29) : requête à la demande,
autour du tracé, plafonnée. L'interface dirait : « Ce trajet franchit
3 gares de péage : Fleury, Saint-Arnoult… » — et l'usager comparerait
lui-même avec la variante « éviter les autoroutes », désormais éclairée.

**VERDICT : l'évitement reste impossible (moteur), l'INFORMATION est
faisable et utile. Candidate à une PR : « Les péages du trajet, nommés »,
avec la même frugalité qu'Overpass-commodités.** À mesurer en l'écrivant :
la couverture réelle de `barrier=toll_booth` sur 3-4 grands axes.

## 3. Restauration sur le trajet, présentée comme restautoroute.fr

Les données existent déjà chez nous : les commodités Overpass (enseigne,
restauration, café, toilettes) s'affichent par arrêt (PR #29), en liste.
La demande porte sur la PRÉSENTATION : « une fenêtre dédiée et stylisée ».

C'est un chantier d'interface, pas de données : une page « Pauses sur le
trajet » du planificateur, qui croise les arrêts de recharge suggérés et les
aires proches du tracé, avec pictogrammes par type (dessinés par le code,
comme les éclairs — jamais de logos de marques déposées). Overpass reste un
commun : chargement à la demande, un appel par vue de page, jamais en
rafale.

**VERDICT : faisable sans nouvelle source. À dessiner d'abord (maquette),
puis une PR. Aucun logo de marque : pictogrammes génériques par type.**

## 4. Monuments à proximité du parcours (comme Nomadio)

La demande : proposer des lieux d'exception à un détour maximal (5-20 min)
du trajet ou des arrêts de recharge.

DATAtourisme est ÉCARTÉ (décision d'Armelin du 25/08 — clé impossible sur un
site statique). La piste restante est la **base Mérimée (monuments
historiques)**, publiée par le ministère de la Culture sur data.gouv.fr en
CSV/JSON SANS CLÉ (jeu « Monuments historiques », dataset
5dde880a634f411e1ee2dc52 — vérifié accessible le 27/08/2026). ~45 000
monuments protégés.

À MESURER avant de promettre, dans l'ordre :
1. la part des lignes AVEC coordonnées exploitables (le champ existe, sa
   couverture est inconnue de nous) ;
2. le poids d'un index réduit (nom, commune, coordonnées, protection) —
   l'étalon est l'index des bornes : 700 Ko pour 14 000 stations, donc
   ~45 000 monuments devraient tenir en 1,5-2 Mo, chargés À LA DEMANDE
   (jamais au démarrage, budget bundle intouché) ;
3. la qualité : un monument « inscrit » peut être une façade privée sans
   intérêt de visite — il faudra peut-être se limiter aux « classés ».

Le détour en minutes se calcule LOCALEMENT : écart au tracé × vitesse
moyenne — même mécanique que « le long du trajet » (PR #11).

**VERDICT : prometteur et souverain (ministère de la Culture, sans clé).
Trois mesures à faire AVANT la PR ; si la couverture des coordonnées est
mauvaise, l'écrire et s'arrêter là.**

## 5. Badges de recharge dans le profil

La demande : renseigner ses badges (Chargemap, Izivia, Electra…) pour ne
voir que les stations compatibles.

Le fichier IRVE consolidé ne porte AUCUNE donnée d'itinérance e-MSP : ni
« badges acceptés », ni accords d'itinérance. Ces données appartiennent aux
plateformes GIREVE/Hubject et aux opérateurs — elles ne sont pas en open
data, et les groupes de travail AFIREV le confirment : l'acceptation d'un
badge X sur un réseau Y n'est publiée nulle part de façon ouverte et à jour.
Afficher « compatible avec votre badge » sur cette base serait inventé — et
l'erreur se découvrirait borne en main.

Ce qui EXISTE et approxime : le filtre par RÉSEAUX PRÉFÉRÉS (carte et
planificateur). Cocher les réseaux où l'on a ses badges revient au même
geste, sans rien promettre de faux.

**VERDICT : ÉCARTÉ en l'état, avec ce motif — aucune source publique ne dit
quels badges une station accepte. Les réseaux préférés sont l'approximation
honnête. À réévaluer si l'open data d'itinérance apparaît (à surveiller :
AFIREV/GIREVE).**

## 6. Itinéraires alternatifs A/B/C (comme ABRP)

Mesuré le 21/08 (PR #6) : le service public d'itinéraire n'a PAS de
paramètre d'alternatives — un appel rend UNE route. ABRP calcule les siennes
sur son propre moteur ; nous n'avons pas de moteur.

Ce qui est faisable sans mentir :
- **La variante « sans autoroute »** : un second appel avec l'évitement,
  présenté côte à côte — distance, durée, ET le plan de recharge de chacune
  (le calcul est local, il se rejoue sur chaque tracé). Deux appels par
  comparaison, pas plus. Couleurs distinctes sur la carte, l'active en
  avant.
- **La variante par étape décalée** (passer par une ville voisine) est un
  artifice : elle produit des détours arbitraires qu'ABRP ne ferait pas.
  Écartée.

**VERDICT : pas d'alternatives « vraies » sans moteur. Une PR « Comparer
avec/sans autoroute » est faisable, honnête et utile aux électromobilistes
(les portions gratuites changent le calcul du temps total avec recharge).
Nommer les variantes par ce qu'elles SONT, jamais « itinéraire B ».**
