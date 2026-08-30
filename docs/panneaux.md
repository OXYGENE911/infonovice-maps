# Les panneaux de direction — la règle, ce qui est livré, et le reste

Armelin, le 30/08/2026 : « dans les rectangles annonçant les directions, ce
serait bien que les cartouches s'affichent sous forme de vrais panneaux
d'autoroute. Es-tu capable de générer cela ? Sinon donne-moi les
instructions et prompt à fournir à GPT-6. »

Réponse courte : **oui, et c'est livré en CSS** (PR PAN-1). Ce document dit
d'où viennent les couleurs, ce qu'on ne peut pas dessiner faute de donnée, et
— pour la suite — le prompt à donner à GPT-6 si l'on veut un jour des images
matricielles.

## 1. La règle appliquée (IISR, relevée le 30/08/2026)

L'Instruction interministérielle sur la signalisation routière (arrêté du
24 novembre 1967, cinquième partie) fixe ceci :

| Élément | Règle | Chez nous |
|---|---|---|
| Fond **bleu** | destinations desservies par l'autoroute, et ce qui mène à une autoroute | classe `autoroute` |
| Fond **vert** | « pôles verts » — agglomérations listées par le ministère — sur les liaisons qui les relient | classe `nationale` (voir la réserve ci-dessous) |
| Fond **blanc** | tous les autres cas | départementales et voies locales |
| Fond **jaune** | indications **temporaires** ou d'exploitation | **jamais** : rien de ce qu'on affiche n'est temporaire |
| Encre et listel | blancs sur bleu et vert ; noirs sur blanc et jaune | `encreSur()` dans `src/lib/panneau.ts` |
| Cartouche **E42** | rouge, chiffres blancs — nationales **et** autoroutes | `A6`, `N7` |
| Cartouche **E43** | jaune, chiffres noirs — réseau départemental | `D606` |
| Cartouche **E41** | vert, chiffres blancs — routes européennes | prêt, non alimenté (§3) |
| Cartouche **E44 / E47** | blanc (communal), bleu (métropolitain) | non traités : la donnée ne les distingue pas |

**La réserve sur le vert.** Le vert réglementaire suppose la liste
ministérielle des pôles verts, que nous n'avons pas. On l'applique aux
nationales, grandes liaisons du réseau ordinaire : c'est l'usage le plus
proche de la règle que la donnée permette — et c'est aussi la convention
qu'Armelin avait énoncée le 29/08 (« du vert pour les nationales »).

**Le changement de convention sur les départementales.** Armelin avait
demandé de l'orange le 29/08. La signalisation réelle ne connaît pas
d'orange : une départementale se signale sur fond **blanc**, et c'est son
**cartouche** qui est jaune. Le jaune reste donc à l'écran, là où il est
réglementaire. Si ce blanc ne convient pas au volant, revenir à l'orange est
une ligne de CSS — mais ce ne serait alors plus un vrai panneau.

**Les couleurs ne suivent pas le thème sombre**, seules de toute
l'application. Un panneau a une couleur, de jour comme de nuit : sur la
route il est rétroréfléchissant, donc plus lumineux la nuit, pas moins. Un
bleu qui virerait au gris à 21 h ne serait plus un panneau. Un parcours
bout-en-bout le vérifie (`tests-e2e/panneaux.spec.ts`).

## 2. Comment c'est fait — et pourquoi pas des images

Le panneau est du **CSS**, pas une image :

- fond plein (`--panneau-bleu`, `--panneau-vert`, blanc) ;
- **listel** en ombre intérieure, pas en bordure : sur la route, c'est un
  filet blanc posé **en retrait** du bord, et une bordure l'aurait collé à
  l'arête ;
- inscriptions, flèche et distance à l'encre du fond, sans exception ;
- cartouche de numérotation à sa propre couleur, posé dans le panneau.

Trois raisons de préférer le CSS à des images :

