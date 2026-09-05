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

  /** Montre `contenu` sous `titre`, plein écran ; referme les volets. */
  ouvrir(titre: string, contenu: HTMLElement): void {
    refermerPanneaux(document);
    const t = this.querySelector<HTMLElement>('.page-outil-titre');
    if (t) t.textContent = titre;
    this.setAttribute('aria-label', titre);
    this.querySelector('.page-outil-corps')?.replaceChildren(contenu);
    this.#contenu = contenu;
    this.hidden = false;
    document.body.classList.add('outil-page-ouverte');
    this.#ouverte = true;
    this.dispatchEvent(new CustomEvent('page-ouverte', { detail: { contenu } }));
    this.querySelector<HTMLButtonElement>('.page-outil-retour')?.focus();
  }

  fermer(): void {
    if (!this.#ouverte) return;
    this.hidden = true;
    document.body.classList.remove('outil-page-ouverte');
    this.#ouverte = false;
    const contenu = this.#contenu;
    this.#contenu = null;
    this.dispatchEvent(new CustomEvent('page-fermee', { detail: { contenu } }));
    /* LE FOCUS REVIENT À LA CARTE plutôt que de tomber sur le body. */
    (document.querySelector('#carte') as HTMLElement | null)?.focus?.();
  }
}

customElements.define('page-outil', PageOutil);
