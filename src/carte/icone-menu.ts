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
  | 'itineraire' | 'favoris' | 'fonds' | 'trafic'
  /* PIC-2 (29/08) — « poursuivre les autres améliorations graphiques […]
     notamment les icônes pour les options ». La page Options n'était que
     des mots : mode de déplacement, optimisation, évitements. */
  | 'pieton' | 'rapide' | 'court' | 'autoroute' | 'tunnel' | 'pont'
  /* NAV-3 (29/08) — la barre de suivi passe aux icônes : « remplacer le
     bouton Vue à plat et Cap en haut par un unique bouton en forme d'icône
     de boussole en mode pressoir ». */
  | 'orient-cap' | 'orient-nord' | 'orient-libre' | 'vue-3d' | 'vue-plat'
  | 'copilote' | 'croix';

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
  options: '<path d="M4 7h16M4 12h16M4 17h16"/>'
    + '<circle cx="9" cy="7" r="2" style="fill:var(--fond-doux)"/>'
    + '<circle cx="15" cy="12" r="2" style="fill:var(--fond-doux)"/>'
    + '<circle cx="7.5" cy="17" r="2" style="fill:var(--fond-doux)"/>',
  itineraire: '<path d="M12 21s-6.8-5.4-6.8-11A6.8 6.8 0 0 1 12 3.4 6.8 6.8 0 0 1 18.8 10c0 5.6-6.8 11-6.8 11Z"/>'
    + '<circle cx="12" cy="10" r="2.4"/>',
  favoris: '<path d="m12 3.6 2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.6-4.8 2.6.9-5.4L4.2 9.3l5.4-.8Z"/>',
  fonds: '<path d="m12 3 8 4.5-8 4.5-8-4.5ZM4 12.4 12 17l8-4.6M4 16.6 12 21l8-4.4"/>',
  trafic: '<path d="M10.4 4.6 3.2 17.4A1.8 1.8 0 0 0 4.8 20h14.4a1.8 1.8 0 0 0 1.6-2.6L13.6 4.6a1.85 1.85 0 0 0-3.2 0Z"/>'
    + '<path d="M12 9.5v4.4M12 16.7v.2"/>',

  /* ---- PIC-2 : les options du trajet ---- */
  // Un marcheur : tête, buste, deux jambes, un bras — la silhouette la plus
  // courte qui reste lisible à vingt pixels.
  pieton: '<circle cx="12.6" cy="4.6" r="2"/>'
    + '<path d="M12.6 8v5.2M12.6 13.2 9.6 20M12.6 13.2 15.6 20M9.2 10.2l3.4-1.6 3.6 2.2"/>',
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
