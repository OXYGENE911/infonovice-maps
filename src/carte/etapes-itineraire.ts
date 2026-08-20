// <etapes-itineraire> — les étapes intermédiaires du planificateur.
// Le composant de recherche est RÉUTILISÉ par ligne ; réordonnancement par
// boutons ↑/↓ plutôt que glisser-déposer : utilisable au clavier et annoncé
// aux lecteurs d'écran, là où le drag & drop ne l'est pas (l'écart avec la
// roadmap est documenté — l'accessibilité prime).
//
// La vérité vit dans le DOM : chaque ligne porte son point dans une WeakMap,
// et `points` se relit dans l'ordre des lignes — pas de tableau parallèle à
// désynchroniser en déplaçant ou retirant une ligne.
import { RechercheAdresse } from './recherche';
import { formaterCoordonnees, type PointGeo } from '../lib/coordonnees';
import type { ResultatAdresse } from '../lib/adresse';

/* Au-delà, l'URL s'allonge et le trajet devient illisible : six suffisent
   largement à une tournée — et le service accepte la liste sans broncher. */
const MAX_ETAPES = 6;

export class EtapesItineraire extends HTMLElement {
  #pointDe = new WeakMap<HTMLElement, PointGeo | null>();

  connectedCallback(): void {
    this.innerHTML = `
      <div class="etapes-lignes"></div>
      <button type="button" class="etapes-ajouter">+ Ajouter une étape</button>`;
    this.querySelector('.etapes-ajouter')?.addEventListener('click', () => {
      this.#ajouter(null);
      this.querySelector<HTMLInputElement>('.etape-ligne:last-child input')?.focus();
    });
  }

  #lignes(): HTMLElement[] {
    return [...this.querySelectorAll<HTMLElement>('.etape-ligne')];
  }

  /** Les étapes résolues, dans l'ordre des lignes — les vides sont ignorées. */
  get points(): PointGeo[] {
    return this.#lignes()
      .map((l) => this.#pointDe.get(l) ?? null)
      .filter((p): p is PointGeo => p !== null);
  }

  /** Rejeu d'un lien partagé : lignes pré-remplies avec les coordonnées. */
  set points(pts: PointGeo[]) {
    (this.querySelector('.etapes-lignes') as HTMLElement).replaceChildren();
    for (const p of pts.slice(0, MAX_ETAPES)) this.#ajouter(p);
  }

  #signaler(): void {
    this.dispatchEvent(new CustomEvent('change'));
  }

  #bouton(libelle: string, symbole: string, action: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'etape-action';
    b.setAttribute('aria-label', libelle);
    b.textContent = symbole;
    b.addEventListener('click', action);
    return b;
  }

  #ajouter(point: PointGeo | null): void {
    const conteneur = this.querySelector('.etapes-lignes') as HTMLElement;
    if (conteneur.children.length >= MAX_ETAPES) return;
    const ligne = document.createElement('div');
    ligne.className = 'etape-ligne';
    this.#pointDe.set(ligne, point);

    const champ = new RechercheAdresse();
    champ.surSelection = (r: ResultatAdresse) => {
      this.#pointDe.set(ligne, r);
      this.#signaler();
    };
    ligne.append(
      champ,
      this.#bouton('Monter l’étape', '↑', () => {
        const avant = ligne.previousElementSibling;
        if (avant) { conteneur.insertBefore(ligne, avant); this.#signaler(); }
      }),
      this.#bouton('Descendre l’étape', '↓', () => {
        const apres = ligne.nextElementSibling;
        if (apres) { conteneur.insertBefore(apres, ligne); this.#signaler(); }
      }),
      this.#bouton('Retirer l’étape', '✕', () => {
        const avaitPoint = Boolean(this.#pointDe.get(ligne));
        ligne.remove();
        this.#basculerAjout();
        // Retirer une ligne vide ne change pas le trajet : pas de recalcul.
        if (avaitPoint) this.#signaler();
      }),
    );
    conteneur.append(ligne);
    if (point) {
      const saisie = ligne.querySelector('input');
      if (saisie) saisie.value = formaterCoordonnees(point);
    }
    this.#basculerAjout();
  }

  #basculerAjout(): void {
    const b = this.querySelector('.etapes-ajouter') as HTMLButtonElement;
    b.hidden = this.#lignes().length >= MAX_ETAPES;
  }
}

customElements.define('etapes-itineraire', EtapesItineraire);
