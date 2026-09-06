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
import { MAX_ETAPES } from '../lib/itineraire';
import type { ResultatAdresse } from '../lib/adresse';

export class EtapesItineraire extends HTMLElement {
  #pointDe = new WeakMap<HTMLElement, PointGeo | null>();

  connectedCallback(): void {
    if (this.firstElementChild) return;
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
    // Même avec une liste vide : le bouton d'ajout et les boutons de butée
    // doivent refléter l'état — Effacer après six étapes le laissait caché.
    this.#rafraichir();
  }

  /** Ne prévient le panneau que si la séquence RÉSOLUE a changé : déplacer ou
      retirer une ligne vide ne change pas le trajet, et un recalcul identique
      gaspillerait le quota public. */
  #signalerSi(avant: PointGeo[]): void {
    const apres = this.points;
    const pareil = avant.length === apres.length
      && avant.every((p, i) => p.lon === apres[i]!.lon && p.lat === apres[i]!.lat);
    if (!pareil) this.dispatchEvent(new CustomEvent('etapes-changees'));
  }

  #bouton(libelle: string, symbole: string, action: (b: HTMLButtonElement) => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'etape-action';
    b.setAttribute('aria-label', libelle);
    b.textContent = symbole;
    b.addEventListener('click', () => action(b));
    return b;
  }

  #ajouter(point: PointGeo | null): void {
    const conteneur = this.querySelector('.etapes-lignes') as HTMLElement;
    if (conteneur.children.length >= MAX_ETAPES) return;
    const ligne = document.createElement('div');
    ligne.className = 'etape-ligne';
    this.#pointDe.set(ligne, point);

    const champ = new RechercheAdresse();
    champ.nomAccessible = 'Adresse de l’étape';
    champ.surSelection = (r: ResultatAdresse) => {
      const avant = this.points;
      this.#pointDe.set(ligne, r);
      this.#signalerSi(avant);
    };
    ligne.append(
      champ,
      this.#bouton('Monter l’étape', '↑', (b) => {
        const avantElt = ligne.previousElementSibling;
        if (!avantElt) return;
        const avant = this.points;
        conteneur.insertBefore(ligne, avantElt);
        this.#rafraichir();
        b.focus(); // insertBefore a déconnecté la ligne : le focus était perdu
        this.#signalerSi(avant);
      }),
      this.#bouton('Descendre l’étape', '↓', (b) => {
        const apresElt = ligne.nextElementSibling;
        if (!apresElt) return;
        const avant = this.points;
        conteneur.insertBefore(apresElt, ligne);
        this.#rafraichir();
        b.focus();
        this.#signalerSi(avant);
      }),
      this.#bouton('Retirer l’étape', '✕', () => {
        const avant = this.points;
        ligne.remove();
        this.#rafraichir();
        // Le bouton focalisé vient de disparaître avec sa ligne.
        (this.querySelector('.etapes-ajouter') as HTMLButtonElement).focus();
        this.#signalerSi(avant);
      }),
    );
    conteneur.append(ligne);
    const saisie = ligne.querySelector('input');
    if (point && saisie) saisie.value = formaterCoordonnees(point);
    // Un champ VIDÉ retire son point : sans cela, une ligne visuellement vide
    // resterait comptée dans le trajet (revue du 21/08).
    saisie?.addEventListener('input', () => {
      if (saisie.value.trim() === '' && this.#pointDe.get(ligne)) {
        const avant = this.points;
        this.#pointDe.set(ligne, null);
        this.#signalerSi(avant);
      }
    });
    this.#rafraichir();
  }

  /** Recalcule l'état des boutons : ajout (borne MAX_ETAPES) et butées ↑/↓. */
  #rafraichir(): void {
    const lignes = this.#lignes();
    (this.querySelector('.etapes-ajouter') as HTMLButtonElement).hidden =
      lignes.length >= MAX_ETAPES;
    lignes.forEach((l, i) => {
      const [monter, descendre] = l.querySelectorAll<HTMLButtonElement>('.etape-action');
      if (monter) monter.disabled = i === 0;
      if (descendre) descendre.disabled = i === lignes.length - 1;
    });
  }
}

customElements.define('etapes-itineraire', EtapesItineraire);
