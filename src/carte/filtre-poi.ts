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
 * CE QU'IL NE FAIT PAS, ET C'EST DÉLIBÉRÉ : il ne cherche RIEN tout seul. Ni
 * au déplacement de la carte, ni au zoom. Overpass est tenu par des
 * bénévoles ; une carte qui interroge à chaque geste serait un abus, et
 * l'usager n'y gagnerait qu'une lenteur. On cherche AU CLIC, et le panneau
 * dit quand la vue a bougé depuis la dernière recherche.
 */
import type {
  Map as CarteMapLibre, GeoJSONSource, DataDrivenPropertyValueSpecification,
} from 'maplibre-gl';
import { Popup } from 'maplibre-gl';
import {
  CATEGORIES, urlFamilles, versLieux, PLAFOND_LIEUX, ErreurCategories,
  type LieuCategorie,
} from '../lib/categories';
import { lirePreference, ecrirePreference } from '../lib/stockage';

const SOURCE = 'filtre-poi';
const COUCHE = 'filtre-poi-points';

/** Les familles cochées survivent à la fermeture : c'est un réglage. */
export const PREF_FAMILLES = 'familles-poi';

/* SOUS LE ZOOM 13, ON NE CHERCHE PAS. L'emprise d'une région rendrait cent
   lieux au hasard — le plafond tombe au premier arrondissement traversé — et
   la carte serait un semis illisible. Un cran plus serré que les catégories
   du planificateur (12) : ici l'on cherche DOUZE familles à la fois. */
export const ZOOM_MIN_POI = 13;

export class FiltrePoi extends HTMLElement {
  #carte: CarteMapLibre | null = null;

  #actives = new Set<string>();

  #ouvert = false;

  /* LES CLASSES SONT PRÉFIXÉES `poi-filtre-…` LÀ OÙ LE PANNEAU DES SERVICES
     EN A DÉJÀ : `.poi-etat` nommait deux éléments différents, et un parcours
     a buté dessus avant l'usager. C'est la troisième collision de ce genre
     en deux jours — le préfixe se choisit d'avance, pas après. */

  /** L'emprise de la dernière recherche — pour dire que la vue a bougé. */
  #vueCherchee: string | null = null;