1. **Le poids.** Le panneau change à chaque manœuvre — il faudrait une image
   par combinaison de classe, de manœuvre et de numéro. Le CSS pèse 40
   lignes ; le budget est de 300 Ko gzippés hors MapLibre.
2. **La netteté.** Un panneau vectoriel reste net sur tous les écrans, se
   redimensionne au texte et suit les préférences d'accessibilité.
3. **Le texte reste du texte.** Une image de panneau est muette pour un
   lecteur d'écran ; là, « autoroute A6 » se dit en toutes lettres.

## 3. Ce qui manque encore, et pourquoi

| Ce qu'il faudrait | État | Raison |
|---|---|---|
| Cartouche **vert européen** (E41) | code prêt (`routesEuropeennes`), non alimenté | le champ `cpx_numero_route_europeenne` existe sur la ressource `bdtopo-pgr`, qui ne rend **aucune** instruction de manœuvre (mesuré le 30/08 : 203 tronçons, zéro instruction) |
| **Numéro de sortie** (« Sortie 14 ») | absent | le moteur n'émet pas d'`exit` sur les bretelles d'autoroute |
| **Destination** (« Lyon, Dijon ») | absent | aucun champ de destination dans la réponse |
| **Flèches de voies** (où se placer) | **LIVRÉ** (VOIE-1) — voir ci-dessous | `nombre_de_voies` relevé sur `bdtopo-pgr`, recousu sur le tracé suivi |
| **Schéma de rond-point** | écarté | le moteur n'émet jamais `roundabout` (mesuré sur quatre giratoires, 63 étapes) |

Le détail de chaque mesure est dans [`apis.md`](apis.md).

### La chaussée et le côté où se placer (VOIE-1, livré le 30/08)

Le panneau porte, sous l'instruction, les **files de la chaussée** avec celle
où se mettre en clair. Ce n'est **pas** le panneau d'affectation par voie des
GPS du commerce, et la différence est de fond :

- la donnée dit **combien** de voies porte la chaussée — jamais ce que chaque
  voie autorise, il n'existe pas de `turn:lanes` ici ;
- le côté est donc **déduit de la manœuvre**, pas lu sur un marquage : on
  sort et l'on tourne à droite par la droite. Le libellé lu à voix haute le
  dit en toutes lettres ;
- **une seule** file s'éclaire, la plus extérieure : en éclairer deux
  laisserait croire à une affectation que la donnée ne porte pas ;
- rien ne s'affiche si la manœuvre n'a pas de côté (tout droit, rond-point),
  si elle est à plus de 900 m, ou si la chaussée n'a qu'une voie.

