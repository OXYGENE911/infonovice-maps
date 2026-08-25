# Planificateur d'itinéraire pour véhicule électrique — étude de faisabilité

**Date :** 25/08/2026 · **Auteur :** session autonome · **Statut :** étude, rien n'est promis

Armelin a demandé « le planificateur d'itinéraire pour véhicule électrique le
plus complet du marché », à l'image d'ABRP et d'Electus. Ce document mesure ce
qui est **réellement atteignable** sous les contraintes du projet, avant
qu'une ligne soit écrite. Chaque verdict s'appuie sur un appel réel daté, pas
sur une intuition.

Les contraintes qui décident, rappelées parce qu'elles tranchent presque tout :

1. **0 €** — aucun service payant, aucun backend, aucune BDD serveur
2. **Souveraineté** — API publiques françaises ou open data français
3. **RGPD by design** — aucune donnée utilisateur ne quitte le navigateur
4. **Budget bundle** < 300 Ko gzippé hors MapLibre

---

## 1. Ce qui est FAISABLE dès maintenant, sans rien changer aux règles

### 1.1 Filtrer les bornes par puissance, connecteur et réseau ✅

**Mesuré le 25/08/2026.** Le jeu IRVE consolidé déjà consommé par la PR #9
(`public.opendatasoft.com`, jeu `mobilityref-france-irve-220`) porte bien plus
de champs que l'application n'en exploite. Relevé sur un enregistrement réel :

| Besoin exprimé | Champ | Exemple relevé |
|---|---|---|
| Type de connecteur | `prise_type_combo_ccs`, `prise_type_2`, `prise_type_chademo`, `prise_type_ef`, `prise_type_autre` | `1` / `0` par type |
| Puissance | `puissance_nominale` | `22` |
| Réseau / enseigne | `nom_operateur`, `nom_enseigne`, `nom_amenageur` | `EASYCHARGE` / `eborn` |
| Tarif | `tarification` | « entre 08:00 et 20:00 : 0.309…€ par kWh » |
| Paiement CB | `paiement_cb`, `paiement_acte`, `paiement_autre` | `1` / `0` |
| Réservation | `reservation` | `1` |
| Horaires | `horaires` | `24/7` |
| Accès | `condition_acces` | « Accès libre » |
| Points de charge | `nbre_pdc` | `2` |
| Accessibilité PMR | `accessibilite_pmr` | « Accessibilité inconnue » |
| Gabarit / deux-roues | `restriction_gabarit`, `station_deux_roues` | « inconnu » / `0` |
| **Clé d'itinérance** | `id_station_itinerance`, `id_pdc_itinerance` | `FREBNPBRWFM` |

**Conclusion :** tous les filtres demandés — puissance, connecteur, réseau,
compatibilité de carte de recharge via l'opérateur — sont réalisables **sans
aucune nouvelle source**. C'est le chantier au meilleur rapport valeur/risque
de toute la liste.

### 1.2 Les anneaux d'autonomie ✅

Trois cercles autour du véhicule — ville, route, autoroute — se calculent
**entièrement en local**, à partir du modèle de consommation et de l'état de
charge. Aucune API, aucun octet réseau, aucune donnée qui sort.

Les chiffres qu'Armelin donne pour sa VinFast VF8 fournissent d'emblée un
étalonnage réel : batterie 87,7 kWh, autonomie théorique 457 km, SOCE 94 %
(donc 436 km à 100 %), ~400 km en ville, ~280 km sur autoroute à 130 km/h
l'été. Soit une consommation implicite d'environ **20 kWh/100 km en ville** et
**31 kWh/100 km sur autoroute** — le rapport ville/autoroute de 1,43 est
cohérent avec ce qu'on observe sur les véhicules de ce gabarit.

**Réserve honnête :** trois cercles parfaits mentent sur le relief et le vent.
Ils disent « au mieux, à plat » et l'interface doit le dire aussi.

### 1.3 Profil du véhicule en local ✅

Marque, modèle, capacité batterie, SOC, SOCE, consommation de référence :
tout cela vit très bien en IndexedDB, comme les favoris de la PR #10, avec
l'export/import JSON déjà en place. **Aucun compte, aucun serveur.**

### 1.4 Commodités des aires de repos ⚠️ probable

