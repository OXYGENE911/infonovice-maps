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

/** Un panneau est « principal » s'il est à nous et non imbriqué dans un autre. */
function estPrincipal(details: HTMLDetailsElement): boolean {
  return dansUnComposant(details) && !details.parentElement?.closest('details');
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
    if (!(details instanceof HTMLDetailsElement) || !details.open || !estPrincipal(details)) return;
    for (const autre of panneauxPrincipauxOuverts(cible)) {
      if (autre !== details) autre.open = false;
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
    // Même exigence qu'au-dessus : un appui sur l'attribution de MapLibre ne
    // doit pas passer pour un appui « dans un panneau ».
    const dansUnPanneau = element?.closest('details');
    if (dansUnPanneau && dansUnComposant(dansUnPanneau)) return;
    for (const details of panneauxPrincipauxOuverts(cible)) details.open = false;
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
