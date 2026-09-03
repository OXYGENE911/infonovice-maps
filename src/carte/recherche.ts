// <recherche-adresse> — la barre de recherche BAN, en combobox ACCESSIBLE :
// rôles ARIA complets, navigation aux flèches, Entrée sélectionne, Échap
// referme. Débounce de 300 ms et annulation de la requête précédente : le
// quota BAN est un bien commun (règle du projet).
import {
  chercherAdresses, communeNommee, repondALaSaisie, type ResultatAdresse,
} from '../lib/adresse';
import { dansEmprise, type Emprise } from '../lib/couverture';
import { LONGUEUR_MIN_NOM } from '../lib/recherche-lieux';
import { chercherPartout } from '../lib/recherche-multi';
import { familleDevinee } from '../lib/famille-devinee';
import { MOTIF_DE_FAMILLE } from '../lib/pictos-lieux';
import { CATEGORIES } from '../lib/categories';
import { svgPastille } from './icone-lieu';
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
          <!-- LA MASCOTTE DE LA RECHERCHE (LOGO-1, 03/09) : le chien à la
               boussole, choisi par Armelin pour les écrans de recherche.
               Décorative (aria-hidden), et seulement en page pleine — dans la
               barre, chaque pixel de large compte. -->
          <img class="recherche-mascotte" src="/icones/compas-48.png"
            alt="" aria-hidden="true" width="34" height="34" hidden>
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
          <!-- CHERCHER AUTOUR DE SOI, SUR DEMANDE (GEO-1, 03/09).
               Armelin, la nuit du 03/09 : « pour la décision de géolocalisation
               automatique, on oublie pour le moment, ou alors on affiche un
               message explicite pendant la recherche pour demander le
               consentement de la personne à se localiser s'il souhaite
               rechercher autour de lui ? »
               C'EST LA BONNE VOIE, ET ELLE NE DEMANDE AUCUNE DÉROGATION. Une
               géolocalisation À L'OUVERTURE prendrait la position sans que
               personne n'ait rien demandé — la contrainte 4 l'interdit. Ici,
               c'est un geste, précédé de la phrase qui dit à quoi il sert et
               ce qu'il envoie. -->
          <div class="recherche-ici" hidden>
            <p class="recherche-ici-mot">Chercher autour de vous ? Votre
              position servira à trier les résultats par distance et à chercher
              les lieux proches. <strong>Elle part alors au service
              d’OpenStreetMap France</strong> qui relève ces lieux — c’est le
              seul moyen de chercher « autour de moi ». Elle n’est ni
              enregistrée, ni transmise à personne d’autre.</p>
            <button type="button" class="recherche-ici-oui">Utiliser ma position</button>
            <p class="recherche-ici-etat" role="status"></p>
          </div>
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
      this.querySelector('.recherche-ici-oui')?.addEventListener('click', () => {
        this.#seLocaliser();
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
        /* IL N'EST PLUS OBLIGATOIRE DE SITUER LA RECHERCHE (RECHERCHE-8,
           03/09). On refusait de chercher sans centre de carte — « déplacez la
           carte vers la zone qui vous intéresse » — parce que les deux seules
           sources d'alors, OpenStreetMap et l'annuaire des écoles, ne savent
           chercher qu'AUTOUR d'un point. L'index de la Géoplateforme et
           l'annuaire des entreprises cherchent dans TOUTE la France : on peut
           enfin chercher un lieu qu'on n'a pas déjà sous les yeux, ce qui est
           tout de même l'usage ordinaire d'une barre de recherche.
           Le centre, quand on l'a, sert encore aux deux sources qui en ont
           besoin — et à départager deux communes homonymes. */
        {
          try {
            /* CINQ PISTES, UN SEUL TEMPS D'ATTENTE (RECHERCHE-8, 03/09).

               LE MANDAT D'ARMELIN, la nuit du 03/09 : « faire fonctionner la
               recherche […] parcours toutes les API libres du gouvernement
               s'il le faut ». Aucune source ne résout ses douze requêtes
               d'essai — la mesure est dans `scripts/mesure-recherche.mjs` — et
               c'est le fait qui commande toute cette architecture : l'index
               de la Géoplateforme tolère la faute mais ignore les commerces ;
               l'annuaire des entreprises porte tous les commerces de France
               avec leur adresse mais ne tolère rien ; OpenStreetMap ne répond
               qu'à l'égalité ; l'annuaire de l'Éducation accepte un nom
               partiel d'école. On les interroge donc TOUTES en même temps, et
               une source en panne n'emporte pas les autres. */
            /* ET L'ON MONTRE AU FIL DE L'EAU (RECHERCHE-8, 03/09). Les
               sources ne vont pas à la même vitesse : 30 ms pour l'index de la
               Géoplateforme, jusqu'à dix secondes pour la piste « enseigne +
               commune » qui passe par Overpass. Attendre la plus lente pour
               montrer la plus rapide ferait une barre de recherche vide dix
               secondes durant. */
            const adresses = [...this.#resultats];
            const poser = (t: { lieux: { lon: number; lat: number;
              libelle: string; contexte: string; source: string }[] }): void => {
              const nommes = t.lieux.map((l) => ({
                lon: l.lon, lat: l.lat,
                libelle: l.libelle,
                type: l.source === 'entreprise' ? 'etablissement' : 'lieu',
                contexte: l.contexte,
              }));
              this.#resultats = nommes.length > 0 ? [...nommes, ...adresses] : [...adresses];
              this.#actif = -1;
              this.#afficher();
            };
            const trouve = await chercherPartout(texte, {
              centre, signal: this.#annulation.signal, auFil: poser,
            });
            const nommes = trouve.lieux.map((l) => ({
              lon: l.lon, lat: l.lat,
              libelle: l.libelle,
              type: l.source === 'entreprise' ? 'etablissement' : 'lieu',
              /* LA SOURCE ET L'ADRESSE SE DISENT : savoir d'où vient une
                 réponse, c'est pouvoir la contester — et l'adresse est ce
                 qu'Armelin réclamait le 03/09 (« aucune information sur
                 l'adresse du lieu au format texte »). */
              contexte: l.contexte,
            }));
            /* UNE PANNE N'EST PAS UNE ABSENCE, et il suffit d'UNE source en
               défaut pour qu'on ne puisse plus rien affirmer. */
            if (trouve.panne !== null && nommes.length === 0) throw trouve.panne;
            /* LES LIEUX PASSENT DEVANT : la BAN a déjà dit ce qu'elle savait,
               et un lieu nommé répond mieux qu'une rue approchante. Les
               adresses restent dessous, jamais perdues. */
            if (nommes.length > 0) this.#resultats = [...nommes, ...adresses];
            if (this.#resultats.length === 0) {
              /* ON DIT OÙ L'ON A CHERCHÉ quand on a reconnu une commune :
                 sans cela, l'usager ne sait pas si l'on a compris sa phrase. */
              note.textContent = trouve.commune
                ? `Rien trouvé pour « ${texte.trim()} », y compris autour de `
                  + `${trouve.commune.nom}.`
                : `Aucune adresse ni lieu nommé « ${texte.trim()} ».`;
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
    const mascotte = this.querySelector<HTMLElement>('.recherche-mascotte');
    if (mascotte) mascotte.hidden = false;
    /* L'INVITATION NE PARAÎT QUE SI ELLE SERT (GEO-1, 03/09) : en page plein
       écran, et seulement tant qu'on ne connaît pas déjà la position. La
       reproposer à qui s'est déjà localisé serait redemander un consentement
       déjà donné — une façon de le rendre insignifiant. */
    const ici = this.querySelector<HTMLElement>('.recherche-ici');
    if (ici) ici.hidden = positionConnue !== null;
  }

  /**
   * Demande la position, une fois, parce qu'on l'a demandée.
   *
   * ON NE LA PREND JAMAIS D'OFFICE (contrainte 4 du projet, et page « Vie
   * privée »). Ce bouton est le geste ; la phrase au-dessus dit à quoi la
   * position sert ET où elle part. La demander sans le dire serait la prendre.
   *
   * ELLE NE SORT PAS DU NAVIGATEUR PAR NOUS : elle sert à trier les résultats
   * par distance, ici même. Elle part en revanche au service d'OpenStreetMap
   * France dans la clause `around:` qui cherche les lieux proches — c'est le
   * seul moyen de chercher « autour de moi », et la page « À propos » le dit
   * désormais en toutes lettres.
   */
  #seLocaliser(): void {
    const etat = this.querySelector<HTMLElement>('.recherche-ici-etat');
    const bouton = this.querySelector<HTMLButtonElement>('.recherche-ici-oui');
    if (!('geolocation' in navigator)) {
      if (etat) etat.textContent = 'Ce navigateur ne sait pas donner votre position.';
      return;
    }
    if (bouton) bouton.disabled = true;
    if (etat) etat.textContent = 'Recherche de votre position…';
    navigator.geolocation.getCurrentPosition(
      (p) => {
        poserPositionConnue({ lon: p.coords.longitude, lat: p.coords.latitude });
        const bloc = this.querySelector<HTMLElement>('.recherche-ici');
        if (bloc) bloc.hidden = true;
        /* ON REFAIT LA RECHERCHE TOUT DE SUITE : sans cela, l'usager aurait
           accepté pour rien et devrait retaper sa phrase. */
        const champ = this.querySelector('input');
        if (champ && champ.value.trim() !== '') void this.#chercher(champ.value);
      },
      (e) => {
        if (bouton) bouton.disabled = false;
        /* UN REFUS N'EST PAS UNE PANNE, et se dit autrement : l'usager qui a
           dit non ne doit pas croire que l'application est cassée. */
        if (etat) {
          etat.textContent = e.code === e.PERMISSION_DENIED
            ? 'Position refusée — la recherche continue sans elle.'
            : 'Position indisponible pour le moment.';
        }
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  }

  /** Referme la page et rend la carte. */
  #fermerPage(): void {
    if (!this.#page) return;
    const ici = this.querySelector<HTMLElement>('.recherche-ici');
    if (ici) ici.hidden = true;
    const mascotte = this.querySelector<HTMLElement>('.recherche-mascotte');
    if (mascotte) mascotte.hidden = true;
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
        <span class="picto-lieu" aria-hidden="true"></span>
        <span class="libelle"></span><span class="contexte"></span>
        <span class="approche"${r.approche ? '' : ' hidden'}></span>
        <span class="distance"></span>
      </li>`).join('');
    // textContent, jamais innerHTML : le libellé vient d'un service externe.
    this.#resultats.forEach((r, i) => {
      const li = liste.children[i];
      if (!li) return;
      (li.querySelector('.libelle') as HTMLElement).textContent = r.libelle;
      /* LE DESSIN DU LIEU (PICTO-2, 03/09). Armelin : « ce serait bien
         d'afficher un logo de POI si l'adresse de destination est détectée
         comme étant une Gare, un restaurant, un centre commercial ou autre —
         ce qui permettrait de faire la différence de suite ». La pastille est
         CELLE DE LA CARTE — même motif, même couleur de famille : deux
         langages graphiques pour les mêmes lieux se contrediraient.
         Le markup est engendré depuis nos constantes ; rien d'externe n'y
         entre — le libellé, lui, reste posé en textContent. */
      const famille = familleDevinee(r.libelle);
      const motif = famille ? MOTIF_DE_FAMILLE[famille] : undefined;
      const teinte = famille ? CATEGORIES.find((c) => c.cle === famille)?.couleur : undefined;
      const picto = li.querySelector('.picto-lieu') as HTMLElement;
      if (motif && teinte) picto.innerHTML = svgPastille(motif, teinte, 20);
      else picto.hidden = true;
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

  /**
   * Avale le clic fantôme que le tactile dispatche APRÈS la fermeture.
   *
   * LE DÉFAUT, SIGNALÉ DEUX FOIS (28/08 puis 03/09, en 1.52). Armelin : « mon
   * doigt traverse la complétion pour aller cliquer sur le bouton situé en
   * dessous […] parfois je dois m'y prendre à trois ou quatre fois ». Mesuré
   * le 03/09 en 390×844 : la première suggestion occupe y 478→540, « Sur la
   * carte » et « Ma position » y 472→502 — elles se recouvrent sur la bande
   * haute, et c'est là que le doigt se pose.
   *
   * LA CAUSE. Choisir referme la liste PENDANT le `pointerdown`. À la souris
   * cela ne se voit pas : le `click` va à l'ancêtre commun du `mousedown` et
   * du `mouseup`. Au doigt, le `click` naît de la séquence tactile et vise ce
   * qui occupe les coordonnées APRÈS le `touchend` — donc le bouton qui vient
   * d'être découvert. C'est pourquoi mon parcours du 28/08, qui cliquait à la
   * SOURIS, concluait à tort qu'aucun correctif n'était nécessaire.
   *
   * POURQUOI CETTE FORME-LÀ. Ne fermer qu'au `click` supposerait que le
   * `click` arrive toujours — or `preventDefault()` sur `pointerdown` le
   * supprime dans certains navigateurs, et la sélection ne partirait plus du
   * tout. On ferme donc comme avant, et l'on RETIRE le clic suivant s'il
   * tombe dans le rectangle que la liste occupait : c'est exactement le clic
   * fantôme, et rien d'autre — un vrai second toucher au même pixel en moins
   * d'un tiers de seconde serait un double-tap, qu'on ne veut pas davantage.
   */
  #avalerLeFantome(zone: DOMRect): void {
    const fin = performance.now() + 350;
    const avaler = (e: MouseEvent): void => {
      document.removeEventListener('click', avaler, true);
      if (performance.now() > fin) return;
      const dedans = e.clientX >= zone.left && e.clientX <= zone.right
        && e.clientY >= zone.top && e.clientY <= zone.bottom;
      if (!dedans) return;
      e.preventDefault();
      e.stopPropagation();
    };
    /* EN CAPTURE : le fantôme doit être arrêté AVANT d'atteindre le bouton,
       et un écouteur posé sur le bouton lui-même arriverait trop tard. */
    document.addEventListener('click', avaler, true);
    /* ET L'ÉCOUTEUR NE SURVIT PAS À SA RAISON D'ÊTRE : sans ce retrait, un
       clic légitime bien plus tard trouverait encore la garde en place. */
    setTimeout(() => { document.removeEventListener('click', avaler, true); }, 400);
  }

  #choisir(i: number): void {
    const r = this.#resultats[i];
    if (!r) return;
    /* LA ZONE À GARDER SE MESURE AVANT DE FERMER : après, la liste n'a plus
       de rectangle. */
    const liste = this.querySelector('ul[role="listbox"]');
    if (liste) this.#avalerLeFantome(liste.getBoundingClientRect());
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
