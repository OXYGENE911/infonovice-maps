# Changelog — Infonovice Maps

Format : [semver] — date — résumé. Le détail vit dans les PR.

## [1.7.0] — 2026-09-01 — FICHE-3 : la fiche tient à l'écran, dit si c'est ouvert, et se partage (PR #153)

- **LA FICHE NE SORT PLUS DE L'ÉCRAN.** Armelin, sur mobile : « si le POI est
  situé à droite de l'écran, il arrive que la fenêtre s'affiche hors champ et
  le bouton fermer est alors inaccessible ». Mesuré : la bulle s'ancre BIEN à
  l'ouverture — c'est le déplacement de la carte qui l'emmenait ensuite hors
  écran, puisqu'elle suit son point. Le clic recadre désormais le lieu sous le
  centre, et un parcours mesure que la fiche ET sa croix tiennent dans un
  écran de 375 px pour un point collé au bord.
- **OUVERT OU FERMÉ — QUAND ON SAIT.** « Afficher si l'établissement est
  ouvert ou fermé et dans combien de temps il ferme. » La position d'hier
  tient, mais elle admettait une voie du milieu : un ÉVALUATEUR PARTIEL
  HONNÊTE, qui ne rend un verdict que sur les expressions qu'il sait évaluer
  EXACTEMENT — jours et plages simples, 24/7. « Ouvert — ferme à 19 h 00 »,
  « Ferme bientôt (45 min) » sous l'heure pile — le seuil qu'il nomme —,
  « Fermé — ouvre à 14 h 00 ». Le moindre morceau inconnu (jours fériés,
  semaines paires, dates) et le verdict se TAIT : un « ouvert » faux fait
  faire un détour pour rien.
- **« PARTAGE FACILE ».** Un bouton dans la fiche : le lien porte les
  coordonnées et le nom dans le FRAGMENT #, jamais envoyé au serveur, et
  celui qui le reçoit voit la carte s'ouvrir sur le lieu, fiche dépliée.
  DES COORDONNÉES WGS84, PAS UN CODE MAISON : elles s'ouvrent partout, un
  code propriétaire ne s'ouvrirait que chez nous — le Plus Code de Google est
  précisément le travers qu'on évite.
- **LES CUISINES EN FRANÇAIS** : soixante valeurs OSM traduites
  (italian → italienne…) ; l'inconnue ressort telle quelle, une cuisine rare
  mal traduite serait pire qu'un mot anglais.

Tests : 15 unitaires sur l'évaluateur — dont CINQ qui vérifient qu'il se TAIT
sur ce qu'il ne sait pas — et 3 sur la grammaire des jours. 2 E2E : la fiche
mesurée dans l'écran à 375 px, et le lien de partage qui fait l'aller-retour
complet. 1038 unitaires, 308 E2E.

## [1.6.0] — 2026-08-31 — ARRIVEE-2 : l'arrivée attend d'être vraie (PR #151)

- **LE CONSTAT NE MENT PLUS DE QUARANTE MÈTRES.** Armelin : « ne pas indiquer
  l'arrivée trop tôt, car hier ça m'indiquait que j'étais arrivé 40 m
  avant. » Le palier vocal « maintenant » se déclenche à cinquante mètres —
  juste pour un virage, mensonger pour un constat. Les paliers disent
  désormais « vous arrivez à destination » (un futur proche, qui prépare) ;
  le « vous êtes arrivé » attend VINGT mètres — l'incertitude du récepteur
  plus une longueur de voiture.
- **LE CÔTÉ DE LA CHAUSSÉE, MOT POUR MOT** : « Vous êtes arrivé à
  destination. Votre destination se situe sur la gauche (ou la droite) de la
  chaussée. » Le tracé s'arrête SUR la route, l'adresse est à côté : l'angle
  entre la direction d'arrivée et la direction vers l'adresse dit le côté.
  QUAND L'ANGLE NE TRANCHE PAS, ON NE DIT PAS DE CÔTÉ — un côté deviné
  enverrait traverser pour rien une fois sur deux. Le cartouche l'écrit
  aussi : tout le monde ne roule pas avec le son.
- **L'ANIMATION D'ARRIVÉE** : un anneau vert qui pulse sur la destination —
  sobre, une célébration et pas une alarme, immobile pour qui préfère
  l'immobile (prefers-reduced-motion).

Tests : 9 unitaires (le côté gauche/droite/devant, l'adresse confondue avec
le tracé, les points collés qui ne brouillent pas le cap, le seuil borné),
1 E2E qui MESURE ce qui est dit — rien à 45 m, le constat et son côté à
15 m — et voit l'animation. 1016 unitaires, 302 E2E.

## [1.5.0] — 2026-08-31 — PARK-1 : se garer près de l'arrivée, et finir à pied (PR #150)

- **LE PANNEAU P À L'APPROCHE.** Armelin : « un petit panneau rond P lorsqu'on
  arrive presque à destination, afin de proposer une liste de parkings publics
  à proximité ». Il paraît sous 1 200 m de l'arrivée (hystérésis contre le
  clignotement) et NE DEMANDE RIEN tant qu'on ne le presse pas — Overpass est
  un commun bénévole, un parcours compte les requêtes pour le garantir.
- **LA LISTE VA DU PLUS PRÈS AU PLUS LOIN DE LA DESTINATION** — sa demande le
  justifie lui-même : « la fin du trajet entre le parking et la destination se
  fera logiquement à pied ». Les parkings viennent d'OpenStreetMap, autour de
  la destination DEMANDÉE (l'adresse), pas de la fin du tracé (la route). Les
  privés et réservés sont écartés : un parking privé n'est pas une suggestion,
  c'est une contravention. Les grands P bleus se posent sur la carte.
- **« PLACES », JAMAIS « PLACES LIBRES ».** La capacité est cartographiée — on
  l'affiche quand elle l'est. La disponibilité en temps réel n'a AUCUNE source
  nationale gratuite et sans clé : chaque exploitant expose la sienne, ville
  par ville, quand il en expose une. En brancher une poignée ferait un service
  qui marche à Paris et ment partout ailleurs — et toute dérogation demande
  une décision d'Armelin. Le panneau DIT cette limite.
- **« SE GARER » REPLANIFIE** depuis la position courante vers le parking, par
  le chemin ordinaire du calcul — et garde la destination D'ORIGINE.
- **« FINIR À PIED » (point 9)** : à l'arrivée au parking, un bouton vert
  propose — il ne bascule rien tout seul — de continuer en piéton vers la
  destination d'origine, nommée sur le bouton.

Tests : 7 unitaires (le tri par distance, la capacité qui n'est un nombre ou
rien, payant/gratuit/inconnu, le privé écarté, le plafond), 3 E2E — le P qui
paraît sans rien demander, la liste triée et le recalcul mesuré sur l'URL, et
la bascule piéton vers la destination d'origine. 1007 unitaires, 301 E2E.

DÉFAUT ATTRAPÉ PAR UN PARCOURS AVANT LA LIVRAISON : un libellé d'arrivée VIDE
(trajet venu de l'URL) passait le test d'affichage (`!== null`) mais tombait
au test de vérité du clic (`!''`) — le bouton se montrait et ne faisait rien,
le pire des deux mondes. Les deux gardes disent désormais la même chose.

## [1.4.0] — 2026-08-31 — BORNES-3 : chercher « McDonald » trouve les bornes du parking McDonald's (PR #149)

- **LA RECHERCHE VOIT LE NOM, L'ENSEIGNE ET L'EXPLOITANT.** Armelin : « je ne
  peux toujours pas taper McDonald pour n'afficher que les bornes du réseau
  Izivia McDonald, Burger King […] Carrefour […] certains réseaux ont leurs
  bornes dans des parkings d'enseignes, qu'il faut pouvoir distinguer
  séparément. »
- **MESURÉ SUR LE JEU RÉEL, ET C'EST POURQUOI ÇA RATAIT** : « Carrefour » ne
  vit QUE dans l'enseigne (« Carrefour Energies ») pendant que le nom de
  station porte la VILLE (« SETE ») — chercher le nom seul ratait les 4 931
  stations Carrefour. Izivia écrit inversement le site dans le nom de station
  (« IZIVIA FAST - McDonald's - Fronton »). Les trois champs sont désormais
  cherchés, en OU, côté index local COMME côté service.
- Taper « McDonald » n'affiche que les bornes des parkings McDonald's ;
  « Burger King » distingue le sous-réseau Allego Burger King des autres
  bornes Allego. C'est la distinction demandée, sans changer le groupement
  des réseaux cochables — qui reste par exploitant, pour les raisons mesurées
  le 26/08.

Tests : 5 unitaires sur l'index (les trois cas qu'il cite, l'exploitant, et
la station sans enseigne qui ne fait pas tomber la recherche), 1 unitaire sur
la clause service en OU. 1005 unitaires, 300 E2E.
## [1.3.0] — 2026-08-31 — TRAFIC-2 : des dessins au lieu de ronds de couleur (PR #148)

- **UNE COULEUR SE DÉCODE, UN DESSIN SE RECONNAÎT.** Armelin : « les accidents
  Bison Futé sont représentés sous forme de rond rouge, ce qui n'est pas
  visuellement parlant […] Il faut que ça parle de suite visuellement, avec
  des logos un peu plus grands. » Chaque type d'événement porte désormais son
  pictogramme : la voiture et l'éclat de collision pour l'accident, la
  dépanneuse à flèche levée avec son point d'exclamation pour le véhicule
  arrêté, la file entre ses bords de voie pour le bouchon, la barrière pour la
  coupure, le nuage de pluie, l'anneau barré, le camion dans l'anneau, le feu
  tricolore, le « i ».
- **LE CHANTIER EST UN TRIANGLE JAUNE BORDÉ DE ROUGE**, comme demandé — la
  silhouette du panneau AK5 que tout conducteur français reconnaît, avec son
  ouvrier à la pelle. Un code de formes s'apprend ; une silhouette de la route
  est déjà apprise. (Ce sont des évocations lisibles à 36 pixels, pas les
  pictogrammes réglementaires, qui ne survivraient pas à cette taille.)
- **PLUS GRANDS** : trente-six pixels au zoom serré, contre dix-huit pour
  l'ancien rond. Même grammaire de dessin que les lieux et les commodités —
  toute l'application parle d'un seul trait.
- Un défaut de dessin attrapé sur capture : la file du bouchon, trois
  rectangles empilés, se lisait comme un point d'exclamation. Les bords de
  voie la font lire comme une file.

Tests : 1 E2E qui vérifie la couche au symbole, les dix types chacun avec SON
image, et que chaque clé d'image est réellement dessinée — une clé sans image
ferait un trou. 1000 unitaires, 300 E2E.

## [1.2.0] — 2026-08-31 — BORNES-2 : les bornes du trajet suivent le filtre, et la durée d'arrêt se lit (PR #147)

- **LE FILTRE DE PUISSANCE VAUT AUSSI POUR LES BORNES DU TRAJET.** Armelin :
  « j'ai fait un filtre pour n'afficher que les stations avec des bornes de
  plus de 150 kW, et on voit une station avec des bornes de 50 kW et moins
  apparaître, avec son logo gris et une éclair. » La couche du corridor ne
  filtrait que par réseau — le gris qu'il a vu est le palier 1 (jusqu'à
  50 kW). L'AFFICHAGE SEUL est filtré : les candidates du PLAN restent
  entières, parce qu'un arrêt de 50 kW peut sauver un trajet, et les
  pastilles numérotées des arrêts RETENUS s'affichent toujours — cacher une
  étape du plan serait cacher le plan. Le panneau reste la source unique des
  filtres ; le planificateur les LIT, il ne les copie pas.
- **LA DURÉE D'ARRÊT SUR UNE PILULE, PLUS SUR UN HALO** (ARRET-1) :
  « c'est affiché en petit en bleu avec un halo blanc, ce qui nuit à la
  lisibilité ». Le halo laissait le fond de carte traverser entre les
  lettres — illisible sur du satellite. L'image s'ÉTIRE autour du texte
  (stretchX/stretchY MapLibre) : « 18 min » et « 1 h 05 » ont chacun leur
  panneau blanc bordé du bleu des arrêts, lisible sur tout fond.

Tests : 1 E2E qui pose la 50 kW dans le corridor, active le filtre 150, et
vérifie qu'elle disparaît de l'affichage PENDANT que les pastilles du plan
restent. 1002 unitaires, 299 E2E.
## [1.1.0] — 2026-08-31 — FICHE-2 : la fiche se lit, en sombre comme en clair (PR #146)

- **LE TON SUR TON EST MESURÉ, ET CORRIGÉ.** Armelin, sur téléphone : « il est
  affiché dans un encart blanc avec une écriture claire […] c'est écrit ton
  sur ton. » Mesuré en thème sombre : fond rgb(255,255,255) — le blanc EN DUR
  de maplibre-gl.css, qu'aucune de nos règles ne peignait — sous un texte
  rgb(240,242,245) venu de nos variables. Le défaut ne se voyait qu'en
  sombre : sur son téléphone, pas dans mes captures claires. La bulle prend
  les couleurs du thème, pointe et croix de fermeture comprises, et un
  parcours mesure désormais le CONTRASTE réel, pas la présence d'une règle.
- **LES HORAIRES EN TABLEAU** : « une sorte de tableau avec un jour par ligne
  et les horaires associés ». Chaque bloc de l'expression OSM est déjà « des
  jours et leurs plages » — c'est la ligne naturelle. La phrase d'une seule
  ligne reste ce que la voix dirait.
- **LES PASTILLES DU FILTRE PORTENT LE DESSIN DE LA CARTE** : « les POI
  associés sont encore écrits avec un rond de couleur au lieu de leur logo
  dédié ». Les chemins Path2D sont du chemin SVG : un seul jeu de dessins
  sert la toile ET le document — deux jeux se seraient désaccordés au premier
  motif retouché. Le panneau est enfin la légende, trait pour trait.

Tests : 2 unitaires (les lignes d'horaires, et la phrase qui reste leur
jointure), 2 E2E — le contraste mesuré en luminance, et les quatorze pastilles
qui portent un SVG. 1002 unitaires, 300 E2E.
## [1.0.0] — 2026-08-31 — Passage en version 1.0 (PR #145)

**LA DÉCISION EST CELLE D'ARMELIN**, le 31/08 : « Passe en v1.0.0 ». Je
l'avais laissée ouverte en restant en 0.10x — un passage en 1.0 dit au public
« ceci est fini et tenu », et ce n'est pas à l'outil d'en décider.

Ce que 1.0 recouvre, au moment du passage : la carte souveraine (IGN, BAN,
zéro tracking), le planificateur avec recharge et conditions, le suivi avec
guidage vocal, panneaux, giratoires et affectation par voie, le copilote, les
lieux avec fiches et pictogrammes, les favoris en listes avec import Google
Maps, et l'export RGPD. 1000 tests unitaires, 298 parcours de bout en bout.

La suite se numérote en 1.x : une fonctionnalité visible incrémente le
mineur, une correction seule le correctif — semver, comme le mandat l'exige.

## [0.115.0] — 2026-08-31 — FAVORIS-3 : importer ses favoris Google Maps (PR #144)

- **RIEN NE PART CHEZ GOOGLE, ET C'EST LE POINT.** Armelin : « cela serait
  bien de pouvoir exporter et importer ses favoris Google Maps […] recréer une
  structure similaire sous forme de liste ». Le fichier vient de Google
  Takeout, l'usager le télécharge lui-même, et TOUT se lit dans le navigateur.
  Interroger l'API de Google pour compléter ce qui manque serait exactement ce
  que le mandat interdit : envoyer les lieux favoris de quelqu'un chez un tiers
  pour les lui rendre. Un parcours COMPTE les requêtes sortantes pour le
  prouver.
- **DEUX FORMATS, parce que Takeout en rend deux** : le GeoJSON « Lieux
  enregistrés », qui porte les coordonnées, et le CSV d'une liste, qui ne porte
  que des liens. Le format se devine au CONTENU, pas à l'extension : un fichier
  renommé doit passer quand même.
- **LE NOM DU FICHIER FAIT LA LISTE** : « Envie d'y aller.csv » devient la
  liste « Envie d'y aller ». C'est la « structure similaire » demandée, et elle
  ne coûte aucune saisie.
- **CE QU'ON NE SAIT PAS SITUER EST DIT, JAMAIS DEVINÉ.** Certains liens Google
  ne portent qu'un identifiant interne (`cid`, `ftid`) que seul Google sait
  résoudre. Ces entrées ne sont pas importées, et leurs titres sont affichés
  avec la raison. Les géocoder sur le seul titre placerait « Chez Marcel » sur
  un homonyme à trois cents kilomètres — **un favori faux est pire qu'un favori
  manquant, parce qu'on le croit**.
- **ET LES LIGNES QU'ON NE SAIT MÊME PAS LIRE SE COMPTENT** : une ligne décalée
  dont le titre vient après le lien ne donne pas un nom de confiance. Le
  compte-rendu dit les trois nombres — importés, sans position, illisibles.
  Taire les deux derniers ferait croire à un import complet.

Tests : 22 unitaires (les trois formes de lien, le refus des identifiants
internes, le CSV à guillemets, les en-têtes français ET anglais dans n'importe
quel ordre, le GeoJSON, et le nom de liste), 2 E2E dont un qui vérifie
qu'AUCUNE requête ne part chez Google. 981 unitaires, 297 E2E.

DÉFAUT ATTRAPÉ AU PASSAGE, ET C'EST LE TROISIÈME DU GENRE : le champ de
fichier de l'export n'avait pas de nom, et un parcours le désignait par son
TYPE. L'arrivée d'un second champ a cassé le sélecteur. Un élément qu'un
parcours doit atteindre se nomme, dès qu'il existe.

UN PARCOURS INSTABLE STABILISÉ, AUSSI : celui de l'en-tête hors ligne mesurait
le décalage des volets AVANT que le `ResizeObserver` ait publié la nouvelle
hauteur. Il a lâché deux fois sur quatre passes complètes, jamais isolément —
il fallait une machine chargée pour que l'observateur prenne du retard. Même
défaut que le témoin d'attente des lieux d'exception : on ne mesure pas un
état qui n'a pas fini de s'établir.

## [0.114.0] — 2026-08-31 — LIEUX-1 : une fiche, pas une étiquette (PR #142)

- **CE QU'ON SAIT DU LIEU, ET CE QU'ON PEUT EN FAIRE.** Armelin : « quand on
  clique sur un POI à l'écran, il y a juste écrit un texte pour indiquer le nom
  de l'enseigne ou le type de POI, mais ce serait bien d'afficher une fenêtre
  avec du détail sur le POI ainsi qu'un bouton permettant de configurer
  directement un trajet pour y aller ou pour l'ajouter en favoris. »
- **LE DÉTAIL NE COÛTE AUCUNE REQUÊTE** : adresse, horaires, téléphone, site,
  accès fauteuil et cuisine étaient DÉJÀ dans la réponse d'Overpass. On les
  jetait après avoir lu le nom ; il suffisait de ne pas jeter.
- **RIEN N'EST INVENTÉ.** Chaque rubrique n'existe que si la carte la porte :
  une fiche pleine de rubriques vides ferait croire à un lieu mal renseigné
  alors que c'est la donnée qui manque. La source est dite, comme partout.
- **LES HORAIRES SONT MIS EN FRANÇAIS, MAIS ON NE CONCLUT JAMAIS « ouvert ».**
  `opening_hours` est un petit langage à lui seul ; répondre juste demanderait
  les jours fériés, les exceptions de dates et les semaines paires — et une
  réponse fausse sur ce point fait faire un détour pour rien. « Mo-Fr
  08:00-12:00,14:00-19:00; Su off » devient « du lundi au vendredi de 08 h 00 à
  12 h 00 et de 14 h 00 à 19 h 00 · dimanche fermé ». L'usager lit, et décide.
- **LE NUMÉRO SE COMPOSE D'UN DOIGT** : en voiture, recopier dix chiffres n'est
  pas une option. Et un lien externe ne partage rien — `noreferrer` empêche le
  site d'apprendre d'où vient la visite.
- **« Y ALLER » PASSE PAR LA MÊME PORTE QUE LA FICHE DE BORNE** : un seul
  chemin vers le planificateur, pas un second à maintenir. Sans planificateur
  branché, le bouton ne paraît pas — un bouton qui ne fait rien est pire qu'un
  texte.

Tests : 19 unitaires (l'adresse recomposée, le téléphone appelable, les
schémas d'URL refusés, l'accès fauteuil qui se tait quand il est inconnu, et
les horaires en français), 1 E2E qui ouvre la fiche et presse les deux
boutons. 934 unitaires, 284 E2E.
## [0.113.0] — 2026-08-31 — FAVORIS-2 : des listes pour ranger ses lieux (PR #143)

- **UN NOM, UN ÉMOJI, UNE COULEUR.** Armelin : « pouvoir l'enregistrer dans une
  catégorie custom de ses POI en indiquant soi-même un nom, un émoji et couleur
  dédiée […] ou en sélectionnant une liste prédéfinie comme sur Google Maps qui
  possède déjà des listes de favoris prédéfinies pour les restaurants, les
  lieux favoris et les lieux à visiter (Drapeau vert). »
- **LES TROIS LISTES QU'IL CITE EXISTENT D'EMBLÉE** : ⭐ Lieux favoris,
  🚩 À visiter, 🍽️ Restaurants. Une application qui s'ouvre sur « créez votre
  première liste » demande un travail avant de rendre un service.
- **RANGER N'EST PAS JETER.** Supprimer une liste rend ses lieux à « Lieux
  favoris » — perdre ses favoris parce qu'on a supprimé une catégorie serait
  une trahison du contrat. Et les trois listes livrées ne s'effacent pas :
  elles sont le fond du meuble.
- **RANGER COÛTE UN GESTE** : le choix de liste vit DANS la ligne du favori,
  pas dans un écran de plus. Sur téléphone, la ligne passe à deux étages
  plutôt que de déborder — mesuré à 430 px, le dernier bouton sortait de
  l'écran.
- **CE QUI EST BORNÉ, ET POURQUOI** : un nom vide rendrait une liste invisible
  dans son propre panneau ; un émoji de dix signes casserait l'alignement (on
  n'en garde qu'un, mesuré en GRAPPES — « 🇫🇷 » et « 👍🏽 » ne se coupent pas en
  deux) ; une couleur libre pourrait être illisible sur la carte, donc dix
  teintes de la palette des familles, et le choix se voit à l'anneau, pas
  seulement à la couleur.
- **LES FAVORIS D'AVANT REJOIGNENT « Lieux favoris » à la lecture**, sans
  migration ni réécriture : une base qu'on réécrit est une base qu'on peut
  perdre.

Tests : 18 unitaires (les bornes, les émojis composés, les couleurs refusées,
les listes livrées qu'on ne peut pas usurper), 6 E2E — la création complète, le
refus d'une liste sans nom, le rangement d'un favori, et la suppression qui
NE supprime pas les lieux. 951 unitaires, 294 E2E.

DÉFAUT ATTRAPÉ PAR UN PARCOURS : j'avais caché les listes vides pour éviter
l'encombrement — mais une liste qu'on vient de créer est vide par définition,
et la création paraissait donc sans effet. Une liste existe parce que
quelqu'un l'a voulue ; elle se voit.

## [0.111.0] — 2026-08-31 — ACCENTS-1 : rendre leurs accents aux noms de voies (PR #141)

- **LA VOIX PRONONÇAIT « Proph-eu-te ».** Armelin : « mon adresse "Avenue du
  prophète" est écrite "Avenue du Prophete" sans accent. Du coup, la lecture
  vocale prononce le nom tel quel et phonétiquement, ça fait tache […] Si les
  vrais accents étaient présents, la lecture vocale serait de meilleure
  qualité. »
- **LA SOURCE LES A PERDUS, PAS NOUS** — mesuré le 31/08 sur l'API : la
  BD TOPO rend « IMP DU PROPHETE », « R DOCTEUR LEON PERRIN », « AV DE LA
  MARECHALE », en majuscules et abrégé. La BAN elle-même a perdu l'accent sur
  certaines de ces voies.
- **UN DICTIONNAIRE FERMÉ DE 139 ENTRÉES**, et c'est un choix, pas une
  facilité. Deviner les accents du français en général est impossible sans se
  tromper : « cote » et « côte », « mure » et « mûre » sont des mots
  différents. Une règle automatique ferait des fautes AILLEURS pour en
  corriger ici — et une faute inventée est pire qu'une lettre manquante. Seuls
  les mots listés reçoivent leurs accents ; tout le reste passe intact.
- **LES MOTS AMBIGUS SONT ÉCARTÉS EXPRÈS**, et la liste des écartés est écrite
  dans le code : « marche » n'y est pas (« place du Marché » est fréquent, mais
  la Marche est une région), « cote » non plus. Des parcours vérifient
  précisément qu'on ne les accentue PAS.
- **LA MÊME CORRECTION SERT L'ÉCRAN ET LA VOIX** : le nom passe par le même
  chemin. Un parcours mesure ce qui part RÉELLEMENT à la synthèse — « Prophète »,
  et plus aucune forme sans accent.

Tests : 23 unitaires — la liste d'Armelin, ce que le dictionnaire refuse de
deviner, la casse d'origine rendue, et les voies inconnues qui ressortent
comme avant. 1 E2E qui écoute la voix. 919 unitaires, 283 E2E.

