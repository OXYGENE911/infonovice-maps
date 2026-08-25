// <panneau-poi> — les couches de points d'intérêt : carburants (avec prix),
// bornes de recharge, parkings. Trois cases ; chaque couche active se charge
// pour la VUE COURANTE et se recharge au déplacement — débounce 500 ms,
// appel précédent annulé, et SEUIL de changement de vue : le suivi GPS ou la
// molette ne rechargent pas une vue quasi identique. Jamais sous le zoom 12 :
// la France entière serait demandée pour rien, et les quotas publics sont un
// bien commun. Le choix des couches est persisté en IndexedDB, comme le fond.
//
// Les popups sont construites en textContent EXCLUSIVEMENT : adresses, noms
// de stations et communes viennent de services externes (règle du projet).
// Leurs données voyagent DANS les propriétés des features — jamais par indice
// vers un tableau vivant, qu'un rechargement rendrait périmé (revue du 22/08).
import type { Map as CarteMapLibre, GeoJSONSource, MapGeoJSONFeature } from 'maplibre-gl';
import { Popup } from 'maplibre-gl';
import { lirePreference, ecrirePreference } from '../lib/stockage';
import {
  chargerCarburants, chargerBornes, chargerParkings, vueAChange,
  PRISES, type ClePrise, type FiltresBornes,
  type Bbox,
} from '../lib/poi';