Comment c'est obtenu : **deux itinéraires**. Le guidage reste sur
`bdtopo-osrm` (les manœuvres) ; une seconde requête part sur `bdtopo-pgr`
(les attributs) après le démarrage du suivi — 16,7 s et 658 Ko sur un
Paris-Lyon, d'où l'attente en arrière-plan. Les tronçons de la seconde sont
**recousus** sur le tracé de la première par projection, ce que la mesure
autorise : les deux moteurs rendent le même trajet (466 km de part et
d'autre, écart médian nul, 98,1 % des points sous 60 m). Les 1,9 % restants
sont **jetés**, pas approchés.

## 4. Le prompt pour GPT-6 — si l'on veut des images malgré tout

À n'utiliser que pour ce que le CSS ne sait pas faire : des **planches
d'illustration** (page « À propos », capture de presse, documentation), ou
des schémas de manœuvre complexes si un moteur finit par les publier.

> Génère une planche de panneaux de signalisation directionnelle français,
> conformes à l'Instruction interministérielle sur la signalisation routière
> (IISR, arrêté du 24 novembre 1967, cinquième partie).
>
> **Format de sortie.** SVG vectoriel, un fichier par panneau, fond
> transparent, zone de dessin 320 × 96 px, sans texte converti en courbes
> (le texte doit rester du texte), sans dégradé, sans ombre portée, sans
> effet de matière ni de perspective. Nomme les fichiers
> `panneau-<classe>-<manoeuvre>.svg`.
>
> **Règles de couleur, à respecter à la lettre.**
> - Autoroute : fond bleu #0B4EA2, inscriptions et listel blancs.
> - Grande liaison : fond vert #146B3A, inscriptions et listel blancs.
> - Autres routes : fond blanc #FFFFFF, inscriptions et listel noirs #1A1A1A.
> - N'utilise JAMAIS de fond jaune : il est réservé à la signalisation
>   temporaire.
> - Cartouche de numérotation, posé dans le panneau, à sa propre couleur :
>   rouge #C8102E chiffres blancs pour les autoroutes et les nationales
>   (type E42) ; jaune #F2C200 chiffres noirs pour les départementales
>   (type E43) ; vert #146B3A chiffres blancs pour les routes européennes
>   (type E41).
>
> **Géométrie.** Angles arrondis de 10 px. Listel de 1,5 px placé à 3 px en
> retrait du bord — c'est un filet posé en retrait, jamais une bordure collée
> à l'arête. Marge intérieure de 11 px.
>
> **Contenu de chaque panneau.** À gauche une flèche de manœuvre pleine, à
> droite le cartouche de numérotation, entre les deux la destination sur une
> ligne et la distance sur une seconde, plus petite. Les destinations sont en
> casse mixte (« Fontainebleau »), jamais en capitales.
>
> **Variantes demandées** : tout droit, à gauche, à droite, sortie à droite,
> légèrement à gauche, légèrement à droite — pour chacune des trois classes,
> soit dix-huit panneaux.
>
> **Interdits** : aucun logo, aucune marque, aucun blason de collectivité,
> aucune photographie, aucun panneau de prescription (limitation de vitesse,
> interdiction) — ce sont des signes réglementés qu'on n'invente pas.

### Ce que le prompt a rendu, et sa vérification (30/08/2026)

Armelin a fait tourner le prompt et fourni les 18 fichiers, rangés dans
[`panneaux/`](panneaux/). Vérification faite, fichier par fichier :

| Contrôle | Résultat |
|---|---|
| Couleurs | **exactes** — six valeurs en tout dans les 18 fichiers : `#0B4EA2`, `#146B3A`, `#C8102E`, `#F2C200`, `#FFFFFF`, `#1A1A1A`. Aucune dérive. |
| Zone de dessin | `viewBox="0 0 320 96"` sur les 18 |
| Listel | `x="3" y="3"`, `stroke-width="1.5"` — en retrait, comme demandé |
| Texte | resté du texte, avec `title` et `desc` accessibles |
| Interdits | aucun logo, aucune photo, aucun panneau de prescription |

Une seule réserve, mineure : la pile de polices nomme **DIN 1451
Mittelschrift**, qui est la police de la signalisation ALLEMANDE — la France
utilise les « Caractères » L1/L4. Comme cette police n'est presque jamais
installée, le rendu tombe sur Arial et la différence ne se voit pas. À
corriger si ces planches sortent un jour du dossier de documentation.

**Ces fichiers ne sont PAS chargés par l'application** : le panneau affiché
pendant la navigation reste du CSS, pour les trois raisons ci-dessus. Ils
servent d'illustration et de référence visuelle.

**Avant d'intégrer quoi que ce soit qui en sorte**, deux vérifications qui ne
se délèguent pas :

1. **Relire les couleurs au pipeau numérique**, pas à l'œil : un modèle
   dérive volontiers de quelques points, et #0B4EA2 devenu #1155AA n'est plus
   la couleur de la règle.
2. **Vérifier la licence**. Le projet est en AGPL-3.0 et ne dépend d'aucun
   service payant : un fichier engendré doit être versionné dans le dépôt,
   jamais chargé depuis un service tiers au moment de l'affichage.