## [0.110.0] — 2026-08-31 — CORRIDOR-1 : le couloir suivait la corde, pas la route (PR #140)

**LE DÉFAUT LE PLUS GRAVE TROUVÉ À CE JOUR, et il était totalement muet.**
Armelin, le 31/08 : « un rond-point où le GPS m'a demandé de tourner à droite
au lieu de m'indiquer un schéma de rond-point et me demander de tourner à
gauche à la troisième sortie ».

- **CE N'ÉTAIT PAS LE DÉTECTEUR DE GIRATOIRES.** Sur les données réelles du
  trajet, il trouve les deux anneaux, rangs 4 et 1. C'était la REQUÊTE qui ne
  rapportait rien.
- **LE TRACÉ ÉTAIT SIMPLIFIÉ À UN POINT TOUS LES 300 m**, et `around`
  d'Overpass mesure la distance à la POLYLIGNE qu'on lui donne. En ville, la
  corde coupe les virages et s'écarte de la vraie route bien au-delà des 25 m
  cherchés : la route n'est plus dans le couloir. MESURÉ sur une rue de
  banlieue de 820 m : **4 points, ZÉRO anneau, ZÉRO limite**. Avec la
  simplification garantie : **6 points, CINQ anneaux, UNE limite**.
- **TOUT LE CORRIDOR DISPARAISSAIT AVEC** : limites de vitesse, numéros de
  sortie, destinations de bretelles, schémas de rond-point, affectation par
  voie. Sur autoroute la route est droite et la simplification ne coûtait
  rien — le défaut ne se voyait qu'EN VILLE, là où la conduite est la plus
  exigeante, et c'est pourquoi le panneau de vitesse marchait parfois.
- **DOUGLAS-PEUCKER PLUTÔT QU'UN PAS FIXE** (`lib/simplifier.ts`). Un pas
  assez fin pour les virages produirait des milliers de points sur les lignes
  droites, et une requête trop grosse expire. La simplification garantie borne
  l'écart à 8 m : les droites d'autoroute retombent à deux points, les virages
  en gardent autant qu'il en faut. Mesuré : elle coûte MOINS de points qu'avant
  en ville (9 contre 11 sur 5 km) et sur route (186 contre 217 sur 75 km).
- **ET LE SILENCE EST LEVÉ.** L'appelant écrivait `catch(() => {})` : sans
  corridor, l'usager ne voyait AUCUNE différence avec une route qui n'aurait ni
  limite ni rond-point. Le suivi vaut toujours sans ces repères — on ne
  l'interrompt pas — mais leur absence se dit désormais, une fois, discrètement.
- **LE MÊME TRIPLET QUE LES FEUX ET LES PÉAGES** est appliqué ici : découpage
  en paquets, lecture du `remark` d'expiration, et délai client SUPÉRIEUR au
  budget serveur. Le corridor coupait à 45 s pour un budget de 45 s.

**VÉRIFIÉ CONTRE LE SERVICE RÉEL**, sur un vrai giratoire : avant, « Au bout de
la voie, tournez à droite » sans schéma ; après, **« Prenez la 4e sortie »**
avec le schéma, puis « Prenez la 1re sortie » au giratoire suivant — les rangs
exacts que la fonction pure calculait.

- **ET LA LIGNE DU BAS NE TOUCHE PLUS LE BORD DE L'ÉCRAN.** « Les textes sont
  tellement bas que ça touche presque la bordure de mon écran. » La règle
  téléphone écrivait `padding: 10px 12px` — un RACCOURCI, qui remettait le bas
  à dix pixels et effaçait la marge d'encoche, précisément sur les appareils
  qui en ont une. Mesuré : les chiffres s'arrêtaient à 12 px du bas quand le
  bouton d'arrêt voisin en gardait 24. Ils en gardent 24 à leur tour.

- **ET L'ON RENONCE VITE QUAND LE SERVICE EST MORT.** Le découpage a un
  revers : un trajet en dix paquets face à un service muet passerait dix fois
  le délai d'attente à échouer. On s'arrête après deux échecs de suite — pas
  au premier, parce qu'une requête peut échouer seule.

Tests : 19 unitaires sur la simplification — dont la garantie d'écart MESURÉE
à quatre tolérances, la droite qui retombe à deux points, et un tracé de trente
mille points qui ne fait pas déborder la pile. 5 E2E : le couloir qui ne quitte
plus la chaussée dans les virages (écart mesuré en mètres), le découpage,
l'expiration qui ne se lit pas « route sans repères », le suivi qui vaut
toujours, et la ligne du bas mesurée en pixels. 890 unitaires, 285 E2E.
## [0.109.0] — 2026-08-31 — POI-4 : un motif au lieu d'un rond (PR #139)

- **LE MOTIF DIT LE TYPE, LA COULEUR DIT LA FAMILLE.** Armelin, le 31/08 :
  « pour chaque catégorie de POI, au lieu de faire un rond de couleur
  différente, ce serait bien de faire un rond de couleur un peu plus gros,
  mais avec un motif clairement identifiable », suivi d'une liste : couverts,
  lit, croix, tasse, verre à cocktail, P, caddie, haltères, grande roue, clé,
  cintre, avion, train, dent, patte de chat.
- **SA LISTE EST PLUS FINE QUE LES FAMILLES**, et c'est ce qui rendait la
  demande délicate : une tasse pour un café et un verre pour un bar, alors que
  les deux vivent dans la même famille. Une famille par dessin aurait fait
  vingt pastilles à cocher — ce que POI-2 refusait à bon droit. **On sépare
  donc les rôles** : la couleur reste grossière parce qu'elle doit se retenir ;
  le motif est aussi précis que la donnée le permet, parce qu'il n'a rien à
  retenir — il se reconnaît. Vingt-quatre motifs pour quatorze familles.
- **TROIS CATÉGORIES DE SA LISTE N'EXISTAIENT NULLE PART** : salles de sport,
  gares et aéroports. Elles sont désormais cherchables. Et « Pharmacies »
  devient « Santé » pour que le dentiste et le vétérinaire le soient aussi —
  on cherche un soin, pas un métier, et chacun garde son propre motif.
- **DESSINÉS PAR LE CODE, JAMAIS COMMITTÉS**, comme les pictos de commodités :
  aucun binaire au dépôt, aucun logo d'enseigne. Une image par couple
  (motif, couleur), fabriquée une seule fois — une vue de centre-ville porte
  des centaines de lieux pour une vingtaine de dessins.
- **ET PLUS GROS**, comme demandé : mesuré à l'écran, sous vingt-cinq pixels
  le caddie et la clé ne se distinguent plus.

Tests : 25 unitaires — la liste d'Armelin dessin par dessin, la séparation des
rôles, et le silence permis quand la donnée ne dit rien de précis. 2 E2E : le
café et le bar qui partagent la couleur sans partager l'image, et les quatorze
familles. 893 unitaires, 278 E2E.

DEUX DÉFAUTS ATTRAPÉS PAR LES TESTS AVANT L'USAGER : mon fourre-tout
« boutique » passait avant les règles précises — une pharmacie qui vend des
cosmétiques recevait une devanture au lieu de sa croix ; et une étiquette VIDE
comptait comme une valeur (`!== undefined` est vrai pour `''`). Le même défaut
dormait dans le classement en familles depuis le 30/08.

## [0.108.0] — 2026-08-31 — VÉHICULE-2 : le rayon d'action dit à quelle charge il répond (PR #138)

- **UN CHIFFRE JUSTE ET INEXPLICABLE VAUT UN CHIFFRE FAUX.** Armelin : « dans
  le menu de la voiture, l'autonomie du rayon d'action affiché ne correspond
  pas à l'autonomie configurée dans les paramètres du véhicule. » Il saisissait
  480 km en ville et lisait 384. **Le calcul était juste** — 480 × 80 % de
  charge — mais il s'affichait sous un titre « autonomie constatée à PLEINE
  CHARGE » sans que rien ne dise qu'on répondait à la charge COURANTE. Un
  chiffre qu'on ne peut pas expliquer ne se distingue pas d'une panne, et il
  fait douter de tout le reste.
- **LA PHRASE VIENT AVANT LES CHIFFRES**, parce qu'elle les qualifie :
  « Rayon d'action à 80 % de charge — pas à pleine charge ». La santé de la
  batterie s'y ajoute quand elle joue aussi.
- **ET LE RAPPROCHEMENT AVEC LA SAISIE EST À PORTÉE DE SURVOL** : « soit
  480 km à pleine charge ». C'est exactement la question qu'il s'est posée, et
  la réponse tient sur une ligne.
- **À PLEINE CHARGE, IL NE S'EXCUSE DE RIEN** : à 100 %, il n'y a rien à
  expliquer, et une phrase de plus serait du bruit.

Tests : 3 unitaires (les facteurs, leur bornage, et le retour de l'affichage à
la saisie), 2 E2E — la phrase qui manquait, et son absence quand elle serait
inutile. 858 unitaires, 275 E2E.

## [0.107.0] — 2026-08-31 — RELEVÉS-1 : les feux et les péages tiennent enfin leur promesse (PR #137)

Armelin, le 31/08 : « quand je clique sur afficher les feux tricolores d'un
trajet, ça me met un message m'indiquant que les feux n'ont pas pu être relevés
et ça m'invite à réessayer plus tard. Idem pour les péages. » Deux
fonctionnalités livrées qui ne fonctionnaient pas. **TROIS CAUSES, TOUTES
MESURÉES** le 31/08 sur Paris–Marseille (775 km) :

1. **UNE SEULE REQUÊTE POUR TOUT LE TRAJET.** Le couloir `around` de 775 km
   épuise le budget d'Overpass : expiration serveur à **26 s** pour les péages,
   **45,7 s** pour les feux. Ce n'était pas une panne du service, c'était une
   demande déraisonnable de ma part.
2. **LE CLIENT ABANDONNAIT AVANT LE SERVEUR.** Péages : coupure à 15 s pour un
   budget serveur de 25 s — on renonçait à une réponse qui arrivait. Feux :
   coupure à 45 s pour un budget de 45 s, une course perdue d'avance.
3. **UNE EXPIRATION SE LISAIT « ZÉRO ».** Overpass qui renonce rend
   `elements: []` **avec** un champ `remark` que personne n'inspectait. Le pire
   des trois défauts : silencieux. Un trajet s'affichait sans péage là où il en
   traverse quarante-huit.

**LE REMÈDE, MESURÉ AUSSI** (`lib/troncons.ts`) : le trajet est découpé en
tronçons de 130 km interrogés **à la file**, jamais en parallèle. Les péages
passent d'une emprise par tronçon plutôt que d'un couloir — et l'on filtre au
tracé exact **localement**, ce qui ne coûte rien à personne.

- **PÉAGES : 48 gares en 17 s**, avec leurs noms et leurs kilomètres, là où
  l'on lisait « Les péages ne sont pas disponibles pour le moment ».
- **FEUX : 55 carrefours en 122 s**, annoncés comme un **minimum** parce qu'un
  tronçon sur six n'a pas répondu. C'est long, et c'est dit : l'attente se
  compte en tronçons à l'écran.
- **UN RELEVÉ PARTIEL S'ANNONCE PARTIEL.** Un compte tronqué qui se présente
  comme complet vaut moins qu'un minimum avoué.
- **ON RESPIRE ENTRE DEUX TRONÇONS** (600 ms). Mesuré : six requêtes lourdes
  enchaînées sans pause se font limiter par le service — le relevé des feux
  échouait ENTIÈREMENT quand il suivait celui des péages, alors qu'isolé il
  aboutissait. Et un garde-fou plafonne le nombre de tronçons : un tracé
  aberrant ne lancera pas une rafale sur un service bénévole.

UN FAUX SOUPÇON ÉCARTÉ, ET C'EST POURQUOI ON MESURE : je croyais
l'échantillonnage du couloir trop lâche (un point tous les 300 m pour un rayon
de 20 m). Faux — `around` traite une liste de coordonnées comme un COULOIR, pas
comme des disques isolés : 11 points rendent les mêmes 43 feux que 55. J'ai
failli « corriger » ce qui marchait.

Tests : 12 unitaires sur le découpage, l'emprise, la lecture de l'aveu du
service et le délai client ; 5 E2E sur l'honnêteté — l'expiration qui ne se lit
pas « zéro », le relevé partiel annoncé comme minimum, le découpage effectif,
l'attente qui se compte. 855 unitaires, 276 E2E.

## [0.106.0] — 2026-08-31 — POI-3 : le filtre se passe de son bouton (PR #136)

- **LA RECHERCHE SUIT LA CARTE.** Armelin : « ce serait bien que les POI
  sélectionnés s'affichent tout seuls, dès lors où le niveau de zoom est
  suffisant […] Cela évitera d'avoir à cliquer sur un bouton de recherche.
  Plus c'est simple pour l'utilisateur et plus facile sera l'adoption. » Il a
  raison : un bouton de recherche est un péage payé à chaque rue.
- **MA RÉSERVE D'HIER APPELAIT UNE GARDE, PAS UN REFUS.** J'avais écrit que le
  filtre ne chercherait JAMAIS tout seul, parce qu'Overpass est un commun
  bénévole. La contrainte était juste, la conclusion trop courte. Quatre
  gardes rendent l'automatisme gratuit pour le service : le zoom minimal, la
  **mémoire des zones déjà couvertes** (`lib/couverture.ts` — revenir sur ses
  pas ne redemande RIEN), une recherche **plus large que la vue** pour
  absorber les petits déplacements, et le repos (on n'agit qu'à l'arrêt de la
  carte, jamais deux fois dans la même seconde et demie). Traverser une ville
  coûte quelques requêtes, pas une par image.
- **LES LIEUX S'ACCUMULENT** au lieu de clignoter : le restaurant repéré ne
  disparaît plus au premier glissement du doigt.
- **LA LIGNE D'ÉTAT NE SE TAIT PLUS.** Elle disait le zoom manquant, puis le
  choix manquant, puis se vidait une fois le choix fait — au seul moment où
  l'usager attend qu'on lui dise ce qui se passe. Un panneau muet se prend
  pour un panneau en panne. Une panne du service se dit, et se REDIT au
  déplacement suivant : une carte vide sans explication passe pour une carte
  sans lieux.
- **IL NE CHEVAUCHE PLUS LE PLANIFICATEUR** (« en mode desktop, le bouton de
  filtre est superposé sur le bouton itinéraire »). Mon `top`/`left` en dur
  visait exactement la place d'un contrôle « top-left » de MapLibre — celle du
  planificateur. Confié au même empilement, il se range dessous tout seul, sur
  tous les écrans. C'est MESURÉ en pixels par un parcours, pas confié à une
  règle CSS.
- **UN ENTONNOIR** à la place des trois barres, qui se lisaient comme un
  réglage de son.

Tests : 13 unitaires sur la mémoire des zones, 8 E2E dont trois nouveaux — la
recherche qui part seule, l'aller-retour qui ne redemande rien, et la ligne
qui ne se tait jamais. 855 unitaires, 273 E2E.

DÉFAUT PAYÉ, ET C'EST LE MÊME QUE LA VEILLE AU QUATRIÈME DEGRÉ : pour lever
la collision de `.poi-etat`, j'avais passé le renommage sur TOUT le fichier
CSS. Les règles du panneau des services ont suivi alors qu'elles ne me
concernaient pas : il est resté sans style pendant deux versions, et ma propre
ligne héritait d'un positionnement absolu qui n'était pas le sien — la
bandelette flottante visible sur les captures. Un renommage se fait par
sélecteur, pas par fichier.

## [0.105.0] — 2026-08-30 — POI-2 : le filtre des lieux, sur la carte (PR #135)

- **LE FILTRE S'ATTEINT EN UN GESTE, DEPUIS LA CARTE.** Armelin : « ce serait
  bien d'afficher quelque part sur la carte une icône pour afficher les POI
  comme un filtre, avec Restaurants, Shoppings, Supermarchés, Vêtements,
  Cafés, Hôtels, Bars, Attractions, Musées, Cinémas, Centres commerciaux, DAB,
  Parkings, Lavage auto, Garages auto, Pharmacie, Pressing, etc., de manière
  ergonomique. » Il fallait auparavant ouvrir le planificateur, descendre dans
  « Recharge et services », cocher, puis revenir à la carte.
- **DOUZE FAMILLES, PAS DIX-SEPT CASES.** Dix-sept étiquettes ne tiennent pas
  sur un téléphone, et personne ne cherche « cinémas » sans chercher
  « musées ». On regroupe donc par famille — ce qu'on cherche d'un même
  geste — en gardant CHAQUE étiquette de sa liste dans le filtre de sa
  famille : rien n'est perdu, tout tient en douze boutons. Le « etc. » de sa
  demande est honoré au passage (théâtres, auberges, points de vue, bureaux
  de change, coiffeurs).
- **UNE SEULE REQUÊTE POUR TOUTES LES FAMILLES COCHÉES.** Overpass est tenu
  par des bénévoles : douze requêtes là où une union suffit seraient douze
  fois trop. Le plafond de lieux vaut pour l'union, sans quoi une vue de
  centre-ville rendrait mille points illisibles.
- **ET IL NE CHERCHE JAMAIS TOUT SEUL** : ni au déplacement, ni au zoom, ni au
  clic d'une pastille. Seul « Chercher dans cette vue » interroge le service,
  et l'état DIT toujours pourquoi il ne rend rien — trop loin, rien de coché,
  ou la vue a bougé depuis la dernière recherche. Le choix des familles
  survit au rechargement : c'est un réglage, pas un geste de session.
- **LA COULEUR DU POINT EST CELLE DE SA FAMILLE**, lue sur ses étiquettes :
  la réponse d'une requête à douze filtres ne dit pas lequel a répondu, c'est
  donc un tableau ordonné qui tranche (une pharmacie qui vend des cosmétiques
  reste une pharmacie). Le panneau devient ainsi la légende de la carte.
- **UNE CONSÉQUENCE ASSUMÉE** : le volet « Recharge et services » du
  planificateur montre les mêmes douze familles — une seule liste, deux
  endroits. « Boulangeries » n'y est plus une case à part : elle est entrée
  dans « Commerces ».

Tests : 12 unitaires (classement par famille, ordre de priorité, union
d'URL, plafond), 6 E2E (ouverture en un geste, aucun appel spontané, l'état
qui dit pourquoi, l'union en un seul appel, la vue qui a bouge, la survie au
rechargement). 842 unitaires, 271 E2E.

DÉFAUT PAYÉ, TROISIÈME DE LA SÉRIE : `.poi-etat` nommait déjà autre chose
dans le panneau des services, et un parcours a buté dessus avant l'usager.
Après `.bg-voie` et `recharge-reserve`, le préfixe se choisit d'avance.

DEUXIÈME DÉFAUT, LU DANS LA CI DE main : le parcours des lieux d'exception
attendait un témoin d'attente qui avait déjà cédé la place au résultat quand
l'assertion arrivait — la CI a rougi sur main le 30/08 pour cette seule
raison. Le parcours tient désormais la réponse simulée, mesure, puis relâche :
on ne court pas après un état fugace en espérant arriver à temps.

## [0.104.0] — 2026-08-30 — COPILOTE-1 : le copilote montre au lieu de faire cliquer (PR #132)

- **LES COMMODITÉS SONT STRUCTURÉES, comme dans la fiche de borne.** Armelin :
  « dans Copilote, les informations sont affichées sous forme de texte alors
  que sur une borne elles sont structurées, ligne par ligne, avec la distance
  et un logo. Ce serait bien de faire le même principe. » La fiche avait ce
  rendu depuis le 27/08 : on l'EXTRAIT (`carte/liste-commodites.ts`) plutôt
  que de le recopier — deux écritures du même affichage se seraient séparées
  à la première retouche.
- **LE PROFIL ET LA MÉTÉO PARAISSENT SANS UN CLIC DE PLUS.** « Ce serait bien
  de les afficher directement dans Copilote, sans avoir à cliquer sur un
  bouton. » Ouvrir le copilote EST le geste ; un second clic par section
  était un péage. L'appel reste UNIQUE par trajet — la réponse survit aux
  fixes suivants, et deux parcours le vérifient en comptant les appels.
- **LE VÉHICULE SE VOIT SUR LE PROFIL.** « Un petit rond de couleur pour
  indiquer où en est le véhicule sur le tracé. » Il s'y trouve, et il se
  DÉPLACE d'un fixe à l'autre sans redemander le profil. Le calcul vit dans
  lib/altimetrie.ts, avec les MÊMES marges que la courbe : un rond calculé
  autrement flotterait à côté d'elle.
- **ET LE NOM NE SE CLIQUE PAS DANS LE COPILOTE** : la carte y est occupée
  par la route. Un bouton qui ne ferait rien serait pire qu'un texte.

Tests : 5 unitaires sur le placement du rond (échelle, marges, interpolation,
bornes, profil plat), 2 E2E réécrits — l'un mesure que la liste porte logo et
distance et qu'elle est triée par distance, l'autre que rien n'attend un
clic. 836 unitaires, 265 E2E.

## [0.103.0] — 2026-08-30 — ERGO-3 : des dessins au lieu d'un formulaire (PR #131)

Armelin : « les textes Ma position, domicile, travail, favoris sont affichés
sous forme de texte. L'ergonomie fait trop formulaire. »

- **DOMICILE PORTE UNE MAISON OCRE, TRAVAIL UN IMMEUBLE GRIS, FAVORIS UNE
  ÉTOILE JAUNE.** « Ma position » reste en toutes lettres, comme demandé.
- **LE MOT RESTE À CÔTÉ DU DESSIN.** Deux icônes seules se confondent — une
  maison et un immeuble, à vingt pixels, ne se distinguent qu'à la couleur —
  et le nom accessible ne remplace pas ce que l'œil cherche. C'est ce que
  font les cartes du commerce.
- **LES AUTONOMIES PRENNENT LA COULEUR DE LEUR ANNEAU.** « Ce serait bien
  d'ajouter un peu plus de couleur pour l'autonomie constatée […] ce qui
  permettra aux gens de mieux comprendre le cercle du rayon d'action, qui
  n'est pas accompagné d'une légende. » C'est exactement cela : la couleur
  n'est pas un ornement, c'est LA LÉGENDE qui manquait. Vert en ville, ambre
  sur route, rouge sur autoroute — les teintes EXACTES des cercles, prises
  dans lib/vehicule.ts et non redéfinies : deux jeux de couleurs se seraient
  désaccordés au premier changement.
- **ET LA COULEUR NE PORTE PAS L'INFORMATION SEULE** : le libellé la dit, et
  le titre nomme l'anneau correspondant. Un daltonien lit la même chose.

Tests : 2 unitaires sur les couleurs de la légende (unicité, format), 1 E2E
qui vérifie le dessin ET sa teinte calculée sur le bouton Domicile. Trois
parcours mis à jour (« Favoris… » devient « Favoris »). 831 unitaires, 265 E2E.

## [0.102.0] — 2026-08-30 — VOIX-2 : les arrêts de recharge annoncés (PR #130)

Armelin : « fais les annonces vocales de recharge ».

- **DEUX PALIERS, ET PAS TROIS.** Dix kilomètres — le moment où l'on décide
  encore de s'arrêter avant, ou de pousser — puis un kilomètre, celui du
  clignotant. Entre les deux, il n'y a rien à décider, et une voix qui répète
  est une voix qu'on coupe.
- **QUAND, OÙ, COMBIEN DE TEMPS**, dans l'ordre où la question se pose au
  volant : « Arrêt recharge dans 10 kilomètres, Ionity Beaune-Tailly,
  24 minutes de charge ». Le réseau ne se répète pas quand le nom le porte
  déjà.
- **LA MANŒUVRE PASSE D'ABORD**, comme pour le trafic : un arrêt à dix
  kilomètres attendra la fin du virage.
- **ET L'ARRÊT PASSE AVANT LE TRAFIC** dans les blancs : il demande une
  DÉCISION, quand le trafic informe.
- **UN DÉFAUT TROUVÉ PAR LE PARCOURS** : sans feuille de route, AUCUNE
  annonce ne sortait — pas même le trafic ni la recharge, qui n'en dépendent
  pas. Or la feuille manque plus souvent qu'on ne croit : service
  d'instructions en panne, itinéraire rejoué depuis un lien.

Tests : 7 unitaires (paliers, garde de manœuvre, formulation, arrêt suivant),
1 E2E qui parcourt un tiers du trajet fixe par fixe et vérifie que l'annonce
tombe UNE fois, ni avant ni deux. 829 unitaires, 265 E2E.

## [0.101.0] — 2026-08-30 — ERGO-2 : cinq retours du volant, dont deux de mes défauts (PR #129)

- **LA VOITURE EST ENFIN BASSE DANS L'ÉCRAN.** « Elle est toujours centrée au
  milieu ; j'avais demandé qu'elle apparaisse plus bas. » Mon premier calcul
  visait deux tiers de la carte VISIBLE — ce qui, avec une barre de deux
  cents pixels, retombe pile au milieu de l'ÉCRAN. Le calcul était juste, la
  cible était mauvaise. À 78 %, la voiture se pose à cent quarante pixels
  au-dessus de la barre. MESURÉ cette fois, pas typé.
