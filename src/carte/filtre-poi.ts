/* <filtre-poi> — le filtre des lieux, à même la carte.
 *
 * LA DEMANDE. Armelin, le 30/08/2026 : « ce serait bien d'afficher quelque
 * part sur la carte une icône pour afficher les POI comme un filtre. Ce qui
 * permettrait d'afficher directement dans la carte les POI suivants quand on
 * zoome de plus près […] Il faudrait trouver un moyen de les afficher de
 * manière ergonomique et que l'utilisateur puisse configurer rapidement un
 * filtre pour choisir les POI qu'il souhaite voir autour de lui. »
 *
 * POURQUOI UN PANNEAU SUR LA CARTE, ET NON UNE PAGE DE PLUS. Ce qu'on cherche
 * autour de soi se décide EN REGARDANT la carte : ouvrir le planificateur,
 * descendre dans « Recharge et services », cocher, revenir — c'était quatre
 * gestes pour une question qui se pose en un. Le bouton vit donc à côté du
 * zoom, et les familles sont des pastilles qu'on active d'un doigt.
 *
 * IL CHERCHE TOUT SEUL DEPUIS LE 31/08, ET C'EST GARDÉ. Armelin : « ce
 * serait bien que les POI sélectionnés s'affichent tout seuls […] Plus c'est
 * simple pour l'utilisateur et plus facile sera l'adoption. » Il a raison :
 * un bouton de recherche est un péage que l'usager paie à chaque rue.
 *
 * MA RÉSERVE D'HIER ÉTAIT JUSTE, MAIS ELLE APPELAIT UNE GARDE, PAS UN REFUS.
 * Overpass est tenu par des bénévoles, et le mandat interdit de marteler les
 * communs. Quatre gardes rendent donc l'automatisme gratuit pour le service :
 *
 *   1. LE ZOOM — sous `ZOOM_MIN_POI`, on ne cherche pas : l'emprise d'une
 *      région rendrait cent lieux au hasard.
 *   2. LA MÉMOIRE DES ZONES (lib/couverture.ts) — une vue déjà couverte ne
 *      redemande RIEN. Revenir sur ses pas est gratuit.
 *   3. LA MARGE — on cherche plus large qu'on ne regarde, donc un petit
 *      déplacement reste couvert au lieu de relancer une requête.
 *   4. LE REPOS — on n'agit qu'à l'ARRÊT de la carte, après une pause, et
 *      jamais deux fois dans la même seconde.
 *
 * Traverser une ville coûte ainsi quelques requêtes, pas une par image.
 *
 * ET LA LIGNE D'ÉTAT NE SE TAIT JAMAIS : elle disait le zoom et le choix
 * manquant, puis se vidait une fois le choix fait — le seul moment où
 * l'usager attend qu'on lui dise ce qui se passe.
 */
import type { Map as CarteMapLibre, GeoJSONSource } from 'maplibre-gl';
import { Popup } from 'maplibre-gl';
import {
  CATEGORIES, urlFamilles, versLieux, PLAFOND_LIEUX, ErreurCategories,
  type LieuCategorie,
} from '../lib/categories';
import { lirePreference, ecrirePreference } from '../lib/stockage';
import { MOTIF_DE_FAMILLE, type CleMotif } from '../lib/pictos-lieux';
import {
  imagePastille, cleImage, svgPastille, RAPPORT_PASTILLE,
} from './icone-lieu';
import { rubriquesDe, lignesHoraires, etatOuverture } from '../lib/detail-lieu';
import { ajouterFavori } from '../lib/favoris';
import type { PorteItineraire } from './fiche-borne';
import {
  elargir, estCouverte, memoriser, type Emprise,
} from '../lib/couverture';

const SOURCE = 'filtre-poi';
const COUCHE = 'filtre-poi-points';

/** Les familles cochées survivent à la fermeture : c'est un réglage. */
export const PREF_FAMILLES = 'familles-poi';

/* SOUS LE ZOOM 13, ON NE CHERCHE PAS. L'emprise d'une région rendrait cent
   lieux au hasard — le plafond tombe au premier arrondissement traversé — et
   la carte serait un semis illisible. Un cran plus serré que les catégories
   du planificateur (12) : ici l'on cherche DOUZE familles à la fois. */
export const ZOOM_MIN_POI = 13;

/* LE REPOS AVANT DE CHERCHER. Six cents millisecondes après l'arrêt de la
   carte : un déplacement qui se poursuit ne déclenche rien, et l'usager qui
   s'arrête n'attend pas. */
export const REPOS_MS = 600;

/* JAMAIS DEUX REQUÊTES DANS LA MÊME SECONDE ET DEMIE. C'est le garde-fou de
   dernier ressort : même si les autres gardes cédaient, le service ne verrait
   pas une rafale. */
export const INTERVALLE_MIN_MS = 1_500;

