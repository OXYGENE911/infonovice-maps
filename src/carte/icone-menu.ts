/* LES PICTOGRAMMES DE MENU — dessinés PAR LE CODE, jamais committés.
 *
 * Le précédent est celui des éclairs (icone-puissance.ts) et des commodités
 * (icone-commodite.ts) : « aucun binaire opaque au dépôt », un tracé qui se
 * relit et se corrige dans une revue. Onze pictos au trait de 1,9 px, la
 * couleur du texte courant (currentColor) — jamais un émoji, dont la police
 * système impose sa couleur, ni un logo, qui serait une marque déposée.
 *
 * La maquette a été VALIDÉE par Armelin le 29/08/2026 (variante A : picto et
 * texte côte à côte — la variante B en grille compacte est écartée pour le
 * menu principal, les libellés tronqués y perdaient leur sens).
 */

/** Les onze destinations qui portent un picto. */
export type NomPicto =
  | 'recharge' | 'monuments' | 'feuille' | 'partage'
  | 'vehicule' | 'couches' | 'options'
  | 'itineraire' | 'favoris' | 'fonds' | 'trafic' | 'mesure'
  | 'cle' | 'meteo' | 'satellite' | 'partage-position'
  /* PIC-2 (29/08) — « poursuivre les autres améliorations graphiques […]
     notamment les icônes pour les options ». La page Options n'était que
     des mots : mode de déplacement, optimisation, évitements. */
  | 'pieton' | 'rapide' | 'court' | 'autoroute' | 'tunnel' | 'pont'
  /* MODE-1 (03/09) — « il faudrait ajouter un bouton Moto et un bouton
     Vélo » : quatre modes de déplacement, quatre dessins. */
  | 'moto' | 'velo'
  /* BIS-1 (30/08) — l'itinéraire bis se demande d'une icône dans la barre. */
  | 'bis'
  /* ERGO-3 (30/08) — les raccourcis d'itinéraire passent au dessin :
     « l'ergonomie fait trop formulaire ». */
  | 'domicile' | 'travail' | 'etoile'
  /* NAV-3 (29/08) — la barre de suivi passe aux icônes : « remplacer le
     bouton Vue à plat et Cap en haut par un unique bouton en forme d'icône
     de boussole en mode pressoir ». */
  | 'orient-cap' | 'orient-nord' | 'orient-libre' | 'vue-3d' | 'vue-plat'
  | 'copilote' | 'croix' | 'engrenage' | 'remonter' | 'cible'
  /* VOIX-1 (30/08) — le guidage vocal se coupe d'une icône. */
  | 'voix' | 'voix-muette';

/* Chaque tracé vit dans un carré de 24 × 24. Le trait est porté par la
   classe CSS .picto-menu (fill none, stroke currentColor) ; l'éclair des
   arrêts de recharge est la seule forme PLEINE — la même silhouette que
   les pastilles de la carte. */