  connectedCallback(): void {
    this.innerHTML = `
      <button type="button" class="poi-bulle" aria-expanded="false"
        aria-label="Filtrer les lieux affichés sur la carte">
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M4 6.4h16M7 12h10M10 17.6h4"/>
        </svg>
      </button>
      <div class="poi-panneau" hidden role="group"
        aria-label="Lieux à afficher autour de vous">
        <p class="poi-panneau-titre">Autour de moi</p>
        <div class="poi-familles">
          ${CATEGORIES.map((c) => `
            <button type="button" class="poi-famille" data-cle="${c.cle}"
              aria-pressed="false" style="--teinte:${c.couleur}">
              <span class="poi-pastille" aria-hidden="true"></span>${c.libelle}
            </button>`).join('')}
        </div>
        <button type="button" class="poi-chercher">Chercher dans cette vue</button>
        <p class="poi-filtre-etat" role="status"></p>
      </div>`;

    const bulle = this.querySelector<HTMLButtonElement>('.poi-bulle')!;
    const panneau = this.querySelector<HTMLElement>('.poi-panneau')!;
    bulle.addEventListener('click', () => {
      this.#ouvert = !this.#ouvert;
      panneau.hidden = !this.#ouvert;
      bulle.setAttribute('aria-expanded', String(this.#ouvert));
      if (this.#ouvert) this.#majEtat();
    });

    for (const b of this.querySelectorAll<HTMLButtonElement>('.poi-famille')) {
      b.addEventListener('click', () => {
        const cle = b.dataset['cle']!;
        if (this.#actives.has(cle)) this.#actives.delete(cle);
        else this.#actives.add(cle);
        b.setAttribute('aria-pressed', String(this.#actives.has(cle)));
        void ecrirePreference(PREF_FAMILLES, [...this.#actives]);
        /* RIEN NE PART AU CLIC D'UNE PASTILLE : on coche ce qu'on veut voir,
           PUIS on cherche. Interroger à chaque case aurait fait douze
           requêtes pour une intention. */
        this.#majEtat();
      });
    }
    this.querySelector('.poi-chercher')?.addEventListener('click', () => {
      void this.#chercher();
    });

    void lirePreference<string[]>(PREF_FAMILLES).then((memo) => {
      if (!Array.isArray(memo)) return;
      for (const cle of memo) {
        if (CATEGORIES.some((c) => c.cle === cle)) this.#actives.add(cle);
      }
      for (const b of this.querySelectorAll<HTMLButtonElement>('.poi-famille')) {
        b.setAttribute('aria-pressed', String(this.#actives.has(b.dataset['cle']!)));
      }
      this.#majEtat();
    }).catch(() => { /* sans mémoire, on part de rien : c'est le défaut */ });
  }

  set carte(c: CarteMapLibre) {
    this.#carte = c;
    c.on('moveend', () => { this.#majEtat(); });
    c.on('style.load', () => { this.#poser(this.#lieux); });
  }

  #lieux: LieuCategorie[] = [];

  /** L'emprise courante, arrondie — deux vues identiques donnent la même clé. */
  #cleVue(): string {
    const b = this.#carte?.getBounds();
    if (!b) return '';
    return [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]
      .map((v) => v.toFixed(3)).join(',');
  }

  /**
   * Dit ce qu'on peut faire, et ce qui manque — en permanence.
   *
   * TROIS ÉTATS, TROIS PHRASES : trop loin (le zoom), rien de coché, ou la
   * vue a bougé depuis la dernière recherche. Un bouton qui ne dit pas
   * pourquoi il ne rend rien se prend pour une panne.
   */
  #majEtat(): void {
    const etat = this.querySelector<HTMLElement>('.poi-filtre-etat');
    const chercher = this.querySelector<HTMLButtonElement>('.poi-chercher');
    if (!etat || !chercher) return;
    const zoom = this.#carte?.getZoom() ?? 0;
    const tropLoin = zoom < ZOOM_MIN_POI;
    chercher.disabled = tropLoin || this.#actives.size === 0;
    if (tropLoin) {
      etat.textContent = 'Rapprochez-vous pour chercher autour de vous'
        + ` (zoom ${ZOOM_MIN_POI} au moins).`;
      return;
    }
    if (this.#actives.size === 0) {
      etat.textContent = 'Choisissez ce que vous voulez voir.';
      return;
    }
    if (this.#vueCherchee !== null && this.#vueCherchee !== this.#cleVue()) {
      etat.textContent = 'La vue a bougé — relancez la recherche.';
      return;
    }
    etat.textContent = this.#lieux.length > 0
      ? `${this.#lieux.length} lieu${this.#lieux.length > 1 ? 'x' : ''} affiché`
        + `${this.#lieux.length > 1 ? 's' : ''}.`
      : '';
  }

  async #chercher(): Promise<void> {
    const carte = this.#carte;
    const etat = this.querySelector<HTMLElement>('.poi-filtre-etat');
    if (!carte || !etat || this.#actives.size === 0) return;
    const b = carte.getBounds();
    etat.textContent = 'Recherche…';
    try {
      const r = await fetch(urlFamilles([...this.#actives], {
        ouest: b.getWest(), sud: b.getSouth(), est: b.getEast(), nord: b.getNorth(),
      }));
      if (!r.ok) throw new ErreurCategories('La recherche de lieux est indisponible.');
      const texte = await r.text();
      let lus: LieuCategorie[];
      try {
        lus = versLieux(JSON.parse(texte));
      } catch {
        throw new ErreurCategories('Le service OpenStreetMap est saturé.');
      }
      this.#lieux = lus.filter((l) => l.famille && this.#actives.has(l.famille));
      this.#vueCherchee = this.#cleVue();
      this.#poser(this.#lieux);
      etat.textContent = this.#lieux.length === 0
        ? 'Rien de recensé ici pour ce choix (source OpenStreetMap).'
        : `${this.#lieux.length} lieu${this.#lieux.length > 1 ? 'x' : ''}`
          + (lus.length >= PLAFOND_LIEUX ? ` (les ${PLAFOND_LIEUX} premiers)` : '')
          + ' — la liste ne suit pas la carte.';
    } catch (e) {
      etat.textContent = e instanceof ErreurCategories
        ? e.message : 'La recherche de lieux est indisponible.';
    }
  }

  /** Pose les lieux — un point par lieu, la couleur de sa famille. */
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
        },
        geometry: { type: 'Point' as const, coordinates: [l.lon, l.lat] },
      })),
    };
    try {
      const existante = carte.getSource(SOURCE) as GeoJSONSource | undefined;
      if (existante) { existante.setData(donnees); return; }
      carte.addSource(SOURCE, { type: 'geojson', data: donnees });
      carte.addLayer({
        id: COUCHE, type: 'circle', source: SOURCE,
        paint: {
          /* UNE COULEUR PAR FAMILLE, lue sur la donnée : douze couches
             auraient douze fois les mêmes réglages à corriger. */
          /* Le typage de MapLibre exige une expression LITTÉRALE : un
             `...spread` ne lui prouve pas qu'il y a au moins un cas. On la
             construit donc, et l'on affirme la forme — la donnée reste celle
             des familles, source unique des couleurs. */
          'circle-color': [
            'match', ['get', 'famille'],
            ...CATEGORIES.flatMap((c) => [c.cle, c.couleur]),
            '#5F5E5A',
          ] as unknown as DataDrivenPropertyValueSpecification<string>,
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 4, 17, 8],
          'circle-stroke-width': 1.6,
          'circle-stroke-color': '#FFFFFF',
        },
      });
      /* LE NOM AU CLIC, ET NON EN PERMANENCE : cent étiquettes sur une vue
         de centre-ville cachent la carte qu'on essaie de lire. */
      carte.on('click', COUCHE, (e) => {
        const p = e.features?.[0]?.properties as
          { nom?: string; libelle?: string } | undefined;
        if (!p) return;
        const titre = p.nom && p.nom !== '' ? p.nom : (p.libelle ?? 'Lieu');
        const sousTitre = p.nom && p.nom !== '' ? (p.libelle ?? '') : '';
        const bulle = document.createElement('div');
        bulle.className = 'poi-bulle-lieu';
        const h = document.createElement('p');
        h.className = 'poi-bulle-nom';
        h.textContent = titre;
        bulle.append(h);
        if (sousTitre !== '') {
          const s = document.createElement('p');
          s.className = 'poi-bulle-type';
          s.textContent = sousTitre;
          bulle.append(s);
        }
        new Popup({ closeButton: true, closeOnClick: true, maxWidth: '240px' })
          .setLngLat(e.lngLat).setDOMContent(bulle).addTo(carte);
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
