// <recherche-adresse> — la barre de recherche BAN, en combobox ACCESSIBLE :
// rôles ARIA complets, navigation aux flèches, Entrée sélectionne, Échap
// referme. Débounce de 300 ms et annulation de la requête précédente : le
// quota BAN est un bien commun (règle du projet).
import { chercherAdresses, type ResultatAdresse } from '../lib/adresse';

export class RechercheAdresse extends HTMLElement {
  #resultats: ResultatAdresse[] = [];
  #actif = -1;
  #minuteur: ReturnType<typeof setTimeout> | undefined;
  #annulation: AbortController | null = null;
  #surSelection: ((r: ResultatAdresse) => void) | null = null;

  set surSelection(f: (r: ResultatAdresse) => void) { this.#surSelection = f; }

  connectedCallback(): void {
    this.innerHTML = `
      <div class="recherche">
        <input type="search" role="combobox" aria-expanded="false"
          aria-controls="recherche-liste" aria-autocomplete="list"
          aria-label="Rechercher une adresse en France"
          placeholder="Rechercher une adresse…" autocomplete="off" spellcheck="false">
        <ul id="recherche-liste" role="listbox" aria-label="Suggestions d’adresses" hidden></ul>
        <p class="recherche-erreur" role="alert" hidden></p>
      </div>`;
    const champ = this.querySelector('input');
    champ?.addEventListener('input', () => this.#planifier(champ.value));
    champ?.addEventListener('keydown', (e) => this.#clavier(e));
    // Cliquer ailleurs referme la liste — sans voler le focus du champ.
    document.addEventListener('pointerdown', (e) => {
      if (!this.contains(e.target as Node)) this.#fermer();
    });
  }

  #planifier(texte: string): void {
    clearTimeout(this.#minuteur);
    this.#minuteur = setTimeout(() => void this.#chercher(texte), 300);
  }

  async #chercher(texte: string): Promise<void> {
    this.#annulation?.abort();
    this.#annulation = new AbortController();
    const erreur = this.querySelector('.recherche-erreur') as HTMLElement;
    erreur.hidden = true;
    try {
      this.#resultats = await chercherAdresses(texte, this.#annulation.signal);
      this.#actif = -1;
      this.#afficher();
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      this.#resultats = [];
      this.#afficher();
      erreur.textContent = e instanceof Error ? e.message : 'Recherche impossible.';
      erreur.hidden = false;
    }
  }

  #afficher(): void {
    const liste = this.querySelector('#recherche-liste') as HTMLUListElement;
    const champ = this.querySelector('input') as HTMLInputElement;
    liste.innerHTML = this.#resultats.map((r, i) => `
      <li role="option" id="recherche-option-${i}" aria-selected="${i === this.#actif}">
        <span class="libelle"></span><span class="contexte"></span>
      </li>`).join('');
    // textContent, jamais innerHTML : le libellé vient d'un service externe.
    this.#resultats.forEach((r, i) => {
      const li = liste.children[i];
      if (!li) return;
      (li.querySelector('.libelle') as HTMLElement).textContent = r.libelle;
      (li.querySelector('.contexte') as HTMLElement).textContent = r.type === 'municipality' ? 'Commune' : r.contexte;
      li.addEventListener('pointerdown', (e) => { e.preventDefault(); this.#choisir(i); });
    });
    liste.hidden = this.#resultats.length === 0;
    champ.setAttribute('aria-expanded', String(!liste.hidden));
  }

  #clavier(e: KeyboardEvent): void {
    if (this.#resultats.length === 0 && e.key !== 'Escape') return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const pas = e.key === 'ArrowDown' ? 1 : -1;
      this.#actif = (this.#actif + pas + this.#resultats.length) % this.#resultats.length;
      this.querySelectorAll('[role="option"]').forEach((o, i) =>
        o.setAttribute('aria-selected', String(i === this.#actif)));
      (this.querySelector('input') as HTMLInputElement)
        .setAttribute('aria-activedescendant', `recherche-option-${this.#actif}`);
    } else if (e.key === 'Enter' && this.#actif >= 0) {
      e.preventDefault();
      this.#choisir(this.#actif);
    } else if (e.key === 'Escape') {
      this.#fermer();
    }
  }

  #choisir(i: number): void {
    const r = this.#resultats[i];
    if (!r) return;
    const champ = this.querySelector('input') as HTMLInputElement;
    champ.value = r.libelle;
    this.#fermer();
    this.#surSelection?.(r);
  }

  #fermer(): void {
    const liste = this.querySelector('#recherche-liste') as HTMLUListElement | null;
    if (liste) liste.hidden = true;
    this.querySelector('input')?.setAttribute('aria-expanded', 'false');
    this.#actif = -1;
  }
}

customElements.define('recherche-adresse', RechercheAdresse);
