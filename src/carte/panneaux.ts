/* COMPORTEMENT PARTAGÉ DES PANNEAUX DU RAIL.
 *
 * Chaque contrôle de la carte est un `<details>` autonome. Livrés seuls, ils
 * produisaient trois défauts mesurés en E2E : deux panneaux ouverts en même
 * temps encombraient l'écran, Échap ne refermait rien — un menu qu'on ouvre à
 * la souris et qu'on ne peut pas fermer au clavier est un piège — et cliquer
 * à côté ne refermait pas davantage. Le pire tenait en une ligne de test :
 * Playwright n'arrivait plus à CLIQUER sur « Favoris » quand « Autour » était
 * ouvert, le panneau le recouvrant. Pas masqué : inatteignable.
 *
 * Ce module ne connaît aucun panneau en particulier. Il agit sur tout
 * `<details>` PRINCIPAL, c'est-à-dire sans `<details>` ancêtre : les volets
 * imbriqués du planificateur d'itinéraire (feuille de route, profil
 * altimétrique, météo…) gardent donc leur autonomie, et peuvent rester
 * ouverts ensemble à l'intérieur de leur parent.
 */

/* NOS PANNEAUX VIVENT TOUS DANS UN WEB COMPONENT — donc sous une balise à
   trait d'union. Cette condition n'est pas décorative : MapLibre rend son
   ATTRIBUTION COMPACTE avec un `<details>`, posé dans de simples `<div>`.

   Sans cette distinction, la détection l'adoptait comme volet de tête, et
   deux défauts en découlaient : ouvrir un volet refermait l'attribution — une
   obligation de la Géoplateforme — et surtout, MapLibre l'ouvrant au
   chargement REFERMAIT le planificateur d'itinéraire. Un lien partagé
   n'affichait alors plus rien. Attrapé par la CI, pas en local : le défaut
   dépend de l'ordre dans lequel MapLibre bascule son attribution. */
function dansUnComposant(element: Element | null): boolean {
  for (let n = element; n; n = n.parentElement) {
    if (n.tagName.includes('-')) return true;
  }
  return false;
}

/* CERTAINES SURFACES NE SE FERMENT PAS AU CLIC SUR LA CARTE.
   Le menu des réglages est consulté EN MANIPULANT la carte : on active une
   couche, on inspecte un point, on en active une autre. Le refermer à chaque
   clic obligerait à le rouvrir entre chaque geste — et cinq parcours
   existants, écrits avant ce menu, encodaient déjà ce va-et-vient. Il se
   ferme par son bouton, par Échap, ou en ouvrant un volet du rail.

   Les volets du rail, eux, sont transitoires : ils recouvrent la carte à
   gauche et le clic extérieur les referme, comme attendu. */
/** La marque, portée par le panneau lui-même : voir `estSurfaceDeTravail`. */
export const CLASSE_SURFACE = 'surface-de-travail';

function estSurfaceDeTravail(details: HTMLDetailsElement): boolean {
  /* LA MARQUE EST EXPLICITE, ET NON DÉDUITE DE L'EMPLACEMENT.
     La règle ne connaissait que `reglages`, le menu de droite. Quand le volet
     des bornes et services est passé à gauche (25/08/2026, à la demande
     d'Armelin), il a perdu EN SILENCE cette propriété : cocher « Bornes
     électriques » puis cliquer sur la carte pour en inspecter une refermait le
     volet, et il fallait le rouvrir pour cocher la couche suivante. Six
     parcours l'ont vu du même coup.
     Le comportement ne doit pas dépendre du côté de l'écran où l'on range un
     panneau : il découle de son USAGE. On le déclare donc. */
  /* LE PLANIFICATEUR EN FAIT PARTIE DEPUIS LE 27/08/2026, et cela découle
     d'une décision d'ergonomie : il ABRITE désormais les couches de la carte
     et le profil du véhicule. On y coche « Bornes électriques », on inspecte
     une borne, on en coche une autre — exactement l'usage qui avait fait du
     menu de droite une surface de travail. Le refermer à chaque clic sur la
     carte obligerait à le rouvrir entre chaque geste. Il se ferme par son
     bouton, par Échap, ou en ouvrant le menu de droite. */
  return details.classList.contains('reglages')
    || details.classList.contains(CLASSE_SURFACE);
}

