// <recherche-adresse> — la barre de recherche BAN, en combobox ACCESSIBLE :
// rôles ARIA complets, navigation aux flèches, Entrée sélectionne, Échap
// referme. Débounce de 300 ms et annulation de la requête précédente : le
// quota BAN est un bien commun (règle du projet).
import { chercherAdresses, type ResultatAdresse } from '../lib/adresse';
import { chercherParNom, ZOOM_MIN_NOM, LONGUEUR_MIN_NOM } from '../lib/recherche-lieux';
import type { EmpriseVue } from '../lib/categories';
import { analyser, decoder, departementDe } from '../lib/adresse-mots';
import { communesParNom } from '../lib/commune';

/* Chaque instance a SES ids ARIA : le composant vit désormais en plusieurs
   exemplaires (départ, arrivée, jusqu'à six étapes) et des ids dupliqués
   feraient résoudre aria-controls/aria-activedescendant sur la première
   occurrence du document (revue du 21/08). */
let instances = 0;

/* LA VUE COURANTE EST DE PORTÉE MODULE, ET C'EST LA CORRECTION DU PREMIER
   JET (RECHERCHE-2, 01/09). Brancher chaque barre depuis carte.ts à
   l'assemblage ne touchait QUE celles qui existaient alors : les barres
   d'étapes naîtront plus tard, et n'auraient jamais su où l'on regarde —
   leur recherche par nom serait restée muette sans rien dire. Toutes les
   barres partagent la même carte : un point d'entrée suffit, et il vaut
   pour celles à naître. Un parcours l'a attrapé avant l'usager. */
let vueCourante: (() => { vue: EmpriseVue; zoom: number } | null) | null = null;

/** Dit aux barres de recherche où la carte regarde. Posé une fois. */
export function poserEmpriseCourante(
  f: () => { vue: EmpriseVue; zoom: number } | null,
): void { vueCourante = f; }

export class RechercheAdresse extends HTMLElement {
  #resultats: ResultatAdresse[] = [];
  #actif = -1;
  #minuteur: ReturnType<typeof setTimeout> | undefined;
  #annulation: AbortController | null = null;
  #surSelection: ((r: ResultatAdresse) => void) | null = null;
  #docEcoute: AbortController | null = null;


  readonly #idListe = `recherche-liste-${(instances += 1)}`;