const TRACES: Record<NomPicto, string> = {
  recharge: '<polygon class="picto-menu-plein" points="13,2 6,13.4 11,13.4 10,22 17.8,10 12.4,10"/>',
  monuments: '<path d="M4 20h16M5.5 17h13M7 17v-7M12 17v-7M17 17v-7M4.5 10h15M12 3.2 4.5 7.6h15Z"/>',
  feuille: '<path d="M9 5h11M9 12h11M9 19h11"/><circle cx="4.4" cy="5" r="1.5"/>'
    + '<circle cx="4.4" cy="12" r="1.5"/><circle cx="4.4" cy="19" r="1.5"/>',
  partage: '<circle cx="6" cy="12" r="2.6"/><circle cx="18" cy="5.5" r="2.6"/>'
    + '<circle cx="18" cy="18.5" r="2.6"/><path d="M8.3 10.8 15.7 6.7M8.3 13.2l7.4 4.1"/>',
  vehicule: '<path d="M4 16.5V13l2.2-4.6A2 2 0 0 1 8 7.2h8a2 2 0 0 1 1.8 1.2L20 13v3.5M4 13h16"/>'
    + '<circle cx="7.5" cy="16.6" r="1.7"/><circle cx="16.5" cy="16.6" r="1.7"/>',
  couches: '<rect x="6" y="4" width="10" height="16" rx="2"/>'
    + '<path d="M16 9h2.6a1 1 0 0 1 1 1V16a1.6 1.6 0 0 1-3.2 0"/>'
    + '<path d="M9.2 13.6h3.6M11 11.8v3.6" style="stroke-width:1.6"/>',
  /* Les boutons des curseurs sont PLEINS, du fond des rangées de menu : la
     ligne ne les traverse pas — c'est ce qui fait lire « réglages ». */
  /* LA ROUE CRANTÉE (ERGO-5, 02/09), demandée par Armelin : « ajouter une
     roue crantée à droite pour indiquer aux gens qu'ils peuvent paramétrer ce
     POI ». C'est le signe universel du réglage — un intitulé, lui, se lit
     comme un titre. */
  /* LA FLÈCHE QUI REMONTE LE TEMPS (ERGO-5, 02/09) — le dessin qu'Armelin
     décrit : « un bouton ayant pour logo une flèche qui revient dans le
     temps ». Une horloge et une flèche antihoraire : c'est le signe reconnu
     de l'historique, et il se distingue de l'étoile des favoris. */
  remonter: '<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1"/>'
    + '<path d="M3 3.4V9h5.6"/><path d="M12 7.6V12l3.2 2"/>',
  /* UNE VRAIE ROUE CRANTÉE, PAS UN SOLEIL (ERGO-6, 02/09). Le premier tracé
     était un cercle entouré de huit rayons DÉTACHÉS : c'est exactement le
     dessin d'un soleil, et Armelin l'a lu comme tel — « la roue crantée
     ressemble à un soleil ». Ce qui fait une roue, c'est que les dents
     TIENNENT à la couronne : le contour est donc continu, huit dents portées
     par un anneau, avec le moyeu au centre. */
  engrenage: '<path d="M10.2 4.6 L10.4 2.1 L13.6 2.1 L13.8 4.6 L15.9 5.5 '
    + 'L17.9 3.9 L20.1 6.1 L18.5 8.1 L19.4 10.2 L21.9 10.4 L21.9 13.6 '
    + 'L19.4 13.8 L18.5 15.9 L20.1 17.9 L17.9 20.1 L15.9 18.5 L13.8 19.4 '
    + 'L13.6 21.9 L10.4 21.9 L10.2 19.4 L8.1 18.5 L6.1 20.1 L3.9 17.9 '
    + 'L5.5 15.9 L4.6 13.8 L2.1 13.6 L2.1 10.4 L4.6 10.2 L5.5 8.1 '
    + 'L3.9 6.1 L6.1 3.9 L8.1 5.5 Z"/>'
    + '<circle cx="12" cy="12" r="3.4"/>',
  /* LA CIBLE (CIBLE-1, 02/09) : une croix de visée, le dessin même de la
     fonction — « la carte s'affiche avec une croix au milieu ». */
  cible: '<circle cx="12" cy="12" r="7"/>'
    + '<path d="M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4"/>'
    + '<circle cx="12" cy="12" r="1.6" style="fill:currentColor"/>',
  options: '<path d="M4 7h16M4 12h16M4 17h16"/>'
    + '<circle cx="9" cy="7" r="2" style="fill:var(--fond-doux)"/>'
    + '<circle cx="15" cy="12" r="2" style="fill:var(--fond-doux)"/>'
    + '<circle cx="7.5" cy="17" r="2" style="fill:var(--fond-doux)"/>',
  itineraire: '<path d="M12 21s-6.8-5.4-6.8-11A6.8 6.8 0 0 1 12 3.4 6.8 6.8 0 0 1 18.8 10c0 5.6-6.8 11-6.8 11Z"/>'
    + '<circle cx="12" cy="10" r="2.4"/>',
  favoris: '<path d="m12 3.6 2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.6-4.8 2.6.9-5.4L4.2 9.3l5.4-.8Z"/>',
  /* La règle graduée (MESURE-1) : une lame en diagonale, quatre graduations. */
  mesure: '<path d="m3 17 14-14 4 4L7 21Z"/><path d="m5.4 14.6 1.6 1.6M8.1 11.9l1.6 1.6M10.8 9.2l1.6 1.6M13.5 6.5l1.6 1.6"/>',
  /* OUTILS-2 (06/09) : la clé à molette du volet Outils, le soleil-nuage de
     la météo, le satellite du signal GPS, l'épingle rayonnante du partage. */
  cle: '<path d="M14.2 6.3a4 4 0 0 1 5.2-1.1l-2.6 2.6 1.4 1.4 2.6-2.6a4 4 0 0 1-5.4 5.2L7 20.2a1.6 1.6 0 0 1-2.3 0l-1-1a1.6 1.6 0 0 1 0-2.3Z"/>',
  meteo: '<circle cx="8" cy="9" r="3.4"/><path d="M8 2.6v1.6M8 13.8v1.6M1.6 9h1.6M3.5 4.5l1.1 1.1M3.5 13.5l1.1-1.1"/><path d="M11.5 20.5h7.6a3 3 0 0 0 .4-6 4.6 4.6 0 0 0-8.8-1.2 3.6 3.6 0 0 0 .8 7.2Z"/>',
  satellite: '<path d="m9.5 4.5 3.2 3.2-4 4-3.2-3.2ZM12.3 12.3l3.2 3.2-4 4-3.2-3.2ZM8.7 11.7l3.6 3.6M4.2 16.6a4.6 4.6 0 0 0 3.2 3.2M2.6 19a7.4 7.4 0 0 0 2.4 2.4M16 8l4.5-4.5"/>',
  'partage-position': '<path d="M12 21s-6-5.2-6-10a6 6 0 0 1 12 0c0 4.8-6 10-6 10Z"/><circle cx="12" cy="11" r="2.2"/><path d="M2.8 8.6A9.6 9.6 0 0 1 5 5M21.2 8.6A9.6 9.6 0 0 0 19 5"/>',
  fonds: '<path d="m12 3 8 4.5-8 4.5-8-4.5ZM4 12.4 12 17l8-4.6M4 16.6 12 21l8-4.4"/>',
  trafic: '<path d="M10.4 4.6 3.2 17.4A1.8 1.8 0 0 0 4.8 20h14.4a1.8 1.8 0 0 0 1.6-2.6L13.6 4.6a1.85 1.85 0 0 0-3.2 0Z"/>'
    + '<path d="M12 9.5v4.4M12 16.7v.2"/>',

  /* ---- PIC-2 : les options du trajet ---- */
  // Un marcheur : tête, buste, deux jambes, un bras — la silhouette la plus
  // courte qui reste lisible à vingt pixels.
  pieton: '<circle cx="12.6" cy="4.6" r="2"/>'
    + '<path d="M12.6 8v5.2M12.6 13.2 9.6 20M12.6 13.2 15.6 20M9.2 10.2l3.4-1.6 3.6 2.2"/>',
  /* ---- MODE-1 : la moto et le vélo (03/09) ---- */
  // Une moto de profil : petite roue avant, grande roue arrière, guidon haut.
  // Ce qui la distingue du vélo à vingt pixels, c'est le carénage plein entre
  // les roues — un cadre triangulaire se lirait « vélo ».
  moto: '<circle cx="5.2" cy="16.8" r="3.4"/><circle cx="18.8" cy="16.8" r="3.4"/>'
    + '<path d="M5.2 16.8h4.2l3-4.4h3.6l2.8 4.4M9.4 12.4 8 9.6h3.4"'
    + ' style="stroke-linejoin:round"/><path d="M14.4 9.4h3.4l1 3"/>',
  // Un vélo de profil : deux roues égales, le cadre en triangle, le guidon.
  // Les roues sont plus grandes et le trait plus fin que sur la moto : c'est
  // la différence qu'on voit d'abord.
  velo: '<circle cx="5" cy="16.6" r="3.8"/><circle cx="19" cy="16.6" r="3.8"/>'
    + '<path d="M5 16.6 9.4 9.2h6.2l3.4 7.4M9.4 16.6h5.6l-2.6-7.4"'
    + ' style="stroke-linejoin:round"/><path d="M8.4 9.2h2.6"/>',

  // Un chronomètre : le temps, pas la vitesse — c'est « le plus RAPIDE ».
  rapide: '<circle cx="12" cy="13.6" r="7"/>'
    + '<path d="M12 9.8v3.8l2.6 1.8M10 2.8h4M12 2.8v2.2M18.6 6.4l1.4 1.4"/>',
  // Deux points, et la ligne droite entre eux : « le plus COURT ».
  court: '<circle cx="5.4" cy="18.6" r="2"/><circle cx="18.6" cy="5.4" r="2"/>'
    + '<path d="M7 17 17 7"/>',
  // Une chaussée à deux voies vue en perspective, bande centrale comprise.
  autoroute: '<path d="M8.4 3.4 4 20.6M15.6 3.4 20 20.6"/>'
    + '<path d="M12 5v2.6M12 10.6v2.8M12 16.4v3" style="stroke-dasharray:none"/>',
  // Un tunnel : la voûte, et la route qui y entre.
  tunnel: '<path d="M3.6 19.6V13a8.4 8.4 0 0 1 16.8 0v6.6"/>'
    + '<path d="M8.6 19.6V13a3.4 3.4 0 0 1 6.8 0v6.6"/><path d="M2.4 19.6h19.2"/>',
  /* ---- NAV-3 : la barre de suivi ---- */
  /* TROIS ÉTATS, TROIS DESSINS. Le bouton est « en mode pressoir » : on
     clique, l'état change, ET LE LOGO AVEC — sans quoi rien ne dit dans
     quel état on se trouve. */
  'orient-cap': '<circle cx="12" cy="12" r="8.6"/>'
    + '<polygon class="picto-menu-plein" points="12,6.2 15.6,16 12,13.9 8.4,16"/>',
  'orient-nord': '<circle cx="12" cy="12" r="8.6"/>'
    + '<path d="M12 1.8v2.2M12 20v2.2M1.8 12h2.2M20 12h2.2"/>'
    + '<polygon class="picto-menu-plein" points="12,7.4 14.4,15 12,13.4 9.6,15"/>',
  'orient-libre': '<circle cx="12" cy="12" r="8.6"/>'
    + '<path d="M8.4 9.4a4.8 4.8 0 0 1 7.2 0M15.6 14.6a4.8 4.8 0 0 1-7.2 0"/>'
    + '<path d="M8.4 9.4 8 6.6M15.6 14.6l.4 2.8"/>',
  /* LE PLAN VU DE BIAIS : un parallélogramme, c'est la vue inclinée ; un
     rectangle, c'est la vue à plat. Le premier dessin (deux bords qui
     fuient vers un point) se lisait « A » à vingt-deux pixels — vu sur
     capture avant d'être refait, comme le pont de PIC-2. */
  'vue-3d': '<path d="M7.4 6.6h13.2l-4 10.8H3.4Z"/><path d="M9.6 10.6h8.4"/>',
  'vue-plat': '<rect x="3.6" y="6.6" width="16.8" height="10.8" rx="2"/>'
    + '<path d="M3.6 12h16.8"/>',
  // Le copilote : un buste de passager.
  copilote: '<circle cx="12" cy="7" r="3"/>'
    + '<path d="M5.6 20a6.4 6.4 0 0 1 12.8 0"/>',
  croix: '<path d="M6.6 6.6 17.4 17.4M17.4 6.6 6.6 17.4"/>',

  /* LES RACCOURCIS D'ITINÉRAIRE (ERGO-3, 30/08). Armelin : « les textes Ma
     position, domicile, travail, favoris sont affichés sous forme de texte.
     L'ergonomie fait trop formulaire. » Ces trois-là portent leur COULEUR :
     ce sont des repères personnels, pas des commandes — on les reconnaît
     d'un coup d'œil, comme on reconnaît sa maison dans une rue. */
  // Une maison : le toit, le corps, la porte.
  domicile: '<path class="picto-toit" d="M3.4 11.4 12 4.4l8.6 7"/>'
    + '<path class="picto-mur" d="M5.6 10.4v9.2h12.8v-9.2"/>'
    + '<path class="picto-porte" d="M10 19.6v-5.2h4v5.2"/>',
  // Un immeuble : deux corps de bâtiment, des fenêtres.
  travail: '<path class="picto-mur" d="M4.4 19.6V8.2h7.2v11.4"/>'
    + '<path class="picto-mur" d="M11.6 19.6V11.8h8v7.8"/>'
    + '<path class="picto-fenetres" d="M6.8 11v.1M9.2 11v.1M6.8 14.4v.1M9.2 14.4v.1'
    + 'M14.2 14.6v.1M17 14.6v.1"/>'
    + '<path d="M2.8 19.6h18.4"/>',
  // Une étoile pleine : celle des favoris, partout la même.
  etoile: '<polygon class="picto-menu-plein" points="12,3.6 14.7,9.6 21.2,10.4 '
    + '16.4,14.8 17.7,21.2 12,18 6.3,21.2 7.6,14.8 2.8,10.4 9.3,9.6"/>',

  /* LE HAUT-PARLEUR : le pavillon plein, deux ondes. Barré, c'est le même
     dessin — reconnaître l'objet compte plus que dessiner le silence. */
  voix: '<polygon class="picto-menu-plein" points="4,9.4 7.4,9.4 11.6,5.6 11.6,18.4 7.4,14.6 4,14.6"/>'
    + '<path d="M14.6 9.2a4 4 0 0 1 0 5.6"/><path d="M17.2 6.6a7.6 7.6 0 0 1 0 10.8"/>',
  'voix-muette': '<polygon class="picto-menu-plein" points="4,9.4 7.4,9.4 11.6,5.6 11.6,18.4 7.4,14.6 4,14.6"/>'
    + '<path d="M14.8 9.6 20 14.4M20 9.6l-5.2 4.8"/>',

  /* L'ITINÉRAIRE BIS : on QUITTE cette route pour une autre. La route
     actuelle continue, une branche s'en détache vers la droite et porte la
     pointe. Deux dessins ont été écartés SUR CAPTURE avant celui-ci (même
     méthode que le pont de PIC-2) : une fourche parfaitement symétrique se
     lisait « diapason » et ne disait pas laquelle prendre ; une route
     droite avec une sortie qui descend se lisait « drapeau ». */
  bis: '<path d="M12 22V13"/>'
    + '<path d="M12 13c0-4-1.2-5-2.4-8.6"/>'
    + '<path d="M12 13c0-3.4 2-4.4 4.4-6.4"/>'
    + '<polygon class="picto-menu-plein" points="20.2,2.6 18.4,8.6 14.6,4.6"/>',

  /* Un pont en arc : le tablier droit, l'arche DESSOUS, et les suspentes
     qui les relient. Le premier dessin (tablier + deux appuis) se lisait
     « table » à dix-sept pixels — vérifié sur capture avant de le refaire. */
  pont: '<path d="M2.4 10.6h19.2"/>'
    + '<path d="M4.4 18.6a7.6 7.6 0 0 1 15.2 0"/>'
    + '<path d="M7.2 10.6v2.6M12 10.6v-2.4M16.8 10.6v2.6M4.4 10.6v8M19.6 10.6v8"/>',
};

/**
 * Le picto prêt à poser dans un gabarit. Décoratif par nature : le libellé
 * texte reste seul porteur du sens (aria-hidden), les lecteurs d'écran ne
 * voient RIEN changer.
 */
export function pictoMenu(nom: NomPicto): string {
  /* LE NOM EST PORTÉ PAR UNE CLASSE, et ce n'est pas de la décoration : un
     bouton « pressoir » change de dessin avec son état (NAV-3), et rien
     d'autre dans le DOM ne dirait LEQUEL est affiché — ni pour le CSS, ni
     pour un parcours qui le vérifie. */
  return `<svg class="picto-menu picto-${nom}" viewBox="0 0 24 24"`
    + ` aria-hidden="true" focusable="false">${TRACES[nom]}</svg>`;
}