/* CE QUI EST HÉBERGÉ N'EST PAS PRINCIPAL, MÊME SANS `<details>` AU-DESSUS
   (ERGO-7, 02/09). Le volet « Recharge et services » vit à l'intérieur de
   l'entonnoir des filtres depuis ERGO-3, et depuis ERGO-7 il en occupe une
   PAGE. Or l'entonnoir n'est pas un `<details>` : la règle du parent ne le
   voyait pas, et ce volet passait pour un panneau de tête.
   CONSÉQUENCE MESURÉE : ouvrir la page des réglages fermait le planificateur,
   qui en se rouvrant refermait la page — deux parcours de recharge sont
   tombés dans cette boucle. La SURFACE, ici, c'est l'entonnoir ; ce qu'il
   héberge n'a pas à décider du sort des autres. */
const HOTES: readonly string[] = ['.poi-hote-recharge'];

/** Un panneau est « principal » s'il est à nous et non imbriqué dans un autre. */
function estPrincipal(details: HTMLDetailsElement): boolean {
  if (!dansUnComposant(details)) return false;
  if (details.parentElement?.closest('details')) return false;
  return !HOTES.some((h) => details.closest(h));
}

function panneauxPrincipauxOuverts(racine: ParentNode): HTMLDetailsElement[] {
  return [...racine.querySelectorAll<HTMLDetailsElement>('details[open]')].filter(estPrincipal);
}

/** Referme le panneau et, si le focus vivait dedans, le rend à son bouton —
 *  sans quoi le focus tomberait sur le `<body>` et le parcours clavier
 *  repartirait du début de la page. */
function refermer(details: HTMLDetailsElement): void {
  const focusDedans = details.contains(document.activeElement);
  details.open = false;
  if (focusDedans) details.querySelector('summary')?.focus();
}

/**
 * Referme tous les volets de tête ouverts.
 *
 * Sert au démarrage du suivi d'itinéraire : Armelin, le 26/08/2026, « quand on
 * est en mode navigation, il y a trop de cartouches affichés qui masquent la
 * navigation ». Un panneau de trois cents pixels sur une carte qu'on regarde
 * en conduisant n'est pas un encombrement esthétique, c'est de la route qu'on
 * ne voit pas. Les volets se referment donc — leurs boutons restent, on les
 * rouvre d'un geste si besoin.
 */
export function refermerPanneaux(racine: ParentNode = document): void {
  for (const details of panneauxPrincipauxOuverts(racine)) refermer(details);
  /* L'ENTONNOIR DES FILTRES N'EST PAS UN `<details>`, ET IL COMPTE QUAND MÊME
     (ERGO-3, 02/09). Depuis que « Recharge et services » y vit, il occupe le
     même bord d'écran que les cartouches de détail — et la CI l'a attrapé
     avant l'usager : la fiche d'une station recouvrait le panneau, dont le
     bouton devenait impossible à presser.
     LA RÈGLE « UNE SEULE SURFACE À LA FOIS » VIT ICI, et c'est le bon endroit
     pour l'étendre : la dire une seconde fois dans chaque fiche, c'était la
     dire une seconde fois FAUX le jour où l'une d'elles l'oublierait. */
  for (const f of racine.querySelectorAll('filtre-poi')) {
    (f as HTMLElement & { fermer?: () => void }).fermer?.();
  }
}

/**
 * Installe le comportement sur une racine (le document en production, un
 * fragment en test). Rend une fonction de retrait : sans elle, deux appels
 * successifs empileraient les écouteurs.
 */