- **LA BOUSSOLE BASCULE VRAIMENT, ET DANS LES DEUX SENS.** « Ça ne
  fonctionne pas. » Deux défauts, tous deux de moi : j'avais remis le lissage
  du cap à zéro le matin même — perdant le dernier cap connu — et mon
  recentrage ne NOMMAIT pas le cap, alors qu'`easeTo` fige ce qu'il ne nomme
  pas. À l'arrêt, le récepteur ne donne aucun cap (il en faut 7 km/h) : la
  carte restait donc au nord indéfiniment. Le dernier cap connu est
  désormais rendu tout de suite. L'écouteur passe aussi par DÉLÉGATION : la
  boussole est refaite à chaque changement de fond.
- **ELLE PORTE SES POINTS CARDINAUX** — N en rouge, E, S, O. Deux pièges
  payés au passage : la classe est `maplibregl-ctrl-icon` et non
  `compass-arrow`, et MapLibre écrit un sélecteur à 0-3-1 qu'une règle à
  0-2-0 ne peut pas battre. Une règle CSS qui ne s'applique pas ne se plaint
  jamais.
- **LE BOUTON DE VUE DIT « 2D » OU « 3D »** au lieu d'un parallélogramme :
  « pour que l'utilisateur comprenne qu'il faut appuyer de nouveau ».
- **LA PASTILLE DE VITESSE SE DÉCOLLE DE L'ÉCHELLE** (dix-huit pixels au lieu
  de dix) : « le rectangle blanc est littéralement collé au cercle ».
