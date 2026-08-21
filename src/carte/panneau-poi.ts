// <panneau-poi> — les couches de points d'intérêt : carburants (avec prix),
// bornes de recharge, parkings. Trois cases ; chaque couche active se charge
// pour la VUE COURANTE et se recharge au déplacement (débounce 500 ms, appel
// précédent annulé) — jamais en dessous du zoom 12 : sous ce seuil la France
// entière serait demandée pour rien, et les quotas publics sont un bien
// commun. Le choix des couches est persisté en IndexedDB, comme le fond.
//
// Les popups sont construites en textContent EXCLUSIVEMENT : adresses, noms
// de stations et d'enseignes viennent de services externes (règle du projet).
import type { Map as CarteMapLibre, GeoJSONSource, MapGeoJSONFeature } from 'maplibre-gl';
import { Popup } from 'maplibre-gl';
import { lirePreference, ecrirePreference } from '../lib/stockage';
import {
  chargerCarburants, chargerBornes, chargerParkings, ErreurPoi,
  type Bbox, type PoiCarburant, type PoiBorne,
} from '../lib/poi';

export const PREF_POI = 'poi';
const ZOOM_MIN = 12;

type Couche = 'carburants' | 'bornes' | 'parkings';
const COUCHES: Record<Couche, string> = {
  carburants: 'Carburants', bornes: 'Bornes électriques', parkings: 'Parkings',
};
const COULEURS: Record<Couche, string> = {
  carburants: '#E89C2C', bornes: '#3FA877', parkings: '#2272C4',
};

export class PanneauPoi extends HTMLElement {
  #carte: CarteMapLibre | null = null;
  #actives = new Set<Couche>();
  #controleurs: Partial<Record<Couche, AbortController>> = {};
  #carburants: PoiCarburant[] = [];
  #bornes: PoiBorne[] = [];
  #parkings: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
  #totaux: Partial<Record<Couche, number>> = {};
  #minuteur: ReturnType<typeof setTimeout> | undefined;
  #popup: Popup | null = null;

