# Signalement à la Géoplateforme — surestimation des temps sur route nationale

**État : rédigé, PAS ENVOYÉ.** Ce document est prêt à être adressé par
Armelin ; je ne l'ai envoyé nulle part. Les canaux possibles sont donnés en
fin de page.

---

## Le constat

Le service d'itinéraire `data.geopf.fr/navigation/itineraire` propose, pour
certains trajets, un détour de plusieurs dizaines de pourcents par rapport à
l'itinéraire retenu par les autres calculateurs. Le cas qui a déclenché cette
mesure : **Saumur → Montignac-Lascaux**, rendu à **492 km** contre **345 km**
ailleurs, en contournant Poitiers par Vierzon.

Le détour n'est pas une erreur de tracé : c'est la **conséquence arithmétique
d'un coût de traversée surestimé sur les routes nationales**. Le moteur fuit un
corridor qu'il croit lent.

## Ce qui a été mesuré

Mesures faites le 2 septembre 2026, par appels directs au service, profil
`car`, optimisation `fastest`, ressource `bdtopo-osrm` sauf mention contraire.

### 1. Le détour se retrouve sur les trois moteurs

| Ressource | Distance | Durée |
|---|---|---|
| `bdtopo-osrm` | 492 km | 4 h 37 |
| `bdtopo-valhalla` | 493 km | 4 h 39 |
| `bdtopo-pgr` | 493 km | 4 h 39 |

Le comportement ne vient donc pas d'un moteur particulier, mais du **coût
porté par le graphe**.

### 2. Le moteur est juste sur autoroute et surestime sur nationale

| Trajet | Type de voie | Durée annoncée | Durée réelle usuelle | Rapport |
|---|---|---|---|---|
| Paris → Lyon | autoroute | 4 h 46 | ≈ 4 h 30 | **×1,06** |
| Paris → Marseille | autoroute | 8 h 09 | ≈ 7 h 20 | **×1,12** |
| Poitiers → Bordeaux | autoroute | 2 h 43 | ≈ 2 h 12 | ×1,24 |
| Angoulême → Limoges | mixte | 1 h 40 | ≈ 1 h 30 | ×1,11 |
| **Poitiers → Limoges** | **N147** | **2 h 25** | **≈ 1 h 45** | **×1,51** |
| **Saumur → Tours** | mixte | 1 h 03 | ≈ 0 h 48 | ×1,31 |

La vitesse moyenne rendue sur Poitiers → Limoges est de **54 km/h** pour
130 km, sur un axe limité à 80–90 km/h et sans traversée d'agglomération
majeure.

### 3. La conséquence sur le choix d'itinéraire

Décomposition de Saumur → Montignac par le même service :

- Saumur → Poitiers : 166 km / 1 h 56
- Poitiers → Montignac : 255 km / 3 h 37
- **Total du corridor direct : 421 km / 5 h 33**
- Itinéraire retenu par le moteur, via Vierzon : **492 km / 4 h 37**

Le moteur est donc **cohérent avec lui-même** : il préfère 71 km de plus parce
qu'il croit y gagner 56 minutes. C'est le coût unitaire sur nationale qui est
en cause, pas l'algorithme de plus court chemin.

### 4. Un second cas, plus court et plus net

**Saumur → Poitiers** est rendu à **166 km** quand l'itinéraire direct par la
D147 en fait **98 km** (mesuré en contraignant le passage). Le rapport à la
distance à vol d'oiseau atteint **2,02** — le plus élevé des quatorze trajets
français mesurés, dont la médiane est de 1,19.

## Ce que cela suggère

Sans accès au graphe, l'hypothèse la plus simple est que les **vitesses de
référence attribuées aux routes nationales et départementales principales**
sont sensiblement inférieures à la pratique, alors que celles des autoroutes
sont justes. Un écart de l'ordre de 30 à 50 % sur ces classes suffit à
expliquer l'ensemble des mesures ci-dessus.

## Ce que cela change pour les réutilisateurs

Une application de navigation qui appelle ce service de bonne foi propose à ses
usagers des trajets **jusqu'à 40 % plus longs** que nécessaire, sans moyen de
le détecter autrement qu'en comparant à un service concurrent. Pour un véhicule
électrique, cela se traduit par un arrêt de recharge supplémentaire.

## Comment reproduire

```
https://data.geopf.fr/navigation/itineraire?resource=bdtopo-osrm&profile=car
  &optimization=fastest&start=-0.0769,47.2603&end=1.1614,45.0661
  &geometryFormat=geojson&distanceUnit=meter&timeUnit=second
```

et, pour le segment isolé :

```
https://data.geopf.fr/navigation/itineraire?resource=bdtopo-osrm&profile=car
  &optimization=fastest&start=0.3404,46.5802&end=1.2611,45.8336
  &geometryFormat=geojson&distanceUnit=meter&timeUnit=second
```

---

## Où l'adresser

- **Formulaire de contact de la Géoplateforme** :
  <https://geoservices.ign.fr/contact> — rubrique « services de calcul ».
- **Dépôt public des services de la Géoplateforme** (si un suivi d'anomalies y
  est ouvert au moment de l'envoi) : <https://github.com/IGNF>.
- **data.gouv.fr**, sur la fiche du jeu de données correspondant, en
  commentaire — utile pour que d'autres réutilisateurs retrouvent le
  signalement.

Le contenu ci-dessus peut être envoyé tel quel : il ne demande rien d'autre
qu'un examen des coûts de traversée, et il donne de quoi reproduire.