- **ET LA BULLE DES LIENS NE L'ATTEINT PLUS.** Trois approches essayées, deux
  jetées : un `:has()` écrit, chargé, matché — et sans effet ; puis une
  classe posée d'après l'état interne de MapLibre, dont la logique est
  INVERSÉE (`open` marque le replié, `compact-show` l'ouvert). La retenue :
  la bulle s'arrête à 62 % de la largeur, côté droit. Ce qui n'a pas d'état
  ne peut pas se désynchroniser.

Tests : 6 E2E dédiés, dont deux qui mesurent la position de la voiture en
pixels et la bascule de la boussole SANS nouveau fixe. 822 unitaires, 264 E2E.

## [0.100.0] — 2026-08-30 — FEUX-2 : les feux du trajet sur la carte (PR #128)

<!-- 0.100.0 ET NON 1.0.0 : passer en 1.0 dit « le produit est stable et
     complet », et c'est une décision d'Armelin, pas une conséquence
     mécanique du compteur. 0.100.0 est un numéro semver valide ; le 1.0
     attendra qu'il le prononce. -->

Armelin : « fais l'affichage des feux sur la carte ».

- **UNE CASE À COCHER, À CÔTÉ DU COMPTAGE** : même donnée, même question. Les
  feux se posent sur la carte, un point rouge cerclé de sombre par carrefour.
- **À LA DEMANDE, ET UNE SEULE FOIS PAR TRAJET.** Overpass est un commun
  bénévole : rien n'est relevé tant que personne ne demande, et décocher puis
  recocher ne redemande rien. Un parcours le vérifie en comptant les appels.
- **UN POINT PAR CARREFOUR, PAS UN PAR TÊTE DE FEU** — la même règle que le
  comptage. La carte et le chiffre doivent dire la même chose : deux nombres
  qui se contredisent valent moins qu'un seul.
- **SEULEMENT LES FEUX DU TRAJET.** Afficher ceux de toute la vue serait une
  autre fonctionnalité, plus lourde, et qui ne répond pas à la question
  posée — « optimiser mon trajet ».
- **PAS AVANT LE ZOOM 11** : un trajet urbain porte cent carrefours, et cent
  points à l'échelle d'une région font une tache, pas une information.
- **SOUS LES ARRÊTS DE RECHARGE ET LES LIEUX**, dans l'ordre de pose : ce qui
  est planifié passe devant ce qui est seulement rencontré.

Tests : 1 E2E — rien sans demande, trois carrefours pour quatre nœuds, la
couche posée, l'effacement, et un seul appel Overpass. 822 unitaires, 258 E2E.

## [0.99.0] — 2026-08-30 — FEUX-1 : les feux comptés sur les trois variantes (PR #127)

Armelin : « existe-t-il un moyen d'afficher les feux rouges sur la carte, afin
de pouvoir optimiser les trajets les plus courts avec le moins de feux ? »
Puis, après mesure : « fais le comptage des feux sur les trois variantes ».

- **ON NE SAIT PAS OPTIMISER, ON SAIT COMPTER — ET C'EST DIT.** Le service
  d'itinéraire ne prend aucun coût personnalisé et ne rend pas
  d'alternatives : on ne peut pas lui demander « le trajet avec le moins de
  feux ». La comparaison A/B/C affiche donc le nombre de carrefours à feux de
  chaque tracé, compté sur la géométrie réelle.
- **« LA MOINS ARRÊTÉE » SE DÉSIGNE**, comme la plus rapide et la plus
  courte — mais seulement si le minimum est UNIQUE et qu'il y a un écart :
  trois itinéraires à douze feux n'ont pas de vainqueur, et deux à égalité au
  plus bas non plus. Couronner l'une serait un tirage au sort présenté comme
  un conseil.
- **UN CARREFOUR, PAS SES QUATRE TÊTES DE FEUX.** C'est le piège du module :
  un croisement porte un nœud par branche d'accès. Les compter un par un
  donnerait un chiffre faux d'un facteur trois — et ce chiffre sert à choisir
  entre deux itinéraires. On regroupe donc LE LONG DU TRAJET, à quarante
  mètres.
- **UN SEUL APPEL OVERPASS POUR LES TROIS**, dont la réponse est attribuée
  par la géométrie : les corridors se recouvrent largement.
- **SON ÉCHEC EST BÉNIN** : la comparaison garde ses durées, ses distances et
  ses arrêts de recharge — on ne perd pas trois calculs d'itinéraire pour un
  chiffre d'appoint.
- **UNE LIMITE ASSUMÉE ET ÉCRITE** : un feu traversé deux fois ne compte
  qu'une fois. Le dire vaut mieux que le laisser croire.

Tests : 12 unitaires (le carrefour contre ses têtes de feux, le feu de la rue
parallèle, le regroupement le long du trajet et non à vol d'oiseau, la requête
unique), 1 E2E où les trois tracés diffèrent vraiment. 822 unitaires, 257 E2E.

## [0.98.0] — 2026-08-30 — ROND-2 : une sortie interdite n'est pas une sortie (PR #126)

Armelin, au volant : « je suis entré dans un rond-point et le GPS m'a indiqué
la deuxième sortie. Le schéma était bon, sauf que la PREMIÈRE sortie était un
sens interdit. Techniquement, le GPS aurait dû m'indiquer la première sortie
AUTORISÉE. »

- **IL A RAISON, ET C'ÉTAIT UN DÉFAUT DE COMPTAGE** : on comptait toutes les
  branches de l'anneau, y compris celles où l'on ne peut pas s'engager. Un
  rang faux dans un rond-point envoie dans la mauvaise rue.
- **LE RAISONNEMENT EST CELUI DU CONDUCTEUR.** Une branche à double sens est
  toujours une sortie. Une branche à sens unique ne l'est que si la
  circulation s'en ÉLOIGNE de l'anneau : si elle y arrive, s'y engager serait
  un sens interdit. On regarde donc par quel bout elle touche l'anneau, et
  dans quel sens OpenStreetMap l'a numérisée — `oneway=yes` va du premier
  point au dernier, `-1` l'inverse.
- **DANS LE DOUTE, ON COMPTE.** Si les deux bouts touchent l'anneau, on ne
  tranche pas : mieux vaut une sortie de trop qu'une sortie réelle effacée.
- **LA BRANCHE INTERDITE NE SE DESSINE PLUS** non plus : le schéma montre ce
  qu'on peut prendre.

Tests : 2 unitaires (la sortie interdite décale les rangs, la sortie à sens
unique compte), 1 E2E. 810 unitaires, 256 E2E.

## [0.97.0] — 2026-08-30 — TERRAIN-1 : six retours du volant (PR #125)

Armelin a roulé avec l'application et envoyé ses retours, captures à l'appui.
Six corrections, dont deux qui retirent de l'écran ce qui ne servait pas.

- **LE PANNEAU DE LIMITATION NE COUPE PLUS LA VITESSE EN DEUX.** « Il
  apparaît par-dessus l'indicateur de vitesse GPS. » Mesuré sur sa capture :
  seize pixels de recouvrement, pile sur les chiffres. Les deux pastilles
  partagent désormais un repère nommé une seule fois.
- **LA VOITURE SE POSE AUX DEUX TIERS DE L'ÉCRAN**, plus au milieu. « Tous
  les GPS du marché la positionnent vers le bas, afin d'afficher plus
  d'éléments au loin. » C'est juste : au volant, ce qu'on regarde est DEVANT.
  La réserve de cadrage tient compte de la barre du bas — la voiture ne la
  touche pas, ce qui était la seconde moitié de la demande.
- **LE PANNEAU VA JUSQU'AU BORD DROIT ET GROSSIT** de trois points et demi.
  « Le téléphone est posé loin des yeux du conducteur. » Un panneau de 300 px
  sur un écran de 400 laissait un tiers d'écran vide à côté de l'information
  la plus vitale.
- **IL PORTE LE NOM DE LA RUE OÙ L'ON TOURNE.** Il était là depuis le début —
  le service le rend — mais ne servait qu'à nommer la rue COURANTE, en bas.
  L'ÉLISION SE RECOLLE au passage : le service livre « R DU CHATEAU D EAU »,
  qui se lisait « Rue du Chateau D Eau ». Un « d » ou un « l » seul est une
  élision.
- **LES BARRES MUETTES DISPARAISSENT.** « J'ai eu des panneaux blancs avec
  des petits rectangles gris et noirs. Je n'ai pas du tout compris à quoi ils
  servaient. Si l'information n'est pas compréhensible du premier coup, elle
  devient inutile. » Il a raison : un rectangle un peu plus clair ne dit pas
  « mettez-vous à droite ». Le conseil de placement reste DIT — voix et
  lecteur d'écran — mais il ne se DESSINE plus. Seule reste la chaussée
  fléchée d'AFFECT-1, qui se lit sans mode d'emploi.
- **UN SEUL BOUTON D'ORIENTATION, celui de la carte.** « Le bouton en forme
  de boussole doit orienter vers le nord quand on appuie, et remettre dans le
  sens de la voiture quand on appuie à nouveau. » C'est fait ; le bouton de
  la barre est supprimé, et la « vue libre » avec lui — elle n'existait que
  pour ce cycle à trois états.
- **DEUX DÉFAUTS TROUVÉS EN CHEMIN, par des parcours.** Le clic sur la
  boussole suspendait le suivi (MapLibre passe le clic d'origine à sa remise
  au nord, et l'émet à la frame SUIVANTE) ; et le recentrage figeait la carte
  de travers en interrompant cette rotation — `easeTo` tient ce qu'il ne
  nomme pas. Le lissage du cap repart aussi de zéro au retour du mode nord :
  sans cela, un cap réel de 200° donnait 148° au premier fixe.

Tests : 808 unitaires, 255 E2E — trois parcours réécrits pour dire ce que
l'écran montre DÉSORMAIS, et non ce qu'il montrait.

## [0.96.0] — 2026-08-30 — TRAFIC-1 : les annonces de trafic parlées (PR #124)

Armelin, le 30/08 : « fais les annonces de trafic parlées ».

- **LA RÈGLE QUI MANQUAIT : on n'interrompt pas, on attend.** Tant qu'une
  manœuvre est à moins d'un kilomètre, le trafic se tait — une annonce de
  travaux qui couvre « tournez à droite » est pire qu'une annonce de travaux
  qui n'existe pas.
- **TROIS KILOMÈTRES POUR LA VOIX, DIX POUR L'ÉCRAN.** L'œil lit quand il
  veut, la voix s'impose : elle attend d'être utile. À 130 km/h, trois
  kilomètres font quatre-vingts secondes — le temps de décider sans avoir
  oublié à l'arrivée.
- **UNE FOIS PAR ÉVÉNEMENT**, dans la même mémoire que les manœuvres : deux
  mémoires séparées auraient deux fois les mêmes défauts.
- **« SIGNALÉ », ET LE MOT COMPTE** : Bison Futé rapporte des déclarations,
  pas des mesures. À l'écran la source est écrite ; à l'oreille, l'adjectif
  la remplace.

Tests : 8 unitaires (portée, garde de manœuvre, formulation, mémoire), 2 E2E
avec une synthèse espionnée et un événement Bison Futé en Lambert-93 — dont
un qui vérifie le SILENCE quand une manœuvre approche. 808 unitaires, 255 E2E.

## [0.95.0] — 2026-08-30 — VOIX-1 : le guidage vocal (PR #123)

Armelin, le 30/08 : « fais le guidage vocal ».

- **LA VOIX EST CELLE DU NAVIGATEUR, ET D'AUCUN SERVICE.** `speechSynthesis`
  est dans le navigateur : gratuite, présente depuis dix ans, et rien ne
  quitte l'appareil. Une synthèse en ligne — il en existe d'excellentes —
  enverrait à un tiers l'itinéraire complet de l'usager, phrase après phrase.
  C'est exactement ce que ce projet refuse.
- **UNE RÉSERVE MESURÉE, ET ELLE EST PUBLIQUE.** Toutes les voix ne sont pas
  locales : la spécification expose `localService`, et certains navigateurs
  proposent des voix de SERVEUR. On préfère TOUJOURS une voix locale et l'on
  ne se rabat sur une voix distante que si l'appareil n'en a aucune autre.
  C'est écrit sur la page « Vie privée », comme la règle du projet l'exige.
- **ELLE SE TAIT TANT QU'ON NE LA DEMANDE PAS**, et le choix survit à la
  fermeture (IndexedDB, sur l'appareil).
- **TROIS PALIERS, JAMAIS DEUX FOIS LE MÊME** : mille mètres, trois cents,
  cinquante. Un GPS qui parle sans cesse finit coupé, et un GPS coupé ne
  prévient plus de rien. Et jamais un palier plus loin que l'étape elle-même,
  sans quoi deux annonces se contrediraient.
- **ON SE TAIT SUR CE QUI NE SE JOUE PAS.** « Continuez tout droit » sur
  quinze kilomètres userait l'attention qu'il faudra avoir à la sortie. Sauf
  dans un giratoire, où « tout droit » veut dire « la deuxième sortie ».
- **ELLE DIT CE QUE L'ÉCRAN MONTRE** — le rang du giratoire, le numéro de
  sortie, les villes desservies, la route visée — parce qu'elle lit le MÊME
  contexte : ils ne peuvent pas se contredire.
- **ELLE RÉPOND EN S'ALLUMANT** : s'il y a une manœuvre à annoncer, elle
  l'annonce ; sinon elle se présente. On ne découvre pas au premier virage
  que la voix ne marche pas.
- **UN DÉFAUT TROUVÉ PAR UN TEST** : la recherche du palier parcourait la
  liste à l'endroit et rendait « loin » jusqu'au dernier mètre — la voix
  n'aurait jamais dit « dans 300 mètres ».

Tests : 24 unitaires (paliers, formulation, mémoire des annonces, choix de la
voix locale), 7 E2E avec une synthèse vocale espionnée — les phrases
RÉELLEMENT prononcées, pas un état interne. 801 unitaires, 253 E2E.

## [0.94.0] — 2026-08-30 — AFFECT-1 : l'affectation par voie (PR #122)

Armelin, le 30/08 : « fais l'affectation par voie ».

- **CHAQUE FILE PORTE SES FLÈCHES, et celles qui servent restent en clair.**
  C'est le panneau des GPS du commerce — et cette fois la donnée le permet.
- **TROISIÈME NOTE PRISE EN DÉFAUT DANS LA JOURNÉE, MÊME ERREUR.** Il était
  écrit qu'« il n'existe pas de `turn:lanes` ici ». Vrai du service
  d'itinéraire, faux d'OpenStreetMap, où c'est l'étiquette standard. Relevé :
  503 chemins dans Paris intra-muros, 30 le long d'un trajet de 16,5 km, et
  5 manœuvres sur 17 (29 %) avec une affectation à moins de 60 m.
- **PLUSIEURS VOIES PEUVENT SERVIR**, ce que la déduction ne savait pas
  faire : là où VOIE-1 disait « la plus à gauche », le marquage dit « les
  deux premières ».
- **UNE CASE VIDE VAUT « TOUT DROIT », ET SEULEMENT POUR TOUT DROIT.** Sur le
  périphérique, `|||slight_right|slight_right` se lit « trois voies qui
  continuent, deux qui sortent » : une voie qui tourne est fléchée, une voie
  qui continue ne l'est pas toujours. Pour un virage, une case vide ne dit
  rien — on ne montre alors rien.
- **ON REGROUPE PAR CÔTÉ, PAS PAR MOT EXACT** : le moteur dit « tournez à
  droite » là où OSM peint `slight_right`.
- **LE SENS COMPTE, ET C'EST LE PIÈGE** : sur une route à double sens,
  prendre `turn:lanes:forward` au lieu de `:backward` afficherait les voies
  du trafic d'en face — pire qu'un écran vide. On compare notre cap au sien.
- **DEUX NIVEAUX, JAMAIS MÉLANGÉS** : sans affectation — sept fois sur dix —
  on retombe sur le conseil de placement de VOIE-1, qui DÉDUIT un côté et
  n'éclaire qu'une voie. L'un est relevé, l'autre déduit.
- **AUCUN APPEL DE PLUS** : `turn:lanes` et ses deux variantes de sens
  entrent dans la même requête Overpass que tout le reste du corridor.

Tests : 22 unitaires (découpage du format, familles de mouvements, cases
vides, sens de parcours, chevauchement de tronçons), 6 E2E dont deux sur le
repli. 777 unitaires, 245 E2E.

## [0.93.0] — 2026-08-30 — ROND-1 : le schéma de rond-point (PR #121)

Armelin, le 29/08 : « pourquoi pas afficher des schémas complexes pour
indiquer un rond-point » ; le 30/08 : « fais le schéma de rond-point ».

- **UN SCHÉMA DESSINÉ AUX VRAIS ANGLES**, pas choisi dans une bibliothèque
  d'images : l'anneau, l'entrée en bas, les branches à leur position réelle,
  notre sortie fléchée et son rang au centre. Un dessin générique mentirait
  sur la forme du carrefour — qui est justement ce qu'on cherche à
  reconnaître en arrivant dessus.
- **IL REMPLACE CE QUE DIT LE MOTEUR, il ne s'y ajoute pas.** L'instruction
  devient « Prenez la 2e sortie » et la flèche de manœuvre s'efface : laisser
  « tournez à droite » à côté du schéma serait se contredire à l'écran.
- **LE MOTEUR NE SAIT TOUJOURS RIEN DES GIRATOIRES, revérifié sur les DEUX.**
  osrm et valhalla traversant le même giratoire de Chartres : neuf étapes
  d'un côté, sept de l'autre, aucune ne le nomme. Tout vient donc de l'anneau
  `junction=roundabout` d'OpenStreetMap et de NOTRE TRACÉ — l'entrée, la
  sortie, le sens de rotation (mesuré, pas présumé : un anneau mal numérisé
  compte quand même juste) et le rang.
- **DEUX CHAUSSÉES D'UNE MÊME ROUTE COMPTENT POUR UNE SORTIE.** Les compter
  deux fois décalerait tous les rangs suivants — l'usager sortirait une
  sortie trop tôt.
- **QUAND LA GÉOMÉTRIE NE TRANCHE PAS, ON NE COMPTE PAS.** Sans branche
  correspondante, le schéma se dessine quand même (l'anneau et notre sortie
  restent vrais) mais n'annonce aucun rang.
- **AUCUN APPEL DE PLUS** : les branches voyagent dans la même requête
  Overpass que les limites, les sorties et les destinations — le service
  accepte plusieurs `out` dans une requête (0,45 s, 18 Ko mesurés).
- **DEUX DÉFAUTS VUS SUR CAPTURE, PAS DÉDUITS** : la première sortie partait
  à GAUCHE (repère en miroir), et le schéma tombait à la ligne au lieu de
  prendre la place de la flèche.
- **CE QUI SE LIT EST PLUS COURT QUE CE QUI SE DIT** : « Prenez la 1re
  sortie » à l'écran (la version longue faisait passer le cartouche de route
  à la ligne), la phrase entière pour le lecteur d'écran.

Tests : 18 unitaires sur la géométrie — l'ordre des sorties en conduite à
droite (à droite = 1re, tout droit = 2e, à gauche = 3e), la mesure du sens,
la fusion des chaussées, le refus de compter — et 6 E2E dont un qui vérifie
que la sortie part bien vers la droite. 755 unitaires, 239 E2E.

## [0.92.0] — 2026-08-30 — SORTIE-1 : le numéro de sortie et la destination (PR #120)

Armelin, le 30/08, après avoir lu le tableau de ce qui manquait : « fais le
numéro de sortie et la destination. »

- **LE PANNEAU PORTE « SORTIE 14 » ET LES VILLES DESSERVIES.** « Lyon · Évry
  · Fontainebleau », comme sur la tôle.
- **UNE MESURE EN CORRIGE UNE AUTRE, POUR LA DEUXIÈME FOIS DANS LA JOURNÉE.**
  Il était écrit que ces deux données étaient « absentes ». C'était vrai du
  service d'itinéraire, et faux d'OpenStreetMap — que ce projet consomme
  déjà pour les limites de vitesse. La note avait cherché la donnée là où
  elle n'était pas. Relevé le 30/08 sur un corridor Paris → Melun : 18 nœuds
  de sortie numérotés sur 46, et 82 bretelles annonçant leurs villes.
- **DEUX OBJETS, DEUX LECTURES.** Le numéro est le `ref` du nœud de
  divergence, POSÉ sur la manœuvre (fenêtre symétrique de 150 m) ; les
  villes sont l'étiquette `destination` de la bretelle, qui COMMENCE sur la
  manœuvre (fenêtre vers l'avant).
- **TROIS VILLES AU PLUS.** Les bretelles en annoncent jusqu'à six ; un
  panneau réel en aligne trois ou quatre. Les trois premières sont les plus
  structurantes — c'est l'ordre du panneau qu'OpenStreetMap reprend.
- **À DÉFAUT DE VILLES, LE NOM DE LA SORTIE** : « Châtillon-la-Borde » dit
  où l'on va, et vaut mieux que le vide.
- **LA COUVERTURE EST PARTIELLE, ET L'APPLICATION SE TAIT.** Un numéro
  absent n'est pas un numéro faux : c'est un panneau qui n'en porte pas.
- **UN SEUL APPEL OVERPASS POUR TOUT LE CORRIDOR** (nouveau
  `lib/corridor.ts`) : limites de vitesse, sorties et destinations vivent
  toutes dans OpenStreetMap le long du même tracé. Les demander séparément
  ferait deux requêtes de vingt secondes à un service tenu par des
  bénévoles — ce que le CLAUDE.md interdit.
- **`nat_ref` ÉCARTÉ APRÈS VÉRIFICATION** : présent sur 82 % des bretelles,
  il ressemble à un numéro mais n'en est pas un (`89A901905CD_1D`).
- **UN DÉFAUT TROUVÉ PAR UN TEST** : un `null` dans la réponse d'Overpass
  faisait tomber le relevé entier. La donnée vient d'un service ; elle ne
  doit jamais lever.

Tests : 19 unitaires (couture des deux objets, refus d'un `ref` qui n'est pas
un numéro, coupe à trois villes, fenêtres, requête unique, tri de la
réponse), 6 E2E dont deux qui vérifient qu'Overpass n'est appelé QU'UNE FOIS
et que la requête demande bien les trois relevés. 737 unitaires, 233 E2E.

## [0.91.0] — 2026-08-30 — EURO-1 : le cartouche vert européen (PR #119)

Le dernier cartouche de l'IISR que la donnée permettait, et qui attendait
depuis PAN-1 : le type E41, vert à chiffres blancs.

- **IL S'AJOUTE AU CARTOUCHE NATIONAL, il ne le remplace pas.** Sur l'A6 on
  lit « A6 » en rouge ET « E15 » en vert, comme sur la route.
- **UN TRONÇON PEUT EN PORTER DEUX.** Le service rend « E15/E50 » (valeur
  réelle, relevée le 30/08) : ce sont deux cartouches, pas un. Deux au plus
  s'affichent — le panneau fait trois cents pixels et porte déjà
  l'instruction, qui est vitale.
- **AUCUN APPEL DE PLUS.** Le numéro voyage dans la MÊME requête que le
  nombre de voies : le service accepte dix attributs, et chaque requête
  coûte seize secondes au service public. Deux coutures, un seul appel.
- **IL SE LIT LÀ OÙ L'ON VA**, comme l'écusson national qu'il accompagne :
  les relevés sont consultés cinquante mètres après la manœuvre — de quoi
  être sur le tronçon suivant sans dépasser le premier.
- **UN TRONÇON SANS NOMBRE DE VOIES N'EST PLUS JETÉ.** Il peut porter le
  numéro européen, et le refuser pour un champ absent perdait l'autre. Zéro
  veut dire « je ne sais pas » : la couture des voies le refuse, celle des
  numéros n'en a pas besoin.

Tests : 12 unitaires de plus (couture européenne, lecture, URL de la seconde
requête, relecture défensive de la réponse), 3 E2E (deux cartouches verts
mesurés à la couleur calculée, absence sans donnée, libellé lu). 718
unitaires, 227 E2E.

## [0.90.0] — 2026-08-30 — VOIE-1 : la chaussée, et où s'y placer (PR #118)

Armelin, le 29/08 : « des flèches pour préciser où se placer sur la chaussée
pour tourner à une intersection ou pour indiquer où se situer pour sortir
d'une autoroute » ; puis, le 30/08, après la mesure : « fais les flèches de
voies avec les deux itinéraires. »

- **LES FILES DE LA CHAUSSÉE, SOUS L'INSTRUCTION, ET CELLE OÙ SE METTRE EN
  CLAIR.** Trois voies sur autoroute, la droite éclairée pour une sortie à
  droite ; deux voies sur départementale, la gauche éclairée pour un virage
  à gauche.
- **CE N'EST PAS LE PANNEAU D'AFFECTATION PAR VOIE des GPS du commerce, et
  l'écart est de fond.** La donnée dit COMBIEN de voies porte la chaussée,
  jamais ce que chaque voie autorise — il n'existe pas de `turn:lanes` ici.
  Le côté est donc DÉDUIT de la manœuvre (on sort à droite par la droite),
  et le libellé lu à voix haute le dit. UNE SEULE file s'éclaire, la plus
  extérieure : en éclairer deux laisserait croire à une affectation que la
  donnée ne porte pas.
- **QUATRE CONDITIONS, AUCUNE DÉCORATIVE.** Rien ne s'affiche si la manœuvre
  n'a pas de côté (tout droit, rond-point), si elle est à plus de 900 m, si
  la chaussée n'a qu'une voie, ou si l'on ne connaît pas leur nombre.
- **DEUX ITINÉRAIRES, ET UNE COUTURE FONDÉE SUR UNE MESURE.** Le guidage
  reste sur la ressource des manœuvres ; une seconde requête part sur celle
  des attributs après le démarrage (16,7 s et 658 Ko sur un Paris-Lyon —
  d'où l'arrière-plan, comme les limites cartographiées). Les tronçons sont
  recousus par projection sur le tracé suivi : les deux moteurs rendent le
  MÊME trajet (466 km de part et d'autre, écart médian NUL, 98,1 % des
  points sous 60 m). Les 1,9 % restants sont JETÉS, pas approchés — un
  nombre de voies pris sur la chaussée d'en face serait un mensonge.
- **L'ÉCHEC DE LA SECONDE REQUÊTE EST BÉNIN** : sans elle, le suivi est
  celui d'avant. Un parcours le vérifie.
- **UNE COLLISION DE CLASSE ÉVITÉE DE JUSTESSE.** Le premier jet nommait les
  barres `.bg-voie` — nom déjà porté par le nom de rue de la barre du bas.
  Un parcours a compté QUATRE barres sur une chaussée à trois. Renommé en
  chaussée et files. C'est la deuxième collision de ce genre en deux jours.
- **LES 18 PANNEAUX ENGENDRÉS PAR GPT-6** (fournis par Armelin) sont rangés
  dans docs/panneaux/ et VÉRIFIÉS fichier par fichier : six couleurs en
  tout, exactement celles de la règle, zone de dessin et listel conformes,
  texte resté du texte. Ils illustrent, ils ne sont pas chargés par
  l'application — le panneau affiché reste du CSS.

Tests : 13 unitaires sur la couture et les refus, 6 E2E dont un qui vérifie
que les DEUX ressources sont interrogées, chacune pour ce qu'elle sait, et
que la lourde ne part qu'une fois. 706 unitaires, 224 E2E.

## [0.89.0] — 2026-08-30 — PAN-1 : de vrais panneaux de direction (PR #117)

Armelin, le 30/08 : « dans les rectangles annonçant les directions, ce serait
bien que les cartouches s'affichent sous forme de vrais panneaux
d'autoroute. »

- **LA RÈGLE OFFICIELLE, PAS UN GOÛT.** L'IISR (arrêté du 24 novembre 1967,
  cinquième partie) a été relevée avant d'écrire une ligne : fond BLEU sur
  autoroute, VERT sur les grandes liaisons, BLANC ailleurs — le JAUNE étant
  réservé au temporaire, on ne s'en sert pas. Et la règle d'encre, qui se
  code : fond bleu ou vert, inscriptions ET listels blancs ; fond blanc,
  tout en noir. La flèche et la distance sont des inscriptions : elles la
  suivent aussi.
- **LE CARTOUCHE DE NUMÉROTATION A SA PROPRE COULEUR**, et ce n'est pas
  celle du panneau : ROUGE sur autoroute et nationale (type E42), JAUNE
  chiffres noirs sur départementale (E43). C'est ce qu'on lit sur la route.
- **LE LISTEL EST UN FILET EN RETRAIT, pas une bordure.** Dessiné en ombre
  intérieure : collé à l'arête, il ne ressemblait à rien.
- **CE QUE ÇA CHANGE POUR LES DÉPARTEMENTALES.** L'orange demandé le 29/08
  n'existe pas dans la signalisation française : une départementale se
  signale sur fond BLANC, et c'est son cartouche qui est jaune. Le jaune
  reste donc à l'écran, là où il est réglementaire. Revenir à l'orange est
  une ligne de CSS — mais ce ne serait plus un vrai panneau.
- **LES COULEURS NE SUIVENT PAS LE THÈME SOMBRE**, seules de toute
  l'application : sur la route, un panneau est rétroréfléchissant — la nuit
  il est plus lumineux, pas moins. Un parcours le vérifie.
- **UNE MESURE EN CORRIGE UNE AUTRE.** Il était écrit que « aucun champ de
  voies n'existe » : c'était vrai de la réponse, faux du service. Le
  catalogue liste `nombre_de_voies`, `cpx_classement_administratif` et
  `cpx_numero_route_europeenne` — mais sur la ressource `bdtopo-pgr`, qui ne
  rend AUCUNE instruction de manœuvre (mesuré : 203 tronçons, zéro
  instruction). On ne bascule donc pas ; le cartouche vert européen et le
  découpage « E15/E50 » attendent, prêts. Tout est dans docs/apis.md.
- **DOCUMENT NOUVEAU : docs/panneaux.md** — la règle, ce qui manque et
  pourquoi, et le prompt à donner à GPT-6 pour des planches d'illustration.

Tests : 9 unitaires sur la règle (fond, encre, cartouche, découpage
européen), 6 E2E qui mesurent la couleur CALCULÉE des quatre classes, de la
flèche, de la distance et du thème sombre. 693 unitaires, 218 E2E.

## [0.88.0] — 2026-08-30 — BIS-1 : l'itinéraire bis (PR #116)

Armelin, le 30/08 : « quand on est en mode navigation et qu'on a un obstacle
ou une route fermée non prévue, ce serait bien d'avoir dans la barre d'état
une icône pour calculer automatiquement un itinéraire bis avant d'arriver à
l'obstacle. »

- **UNE ICÔNE DANS LA BARRE, ET UNE RÉPONSE EN CLAIR.** Un bouton en forme
  de bifurcation, dans les commandes de la barre de suivi. Il répond sur sa
  propre ligne : « Itinéraire bis : sortie dans 2,7 km, 4 h 10 jusqu'à
  l'arrivée » — la sortie est dite, car c'est elle qui permet de décider.
- **CE QU'IL NE PROMET PAS, ET POURQUOI.** Le service public d'itinéraire
  n'a AUCUN paramètre « éviter ce tronçon » (capacités relevées le 21/08,
  reconfirmées le 28/08) : on ne peut pas lui dire où est l'obstacle. Le
  bouton ne prétend donc pas l'éviter — il cherche une route qui QUITTE
  celle-ci dans les six kilomètres.
- **QUATRE CALCULS RÉELS, PUIS UNE MESURE.** Chacun passe par un point posé
  de côté — 2,5 km et 5 km, à gauche et à droite : le moteur accroche ce
  point à la route la plus proche, ce qui force un vrai détour. On mesure
  ensuite, sur les tracés rendus, lequel s'écarte le plus tôt du tracé
  actuel ; à sortie comparable (500 m près), le plus rapide gagne.
- **IL REFUSE PLUTÔT QUE DE MENTIR.** Si aucun candidat ne s'écarte —
  vallée unique, île, route littorale — il le DIT : « toutes les routes
  essayées repassent par ici ». Un « bis » qui ramène dans l'obstacle en
  promettant de l'éviter serait pire que pas de bis du tout.
- **L'ADOPTION PASSE PAR LE CHEMIN ORDINAIRE.** Le point latéral devient une
  étape et le calcul repart de la position : plan de recharge, feuille de
  route et reprise du suivi se refont seuls, sans second chemin à maintenir.

Tests : 15 unitaires sur la logique pure (point latéral, divergence mesurée,
troncature, tracé devant soi, choix et refus), 3 E2E (une route qui s'écarte,
une qui repasse par ici, un service muet). 684 unitaires, 212 E2E.

## [0.87.0] — 2026-08-30 — CAT-1 : le catalogue se cherche et se replie (PR #115)

Armelin, le 30/08 : « le choix des véhicules est trop long à scroller quand il
y a trop de véhicules électriques dans la liste. Il faudrait les replier par
marque […] on clique sur une marque pour déplier et voir les modèles
existants, et ajouter une barre de recherche pour un modèle ou une marque
spécifique. »

- **TRENTE-DEUX MARQUES REPLIÉES, PLUS CENT TRENTE-SEPT MODÈLES À LA FILE.**
  La liste s'ouvre sur les seules marques ; on déplie la sienne, et elle
  seule. Ce qui se déroulait sur plusieurs écrans tient désormais dans un.
- **UNE BARRE DE RECHERCHE, ET DEUX RÉPONSES SELON CE QU'ON CHERCHE.**
  Chercher une MARQUE la rend entière et dépliée — l'avoir nommée, c'est
  avoir demandé à voir ses modèles. Chercher un MODÈLE ne rend que les
  modèles qui correspondent. Accents et majuscules sont ignorés : « zoe »,
  « ZOÉ » et « Zoe » trouvent la même voiture. Une recherche vide le DIT et
  laisse la saisie à la main — le catalogue propose, il ne barre pas.
- **CHOISIR NE REFERME PLUS LA MARQUE.** Le premier jet redessinait la liste
  après le choix, ce qui refermait la marque sous le doigt de l'usager.
  Seul le modèle choisi change d'état désormais, et il se marque comme tel.
- **LA LISTE ENTIÈRE VIT DANS UNE BOÎTE FERMÉE, la recherche au-dessus
  reste toujours visible.** Le premier jet posait les trente-deux marques à
  même le formulaire : elles repoussaient le choix du repère à 1 500 px,
  hors de vue à l'ouverture — ce que FEN-6 interdit. Lui donner un ascenseur
  propre était l'autre issue, et FEN-6 l'interdit aussi (« deux ascenseurs,
  un dans l'autre »). La CI l'a attrapé : le parcours FEN-6 existait déjà.
  La boîte s'ouvre d'elle-même dès la première lettre tapée.
- **LE <select> RESTE, MASQUÉ À L'ŒIL SEULEMENT.** Il porte le nom
  accessible, la navigation clavier native et l'état choisi : un lecteur
  d'écran y retrouve la liste entière. Les marques repliées sont sa peau,
  pas son remplacement — un E2E le vérifie explicitement.

Tests : 5 unitaires sur la recherche pure (`chercherModeles`), 5 E2E sur le
repli, l'ouverture par la recherche, la recherche par marque, la recherche
par modèle et la recherche infructueuse. 669 unitaires, 209 E2E.

## [0.86.0] — 2026-08-30 — PLAN-1 : le plan reste le vôtre (PR #114)

Six retours d'Armelin du 30/08 au soir, tous sur ce que le plan et la barre
racontent.

- **UN ARRÊT AJOUTÉ NE FAIT PLUS SAUTER LES SUIVANTS.** « Je ne veux pas de
  recalcul automatique si j'ajoute une borne entre deux arrêts par souci de
  commodité. » Ajouter est désormais une COMMODITÉ : la borne s'insère à son
  kilomètre comme arrêt de courtoisie — zéro kilowattheure, zéro minute, ce
  qu'elle est — et le plan calculé ne bouge pas. RETIRER, lui, refait le
  plan : une borne écartée change ce qui est atteignable. Un bouton
  « Recalculer les arrêts en gardant les miens » rend la main au calcul
  quand on le veut.
- **PLUS DE DERNIER ARRÊT D'UNE MINUTE.** Le calcul est glouton : à chaque
  borne il charge JUSTE ce qu'il faut, ce qui donne parfois un dernier arrêt
  dérisoire. On écarte alors cette borne et l'on refait le plan — privé
  d'elle, le calcul charge davantage à l'arrêt d'avant. Si ce second plan
  échoue ou coûte plus d'arrêts, on garde le premier : une minute vaut mieux
  qu'un refus.
- **« ARRIVÉE », PAS « AVEC CHARGES ».** « Je ne sais pas s'il s'agit du
  temps restant ou de l'heure d'arrivée. » Un libellé qui qualifie le CALCUL
  laisse douter de ce que le nombre EST.
- **LES ARRÊTS PASSENT DEVANT LES LIEUX D'EXCEPTION.** C'était STRUCTUREL :
  les lieux étaient des marqueurs du DOM, posés au-dessus du canevas, quand
  les arrêts sont peints DANS le canevas — aucun z-index ne pouvait les
  départager. Les lieux deviennent un calque de carte, inséré sous la
  pastille des arrêts.
- **LE TEMPS AUTANT QUE LES KILOMÈTRES** avant la prochaine borne, dans la
  barre dépliée.
- **UN SEUL CHAMP DE RECHERCHE** pour le réseau ET le nom de station. Les
  deux cherchaient bien deux choses différentes — l'exploitant, le site —
  mais rien ne le disait et l'un paraissait mort. Fondus : on tape
  « McDonald », la liste des réseaux se réduit à ceux qui en ont, et la
  carte ne montre plus que ces stations-là.

664 tests unitaires (+3), 203 parcours E2E (+1).

## [0.85.0] — 2026-08-30 — PEAGE-1 : le coût des péages, là où la donnée existe (PR #113)

« Est-ce possible d'afficher une estimation du coût en péage sur chaque
tronçon avant de choisir d'éviter les autoroutes ? » (Armelin, 30/08). Oui —
sur un seul réseau, et c'est dit.

- **Le relevé des gares porte maintenant un PRIX** : total, tronçon par
  tronçon, classe 1 (voiture particulière).
- **Grille AREA seulement**, engendrée en index de 16 Ko et chargée à la
  demande : A41, A43, A48, A49, A51 nord.
- **CE QU'ON NE SAIT PAS CHIFFRER EST NOMMÉ, gare par gare.** Un total
  partiel présenté comme un total serait pire que pas d'estimation : c'est
  sur lui qu'on déciderait d'éviter l'autoroute.
- **APRR ÉCARTÉ, MESURE À L'APPUI** : son fichier est corrompu à la source —
  6 911 « gares de sortie » distinctes pour environ 200 gares réelles. Une
  reconstruction a été tentée ET REJETÉE : la structure du fichier permettait
  de la vérifier, et elle ne rend que 10 738 paires distinctes sur 18 915
  attendues. Vinci, Sanef, SAPN et ATMB ne publient rien. Tout est consigné
  dans docs/apis.md.

661 tests unitaires (+11), 204 parcours E2E (+1).
## [0.84.0] — 2026-08-30 — ITI-3 : trois itinéraires A, B, C (PR #112)

« Quand je planifie un itinéraire, je souhaite avoir un itinéraire A, B et
C pour voir les routes alternatives empruntées » (Armelin, 30/08).

- **TROIS ITINÉRAIRES RÉELS**, pas trois sorties d'un même optimiseur : le
  service public n'expose aucun paramètre « alternatives » (mesuré en
  PR #6, reconfirmé le 29/08). On lui pose donc TROIS QUESTIONS
  différentes — le plus rapide (A), le plus court (B), sans autoroute (C) —
  ce qui est plus honnête qu'un classement inventé, et souvent plus utile :
  on voit ce que chaque consigne coûte.
- **Trois appels EN PARALLÈLE** : l'attente est celle de la plus lente, pas
  leur somme. Un échec isolé ne perd pas les autres — la variante qui ne se
  calcule pas est NOMMÉE, les deux autres restent.
- **On les VOIT** : les trois tracés se posent sur la carte en trait fin
  pointillé, sous le tracé principal.
- **On en PREND une** : chaque bloc porte son bouton, qui applique la
  consigne et relance le calcul — plan de recharge compris.
- Le classement se lit d'un coup : « la plus rapide » et « la plus courte »
  sont désignées, et ce ne sont pas toujours les mêmes. Avec un véhicule
  renseigné, le total compté est ROUTE + CHARGES : le plus rapide sur la
  route peut perdre en tout s'il oblige à un arrêt de plus.

645 tests unitaires, 200 parcours E2E.
## [0.83.0] — 2026-08-30 — ZOOM-1 : la carte se rapproche à l'intersection (PR #111)

« Est-ce que l'algorithme peut effectuer automatiquement un zoom lors de
l'arrivée à une intersection […] pour revenir ensuite à la vue initiale
quand l'obstacle est passé ? » (Armelin, 30/08). Oui.

- **À 260 m d'un virage, la carte passe au zoom 17,2** — de quoi voir les
  voies et l'amorce des rues qui partent, sans perdre d'où l'on vient.
- **C'est la VUE D'AVANT qui revient**, pas une valeur par défaut : le zoom
  trouvé en entrant dans l'approche est gardé et rendu en sortant. Le
  réglage que l'usager vient de poser lui appartient.
- **DEUX SEUILS, ET C'EST NÉCESSAIRE** : on entre à 260 m, on ne ressort
  qu'au-delà de 420. Avec un seuil unique, l'imprécision du récepteur
  autour de la limite ferait entrer et sortir la carte plusieurs fois par
  seconde — un battement insupportable au volant. Un test rejoue exactement
  cette suite de mesures tremblantes.
- **Seules les vraies manœuvres comptent** : virages, ronds-points,
  arrivée. « Tout droit » n'en est pas une — zoomer pour une ligne droite
  ferait respirer la carte sans raison.

650 tests unitaires (+5), 203 parcours E2E (+1).

## [0.82.0] — 2026-08-30 — NAV-4 : la barre dit qu'elle s'ouvre, et se tait de loin (PR #109)

Deux retours d'Armelin du 30/08 sur la barre de suivi.

- **RIEN NE DISAIT QU'ON POUVAIT LA DÉPLIER.** « Il n'y a aucune indication
  visuelle laissant penser à l'utilisateur qu'il peut appuyer sur la barre
  d'état ou la scroller pour avoir des informations complémentaires. » Une
  poignée — la même que les feuilles basses — et un chevron qui pivote :
  deux signes que tout le monde a déjà vus.
- **TRAVAUX ET RECHARGE S'ANNONCENT À DIX KILOMÈTRES**, plus à cinquante.
  Une barre qui prévient une demi-heure à l'avance occupe l'écran pour
  rien ; à dix kilomètres, elle prévient au moment où l'on peut encore
  décider. RIEN N'EST PERDU : dépliée, la barre reprend sa portée de
  cinquante kilomètres — et rejoue le dernier fixe pour répondre TOUT DE
  SUITE, sans quoi le geste n'aurait d'effet qu'à la position suivante
  (donc jamais, à l'arrêt ou dans un tunnel).

645 tests unitaires, 197 parcours E2E (+1).

## [0.81.0] — 2026-08-30 — MOB-1 : plus rien ne se recouvre en bas d'écran (PR #108)

Quatre chevauchements relevés sur capture par Armelin le 30/08.

- **Le rond de vitesse GPS couvrait l'échelle.** Les deux vivent en bas à
  gauche : le rond monte d'une hauteur d'échelle, MESURÉE (elle dépend de
  la police et du fuseau) comme l'en-tête et l'attribution. La barre
  d'échelle n'est pas décorative : c'est elle qui donne le sens des
  distances qu'on lit.
- **Les trois chiffres s'enroulaient sur deux lignes**, et c'est l'heure
  d'arrivée qui disparaissait de la vue. Trois colonnes égales qui cèdent
  avant le texte, et « charges comprises » devient « avec charges » sous
  l'heure — le détail complet reste dans la phrase lue par les lecteurs
  d'écran.
- **La barre du trajet se posait sur « Recentrer ».** Elle lui laisse la
  place, qu'il soit là ou non : une barre qui saute quand un bouton paraît
  serait pire que le chevauchement.
- **Les liens légaux ont rejoint la bulle du « i »**, avec l'attribution
  IGN — c'est leur place. Le pied de page autonome s'efface dès que la
  carte est là, et RESTE dans le HTML pour qui n'a pas JavaScript : les
  mentions légales ne sont pas négociables. Sur téléphone la bulle part
  REPLIÉE (390 px de large ne portent pas quatre liens plus une source) ;
  sur grand écran on n'y touche pas — l'attribution de la Géoplateforme est
  la contrepartie de la licence, pas un ornement qu'on range parce qu'il
  gêne.

645 tests unitaires, 195 parcours E2E.
## [0.80.0] — 2026-08-30 — MEM-1 : ce qui était réglé se souvient (PR #107)

Trois oublis signalés par Armelin le 30/08, trois causes différentes.

- **Le véhicule oubliait masse et bridages thermiques.** « Je dois les
  saisir à chaque fois. » Ils ÉTAIENT écrits — l'enregistrement porte le
  véhicule entier — mais la relecture reconstruisait l'objet CHAMP PAR
  CHAMP et en oubliait trois. Un objet reconstruit à la main perd ce qu'on
  ajoute ailleurs : les trois manquants sont relus, et un parcours les
  nomme pour que l'oubli ne se refasse pas.
- **Les réglages d'arrêt ne survivaient pas au trajet.** Ils décrivent une
  MANIÈRE DE ROULER (charge voulue à l'arrivée, réserve, plafond, pauses,
  détour des lieux), pas un trajet : ils se gardent désormais sous une clé
  commune. AU PASSAGE, UN DÉFAUT PLUS PROFOND : la classe
  `recharge-reserve` nommait DEUX choses sans rapport — le `<select>` du
  formulaire et un paragraphe d'explication. La relecture tombait sur le
  paragraphe, échouait silencieusement, et TOUS les réglages suivants
  restaient à leur défaut. Une classe ne nomme qu'une chose ; et la
  relecture vérifie maintenant le type de l'élément avant de l'écrire.
- **Les recherches « dans la vue » avaient l'air actives sans l'être.**
  « Les boutons Pharmacie, restaurants… ne fonctionnent pas », « quand je
  tape McDonald, il ne se passe rien ». Elles fonctionnaient : mais au zoom
  d'un trajet entier (mesuré : 6,1) il n'y a rien à interroger, et rien ne
  le disait tant qu'on n'avait pas cliqué. Les boutons et le champ sont
  désormais DÉSACTIVÉS sous le zoom 12, avec la raison écrite, et
  redeviennent vivants dès qu'on se rapproche — sans recharger.

645 tests unitaires, 200 parcours E2E (+3).

## [0.79.0] — 2026-08-29 — FEN-6 : un seul ascenseur, un repère qu'on trouve, une attente qu'on voit (PR #106)

Trois retours d'Armelin du 29/08 au soir :

- **UN SEUL ASCENSEUR PAR FENÊTRE.** « La fenêtre s'ouvre avec une double
  barre d'ascenseur, ce qui n'est pas joli ni ergonomique » — mesuré :
  `.iti-corps` 574/648 ET `.veh-corps` 567/860. Le plafond du rail était
  écrit en descendance libre : il attrapait aussi les panneaux nichés DANS
  une page. Il ne désigne plus que le volet porté par le rail.
- **LE CHOIX DU REPÈRE VIENT EN TÊTE** de « Mon véhicule ». « Il faut
  scroller tout en bas pour voir apparaître la personnalisation du repère ;
  si l'utilisateur ne scrolle pas, impossible de savoir que l'option
  existe. » Un réglage qu'on ne trouve pas n'existe pas.
- **L'ATTENTE DES LIEUX D'EXCEPTION SE VOIT.** « Il y a un recalcul en
  arrière-plan, mais rien affiché à l'écran […] l'utilisateur peut quitter
  la fenêtre avant même que le résultat ne s'affiche. » Le message existait
  — mais il n'avait pas le temps d'être PEINT : au deuxième passage le
  fichier vient du cache, l'attente réseau est nulle, et le calcul des
  détours (14 350 monuments contre la polyligne) bloque le fil principal
  sans qu'un seul rendu ait eu lieu. Deux trames sont désormais rendues
  avant le calcul, et un point qui bat accompagne la phrase : un texte seul
  peut passer pour un résultat.

645 tests unitaires, 197 parcours E2E (+1).

## [0.78.0] — 2026-08-29 — NAV-3 : la barre de suivi réduite à ce qu'on lit en roulant (PR #105)

Armelin, le 29/08 : « la barre de navigation en bas sur mobile est beaucoup
trop grande et les informations les plus indispensables sont écrites en trop
petit […] les seules informations qui doivent apparaître pendant la
navigation, c'est : le nombre de kilomètres restants, le temps restant,
l'heure d'arrivée estimée, un bouton pour arrêter ».

- **TROIS CHIFFRES, EN GRAND** (22 px au lieu de 13, chacun sous son
  libellé) : ce qui reste, le temps de route, l'heure d'arrivée. La phrase
  complète demeure pour qui écoute la page — masquée à l'œil, jamais
  retirée de l'arbre d'accessibilité.
- **UNE CROIX ROUGE** de 48 px remplace le bouton « Arrêter le suivi » : on
  la cherche parfois dans l'urgence.
- **LE RESTE SE DÉPLIE**, par les deux gestes qu'Armelin a décrits : un
  appui sur la barre, ou un glissement vers le haut. Le bouton « Réduire »
  disparaît — la barre EST repliée, ce qui était son intention.
- **DES ICÔNES À LA PLACE DES PHRASES** : la boussole « en mode pressoir »
  (son dessin change avec les trois états : cap, nord, libre), la vue
  inclinée ou à plat, le copilote. Le nom accessible porte l'état en toutes
  lettres — l'icône parle à l'œil, la phrase à qui écoute.
- **LES BOUTONS + ET − DISPARAISSENT** : « ils n'ont pas leur place sur un
  écran tactile où tout le monde zoome avec les doigts ». Ils coûtaient
  aussi le chevauchement signalé. La boussole reste : aucun geste ne la
  remplace, et c'est elle qui redresse une carte tournée par erreur.
- **LA BARRE DU TRAJET NE COUPE PLUS RIEN** : les commandes de vue et
  l'attribution IGN s'écartent de sa largeur (mesuré : 346 contre 354).
- Le picto de vue inclinée a été refait après capture — le premier se
  lisait « A » à vingt-deux pixels. Et les pictos portent désormais leur
  nom en classe : un bouton pressoir doit dire LEQUEL il affiche.

645 tests unitaires, 196 parcours E2E.

## [0.77.0] — 2026-08-29 — GUID-3 : le guidage avait une manœuvre de retard (PR #104)

Armelin, au volant le 29/08, captures à l'appui : « le GPS confond sa gauche
et sa droite pendant la navigation ». Il ne les confondait pas : IL AVAIT UN
TOUR DE RETARD — et c'est le défaut le plus grave trouvé jusqu'ici.

- **CE QUI ARRIVE, PAS CE QU'ON VIENT DE FAIRE.** Le service rend
  l'instruction du DÉBUT de chaque étape et la longueur qui SUIT (vérifié
  sur une réponse réelle : `depart` puis 30 m, `turn sharp left` puis 46 m,
  `turn right` puis 205 m…). Le bandeau affichait l'instruction de l'étape
  COURANTE — donc la manœuvre déjà exécutée — avec la distance de la
  PROCHAINE : « tournez à droite dans 200 m » quand la route tournait à
  gauche. C'est désormais la manœuvre à venir qui s'affiche, et six tests
  unitaires figent ce contrat.
- **DEUX VOIES, QUI NE SONT PAS LA MÊME** : le cartouche annonce la voie où
  l'on VA (avec son écusson et sa couleur), la barre du bas nomme celle où
  l'on EST. Les confondre revenait à écrire le nom de la rue qu'on quitte
  au-dessus de la flèche qui en sort.

Et le recalcul automatique, « trop tardif » (rond-point fait en entier sans
réaction) :

- **Le seuil hors-route descend de 150 m à 80 m.** À 150, on a le temps de
  prendre une rue entière. 80 reste au-dessus du tremblement d'un récepteur
  en rue encaissée (30 à 50 m) : on n'annonce pas « vous avez quitté
  l'itinéraire » à quelqu'un qui roule droit.
- **Quatre secondes de constat au lieu de huit, quinze de repos au lieu de
  trente.**
- **LE DEMI-TOUR EST VU** : après un tour de rond-point on repart sur la
  même route, à deux mètres du tracé — l'écart ne voit rien, mais
  l'avancement RECULE. Cent cinquante mètres de recul ne sont pas du bruit :
  le trajet se refait depuis la position, et le bandeau le dit.

645 tests unitaires (+11), 196 parcours E2E.

## [0.76.0] — 2026-08-29 — FEN-5 : la fenêtre se pose AU CENTRE (PR #103)

« La colorimétrie est revenue mais je n'ai toujours pas de fenêtre
flottante » (Armelin, 29/08). Il avait raison : FEN-4 avait bien décroché
la page de sa colonne… pour la reposer douze pixels plus loin, au même
endroit qu'avant. Une fenêtre ancrée là où le tiroir se trouvait RESTE un
tiroir à l'œil, quels que soient son rayon et son ombre.

- **La page se pose au centre de l'écran**, sur la carte voilée, 460 px de
  large, avec une ombre qui porte plus loin (une fenêtre posée au milieu
  flotte plus haut qu'un panneau adossé à un bord) et cent vingt
  millisecondes d'arrivée — coupées pour qui a demandé moins de mouvement.
- **Une fenêtre se ferme** : la tête de page porte désormais une croix à
  côté de la flèche. La flèche remonte d'une page, la croix congédie tout.
  C'est ce geste, autant que la position, qui fait lire une fenêtre.
- **DEUX FAMILLES DE PAGES, ET LA MESURE QUI LES A SÉPARÉES.** Posées au
  centre, TOUTES les pages devenaient des fenêtres franches — et douze
  parcours E2E se sont mis à échouer, tous pour la même raison : ils
  cliquent la CARTE pendant que la page est ouverte, et une fenêtre
  centrée recouvre exactement l'endroit qu'on vise. Ce n'était pas un
  défaut de test mais un usage réel : on coche un filtre de bornes POUR
  regarder la carte changer. Une page qui COMMANDE la carte (« Recharge et
  services », « Arrêts de recharge », et le menu des réglages) garde donc
  sa colonne — et son voile avec, puisque voiler la carte qu'on règle
  reviendrait à éteindre ce qu'on cherche à voir. Les autres (« Mon
  véhicule », « Options », « Feuille de route », « Partager », « Lieux
  d'exception ») se posent au centre.

634 tests unitaires, 196 parcours E2E.

## [0.75.1] — 2026-08-29 — FEN-4 : la fenêtre du bureau, et le voile qui la grisait (PR #102)

Armelin, le 29/08, sur ordinateur : « quand je clique sur les options
d'itinéraire, la fenêtre est grisée dans tous les menus et un éclairage qui
diminue, et je n'ai toujours pas les fenêtres flottantes ». DEUX défauts en
un seul symptôme :

- **Le voile se peignait PAR-DESSUS le panneau.** La montée du conteneur
  porteur — les conteneurs MapLibre sont des contextes d'empilement, le
  rang d'un volet reste enfermé dans le sien — ne vivait que dans le bloc
  téléphone. Sur grand écran, le voile (rang 9) recouvrait donc le panneau
  (rang 2) : la fenêtre se grisait elle-même. La règle vaut maintenant sur
  TOUS les écrans, et le parcours E2E compare les deux rangs.
- **FEN-2 n'avait détaché que le téléphone.** Au bureau, la page restait
  collée sous la pastille du rail, dans la colonne — un tiroir à coins
  arrondis. Elle s'en décroche : posée sur la carte, écartée du bord et de
  sa pastille, 420 px de large, la carte visible tout autour. Le menu des
  réglages fait de même, à droite. L'ACCUEIL, lui, reste le volet latéral
  qu'il a toujours été.
- **Le voile s'allège au bureau** (0,16 au lieu de 0,34) : sur téléphone la
  fenêtre couvre presque l'écran, au bureau elle en couvre un cinquième —
  il suffit qu'il détache la fenêtre, pas qu'il éteigne la carte.
- Toutes les fenêtres partagent désormais le rayon 18 des cartouches.

634 tests unitaires, 196 parcours E2E (+1).

## [0.75.0] — 2026-08-29 — FEN-3 : toutes les surfaces flottantes parlent la même langue (PR #101)

La suite de « poursuivre […] les fenêtres flottantes » : les pages et le
menu l'étaient devenues (FEN-2), les cartouches de détail et le copilote
gardaient l'ancien habit.

- **Fiches de borne et de lieu, panneau du copilote** : même rayon de 18,
  même ombre de fenêtre. Deux surfaces qui flottent côte à côte ne peuvent
  pas se dessiner autrement l'une de l'autre.
- **Le voile s'étend aux cartouches** — mais JAMAIS pendant le suivi : au
  volant, assombrir la carte pour un cartouche serait l'inverse de ce qu'il
  faut.
- DEUX PIÈGES DÉJÀ CONNUS, RETROUVÉS ICI et corrigés : le voile (rang 9)
  passait par-dessus la fiche (rang 5) — une fenêtre qui s'assombrit
  elle-même ; et le pied de page traversait la fiche (vu sur capture : « À
  propos / Professionnels » au travers d'un monument), parce qu'il vit dans
  `<body>` et se peint après `#carte`. Il se tait sous un cartouche, comme
  il se taisait déjà sous une feuille.
- **MESURE CONSIGNÉE** (docs/apis.md) sur les schémas de manœuvre demandés
  le 29/08 : le service n'expose AUCUN champ de voies (deux itinéraires,
  zéro occurrence) — le placement sur la chaussée reste impossible ; et il
  n'émet JAMAIS `roundabout` ni `rotary` (quatre itinéraires traversant des
  giratoires — rocade de Rennes, Niort, Chartres, Vannes, 63 étapes) : un
  schéma de rond-point serait du code mort. L'écusson de route, lui, est
  livré (GUID-2).

634 tests unitaires, 195 parcours E2E (+1).
## [0.74.0] — 2026-08-29 — PIC-2 : les options portent leurs pictos (PR #100)

« Poursuivre les autres améliorations graphiques […] notamment les icônes
pour les options » (Armelin, 29/08). La page Options n'était que des mots.

- **Six pictos de plus**, dans la même famille au trait que les onze de
  PIC-1 : piéton, chronomètre (le plus rapide), ligne droite entre deux
  points (le plus court), chaussée (autoroutes), voûte (tunnels), arc
  (ponts). Le mode voiture reprend celui de « Mon véhicule » — un objet,
  un dessin.
- **L'état coché se voit deux fois** : le libellé ET son picto passent à
  l'accent.
- PIÈGE ÉVITÉ, ET CONSIGNÉ : le picto se glisse ENTRE la case et le
  libellé, ce qui rompait le sélecteur de frère ADJACENT (`+ span`) qui
  peignait l'état coché — un réglage qui ne se voit plus n'est plus un
  réglage. Passé en frère général (`~ span`), et le parcours E2E mesure
  désormais la couleur de bordure des deux états.
- Le picto du pont a été REFAIT après capture : le premier dessin (tablier
  et deux appuis) se lisait « table » à dix-sept pixels.

634 tests unitaires, 194 parcours E2E.

## [0.73.0] — 2026-08-29 — PHOTO-1 : les lieux d'exception ont leur photo (PR #99)

Armelin, le 29/08 : « quand on clique sur un lieu, on a juste le nom du
lieu et ses caractéristiques. Ne serait-ce pas possible d'y afficher une ou
plusieurs photos ? » — puis, l'étude rendue : « OK pour Wikimedia ».

- **La fiche d'un monument porte sa photographie**, tirée de Wikimedia
  Commons via Wikidata (référence Mérimée P380 → image P18). Mesuré le
  29/08 : 23 monuments classés sur 24.
- **DEUXIÈME ÉCART DE SOUVERAINETÉ DU PROJET**, traité comme le premier
  (Open-Meteo) : décision explicite d'Armelin ET mention publique — la page
  « À propos » porte désormais deux sections d'exception, celle-ci
  expliquant la mesure qui l'a décidée (Panoramax couvre 75 % mais en vues
  de rue ; la base Mémoire ne répond pas et n'est pas libre de droits).
- **L'attribution est obligatoire** : auteur, licence et lien vers le
  fichier sous chaque image. Ces photos sont libres, elles ne sont pas
  anonymes. Auteur et licence arrivent en HTML de l'API : ils entrent dans
  la page par `textContent`, jamais par `innerHTML`.
- **Frugal, et abandonnable** : deux appels à l'OUVERTURE d'une fiche,
  jamais en lot pour une liste de trente monuments ; l'appel en vol est
  abandonné dès qu'une autre fiche s'ouvre ou que celle-ci se ferme. Ce qui
  part est la référence du ministère — jamais la position, jamais
  l'identité. Sans photo, la fiche reste une fiche : aucun message.

634 tests unitaires (+13), 194 parcours E2E (+1).
## [0.72.0] — 2026-08-29 — GUID-2 : l'instruction devient une fenêtre, la barre du bas se vide (PR #98)

Quatre retours d'Armelin du 29/08 sur le mode navigation, tous tenus :

- **La barre du bas est COLLÉE EN BAS** — elle flottait au-dessus de
  l'attribution IGN. C'est l'attribution et les commandes de vue qui
  remontent désormais : le bandeau publie sa hauteur mesurée, elles s'en
  dégagent d'autant. « Cette barre masque de suite les boutons de zoom et
  de géolocalisation » : plus maintenant, et l'attribution reste lisible —
  ce n'est pas un ornement, c'est la contrepartie de la licence.
- **Elle est MINIMALE** : la voie courante (« le nom de la rue sur laquelle
  on se déplace »), le restant, et les boutons. La flèche, l'instruction et
  la distance en sont sorties ; les deux textes d'explication (« pas de
  navigation guidée », légende des couleurs) ont rejoint le copilote — on
  les lit à l'arrêt, jamais au volant.
- **UN CARTOUCHE FLOTTANT EN HAUT À GAUCHE** porte la manœuvre : flèche,
  phrase, distance, et l'écusson du numéro de route.
- **Il prend la couleur de la route** — bleu autoroute, vert nationale,
  orange départementale (la convention est celle d'Armelin). La classe se
  lit sur le numéro fourni par le service : MESURÉ le 29/08, `cpx_numero`
  rend « D39 », « D415 », « D606 ». Tout ce qui n'est pas une route
  numérotée reste neutre : un cartouche bleu sur une avenue serait un faux
  panneau.
- CE QUI N'EST PAS PROMIS, ET POURQUOI : les schémas de placement sur la
  chaussée. La réponse du service ne contient AUCUN champ de voies
  (cherché sur deux itinéraires réels le 29/08) — on ne dessine pas ce
  qu'on ne sait pas.

621 tests unitaires (+7), 193 parcours E2E (+1).

## [0.71.0] — 2026-08-29 — FRISE-2 : la barre du trajet passe à droite, et porte le trafic (PR #97)

Trois retours d'Armelin du 29/08, tous tenus :

- **À DROITE** — « le panneau de vitesse à gauche est coupé en deux par la
  barre verticale ». Elle libère le côté gauche.
- **Plus longue, plus épaisse** — elle monte jusque sous l'en-tête (52 vh au
  plus) et son trait triple d'épaisseur.
- **Elle porte le trafic** — vert, orange, rouge. AVEC UNE RÉSERVE ÉCRITE
  SOUS LE BANDEAU : le vert ne dit pas « ça roule », il dit « AUCUN
  INCIDENT SIGNALÉ ». Bison Futé publie des événements ponctuels, pas un
  débit par tronçon (c'est ce qui avait fait écarter une barre de fluidité
  le 27/08) ; un événement peint donc une bande d'un kilomètre de part et
  d'autre, et le pire l'emporte quand deux se chevauchent. Restrictions,
  interdictions poids lourds et informations ne colorent RIEN : elles ne
  disent rien du temps de parcours d'une voiture.
- **Seuls les arrêts planifiés y portent une pastille** — « on ne devrait
  afficher sur cette barre que les éléments planifiés ». Les losanges
  d'événements ont cédé la place à la couleur de la piste : elle les
  explique au lieu de les juxtaposer.
- **Un drapeau à damier au sommet** marque l'arrivée — deux dégradés
  croisés, aucune image à héberger.

614 tests unitaires (+10), 192 parcours E2E.
## [0.70.0] — 2026-08-29 — NAV-2 : la voiture a enfin un curseur (PR #96)

Armelin, le 29/08, après un essai au volant : « il n'y a pas d'icône
représentant ma voiture au milieu de la carte sur le trajet. C'est un objet
fantôme qui se déplace et on ne peut pas savoir où on est. » Le point bleu
de MapLibre n'existe QUE si l'on a pressé « Me localiser » — au volant,
personne ne le fait : la carte glissait sous un curseur absent.

- **Un curseur posé sur la carte pendant tout le suivi**, orienté vers la
  route : cap GPS quand il en donne un, cap DÉDUIT de deux fixes sinon
  (`heading` reste nul à l'arrêt, sur un ordinateur, à la sortie d'un
  tunnel). Il tourne AVEC la carte, et ne dépend d'aucun service : il
  paraît même si feuille de route, météo et relief sont tombés.
- **Trois formes au choix** — flèche, voiture, point —, choisies dans « Mon
  véhicule » sur des vignettes qui MONTRENT ce qu'elles proposent, gardées
  sur l'appareil (clé à part : c'est un goût d'affichage, il survit au
  changement de modèle). Dessinées par le code, comme les éclairs et les
  pictos : rien de binaire au dépôt. Le jour où des images plus travaillées
  arriveront, seule la table des formes changera.