export function installerPanneaux(racine: Document | HTMLElement = document): () => void {
  const cible = racine instanceof Document ? racine : racine;

  /* UN SEUL PANNEAU PRINCIPAL À LA FOIS. L'événement `toggle` NE REMONTE PAS :
     il faut l'écouter en phase de capture, sinon rien n'arrive jamais ici. */
  const surBascule = (e: Event): void => {
    const details = e.target;
    if (!(details instanceof HTMLDetailsElement) || !details.open) return;
    if (!dansUnComposant(details)) return;

    if (estPrincipal(details)) {
      for (const autre of panneauxPrincipauxOuverts(cible)) {
        if (autre !== details) autre.open = false;
      }
      return;
    }

    /* ET UN SEUL SOUS-VOLET À LA FOIS DANS SON PANNEAU.
       Le planificateur en compte cinq — profil altimétrique, feuille de route,
       sur le trajet, météo, arrêts de recharge — et ils pouvaient s'ouvrir
       TOUS ENSEMBLE. Armelin, le 25/08/2026 : « tous les menus sont des
       accordéons qui scrollent ». La colonne atteignait alors plusieurs fois
       la hauteur de l'écran, et retrouver le résumé du trajet demandait de
       remonter à l'aveugle.
       L'exclusion ne porte que sur les FRÈRES DIRECTS : un sous-volet n'a
       aucune raison de fermer celui d'un autre panneau, ni celui qui le
       contient. Le rail garde ainsi sa règle, et chaque panneau la sienne. */
    const parent = details.parentElement;
    if (!parent) return;
    for (const frere of parent.children) {
      if (frere === details) continue;
      if (frere instanceof HTMLDetailsElement && frere.open) frere.open = false;
    }
  };

  /* ÉCHAP REFERME. On ne referme QUE le panneau principal ouvert : la touche
     doit rester disponible pour la visionneuse de photos, qui a sa propre
     gestion et vit hors du rail. */
  const surTouche = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape') return;
    const ouverts = panneauxPrincipauxOuverts(cible);
    if (ouverts.length === 0) return;
    e.stopPropagation();
    for (const details of ouverts) refermer(details);
  };

  /* CLIQUER À CÔTÉ REFERME. `pointerdown` et non `click` : un glissement sur
     la carte commence par un appui, et l'usager attend que le panneau
     s'efface dès ce moment-là, pas au relâchement.

     MAIS JAMAIS QUAND L'APPUI VISE LE RAIL LUI-MÊME. Les panneaux sont EN
     FLUX : refermer l'un rétracte la colonne, et le bouton visé remonte SOUS
     le curseur entre l'appui et le relâchement — le clic tombe alors dans le
     vide. Mesuré : ouvrir « Autour » puis viser « Favoris » n'ouvrait rien du
     tout. On laisse donc la bascule du `<details>` faire le travail dès que
     l'appui touche un panneau principal, ouvert ou fermé. */
  const surAppui = (e: Event): void => {
    const cibleAppui = e.target;
    if (!(cibleAppui instanceof Node)) return;
    const element = cibleAppui instanceof Element ? cibleAppui : cibleAppui.parentElement;
    /* « À CÔTÉ » VEUT DIRE SUR LA CARTE, PAS SUR UNE AUTRE DE NOS SURFACES.
       La règle exigeait auparavant un `<details>` sous une balise à trait
       d'union. Elle a tenu tant que TOUTES nos surfaces étaient des volets ;
       le cartouche de détail d'une borne et le bandeau de suivi n'en sont
       pas. Presser « Chercher les commerces » dans le cartouche, ou
       « Arrêter le suivi » dans le bandeau, refermait donc le planificateur
       resté ouvert derrière — un effet que personne n'avait demandé, et que
       rien n'expliquait.
       La condition porte désormais sur le composant seul. L'attribution de
       MapLibre reste dehors, elle : elle vit dans de simples `<div>`, et
       c'est justement ce que `dansUnComposant` distingue. */
    if (element && dansUnComposant(element)) return;

    /* NI SUR LES COMMANDES DE LA CARTE. Zoom, boussole et « Me localiser »
       sont des BOUTONS de MapLibre, hors de nos composants : la règle les
       comptait donc comme « un clic à côté » et refermait le volet ouvert.
       C'était le plus absurde là où ça comptait le plus — le panneau du
       véhicule écrit « pressez Me localiser » pour faire paraître les
       anneaux, et le presser refermait ce panneau avant qu'ils paraissent.
       L'ATTRIBUTION RESTE DEHORS, elle : son dépliant est un `<summary>` et
       non un `<button>`, et l'ouvrir doit bien refermer les volets. */
    if (element?.closest('.maplibregl-ctrl')?.querySelector('button')
      && element.closest('button')) return;
    for (const details of panneauxPrincipauxOuverts(cible)) {
      if (!estSurfaceDeTravail(details)) details.open = false;
    }
  };

  cible.addEventListener('toggle', surBascule, true);
  cible.addEventListener('keydown', surTouche as EventListener);
  cible.addEventListener('pointerdown', surAppui, true);

  return () => {
    cible.removeEventListener('toggle', surBascule, true);
    cible.removeEventListener('keydown', surTouche as EventListener);
    cible.removeEventListener('pointerdown', surAppui, true);
  };
}