  set surSelection(f: (r: ResultatAdresse) => void) { this.#surSelection = f; }

  /**
   * Inscrit un libellé dans le champ SANS relancer une recherche.
   *
   * Sert quand un autre composant désigne la destination — un commerce choisi
   * dans le cartouche d'une borne, par exemple. Le champ doit alors montrer ce
   * qui a été choisi : le laisser vide donnerait un itinéraire vers un point
   * que rien ne nomme, et l'usager ne saurait plus vers quoi il va.
   */
  set libelle(texte: string) {
    const champ = this.querySelector('input');
    if (champ) champ.value = texte;
  }

  connectedCallback(): void {
    /* IDEMPOTENT : déplacer une ligne d'étape (insertBefore) déconnecte puis
       reconnecte le composant — reconstruire le DOM ici effaçait la saisie de
       l'usager et ré-empilait les écouteurs (revue du 21/08). */
    if (!this.firstElementChild) {
      this.innerHTML = `
        <div class="recherche">
          <input type="search" role="combobox" aria-expanded="false"
            aria-controls="${this.#idListe}" aria-autocomplete="list"
            aria-label="Rechercher une adresse en France"
            placeholder="Rechercher une adresse…" autocomplete="off" spellcheck="false">
          <ul id="${this.#idListe}" role="listbox" aria-label="Suggestions d’adresses" hidden></ul>
          <p class="recherche-erreur" role="alert" hidden></p>
          <!-- UNE NOTE N'EST PAS UNE ERREUR (RECHERCHE-2) : « zoomez pour
               chercher par nom » informe, il n'échoue pas. La peindre en
               rouge d'alerte ferait passer une règle de frugalité pour une
               panne. -->
          <p class="recherche-note" role="status" hidden></p>
        </div>`;
      const champ = this.querySelector('input');
      champ?.addEventListener('input', () => this.#planifier(champ.value));
      champ?.addEventListener('keydown', (e) => this.#clavier(e));
    }
    // L'écouteur document suit le cycle de vie : posé à la connexion, retiré
    // à la déconnexion — sans quoi chaque ligne d'étape retirée le laissait
    // fuir (et s'exécuter sur un arbre mort à chaque clic de la page).
    this.#docEcoute?.abort();
    this.#docEcoute = new AbortController();
    // Cliquer ailleurs referme la liste — sans voler le focus du champ.
    document.addEventListener('pointerdown', (e) => {
      if (!this.contains(e.target as Node)) this.#fermer();
    }, { signal: this.#docEcoute.signal });
  }

  disconnectedCallback(): void {
    this.#docEcoute?.abort();
    this.#docEcoute = null;
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

    /* UNE ADRESSE EN MOTS SE RECONNAÎT À SA FORME — « Dijon-21 BAKE 4831 » —
       et n'a rien à faire dans la Base Adresse Nationale : on la résout par le
       répertoire des communes plutôt que d'envoyer à la BAN une chaîne qu'elle
       ne comprendra pas. Toute autre saisie suit son chemin habituel. */
    const enMots = analyser(texte);
    if (enMots) {
      try {
        const communes = await communesParNom(
          enMots.commune, enMots.departement, this.#annulation.signal,
        );
        if (communes.length === 0) {
          this.#resultats = [];
          this.#afficher();
          erreur.textContent = `Aucune commune « ${enMots.commune} » dans le ${enMots.departement}.`;
          erreur.hidden = false;
          return;
        }
        // Plusieurs communes homonymes dans le même département : six cas
        // recensés, tous en outre-mer. On les propose plutôt que d'en élire une.
        this.#resultats = communes.map((c) => {
          const p = decoder(c, enMots);
          return {
            libelle: `${c.nom}-${departementDe(c.code)} ${enMots.mot} ${String(enMots.chiffres).padStart(4, '0')}`,
            contexte: 'Adresse en mots',
            lon: p.lon,
            lat: p.lat,
            type: 'mots',
          };
        });
        this.#actif = -1;
        this.#afficher();
        return;
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return;
        this.#resultats = [];
        this.#afficher();
        erreur.textContent = e instanceof Error ? e.message : 'Recherche impossible.';
        erreur.hidden = false;
        return;
      }
    }

    const note = this.querySelector('.recherche-note') as HTMLElement;
    note.hidden = true;

    try {
      this.#resultats = await chercherAdresses(texte, this.#annulation.signal);
      /* LE DERNIER RECOURS (RECHERCHE-2, 01/09). Armelin veut chercher « une
         école, une entreprise » par son nom : la BAN ne connaît que des
         ADRESSES et reste muette. OpenStreetMap porte les noms — mais il est
         bénévole : on ne l'interroge QUE si la BAN n'a rien rendu, jamais
         sous le zoom 13, et toujours derrière le débounce de 300 ms. */
      if (this.#resultats.length === 0 && texte.trim().length >= LONGUEUR_MIN_NOM) {
        const ou = vueCourante?.() ?? null;
        if (ou && ou.zoom < ZOOM_MIN_NOM) {
          /* ON REFUSE, ET ON DIT POURQUOI. Une regex sur le nom à l'échelle
             d'une région ferait payer à un service bénévole le prix d'une
             base d'entreprises qu'il n'est pas. */
          note.textContent = 'Aucune adresse. Pour chercher un lieu par son nom,'
            + ' rapprochez-vous de la zone sur la carte.';
          note.hidden = false;
        } else if (ou) {
          const lieux = await chercherParNom(texte, ou.vue, this.#annulation.signal);
          this.#resultats = lieux
            .filter((l) => l.nom !== null)
            .map((l) => ({
              lon: l.lon, lat: l.lat,
              libelle: l.nom as string,
              type: 'lieu',
              contexte: 'Lieu de la carte',
            }));
          if (this.#resultats.length === 0) {
            note.textContent = `Aucune adresse ni lieu nommé « ${texte.trim()} » dans cette vue.`;
            note.hidden = false;
          }
        }
      }
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
    const liste = this.querySelector('ul[role="listbox"]') as HTMLUListElement;
    const champ = this.querySelector('input') as HTMLInputElement;
    liste.innerHTML = this.#resultats.map((r, i) => `
      <li role="option" id="${this.#idListe}-option-${i}" aria-selected="${i === this.#actif}">
        <span class="libelle"></span><span class="contexte"></span>
        <span class="approche"${r.approche ? '' : ' hidden'}></span>
      </li>`).join('');
    // textContent, jamais innerHTML : le libellé vient d'un service externe.
    this.#resultats.forEach((r, i) => {
      const li = liste.children[i];
      if (!li) return;
      (li.querySelector('.libelle') as HTMLElement).textContent = r.libelle;
      (li.querySelector('.contexte') as HTMLElement).textContent = r.type === 'municipality' ? 'Commune' : r.contexte;
      /* L'AVEU SE LIT DANS LA LISTE (ADRESSE-2) : un repli muet poserait
         l'usager au 23 en lui laissant croire qu'il est au 23 bis. */
      (li.querySelector('.approche') as HTMLElement).textContent = r.approche ?? '';
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
        .setAttribute('aria-activedescendant', `${this.#idListe}-option-${this.#actif}`);
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
    const liste = this.querySelector('ul[role="listbox"]') as HTMLUListElement | null;
    if (liste) liste.hidden = true;
    this.querySelector('input')?.setAttribute('aria-expanded', 'false');
    this.#actif = -1;
  }
}

customElements.define('recherche-adresse', RechercheAdresse);