- Liseré blanc et ombre portée : sur un fond satellite ou une autoroute
  grise, un aplat bleu sans contour disparaît.

604 tests unitaires (+7), 192 parcours E2E (+1).

## [0.69.0] — 2026-08-29 — FEN-2 : les pages et le menu deviennent des fenêtres (PR #95)

Armelin, le 29/08, après essai : « quand je clique sur un pictogramme, je
n'ai toujours pas de fenêtre flottante pour la configuration » — FEN-1
n'avait habillé que le volet, pas ses pages. Et : « ce serait mieux
d'afficher le menu sous forme de fenêtre flottante ».

- **Toute page du planificateur** (mon véhicule, options, arrêts…) se
  détache en FENÊTRE : décollée des quatre bords, arrondie partout, haute
  comme son seul contenu, posée sur un voile qui dit que le reste attend.
  L'ACCUEIL garde la feuille basse demandée le 28/08 (BS-1) : c'est le
  panneau qu'on ouvre et referme sans cesse, le pouce l'atteint.
- **Le menu des réglages est une fenêtre** lui aussi — et deux défauts
  tombent avec : le « grand vide noir en haut » (la poignée s'étirait sur
  72 px mesurés dans un corps en grille) et le sous-menu **Fonds** qui
  tombait sous l'écran (mesuré : y = 852 px sur un écran de 844). Il
  reprend sa place dans le flux : on le voit à l'instant du clic.
- Une fenêtre ne se tire pas : la poignée disparaît, et revient avec la
  feuille au retour à l'accueil.

597 tests unitaires, 191 parcours E2E (+1).

## [0.68.0] — 2026-08-29 — Le partage passe par la feuille du système (PR #93)

La demande des amis d'Armelin (29/08) : « le même type de partage que sur
mobile Android ». C'est `navigator.share`, l'API standard — la feuille de
partage de l'APPAREIL, avec ses deux niveaux : les applis (messagerie,
courriel, Drive, Bluetooth, Signal, SMS…), puis Copier / Imprimer /
Enregistrer. Aucun service tiers, rien ne part de chez nous.

- **« Partager… »** en tête de la page Partage : le lien du trajet calculé
  part dans la feuille du système. Le bouton n'apparaît QUE là où l'API
  existe — un bouton qui ne ferait rien serait un mensonge. Quand il est
  là, « Copier le lien » redevient un bouton secondaire.
- **GPX et KML par la feuille aussi** (Web Share niveau 2) quand l'appareil
  sait la remplir de fichiers — c'est là qu'on les envoie vers un Drive, un
  courriel ou « Enregistrer ». Sinon : le téléchargement d'avant, intact.
- Refermer la feuille sans choisir est un CHOIX (AbortError) : ni message,
  ni téléchargement que personne n'a demandé.

597 tests unitaires, 190 parcours E2E (+3).

## [0.67.0] — 2026-08-29 — PIC-1 : les pictogrammes de menu, variante A (PR #92)

La seconde livraison validée par Armelin le 29/08 sur la maquette — et il a
retranché le 29/08 : « tu livreras la variante A. Si cela ne me convient
pas, on partira sur la variante B ».

- **Onze pictos au trait** (1,9 px, couleur accent), dessinés PAR LE CODE
  dans `icone-menu.ts` — le précédent des éclairs et des commodités : aucun
  binaire au dépôt, jamais un émoji, jamais un logo.