  set carte(c: CarteMapLibre) {
    this.#carte = c;
    c.on('moveend', () => {
      if (this.#actives.size === 0) return;
      clearTimeout(this.#minuteur);
      this.#minuteur = setTimeout(() => { this.#rechargerActives(); }, 500);
    });
    // setStyle détruit les sources : on repose données ET couches (le même
    // contrat que le tracé d'itinéraire).
    c.on('style.load', () => { this.#poserTout(); });
    for (const couche of ['carburants', 'bornes'] as const) {
      c.on('click', `poi-${couche}`, (e) => this.#ouvrirPopup(couche, e.features ?? []));
      c.on('mouseenter', `poi-${couche}`, () => { c.getCanvas().style.cursor = 'pointer'; });
      c.on('mouseleave', `poi-${couche}`, () => { c.getCanvas().style.cursor = ''; });
    }
    c.on('click', 'poi-parkings-fond', (e) => this.#popupParking(e.lngLat, e.features ?? []));
  }

  connectedCallback(): void {
    if (this.firstElementChild) return;
    this.innerHTML = `
      <details class="poi">
        <summary aria-label="Choisir les points d’intérêt">Autour</summary>
        <fieldset>
          <legend>Points d’intérêt</legend>
          ${(Object.keys(COUCHES) as Couche[]).map((c) => `
            <label><input type="checkbox" value="${c}"> ${COUCHES[c]}</label>`).join('')}
        </fieldset>
        <p class="poi-etat" role="status"></p>
      </details>`;
    this.querySelectorAll('input').forEach((case_) => {
      case_.addEventListener('change', () => {
        const couche = case_.value as Couche;
        if (case_.checked) this.#actives.add(couche); else this.#actives.delete(couche);
        void ecrirePreference(PREF_POI, [...this.#actives]);
        if (case_.checked) void this.#charger(couche);
        else { this.#vider(couche); this.#etat(); }
      });
    });
    void lirePreference<Couche[]>(PREF_POI).then((memo) => {
      for (const couche of memo ?? []) {
        if (!(couche in COUCHES)) continue;
        this.#actives.add(couche);
        const case_ = this.querySelector(`input[value="${couche}"]`);
        if (case_) (case_ as HTMLInputElement).checked = true;
        void this.#charger(couche);
      }
    });
  }

  #rechargerActives(): void {
    for (const couche of this.#actives) void this.#charger(couche);
  }

  #bbox(): Bbox {
    const b = this.#carte!.getBounds();
    return { ouest: b.getWest(), sud: b.getSouth(), est: b.getEast(), nord: b.getNorth() };
  }

  async #charger(couche: Couche): Promise<void> {
    const carte = this.#carte;
    if (!carte || !this.#actives.has(couche)) return;
    if (carte.getZoom() < ZOOM_MIN) {
      this.#vider(couche);
      this.#etat('Zoomez pour afficher les points d’intérêt.');
      return;
    }
    this.#controleurs[couche]?.abort();
    const controleur = new AbortController();
    this.#controleurs[couche] = controleur;
    try {
      const bbox = this.#bbox();
      if (couche === 'carburants') {
        const c = await chargerCarburants(bbox, controleur.signal);
        if (controleur !== this.#controleurs[couche]) return;
        this.#carburants = c.elements; this.#totaux.carburants = c.total;
      } else if (couche === 'bornes') {
        const c = await chargerBornes(bbox, controleur.signal);
        if (controleur !== this.#controleurs[couche]) return;
        this.#bornes = c.elements; this.#totaux.bornes = c.total;
      } else {
        const c = await chargerParkings(bbox, controleur.signal);
        if (controleur !== this.#controleurs[couche]) return;
        this.#parkings = c.collection; this.#totaux.parkings = c.total;
      }
      this.#poserTout();
      this.#etat();
    } catch (e) {
      if (controleur.signal.aborted) return;
      this.#etat(e instanceof ErreurPoi ? e.message : 'Points d’intérêt indisponibles pour le moment.');
    }
  }

  #vider(couche: Couche): void {
    this.#controleurs[couche]?.abort();
    if (couche === 'carburants') this.#carburants = [];
    else if (couche === 'bornes') this.#bornes = [];
    else this.#parkings = { type: 'FeatureCollection', features: [] };
    delete this.#totaux[couche];
    this.#popup?.remove();
    this.#poserTout();
  }

  /** L'état, honnête : « 100 sur 11 950 » quand le plafond du portail mord. */
  #etat(message?: string): void {
    const p = this.querySelector('.poi-etat') as HTMLElement;
    if (message) { p.textContent = message; return; }
    const bouts: string[] = [];
    for (const couche of this.#actives) {
      const total = this.#totaux[couche];
      if (total === undefined) continue;
      const montres = couche === 'carburants' ? this.#carburants.length
        : couche === 'bornes' ? this.#bornes.length : this.#parkings.features.length;
      bouts.push(`${COUCHES[couche]} : ${montres < total ? `${montres} sur ${total}` : montres}`);
    }
    p.textContent = bouts.join(' · ');
  }

  /* ---- pose sur la carte (survit au changement de fond) ---- */

  #poserTout(): void {
    const carte = this.#carte;
    if (!carte) return;
    try {
      this.#poserPoints('carburants', this.#carburants.map((p, i) => ({ lon: p.lon, lat: p.lat, i })));
      this.#poserPoints('bornes', this.#bornes.map((p, i) => ({ lon: p.lon, lat: p.lat, i })));
      this.#poserParkings();
    } catch (e) {
      // Style en cours de chargement : style.load (branché dans `set carte`)
      // reposera tout — même contrat que le tracé d'itinéraire.
      if (e instanceof Error && /style is not done loading/i.test(e.message)) return;
      throw e;
    }
  }

  #poserPoints(couche: 'carburants' | 'bornes', points: { lon: number; lat: number; i: number }[]): void {
    const carte = this.#carte!;
    const donnees: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: points.map((p) => ({
        type: 'Feature', properties: { i: p.i },
        geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
      })),
    };
    const source = carte.getSource(`poi-${couche}`) as GeoJSONSource | undefined;
    if (source) { source.setData(donnees); return; }
    carte.addSource(`poi-${couche}`, { type: 'geojson', data: donnees });
    carte.addLayer({
      id: `poi-${couche}`, type: 'circle', source: `poi-${couche}`,
      paint: {
        'circle-radius': 7, 'circle-color': COULEURS[couche],
        'circle-stroke-width': 2, 'circle-stroke-color': '#FFFFFF',
      },
    });
  }

  #poserParkings(): void {
    const carte = this.#carte!;
    const source = carte.getSource('poi-parkings') as GeoJSONSource | undefined;
    if (source) { source.setData(this.#parkings); return; }
    carte.addSource('poi-parkings', { type: 'geojson', data: this.#parkings });
    carte.addLayer({
      id: 'poi-parkings-fond', type: 'fill', source: 'poi-parkings',
      paint: { 'fill-color': COULEURS.parkings, 'fill-opacity': 0.22 },
    });
    carte.addLayer({
      id: 'poi-parkings-bord', type: 'line', source: 'poi-parkings',
      paint: { 'line-color': COULEURS.parkings, 'line-width': 1.5 },
    });
  }

  /* ---- popups, en textContent : les libellés viennent de l'extérieur ---- */

  #monterPopup(lngLat: { lng: number; lat: number }, contenu: HTMLElement): void {
    this.#popup?.remove();
    this.#popup = new Popup({ closeButton: true, maxWidth: '260px' })
      .setLngLat(lngLat).setDOMContent(contenu).addTo(this.#carte!);
  }

  #ouvrirPopup(couche: 'carburants' | 'bornes', features: MapGeoJSONFeature[]): void {
    const f = features[0];
    if (!f || f.geometry.type !== 'Point') return;
    const i = Number(f.properties?.['i']);
    const [lng, lat] = f.geometry.coordinates as [number, number];
    const bloc = document.createElement('div');
    bloc.className = 'poi-popup';
    const titre = document.createElement('strong');
    if (couche === 'carburants') {
      const station = this.#carburants[i];
      if (!station) return;
      titre.textContent = [station.adresse, station.ville].filter(Boolean).join(', ') || 'Station-service';
      bloc.append(titre);
      const liste = document.createElement('dl');
      for (const [libelle, valeur] of station.prix) {
        const dt = document.createElement('dt'); dt.textContent = libelle;
        const dd = document.createElement('dd');
        dd.textContent = `${valeur.toFixed(2).replace('.', ',')} €/L`;
        liste.append(dt, dd);
      }
      bloc.append(liste);
    } else {
      const borne = this.#bornes[i];
      if (!borne) return;
      titre.textContent = borne.nom;
      bloc.append(titre);
      const detail = document.createElement('p');
      detail.textContent = [
        borne.puissance ? `${borne.puissance} kW` : null,
        borne.pdc ? `${borne.pdc} point${borne.pdc > 1 ? 's' : ''} de charge` : null,
        borne.gratuit === true ? 'gratuit' : null,
      ].filter(Boolean).join(' · ');
      bloc.append(detail);
    }
    this.#monterPopup({ lng, lat }, bloc);
  }

  #popupParking(lngLat: { lng: number; lat: number }, features: MapGeoJSONFeature[]): void {
    const f = features[0];
    if (!f) return;
    const p = f.properties ?? {};
    const bloc = document.createElement('div');
    bloc.className = 'poi-popup';
    const titre = document.createElement('strong');
    titre.textContent = 'Parking';
    const detail = document.createElement('p');
    const surf = Number(p['surfm2']);
    detail.textContent = [
      Number.isFinite(surf) && surf > 0 ? `${Math.round(surf)} m²` : null,
      typeof p['nomcom'] === 'string' ? p['nomcom'] : null,
    ].filter(Boolean).join(' · ');
    bloc.append(titre, detail);
    // La popup s'ouvre là où l'usager a cliqué (le polygone n'a pas de centre
    // évident, et le clic est déjà le bon endroit).
    this.#monterPopup(lngLat, bloc);
  }
}

customElements.define('panneau-poi', PanneauPoi);
