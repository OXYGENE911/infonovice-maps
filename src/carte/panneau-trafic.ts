// <panneau-trafic> — les événements routiers de toute la France (Bison Futé).
//
// UN MODÈLE DE CHARGEMENT DIFFÉRENT DES POI, et c'est voulu : la couche est
// NATIONALE et légère (~100 Ko), donc on la charge en entier, une fois, sans
// condition de zoom — elle a du sens à l'échelle du pays, où les POI n'en
// auraient aucun. Elle se rafraîchit toutes les trois minutes, la cadence du
// producteur, mais SEULEMENT si la couche est active ET l'onglet visible :
// une carte oubliée dans un onglet d'arrière-plan n'interroge personne.
//
// Le détail d'un événement (numéro de route, sens, dates, description) n'est
// demandé qu'au clic, et son contenu est posé en textContent : il arrive avec
// du HTML, que le module de domaine réduit en texte.
import type { Map as CarteMapLibre, GeoJSONSource, MapGeoJSONFeature } from 'maplibre-gl';
import { Popup } from 'maplibre-gl';
import { lirePreference, ecrirePreference } from '../lib/stockage';
import { pictoMenu } from './icone-menu';
import {
  chargerTrafic, chargerDetail, libelleType, couleurType, ErreurTrafic,
  type EvenementRoute,
} from '../lib/trafic';

export const PREF_TRAFIC = 'trafic';
const SOURCE = 'trafic';
const CADENCE_MS = 3 * 60 * 1000;

export class PanneauTrafic extends HTMLElement {
  #carte: CarteMapLibre | null = null;
  #actif = false;
  #evenements: EvenementRoute[] = [];
  #minuteur: ReturnType<typeof setInterval> | undefined;
  #annulation: AbortController | null = null;
  #popup: Popup | null = null;
  /** Instant du dernier chargement RÉUSSI, pour ne pas harceler la source. */
  #charge = 0;

