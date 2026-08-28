# Changelog — Infonovice Maps

Format : [semver] — date — résumé. Le détail vit dans les PR.

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
