/* <menu-reglages> — LE MENU UNIQUE DU COIN HAUT-DROIT.
 *
 * Six pastilles empilées à gauche, chacune ouvrant son volet, ne
 * hiérarchisaient rien : couches d'information, préférences d'affichage et
 * lieux enregistrés y avaient le même poids visuel, et le rail débordait de
 * l'écran dès qu'un panneau s'ouvrait. Les cartes qui se font adopter
 * n'exposent que deux points d'entrée — ce qui concerne le TRAJET d'un côté,
 * les RÉGLAGES de l'autre — et rangent le reste derrière.
 *
 * Ce composant n'est qu'un CONTENANT : il ne connaît aucun des panneaux qu'il
 * accueille, et chacun garde son comportement, son état et ses tests. On
 * déménage, on ne réécrit pas.
 */

export class MenuReglages extends HTMLElement {
  /* LE SQUELETTE SE CONSTRUIT À LA DEMANDE, PAS SEULEMENT À L'ATTACHE.
     `connectedCallback` ne s'exécute qu'une fois l'élément dans le DOM ; or le
     contrôle est posé en DERNIER dans la colonne (pour que le panneau ne
     recouvre pas « Me localiser »), tandis que les panneaux viennent s'y ranger
     bien avant. Sans cette construction à la demande, `ajouter` ne trouvait pas
     son conteneur et n'attachait RIEN : cinq volets restaient orphelins, hors
     du DOM, sans la moindre erreur. Un `return` silencieux avait avalé la
     panne — le mode de défaillance que ce dépôt traque partout ailleurs. */
  #construire(): void {
    if (this.firstElementChild) return;
    this.innerHTML = `
      <details class="reglages">
        <summary aria-label="Ouvrir les réglages et les couches">
          <span class="reglages-barres" aria-hidden="true"></span>
          <span class="reglages-mot">Menu</span>
        </summary>
        <div class="reglages-corps"></div>
      </details>`;
  }

  connectedCallback(): void { this.#construire(); }

  /** Accueille un panneau, avec le titre de sa section. */
  ajouter(titre: string, panneau: HTMLElement): void {
    this.#construire();
    const corps = this.querySelector('.reglages-corps');
    // Le squelette vient d'être bâti : son absence serait un défaut de ce
    // fichier, pas un cas d'usage. On le dit plutôt que de l'avaler.
    if (!corps) throw new Error('menu-reglages : conteneur introuvable après construction');
    const section = document.createElement('section');
    section.className = 'reglages-section';
    const etiquette = document.createElement('p');
    etiquette.className = 'reglages-etiquette';
    etiquette.textContent = titre;
    section.append(etiquette, panneau);
    corps.appendChild(section);
  }
}

customElements.define('menu-reglages', MenuReglages);