  set carte(c: CarteMapLibre) {
    if (this.#carte) return;
    this.#carte = c;
    // setStyle détruit les sources : on repose (même contrat que les autres).
    c.on('style.load', () => { this.#poser(); });
    c.on('click', 'trafic-points', (e) => {
      // Le clic est REVENDIQUÉ : les couches POI posent leurs propres
      // gestionnaires délégués, et un point de trafic sur un polygone de
      // parking déclenchait les deux popups (revue du 22/08). La marque vit
      // sur l'événement natif, donc elle traverse les composants.
      const natif = e.originalEvent as Event & { __clicPris?: boolean };
      if (natif.__clicPris) return;
      natif.__clicPris = true;
      void this.#ouvrirPopup(e.features ?? []);
    });
    c.on('mouseenter', 'trafic-points', () => { c.getCanvas().style.cursor = 'pointer'; });
    c.on('mouseleave', 'trafic-points', () => { c.getCanvas().style.cursor = ''; });
    /* Un onglet caché ne consomme rien ; au retour, on rattrape — MAIS
       seulement si la donnée a vieilli. Sans ce garde, dix bascules d'onglet
       (ou dix déverrouillages de téléphone) valaient vingt requêtes à un
       service public qui ne publie que toutes les 3 minutes, et chaque
       bascule annulait le chargement en cours (revue du 22/08). */
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible' || !this.#actif) return;
      const age = this.#charge ? Date.now() - this.#charge : Infinity;
      if (age < CADENCE_MS) return;
      void this.#charger();
      this.#lancerCadence(); // rephasé : le prochain tic part de maintenant
    });
  }

  connectedCallback(): void {
    if (this.firstElementChild) return;
    this.innerHTML = `
      <details class="trafic">
        <summary aria-label="Afficher l’info trafic">${pictoMenu('trafic')}Trafic</summary>
        <fieldset>
          <legend>Info trafic</legend>
          <label><input type="checkbox" class="trafic-case">
            Événements routiers (France)</label>
          <p class="trafic-etat" role="status"></p>
          <p class="trafic-source">Source : Bison Futé — ministère chargé des
            transports. Actualisé toutes les 3 minutes.</p>
        </fieldset>
      </details>`;
    const case_ = this.querySelector('.trafic-case') as HTMLInputElement;
    case_.addEventListener('change', () => {
      this.#actif = case_.checked;
      void ecrirePreference(PREF_TRAFIC, this.#actif);
      if (this.#actif) { void this.#charger(); this.#lancerCadence(); }
      else { this.#eteindre(); }
    });
    void lirePreference<unknown>(PREF_TRAFIC).then((memo) => {
      if (memo !== true) return;
      this.#actif = true;
      case_.checked = true;
      void this.#charger();
      this.#lancerCadence();
    });
  }

  #lancerCadence(): void {
    clearInterval(this.#minuteur);
    this.#minuteur = setInterval(() => {
      if (this.#actif && document.visibilityState === 'visible') void this.#charger();
    }, CADENCE_MS);
  }

  #eteindre(): void {
    clearInterval(this.#minuteur);
    this.#minuteur = undefined;
    this.#annulation?.abort();
    this.#evenements = [];
    this.#charge = 0;
    this.#popup?.remove();
    this.#popup = null;
    this.#poser();
    this.#etat('');
  }

  #etat(message: string): void {
    (this.querySelector('.trafic-etat') as HTMLElement).textContent = message;
  }

  async #charger(): Promise<void> {
    if (!this.#actif) return;
    this.#annulation?.abort();
    const annulation = new AbortController();
    this.#annulation = annulation;
    if (this.#evenements.length === 0) this.#etat('Chargement de l’info trafic…');
    try {
      const evenements = await chargerTrafic(annulation.signal);
      if (annulation !== this.#annulation || !this.#actif) return;
      this.#evenements = evenements;
      this.#charge = Date.now();
      this.#poser();
      const n = evenements.length;
      this.#etat(`${n.toLocaleString('fr-FR')} événement${n > 1 ? 's' : ''} en cours`);
    } catch (e) {
      if (annulation.signal.aborted) return;
      // Les événements déjà posés restent : une actualisation ratée ne doit
      // pas effacer une carte qui marchait il y a trois minutes — mais l'état
      // le dit.
      this.#etat(e instanceof ErreurTrafic ? e.message : 'Info trafic indisponible pour le moment.');
    }
  }

  #poser(): void {
    const carte = this.#carte;
    if (!carte) return;
    const donnees: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: this.#evenements.map((e) => ({
        type: 'Feature',
        properties: {
          type: e.type, libelle: libelleType(e.type), couleur: couleurType(e.type),
          detail: e.detail ?? '', cree: e.cree ?? '', etat: e.etat,
        },
        geometry: { type: 'Point', coordinates: [e.lon, e.lat] },
      })),
    };
    try {
      const source = carte.getSource(SOURCE) as GeoJSONSource | undefined;
      if (source) { source.setData(donnees); return; }
      carte.addSource(SOURCE, { type: 'geojson', data: donnees });
      carte.addLayer({
        id: 'trafic-points', type: 'circle', source: SOURCE,
        paint: {
          // Plus la carte est large, plus les pastilles sont discrètes.
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 4, 10, 7, 14, 9],
          'circle-color': ['get', 'couleur'],
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#FFFFFF',
          'circle-opacity': 0.92,
        },
      });
    } catch (e) {
      // Style en cours de chargement : style.load reposera (même contrat que
      // le tracé d'itinéraire et les POI).
      if (e instanceof Error && /style is not done loading/i.test(e.message)) return;
      throw e;
    }
  }

  async #ouvrirPopup(features: MapGeoJSONFeature[]): Promise<void> {
    const f = features[0];
    if (!f || f.geometry.type !== 'Point' || !this.#carte) return;
    const p = f.properties ?? {};
    const [lng, lat] = f.geometry.coordinates as [number, number];

    const bloc = document.createElement('div');
    bloc.className = 'trafic-popup';
    const titre = document.createElement('strong');
    titre.textContent = typeof p['libelle'] === 'string' ? p['libelle'] : 'Événement routier';
    const corps = document.createElement('p');
    corps.className = 'trafic-detail';
    corps.textContent = 'Chargement du détail…';
    bloc.append(titre, corps);
    if (typeof p['cree'] === 'string' && p['cree']) {
      const date = document.createElement('p');
      date.className = 'trafic-date';
      date.textContent = `Signalé le ${p['cree']}`;
      bloc.append(date);
    }
    this.#popup?.remove();
    this.#popup = new Popup({ closeButton: true, closeOnClick: false, maxWidth: '300px' })
      .setLngLat([lng, lat]).setDOMContent(bloc).addTo(this.#carte);

    const chemin = typeof p['detail'] === 'string' ? p['detail'] : '';
    if (!chemin) { corps.textContent = 'Aucun détail publié pour cet événement.'; return; }
    try {
      const detail = await chargerDetail(chemin);
      // textContent EXCLUSIVEMENT : le service renvoie du HTML, réduit en
      // texte par versDetail — rien de tout cela n'entre dans le DOM en balises.
      if (!detail) { corps.textContent = 'Aucun détail publié pour cet événement.'; return; }
      if (detail.titre) titre.textContent = detail.titre;
      corps.textContent = detail.texte || 'Aucune précision publiée.';
    } catch {
      corps.textContent = 'Détail indisponible pour le moment.';
    }
  }
}

customElements.define('panneau-trafic', PanneauTrafic);
