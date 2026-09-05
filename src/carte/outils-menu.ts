/* <outils-menu> — le volet « Outils » du menu : une grille de tuiles.
 *
 * OUTILS-2 (06/09/2026). Armelin : « l'icône d'outils devrait plutôt
 * représenter une clé à molette […] cliquer sur Outils et afficher uniquement
 * des icônes représentant chaque outil — une règle pour les mesures, un
 * soleil avec des nuages pour la météo. Lorsqu'on clique sur une icône, la
 * page se lance en entier. » Avant : les outils dépliaient leurs formulaires
 * l'un sous l'autre dans le volet, et il fallait défiler.
 *
 * UN SEUL VOLET POUR TOUS (METEO-VILLE-1) : le menu est une fenêtre haute
 * comme son contenu, et chaque rangée compte (garde-fou de feuilles-basses).
 * Ce fichier ne sait rien de ce que font les outils : il pose leurs tuiles et
 * appelle leur action. */
import { pictoMenu, type NomPicto } from './icone-menu';

export interface Outil {
  /** Identifiant stable, porté en `data-outil` pour la CSS et les parcours. */
  cle: string;
  libelle: string;
  picto: NomPicto;
  action: () => void;
}

export class OutilsMenu extends HTMLElement {
  connectedCallback(): void { this.#construire(); }

  /* CONSTRUIT À LA DEMANDE, PAS SEULEMENT À LA CONNEXION : la carte range les
     outils AVANT que le menu ne soit posé dans le document. */
  #construire(): void {
    if (this.firstElementChild) return;
    this.innerHTML = `
      <details class="outils">
        <summary aria-label="Outils : mesurer, météo, signal GPS, partager ma position">${pictoMenu('cle')}Outils</summary>
        <fieldset>
          <legend>Outils</legend>
          <div class="outils-grille" role="group" aria-label="Outils"></div>
        </fieldset>
      </details>`;
  }

  /** Pose la tuile d'un outil ; le clic replie le volet et lance l'action. */
  ajouter(outil: Outil): void {
    this.#construire();
    const grille = this.querySelector('.outils-grille');
    if (!grille) throw new Error('outils-menu : grille introuvable après construction');
    const tuile = document.createElement('button');
    tuile.type = 'button';
    tuile.className = 'outils-tuile';
    tuile.dataset['outil'] = outil.cle;
    tuile.innerHTML = `${pictoMenu(outil.picto)}<span>${outil.libelle}</span>`;
    tuile.addEventListener('click', () => {
      const volet = this.querySelector<HTMLDetailsElement>('details.outils');
      if (volet) volet.open = false;
      outil.action();
    });
    grille.appendChild(tuile);
  }
}

customElements.define('outils-menu', OutilsMenu);
