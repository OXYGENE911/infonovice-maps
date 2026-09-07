/* <page-outil> — la page plein écran d'un outil du menu.
 *
 * OUTILS-2 (06/09/2026). Armelin, après avoir essayé la météo dans le volet :
 * « l'écran est complètement éclaté et je dois scroller sur ma droite […] ce
 * serait mieux d'afficher la météo dans un écran dédié en plein écran ». Et
 * pour tous les outils : « cliquer sur une icône d'outil et avoir la page qui
 * se lance en entier pour utiliser l'outil ».
 *
 * UNE SEULE PAGE, PLUSIEURS CONTENUS : la carte pose une instance sur le body
 * (#carte crée son contexte d'empilement — leçon BLANC-1) ; chaque outil
 * fournit son élément, la page le prend, le rend au geste de retour. Même
 * geste que la recherche plein écran : la flèche en haut à gauche, Échap. */
import { refermerPanneaux } from './panneaux';

export class PageOutil extends HTMLElement {
  #ouverte = false;
  #contenu: HTMLElement | null = null;

  connectedCallback(): void {
    if (this.firstElementChild) return;
    this.hidden = true;
    this.setAttribute('role', 'dialog');
    this.setAttribute('aria-modal', 'true');
    this.innerHTML = `
      <header class="page-outil-tete">
        <button type="button" class="page-outil-retour" aria-label="Revenir à la carte">←</button>
        <h2 class="page-outil-titre"></h2>
        <img class="page-outil-mascotte" src="/icones/compas-48.png" alt="" aria-hidden="true" width="34" height="34">
      </header>
      <div class="page-outil-corps"></div>`;
    this.querySelector('.page-outil-retour')?.addEventListener('click', () => { this.fermer(); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.#ouverte) this.fermer();
    });
    /* Les gestes dans la page ne sont pas des clics « à côté » pour les
       volets (panneaux.ts écoute le document). */
    this.addEventListener('pointerdown', (e) => { e.stopPropagation(); });
  }

  get ouverte(): boolean { return this.#ouverte; }

  /* CE QUI AVAIT LE FOCUS AVANT L'OUVERTURE — la tuile de l'outil, presque
     toujours. On le lui rend en refermant (A11Y-MODALE-1, 08/09). */
  #ouvreur: HTMLElement | null = null;

  /** Les voisins rendus inertes le temps de la page ; rendus tels quels après. */
  #isoles: HTMLElement[] = [];

  /**
   * ISOLE LE FOND (A11Y-MODALE-1, 08/09).
   *
   * LE DÉFAUT, MESURÉ EN TABULANT : cette page se déclare
   * `role="dialog" aria-modal="true"` — elle promet donc au lecteur d'écran
   * que le reste de la page n'existe plus — et la touche Tab en sortait
   * pourtant aussitôt : l'en-tête, le champ de recherche, la carte, le rail,
   * le menu, les commandes MapLibre, DIX arrêts derrière la fenêtre avant d'y
   * revenir. Une promesse tenue pour le lecteur d'écran et démentie par le
   * clavier est pire que pas de promesse du tout.
   *
   * `inert` fait les deux d'un coup : plus de tabulation, plus de clic, et le
   * sous-arbre disparaît de l'arbre d'accessibilité. On ne touche QUE les
   * frères de cette page, et l'on retient ceux qu'on a changés — un voisin
   * déjà inerte pour ses propres raisons doit le rester après nous.
   */
  #isolerLeFond(): void {
    for (const n of Array.from(document.body.children)) {
      if (n === this || !(n instanceof HTMLElement) || n.hasAttribute('inert')) continue;
      n.setAttribute('inert', '');
      this.#isoles.push(n);
    }
  }

  #rendreLeFond(): void {
    for (const n of this.#isoles) n.removeAttribute('inert');
    this.#isoles = [];
  }

  /** Montre `contenu` sous `titre`, plein écran ; referme les volets. */
  ouvrir(titre: string, contenu: HTMLElement): void {
    /* AVANT DE REFERMER QUOI QUE CE SOIT : c'est maintenant que l'élément
       d'où l'on vient a encore le focus. */
    this.#ouvreur = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    refermerPanneaux(document);
    const t = this.querySelector<HTMLElement>('.page-outil-titre');
    if (t) t.textContent = titre;
    this.setAttribute('aria-label', titre);
    this.querySelector('.page-outil-corps')?.replaceChildren(contenu);
    this.#contenu = contenu;
    this.hidden = false;
    document.body.classList.add('outil-page-ouverte');
    this.#ouverte = true;
    this.#isolerLeFond();
    this.dispatchEvent(new CustomEvent('page-ouverte', { detail: { contenu } }));
    /* LE PREMIER CHAMP S'IL Y EN A UN, la flèche de retour sinon : ouvrir la
       météo d'une ville pour devoir tabuler jusqu'au champ de saisie serait
       un geste de plus à chaque fois. */
    const premier = this.querySelector<HTMLElement>('.page-outil-corps input, .page-outil-corps button, .page-outil-corps select');
    (premier ?? this.querySelector<HTMLButtonElement>('.page-outil-retour'))?.focus();
  }

  fermer(): void {
    if (!this.#ouverte) return;
    this.hidden = true;
    document.body.classList.remove('outil-page-ouverte');
    this.#ouverte = false;
    const contenu = this.#contenu;
    this.#contenu = null;
    this.#rendreLeFond();
    this.dispatchEvent(new CustomEvent('page-fermee', { detail: { contenu } }));
    /* LE FOCUS REVIENT D'OÙ IL VENAIT (A11Y-MODALE-1, 08/09).
       CE QUI ÉTAIT ÉCRIT ICI NE MARCHAIT PAS : `#carte` est un `div` sans
       `tabindex`, donc `focus()` n'avait aucun effet — le focus tombait sur le
       `body` et le parcours clavier repartait du haut de la page. Mesuré en
       tabulant, pas déduit. On rend donc le focus à la tuile qui a ouvert la
       page ; si le menu s'est refermé derrière elle, au bouton du menu, qui
       ramène là où l'on était ; à défaut au canevas de la carte, qui est,
       lui, focalisable. */
    const visible = (e: Element | null | undefined): e is HTMLElement => e instanceof HTMLElement
      && e.isConnected && e.checkVisibility({ visibilityProperty: true, opacityProperty: true });
    const ouvreur = this.#ouvreur;
    this.#ouvreur = null;
    const repli = document.querySelector('.porte-menu summary')
      ?? document.querySelector('#carte canvas.maplibregl-canvas');
    if (visible(ouvreur)) ouvreur.focus();
    else if (visible(repli)) repli.focus();
  }
}

customElements.define('page-outil', PageOutil);
