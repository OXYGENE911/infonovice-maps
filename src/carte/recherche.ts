// <recherche-adresse> — la barre de recherche BAN, en combobox ACCESSIBLE :
// rôles ARIA complets, navigation aux flèches, Entrée sélectionne, Échap
// referme. Débounce de 300 ms et annulation de la requête précédente : le
// quota BAN est un bien commun (règle du projet).
import {
  chercherAdresses, communeNommee, repondALaSaisie, type ResultatAdresse,
} from '../lib/adresse';
import { dansEmprise, type Emprise } from '../lib/couverture';
import { chercherParNom, sansLaCommune, LONGUEUR_MIN_NOM } from '../lib/recherche-lieux';
import { chercherEtablissements } from '../lib/annuaire-education';
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
/* L'EMPRISE ET NON LE SEUL CENTRE (RECHERCHE-5) : savoir où l'on regarde ne
   suffit pas, il faut savoir JUSQU'OÙ. Le centre d'une vue qui montre la
   France entière ne désigne aucun lieu ; la même vue, au zoom d'un quartier,
   en désigne un. C'est l'étendue qui fait la différence, et la demander évite
   d'inventer un seuil de zoom qui n'aurait de sens sur aucun écran. */
let vueCourante: (() => VueCarte | null) | null = null;

/** Où la carte regarde, et jusqu'où. */
export interface VueCarte {
  lon: number;
  lat: number;
  emprise: Emprise;
}

/** Dit aux barres de recherche où la carte regarde. Posé une fois. */
export function poserEmpriseCourante(
  f: () => VueCarte | null,
): void { vueCourante = f; }

/* LA DERNIÈRE POSITION CONNUE, quand l'usager a pressé « Me localiser »
   (RECHERCHE-7, 03/09). Elle sert à DIRE LA DISTANCE de chaque suggestion —
   « à 3,2 km » — ce qu'un usager d'Armelin demandait explicitement.
   ELLE N'EST JAMAIS DEMANDÉE ICI : la barre se sert de ce qu'on lui donne, et
   à défaut elle mesure depuis le centre de la carte EN LE DISANT. La
   géolocalisation reste un geste (contrainte 4 du projet). */
let positionConnue: { lon: number; lat: number } | null = null;

export function poserPositionConnue(p: { lon: number; lat: number }): void {
  positionConnue = p;
}

/* CE QUI RESSEMBLE À UNE ADRESSE NE VA PAS CHERCHER UN NOM. Un numéro en
   tête, c'est la Base Adresse Nationale qui répond — et Overpass n'a pas à
   être dérangé pour « 25 avenue du prophète ». */
function ressembleAUnNom(texte: string): boolean {
  return !/^\s*\d/.test(texte);
}

/* LE SCORE NE DÉCIDE DE RIEN, ET C'EST LUI QUI M'A TROMPÉ (RECHERCHE-5,
   01/09). RECHERCHE-3 refusait de chercher plus loin quand la BAN se disait
   sûre — seuil 0,9 — et RECHERCHE-4 refusait de l'ancrer sous 0,6. J'avais
   calibré ces deux seuils sur des scores mesurés SANS le paramètre
   `autocomplete`. Or l'application, elle, l'envoie : mesuré sur la production
   le jour même, « Collège Albert Camus » y vaut **0,945** au lieu de 0,48. La
   porte ne s'ouvrait donc jamais, et le collège de la fille d'Armelin restait
   introuvable pour la troisième fois — « Je n'ai toujours pas le collège de
   ma fille visible ».
   CE QUI DÉCIDE, C'EST LA DISTANCE. La BAN peut être très sûre d'un résultat
   qui n'a rien à voir : son lieu-dit « Collège Albert Camus » est dans le
   Nord, à deux cents kilomètres du Plessis-Trévise. Une saisie qui ressemble
   à un nom cherche donc TOUJOURS plus loin ; ce qui se choisit, c'est l'ANCRE. */