/* COMBIEN DE LIEUX LA CARTE PORTE AU TOTAL. Les recherches s'accumulent —
   c'est ce qui fait que les points restent en place quand on se déplace —
   mais six cents points suffisent à couvrir une ville, et au-delà la carte
   ne se lit plus. Les plus anciens s'effacent. */
export const LIEUX_GARDES = 600;

export class FiltrePoi extends HTMLElement {
  /* LE PANNEAU DE RECHARGE, ACCUEILLI ICI (ERGO-3, 02/09). Il peut arriver
     AVANT que le squelette ne soit bâti — l'assemblage le range dès sa
     création — d'où la mémoire : on le pose au moment du rendu. C'est la même
     leçon que le menu des réglages, qui l'avait apprise en avalant cinq
     volets orphelins sans une erreur. */
  #recharge: HTMLElement | null = null;

  /**
   * Referme le panneau des filtres — appelé par la règle « une seule surface ».
   *
   * IDEMPOTENT ET SILENCIEUX : il est appelé chaque fois qu'un cartouche
   * s'ouvre, y compris quand le panneau est déjà fermé.
   */
  fermer(): void {
    const panneau = this.querySelector<HTMLElement>('.poi-panneau');
    const bulle = this.querySelector<HTMLButtonElement>('.poi-bulle');
    if (!panneau || panneau.hidden) return;
    /* L'ÉTAT INTERNE SUIT, sans quoi le prochain clic sur l'entonnoir le
       « refermerait » une seconde fois et il faudrait deux gestes pour le
       rouvrir — un défaut qui ne se voit qu'à l'usage. */
    this.#ouvert = false;
    panneau.hidden = true;
    bulle?.setAttribute('aria-expanded', 'false');
  }

  /** Accueille le panneau « Recharge et services » dans le filtre. */
  logerRecharge(element: HTMLElement): void {
    this.#recharge = element;
    const hote = this.querySelector<HTMLElement>('.poi-hote-recharge');
    if (hote) hote.appendChild(element);
  }

  #carte: CarteMapLibre | null = null;

  #actives = new Set<string>();

  #ouvert = false;

  /* LES CLASSES SONT PRÉFIXÉES `poi-filtre-…` LÀ OÙ LE PANNEAU DES SERVICES
     EN A DÉJÀ : `.poi-etat` nommait deux éléments différents, et un parcours
     a buté dessus avant l'usager. C'est la troisième collision de ce genre
     en deux jours — le préfixe se choisit d'avance, pas après. */

  /** Les zones déjà cherchées — la garde qui protège le service. */
  #zones: Emprise[] = [];

  /** Une recherche est en cours : on n'en lance pas une seconde par-dessus. */
  #enCours = false;

  /** Le dernier départ de requête, pour l'intervalle minimal. */
  #dernierAppel = 0;

  #minuteur: ReturnType<typeof setTimeout> | null = null;

  /** Le dernier échec, s'il faut le redire quand la carte s'arrête. */
  #echec: string | null = null;

