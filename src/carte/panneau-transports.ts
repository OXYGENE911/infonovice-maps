// <panneau-transports> — les véhicules de transport en commun, EN DIRECT.
//
// CE QUE LA COUCHE MONTRE : les bus, cars et trams dont le réseau publie la
// position en GTFS-RT, là où l'usager regarde. Elle ne montre ni horaires ni
// arrêts : ces données vivent dans des archives de plusieurs dizaines de Mo
// qu'aucun navigateur ne digère sans serveur (voir l'en-tête de
// src/lib/transports.ts — c'est écrit, pas tu).
//
// LE MODÈLE DE CHARGEMENT, ET POURQUOI. Les flux sont par RÉSEAU, pas par
// emprise : impossible de demander « les véhicules de ce rectangle ». On
// choisit donc les réseaux dont l'emprise touche la vue — trois au plus — et
// on ne redemande que si cette liste change ou si la cadence l'exige. Jamais
// sous le zoom 10 : plus loin, on solliciterait des services publics pour des
// points d'un pixel. Rien tant que la case n'est pas cochée ; plus rien dès
// que l'onglet passe en arrière-plan.
//
// Noms de lignes et étiquettes viennent des réseaux : ils entrent dans le DOM
// en textContent EXCLUSIVEMENT (règle du projet).
import type { Map as CarteMapLibre, GeoJSONSource, MapGeoJSONFeature } from 'maplibre-gl';
import { Popup } from 'maplibre-gl';
import { lirePreference, ecrirePreference } from '../lib/stockage';
import {
  ageDuFlux, chargerFlux, ErreurTransports, FRAICHEUR_MAX_S, INTERVALLE_MS,
  nombreDeReseaux, PLAFOND_RESEAUX, reseauxDansVue, vehiculesFrais,
  type Reseau, type Vehicule,
} from '../lib/transports';
import type { Bbox } from '../lib/poi';

export const PREF_TRANSPORTS = 'transports';
const SOURCE = 'transports';
const ZOOM_MIN = 10;

/* Une couleur par rang de réseau — trois suffisent, c'est le plafond. Prises
   dans les tokens de la maison, distinctes au daltonisme deutan (bleu, ambre,
   vert foncé), et toutes cerclées de blanc sur la carte. */
const COULEURS = ['#2272C4', '#E89C2C', '#1F7A55'];

interface ResultatVivant {
  reseau: Reseau; rang: number; ok: true;
  vehicules: Vehicule[]; tronque: boolean; age: number | null;
}
interface ResultatMuet { reseau: Reseau; rang: number; ok: false; motif: string; }
type Resultat = ResultatVivant | ResultatMuet;

export class PanneauTransports extends HTMLElement {
  #carte: CarteMapLibre | null = null;
  #actif = false;
  #minuteur: ReturnType<typeof setInterval> | undefined;
  #annulation: AbortController | null = null;
  #popup: Popup | null = null;
  #attente: ReturnType<typeof setTimeout> | undefined;
  /** Les réseaux servis au dernier chargement — pour ne pas redemander pour rien. */
  #serviIds = '';
  /** Instant du dernier chargement abouti, pour ne pas harceler la source. */
  #charge = 0;
  #donnees: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