- **Sept rangées du planificateur** (véhicule, recharge et services,
  options, arrêts, lieux d'exception, feuille de route, partager) et
  **quatre pastilles** (Itinéraire, Fonds, Trafic, Favoris) reçoivent leur
  picto À CÔTÉ du texte : l'œil accroche l'ancre avant de lire, le libellé
  reste entier — la variante B (grille compacte) est écartée pour le menu
  principal, ses libellés tronqués perdaient leur sens.
- **Décoratifs par contrat** : aria-hidden, hors tabulation, aucune couleur
  en dur (le test unitaire l'exige) — les lecteurs d'écran ne voient rien
  changer, le mode sombre non plus.

597 tests unitaires (+4), 187 parcours E2E (+1).

## [0.66.0] — 2026-08-29 — FEN-1 : le volet devient une fenêtre flottante (PR #91)

Proposition maquettée puis VALIDÉE par Armelin le 29/08 (« valide les deux,
livre FEN-1 et PIC-1 ») — le volet du planificateur cessait d'être un tiroir
collé à l'écran :

- **Borné à 680 px de haut** quel que soit l'écran : au-delà, le contenu
  défile DANS le volet (ascenseur fin), plus jamais un panneau qui court du
  haut en bas de la carte.
- **Détaché visuellement** (à partir de 641 px de large) : coins arrondis
  16 px, ombre de fenêtre portée (`--ombre-flottante`, déclinée sombre),
  respiration de 10 px sous le bandeau-résumé. Les réglages d'affichage
  (bas-droite) reçoivent le même habillage.
- **Le pied de page reste cliquable ET le volet aussi** : la réserve basse
  compte désormais le pied de carte (~80 px), qui se peint PAR-DESSUS le
  volet (#carte est le contexte d'empilement racine) — un bouton du volet
  glissé dessous devenait incliquable, l'E2E « effacer depuis une page »
  l'a prouvé.

593 tests unitaires, 186 parcours E2E (+1).

## [0.65.0] — 2026-08-29 — Le mode « arrivée réelle » (PR #90)

La DERNIÈRE décision du §4 du triage. Deux mensonges d'heure corrigés :

- **En suivi, l'heure d'arrivée compte les charges restantes** — elle ne
  comptait que la ROUTE : deux arrêts de trente minutes devant soi, une
  heure de mensonge. Le bandeau et le copilote affichent l'arrivée réelle,
  et le DISENT : « arrivée vers 11:18, charges comprises ».
- **« Départ à » au planificateur** : vide, on part maintenant ; réglée
  (une heure passée vise demain), elle décale l'heure d'arrivée affichée au
  résumé — « arrivée vers 18:40 », « demain » dit quand le jour change —
  ET les relevés météo du plan : partir à 6 h ou à 18 h ne donne pas le
  même plan d'hiver (la fixture E2E au gel vespéral le prouve, bridage et
  consommation suivent).
- Le résumé porte l'arrivée réelle dans TOUS ses états : route seule
  (« hors recharge »), aucun arrêt nécessaire, ou total charges comprises.

LE §4 DU TRIAGE DU 28/08 EST ENTIÈREMENT SOLDÉ : bottom sheets (#78),
pauses humaines (#81), copilote (#82), routines (#88), arrivée réelle (#90).

593 tests unitaires, 185 parcours E2E (+2).

## [0.64.0] — 2026-08-29 — Finitions : pastilles, logo mobile, barre noire, ascenseurs (PR #89)

Le solde des retours visuels d'Armelin du 29/08 :

- **Les pastilles d'arrêts changent de couleur ET de taille** : le vert
  #1E9E5A était EXACTEMENT celui du palier « charge très rapide » — les
  arrêts passent au bleu marque (#0C447C), rayon 18 au lieu de 15, et la
  durée s'écrit À DROITE de la pastille, en plus grand. La frise du suivi
  parle la même couleur.
- **La barre noire du haut de l'écran mobile** : c'était le theme-color
  #0F1B2D — la barre du navigateur suit désormais le FOND de l'application
  (blanc en clair, sombre en sombre), l'écran de lancement PWA aussi.
- **Le logo revient en mobile** : la marque reste sous 400 px, en petit.
- **Un ascenseur, pas trois** : le rail gauche ne défile plus — la PAGE
  ouverte du planificateur défile, seule.

593 tests unitaires, 183 parcours E2E.

## [0.63.0] — 2026-08-29 — Les routines locales (PR #88)

La décision d'Armelin du 29/08 (§4 du triage). Le bon trajet au bon
moment, appris ICI et nulle part ailleurs :

- **Les repères déclarés d'abord** : « → Au travail » un matin de semaine,
  « → À la maison » le soir — proposés en tête du planificateur, un geste
  et le trajet part (allerVers).
- **Les habitudes apprises** : trois trajets calculés vers le même endroit
  dans la même tranche (matin, après-midi, soir — la nuit ne suggère rien)
  font une routine, proposée avec son MOTIF (« habituel le matin »). Deux
  allers chez le dentiste n'en font pas une. Trois suggestions au plus.
- **RGPD by design, et VISIBLE** : nom et point de la destination, rien
  d'autre — ni départ, ni tracé, ni durée ; quarante habitudes au plus ;
  le volet Favoris les compte (« retenues sur cet appareil, jamais
  ailleurs ») et les efface d'un bouton. Une routine qu'on ne peut ni voir
  ni effacer serait un mouchard.
- Le choix est PUR et testé à sec (l'heure entre en paramètre, jamais lue
  d'une horloge cachée) ; les parcours E2E pilotent l'horloge du
  navigateur. Et un piège CSS payé une troisième fois : `[hidden]` doit
  gagner sur `display: flex`.

593 tests unitaires (+8), 183 parcours E2E (+2).

## [0.62.0] — 2026-08-29 — Le recalcul automatique hors-route (PR #87)

La demande d'Armelin du 29/08 : « un mode de recalcul automatique si on
s'est trompé de route. »

- **Le bandeau CONSTATE, le planificateur CALCULE** : huit secondes d'écart
  au-delà de cinquante mètres (le tunnel et le GPS qui divague sont
  écartés), et l'itinéraire se refait depuis la position — arrivée,
  évitements et optimisation tenus, étapes encore DEVANT conservées,
  étapes passées abandonnées. Le suivi REPART sur le nouveau tracé sans un
  geste ; le plan de recharge se refait tout seul (PR #84). Trente secondes
  de silence entre deux demandes.
- **Le texte d'honnêteté suit** : « aucune voix — mais si vous quittez la
  route, l'itinéraire se recalcule tout seul. »
- Deux pièges payés : performance.now() démarre AVEC la page (un garde-fou
  initialisé à zéro interdisait tout recalcul les trente premières
  secondes) ; #demarrerSuivi est une bascule — la relance la traverse.
- En passant, un défaut de la PR #77 : la feuille de route du démarrage
  suivait fastest même en « le plus court » — l'optimisation rétablie.

585 tests unitaires, 181 parcours E2E (+1).

## [0.61.0] — 2026-08-29 — Les repères se définissent par adresse (PR #86)

(Consignée ICI, avec la PR #87 : l'entrée s'était perdue dans une fusion
avortée — la PR #86 est partie sans elle, l'écart est réparé.)

Le retour d'Armelin du 29/08 : « si on est chez soi pour la première
utilisation, il n'est pas possible de saisir l'adresse du boulot ; il
faudrait obligatoirement se rendre sur place et cliquer Définir ici. »

- **« Par adresse… »** sur chaque repère (domicile, travail) : on tape, la
  BAN propose, le repère est posé — d'où qu'on soit. Le bouton existe aussi
  quand le repère est défini : on déménage, on change de bureau.
- « Définir ici » (centre de la carte) et l'appui long restent.

## [0.60.0] — 2026-08-29 — Le menu du planificateur s'allège (PR #85)

Les retours d'Armelin du 29/08 sur les « menus à rallonge » :

- **« Sur le trajet » est RETIRÉ** — la carte montre déjà toutes les bornes
  et stations du corridor, la page listait ce qu'on voyait.
- **« Météo à l'arrivée » est RETIRÉE du planificateur** — elle vit dans le
  COPILOTE pendant le suivi, à l'heure d'arrivée réelle, là où elle sert.
- **« Profil altimétrique » DÉMÉNAGE dans le copilote** — même dessin, mêmes
  dénivelés, sur demande, la réponse survit aux fixes. (Le relief COMPTE
  déjà dans le plan de recharge depuis la PR #80 — la page ne faisait que
  montrer.)
- **« Lieux d'exception » REMONTE** en deuxième position du menu des
  détails : « tout en bas d'un menu interminable, on peut vite l'oublier ».
- Le menu des détails descend de sept entrées à quatre : Arrêts de
  recharge, Lieux d'exception, Feuille de route, Partager ou exporter.

585 tests unitaires, 179 parcours E2E (cinq pages retirées ; le copilote reprend leurs vérifications).

## [0.59.0] — 2026-08-29 — Le plan de recharge se calcule tout seul (PR #84)

Trois retours d'Armelin du 29/08 soldés d'un coup :

- **« Il faut cliquer sur Arrêts de recharge pour que le planificateur
  calcule — pas intuitif. »** Un trajet calculé avec un véhicule renseigné
  déclenche le plan TOUT SEUL, une seconde après le calme (les rafales de
  recalcul — cases, étapes — ne coûtent qu'un calcul). Sans véhicule,
  silence : l'invite n'a de sens que quand on ouvre la page.
- **« Il faut attendre sans aucune barre de chargement. »** Le résumé DIT
  ce qui se passe : « 390 km — 3 h de route — calcul des arrêts de
  recharge… », puis le total charge comprise.
- **Un véhicule modifié INVALIDE le plan** : capacité, autonomie ou
  bridage changés, le plan décrivait une autre voiture — il se refait tout
  seul (défaut débusqué par le parcours hiver, que l'automatisation avait
  mis au jour : le plan se figeait sur le profil d'avant la saisie).
- **Le DOUBLON des réseaux** : les réseaux cochés dans « Recharge et
  services » (le filtre carte, persisté) arrivent COCHÉS dans le plan de
  chaque nouveau trajet — et restent modifiables pour ce trajet-là.

585 tests unitaires, 189 parcours E2E (+1).

## [0.58.0] — 2026-08-29 — Retrait des transports en commun (PR #83)

Décision d'Armelin, confirmée après essai le 29/08 : « je ne vois aucun
véhicule circuler sur la carte. Pour alléger les menus, il faut mieux
supprimer cette section. » La roadmap le prévoyait en toutes lettres depuis
le 27/08 : « si Armelin le confirme après un essai, on retirera le tout
proprement. » C'est fait :

- **Retrait complet** : le panneau, la couche carte, le décodeur GTFS-RT,
  l'annuaire des réseaux temps réel, leurs 45 tests unitaires et leurs 13
  parcours E2E. Une couche qu'on ne voit pas vivre alourdit le menu sans
  informer. Le code reste dans l'histoire git si le besoin renaît.
- Le menu des réglages descend à trois sections : Affichage (fonds,
  trafic), Mes lieux (favoris).

585 tests unitaires (−45), 188 parcours E2E (−13).

## [0.57.0] — 2026-08-28 — Le mode copilote (PR #82)

La troisième décision tranchée du §4 du triage. Sans serveur, pas de second
appareil : le cadrage honnête est UN PANNEAU POUR LE PASSAGER sur l'appareil
du suivi — consulter et préparer pendant que le conducteur conduit.

- **Un bouton « Copilote » au bandeau** ouvre un panneau au-dessus de lui,
  borné à la moitié de l'écran — la route reste la moitié de l'information.
  Il dit d'emblée pour qui il est : « Pour le passager — le conducteur garde
  les yeux sur la route. »
- **Recharges à venir** : chaque arrêt restant du plan — nom, réseau,
  distance restante vivante, SOC prévus (arrivée → départ), durée — et ses
  **commodités sur place à la DEMANDE** (un bouton, un appel, la réponse
  survit aux fixes suivants : elle se raccroche par clé à la
  reconstruction).
- **Sur la route** : TOUS les événements Bison Futé encore devant, avec
  leur distance — le bandeau n'annonce que le prochain, le copilote lit la
  suite.
- **À l'arrivée** : restant, durée, heure estimée — et la **météo à
  l'arrivée sur demande** (Open-Meteo à l'heure d'arrivée ; au-delà de
  l'horizon de prévision, on le dit — la règle de la page météo).
- Tout le reste est LOCAL : ouvrir le panneau n'appelle rien (mesuré par un
  parcours), et il se reconstruit à chaque fixe tant qu'il est ouvert.
- Les arrêts annoncés au bandeau portent désormais position et SOC prévus —
  c'est ce qui rend le panneau possible sans un appel de plus.

630 tests unitaires, 201 parcours E2E (+2).

## [0.56.0] — 2026-08-28 — Les profils de pauses humaines (PR #81)

La deuxième décision tranchée du §4 du triage. Un trajet électrique
s'arrête de toute façon : autant que l'arrêt serve AUSSI les humains à
bord. Trois réglages sur la page « Arrêts de recharge » :

- **« Chaque arrêt dure au moins » (20/30/45 min)** — et LA PAUSE PAIE LA
  CHARGE : si le besoin tient en moins, on remplit ce que le temps permet
  (plafond respecté, dichotomie sur la courbe non linéaire au-dessus de
  80 %) — on repart plus chargé, jamais du temps perdu.
- **« Une pause au moins toutes les » (2 h / 3 h de route)** — l'intervalle
  se convertit en mètres à la vitesse de CE trajet et force l'arrêt même
  quand la batterie tiendrait ; quand c'est LUI qui borne, le refus le
  nomme (« la limite de votre réglage de pause »), pas la réserve.
- **« Autour des arrêts, privilégier » : Famille (aire de jeux) / Animal
  (espace vert) / Repas (restauration)** — chaque profil HONORÉ PAR UNE
  MESURE (corridor Paris-Lyon, 28/08 : ≥ 293 aires de jeux, ≥ 220 espaces
  verts, ≥ 1 400 restaurants à 600 m du tracé). Une PRÉFÉRENCE, jamais un
  filtre : bonus de vingt points au choix de borne, et l'arrêt DIT sa
  trouvaille (« aire de jeux à 151 m »).
- **La forme de la requête est une mesure aussi** : la recherche corridor
  SATURAIT Overpass (timeouts relevés) ; une UNION de disques de 500 m
  autour des seules bornes candidates répond en ~7 s — UN appel par
  (trajet, profil), jamais au réglage, échec bénin et dit.

630 tests unitaires (+10), 199 parcours E2E (+1).

## [0.55.0] — 2026-08-28 — Le plan de recharge sent la météo, le relief et la vitesse (PR #80)

La demande d'Armelin du 28/08 : l'algorithme d'autonomie doit prendre en
compte le véhicule, le SOCE, la température aux deux bouts, le dénivelé, la
vitesse du parcours — et le bridage BMS par batterie trop froide ou trop
chaude (« sur mon VF8 : 60 kW à chaud, 30 kW sous 0 °C »).

- **Un module pur, testé à sec** (src/lib/conditions.ts) : vitesse moyenne
  du parcours (la durée du moteur IGN PORTE déjà les limites tronçon par
  tronçon — traînée en v², bornée), température à la CONVENTION DES ANNEAUX
  d'autonomie (+1,2 %/°C sous 20, +0,5 % au-dessus — deux modèles diraient
  deux autonomies), dénivelé en KILOWATTHEURES (m·g·h, traction 85 %,
  récupération 60 % — un col ne coûte pas un pourcentage), et bridage
  thermique : sous 0 °C ou dès 35 °C d'air, la charge plafonne aux valeurs
  DÉCLARÉES du véhicule — le choix de borne aussi (une 350 kW bridée à 60
  ne vaut plus mieux qu'une 60).
- **Les relevés, UNE fois par itinéraire** : Open-Meteo aux deux bouts
  (départ maintenant, arrivée à l'heure estimée — la dérogation du 22/08
  couvre cet usage), altimétrie IGN pour D+/D−, vitesse sans aucun appel.
  Chaque source peut échouer SEULE ; cocher une case ne rappelle rien.
- **Le profil véhicule s'étend** (facultatif) : masse, charge max sous
  0 °C, charge max en canicule. Le catalogue porte les bridages du VF 8 —
  la SOURCE est le relevé d'Armelin sur son véhicule, seuls des relevés y
  entrent. Le SOCE comptait déjà (capacité réelle).
- **Tout est DIT, provenance comprise** : « Pourquoi ce plan ? » énonce les
  degrés, les facteurs, les kWh du relief, le bridage — et la limite de la
  méthode : la température de l'AIR, pas celle de la batterie. Deux
  mensonges d'affichage débusqués par le parcours hiver : la ligne d'arrêt
  disait « à 150 kW retenus » sous un plan bridé à 30, et l'aveu final
  prétendait calculer « à plat » — les deux suivent désormais le calcul.
- Sans conditions relevées, RIEN ne change : le contrat est un test.

620 tests unitaires (+22), 198 parcours E2E (+2).

## [0.54.0] — 2026-08-28 — Le partage de favoris (PR #79)

La seconde demande d'Armelin du 28/08 : « exporter les favoris si on change
de téléphone ou d'ordinateur. Et même un partage. » L'export/import JSON
existait (PR #10) — le neuf, c'est le LIEN.

- **« Partager mes favoris »** dans le volet Favoris : un lien qui porte les
  favoris seuls (fragment `#favs=`, jamais envoyé à un serveur — de la main
  à la main, comme le partage de trajet). Sur téléphone, la feuille de
  partage du système (navigator.share) ; sinon le lien se copie. 100 lieux
  au plus — au-delà, le refus nomme le remède : l'export.
- **Les repères — domicile, travail — ne voyagent JAMAIS par lien** :
  partager « chez moi » d'un geste distrait doit être impossible, pas
  improbable. Le fichier d'export reste l'outil du déménagement complet ;
  la note du volet distingue les deux gestes.
- **La réception DEMANDE avant d'écrire** : boîte de confirmation (dialog
  natif) listant les lieux, « Ajouter » / « Ignorer » ; un lien forgé rend
  null (jamais un lot partiel), les doublons s'écartent par la POSITION à
  cinq décimales — renommé, un lieu reste le même endroit. Le fragment
  s'efface aussitôt : recharger ne repose pas la question.
- Et un défaut débusqué au passage : le reset `* { margin: 0 }` écrasait le
  centrage natif des dialogues modaux — les deux boîtes (choix de favori,
  réception) collaient en haut. `margin: auto` redonné, vu sur capture.

598 tests unitaires (+7), 196 parcours E2E (+5).

## [0.53.0] — 2026-08-28 — Les feuilles basses (PR #78)

Armelin a tranché la première décision du triage : « commence par les bottom
sheets ». Sur téléphone, le planificateur et le menu deviennent des FEUILLES
ancrées en bas — la carte respire au-dessus, le pouce atteint tout. Sur
grand écran, RIEN ne change.

- **Une mécanique, plusieurs volets** (src/carte/feuille-basse.ts) : poignée
  (aria-hidden — un confort du doigt, le clavier passe par le bouton comme
  avant), mi-hauteur par défaut, plein écran au tirer (88 % : l'en-tête et
  un liseré de carte restent TOUJOURS visibles), fermeture au geste franc
  vers le bas. Le palier d'arrivée est une fonction PURE testée à sec : un
  flick décide seul (± 0,5 px/ms, vitesse lue sur le DERNIER segment du
  geste), un lâcher lent va au palier le plus proche.
- **Trois pièges d'empilement mesurés puis réglés** : la feuille MapLibre
  pose `transform: translate(0)` sur chaque contrôle (le fixed s'ancrait
  DANS la pastille) ; les conteneurs MapLibre sont des contextes (les
  contrôles bas-droite passaient par-dessus — le conteneur PORTEUR monte) ;
  `#carte` en position fixed est un contexte à lui seul (le pied de page,
  peint après, restait dessus — il s'efface sous une feuille ouverte).
- Les fiches de borne et de lieu — déjà ancrées en bas — suivront si
  l'essai convainc (BS-2).

591 tests unitaires (+4), 191 parcours E2E (+4).

## [0.52.0] — 2026-08-28 — « Le plus rapide / Le plus court » (PR #77)

Le dernier candidat du triage du 28/08 — les « profils de trajet » — CADRÉ
PAR LA MESURE (getcapabilities du 28/08) : le moteur public IGN ne connaît
que DEUX optimisations, fastest et shortest. « Économe » n'a pas de modèle
de consommation côté service, « Sans péage » pas de contrainte de péage —
les exposer serait des étiquettes vides. On expose ce qui EST.

- **« Le plus rapide / Le plus court »** en pilules sur la page Options,
  sous Voiture / À pied ; le recalcul part au changement. Les évitements
  (autoroutes, tunnels, ponts) couvraient déjà le reste du levier réel.
- **Le réglage voyage dans le lien partagé** (`;opt=shortest`) : un trajet
  « le plus court » rejoué en « rapide » serait un autre trajet sous le même
  lien. `fastest` reste absent du fragment — les liens déjà partagés restent
  identiques à eux-mêmes, et rejouent en `fastest` comme toujours.
- La feuille de route et « Comparer avec et sans autoroute » lisent le
  CLICHÉ, optimisation comprise : ils décrivent le trajet tracé.

587 tests unitaires (+2), 187 parcours E2E (+1).

## [0.51.0] — 2026-08-28 — La frise du trajet en suivi (PR #76)

La candidate « après NAV-1 » du triage du 28/08 : la « barre verticale » du
mandat, rendue avec ce que la donnée PERMET.

- **Une frise verticale sur le bord gauche en suivi** — départ en bas,
  arrivée en haut : pastilles vertes numérotées des arrêts de recharge (les
  mêmes numéros que la carte et la liste), losanges ambre des événements
  Bison Futé posés à leur kilomètre, curseur-voiture qui avance à chaque
  fixe. Reconstruite au fixe : quelques dizaines de spans par seconde ne
  coûtent rien, et la frise reste juste sans invalidation à gérer.
- **Jamais un dégradé de fluidité** : Bison Futé publie des événements
  ponctuels (mesure du 27/08), la frise montre des événements ponctuels.
- Décorative au sens strict (aria-hidden) : tout ce qu'elle montre est déjà
  DIT en texte dans le bandeau — prochain arrêt, prochain événement.

585 tests unitaires, 186 parcours E2E (+1).

## [0.50.0] — 2026-08-28 — La recherche par catégories (PR #75)

Septième et dernière PR du découpage initial du mandat UX du 28/08 (POI-1).

- **Cinq catégories « dans la vue, à la demande »** — Pharmacies,
  Restaurants, Boulangeries, Supermarchés, Toilettes — dans la page
  « Recharge et services ». PAS une couche : une couche suit la carte et
  rappelle le service à chaque glissement ; ici UN clic fait UN appel
  Overpass (le miroir français, comme les commodités), et la liste ne bouge
  plus — le contrat est écrit sous les boutons. Recliquer efface.
- **Frugalité stricte, mesurée par les parcours** : aucun appel sous le
  zoom 12 (refus motivé — cent lieux au hasard sur la France seraient un
  mensonge), aucun appel au déplacement, plafond de 100 résultats annoncé
  quand il tronque. Overpass saturé : message français, état réarmé.
- Les lieux en cercles violets, nom OpenStreetMap au clic (textContent,
  règle du projet), survivants d'un changement de fond.
- Et une leçon payée une DEUXIÈME fois (après `.iti-demarrer`) : la feuille
  MapLibre pose un fond de survol sur `.maplibregl-ctrl button:hover`
  (0-3-1) — le bouton actif survolé devenait blanc sur gris 5 %. Mesuré à
  la couleur calculée, corrigé à 0-4-0.

585 tests unitaires (+6), 185 parcours E2E (+3).

## [0.49.0] — 2026-08-28 — L'orientation à trois états (PR #74)

Sixième PR du mandat UX du 28/08 (NAV-1).

- **Un bouton d'orientation dans le bandeau de suivi**, à trois états qui se
  cyclent : **Cap en haut** (défaut — la route devant soi), **Nord en haut**
  (redressée au clic, le nord TENU sous les fixes), **Vue libre** (la carte
  suit la voiture sans toucher à la rotation posée au doigt — easeTo fige ce
  qu'il ne nomme pas, et c'est ici une vertu). Le choix tient la session.
- **Le cap se LISSE** (src/lib/orientation.ts, pur et testé à sec) : 35 % de
  l'écart par mesure, arc le plus court — 350° vers 10° fait +20°, jamais un
  tour complet ; les écarts sous 3° sont du tremblement, ignorés. Le premier
  cap est pris entier : la carte ne part pas de travers.
- **À l'arrêt, la boussole prend le relais** — DeviceOrientation ouvert
  APRÈS un geste (« Démarrer », ou le passage en mode cap), permission iOS
  demandée à ce moment-là, jamais d'office. Seuls les alphas ABSOLUS sont
  convertis (360 − alpha) : un alpha relatif pointerait sur la position
  d'ouverture de la page. Refusée : le cap GPS seul, comme avant.

579 tests unitaires (+11), 182 parcours E2E (+2).

## [0.48.0] — 2026-08-28 — Réglages élargis, durée sur les pastilles (PR #73)

Cinquième PR du mandat UX du 28/08 (EV-1).

- **Le plafond de charge descend à 50 %** (50/60/70 rejoignent 80/90/« au
  besoin ») : sous 80 %, la charge reste dans la zone rapide de la courbe —
  certains préfèrent trois arrêts éclair à un plein. Le modèle borne déjà à
  [50, 100] ; un plafond intenable reste refusé avec son remède, et les
  commandes restent pour revenir en arrière.
- **Le détour des lieux d'exception monte à 30 min** — Nomadio va jusque-là.
- **La durée de charge s'écrit SOUS chaque pastille** du plan sur la carte
  (« 18 min », halo blanc ; « sans recharge » pour un arrêt imposé sans
  besoin) : le « 2 » dit l'ordre, pas le prix — 18 et 45 minutes ne se
  valent pas quand on choisit lequel sauter. Rendu vérifié par capture.

568 tests unitaires, 180 parcours E2E (+2, un étendu).

## [0.47.0] — 2026-08-28 — « Pourquoi ce plan ? » (PR #72)

Quatrième PR du mandat UX du 28/08 (UX-4). Un plan de recharge qui ne
s'explique pas se subit ; celui qui invente des raisons — « plus fiable »,
« meilleur choix » — ment. Le volet n'explique qu'avec ce que le calcul SAIT.

- **Un volet discret sous le résumé du plan** : les consignes de l'usager
  reprises en toutes lettres (SOC de départ, réserve, plafond — seulement
  s'il existe —, cible d'arrivée) ; ses choix quand il y en a (réseaux
  cochés, arrêts imposés, bornes écartées au « − ») ;
- **chaque arrêt motivé** avec le critère que le planificateur calcule
  vraiment (compromis distance gagnée / puissance / détour — lib/arrets.ts),
  le SOC d'arrivée, la charge et son plafond, la puissance RETENUE (minimum
  borne/véhicule, l'écart nommé quand la borne offre plus), le détour ;
- **l'aveu du modèle en clôture** : à plat, à consommation constante — ni
  relief, ni vent, ni trafic, ni courbe de charge réelle.

568 tests unitaires, 178 parcours E2E (+1).

## [0.46.0] — 2026-08-28 — La fiche de destination (PR #71)

Troisième PR du mandat UX du 28/08 (UX-2, état « destination sélectionnée »).
Choisir une adresse dans la recherche posait un marqueur MUET : pour en faire
quelque chose, il fallait retrouver le lieu dans le planificateur ou par
appui long.

- **Une fiche compacte s'ouvre sur le lieu choisi** — nom BAN, contexte, et
  les quatre gestes qu'on vient faire : **Y aller** (le volet s'ouvre, la
  destination porte son nom, le départ se déduit de la position connue ou se
  demande en toutes lettres — mécanique `allerVers` existante), **Ajouter
  aux favoris** (le nom est déjà tranché : aucune attente, contrairement à
  l'appui long qui résout d'abord l'adresse), **Photos de rue** (Panoramax,
  sur demande seulement) et **Copier les coordonnées**.
- Rien de nouveau ne part sur le réseau : les quatre gestes réutilisent des
  mécaniques déjà mesurées (PR #10, #46).

568 tests unitaires, 177 parcours E2E (+3).

## [0.45.0] — 2026-08-28 — La planification allégée (PR #70)

Deuxième PR du mandat UX du 28/08 (UX-3). La capture d'Armelin montrait le
volet Itinéraire : jusqu'à SIX favoris répétés sous CHAQUE champ, et un
« Effacer le trajet » offert alors qu'aucun trajet n'existe.

- **Les favoris quittent les champs** : un bouton « Favoris… (n) » par champ
  ouvre un `<dialog>` NATIF — focus piégé, Échap, arrière-plan inerte sans
  une ligne de plomberie — avec recherche qui filtre sur le nom et
  l'adresse. Reconstruit à chaque ouverture : les favoris bougent. Seuls
  « Ma position », Domicile et Travail restent en ligne.
- **« Effacer le trajet » ne paraît que s'il y a matière** — un point, une
  étape ou un trajet ; il se range de lui-même une fois le volet vierge.
- **« ⇅ Inverser »** échange départ et destination — points, libellés,
  champs — et recalcule dans l'autre sens. Le test lit les COORDONNÉES de la
  requête au moteur : un échange d'étiquettes seules recalculerait le même
  trajet sous d'autres noms. Un point sans libellé (trajet rejoué d'un lien
  partagé) s'affiche en coordonnées plutôt qu'en champ vide.

568 tests unitaires, 174 parcours E2E (+3, un adapté au nouveau parcours).

## [0.44.0] — 2026-08-28 — Le socle mobile du mandat UX (PR #69)

Armelin a testé sur téléphone et transmis un cahier des charges complet de
refonte UX. Il est TRIÉ dans docs/mandat-ux-28-08.md — déjà livré / contredit
par une mesure / à faire / à décider — et cette PR livre son socle :

- **L'en-tête mobile tient sur UNE rangée** (la capture montrait deux rangées
  sur un tiers d'écran) : marque en petit — effacée sous 400 px, elle vit
  dans l'onglet et l'icône —, champ qui prend le reste, et LA PLACE DU MENU
  RÉSERVÉE : à pleine largeur, l'en-tête coupait le bouton (« enu » à
  l'écran, mesuré puis verrouillé par un test de rectangles).
- **Safe areas** : l'en-tête sous l'encoche, les contrôles et bandeaux bas
  au-dessus de la barre de geste (env(safe-area-inset-*), jetons
  --sur-encoche / --sur-barre-basse).
- **Les contrôles bas-droite ne se chevauchent plus** (« Me localiser » posé
  SUR le zoom — capture) : marges explicites par groupe.
- **Les z-index deviennent des JETONS nommés** dans tokens.css : qui
  recouvre qui se lit en un seul endroit.
- **Le bouton contact des Professionnels se lit enfin** : `.page-corps a`
  (0-1-1) écrasait la couleur de `.page-action` (0-1-0) — bleu accent sur
  fond bleu. Le sélecteur devient `a.page-action`, `:visited` couvert, et le
  test lit la couleur CALCULÉE.
- **Le « toucher fantôme » des suggestions : cherché et NON REPRODUIT.** Le
  preventDefault() du pointerdown supprime déjà les événements souris de
  compatibilité (spec Pointer Events). Un correctif a été écrit, SABOTÉ pour
  vérification — le parcours passait dans les deux cas : il n'a pas été
  gardé. Le parcours de recouvrement reste en garde-fou.

568 tests unitaires, 171 parcours E2E (+3 : Menu entier à 320 px sans
défilement horizontal, garde-fou du toucher fantôme, contraste calculé du
bouton contact).

## [0.43.1] — 2026-08-27 — Le prochain événement trafic, annoncé au volant (PR #64)

La seconde candidate des études. La barre de fluidité en dégradé est ÉCARTÉE
avec la mesure (Bison Futé ne publie que des événements ponctuels — six
bouchons nationaux relevés à 20 h) ; ce qui est honnête et utile, c'est
d'ANNONCER : « Travaux dans 12 km (Bison Futé) », dans le bandeau du suivi.

- Les événements EFFECTIFS à moins de 2 km du tracé, projetés à leur
  kilomètre — les PRÉVISIONNELS sont tus : les travaux de mardi ne
  concernent pas le volant. Le prochain DEVANT soi s'annonce, jusqu'à 50 km ;
  derrière soi ou hors route, silence.
- Relevés au démarrage du suivi puis RAFRAÎCHIS toutes les cinq minutes tant
  qu'il tourne — un accident arrive pendant qu'on roule. L'échec est bénin :
  la ligne reste vide.
- La fixture E2E pose ses événements en Lambert-93 (le point calculé par
  inversion numérique de la reprojection du projet), et le beforeEach du
  guidage BOUCHONNE Bison Futé comme Overpass : aucun parcours ne frappe les
  services réels.

568 tests unitaires (+2), 168 parcours E2E (+1).

## [0.43.0] — 2026-08-27 — La vitesse limite cartographiée (PR #63)

La première des deux candidates issues des études : maxspeed OSM couvre 97 à
100 % des axes mesurés — la donnée porte la fonctionnalité.

- **Un disque cerclé de rouge** à gauche du bandeau de suivi, au-dessus de la
  vitesse GPS. CARTOGRAPHIÉE, pas mesurée : travaux et limites variables lui
  échappent — le panneau le dit (title), et jamais « ISA », qui désigne un
  dispositif réglementaire embarqué. Ses couleurs ignorent le thème sombre :
  un panneau routier ne change pas de couleurs la nuit.
- **UN appel Overpass par trajet**, au démarrage du suivi, EN POST (polyligne
  serrée : 300 m de pas, rayon 25 m) ; la lecture est ensuite LOCALE à chaque
  fixe. Et le démarrage N'ATTEND PAS Overpass : les limites arrivent quand
  elles arrivent — mesuré d'abord en bloquant, douze parcours rouges, corrigé.
- **Des intervalles, pas des points** : la première écriture échantillonnait
  les nœuds OSM — un test l'a prise en défaut sur une ligne droite où les
  nœuds s'espacent d'un kilomètre. La route est continue entre ses nœuds.
- **Les routes qui croisent sont écartées par leur empreinte** (deux nœuds
  proches ET cent mètres d'étalement) : le pont à 30 n'affiche pas sa limite
  sur l'autoroute qu'il enjambe. Et l'on SE TAIT hors tronçon connu, hors
  route, et sur les valeurs illisibles — aucun panneau est mieux qu'un
  panneau faux.

566 tests unitaires (+10), 167 parcours E2E (+1).

## [0.42.0] — 2026-08-27 — La fiche des lieux d'exception (PR #62)

Le retour d'Armelin du soir même : « il est impossible de cliquer dessus pour
avoir le détail à l'identique d'une station de recharge ». Le nom volait vers
le lieu, et c'était tout — la liste savait où, jamais quoi.

- **L'index s'enrichit, mesures à l'appui** : référence Mérimée (100 % des
  classés), siècle de construction (85 %), adresse (27 %). 890 Ko → 1,50 Mo
  brut, 0,42 Mo gzippés servis — toujours à la demande, jamais précaché.
- **`<fiche-lieu>`** : le même cartouche que les bornes (mêmes classes, un
  seul langage visuel) — statut « Monument historique classé », identité
  (commune, adresse, siècles), et **la notice officielle Mérimée à un clic**
  (pop.culture.gouv.fr — l'historique complet vit chez le ministère, pas dans
  un index qu'il faudrait décupler). La référence est vérifiée par motif au
  décodage : un index altéré ne fabrique pas d'URL vers n'importe quoi.
- **Trois chemins vers la fiche** : le nom dans la liste, le MARQUEUR sur la
  carte (cliquable, rôle et intitulé accessibles), et depuis la fiche —
  « Itinéraire vers ce lieu », « Passer par là » (étape) et « Voir sur la
  carte ». Les deux cartouches (borne, lieu) se rangent l'un l'autre : une
  seule surface à la fois, la règle de la PR #45.
- La fiche DIT ce qu'elle ignore : horaires et conditions de visite ne sont
  pas au fichier — « renseignez-vous avant le détour ».

556 tests unitaires (+2), 166 parcours E2E (le parcours des lieux s'étend à
la fiche).

## [0.41.4] — 2026-08-27 — Les deux dernières études, verdicts mesurés (PR #61)

Aucun code. Le cadrage navigation mobile est soldé jusque dans ses études
(docs/navigation-mobile.md, §Études) :
- **maxspeed OSM** : 97-100 % de couverture mesurée sur trois types d'axes
  (A6, RCEA, départementales) — la vitesse limite CARTOGRAPHIÉE est faisable,
  un appel Overpass par trajet, lecture locale en suivi. Jamais « ISA » : ce
  sigle désigne un dispositif réglementaire embarqué.
- **La barre de trafic en dégradé est ÉCARTÉE, avec la mesure** : le flux
  Bison Futé du 27/08 à 20 h 05 porte 359 événements nationaux, tous
  PONCTUELS, dont SIX bouchons pour toute la France — aucune fluidité de
  tronçon n'existe dans la donnée, et une barre verte partout presque
  toujours mentirait par sa promesse implicite. L'honnête et utile — annoncer
  les événements du corridor dans le suivi (« Travaux au km 78 ») — est
  consigné comme candidate.

## [0.41.3] — 2026-08-27 — La vue 3D du suivi (PR #60)

La dernière PR du cadrage navigation mobile — ESSAYÉE avant d'être promise,
comme le cadrage l'exigeait : capture du fond Plan IGN incliné à 60° sur
Lyon au zoom du suivi. Verdict : le champ proche reste net, le lointain
rapetisse — c'est la nature d'une perspective, et les étiquettes cuites dans
le raster rapetissent avec elle (un fond vectoriel les garderait à taille
d'écran ; la limite est connue et assumée).

- La carte S'INCLINE À 55° quand le suivi démarre — la vue devant soi.
- « Vue à plat » la refuse d'un bouton : certains lisent mieux à plat, et le
  choix tient la session.
- L'arrêt du suivi REDRESSE la carte, comme il rend le nord : l'inclinaison
  n'a de sens qu'en suivi.
- Une leçon d'animation, mesurée par le parcours E2E avant d'être comprise :
  un easeTo interrompt le précédent et FIGE ce qu'il ne nomme pas — le
  premier fixe GPS gelait l'inclinaison à 2°. Elle voyage désormais avec
  chaque fixe.

554 tests unitaires, 166 parcours E2E (+1).

## [0.41.2] — 2026-08-27 — La prochaine manœuvre en grand (PR #59)

La troisième PR du cadrage navigation mobile : « indiquer les flèches de
direction à chaque intersection ou sortie ».

- La manœuvre OSRM VOYAGE désormais avec chaque étape (`manoeuvreDe`,
  normalisée : huit directions, rond-point, arrivée) — elle mourait jusqu'ici
  dans la traduction en français.
- Le bandeau la DESSINE en grand : UNE flèche, huit rotations — c'est ce qui
  les rend cohérentes entre elles — et des glyphes propres pour le rond-point
  et l'arrivée. Rien de committé, tout se relit (le précédent des éclairs).
- AU DÉPART, TOUT DROIT : le `modifier` du moteur y dit le côté d'engagement,
  pas un ordre — une flèche « à gauche » sous le mot « Départ » se lirait
  comme un ordre. Vu sur les fixtures mêmes du projet.
- La flèche DISPARAÎT hors route ou sans feuille : une flèche qui pointe au
  hasard est pire qu'aucune.

554 tests unitaires (+3), 165 parcours E2E (assertion ajoutée au parcours du
suivi).

## [0.41.1] — 2026-08-27 — Le cap et la vitesse GPS (PR #58)

La deuxième PR du cadrage navigation mobile.

- **La carte s'oriente au cap GPS** pendant le suivi — la direction du
  déplacement en haut, comme toute navigation. JAMAIS sous 7 km/h : le cap
  d'un véhicule immobile est du bruit qui ferait tournoyer la carte au feu
  rouge — on garde l'orientation acquise. L'arrêt du suivi REND LE NORD.
  Aucune permission nouvelle : le cap vient du fixe GPS, pas de
  DeviceOrientation (qui attend son chantier, permission iOS oblige).
- **La vitesse GPS dans un cercle** — cachée quand le récepteur ne la donne
  pas (`speed` nul) : un chiffre figé serait un mensonge. Ce n'est PAS la
  vitesse limite : l'ISA attend l'étude maxspeed OSM, et rien n'est promis
  d'ici là.
- Le parcours E2E instrumente la géolocalisation elle-même (Playwright ne
  simule ni cap ni vitesse) et pousse des fixes complets : mouvement, arrêt
  au feu, mesure absente, arrêt du suivi.

551 tests unitaires, 165 parcours E2E (+1).

## [0.41.0] — 2026-08-27 — Comparer avec et sans autoroute (PR #57)

Le verdict « alternatives » de l'étude appliqué : le moteur public ne rend
pas d'itinéraires A/B/C (mesuré PR #6), et une variante par étape décalée
serait un artifice. On calcule LA variante qui a un sens — l'autre choix
d'autoroute — et on la nomme par ce qu'elle est.

- Page Options, à la demande : UN appel au moteur pour la variante ; les
  plans de recharge des deux tracés se calculent LOCALEMENT quand un véhicule
  est renseigné (l'index est en cache) — car c'est le TOTAL route + charge
  qui décide : une portion gratuite d'autoroute peut battre la nationale une
  fois la charge comptée.
- Les plans comparés sont calculés À NEUF, sans les arrêts imposés ni les
  réseaux préférés du trajet courant — des consignes posées sur un tracé ne
  valent pas pour l'autre, et c'est écrit sous le résultat. Les péages ne
  sont pas comptés : le tarif n'est dans aucune source publique — écrit
  aussi.
- « Prendre cette variante » bascule l'évitement (état ET case cochée) et
  recalcule — la variante devient le trajet.
- En chemin, la lecture du profil véhicule est EXTRAITE (#lireVehicule) :
  le plan de recharge et la comparaison lisaient IndexedDB chacun à sa
  façon — deux lecteurs, une seule interprétation désormais.

551 tests unitaires, 164 parcours E2E (+1).

## [0.40.0] — 2026-08-27 — Les lieux d'exception près du trajet (PR #56)

La demande Nomadio du mandat : « afficher des lieux d'exception à proximité
de son parcours [avec] le détour maximal acceptable en termes de minutes »,
et pouvoir « les ajouter à la planification ». DATAtourisme étant écarté
(clé), la voie souveraine est la base MÉRIMÉE du ministère de la Culture.

- **Les trois mesures d'abord** (46 760 notices du fichier du jour) : 95 %
  de coordonnées exploitables ; 14 990 monuments CLASSÉS contre 31 321
  inscrits seuls — la coupe éditoriale retient les classés, un inscrit est
  souvent une façade privée ; l'index réduit tient en 890 Ko.
- **L'index est ENGENDRÉ et versionné** (scripts/generer-monuments.mjs) : le
  CSV source pèse 100 Mo et ne touche jamais le navigateur ; la CI ne dépend
  pas du seau du ministère ; le fichier servi n'entre ni dans le budget
  bundle ni dans le précache. Un parcours E2E charge l'index RÉEL du dépôt :
  s'il ne trouvait rien entre Paris et Lyon, c'est l'index qui serait cassé.
- **La page « Lieux d'exception »** du planificateur : détour maximal 5/10/
  20 min, calcul LOCAL sur le tracé (même mécanique que les bornes), trente
  lieux au plus — les plus proches du tracé — remis dans l'ordre du chemin,
  marqueurs sur la carte, et « Passer par là » qui fait du monument une
  ÉTAPE du trajet et recalcule. L'approximation est écrite : le détour est
  estimé à vol d'oiseau, la route réelle peut faire plus.

551 tests unitaires (+5), 163 parcours E2E (+2).

## [0.39.1] — 2026-08-27 — Les commodités en puces à pictogrammes (PR #55)

« Restautoroute affiche des informations claires avec de beaux logos toutes
les commodités […] alors que maps.infonovice.fr affiche uniquement une
liste » (Armelin, 27/08). Le chantier était de PRÉSENTATION — les données
sont celles de la PR #29, aucun appel de plus.

- Les commodités d'un arrêt s'affichent en PUCES : pictogramme du type
  DESSINÉ PAR LE CODE (pompe, couverts, tasse, WC — jamais un logo
  d'enseigne, marques déposées ; le nom s'écrit en toutes lettres à côté),
  et la distance qui décide — « 60 m » vaut le détour à pied, « 800 m » non.
- Douze puces au plus, le reste COMPTÉ : une grande aire porte trente
  commodités, et trente puces referaient le mur qu'on voulait abattre.
- Le même picto rejoint la liste de la fiche de borne — une seule famille
  visuelle, vérifiée par capture avant livraison.
- La phrase d'avant (« UNE PHRASE, PAS UNE LISTE ») était le bon choix dans
  un accordéon dense ; le planificateur en pages a la place, et la demande
  du 27/08 est explicite. La décision précédente est remplacée, pas oubliée.

## [0.39.0] — 2026-08-27 — Les péages du trajet, nommés (PR #54)

Le verdict de l'étude du 27/08 appliqué : les péages ne s'évitent pas (le
moteur public n'a pas de clause — mesuré PR #6), ils se RELÈVENT. Un bouton
dans la page Options : « Relever les péages du trajet » — un appel Overpass
au clic, jamais au fil de la carte.

- **Une gare n'est pas un nœud** : OSM cartographie souvent CHAQUE CABINE
  d'une barrière (une par voie). Les cabines à moins de 500 m d'avancement
  fondent en une gare, qui porte le premier nom déclaré du groupe — « 2 gares »
  là où le fichier dit quatorze nœuds.
- **La requête décrit le tracé par une polyligne décimée** (un point par
  kilomètre, plafonnée à 400 points) ; le rayon de 400 m absorbe l'écart des
  cordes dans les courbes, et le filtre EXACT se refait localement sur le
  vrai tracé — la première écriture du parcours E2E a d'ailleurs posé une
  cabine à 6 km de la ligne, et le filtre l'a écartée comme il devait.
- **Les limites en toutes lettres** : source OpenStreetMap (une gare absente
  de la carte n'est pas relevée), et le TARIF n'y figure pas — le promettre
  serait inventer.

546 tests unitaires (+10), 161 parcours E2E (+2).

## [0.38.0] — 2026-08-27 — La caméra rendue à l'usager (PR #53)

La première des quatre PR du cadrage navigation mobile
(docs/navigation-mobile.md), née du retour le plus concret d'Armelin : « je ne
peux plus dézoomer sur la carte car le zoom sur ma position se force
automatiquement ».

- **Un geste suspend la caméra de suivi** — glisser, molette, rotation. Le
  discriminant est l'`originalEvent` de MapLibre : nos propres `easeTo` n'en
  portent pas. La molette a demandé son propre écouteur : pendant l'animation
  du suivi (800 ms sur 1 000), son `zoomstart` est avalé.
- **« Recentrer » flotte sur la carte** quand la caméra est suspendue ; vingt
  secondes d'immobilité la rendent aussi — chaque nouveau geste repousse le
  compteur.
- **L'écran reste allumé pendant le suivi** (Screen Wake Lock) : un téléphone
  qui se verrouille au premier feu rouge n'est pas un suivi. Le verrou est
  repris au retour d'arrière-plan, RENDU à l'arrêt — le même devoir que le
  `clearWatch` — et son échec est bénin (l'écran suit le réglage du
  téléphone, comme avant).
- **Le bandeau se réduit** — « le cartouche en bas prend 1/3 de l'écran » :
  réduit, il garde la manœuvre, le restant et les boutons ; la note de limite,
  lue au démarrage, se range.

536 tests unitaires, 159 parcours E2E (+3 : caméra suspendue et rendue,
verrou compté demandé/rendu, bandeau mesuré plus petit).

## [0.37.0] — 2026-08-27 — « Nom de station contient… » (PR #52)

Le filtre né du cas IZIVIA/McDonald's : « IZIVIA FAST a fait un partenariat
avec McDonald […] ce serait bien de distinguer ces deux types de stations. »
Mesuré d'abord : les stations en restaurant portent bien le nom dans
`nom_station` (~36 lignes sur les 2 484 d'IZIVIA FAST), en graphies
inconstantes — « Mc Donald's », « McDonald's », doubles espaces, espace sans
chasse en fin de nom. D'où un filtre GÉNÉRIQUE par sous-chaîne, et non un cas
spécial McDo :
- au-delà du zoom 12, il part AU SERVICE en `suggest()` — le plein-texte du
  portail, vérifié par appel réel (36 lignes pour « Donald », zéro pour un
  `like` : le portail compare des mots entiers) ; un tri local d'un ensemble
  plafonné à 100 mentirait ;
- en deçà, il s'applique à l'index national en mémoire, APLATI : casse,
  accents et ponctuation ne comptent pas — « mcdonald » trouve les deux
  graphies, « beziers » trouve « Béziers-Frigoulas » ;
- débounce de 400 ms (chaque frappe partirait sinon au portail), persisté
  avec les autres filtres, restauré au chargement.

536 tests unitaires (+4 sur les chaînes réelles du fichier), 156 parcours E2E.

## [0.36.1] — 2026-08-27 — Les six études du mandat, verdicts datés (PR #51)

Aucun code : deux documents qui décident. docs/etudes-mandat-27-08.md rend
ses verdicts — API produits (bibliothèque partagée maintenant, proxy jamais,
API HTTP avec le backend premium seulement), péages (nommer oui, éviter non),
restauration (chantier de présentation), monuments (Mérimée sans clé, trois
mesures avant la PR), badges e-MSP (écarté : aucune source publique),
alternatives (« comparer avec/sans autoroute » plutôt qu'un faux A/B/C).
docs/navigation-mobile.md cadre le suivi téléphone en quatre PR et deux
études, wake lock en tête — sans renier « le suivi refuse de s'appeler
navigation ».

## [0.36.0] — 2026-08-27 — Sept retours d'interface, et un « réservé » qui n'interdit rien (PR #50)

La suite du mandat du 27/08 : les retours d'interface, chacun traité pour ce
qu'il révélait.

- **« Accès réservé » ne veut pas dire « interdit »** : « il y a des bornes où
  je vais charger qui sont taguées accès réservé alors que ça fonctionne très
  bien avec mon badge ». Le schéma IRVE ne connaît que deux états, et
  « réservé » couvre autant la flotte fermée que la borne ouverte à quiconque
  porte le badge de l'opérateur. Le bandeau nomme désormais la condition —
  badge, clientèle ou résidents — et invite à vérifier, au lieu de condamner.
  EN CHEMIN, une mesure : 240 lignes du fichier portent « Accès libre » dans
  QUATRE encodages estropiés (« Accs libre », « Acc¸s libre »…) — producteurs
  en Latin-1 ou Mac-Roman. La comparaison stricte les rendait « non
  déclarés » ; le motif les rattrape, tests sur les chaînes réelles.
- **L'encart d'installation ne se propose qu'au mobile** : sur ordinateur,
  Chrome affiche déjà sa propre icône d'installation — le bouton la doublait.
- **« Télécharger », pas « Charger »** : la liste déroulante de l'étendue du
  réseau national se confondait avec le filtre de puissance. Elle décide de ce
  qu'on TÉLÉCHARGE et garde hors ligne ; le filtre trie ce qui s'AFFICHE. Les
  libellés le disent désormais.
- **Les éclairs harmonisés** : la légende et la fiche affichaient l'émoji ⚡,
  jaune ; la carte dessine des éclairs blancs. Le même tracé SVG partout.
- **Les favoris se renomment** — « un displayname plus facile à visualiser » :
  édition en place (✎, Entrée valide, Échap annule), et l'adresse d'origine
  descend en SOUS-TITRE — « Maison de Mamie » n'aide que si l'on peut encore
  situer où c'est. L'export/import la transporte.
- **Le véhicule dit sa génération et son WLTP** : « un Xpeng G6 2024 n'a pas
  les mêmes caractéristiques que les nouveaux G6 2026 » — exact : le restylé
  passe à 80,8 kWh 5C sous 800 V, 451 kW en crête, 525 km WLTP (sources
  automobile-propre et L'argus, dans le catalogue). Le champ « années » n'est
  rempli QUE là où il est sourcé, la fiche constructeur s'affiche sous le
  choix, et la borne de vraisemblance des tests (400 kW) est relevée à 500 —
  la réalité l'avait dépassée.
- **Le bouton « Transports en commun » reste, ET la question est consignée** :
  Armelin n'en voit pas la plus-value visuelle. La couche montre bien les
  véhicules (cercles aux couleurs des réseaux, zoom ≥ 10, trois réseaux
  cochés au plus) — supprimer un travail mesuré de la PR #16 sur une
  impression demande une contre-mesure : la décision lui revient, écrite dans
  la ROADMAP.

532 tests unitaires, 154 parcours E2E.

## [0.35.2] — 2026-08-27 — Ménage des dépendances (PR #49)

ESLint 10.9.0 et Vite 8.2.2 (mineures Dependabot), vérifiées par toute la
chaîne. TypeScript 7.0.2 essayé et ÉCARTÉ avec la preuve : `tsc` passe sans
une erreur, mais typescript-eslint refuse de démarrer (« does not support
TS 7.0 », support annoncé pour ≥ 7.1). La chaîne de lint est une porte de
CI ; à reprendre quand elle suivra.

## [0.35.1] — 2026-08-27 — Le repère principal rendu aux lecteurs d'écran (PR #48)

`role="application"` posé sur `<main>` écrasait le point de repère principal :
un lecteur d'écran ne trouvait plus « le contenu principal » (audit Lighthouse
du 26/08). Le rôle vit désormais sur un conteneur interne — qui EMPORTE l'id
`#carte` : ni la feuille de style ni les trente parcours E2E qui le désignent
n'ont bougé, et `#carte` reste le nœud que MapLibre reçoit. Un parcours E2E
verrouille la structure : `<main>` sans rôle, l'application DANS le repère.

## [0.35.0] — 2026-08-27 — Le plan se règle, et se choisit sur la carte (PR #47)

Session mandatée « en autonomie » par Armelin, avec une vingtaine de retours
triés dans la ROADMAP. Cette PR livre le premier d'entre eux — le cœur du
planificateur EV.

### Le plafond de charge, et un plafond qui était mort

« Spécifier à combien de pourcentage de recharge maximale on souhaite partir
de la borne. Par exemple, filtré à 80 % maximum. » En l'implémentant, la
relecture a montré que le « plafond de confort » à 80 % du modèle ne tronquait
JAMAIS rien : sa clause d'échappement relevait la limite à 100 dès que le
besoin dépassait 80, et en dessous on chargeait le besoin exact. Du code qui
avait l'air d'une prudence, et qui n'en était pas une. Le nouveau réglage
(« Repartir des bornes au plus à » — 80/90/au besoin) est un plafond DUR : il
peut ajouter des arrêts, et quand il rend le trajet infaisable, le refus le
NOMME — « Vous pouvez aussi relever le plafond de charge. »

Au passage, un epsilon dans la comparaison d'arrivée : chaque charge vise
EXACTEMENT la cible, et l'arithmétique flottante rendait un 9,999 999 99 « en
dessous » d'une cible de 10 — un arrêt de plus réclamé pour un billionième.

### « Arriver aux bornes avec au moins »

Le réglage demandé (« choisir à combien de pourcentage de batterie il souhaite
arriver sur une borne ») EXISTAIT — c'est la réserve — sous l'intitulé « Ne
jamais descendre sous », qui ne répondait pas à la question posée. Renommé, et
enrichi d'un cran à 30 %.

### Le mode trajet : la carte s'assainit

Le plan affiché, « toutes les autres bornes de France disparaissent de la
carte ». Les bornes nationales s'effacent — et leur couche CESSE DE CHARGER,
pas seulement d'afficher : des punaises invisibles qui interrogent un portail
public seraient un gâchis silencieux. Restent le corridor du trajet (icônes de
puissance, cliquables, filtrées par les réseaux préférés — les bornes écartées
au « − » restent visibles : on revient sur un refus, pas sur une borne
invisible) et les arrêts du plan en pastilles numérotées — le « 2 » de la
carte est le « 2. » de la liste. Le volet des couches DIT ce qui se passe.
Effacer ou recalculer le trajet rend la carte.

### La fiche d'une borne commande le plan

« Sélectionner une borne proposée pour en voir son détail et décider de la
retirer » ; « sélectionner une borne non proposée et proposer de l'ajouter ».
Le cartouche de détail porte désormais « Retirer cet arrêt du plan de
recharge » ou « Ajouter au plan de recharge » — sur les bornes du corridor
seulement : hors trajet, aucun bouton qui mènerait à un plan impossible.

530 tests unitaires, 149 parcours E2E.

## [0.34.0] — 2026-08-27 — Un seul bouton, des pages, et 136 véhicules (PR #46)

Sept retours du 26/08. La refonte de l'interface qu'Armelin décrivait est
faite ; ce qui reste — choisir ses arrêts SUR LA CARTE — vient ensuite.

### Le planificateur en pages

« Au lieu d'ouvrir une nouvelle page à chaque fois qui soit propre et sans
nuisance graphique avec un bouton retour. » Cinq volets dépliables dans une
colonne de trois cents pixels formaient un couloir : une feuille de route de
quatre-vingts étapes repoussait la météo hors de l'écran, et retrouver le
résumé demandait de remonter à l'aveugle. **Une page à la fois, un titre, une
flèche.**

### Un seul bouton, plus trois

« Un seul bouton est plus efficace à comprendre que trois boutons où il faudra
se rappeler dans quel menu on peut trouver quelle option. » Le véhicule et les
couches deviennent des **pages** du planificateur. Leur logique ne bouge pas :
seule leur enveloppe disparaît.

Deux menus, parce qu'il y a deux sortes de pages : celles qui ne dépendent pas
d'un trajet — véhicule, couches, options — restent toujours accessibles ; les
autres n'ont rien à montrer tant qu'aucun trajet n'existe.

### « Partager » plutôt que GPX et KML

GPX et KML sont des mots de métier ; partager est un geste. Les deux fichiers
restent derrière, avec une phrase disant à quoi chacun sert.

### La destination suffit

« Une fois qu'on a mis le champ destination, ça calcule automatiquement par
rapport à notre position actuelle. » C'est fait — **mais la position n'est
jamais demandée d'office** : on se sert de ce qu'on a, parce que l'usager a
pressé « Me localiser ». La contrainte 4 du projet ne se négocie pas pour un
confort.

### Le reste des retours

- **Les titres qui se chevauchent** : une balise `legend` est rendue à cheval
  sur la bordure de son `fieldset`. Invisible tant que les cadres étaient
  plats ; depuis qu'ils sont arrondis, la légende sortait de sa carte.
- **« Allego - Burger King Chelles Sud (1) »** : le même défaut que la carte
  avait connu, dans l'autre panneau. J'avais corrigé le regroupement par
  exploitant côté couches et oublié le planificateur.
- **Aucun bouton pour aller vers une borne** : il fallait relever son adresse
  et la retaper, pour un point qu'on désignait du doigt.
- **« Carrefour » sans adresse** : le trajet partait des bonnes coordonnées,
  mais rien ne permettait de le vérifier.
- **Ni position, ni domicile, ni favoris en départ** : des raccourcis
  paraissent sous chaque champ.
- **Le rayon d'action sans position** : j'avais défendu l'inverse. Un rayon
  centré ailleurs que sur la voiture ne répond pas à une autre question — il
  répond à la même, faussement.
- **136 modèles, 32 marques**, groupés sous leur marque.

525 tests unitaires, 144 parcours E2E.

## [0.33.1] — 2026-08-26 — Une seule surface dans la colonne de gauche (PR #45)

Ce que les mesures de texte ne voyaient pas. Le cartouche de détail et les
volets du rail occupent le **même bord de l'écran** : ouverts ensemble, le
premier recouvre le second — les filtres des bornes passaient sous la carte de
détail. Leurs textes ne se recouvrent pas ; c'est la **surface entière** qui
masque l'autre, et c'est aussi un chevauchement.

Les deux sont désormais exclusifs, dans les deux sens : ouvrir le cartouche
referme le volet, ouvrir un volet referme le cartouche. Un parcours mesure le
croisement des rectangles et échoue s'il revient.

515 tests unitaires, 130 parcours E2E.

## [0.33.0] — 2026-08-26 — Quatre retours, et un compte faux (PR #44)

Armelin a rouvert la production. Quatre remarques, dont une qui a fait tomber
**un défaut grave livré la veille**.

### Le compte des points de charge était faux — six fois et demie trop

`nbre_pdc` porte le total de la STATION, répété à l'identique sur chacune de
ses lignes. L'index le SOMMAIT. Mesuré sur « Brico - Hannut » : **6 points de
charge réels, 36 annoncés**. À l'échelle du pays, **496 886 points annoncés
pour 76 024 réels**. Le pire est qu'un tel nombre reste crédible — personne ne
compte les bornes d'une aire pour vérifier. Corrigé en `max(nbre_pdc)`, et
vérifié sur les données réelles : Brico-Hannut affiche 6, la médiane nationale
est de 4 points par station.

### « Plusieurs réseaux que j'ai l'habitude d'utiliser n'y figurent pas »

Deux causes, mesurées.

**La liste s'arrêtait aux douze premiers.** IZIVIA FAST était treizième,
Atlante dix-huitième, ALLEGO vingt-deuxième. Un champ de recherche remplace la
troncature muette, et le panneau DIT combien il en cache.

**Et le regroupement portait sur le mauvais champ.** Sur les 14 133 stations
rapides, `nom_enseigne` forme **1 799 groupes dont 1 314 d'une seule station** :
certains producteurs y écrivent le nom du site — « Fastned Yvré L'Evèque »,
« Atlante - Montauban - Aldi », « IONITY GmbH IONITY Vrigny ». Fastned occupait
ainsi quatre cents entrées d'une station chacune et **n'apparaissait nulle part
sous son nom**. `nom_operateur` en forme **140**. Le filtre groupe donc par
exploitant, et la requête au portail interroge le même champ.

Vérifié sur les vraies données : Fastned France (65), IZIVIA (1 290), R3 (155),
Allego (691), Ionity (301) — tous trouvables, chacun d'un bloc.

### « La carte n'affiche pas toutes les stations électriques de France »

C'était vrai, et le seuil de 50 kW en était la cause. Il reste le défaut — en
deçà on ne s'arrête pas en voyage — mais ce n'est plus une limite imposée :
**« Toutes les bornes » charge les 56 781 stations** (2,5 Mo, une demi-minute,
puis 190 ms en relecture). Le panneau annonce le poids ET l'attente.

Et il donne le point de comparaison, parce qu'il sera fait de toute façon :
l'Avere-France recensait **200 045 POINTS de recharge** au 31 juillet 2026,
quand nous comptons des **STATIONS**. Sans le dire, l'écart passe pour un trou
de quatre-vingt-dix pour cent.

### Les commerces alentour se cliquent

Leur nom mène à la carte, un second bouton au planificateur. Un défaut
découvert en l'écrivant : sans point de départ, le clic ne produisait **rien du
tout**, pas même un message — le garde-fou du calcul rendait la main en
silence. Il le dit maintenant.

### Le suivi dégage la vue

« Trop de cartouches masquent la navigation, comme la recherche d'adresse. »
Volets refermés, recherche d'adresse et pied de page effacés le temps du
trajet ; les boutons restent atteignables, et tout revient à l'arrêt.

### Et les textes qui se chevauchent

Le piège classique de flexbox : un enfant flexible a `min-width: auto`, donc il
refuse de descendre sous la largeur de son plus long mot. Une adresse
d'autoroute débordait de sa colonne au lieu de revenir à la ligne — ce qui
n'arrive qu'avec un texte assez long, d'où sa survie aux relectures. Un
parcours mesure désormais les RECTANGLES de tous les textes du cartouche et
échoue au moindre recouvrement.

515 tests unitaires (497 avant), 129 parcours E2E (124 avant).

## [0.32.1] — 2026-08-26 — Un réseau, une case (PR #43)

Défaut trouvé **dans ce qui venait d'être livré**, en regardant la production :
la liste des réseaux proposait « LIDL (446) » ET « Lidl France (434) ».

**Mesuré sur l'index lui-même** : les 14 133 stations portent **2 615
écritures** d'enseigne, dont **onze groupes** désignent le même réseau sous
deux ou trois orthographes — **2 098 stations, 15 %** du réseau rapide
français. Cocher « LIDL » écartait donc 434 stations Lidl : un filtre qui ment
sans le dire, exactement le défaut que l'index venait de corriger ailleurs.

- Les écritures d'un même réseau **fondent en une case**, sous la variante la
  plus répandue, avec le compte cumulé.
- **La normalisation est volontairement timide** : casse, accents, ponctuation,
  et le seul mot « France ». Fondre à tort deux réseaux distincts serait un
  défaut PIRE que celui qu'on corrige — il ferait espérer une borne
  inaccessible. Vérifié sur les données réelles : 2 615 écritures deviennent
  2 603 groupes, soit exactement les onze fusions attendues et aucune autre.
- « France » est retiré **en tant que mot**, par découpage : une substitution
  de chaîne aurait amputé « Francelec » de ses six premières lettres.
- **Les écritures voyagent avec le libellé.** À partir du zoom 12 les bornes
  viennent du portail, qui compare des chaînes exactes : n'envoyer que le
  libellé canonique aurait simplement déplacé le défaut du local vers le
  distant.

497 tests unitaires, 124 parcours E2E.

## [0.32.0] — 2026-08-26 — Les onze retours du terrain (PR #32)

Armelin a testé la production le 25/08 et rendu onze remarques, captures à
l'appui. Elles sont toutes traitées ici. Trois d'entre elles étaient de vrais
défauts, deux touchaient à la structure de l'interface, et l'ensemble a fait
remonter **six défauts silencieux** que personne n'avait vus.

### Les bornes se voient enfin partout

- « Les points de charge ne s'affichent qu'entre 0 et 1 km de zoom » et « le
  filtre réseau devrait fonctionner quel que soit le niveau de zoom » avaient
  la **même cause** : les portails Opendatasoft plafonnent à 100
  enregistrements. Demander la France entière rendait cent bornes au hasard —
  pire qu'un refus, parce qu'un tel affichage ment sans le dire.
- **UN INDEX NATIONAL** le remplace : 14 133 stations de 50 kW et plus,
  **709 Ko en une seule requête** (mesuré), gardés en local, rafraîchis au
  mois. Sous le zoom 12 la carte les montre en amas ; au-dessus, la couche par
  emprise reprend la main. La liste des réseaux devient nationale et ne bouge
  plus quand la carte bouge.
- L'index est **aussi le choix frugal** : la couche par emprise émet une
  requête par déplacement de carte, lui n'en émet qu'une par mois. Et il répond
  **hors ligne**, ce qui prolonge la promesse de la PR #17.
- Le planificateur s'en sert aussi. Il émettait six requêtes plafonnées à cent
  et pouvait déclarer un trajet infaisable parce que la borne salvatrice était
  la cent-unième de son tronçon.

### Le cartouche de détail d'une borne

- « On ne peut pas cliquer sur un point de charge pour avoir son détail, ni le
  nom de l'opérateur ». La bulle faisait quatre lignes ; le fichier IRVE porte
  quarante champs. Le cartouche en montre six rubriques espacées, sur le modèle
  qu'Armelin a montré.
- **L'accès réservé passe en tête** : 23 901 stations sur 224 541 (11 %) sont
  fermées à une flotte ou à des résidents, et l'ancienne bulle les affichait
  comme les autres — elle envoyait donc vers des bornes inutilisables.
- **Le téléphone de l'opérateur** (renseigné 170 072 fois) devient un lien
  `tel:` : on le cherche quand la borne refuse de démarrer.
- **Les commodités alentour** avec leur distance, triées de la plus proche.
- **Ce qui manque est ÉCRIT** : aucune occupation en direct (aucune source
  publique française ne la diffuse nationalement), et un tarif renseigné sur
  24 % des lignes seulement, en texte libre, rendu tel quel.

### La main sur le plan de recharge

- « Des + et des − pour choisir moi-même les arrêts » et « filtrer par réseaux
  préférés » : les deux y sont, avec la liste complète des bornes du trajet.
- Un arrêt **imposé peut ne rien charger** — on s'arrête aussi pour déjeuner —
  et le plan ne charge plus que ce qu'il faut pour rallier le point de passage
  suivant, là où il visait toujours la destination.

### La durée ne ment plus

- « La durée totale ne précise pas si le temps de charge est compris ». Elle
  affichait le temps de **conduite seul**, sans le dire : sur un trajet
  électrique long, l'écart se compte en heures. Le résumé annonce le total, sa
  décomposition, et « hors recharge » tant qu'aucun plan n'existe.

### Un catalogue de véhicules, et un suivi d'itinéraire

- **Quarante modèles** pré-remplissent le profil. Aucune source publique
  française ne donne les capacités de batterie (691 jeux data.gouv.fr vérifiés,
  ADEME vérifiée) : la liste est écrite à la main et le dit. L'autonomie WLTP
  est annoncée pour ce qu'elle est, et le coefficient autoroutier (0,63) est
  présenté comme une hypothèse du projet, calibrée sur un relevé réel.
- **« Démarrer le suivi »** existe enfin. Il s'appelle SUIVI et non navigation,
  et il l'écrit à l'écran : ni voix, ni recalcul si l'on quitte la route.
  Quitter la route **se dit**, plutôt que de continuer à guider sur une
  instruction périmée. Il annonce le prochain arrêt de recharge — ce qu'aucune
  application de navigation généraliste ne porte.

### L'ergonomie : une frontière déplacée

- « La recherche de point de charge devrait être dans le menu de gauche », et
  « jongler entre les deux menus nuit à l'ergonomie ». Chercher une borne n'est
  pas régler l'affichage de la carte, c'est préparer un trajet : le volet passe
  à gauche, avec les stations-service et les parkings.
- « Tous les menus sont des accordéons qui scrollent » : **un seul sous-volet à
  la fois** dans le planificateur, qui en ouvrait cinq ensemble.
- Les anneaux d'autonomie suivent la **position GPS** et non le centre de la
  carte, et l'interface dit laquelle des deux ancres sert. Domicile et travail
  se posent d'un bouton « Définir ici ». Le haut-droit ne porte plus que le
  menu ; zoom, boussole et localisation descendent.

### Six défauts silencieux, levés en chemin

1. `Number(null)` vaut **zéro** : une ligne sans longitude posait la station au
   large du golfe de Guinée, hors champ d'une carte de France, sans erreur.
2. La restauration IndexedDB du panneau véhicule, asynchrone, **écrasait un
   choix déjà fait** : la case du rayon d'action se recochait toute seule.
3. `#poser()` **abandonnait en silence** quand le style n'était pas prêt :
   décocher les anneaux ne faisait alors rien.
4. Un refus de plan **effaçait les réglages qui l'avaient causé** : l'usager
   voyait le mur et n'avait plus rien pour le contourner.
5. Le volet des bornes **perdait sa nature de surface de travail** en changeant
   de côté, et se refermait à chaque clic sur la carte.
6. **Trois zones de défilement imbriquées** rendaient une case à cocher
   inatteignable : son rectangle existait, mais le clic tombait à côté.

Et une leçon de méthode, consignée : la suite E2E était **verte avant
reconstruction de `dist/`**. Elle ne prouvait rien. Treize parcours ont ensuite
rougi.

**Chiffres.** 490 tests unitaires (386 avant), 124 parcours E2E (100 avant).
Bundle hors MapLibre : 64 Ko gzippés sur 300 autorisés.

## [0.31.1] — 2026-08-26 — Lighthouse : 100 sur les trois axes

- Audit après une journée de changements d'interface, comme le projet l'exige
  (« Lighthouse ≥ 90 »). Départ : 96 / 96 / 100. Arrivée : **100 / 100 / 100**.
- UNE RÉGRESSION À MOI, corrigée : le bouton du menu affichait « Menu » mais
  son nom accessible ne contenait pas ce mot. Critère WCAG « Label in Name » —
  quelqu'un pilotant à la voix aurait dit « Menu » sans rien activer.
- Les liens de l'attribution IGN ne se distinguaient que par leur couleur
  (WCAG 1.4.1) : ils sont soulignés.
- `frame-ancestors` est RETIRÉ des cinq pages. Le navigateur l'ignore quand il
  vient d'une balise `<meta>` — il le dit lui-même dans la console. Il ne
  protégeait donc de rien tout en polluant le journal, ce qui masque les vraies
  erreurs. La protection contre l'encadrement demande un en-tête HTTP, que
  GitHub Pages ne permet pas : limite écrite en commentaire plutôt que déguisée
  en directive inopérante, et un test empêche son retour par bonne intention.

## [0.31.0] — 2026-08-26 — Les panoramas 360 s'explorent (PR #31)

- Les photos Panoramax équirectangulaires ne sont plus affichées à plat : on
  fait glisser pour regarder autour, ou l'on utilise les flèches du clavier.
  C'était une limite inscrite à la ROADMAP depuis la PR #12.
- LA BIBLIOTHÈQUE N'ÉTAIT PAS NÉCESSAIRE : 2 Ko gzippés écrits à la main
  (bundle 40,5 → 42,5 Ko sur 300 autorisés), contre environ deux cents pour un
  visualiseur du commerce. Même arbitrage que le décodeur protobuf de la PR #16.
- Une photo ORDINAIRE ne passe pas par WebGL : le rendu coûte une texture en
  mémoire vidéo, on ne l'engage que pour ce qui est vraiment un panorama
  (rapport 2:1, à deux pour cent près).
- REPLI SOIGNÉ À CHAQUE ÉTAGE : sans WebGL, si la texture est refusée, ou si
  l'image ne se charge pas en mode anonyme, la photo à plat reste affichée.
  Mieux vaut une image dégradée que rien.
- TROIS DÉFAUTS TROUVÉS PAR LES TESTS : une image d'une autre origine contamine
  le canevas et WebGL la refuse — il faut la demander en mode anonyme
  (Panoramax répond bien `Access-Control-Allow-Origin: *`, vérifié) ; l'erreur
  s'échappait au lieu de retomber sur l'image à plat ; et `display: block`
  l'emportait sur l'attribut `hidden`, si bien que la photo à plat restait
  affichée sous le panorama.

## [0.30.0] — 2026-08-26 — Filtrer les bornes par réseau (PR #22bis)

- Les réseaux proposés sont ceux PRÉSENTS DANS LA VUE, avec leur nombre de
  bornes, du plus fourni au moins fourni. Une liste figée de centaines
  d'enseignes nationales — dont beaucoup sont un hôtel isolé — aurait proposé
  des cases creuses.
- Ils se chargent AVEC la couche, jamais à part : une facette de plus par
  déplacement aurait doublé les appels au portail.
- Une facette en panne N'EMPORTE PAS les bornes : elle n'est qu'un confort de
  filtrage, et son échec ne doit pas priver l'usager de la couche.
- Plafonnés à douze, mais un réseau DÉJÀ COCHÉ reste affiché même hors
  plafond — sinon un filtre actif deviendrait invisible, donc impossible à
  retirer.

## [0.29.1] — 2026-08-26 — La marge d'arrivée se règle

- « Arriver avec 30 % » n'est pas le même trajet qu'« arriver avec 5 % » : la
  marge décide du nombre d'arrêts et du temps passé à charger. La laisser codée
  en dur imposait une prudence à tout le monde.
- Deux réglages : la charge voulue À L'ARRIVÉE, et la réserve qu'on refuse
  d'entamer EN ROUTE. Ils refont le plan, mais seulement section ouverte.
- Le garde-fou anti-recalcul est remis à zéro à chaque changement — sans quoi
  il aurait avalé le réglage, exactement comme le seuil de vue l'avait fait
  pour les filtres de bornes.

## [0.29.0] — 2026-08-26 — Commodités des aires (PR #29)

- Chaque arrêt de recharge peut dire ce qu'on trouve sur place : station-service,
  restauration, café, toilettes, avec l'enseigne quand elle est connue.
- L'ENSEIGNE N'EST PAS SUR L'AIRE — une aire sur 698 porte une balise `brand`.
  Elle est sur les objets à l'intérieur, dont 74 % portent une identité. On
  interroge donc autour du point d'arrêt, jamais l'aire.
- Par le MIROIR FRANÇAIS d'OpenStreetMap France, pas l'instance allemande.
- À LA DEMANDE, un arrêt à la fois : Overpass est un service bénévole, et on ne
  l'interroge pas pour quatre arrêts au cas où l'usager regarderait.
- En surcharge, Overpass rend du HTML et non du JSON. Le message reste français
  et le bouton réessayable.
- LA CSP A FAIT SON TRAVAIL : la requête était bloquée tant que l'origine
  n'était pas déclarée. Ajoutée à `connect-src` ET à la liste blanche du
  parcours de souveraineté — une origine ne s'ajoute jamais par accident.

## [0.28.0] — 2026-08-25 — Arrêts de recharge suggérés (PR #28)

- Les arrêts sont POSÉS SUR LA CARTE, et un clic sur leur nom y vole : une
  liste qu'on ne peut pas situer oblige à chercher des yeux ce que
  l'application sait déjà.

- Le planificateur propose ses arrêts : où s'arrêter, avec quel pourcentage de
  batterie on y arrive et on en repart, combien de minutes de charge, et le
  pourcentage à l'arrivée. Le calcul est LOCAL ; le seul appel réseau cherche
  les bornes le long du tracé, plafonné à six tronçons depuis la PR #11.
- ON N'ARRIVE JAMAIS SOUS LA RÉSERVE. Arriver à une borne à 2 % n'est pas un
  plan, c'est un pari.
- ON NE FAIT PAS LE PLEIN : au-delà de 80 % la charge s'effondre, et remplir à
  chaque arrêt fait perdre plus de temps qu'il n'en gagne. Mais le plan monte
  au-delà quand le dernier tronçon l'exige — vingt minutes valent mieux qu'un
  refus infondé.
- ET IL SAIT DIRE NON, tôt, avec le kilomètre exact où la réserve serait
  entamée. Un plan bancal qui laisse découvrir le trou à 8 % de batterie est
  pire que l'aveu.
- Le profil véhicule accepte désormais la PUISSANCE DE CHARGE MAXIMALE : sans
  elle, on promettrait des temps de charge qu'aucun véhicule ne tient —
  brancher une VF8 sur 350 kW ne charge pas plus vite que sur 150.
- CE QUE LE MODÈLE IGNORE est écrit sous le plan : ni le relief, ni le vent,
  ni le trafic, ni la vraie courbe de charge, qui dépend de la température de
  la batterie et qu'aucune source publique ne donne.
- DEUX DÉFAUTS TROUVÉS PAR LES TESTS : le rayon de recherche était passé en
  kilomètres à un paramètre qui attend des MÈTRES — dix mètres au lieu de dix
  kilomètres, aucune erreur, juste un résultat vide ; et une fixture annonçait
  465 km sur un tracé en ligne droite de 390, si bien que les avancements et
  la distance ne parlaient pas de la même échelle.

## [0.27.0] — 2026-08-25 — Deux points d'entrée, pas six (PR #27)

- À GAUCHE LE TRAJET (itinéraire, véhicule) ; EN HAUT À DROITE LES RÉGLAGES,
  derrière un menu unique : couches d'information, lieux enregistrés, fond de
  carte. Six pastilles de même poids ne hiérarchisaient rien, et le rail
  débordait de l'écran dès qu'un volet s'ouvrait.
- Le menu est posé EN DERNIER dans la colonne de droite, et ce n'est pas un
  détail d'ordre : son panneau s'ouvre sous son bouton. Placé avant, il
  recouvrait « Me localiser » — une fonctionnalité rendue inatteignable par
  une décoration. Un parcours E2E compare désormais sa boîte à celle de CHAQUE
  contrôle.
- Les trente-cinq parcours qui cliquaient un volet posé à même la carte
  passent par un utilitaire indifférent au placement : un futur déménagement
  ne touchera qu'un seul fichier.
- DÉFAUT ATTRAPÉ AU PASSAGE : le menu construisait son squelette à l'attache
  au DOM, alors que les panneaux venaient s'y ranger avant. Cinq volets
  restaient ORPHELINS, hors du DOM, sans la moindre erreur — un `return`
  silencieux avait avalé la panne. Le squelette se construit désormais à la
  demande, et l'absence de conteneur lève au lieu de se taire.

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