L'Overpass API d'OSM porte les aires (`highway=services`, `highway=rest_area`)
et leurs équipements (`amenity=toilets`, `amenity=fuel`, `shop`, `amenity=cafe`,
la marque via `brand`/`operator`). Le projet consomme déjà Overpass avec cache
agressif (contrainte connue : respecter l'usage policy).

**Non encore vérifié** : la couverture réelle des aires françaises et la
qualité du renseignement des marques. À mesurer avant de promettre.

---

## 2. Ce qui est faisable AVEC DES LIMITES RÉELLES

### 2.1 Occupation des bornes en temps réel ⚠️ partiel

**Mesuré le 25/08/2026.** Il n'existe **aucune source nationale** de
disponibilité temps réel. Le jeu IRVE consolidé n'a aucun champ de statut.

Ce qui existe est un **patchwork par opérateur et par ville**, retrouvé sur
data.gouv.fr : « Belib' — disponibilité temps réel » (Paris), « IRVE
dynamique » (plusieurs jeux, un par opérateur : BORNECO…), « larecharge »
(un réseau métropolitain).

Un jeu a été éprouvé pour établir le motif — **Belib', Paris** :

```
GET parisdata.opendatasoft.com/api/explore/v2.1/catalog/datasets/
    belib-points-de-recharge-pour-vehicules-electriques-disponibilite-temps-reel/records
→ HTTP 200 · Access-Control-Allow-Origin: *  (aucune clé)
  statut_pdc   = « Disponible »
  id_pdc       = « FR*V75*EPX08*14*5 »   ← identifiant d'ITINÉRANCE
  last_updated = 13/08/2026 11:52:27
```

L'identifiant d'itinérance est la clé de jointure avec `id_pdc_itinerance` du
jeu statique. **Le montage tient techniquement.**

**Mais la couverture sera très partielle**, et c'est exactement la situation
que la PR #16 a traversée pour les transports : 44 réseaux séparés, agrégés
avec leurs défauts mesurés et affichés. La leçon consignée alors s'applique
mot pour mot ici : *une couverture partielle annoncée comme complète est un
mensonge qui se découvre un mardi matin, batterie à 8 %.*

**Ce qui est demandé et qui n'existe pas :** « le nombre de personnes déjà
branchées » n'est publié nulle part. Le statut par point de charge
(`Disponible` / `Occupé` / `En maintenance`) est le maximum disponible, et
seulement là où l'opérateur le publie.

### 2.2 Calcul d'itinéraire tenant compte du relief, de la météo et du trafic ⚠️

Toutes les briques existent **déjà dans le dépôt** : itinéraire Géoplateforme
(PR #5), altimétrie (PR #7), météo Open-Meteo (PR #13), trafic Bison Futé
(PR #14). Le modèle de consommation est du calcul local.

**La vraie limite est ailleurs :** un planificateur EV digne de ce nom
*optimise* — il choisit les arrêts, arbitre entre une pause longue à 50 kW et
deux courtes à 150 kW, et refait ce calcul quand le trafic change. C'est un
problème d'optimisation sous contraintes, pas un affichage. Faisable en
JavaScript local, mais c'est le morceau le plus lourd de toute la liste, et le
budget de 300 Ko le regarde de près.

### 2.3 Lecture de l'OBD du véhicule ⚠️ Android seulement

**Web Bluetooth** permet à une PWA de dialoguer avec un dongle OBD-II BLE —
donc vitesse, consommation et SOC en direct, sans application native. Deux
réserves qui décident :

- **iOS ne l'implémente pas.** Safari n'expose pas Web Bluetooth ; la
  fonctionnalité serait absente sur iPhone, définitivement.
- L'App Android native (phase 2, dépôt séparé) est le bon endroit pour ça.
  `CLAUDE.md` interdit de mélanger les deux phases.

**Recommandation :** ne pas l'entreprendre dans le client web. La saisie
manuelle du SOC couvre 90 % du besoin pour 1 % de l'effort.

---

## 3. Ce qui est IMPOSSIBLE sous les contraintes actuelles

### 3.1 Comptes utilisateurs et base de données ❌ conflit frontal

La demande — « stocker ses paramètres dans notre base de données pour avoir
une persistance » — heurte **deux contraintes absolues** :

> **1.** Coût de production : 0 €. Aucun service payant, **aucun backend, aucune BDD serveur**.
> **4.** RGPD by design : **aucune donnée utilisateur ne quitte le navigateur**.

Ce n'est pas une difficulté technique, c'est une décision d'Armelin à prendre
ou à refuser explicitement. Trois voies, honnêtement pesées :

| Voie | Coût | Ce qu'elle coûte VRAIMENT |
|---|---|---|
| **Rester local** (IndexedDB + export/import JSON) | 0 € | L'usager change d'appareil → il exporte/importe à la main |
| **Synchronisation chiffrée de bout en bout** | quelques € / mois | Le serveur ne voit que du chiffré, la promesse RGPD tient — mais le 0 € tombe, et la page « Vie privée » doit être réécrite |
| **Comptes classiques** | serveur + BDD + RGPD | Contredit frontalement l'argument de vente du produit |

**Ma recommandation : rester local.** L'export/import JSON existe déjà
(PR #10) et c'est précisément ce que la page « Vie privée » promet en toutes
lettres. Un compte est le premier pas hors de la souveraineté que ce projet
revendique — et le concurrent qu'il combat en fait son fonds de commerce.

### 3.2 Filtre « éviter les péages » ❌ déjà mesuré impossible

`docs/ROADMAP.md`, PR #6, mesure du 21/08/2026 sur le getcapabilities du
service : *« les PÉAGES n'existent sur aucun moteur public — seule clé
waytype : autoroute | tunnel | pont »*.

**L'approximation honnête existe déjà** : en France, éviter les autoroutes
évite l'essentiel des péages, et ce filtre est livré depuis la PR #6. Ce qu'on
peut ajouter, c'est **dire** cette équivalence dans l'interface plutôt que de
laisser l'usager chercher une case « péage » qui n'existera pas.

### 3.3 Logos des réseaux de recharge ❌ deux obstacles

- **Marques déposées** — republier les logos Ionity, Tesla, TotalEnergies…
  sur un dépôt public AGPL n'est pas une évidence juridique.
- **Règle du dépôt** — la PR #21 s'interdit « aucun binaire opaque au dépôt »,
  et Armelin a reconfirmé le 23/08 : ergonomie et CSS seulement.

**L'alternative qui marche :** le nom de l'enseigne est déjà dans les données
(`nom_enseigne`), et une pastille colorée par réseau, dessinée en CSS, donne
le même repérage visuel sans un octet d'image ni un problème de marque.

---

## 4. Ce que je recommande, dans cet ordre

| # | Chantier | Valeur | Risque | Dépend de |
|---|---|---|---|---|
| 1 | **Filtres bornes** (puissance, connecteur, réseau) | très haute | faible | rien — les champs sont là |
| 2 | **Profil véhicule** en IndexedDB (batterie, SOC, SOCE, conso) | haute | faible | rien |
| 3 | **Anneaux d'autonomie** ville/route/autoroute | haute | faible | chantier 2 |
| 4 | **Adresses domicile / travail** | moyenne | très faible | rien |
| 5 | **Arrêts suggérés** avec % d'arrivée visé | très haute | **élevé** | chantiers 1-3 |
| 6 | **Temps réel Belib'** puis autres réseaux | moyenne | moyen | chantier 1 |
| 7 | **Commodités des aires** via Overpass | moyenne | moyen | mesure de couverture |

Les chantiers 1 à 4 sont livrables sans toucher à aucune contrainte. Le 5 est
le cœur d'un vrai planificateur et mérite son propre cycle de conception.

## 5. Suggestions qui ne figuraient pas dans la demande

- **Le SOCE comme dette, pas comme réglage.** Afficher « votre batterie a
  perdu 6 % de sa capacité, soit 21 km » est plus parlant qu'un pourcentage
  abstrait, et c'est une information que personne d'autre ne donne clairement.
- **La marge d'arrivée en minutes, pas en pourcents.** « Vous arrivez avec
  40 km de marge » se comprend mieux que « 12 % ». En hiver, montrer les deux.
- **Dire ce qu'on ignore.** ABRP et Electus affichent une prédiction unique.
  Une fourchette honnête — « entre 12 % et 19 % à l'arrivée selon le vent » —
  est plus utile qu'un chiffre faussement précis, et c'est exactement la ligne
  éditoriale de ce projet depuis la PR #15.
- **Le mode « je ne peux pas y aller ».** Le service le plus utile d'un
  planificateur EV est parfois de dire non tôt, avec le motif.

---

## 6. Décisions qui appartiennent à Armelin

1. **Comptes et base de données** — enfreindre les contraintes 1 et 4, ou
   rester local ? (§3.1)
2. **Ordre des chantiers** — la liste du §4 est une proposition, pas un plan.
3. **Ambition du chantier 5** — un vrai optimiseur d'arrêts est un projet à
   part entière, à cadrer avant d'être codé.