  set carte(c: CarteMapLibre) {
    if (this.#carte) return;
    this.#carte = c;
    c.on('style.load', () => { this.#poser(); });
    c.on('moveend', () => {
      if (!this.#actif) return;
      clearTimeout(this.#attente);
      this.#attente = setTimeout(() => { void this.#charger(); }, 500);
    });
    c.on('click', 'transports-vehicules', (e) => {
      // Le clic est REVENDIQUÉ : plusieurs couches posent des gestionnaires
      // délégués, et un véhicule au-dessus d'un point de trafic ouvrait deux
      // popups (même contrat que panneau-trafic).
      const natif = e.originalEvent as Event & { __clicPris?: boolean };
      if (natif.__clicPris) return;
      natif.__clicPris = true;
      this.#ouvrirPopup(e.features ?? []);
    });
    c.on('mouseenter', 'transports-vehicules', () => { c.getCanvas().style.cursor = 'pointer'; });
    c.on('mouseleave', 'transports-vehicules', () => { c.getCanvas().style.cursor = ''; });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible' || !this.#actif) return;
      void this.#charger();
      this.#lancerCadence();
    });
  }

  connectedCallback(): void {
    if (this.firstElementChild) return;
    this.innerHTML = `
      <details class="transports">
        <summary aria-label="Afficher les transports en commun">Transports</summary>
        <fieldset>
          <legend>Transports en commun</legend>
          <label><input type="checkbox" class="transports-case">
            Véhicules en circulation</label>
          <p class="transports-etat" role="status"></p>
          <p class="transports-source">Positions publiées par les réseaux
            (GTFS-RT), relayées par transport.data.gouv.fr. Actualisées toutes
            les 30 secondes. Horaires et arrêts ne sont pas affichés : ils
            demanderaient un serveur, que ce site n’a pas.</p>
        </fieldset>
      </details>`;
    const case_ = this.querySelector('.transports-case') as HTMLInputElement;
    case_.addEventListener('change', () => {
      this.#actif = case_.checked;
      void ecrirePreference(PREF_TRANSPORTS, this.#actif);
      if (this.#actif) { void this.#charger(); this.#lancerCadence(); }
      else { this.#eteindre(); }
    });
    void lirePreference<unknown>(PREF_TRANSPORTS).then((memo) => {
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
    }, INTERVALLE_MS);
  }

  #eteindre(): void {
    clearInterval(this.#minuteur);
    this.#minuteur = undefined;
    clearTimeout(this.#attente);
    this.#annulation?.abort();
    this.#serviIds = '';
    this.#donnees = { type: 'FeatureCollection', features: [] };
    this.#popup?.remove();
    this.#popup = null;
    this.#poser();
    this.#etat('');
  }

  #etat(message: string): void {
    (this.querySelector('.transports-etat') as HTMLElement).textContent = message;
  }

  /** Bbox de la vue, longitudes ramenées dans [-180, 180] (même garde que les
      couches POI : MapLibre les rend « déroulées » sur les copies du monde). */
  #bbox(): Bbox {
    const b = this.#carte!.getBounds();
    const enrouler = (l: number): number => ((l + 180) % 360 + 360) % 360 - 180;
    const ouest = enrouler(b.getWest());
    const est = enrouler(b.getEast());
    if (ouest > est) return { ouest: -180, sud: b.getSouth(), est: 180, nord: b.getNorth() };
    return { ouest, sud: b.getSouth(), est, nord: b.getNorth() };
  }

  async #charger(): Promise<void> {
    const carte = this.#carte;
    if (!carte || !this.#actif) return;
    if (carte.getZoom() < ZOOM_MIN) {
      this.#vider();
      this.#etat('Approchez pour voir les véhicules en circulation.');
      return;
    }
    const vue = this.#bbox();
    const reseaux = reseauxDansVue(vue);
    if (reseaux.length === 0) {
      this.#vider();
      this.#etat('Aucun réseau ne publie le temps réel ici.');
      return;
    }

    /* LE FREIN. Déplacer la carte dans la même agglomération ne change pas la
       liste des réseaux : redemander à chaque `moveend` vaudrait des dizaines
       d'appels par minute à un service public qui ne publie que toutes les 20
       à 30 secondes. On ne repart donc que si la liste CHANGE (l'usager est
       passé à une autre ville) ou si la cadence est échue. */
    const ids = reseaux.map((r) => r.id).join('|');
    const age = this.#charge === 0 ? Infinity : Date.now() - this.#charge;
    if (ids === this.#serviIds && age < INTERVALLE_MS) return;

    this.#annulation?.abort();
    const annulation = new AbortController();
    this.#annulation = annulation;
    if (this.#donnees.features.length === 0) this.#etat('Chargement des véhicules…');

    const maintenant = Math.floor(Date.now() / 1000);
    const resultats = await Promise.all(reseaux.map(
      async (reseau, rang): Promise<Resultat> => {
        try {
          const flux = await chargerFlux(reseau, annulation.signal);
          return {
            reseau, rang, ok: true,
            vehicules: vehiculesFrais(flux, maintenant),
            tronque: flux.tronque,
            age: ageDuFlux(flux, maintenant),
          };
        } catch (e) {
          if (annulation.signal.aborted) throw e;
          return {
            reseau, rang, ok: false,
            motif: e instanceof ErreurTransports ? e.message : '',
          };
        }
      },
    )).catch((e: unknown) => {
      if (annulation.signal.aborted) return null;
      throw e;
    });
    if (resultats === null || annulation !== this.#annulation || !this.#actif) return;

    const vivants = resultats.filter((r): r is ResultatVivant => r.ok);
    this.#donnees = {
      type: 'FeatureCollection',
      features: vivants.flatMap((r) => r.vehicules.map((v) => ({
        type: 'Feature' as const,
        properties: {
          reseau: r.reseau.nom,
          couleur: COULEURS[r.rang % COULEURS.length]!,
          ligne: v.ligne ?? '', etiquette: v.etiquette ?? '',
          vitesse: v.vitesse ?? -1,
          age: v.horodate === null ? -1 : Math.max(0, maintenant - v.horodate),
        },
        geometry: { type: 'Point' as const, coordinates: [v.lon, v.lat] },
      }))),
    };
    this.#serviIds = ids;
    /* L'horloge du frein ne repart QUE si un réseau a répondu : quand tout est
       muet, l'actualisation suivante doit pouvoir réessayer sans attendre. */
    if (vivants.length > 0) this.#charge = Date.now();
    this.#poser();
    this.#etat(this.#resumer(vue, reseaux, resultats));
  }

  /** Le résumé DIT ce qui manque : les réseaux écartés par le plafond, ceux
      qui n'ont pas répondu, un flux tronqué, un flux qui a pris de l'âge. */
  #resumer(vue: Bbox, reseaux: Reseau[], resultats: Resultat[]): string {
    const vivants = resultats.filter((r): r is ResultatVivant => r.ok);
    const n = this.#donnees.features.length;
    const parts: string[] = [];
    parts.push(n === 0
      ? 'Aucun véhicule en circulation en ce moment'
      : `${n.toLocaleString('fr-FR')} véhicule${n > 1 ? 's' : ''} en circulation`);
    if (vivants.length > 0) parts.push(vivants.map((r) => r.reseau.nom).join(', '));

    const total = nombreDeReseaux(vue);
    const notes: string[] = [];
    if (total > reseaux.length) {
      notes.push(`${reseaux.length} réseaux affichés sur ${total} — plafond de ${PLAFOND_RESEAUX}`);
    }
    const muets = resultats.filter((r): r is ResultatMuet => !r.ok);
    if (muets.length > 0) {
      // Quand TOUT est muet, l'usager a besoin de la RAISON, pas d'une liste
      // de noms : c'est le seul cas où la carte ne montre rien du tout.
      notes.push(vivants.length === 0 && muets[0]!.motif
        ? muets[0]!.motif
        : `sans réponse : ${muets.map((r) => r.reseau.nom).join(', ')}`);
    }
    if (vivants.some((r) => r.tronque === true)) notes.push('liste écourtée, trop de véhicules');
    const ages = vivants.map((r) => r.age).filter((a): a is number => typeof a === 'number');
    if (ages.length > 0 && Math.max(...ages) > FRAICHEUR_MAX_S) {
      notes.push(`flux vieux de ${Math.round(Math.max(...ages) / 60)} min`);
    }
    return parts.join(' — ') + (notes.length > 0 ? ` (${notes.join(' ; ')})` : '');
  }

  #vider(): void {
    this.#donnees = { type: 'FeatureCollection', features: [] };
    this.#serviIds = '';
    this.#popup?.remove();
    this.#popup = null;
    this.#poser();
  }

  #poser(): void {
    const carte = this.#carte;
    if (!carte) return;
    try {
      const source = carte.getSource(SOURCE) as GeoJSONSource | undefined;
      if (source) { source.setData(this.#donnees); return; }
      carte.addSource(SOURCE, { type: 'geojson', data: this.#donnees });
      carte.addLayer({
        id: 'transports-vehicules', type: 'circle', source: SOURCE,
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 4, 14, 7, 17, 10],
          'circle-color': ['get', 'couleur'],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#FFFFFF',
          'circle-opacity': 0.95,
        },
      });
    } catch (e) {
      // Style en cours de chargement : style.load reposera (même contrat que
      // les autres couches).
      if (e instanceof Error && /style is not done loading/i.test(e.message)) return;
      throw e;
    }
  }

  #ouvrirPopup(features: MapGeoJSONFeature[]): void {
    const f = features[0];
    if (!f || f.geometry.type !== 'Point' || !this.#carte) return;
    const p = f.properties ?? {};
    const [lng, lat] = f.geometry.coordinates as [number, number];
    const texte = (clef: string): string =>
      (typeof p[clef] === 'string' ? p[clef] : '');
    const nombre = (clef: string): number =>
      (typeof p[clef] === 'number' ? p[clef] : -1);

    const bloc = document.createElement('div');
    bloc.className = 'transports-popup';
    const titre = document.createElement('strong');
    const ligne = texte('ligne');
    titre.textContent = ligne ? `Ligne ${ligne}` : 'Véhicule en circulation';
    bloc.append(titre);

    const etiquette = texte('etiquette');
    if (etiquette && etiquette !== ligne) {
      const p2 = document.createElement('p');
      p2.className = 'transports-detail';
      p2.textContent = etiquette;
      bloc.append(p2);
    }

    const faits: string[] = [texte('reseau')];
    const vitesse = nombre('vitesse');
    if (vitesse >= 0) faits.push(`${Math.round(vitesse * 3.6)} km/h`);
    const age = nombre('age');
    faits.push(age < 0 ? 'fraîcheur inconnue'
      : age < 60 ? 'vu à l’instant'
        : `vu il y a ${Math.round(age / 60)} min`);
    const meta = document.createElement('p');
    meta.className = 'transports-meta';
    meta.textContent = faits.filter(Boolean).join(' · ');
    bloc.append(meta);

    this.#popup?.remove();
    this.#popup = new Popup({ closeButton: true, closeOnClick: false, maxWidth: '280px' })
      .setLngLat([lng, lat]).setDOMContent(bloc).addTo(this.#carte);
  }
}

customElements.define('panneau-transports', PanneauTransports);
