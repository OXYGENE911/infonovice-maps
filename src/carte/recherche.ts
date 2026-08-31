// <recherche-adresse> — la barre de recherche BAN, en combobox ACCESSIBLE :
// rôles ARIA complets, navigation aux flèches, Entrée sélectionne, Échap
// referme. Débounce de 300 ms et annulation de la requête précédente : le
// quota BAN est un bien commun (règle du projet).
import { chercherAdresses, type ResultatAdresse } from '../lib/adresse';
import { chercherParNom, LONGUEUR_MIN_NOM } from '../lib/recherche-lieux';
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
let centreCarte: (() => { lon: number; lat: number } | null) | null = null;

/** Dit aux barres de recherche où la carte regarde. Posé une fois. */
export function poserEmpriseCourante(
  f: () => { lon: number; lat: number } | null,
): void { centreCarte = f; }

/* CE QUI RESSEMBLE À UNE ADRESSE NE VA PAS CHERCHER UN NOM. Un numéro en
   tête, c'est la Base Adresse Nationale qui répond — et Overpass n'a pas à
   être dérangé pour « 25 avenue du prophète ». */
function ressembleAUnNom(texte: string): boolean {
  return !/^\s*\d/.test(texte);
}

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
      /* LA RECHERCHE PAR NOM PART DÈS QUE LA SAISIE EST UN NOM (RECHERCHE-3,
         01/09), et non plus seulement quand la BAN s'est tue.
         POURQUOI CE CHANGEMENT : la BAN rend presque TOUJOURS quelque chose
         — une rue floue, un lieu-dit. « Tour Eiffel Paris » y rend « Avenue
         Gustave Eiffel » (score 0,378), « Collège Albert Camus… » rend
         « avenue albert camus » (0,636). La porte d'hier, ouverte sur le
         seul silence de la BAN, ne s'ouvrait donc jamais — et Armelin l'a vu
         le lendemain : « je ne parviens pas à trouver une adresse ».
         LE CENTRE EST LE POINT LE PLUS PROBABLE, pas la vue : le meilleur
         résultat de la BAN quand il existe — c'est lui qui porte la commune
         que l'usager vient d'écrire — sinon le centre de la carte. */
      if (ressembleAUnNom(texte) && texte.trim().length >= LONGUEUR_MIN_NOM) {
        const meilleur = this.#resultats[0];
        const centre = meilleur
          ? { lon: meilleur.lon, lat: meilleur.lat }
          : centreCarte?.() ?? null;
        if (centre === null) {
          note.textContent = 'Impossible de situer la recherche : déplacez la carte'
            + ' vers la zone qui vous intéresse.';
          note.hidden = false;
        } else {
          try {
            const lieux = await chercherParNom(texte, centre, this.#annulation.signal);
            const nommes = lieux
              .filter((l) => l.nom !== null)
              .map((l) => ({
                lon: l.lon, lat: l.lat,
                libelle: l.nom as string,
                type: 'lieu',
                contexte: 'Lieu de la carte',
              }));
            /* LES LIEUX PASSENT DEVANT : la BAN a déjà dit ce qu'elle savait,
               et un lieu nommé EXACTEMENT comme la saisie répond mieux qu'une
               rue approchante. Les adresses restent dessous, jamais perdues. */
            if (nommes.length > 0) this.#resultats = [...nommes, ...this.#resultats];
            if (this.#resultats.length === 0) {
              note.textContent = `Aucune adresse ni lieu nommé « ${texte.trim()} »`
                + ' à moins de 25 km. Le nom doit être écrit en entier.';
              note.hidden = false;
            }
          } catch (e) {
            /* UN SERVICE QUI EXPIRE NE DIT PAS « CE LIEU N'EXISTE PAS ».
               Les adresses trouvées, elles, restent affichées. */
            note.textContent = e instanceof Error ? e.message
              : 'La recherche de lieux est indisponible pour le moment.';
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