  connectedCallback(): void {
    this.innerHTML = `
      <button type="button" class="poi-bulle" aria-expanded="false"
        aria-label="Filtrer les lieux affichés sur la carte">
        <!-- UN ENTONNOIR, demandé le 31/08 : les trois barres se lisaient
             comme un réglage de son ou un menu. L'entonnoir dit « filtre »
             sans légende, dans toutes les langues. -->
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M3.5 5h17l-6.6 7.6v5.7l-3.8 2.2v-7.9z"/>
        </svg>
      </button>
      <div class="poi-panneau" hidden role="group"
        aria-label="Lieux à afficher autour de vous">
        <p class="poi-panneau-titre">Autour de moi</p>
        <div class="poi-familles">
          ${CATEGORIES.map((c) => `
            <button type="button" class="poi-famille" data-cle="${c.cle}"
              aria-pressed="false" style="--teinte:${c.couleur}">
              <!-- LE DESSIN DE LA CARTE, PAS UN ROND (POI-5, 31/08) : la
                   pastille du filtre et celle de la carte sont LE MÊME
                   dessin — c'est ce qui fait du panneau une légende. -->
              <span class="poi-pastille" aria-hidden="true">${svgPastille(
    MOTIF_DE_FAMILLE[c.cle] ?? 'point', c.couleur, 20,
  )}</span>${c.libelle}
            </button>`).join('')}
        </div>
        <!-- LE BOUTON RESTE, MAIS IL NE COMMANDE PLUS : la recherche suit la
             carte. Il sert à REDEMANDER une zone déjà couverte — après une
             panne du service, ou pour rafraîchir un quartier. -->
        <!-- LA PUCE DES BORNES (BORNES-4). Armelin : « une nouvelle
             suggestion de POI [...] les bornes de recharge ». Elle ne
             cherche PAS dans Overpass : elle actionne la couche IRVE du
             volet « Recharge et services » — un second interrupteur sur le
             même circuit, jamais une seconde source. Cachée tant que le
             volet n'est pas branché : un bouton qui ne fait rien ment. -->
        <!-- SA CLASSE N'EST PAS .poi-famille, ET C'EST UN CONTRAT : ce
             compte-là dénombre les familles Overpass dans les parcours
             (« QUATORZE FAMILLES ») — la puce partage leur habit par le
             CSS, pas leur classe. Attrapé par le parcours du compte. -->
        <button type="button" class="poi-famille-bornes"
          aria-pressed="false" style="--teinte:#3FA877" hidden>
          <span class="poi-pastille" aria-hidden="true">${svgPastille('eclair', '#3FA877', 20)}</span>Bornes de recharge
          <!-- LE BADGE DES FILTRES (BORNES-4) : un réseau coché lors d'une
               visite passée filtrait la carte EN SILENCE — « aucune borne
               [...] à l'exception du réseau ZUNDER », conclu comme une
               panne. Le réglage rétabli se dit ICI, la surface qu'on
               regarde quand on regarde la carte. -->
          <span class="poi-famille-filtres" hidden>filtres actifs</span>
        </button>
        <!-- LE RAPPEL EST RANGÉ ICI (BORNES-8, 01/09), sous la puce qu'il
             concerne. BORNES-5 l'avait posé À CÔTÉ de la carte pour qu'il ne
             puisse plus être manqué ; c'était trop : « le rectangle apparaît
             aussi bien en mode carte qu'en mode navigation et ne part jamais.
             En mode navigation, le cartouche se fait même écraser par le
             panneau de direction » (Armelin, 01/09). Une alerte qui ne part
             jamais cesse d'alerter et finit par gêner.
             CE QUI RESTE VISIBLE DEPUIS LA CARTE : un point ambre sur
             l'entonnoir — assez pour qu'on ouvre, trop peu pour qu'on subisse. -->
        <div class="poi-rappel-bornes" role="status" hidden>
          <span class="poi-rappel-texte"></span>
          <button type="button" class="poi-rappel-tout">Tout afficher</button>
        </div>
        <button type="button" class="poi-chercher">Chercher à nouveau ici</button>
        <p class="poi-filtre-etat" role="status"></p>
        <!-- LES FILTRES DE RECHARGE VIENNENT ICI (ERGO-3, 02/09).
             LE RAISONNEMENT N'EST PAS DE MOI, ET IL EST JUSTE. Un collègue
             d'Armelin : « lorsqu'on clique sur itinéraire, on a le bouton
             "Recharge et services" qui permet de configurer le filtre des
             bornes […] et lorsque je suis dans la carte, j'ai le bouton en
             entonnoir qui permet de configurer le filtre des POI, mais
             seulement d'afficher ou masquer les bornes. Il aurait été plus
             logique de sortir la section "Recharge et services" du menu
             itinéraire pour l'inclure directement au niveau des filtres, car
             il s'agit également d'un filtre de POI. » Armelin : « je suis
             assez d'accord avec lui ».
             CE QUI SE RANGE ENSEMBLE SE RÈGLE ENSEMBLE : la puce « Bornes de
             recharge » et le choix des réseaux étaient deux moitiés du même
             geste, séparées par tout l'écran. -->
        <div class="poi-hote-recharge"></div>
      </div>`;

    const hote = this.querySelector<HTMLElement>('.poi-hote-recharge');
    if (hote && this.#recharge) hote.appendChild(this.#recharge);

    const bulle = this.querySelector<HTMLButtonElement>('.poi-bulle')!;
    const panneau = this.querySelector<HTMLElement>('.poi-panneau')!;
    bulle.addEventListener('click', () => {
      this.#ouvert = !this.#ouvert;
      panneau.hidden = !this.#ouvert;
      bulle.setAttribute('aria-expanded', String(this.#ouvert));
      if (this.#ouvert) this.#majEtat();
    });

    for (const b of this.querySelectorAll<HTMLButtonElement>('.poi-famille[data-cle]')) {
      b.addEventListener('click', () => {
        const cle = b.dataset['cle']!;
        if (this.#actives.has(cle)) this.#actives.delete(cle);
        else this.#actives.add(cle);
        b.setAttribute('aria-pressed', String(this.#actives.has(cle)));
        void ecrirePreference(PREF_FAMILLES, [...this.#actives]);
        /* CHANGER LE CHOIX PÉRIME TOUT CE QU'ON A COUVERT : les zones
           mémorisées l'ont été pour d'AUTRES familles, et les garder ferait
           croire à une carte complète alors qu'il manquerait la famille
           qu'on vient de cocher. On repart donc de rien — mais on ne part
           qu'après la pause, pour que cocher trois familles d'affilée ne
           fasse qu'une requête. */
        this.#zones = [];
        this.#lieux = [];
        this.#poser(this.#lieux);
        this.#majEtat();
        this.#programmer();
      });
    }
    this.querySelector('.poi-chercher')?.addEventListener('click', () => {
      /* LE CLIC IGNORE LA MÉMOIRE : c'est tout son intérêt. On redemande une
         zone déjà couverte, ce que l'automatisme refuse à juste titre. */
      void this.#chercher(true);
    });

    void lirePreference<string[]>(PREF_FAMILLES).then((memo) => {
      if (!Array.isArray(memo)) return;
      for (const cle of memo) {
        if (CATEGORIES.some((c) => c.cle === cle)) this.#actives.add(cle);
      }
      for (const b of this.querySelectorAll<HTMLButtonElement>('.poi-famille[data-cle]')) {
        b.setAttribute('aria-pressed', String(this.#actives.has(b.dataset['cle']!)));
      }
      this.#majEtat();
      // LES FAMILLES RETROUVÉES CHERCHENT SEULES : le réglage survit au
      // rechargement, la carte qu'il commande doit survivre avec lui.
      this.#programmer();
    }).catch(() => { /* sans mémoire, on part de rien : c'est le défaut */ });
  }

  set carte(c: CarteMapLibre) {
    this.#carte = c;
    /* `moveend` ET NON `move` : on agit quand la carte s'ARRÊTE. Suivre le
       déplacement image par image aurait fait de l'automatisme l'abus que le
       mandat interdit. */
    c.on('moveend', () => { this.#majEtat(); this.#programmer(); });
    c.on('style.load', () => { this.#poser(this.#lieux); });
    this.#programmer();
  }

  #lieux: LieuCategorie[] = [];

  /** L'emprise courante de la carte. */
  #vue(): Emprise | null {
    const b = this.#carte?.getBounds();
    return b ? {
      ouest: b.getWest(), sud: b.getSouth(), est: b.getEast(), nord: b.getNorth(),
    } : null;
  }

  /** Vrai si les conditions d'une recherche sont réunies. */
  #possible(): boolean {
    return (this.#carte?.getZoom() ?? 0) >= ZOOM_MIN_POI && this.#actives.size > 0;
  }

  /**
   * Programme une recherche — LE CŒUR DE LA GARDE.
   *
   * Appelé à chaque arrêt de la carte, à chaque changement de choix. Il ne
   * lance une requête QUE si les quatre gardes le permettent, et jamais deux
   * fois pour la même zone.
   */
  #programmer(): void {
    if (this.#minuteur !== null) { clearTimeout(this.#minuteur); this.#minuteur = null; }
    const vue = this.#vue();
    if (!vue || !this.#possible() || this.#enCours) return;
    // DÉJÀ COUVERTE : rien ne part, et c'est tout l'intérêt du dispositif.
    if (estCouverte(vue, this.#zones)) return;
    this.#minuteur = setTimeout(() => {
      this.#minuteur = null;
      const attente = Math.max(0, INTERVALLE_MIN_MS - (Date.now() - this.#dernierAppel));
      if (attente > 0) {
        // TROP TÔT : on ne renonce pas, on repousse. Renoncer laisserait la
        // carte vide après un déplacement rapide.
        this.#minuteur = setTimeout(() => { this.#minuteur = null; void this.#chercher(); }, attente);
        return;
      }
      void this.#chercher();
    }, REPOS_MS);
  }

  /**
   * Dit ce qui se passe — EN PERMANENCE, et jamais rien.
   *
   * LE DÉFAUT CORRIGÉ (31/08) : la ligne disait le zoom manquant, puis le
   * choix manquant, puis SE TAISAIT une fois le choix fait — au seul moment
   * où l'usager attend qu'on lui dise ce qui se passe. Un panneau qui se tait
   * ressemble à un panneau en panne.
   *
   * ELLE NE DIT PLUS « la vue a bougé » : ce n'est plus vrai, la recherche
   * suit la carte. Elle dit ce que la carte porte, et d'où ça vient.
   */
  #majEtat(): void {
    const etat = this.querySelector<HTMLElement>('.poi-filtre-etat');
    const chercher = this.querySelector<HTMLButtonElement>('.poi-chercher');
    if (!etat || !chercher) return;
    const tropLoin = (this.#carte?.getZoom() ?? 0) < ZOOM_MIN_POI;
    chercher.disabled = tropLoin || this.#actives.size === 0 || this.#enCours;
    if (tropLoin) {
      etat.textContent = 'Rapprochez-vous pour voir les lieux autour de vous'
        + ` (zoom ${ZOOM_MIN_POI} au moins).`;
      return;
    }
    if (this.#actives.size === 0) {
      etat.textContent = 'Choisissez ce que vous voulez voir.';
      return;
    }
    if (this.#enCours) { etat.replaceChildren(this.#attente()); return; }
    /* UN ÉCHEC SE REDIT TANT QU'IL N'EST PAS LEVÉ : l'effacer au premier
       déplacement laisserait une carte vide sans explication. */
    if (this.#echec !== null) { etat.textContent = this.#echec; return; }
    const n = this.#lieux.length;
    if (n === 0) {
      etat.textContent = estCouverte(this.#vue() ?? { ouest: 0, sud: 0, est: 0, nord: 0 }, this.#zones)
        ? 'Rien de recensé ici pour ce choix (source OpenStreetMap).'
        : 'Recherche automatique dès que la carte s’arrête.';
      return;
    }
    etat.textContent = `${n} lieu${n > 1 ? 'x' : ''} — la recherche suit la carte.`;
  }

  /**
   * La fiche d'un lieu — ce qu'on en sait, et ce qu'on peut en faire.
   *
   * MÊME LANGAGE VISUEL QUE LES AUTRES CARTOUCHES : les classes `fb-*` sont
   * reprises de la fiche de borne, comme l'avait fait la fiche des lieux
   * d'exception. Un seul dessin pour tous les cartouches de l'application.
   *
   * RIEN N'EST INVENTÉ : chaque rubrique n'existe que si la carte la porte.
   * Une fiche pleine de rubriques vides ferait croire à un lieu mal renseigné
   * alors que c'est la donnée qui manque — et l'on dit d'où elle vient.
   */
  #ficheLieu(lieu: LieuCategorie): HTMLElement {
    const famille = CATEGORIES.find((c) => c.cle === lieu.famille);
    const boite = document.createElement('div');
    boite.className = 'fb-fiche poi-fiche';

    const titre = document.createElement('p');
    titre.className = 'poi-fiche-nom';
    titre.textContent = lieu.nom ?? famille?.libelle ?? 'Lieu';
    boite.append(titre);

    if (lieu.nom && famille) {
      const type = document.createElement('p');
      type.className = 'poi-fiche-type';
      type.style.setProperty('--teinte', famille.couleur);
      type.textContent = famille.libelle;
      boite.append(type);
    }

    const rubriques = rubriquesDe(lieu.tags ?? {});
    if (rubriques.length > 0) {
      const dl = document.createElement('dl');
      dl.className = 'poi-fiche-details';
      for (const r of rubriques) {
        const dt = document.createElement('dt');
        dt.textContent = r.libelle;
        const dd = document.createElement('dd');
        if (r.cle === 'horaires') {
          /* OUVERT OU FERMÉ, QUAND ON SAIT (FICHE-3, 01/09). Armelin : « ce
             serait bien d'afficher si l'établissement est ouvert ou fermé et
             dans combien de temps il ferme ». La règle d'hier tient : on ne
             CONCLUT que sur les expressions qu'on sait évaluer EXACTEMENT —
             jours et plages simples, 24/7. Jours fériés, semaines paires,
             dates : on affiche les horaires sans verdict, parce qu'un
             « ouvert » faux fait faire un détour pour rien. */
          const verdict = etatOuverture(lieu.tags?.['opening_hours'] ?? '', new Date());
          if (verdict !== null) {
            const v = document.createElement('span');
            v.className = `poi-fiche-ouvert ${verdict.ouvert ? 'est-ouvert' : 'est-ferme'}`;
            v.textContent = verdict.texte;
            dd.append(v);
          }
          /* UN JOUR PAR LIGNE (FICHE-2, 31/08) : « une sorte de tableau avec
             un jour par ligne et les horaires associés ». La phrase d'une
             seule ligne reste ce que la voix dirait ; l'œil, lui, lit des
             lignes. */
          const table = document.createElement('span');
          table.className = 'poi-fiche-horaires';
          for (const ligne of lignesHoraires(lieu.tags?.['opening_hours'] ?? '')) {
            const s = document.createElement('span');
            s.textContent = ligne;
            table.append(s);
          }
          dd.append(table);
        } else if (r.lien !== undefined) {
          const a = document.createElement('a');
          a.href = r.lien;
          a.textContent = r.valeur;
          /* UN LIEN EXTERNE S'OUVRE À CÔTÉ et ne partage rien : `noreferrer`
             empêche le site d'apprendre d'où vient la visite — le mandat
             interdit de laisser fuir quoi que ce soit. */
          if (/^https?:/i.test(r.lien)) {
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
          }
          dd.append(a);
        } else dd.textContent = r.valeur;
        dl.append(dt, dd);
      }
      boite.append(dl);
    }

    const boutons = document.createElement('div');
    boutons.className = 'poi-fiche-boutons';

    const aller = document.createElement('button');
    aller.type = 'button';
    aller.className = 'poi-fiche-aller';
    aller.textContent = 'Y aller';
    const nom = lieu.nom ?? famille?.libelle ?? 'Lieu';
    aller.setAttribute('aria-label', `Itinéraire vers ${nom}`);
    /* « Y ALLER » PARLE AU PLANIFICATEUR, comme la fiche de borne : le même
       chemin, la même porte. Sans planificateur branché, le bouton ne
       paraît pas — un bouton qui ne fait rien est pire qu'un texte. */
    aller.addEventListener('click', () => {
      this.#porte?.allerVers({ lon: lieu.lon, lat: lieu.lat }, nom);
    });

    const favori = document.createElement('button');
    favori.type = 'button';
    favori.className = 'poi-fiche-favori';
    favori.textContent = 'Ajouter aux favoris';
    favori.addEventListener('click', () => {
      void ajouterFavori(nom, { lon: lieu.lon, lat: lieu.lat }).then(() => {
        /* LE BOUTON DIT CE QU'IL A FAIT, et ne se laisse pas presser deux
           fois : sans cela, on ne sait pas si le clic a porté. */
        favori.textContent = 'Ajouté aux favoris';
        favori.disabled = true;
      }).catch(() => {
        favori.textContent = 'Échec de l’ajout';
      });
    });

    if (this.#porte) boutons.append(aller);
    boutons.append(favori);

    /* « PARTAGE FACILE » (FICHE-3, 01/09) : « inclure un lien permettant de
       partager l'adresse à quelqu'un d'autre ». Le lien porte les
       coordonnées et le nom dans le FRAGMENT # — jamais envoyé au serveur,
       comme le partage de favoris. Pas d'algorithme maison de carrés d'un
       mètre : des coordonnées WGS84 s'ouvrent partout, un code propriétaire
       ne s'ouvre que chez nous — Plus Code est précisément le travers qu'on
       évite. */
    const partager = document.createElement('button');
    partager.type = 'button';
    partager.className = 'poi-fiche-partager';
    partager.textContent = 'Partage facile';
    partager.setAttribute('aria-label', `Partager ${nom} avec quelqu'un`);
    partager.addEventListener('click', () => {
      const lien = `${location.origin}${location.pathname}#lieu=`
        + `${lieu.lon.toFixed(6)},${lieu.lat.toFixed(6)},${encodeURIComponent(nom)}`;
      if (typeof navigator.share === 'function') {
        void navigator.share({ title: nom, url: lien })
          .catch(() => { /* geste annulé : pas une erreur */ });
        return;
      }
      void navigator.clipboard.writeText(lien).then(() => {
        partager.textContent = 'Lien copié !';
        setTimeout(() => { partager.textContent = 'Partage facile'; }, 2500);
      }).catch(() => { partager.textContent = 'Copie impossible'; });
    });
    boutons.append(partager);
    boite.append(boutons);

    /* LA SOURCE EST DITE, comme partout : ce qui manque manque à la carte,
       pas à l'application. */
    const source = document.createElement('p');
    source.className = 'poi-fiche-source';
    source.textContent = 'Source OpenStreetMap.';
    boite.append(source);
    return boite;
  }

  /** Ouvre la fiche d'un lieu reçu par lien — mêmes boutons, sans étiquettes. */
  montrerLieuPartage(lieu: { lon: number; lat: number; nom: string }): void {
    const carte = this.#carte;
    if (!carte) return;
    new Popup({ closeButton: true, closeOnClick: true, maxWidth: '300px' })
      .setLngLat([lieu.lon, lieu.lat])
      .setDOMContent(this.#ficheLieu({
        nom: lieu.nom, lon: lieu.lon, lat: lieu.lat, motif: 'point', tags: {},
      }))
      .addTo(carte);
  }

  /** Le témoin d'attente : il bat, donc il prouve que quelque chose se passe. */
  #attente(): HTMLElement {
    const s = document.createElement('span');
    s.className = 'poi-filtre-attente';
    s.textContent = 'Recherche des lieux…';
    return s;
  }

  /**
   * Cherche les familles cochées dans la vue — et retient ce qu'elle couvre.
   *
   * ON CHERCHE PLUS LARGE QU'ON NE REGARDE (`elargir`) : la marge absorbe les
   * petits déplacements, qui ne relancent alors rien. C'est ce qui fait la
   * différence entre un automatisme et un martèlement.
   *
   * @param force Ignorer la mémoire des zones — c'est le bouton.
   */
  async #chercher(force = false): Promise<void> {
    const carte = this.#carte;
    if (!carte || this.#actives.size === 0 || this.#enCours) return;
    const vue = this.#vue();
    if (!vue) return;
    if (!force && estCouverte(vue, this.#zones)) return;
    const zone = elargir(vue);
    const familles = [...this.#actives];
    this.#enCours = true;
    this.#echec = null;
    this.#dernierAppel = Date.now();
    this.#majEtat();
    try {
      const r = await fetch(urlFamilles(familles, zone));
      if (!r.ok) throw new ErreurCategories('La recherche de lieux est indisponible.');
      const texte = await r.text();
      let lus: LieuCategorie[];
      try {
        lus = versLieux(JSON.parse(texte));
      } catch {
        throw new ErreurCategories('Le service OpenStreetMap est saturé.');
      }
      /* LE CHOIX A PU CHANGER PENDANT L'ATTENTE : sans cette vérification, une
         réponse tardive repeuplerait la carte de familles qu'on vient de
         décocher. */
      const voulues = new Set(this.#actives);
      const gardes = lus.filter((l) => l.famille && voulues.has(l.famille));
      /* LA ZONE N'EST RETENUE QUE SI LE PLAFOND N'A PAS TRANCHÉ : au-delà, la
         réponse est tronquée, et la déclarer « couverte » ferait croire à un
         quartier vide qu'on n'a jamais fini de lire. */
      if (lus.length < PLAFOND_LIEUX) this.#zones = memoriser(this.#zones, zone);
      this.#accumuler(gardes);
      this.#poser(this.#lieux);
    } catch (e) {
      this.#echec = e instanceof ErreurCategories
        ? e.message : 'La recherche de lieux est indisponible.';
    } finally {
      this.#enCours = false;
      this.#majEtat();
    }
  }

  /**
   * Ajoute les lieux trouvés à ceux déjà posés — SANS DOUBLON.
   *
   * L'ACCUMULATION EST CE QUI REND LE DÉPLACEMENT NATUREL : effacer à chaque
   * recherche ferait clignoter la carte et disparaître le restaurant qu'on
   * vient de repérer, au premier glissement du doigt.
   */
  #accumuler(trouves: readonly LieuCategorie[]): void {
    const cle = (l: LieuCategorie): string =>
      `${l.lon.toFixed(6)},${l.lat.toFixed(6)},${l.famille ?? ''}`;
    const vus = new Set(this.#lieux.map(cle));
    const ajouts = trouves.filter((l) => !vus.has(cle(l)));
    // LES PLUS ANCIENS S'EFFACENT : six cents points couvrent une ville, et
    // au-delà la carte ne se lit plus.
    this.#lieux = [...this.#lieux, ...ajouts].slice(-LIEUX_GARDES);
  }

  /** Le planificateur, quand il est là : « Y aller » lui parle. */
  #porte: PorteItineraire | null = null;

  set porteItineraire(p: PorteItineraire) { this.#porte = p; }

  /* LE VOLET « RECHARGE ET SERVICES » RESTE LE MAÎTRE de la couche des
     bornes (BORNES-4) : la puce lui délègue tout, et il la tient au courant
     par `majBornes` — cocher là-bas allume la puce ici, et inversement. */
  #porteBornes: {
    basculer(actif: boolean): void; active(): boolean; toutAfficher(): void;
  } | null = null;

  set porteBornes(p: {
    basculer(actif: boolean): void; active(): boolean; toutAfficher(): void;
  }) {
    this.#porteBornes = p;
    const puce = this.querySelector<HTMLButtonElement>('.poi-famille-bornes');
    if (!puce) return;
    puce.hidden = false;
    puce.setAttribute('aria-pressed', String(p.active()));
    puce.addEventListener('click', () => {
      this.#porteBornes?.basculer(!this.#porteBornes.active());
    });
    /* LE RETRAIT SE FAIT LÀ OÙ LE PROBLÈME SE VOIT : dire à quelqu'un que
       sa carte est filtrée en le renvoyant chercher le réglage dans un volet
       serait lui désigner la porte sans lui donner la clé. */
    this.querySelector('.poi-rappel-tout')?.addEventListener('click', () => {
      this.#porteBornes?.toutAfficher();
    });
  }

  /** L'état de la couche des bornes, dit par le volet — la puce le reflète. */
  majBornes(actif: boolean): void {
    this.querySelector('.poi-famille-bornes')
      ?.setAttribute('aria-pressed', String(actif));
  }

  /** Le rappel des filtres de bornes qui agissent, dit par le volet. */
  majFiltresBornes(resume: string | null): void {
    const badge = this.querySelector<HTMLElement>('.poi-famille-filtres');
    const puce = this.querySelector<HTMLButtonElement>('.poi-famille-bornes');
    if (badge && puce) {
      badge.hidden = resume === null;
      puce.title = resume === null ? '' : `Filtres actifs : ${resume}`;
    }
    /* L'ENTONNOIR PORTE UN POINT tant qu'un filtre retranche (BORNES-8) :
       c'est le seul signal qui reste visible sans ouvrir, et il tient dans
       huit pixels — il informe sans occuper l'écran de celui qui conduit. */
    this.querySelector('.poi-bulle')?.classList.toggle('poi-bulle-filtree', resume !== null);
    const rappel = this.querySelector<HTMLElement>('.poi-rappel-bornes');
    const texte = this.querySelector<HTMLElement>('.poi-rappel-texte');
    if (!rappel || !texte) return;
    rappel.hidden = resume === null;
    texte.textContent = resume === null ? ''
      : `Bornes filtrées : ${resume}`;
  }

  /** Les images déjà fabriquées : une par couple motif/couleur. */
  #images = new Set<string>();

  /**
   * S'assure que la pastille existe dans la carte, et rend sa clé.
   *
   * FABRIQUÉE UNE SEULE FOIS : une vue de centre-ville porte des centaines de
   * lieux pour une vingtaine de dessins. Redessiner à chaque point aurait
   * coûté cent fois le travail utile.
   */
  #assurerImage(motif: CleMotif, famille: string | undefined): string {
    const couleur = CATEGORIES.find((c) => c.cle === famille)?.couleur ?? '#5F5E5A';
    const cle = cleImage(motif, couleur);
    const carte = this.#carte;
    if (!carte || this.#images.has(cle)) return cle;
    if (!carte.hasImage(cle)) {
      const image = imagePastille(motif, couleur);
      // SANS TOILE, PAS D'IMAGE — et MapLibre dessinerait un trou. On rend
      // quand même la clé : la couche se pose, simplement sans ce motif.
      if (image) carte.addImage(cle, image, { pixelRatio: RAPPORT_PASTILLE });
    }
    this.#images.add(cle);
    return cle;
  }

  /** Pose les lieux — une pastille par lieu, le motif de son type. */
  #poser(lieux: readonly LieuCategorie[]): void {
    const carte = this.#carte;
    if (!carte) return;
    const donnees = {
      type: 'FeatureCollection' as const,
      features: lieux.map((l, i) => ({
        type: 'Feature' as const,
        properties: {
          rang: i, famille: l.famille ?? '',
          nom: l.nom ?? '',
          libelle: CATEGORIES.find((c) => c.cle === l.famille)?.libelle ?? '',
          // LE MOTIF DIT LE TYPE, LA COULEUR DIT LA FAMILLE : l'image est
          // le couple des deux, fabriquée une fois et réutilisée partout.
          image: this.#assurerImage(l.motif ?? 'point', l.famille),
        },
        geometry: { type: 'Point' as const, coordinates: [l.lon, l.lat] },
      })),
    };
    try {
      const existante = carte.getSource(SOURCE) as GeoJSONSource | undefined;
      if (existante) { existante.setData(donnees); return; }
      carte.addSource(SOURCE, { type: 'geojson', data: donnees });
      carte.addLayer({
        id: COUCHE, type: 'symbol', source: SOURCE,
        layout: {
          /* L'IMAGE EST CHOISIE PAR LA DONNÉE, et la donnée porte déjà la
             clé : une couche pour tous les motifs, au lieu d'une couche par
             famille avec les mêmes réglages à corriger vingt fois. */
          'icon-image': ['get', 'image'],
          /* PLUS GROS QUE LES RONDS D'AVANT, ET C'EST LA DEMANDE : « un rond
             de couleur un peu plus gros, mais avec un motif clairement
             identifiable ». Mesuré à l'écran : au-dessous de vingt-cinq
             pixels, le caddie et la clé ne se distinguent plus. L'image fait
             soixante-quatre pixels pour un rapport de deux, donc une taille
             de 1 vaut trente-deux pixels affichés. */
          'icon-size': ['interpolate', ['linear'], ['zoom'], 13, 0.68, 17, 1],
          /* ON NE CACHE PAS LES PASTILLES QUI SE CHEVAUCHENT : un
             restaurant qui disparaît parce qu'un autre est trop près se lit
             comme une donnée manquante. Elles se serrent, elles ne
             s'effacent pas. */
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
        },
      });
      /* LE NOM AU CLIC, ET NON EN PERMANENCE : cent étiquettes sur une vue
         de centre-ville cachent la carte qu'on essaie de lire. */
      /* UNE FICHE, PAS UNE ÉTIQUETTE (LIEUX-1, 31/08). Armelin : « il y a
         juste écrit un texte pour indiquer le nom de l'enseigne ou le type de
         POI, mais ce serait bien d'afficher une fenêtre avec du détail […]
         ainsi qu'un bouton permettant de configurer directement un trajet
         pour y aller ou pour l'ajouter en favoris. »
         LE DÉTAIL NE COÛTE AUCUNE REQUÊTE : les étiquettes étaient déjà dans
         la réponse, on les jetait après avoir lu le nom. */
      carte.on('click', COUCHE, (e) => {
        const rang = Number((e.features?.[0]?.properties as { rang?: unknown })?.rang);
        const lieu = Number.isFinite(rang) ? this.#lieux[rang] : undefined;
        if (!lieu) return;
        new Popup({ closeButton: true, closeOnClick: true, maxWidth: '300px' })
          .setLngLat([lieu.lon, lieu.lat])
          .setDOMContent(this.#ficheLieu(lieu))
          .addTo(carte);
        /* LE LIEU EST RECADRÉ AU CLIC (FICHE-3, 01/09). Armelin : « si le
           POI est situé à droite de l'écran, il arrive que la fenêtre
           s'affiche hors champ et le bouton fermer est inaccessible ». La
           bulle s'ancre bien à l'OUVERTURE — c'est le déplacement de carte
           qui l'emmène ensuite hors écran, puisqu'elle suit son point. En
           ramenant le point sous le centre, la fiche a la place de s'ouvrir
           vers le haut et la croix reste sous le doigt. */
        carte.easeTo({
          center: [lieu.lon, lieu.lat], offset: [0, 120], duration: 350,
        });
      });
      carte.on('mouseenter', COUCHE, () => { carte.getCanvas().style.cursor = 'pointer'; });
      carte.on('mouseleave', COUCHE, () => { carte.getCanvas().style.cursor = ''; });
    } catch (e) {
      if (e instanceof Error && /style is not done loading/i.test(e.message)) return;
      throw e;
    }
  }
}

customElements.define('filtre-poi', FiltrePoi);
