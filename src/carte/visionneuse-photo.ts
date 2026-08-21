// <visionneuse-photo> — la photo de rue en grand, par-dessus la carte.
// Modale sobre : Échap ferme, le focus y est piégé tant qu'elle est ouverte,
// et il retourne d'où il venait à la fermeture. L'ATTRIBUTION (producteur,
// licence, date) est affichée sous l'image : les photos Panoramax sont sous
// CC-BY-SA, la citer n'est pas optionnel.
import { formaterPrise, type PhotoRue } from '../lib/panoramax';

export class VisionneusePhoto extends HTMLElement {
  #origineFocus: HTMLElement | null = null;

  connectedCallback(): void {
    if (this.firstElementChild) return;
    this.innerHTML = `
      <div class="photo-voile" hidden>
        <div class="photo-boite" role="dialog" aria-modal="true" aria-label="Photo de rue">
          <img class="photo-image" alt="Photo de rue à l’endroit sélectionné">
          <p class="photo-legende"></p>
          <button type="button" class="photo-fermer" aria-label="Fermer la photo">✕</button>
        </div>
      </div>`;
    const voile = this.querySelector('.photo-voile') as HTMLElement;
    this.querySelector('.photo-fermer')?.addEventListener('click', () => this.fermer());
    // Cliquer le fond ferme ; cliquer l'image ne ferme pas.
    voile.addEventListener('click', (e) => { if (e.target === voile) this.fermer(); });
    document.addEventListener('keydown', (e) => {
      if (voile.hidden) return;
      if (e.key === 'Escape') { e.preventDefault(); this.fermer(); }
      // Piège à focus : deux éléments focalisables seulement, la boucle est simple.
      if (e.key === 'Tab') {
        e.preventDefault();
        (this.querySelector('.photo-fermer') as HTMLElement).focus();
      }
    });
  }

  ouvrir(photo: PhotoRue): void {
    const voile = this.querySelector('.photo-voile') as HTMLElement;
    const image = this.querySelector('.photo-image') as HTMLImageElement;
    const legende = this.querySelector('.photo-legende') as HTMLElement;
    image.src = photo.image;
    // textContent : producteur et licence viennent d'un service externe.
    legende.textContent = [
      formaterPrise(photo.prise),
      photo.producteur ? `© ${photo.producteur}` : null,
      photo.licence,
      'via Panoramax',
    ].filter(Boolean).join(' · ');
    this.#origineFocus = document.activeElement as HTMLElement | null;
    voile.hidden = false;
    (this.querySelector('.photo-fermer') as HTMLElement).focus();
  }

  fermer(): void {
    const voile = this.querySelector('.photo-voile') as HTMLElement;
    if (voile.hidden) return;
    voile.hidden = true;
    // L'image est vidée : une modale fermée ne doit pas garder une photo en
    // mémoire ni continuer un téléchargement.
    (this.querySelector('.photo-image') as HTMLImageElement).removeAttribute('src');
    this.#origineFocus?.focus();
    this.#origineFocus = null;
  }
}

customElements.define('visionneuse-photo', VisionneusePhoto);
