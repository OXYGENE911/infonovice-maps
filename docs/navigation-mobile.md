# Cadrage — le suivi d'itinéraire sur téléphone

Les demandes d'Armelin du 27/08/2026, capture Petal Maps à l'appui, forment
UN chantier cohérent : rapprocher le suivi d'itinéraire (PR #32) d'une
expérience de navigation — sans franchir la ligne que le projet s'est fixée.

## La ligne qui ne bouge pas

Le suivi « refuse de s'appeler navigation », et les raisons tiennent
toujours : un onglet en arrière-plan n'émet pas de position (iOS l'arrête),
l'écran se verrouille, et aucun recalcul automatique d'itinéraire n'existe
encore. Tout ce qui suit AMÉLIORE le suivi à l'écran allumé, application au
premier plan — et le dit.

Une brique nouvelle est devenue disponible et change une partie du constat :
**l'API Screen Wake Lock** (garder l'écran allumé pendant le suivi) est
aujourd'hui portée par tous les navigateurs récents, iOS Safari compris.
Elle est gratuite, locale, et son échec est bénin. À prendre en premier.

## Les demandes, triées par rapport valeur/risque

1. **Dézoom libre + bouton « Recentrer »** — aujourd'hui le suivi force le
   recentrage à chaque position et le dézoom est repris à l'usager. Remède
   connu des cartes de guidage : le geste de l'usager SUSPEND le suivi de
   caméra ; un bouton « Recentrer » (et/ou un délai de 10-15 s) le rend.
   Aucune donnée nouvelle. LE MEILLEUR RATIO DE LA LISTE.
2. **Cartouche réduit** — le bandeau occupe un tiers de l'écran ; le réduire
   à deux lignes repliables. Pur CSS/DOM.
3. **Boussole / orientation du téléphone** — MapLibre sait tourner la carte
   (`bearing`) ; l'orientation vient soit du CAP GPS (déjà dans chaque
   position, fiable en mouvement), soit de `DeviceOrientationEvent` (à
   l'arrêt ; demande une permission sur iOS). Commencer par le cap GPS :
   zéro permission nouvelle, et c'est ce qu'on veut en roulant.
4. **Vue 3D** — `pitch` MapLibre (60°) pendant le suivi. Attention : le fond
   raster IGN en perspective se dégrade en netteté au loin ; à essayer avant
   de promettre. Les « bâtiments 3D » de Petal Maps, eux, demandent des
   tuiles vectorielles avec hauteurs — hors de portée du fond actuel.
5. **Flèches aux intersections** — la feuille de route (PR #8bis) porte déjà
   chaque manœuvre, sa position et son type OSRM : afficher la PROCHAINE en
   gros (flèche dessinée par le code + distance restante) est un travail
   d'interface sur des données déjà là. Le pictogramme par type de manœuvre
   existe à moitié (feuille de route imprimable).
6. **Vitesse GPS en temps réel** — `coords.speed` de la géolocalisation,
   locale, déjà disponible. Un cercle discret. Facile.
7. **Vitesse limite (ISA)** — la limite de la route empruntée n'est PAS dans
   nos données. Sources possibles : `maxspeed` OSM via Overpass (couverture
   bonne sur les grands axes, interroger à la volée le long du tracé — à
   plafonner sévèrement), ou la BD TOPO route (attribut vitesse moyenne ≠
   limite). AUCUNE n'est en temps réel ni garantie à jour : l'afficher
   demande l'écrire (« limite CARTOGRAPHIÉE, pas mesurée »). À mesurer :
   couverture `maxspeed` sur 3 axes tests. NE PAS confondre avec l'ISA
   réglementaire des constructeurs (caméra + carto certifiée).
8. **Barre de trafic verticale** (nuances vert/orange/rouge + curseur
   d'avancement + arrêts) — le plus GROS morceau. Bison Futé (PR #14) donne
   des ÉVÉNEMENTS pas des vitesses de tronçon : la barre serait
   événementielle (rouge = accident/coupure sur ce segment), pas un dégradé
   de fluidité à la Google. Possible mais à dessiner honnêtement ; les
   fluidités d'agglomération (Bordeaux, Nantes, Rennes — docs/apis.md)
   pourraient l'enrichir localement.

## Découpage proposé (chaque ligne = une PR)

- PR A « La caméra rendue à l'usager » : dézoom libre + recentrer + wake
  lock + cartouche réduit (1, 2 + Screen Wake Lock).
- PR B « Le cap et la vitesse » : carte orientée cap GPS + vitesse GPS (3, 6).
- PR C « La prochaine manœuvre en grand » : flèche + distance (5).
- PR D « Vue 3D » : pitch en suivi, SI l'essai visuel du fond raster tient (4).
- ÉTUDE « maxspeed OSM » avant toute promesse ISA (7) — FAITE, voir §Études.
- ÉTUDE-MAQUETTE « barre de trafic » sur les données Bison Futé réelles (8)
  — FAITE, voir §Études : le dégradé de fluidité est ÉCARTÉ avec la mesure.

## Études — mesures du 27/08/2026 au soir

### maxspeed OSM (pour la vitesse limite « ISA »)

Couverture de `maxspeed` mesurée par Overpass sur trois types d'axes :
- A6 autour de Beaune (motorway) : 112 tronçons sur 114 — **98 %** ;
- N79/RCEA vers Mâcon (trunk) : 142 sur 142 — **100 %** ;
- départementales autour d'Avallon (secondary) : 198 sur 204 — **97 %**.

VERDICT : la couverture PORTE la fonctionnalité. La voie d'implémentation
frugale : UN appel Overpass par trajet (le mécanisme des péages — polyligne
décimée), les limites projetées en intervalles d'avancement, puis le suivi
lit LOCALEMENT la limite du kilomètre courant. À afficher pour ce qu'elle
est : une limite CARTOGRAPHIÉE (travaux et limites variables invisibles),
jamais « ISA » — ce sigle désigne un dispositif réglementaire embarqué.
Candidate à une PR.

### La barre de trafic verticale (dégradé vert/orange/rouge)

Le flux Bison Futé réel, relevé le 27/08/2026 à 20 h 05 : **359 événements
nationaux, tous PONCTUELS** (geometry Point, jamais de tronçon), répartis en
155 travaux, 92 obstacles, 42 restrictions, 23 coupures, 17 accidents…
et **6 bouchons sur toute la France**.

VERDICT : le DÉGRADÉ DE FLUIDITÉ EST ÉCARTÉ, avec cette mesure. Bison Futé
publie des ÉVÉNEMENTS, pas des vitesses de tronçon : une barre
verte/orange/rouge serait verte presque partout presque toujours, et sa
promesse implicite — une fluidité MESURÉE — n'existe pas dans la donnée.
Ce qui reste honnête et utile : annoncer les ÉVÉNEMENTS du corridor dans le
SUIVI, projetés à leur kilomètre (« Travaux au km 78 ») — la mécanique des
péages, appliquée au flux trafic déjà consommé par la PR #14. Candidate à
une PR, plus utile qu'une réglette décorative.

Rien de tout cela ne demande un compte, un serveur, ni une donnée qui sorte
du navigateur : la position reste locale, comme la page « Vie privée »
l'exige.
