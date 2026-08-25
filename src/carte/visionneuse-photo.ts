// <visionneuse-photo> — la photo de rue en grand, par-dessus la carte.
// Modale sobre : Échap ferme, le focus y est piégé tant qu'elle est ouverte,
// et il retourne d'où il venait à la fermeture. L'ATTRIBUTION (producteur,
// licence, date) est affichée sous l'image : les photos Panoramax sont sous
// CC-BY-SA, la citer n'est pas optionnel.
import { formaterPrise, type PhotoRue } from '../lib/panoramax';
import { estEquirectangulaire } from '../lib/panorama';
import { demarrer, type Panorama } from './rendu-panorama';

export class VisionneusePhoto extends HTMLElement {
  #origineFocus: HTMLElement | null = null;
  #panorama: Panorama | null = null;

  connectedCallback(): void {
    if (this.firstElementChild) return;
    this.innerHTML = `
      <div class="photo-voile" hidden>
        <div class="photo-boite" role="dialog" aria-modal="true" aria-label="Photo de rue">
          <img class="photo-image" alt="Photo de rue à l’endroit sélectionné">
          <canvas class="photo-360" tabindex="0" hidden
            aria-label="Panorama 360° : faites glisser, ou utilisez les flèches"></canvas>
          <p class="photo-360-aide" hidden>Panorama 360° — faites glisser pour
            regarder autour, ou utilisez les flèches du clavier.</p>
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
      /* PIÈGE À FOCUS. Le canevas du panorama est focalisable — sans quoi on
         ne pourrait pas l'explorer aux flèches — donc la boucle alterne entre
         lui et le bouton de fermeture. La rendre à un seul élément aurait
         rendu le panorama inatteignable au clavier. */
      if (e.key === 'Tab') {
        e.preventDefault();
        const canevas = this.querySelector('.photo-360') as HTMLCanvasElement;
        const fermer = this.querySelector('.photo-fermer') as HTMLElement;
        const suivant = (!canevas.hidden && document.activeElement !== canevas)
          ? canevas : fermer;
        suivant.focus();
      }
    });
  }

  ouvrir(photo: PhotoRue): void {
    const voile = this.querySelector('.photo-voile') as HTMLElement;
    const image = this.querySelector('.photo-image') as HTMLImageElement;
    const legende = this.querySelector('.photo-legende') as HTMLElement;
    const canevas = this.querySelector('.photo-360') as HTMLCanvasElement;
    const aide = this.querySelector('.photo-360-aide') as HTMLElement;
    this.#panorama?.detruire();
    this.#panorama = null;
    canevas.hidden = true; aide.hidden = true; image.hidden = false;

    /* ON N'ATTEND PAS LA FIN DU CHARGEMENT POUR AFFICHER : l'image à plat est
       posée d'abord, et le rendu 360 la remplace SI la photo est bien un
       panorama. Une photo ordinaire ne passe jamais par WebGL. */
    /* L'IMAGE EST DEMANDÉE EN MODE ANONYME : sans cela elle contaminerait le
       canevas et WebGL refuserait de la texturer. Panoramax répond
       `Access-Control-Allow-Origin: *` (vérifié le 26/08/2026).
       ET SI UN JOUR CE N'ÉTAIT PLUS LE CAS, l'image ne se chargerait pas du
       tout : on réessaie alors SANS le mode anonyme, en renonçant au 360 mais
       en gardant la photo. Mieux vaut une image à plat que rien. */
    image.onerror = (): void => {
      if (!image.crossOrigin) return;
      image.onerror = null;
      image.removeAttribute('crossorigin');
      image.src = photo.image;
    };
    image.onload = (): void => {
      if (!image.crossOrigin) return;   // repli déjà en cours : pas de 360
      if (!estEquirectangulaire(image.naturalWidth, image.naturalHeight)) return;
      const rendu = demarrer(canevas, image);
      // `demarrer` rend null quand WebGL manque : on garde alors l'image à
      // plat. Dégradé, mais présent — et c'est ce que la ROADMAP promettait.
      if (!rendu) return;
      this.#panorama = rendu;
      image.hidden = true; canevas.hidden = false; aide.hidden = false;
    };
    image.crossOrigin = 'anonymous';
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
    /* LE RENDU EST DÉTRUIT AVANT L'IMAGE : la texture d'un panorama pèse
       plusieurs mégaoctets en mémoire vidéo, et une modale fermée ne doit
       rien garder. */
    this.#panorama?.detruire();
    this.#panorama = null;
    (this.querySelector('.photo-360') as HTMLCanvasElement).hidden = true;
    (this.querySelector('.photo-360-aide') as HTMLElement).hidden = true;
    // L'image est vidée : une modale fermée ne doit pas garder une photo en
    // mémoire ni continuer un téléchargement.
    const img = this.querySelector('.photo-image') as HTMLImageElement;
    img.onload = null;
    img.onerror = null;
    img.removeAttribute('crossorigin');
    img.hidden = false;
    img.removeAttribute('src');
    this.#origineFocus?.focus();
    this.#origineFocus = null;
  }
}

customElements.define('visionneuse-photo', VisionneusePhoto);
