/* <outils-menu> — le volet « Outils » du menu : mesurer, météo d'une ville.
 *
 * UN SEUL VOLET POUR PLUSIEURS OUTILS (METEO-VILLE-1, 05/09/2026). Le menu est
 * une fenêtre haute comme son contenu, et chaque rangée compte sur un
 * téléphone : le garde-fou de feuilles-basses (≤ 62 % de l'écran) a déjà
 * refusé une section de plus. Les outils partagent donc UNE rangée, et se
 * déplient ensemble. Ce fichier ne sait rien de ce que font les outils : il
 * les range. */
import { pictoMenu } from './icone-menu';

export class OutilsMenu extends HTMLElement {
  connectedCallback(): void { this.#construire(); }

  /* CONSTRUIT À LA DEMANDE, PAS SEULEMENT À LA CONNEXION : la carte range les
     outils AVANT que le menu ne soit posé dans le document — le volet doit
     donc exister dès le premier `ajouter`. Mesuré : sans cela, le démarrage
     levait « volet introuvable » et la page restait sans menu. */
  #construire(): void {
    if (this.firstElementChild) return;
    this.innerHTML = `
      <details class="outils">
        <summary aria-label="Outils : mesurer une distance, météo d’une ville">${pictoMenu('mesure')}Outils</summary>
        <fieldset>
          <legend>Outils</legend>
        </fieldset>
      </details>`;
  }

  /** Range un outil dans le volet, à la suite des autres. */
  ajouter(outil: HTMLElement): void {
    this.#construire();
    const boite = this.querySelector('fieldset');
    if (!boite) throw new Error('outils-menu : volet introuvable après construction');
    if (boite.children.length > 1) {
      const trait = document.createElement('hr');
      trait.className = 'outils-trait';
      boite.appendChild(trait);
    }
    boite.appendChild(outil);
  }
}

customElements.define('outils-menu', OutilsMenu);