export const PREF_POI = 'poi';
/** Les filtres de bornes vivent à part : ils survivent au décochage de la couche. */
export const PREF_FILTRES = 'poi-filtres-bornes';
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
  #filtres: FiltresBornes = {};
  /* LA RESTAURATION NE DOIT JAMAIS ÉCRASER UN CHOIX DÉJÀ FAIT. La lecture
     IndexedDB est asynchrone : un usager rapide — ou un test — peut régler un
     filtre AVANT qu'elle se résolve, et sans ce drapeau son réglage était
     silencieusement remplacé par la valeur mémorisée. Attrapé par un parcours
     E2E qui lisait l'URL émise, jamais par l'œil. */
  #filtresTouches = false;
  #controleurs: Partial<Record<Couche, AbortController>> = {};
  /** La bbox pour laquelle chaque couche a été chargée — le seuil de vue. */
  #chargee: Partial<Record<Couche, Bbox>> = {};
  #erreurs: Partial<Record<Couche, true>> = {};
  #carburants: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
  #bornes: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
  #parkings: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
  #montres: Partial<Record<Couche, number>> = {};
  #totaux: Partial<Record<Couche, number>> = {};
  #minuteur: ReturnType<typeof setTimeout> | undefined;
  #popup: Popup | null = null;
  #popupDe: Couche | null = null;

  /* Posé UNE fois à l'assemblage, pour la vie de l'application : le panneau
     n'est jamais détruit, on ne s'encombre pas d'un désabonnement (décision
     tracée — revue du 22/08). */
  set carte(c: CarteMapLibre) {
    if (this.#carte) return;
    this.#carte = c;
    c.on('moveend', () => {
      if (this.#actives.size === 0) return;
      clearTimeout(this.#minuteur);
      this.#minuteur = setTimeout(() => { this.#rechargerActives(); }, 500);
    });
    // setStyle détruit les sources : on repose données ET couches (le même
    // contrat que le tracé d'itinéraire).
    c.on('style.load', () => { this.#poserTout(); });
    /* Un clic peut toucher PLUSIEURS couches superposées (un cercle posé sur
       un polygone de parking) : le premier gestionnaire REVENDIQUE l'événement,
       les suivants s'effacent — et les points, enregistrés d'abord, gagnent
       sur les surfaces. */
    for (const couche of ['carburants', 'bornes'] as const) {
      c.on('click', `poi-${couche}`, (e) => {
        // Marque posée sur l'ÉVÉNEMENT NATIF (et non dans un champ privé) :
        // les autres couches — trafic compris — la voient aussi, alors qu'un
        // champ d'instance ne protégeait que de soi-même (revue du 22/08).
        const natif = e.originalEvent as Event & { __clicPris?: boolean };
        if (natif.__clicPris) return;
        natif.__clicPris = true;
        this.#ouvrirPopup(couche, e.features ?? []);
      });
      c.on('mouseenter', `poi-${couche}`, () => { c.getCanvas().style.cursor = 'pointer'; });
      c.on('mouseleave', `poi-${couche}`, () => { c.getCanvas().style.cursor = ''; });
    }
    c.on('click', 'poi-parkings-fond', (e) => {
      const natif = e.originalEvent as Event & { __clicPris?: boolean };
      if (natif.__clicPris) return;
      natif.__clicPris = true;
      this.#popupParking(e.lngLat, e.features ?? []);
    });
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

        <!-- LES FILTRES DE BORNES NE PARAISSENT QUE COUCHE ACTIVE. Montrer des
             réglages qui ne s'appliquent à rien encombre sans informer. -->
        <fieldset class="poi-filtres" hidden>
          <legend>Filtrer les bornes</legend>
          <label class="poi-filtre-ligne">Puissance minimale
            <select class="poi-puissance" aria-label="Puissance minimale des bornes">
              <option value="0">toutes</option>
              <option value="22">22 kW et plus</option>
              <option value="50">50 kW et plus</option>
              <option value="150">150 kW et plus</option>
              <option value="300">300 kW et plus</option>
            </select>
          </label>
          <p class="poi-filtre-titre">Connecteurs acceptés</p>
          ${PRISES.map((p) => `
            <label><input type="checkbox" class="poi-prise" value="${p.cle}"> ${p.libelle}</label>`).join('')}
          <p class="poi-filtre-note">Sans connecteur coché, toutes les bornes sont montrées.</p>
        </fieldset>
        <p class="poi-etat" role="status"></p>
      </details>`;
    /* LES FILTRES REPARTENT AU SERVICE, ils ne trient pas l'existant. Le
       portail plafonne à 100 enregistrements : filtrer ce qui est déjà chargé
       montrerait trois bornes CCS là où la zone en compte cinquante. */
    const surFiltre = (): void => {
      this.#filtresTouches = true;
      void ecrirePreference(PREF_FILTRES, this.#filtres);
      // `force` : le seuil de vue ne doit pas avaler un changement de filtre.
      if (this.#actives.has('bornes')) void this.#charger('bornes', true);
    };
    this.querySelector<HTMLSelectElement>('.poi-puissance')?.addEventListener('change', (e) => {
      const v = Number((e.target as HTMLSelectElement).value);
      this.#filtres = { ...this.#filtres, puissanceMin: Number.isFinite(v) && v > 0 ? v : undefined };
      surFiltre();
    });
    this.querySelectorAll<HTMLInputElement>('.poi-prise').forEach((case_) => {
      case_.addEventListener('change', () => {
        const prises = [...this.querySelectorAll<HTMLInputElement>('.poi-prise:checked')]
          .map((c) => c.value as ClePrise);
        this.#filtres = { ...this.#filtres, prises };
        surFiltre();
      });
    });

    this.querySelectorAll('fieldset:not(.poi-filtres) input').forEach((case_) => {
      case_.addEventListener('change', () => {
        const couche = (case_ as HTMLInputElement).value as Couche;
        const coche = (case_ as HTMLInputElement).checked;
        if (coche) this.#actives.add(couche); else this.#actives.delete(couche);
        void ecrirePreference(PREF_POI, [...this.#actives]);
        this.#majVisibiliteFiltres();
        if (coche) void this.#charger(couche);
        else { this.#vider(couche); this.#etat(); }
      });
    });
    void lirePreference<unknown>(PREF_POI).then((memo) => {
      // Frontière système : la valeur relue se VALIDE (hasOwn, pas `in` — la
      // chaîne de prototypes laissait passer « constructor », revue du 22/08).
      const couches = Array.isArray(memo) ? memo : [];
      for (const couche of couches) {
        if (typeof couche !== 'string' || !Object.hasOwn(COUCHES, couche)) continue;
        this.#actives.add(couche as Couche);
        const case_ = this.querySelector(`input[value="${couche}"]`);
        if (case_) (case_ as HTMLInputElement).checked = true;
        void this.#charger(couche as Couche);
      }
      this.#majVisibiliteFiltres();
    });

    /* LES FILTRES SE RÉTABLISSENT AUSSI. Un réglage oublié entre deux visites
       est un réglage qu'on ne prend pas la peine de poser. La valeur relue se
       VALIDE : c'est une frontière système, comme les couches ci-dessus. */
    void lirePreference<unknown>(PREF_FILTRES).then((memo) => {
      if (this.#filtresTouches) return;
      const m = (memo ?? {}) as Record<string, unknown>;
      const puissance = Number(m['puissanceMin']);
      const prisesLues = Array.isArray(m['prises']) ? m['prises'] : [];
      const prises = prisesLues.filter(
        (v): v is ClePrise => typeof v === 'string' && PRISES.some((p) => p.cle === v));
      this.#filtres = {
        puissanceMin: Number.isFinite(puissance) && puissance > 0 ? puissance : undefined,
        prises,
      };
      const select = this.querySelector<HTMLSelectElement>('.poi-puissance');
      if (select) select.value = String(this.#filtres.puissanceMin ?? 0);
      for (const cle of prises) {
        const c = this.querySelector<HTMLInputElement>(`.poi-prise[value="${cle}"]`);
        if (c) c.checked = true;
      }
    });
  }

  /* Les filtres ne s'affichent qu'avec la couche qu'ils règlent. */
  #majVisibiliteFiltres(): void {
    const bloc = this.querySelector<HTMLElement>('.poi-filtres');
    if (bloc) bloc.hidden = !this.#actives.has('bornes');
  }

  #rechargerActives(): void {
    for (const couche of this.#actives) void this.#charger(couche);
  }

  /** Bbox de la vue, longitudes RAMENÉES dans [-180, 180] : MapLibre les rend
      « déroulées » sur les copies du monde. */
  #bbox(): Bbox {
    const b = this.#carte!.getBounds();
    const enrouler = (l: number): number => ((l + 180) % 360 + 360) % 360 - 180;
    const ouest = enrouler(b.getWest());
    const est = enrouler(b.getEast());
    // Vue à cheval sur l'antiméridien (rarissime à zoom ≥ 12) : on dégrade
    // en monde entier plutôt que d'envoyer une bbox inversée aux services.
    if (ouest > est) return { ouest: -180, sud: b.getSouth(), est: 180, nord: b.getNorth() };
    return { ouest, sud: b.getSouth(), est, nord: b.getNorth() };
  }

  async #charger(couche: Couche, force = false): Promise<void> {
    const carte = this.#carte;
    if (!carte || !this.#actives.has(couche)) return;
    if (carte.getZoom() < ZOOM_MIN) {
      this.#vider(couche);
      this.#etat('Zoomez pour afficher les points d’intérêt.');
      return;
    }
    const bbox = this.#bbox();
    /* LE SEUIL : une vue quasi identique ne se recharge pas — frugalité due
       aux API publiques. MAIS IL NE DOIT PAS BLOQUER CE QUI NE VIENT PAS DE LA
       VUE : changer un filtre ne déplace pas la carte, et sans cette porte
       l'usager cochait « CCS Combo » pour voir… exactement la même chose.
       Mesuré par un parcours E2E qui lit l'URL émise, pas par l'œil. */
    const deja = this.#chargee[couche];
    if (!force && deja && !vueAChange(deja, bbox)) return;
    this.#controleurs[couche]?.abort();
    const controleur = new AbortController();
    this.#controleurs[couche] = controleur;
    try {
      if (couche === 'carburants') {
        const c = await chargerCarburants(bbox, controleur.signal);
        if (controleur !== this.#controleurs[couche]) return;
        this.#carburants = {
          type: 'FeatureCollection',
          features: c.elements.map((p) => ({
            type: 'Feature',
            properties: { adresse: p.adresse, ville: p.ville, prix: JSON.stringify(p.prix) },
            geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
          })),
        };
        this.#montres.carburants = c.elements.length; this.#totaux.carburants = c.total;
      } else if (couche === 'bornes') {
        const c = await chargerBornes(bbox, controleur.signal, this.#filtres);
        if (controleur !== this.#controleurs[couche]) return;
        this.#bornes = {
          type: 'FeatureCollection',
          features: c.elements.map((p) => ({
            type: 'Feature',
            properties: {
              nom: p.nom, puissance: p.puissance, pdc: p.pdc, gratuit: p.gratuit,
              reseau: p.reseau, prises: p.prises.join(','),
            },
            geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
          })),
        };
        this.#montres.bornes = c.elements.length; this.#totaux.bornes = c.total;
      } else {
        const c = await chargerParkings(bbox, controleur.signal);
        if (controleur !== this.#controleurs[couche]) return;
        this.#parkings = c.collection;
        this.#montres.parkings = c.collection.features.length; this.#totaux.parkings = c.total;
      }
      delete this.#erreurs[couche];
      this.#chargee[couche] = bbox;
      this.#poserTout();
      this.#etat();
    } catch {
      if (controleur.signal.aborted) return;
      // Pas de données périmées sous un message de panne : la couche en échec
      // se PURGE, et l'état PAR COUCHE la dit indisponible — durablement, sans
      // écraser les compteurs des couches qui vont bien (revue du 22/08).
      this.#purger(couche);
      this.#erreurs[couche] = true;
      this.#poserTout();
      this.#etat();
    }
  }

  #purger(couche: Couche): void {
    const vide: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
    if (couche === 'carburants') this.#carburants = vide;
    else if (couche === 'bornes') this.#bornes = vide;
    else this.#parkings = vide;
    delete this.#totaux[couche];
    delete this.#montres[couche];
    delete this.#chargee[couche];
  }

  #vider(couche: Couche): void {
    this.#controleurs[couche]?.abort();
    this.#purger(couche);
    delete this.#erreurs[couche];
    if (this.#popupDe === couche) { this.#popup?.remove(); this.#popup = null; this.#popupDe = null; }
    this.#poserTout();
  }

  /** L'état, honnête : « 100 sur 11 950 » quand le plafond du portail mord,
      « indisponibles » tant qu'une couche est en panne. */
  #etat(message?: string): void {
    const p = this.querySelector('.poi-etat') as HTMLElement;
    if (message) { p.textContent = message; return; }
    const fr = (n: number): string => n.toLocaleString('fr-FR');
    const bouts: string[] = [];
    for (const couche of this.#actives) {
      if (this.#erreurs[couche]) { bouts.push(`${COUCHES[couche]} : indisponibles`); continue; }
      const total = this.#totaux[couche];
      const montres = this.#montres[couche];
      if (total === undefined || montres === undefined) continue;
      bouts.push(`${COUCHES[couche]} : ${montres < total ? `${fr(montres)} sur ${fr(total)}` : fr(montres)}`);
    }
    p.textContent = bouts.join(' · ');
  }

  /* ---- pose sur la carte (survit au changement de fond) ---- */

  #poserTout(): void {
    const carte = this.#carte;
    if (!carte) return;
    try {
      // Les surfaces d'abord, les points ensuite : les cercles restent
      // cliquables au-dessus des polygones, quel que soit l'ordre d'activation.
      this.#poserSource('poi-parkings', this.#parkings);
      this.#poserSource('poi-carburants', this.#carburants);
      this.#poserSource('poi-bornes', this.#bornes);
    } catch (e) {
      // Style en cours de chargement : style.load (branché dans `set carte`)
      // reposera tout — même contrat que le tracé d'itinéraire.
      if (e instanceof Error && /style is not done loading/i.test(e.message)) return;
      throw e;
    }
  }

  #poserSource(id: string, donnees: GeoJSON.FeatureCollection): void {
    const carte = this.#carte!;
    const source = carte.getSource(id) as GeoJSONSource | undefined;
    if (source) { source.setData(donnees); return; }
    carte.addSource(id, { type: 'geojson', data: donnees });
    if (id === 'poi-parkings') {
      carte.addLayer({
        id: 'poi-parkings-fond', type: 'fill', source: id,
        paint: { 'fill-color': COULEURS.parkings, 'fill-opacity': 0.22 },
      });
      carte.addLayer({
        id: 'poi-parkings-bord', type: 'line', source: id,
        paint: { 'line-color': COULEURS.parkings, 'line-width': 1.5 },
      });
      return;
    }
    const couche = id === 'poi-carburants' ? 'carburants' as const : 'bornes' as const;
    carte.addLayer({
      id, type: 'circle', source: id,
      paint: {
        'circle-radius': 7, 'circle-color': COULEURS[couche],
        'circle-stroke-width': 2, 'circle-stroke-color': '#FFFFFF',
      },
    });
  }

  /* ---- popups, en textContent : les libellés viennent de l'extérieur ---- */

  #monterPopup(couche: Couche, lngLat: { lng: number; lat: number }, contenu: HTMLElement): void {
    this.#popup?.remove();
    this.#popupDe = couche;
    this.#popup = new Popup({ closeButton: true, maxWidth: '260px' })
      .setLngLat(lngLat).setDOMContent(contenu).addTo(this.#carte!);
  }

  #ouvrirPopup(couche: 'carburants' | 'bornes', features: MapGeoJSONFeature[]): void {
    const f = features[0];
    if (!f || f.geometry.type !== 'Point') return;
    const p = f.properties ?? {};
    const [lng, lat] = f.geometry.coordinates as [number, number];
    const bloc = document.createElement('div');
    bloc.className = 'poi-popup';
    const titre = document.createElement('strong');
    if (couche === 'carburants') {
      titre.textContent = [p['adresse'], p['ville']].filter((v) => typeof v === 'string' && v).join(', ')
        || 'Station-service';
      bloc.append(titre);
      const liste = document.createElement('dl');
      let prix: unknown = [];
      try { prix = JSON.parse(String(p['prix'] ?? '[]')); } catch { /* propriété forgée : liste vide */ }
      for (const ligne of Array.isArray(prix) ? prix : []) {
        const [libelle, valeur] = ligne as [unknown, unknown];
        if (typeof libelle !== 'string' || typeof valeur !== 'number') continue;
        const dt = document.createElement('dt'); dt.textContent = libelle;
        const dd = document.createElement('dd');
        dd.textContent = `${valeur.toFixed(2).replace('.', ',')} €/L`;
        liste.append(dt, dd);
      }
      bloc.append(liste);
    } else {
      titre.textContent = typeof p['nom'] === 'string' && p['nom'] ? p['nom'] : 'Borne de recharge';
      bloc.append(titre);
      const detail = document.createElement('p');
      const puissance = Number(p['puissance']);
      const pdc = Number(p['pdc']);
      detail.textContent = [
        Number.isFinite(puissance) && puissance > 0 ? `${puissance} kW` : null,
        Number.isFinite(pdc) && pdc > 0 ? `${pdc} point${pdc > 1 ? 's' : ''} de charge` : null,
        p['gratuit'] === true ? 'gratuit' : null,
      ].filter(Boolean).join(' · ');
      bloc.append(detail);
    }
    this.#monterPopup(couche, { lng, lat }, bloc);
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
    // La popup s'ouvre là où l'usager a cliqué : un polygone n'a pas de
    // centre évident.
    this.#monterPopup('parkings', lngLat, bloc);
  }
}

customElements.define('panneau-poi', PanneauPoi);