/* CE QU'ON REGARDE PASSE D'ABORD : un résultat DANS la vue est celui qu'on
   vise, et cela se lit sans seuil — une vue large accepte tout, ce qui est
   juste, car une carte de France entière n'exprime aucune préférence.
   LE RAYON N'EST QUE LE RATTRAPAGE DU BORD : zoomé sur sa ville, on cherche
   parfois un lieu qui tient à la ville voisine, hors écran de quelques
   kilomètres. Cinquante — la distance d'une ville à sa voisine, pas celle
   d'un département à l'autre. */
const SEUIL_LOIN_KM = 50;

/** Distance approchée entre deux points, en kilomètres — PURE. */
function distanceKm(a: { lon: number; lat: number }, b: { lon: number; lat: number }): number {
  const dLat = (a.lat - b.lat) * 111.32;
  const dLon = (a.lon - b.lon) * 111.32 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dLat, dLon);
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

  /* LA PAGE DE RECHERCHE PLEIN ÉCRAN (RECHERCHE-7, 03/09).
   *
   * LE TERRAIN. Armelin, rapportant ses usagers : « quand on tape une adresse,
   * la recherche s'affiche dans un tout petit rectangle et la complétion
   * dépasse de la zone d'affichage, ce qui ne fait pas très pro ni très beau.
   * Sur Google Maps, cela affiche une page de recherche en plein écran pour
   * bénéficier de toute la surface. La carte disparaît et on atterrit dans un
   * vrai module de recherche […] avec leur distance par rapport à ma position
   * géographique. »
   *
   * SEULE LA BARRE DU HAUT LE FAIT. Les champs du planificateur vivent DÉJÀ
   * dans une feuille qui occupe l'écran : leur en superposer une seconde
   * cacherait le trajet qu'on est en train de composer. La carte pose donc la
   * propriété sur la seule barre qui en a besoin.
   */
  pleinEcran = false;

  connectedCallback(): void {
    /* IDEMPOTENT : déplacer une ligne d'étape (insertBefore) déconnecte puis
       reconnecte le composant — reconstruire le DOM ici effaçait la saisie de
       l'usager et ré-empilait les écouteurs (revue du 21/08). */
    if (!this.firstElementChild) {
      this.innerHTML = `
        <div class="recherche">
          <!-- LA FLÈCHE DE RETOUR n'existe qu'en page plein écran : la CSS la
               cache autrement. Sans elle, on entrerait dans la recherche sans
               pouvoir en sortir autrement qu'au clavier. -->
          <button type="button" class="recherche-retour" hidden
            aria-label="Revenir à la carte">←</button>
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
      /* ON N'OUVRE PAS LA PAGE AU FOCUS SEUL. Un champ qui prend l'écran
         entier parce qu'on l'a effleuré au clavier surprendrait, et la
         tabulation le traverserait en le déclenchant. C'est le GESTE de
         chercher — un clic dans le champ, ou la première lettre — qui
         l'ouvre. */
      champ?.addEventListener('pointerdown', () => { this.#ouvrirPage(); });
      champ?.addEventListener('input', () => { this.#ouvrirPage(); });
      this.querySelector('.recherche-retour')?.addEventListener('click', () => {
        this.#fermerPage();
      });
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
      /* LES ADRESSES S'AFFICHENT SANS ATTENDRE (RECHERCHE-3). Les chercher
         plus loin prend des SECONDES — trois à cinq mesurées sur Overpass —
         et faire patienter quelqu'un qui a déjà sa réponse sous les yeux
         serait lui faire payer une recherche qu'il n'a pas demandée. */
      this.#actif = -1;
      this.#afficher();
      const meilleur = this.#resultats[0];
      const vue = vueCourante?.() ?? null;
        /* L'ANCRE EST LE RÉSULTAT DE LA BAN S'IL EST PLAUSIBLE — c'est-à-dire
           PRÈS de ce qu'on regarde, ou dans une commune qu'on a nommée
           soi-même (« Tour Eiffel Paris » : Paris est le bon endroit parce
           qu'on l'a écrit). Sinon, c'est la vue : on cherche là où l'on
           regarde, pas à deux cents kilomètres de là. */
      const plausible = meilleur !== undefined
        && (vue === null
          || dansEmprise(vue.emprise, meilleur)
          || distanceKm(meilleur, vue) <= SEUIL_LOIN_KM
          || communeNommee(texte, meilleur.contexte));
      /* LA BAN A RÉPONDU QUAND ELLE REND CE QU'ON A TAPÉ, LÀ OÙ ON REGARDE.
         Les deux conditions comptent, et le cas d'Armelin est celui qui les
         sépare : « Collège Albert Camus » lui rend un lieu-dit qui porte bien
         ces trois mots — mais à deux cents kilomètres de sa vue. Les mots
         seuls auraient refermé la porte ; la distance seule l'aurait ouverte
         sur « lyon » et deux appels pour rien. */
      const repondu = meilleur !== undefined && plausible
        && repondALaSaisie(texte, meilleur.libelle);
      if (ressembleAUnNom(texte) && texte.trim().length >= LONGUEUR_MIN_NOM
        && !repondu) {
        const centre = plausible && meilleur
          ? { lon: meilleur.lon, lat: meilleur.lat }
          : (vue === null ? null : { lon: vue.lon, lat: vue.lat });
        /* LA COMMUNE SITUE, ELLE NE NOMME PAS (RECHERCHE-6, 03/09).
           « INRAE beaucouzé » ne trouvait rien : OpenStreetMap connaît trois
           objets « INRAE » à Beaucouzé, nommés « INRAE » et non « INRAE
           beaucouzé ». Or la BAN vient de reconnaître Beaucouzé et la rend en
           tête, comme COMMUNE — on s'en sert pour situer, et l'on cherche le
           reste comme nom. C'est d'ailleurs ainsi qu'on parle : « le INRAE de
           Beaucouzé » veut dire « le INRAE, à Beaucouzé ». */
        const commune = this.#resultats.find((r) => r.type === 'municipality');
        const aChercher = commune
          ? sansLaCommune(texte, commune.libelle)
          : texte;
        if (centre === null) {
          note.textContent = 'Impossible de situer la recherche : déplacez la carte'
            + ' vers la zone qui vous intéresse.';
          note.hidden = false;
        } else {
          try {
            /* DEUX SOURCES, UN SEUL TEMPS D'ATTENTE (ECOLES-1, 01/09).
               OpenStreetMap n'indexe que l'ÉGALITÉ : il faut lui donner le nom
               entier. L'annuaire de l'Éducation nationale accepte un nom
               PARTIEL — « Albert Camus » y trouve « Collège Albert Camus »,
               qu'OSM ne connaît pas (mesuré : soixante écoles autour du
               Plessis-Trévise, aucune de ce nom). Les deux se complètent, on
               les interroge donc EN MÊME TEMPS.
               `allSettled` ET NON `all` : l'échec d'une source ne doit pas
               emporter l'autre — Overpass tombe régulièrement, et une école
               trouvée vaut mieux qu'une page vide. */
            const [cotePlaces, coteEcoles] = await Promise.allSettled([
              chercherParNom(aChercher, centre, this.#annulation.signal),
              chercherEtablissements(texte, centre, this.#annulation.signal),
            ]);
            const lieux = cotePlaces.status === 'fulfilled' ? cotePlaces.value : [];
            const ecoles = coteEcoles.status === 'fulfilled' ? coteEcoles.value : [];
            const nommes = [
              ...ecoles.map((e) => ({
                lon: e.lon, lat: e.lat,
                libelle: e.nom,
                type: 'etablissement',
                /* LA SOURCE SE DIT : savoir d'où vient une réponse, c'est
                   pouvoir la contester. */
                contexte: [e.type, e.commune].filter(Boolean).join(' · ')
                  || 'Éducation nationale',
              })),
              ...lieux
                .filter((l) => l.nom !== null)
                .map((l) => ({
                  lon: l.lon, lat: l.lat,
                  libelle: l.nom as string,
                  type: 'lieu',
                  contexte: 'Lieu de la carte',
                })),
            ];
            /* UNE PANNE N'EST PAS UNE ABSENCE, et il suffit d'UNE source en
               défaut pour qu'on ne puisse plus rien affirmer. Si l'une a
               échoué et que personne n'a rien trouvé, on dit la panne — dire
               « aucun résultat » ferait porter à l'usager le doute d'un
               service, et lui ferait croire que son lieu n'existe pas. */
            const enPanne = cotePlaces.status === 'rejected'
              ? cotePlaces.reason as Error
              : (coteEcoles.status === 'rejected' ? coteEcoles.reason as Error : null);
            if (enPanne !== null && nommes.length === 0) throw enPanne;
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

  /** La page occupe-t-elle l'écran ? */
  #page = false;

  /** Ouvre la page de recherche — sans effet hors du mode plein écran. */
  #ouvrirPage(): void {
    if (!this.pleinEcran || this.#page) return;
    this.#page = true;
    this.classList.add('recherche-page');
    document.body.classList.add('recherche-ouverte');
    const retour = this.querySelector<HTMLElement>('.recherche-retour');
    if (retour) retour.hidden = false;
  }

  /** Referme la page et rend la carte. */
  #fermerPage(): void {
    if (!this.#page) return;
    this.#page = false;
    this.classList.remove('recherche-page');
    document.body.classList.remove('recherche-ouverte');
    const retour = this.querySelector<HTMLElement>('.recherche-retour');
    if (retour) retour.hidden = true;
    this.#fermer();
    /* LE FOCUS REVIENT À LA CARTE plutôt que de tomber sur le `<body>` : sans
       cela, la tabulation repartirait du haut du document. */
    (document.querySelector('#carte') as HTMLElement | null)?.focus?.();
  }

  /**
   * La distance d'une suggestion au point de référence, en toutes lettres.
   *
   * DEPUIS LA POSITION QUAND ON LA CONNAÎT, sinon depuis le centre de la
   * carte — et l'en-tête de la liste dit LEQUEL. Une distance sans origine ne
   * veut rien dire, et l'inventer serait pire que de s'en passer.
   */
  #distance(r: { lon: number; lat: number }): string {
    const depuis = positionConnue ?? vueCourante?.() ?? null;
    if (depuis === null) return '';
    const km = distanceKm(r, depuis);
    if (km < 1) return `${Math.round(km * 1000)} m`;
    if (km < 10) return `${km.toFixed(1).replace('.', ',')} km`;
    return `${Math.round(km)} km`;
  }

  #afficher(): void {
    const liste = this.querySelector('ul[role="listbox"]') as HTMLUListElement;
    const champ = this.querySelector('input') as HTMLInputElement;
    liste.innerHTML = this.#resultats.map((r, i) => `
      <li role="option" id="${this.#idListe}-option-${i}" aria-selected="${i === this.#actif}">
        <span class="libelle"></span><span class="contexte"></span>
        <span class="approche"${r.approche ? '' : ' hidden'}></span>
        <span class="distance"></span>
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
      /* LA DISTANCE, DEMANDÉE PAR LES USAGERS (RECHERCHE-7) : « la complétion
         affiche les 10 autres adresses potentielles avec leur distance par
         rapport à ma position géographique ». */
      (li.querySelector('.distance') as HTMLElement).textContent = this.#distance(r);
      li.addEventListener('pointerdown', (e) => { e.preventDefault(); this.#choisir(i); });
    });
    liste.hidden = this.#resultats.length === 0;
    champ.setAttribute('aria-expanded', String(!liste.hidden));
  }

  #clavier(e: KeyboardEvent): void {
    if (this.#resultats.length === 0 && e.key !== 'Escape') return;
    /* ÉCHAP DOIT SORTIR MÊME SANS RÉSULTAT : c'est le cas le plus fréquent
       d'une page ouverte par erreur. */
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
      /* ÉCHAP SORT DE LA PAGE, pas seulement de la liste : sur une page qui
         occupe l'écran, refermer la liste laisserait l'usager devant un champ
         vide sans carte, et sans savoir comment revenir. */
      if (this.#page) this.#fermerPage(); else this.#fermer();
    }
  }

  #choisir(i: number): void {
    const r = this.#resultats[i];
    if (!r) return;
    const champ = this.querySelector('input') as HTMLInputElement;
    champ.value = r.libelle;
    /* CHOISIR REFERME LA PAGE : on a trouvé, on veut voir la carte. */
    this.#fermerPage();
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
