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
// choisit donc les réseaux qui desservent la vue — trois au plus — et on ne
// redemande que si cette liste change ou si la cadence l'exige. Jamais sous
// le zoom 10 : plus loin, on solliciterait des services publics pour des
// points d'un pixel. Rien tant que la case n'est pas cochée ; plus rien dès
// que l'onglet passe en arrière-plan.
//
// LE FREIN EST COMPTABLE, PAS DÉCORATIF. Il compte les appels RÉELLEMENT
// émis, et vit indépendamment de l'allumage de la couche : la première
// écriture le remettait à zéro dans `#eteindre()` et `#vider()`, si bien que
// dix hésitations sur la case valaient 33 requêtes au lieu de 3, et six
// allers-retours de zoom 21 au lieu de 3 (mesuré). Il s'arme AVANT l'appel,
// pas après : sinon une salve en vol ne freinait rien, et un tic sur deux du
// minuteur se faisait avaler — la cadence réelle tombait à 60 s quand le
// volet en promettait 30.
//
// Noms de lignes et étiquettes viennent des réseaux : ils entrent dans le DOM
// en textContent EXCLUSIVEMENT (règle du projet).
import type { Map as CarteMapLibre, GeoJSONSource, MapGeoJSONFeature } from 'maplibre-gl';
import { Popup } from 'maplibre-gl';
import { lirePreference, ecrirePreference } from '../lib/stockage';
import {
  ageDuFlux, ageVehicule, aLArret, chargerFlux, ErreurTransports, INTERVALLE_MS,
  nombreDeReseaux, nomDeLigne, PLAFOND_RESEAUX, reseauxDansVue, trierParFraicheur,
  vitesseRenseignee, type Reseau, type Vehicule,
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
  vehicules: Vehicule[];
  /** Ce que le réseau a PUBLIÉ, avant le tri par fraîcheur. */
  publies: number;
  ages: (number | null)[];
  vitesseRenseignee: boolean;
  tronque: boolean;
  ageFlux: number | null;
  perimes: number; futurs: number; sansHorodate: number;
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
  /* LE FREIN — deux champs, et rien d'autre ne les touche. Ils décrivent les
     APPELS émis, pas ce qui est affiché : les remettre à zéro en éteignant la
     couche rouvrait le robinet. */
  #serviIds = '';
  #charge = 0;
  #donnees: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
  /* LA DERNIÈRE MOISSON ABOUTIE, gardée même quand la couche est éteinte.
     Sans elle, le frein — qui retient à juste titre l'APPEL — retenait aussi
     l'AFFICHAGE : décocher puis recocher la case laissait la carte vide et le
     volet muet pendant trente secondes (mesuré), et un aller-retour de zoom
     laissait « Approchez pour voir les véhicules » alors qu'on était approché.
     Le frein borne les requêtes, pas ce que l'usager a le droit de revoir. */
  #dernier: { donnees: GeoJSON.FeatureCollection; reseaux: Reseau[]; resultats: Resultat[] } | null = null;
  /** Le dernier message affiché, pour ne jamais laisser le volet sans un mot. */
  #dernierMessage = '';

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

  /** Éteindre efface ce qui est AFFICHÉ. Le frein garde la mémoire des appels
      déjà émis, et `#dernier` celle de la moisson : c'est tout leur intérêt. */
  #eteindre(): void {
    clearInterval(this.#minuteur);
    this.#minuteur = undefined;
    clearTimeout(this.#attente);
    this.#annulation?.abort();
    this.#donnees = { type: 'FeatureCollection', features: [] };
    this.#popup?.remove();
    this.#popup = null;
    this.#poser();
    this.#ecrire('');
  }

  /** Écrit dans le volet, sans rien mémoriser. */
  #ecrire(message: string): void {
    (this.querySelector('.transports-etat') as HTMLElement).textContent = message;
  }

  /** Écrit ET retient : c'est ce message qu'on redonnera si le frein retient
      l'appel suivant, plutôt que de laisser le volet muet. */
  #etat(message: string): void {
    this.#dernierMessage = message;
    this.#ecrire(message);
  }

  /** Repose la dernière moisson connue et redit ce qu'elle vaut POUR LA VUE
      COURANTE — l'usager a pu se déplacer depuis. */
  #reafficher(vue: Bbox): void {
    const d = this.#dernier;
    if (!d) { this.#ecrire(this.#dernierMessage); return; }
    this.#donnees = d.donnees;
    this.#poser();
    this.#etat(this.#resumer(vue, d.reseaux, d.resultats));
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
      // Message de VUE, pas de donnée : on ne le mémorise pas, sinon il
      // resservirait à contretemps une fois la carte rapprochée.
      this.#ecrire('Approchez pour voir les véhicules en circulation.');
      return;
    }
    const vue = this.#bbox();
    const reseaux = reseauxDansVue(vue);
    if (reseaux.length === 0) {
      this.#vider();
      this.#ecrire('Aucun réseau ne publie le temps réel ici.');
      return;
    }

    /* LE FREIN. Déplacer la carte dans la même agglomération ne change pas la
       liste des réseaux : redemander à chaque `moveend` vaudrait des dizaines
       d'appels par minute à un service public qui ne publie que toutes les 20
       à 30 secondes. On ne repart donc que si la liste CHANGE (l'usager est
       passé à une autre ville) ou si la cadence est échue. */
    const ids = reseaux.map((r) => r.id).join('|');
    const age = this.#charge === 0 ? Infinity : Date.now() - this.#charge;
    if (ids === this.#serviIds && age < INTERVALLE_MS) { this.#reafficher(vue); return; }
    /* ARMÉ AVANT L'APPEL, et quoi qu'il advienne. Après, une salve en vol ne
       freinait rien (cinq déplacements pendant un appel lent = 18 requêtes
       pour 3 réponses utiles), un échec général désarmait tout le frein — le
       service déjà en panne était martelé douze fois plus qu'un service sain —
       et un tic sur deux du minuteur tombait juste sous le seuil. */
    this.#serviIds = ids;
    this.#charge = Date.now();

    this.#annulation?.abort();
    const annulation = new AbortController();
    this.#annulation = annulation;
    if (this.#donnees.features.length === 0) this.#etat('Chargement des véhicules…');

    const maintenant = Math.floor(Date.now() / 1000);
    const resultats = await Promise.all(reseaux.map(
      async (reseau, rang): Promise<Resultat> => {
        try {
          const flux = await chargerFlux(reseau, annulation.signal);
          const tri = trierParFraicheur(flux, maintenant);
          return {
            reseau, rang, ok: true,
            vehicules: tri.frais,
            publies: flux.vehicules.length,
            ages: tri.frais.map((v) => ageVehicule(v, flux, maintenant)),
            vitesseRenseignee: vitesseRenseignee(tri.frais),
            tronque: flux.tronque,
            ageFlux: ageDuFlux(flux, maintenant),
            perimes: tri.perimes, futurs: tri.futurs, sansHorodate: tri.sansHorodate,
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
    /* AUCUN DÉDOUBLONNAGE ICI, et c'est voulu. Les seuls véritables doublons
       viennent des agrégats qui republient leurs membres, et ceux-là ne sont
       plus jamais choisis en même temps qu'eux (voir `reseauxDansVue`). Une
       clé par identifiant d'entité, elle, effaçait de VRAIS véhicules : deux
       réseaux quelconques numérotent « 3 » et « 4 » — onze bus réels perdus
       sur cinq paires de réseaux authentiquement distincts, mesuré en revue. */
    this.#donnees = {
      type: 'FeatureCollection',
      features: vivants.flatMap((r) => r.vehicules.map((v, i) => ({
        type: 'Feature' as const,
        properties: {
          reseau: r.reseau.nom,
          couleur: COULEURS[r.rang % COULEURS.length]!,
          ligne: nomDeLigne(v.ligne) ?? '',
          etiquette: v.etiquette ?? '',
          arret: aLArret(v, r.vitesseRenseignee),
          // -1 signifie « personne ne l'horodate ». Une horloge en avance
          // donne un âge négatif : c'est « à l'instant », pas « inconnu ».
          age: r.ages[i] === null || r.ages[i] === undefined
            ? -1 : Math.max(0, r.ages[i]!),
        },
        geometry: { type: 'Point' as const, coordinates: [v.lon, v.lat] },
      }))),
    };
    this.#dernier = { donnees: this.#donnees, reseaux, resultats };
    this.#poser();
    this.#etat(this.#resumer(vue, reseaux, resultats));
  }

  /** Combien de véhicules tombent DANS la vue — le nombre que l'usager peut
      compter à l'écran. Le flux, lui, couvre tout le réseau : annoncer 200
      véhicules quand un seul est visible n'apprend rien à personne. */
  #dansLaVue(vue: Bbox): number {
    return this.#donnees.features.filter((f) => {
      if (f.geometry.type !== 'Point') return false;
      const [lon, lat] = f.geometry.coordinates as [number, number];
      return lon >= vue.ouest && lon <= vue.est && lat >= vue.sud && lat <= vue.nord;
    }).length;
  }

  /** Le résumé DIT ce qu'il sait, et se tait sur ce qu'il ignore. */
  #resumer(vue: Bbox, reseaux: Reseau[], resultats: Resultat[]): string {
    const vivants = resultats.filter((r): r is ResultatVivant => r.ok);
    const muets = resultats.filter((r): r is ResultatMuet => !r.ok);

    /* AUCUN RÉSEAU N'A RÉPONDU : on ne peut RIEN dire des véhicules. La
       première écriture annonçait « Aucun véhicule en circulation » après un
       simple 404 — l'usager en concluait que les bus ne roulaient pas.
       Et on les nomme TOUS : n'en citer qu'un laissait croire que les autres
       allaient bien. */
    if (vivants.length === 0) {
      const noms = muets.map((m) => m.reseau.nom).join(', ');
      const motif = muets.find((m) => m.motif)?.motif;
      if (muets.length > 1) {
        return `Aucune réponse de ${noms} — le temps réel est indisponible pour le moment.`;
      }
      return motif ?? 'Le temps réel est indisponible pour le moment.';
    }

    const dansVue = this.#dansLaVue(vue);
    const total = this.#donnees.features.length;
    /* CE QUE LES RÉSEAUX ONT PUBLIÉ, avant notre propre tri. Sans ce chiffre,
       le résumé se contredisait dans la même phrase : « Aucun véhicule en
       circulation (2 positions trop anciennes, écartées) ». */
    const publies = vivants.reduce((s, r) => s + r.publies, 0);
    /* A-T-ON VRAIMENT TOUT DEMANDÉ ? Sinon on ne peut pas affirmer une absence :
       des réseaux muets, ou écartés par le plafond, peuvent avoir des bus ici. */
    const toutVu = muets.length === 0 && reseaux.length === nombreDeReseaux(vue);
    const parts: string[] = [];
    if (total === 0 && publies > 0) {
      // Le producteur annonce des bus, mais aucune position n'est récente.
      parts.push('Aucune position récente');
    } else if (total === 0) {
      parts.push(toutVu
        ? 'Aucun véhicule en circulation en ce moment'
        : 'Aucun véhicule chez les réseaux qui ont répondu');
    } else if (dansVue === total) {
      parts.push(`${total.toLocaleString('fr-FR')} véhicule${total > 1 ? 's' : ''} en circulation`);
    } else if (dansVue === 0) {
      parts.push(`Aucun véhicule dans cette vue, ${total.toLocaleString('fr-FR')} sur le réseau`);
    } else {
      parts.push(`${dansVue.toLocaleString('fr-FR')} véhicule${dansVue > 1 ? 's' : ''} dans la vue`
        + `, ${total.toLocaleString('fr-FR')} sur le réseau`);
    }
    parts.push(vivants.map((r) => r.reseau.nom).join(', '));

    const notes: string[] = [];
    const nbTotal = nombreDeReseaux(vue);
    if (nbTotal > reseaux.length) {
      notes.push(`${reseaux.length} réseaux sur ${nbTotal} — plafond de ${PLAFOND_RESEAUX}`);
    }
    if (muets.length > 0) notes.push(`sans réponse : ${muets.map((r) => r.reseau.nom).join(', ')}`);
    if (vivants.some((r) => r.tronque)) notes.push('liste écourtée, trop de véhicules');

    const futurs = vivants.reduce((s, r) => s + r.futurs, 0);
    if (futurs > 0) notes.push(`${futurs} position${futurs > 1 ? 's' : ''} datée${futurs > 1 ? 's' : ''} du futur, écartée${futurs > 1 ? 's' : ''}`);
    const perimes = vivants.reduce((s, r) => s + r.perimes, 0);
    if (perimes > 0) notes.push(`${perimes} position${perimes > 1 ? 's' : ''} trop ancienne${perimes > 1 ? 's' : ''}, écartée${perimes > 1 ? 's' : ''}`);
    if (vivants.some((r) => r.sansHorodate > 0)) notes.push('fraîcheur inconnue pour certaines');

    // L'horloge d'un producteur qui avance mérite d'être dite : c'est elle
    // qui explique des positions écartées, ou un « direct » qui ne l'est pas.
    const avance = Math.min(...vivants.map((r) => r.ageFlux ?? 0));
    if (avance < -60) notes.push(`horloge du réseau en avance de ${Math.round(-avance / 60)} min`);

    return parts.filter(Boolean).join(' — ') + (notes.length > 0 ? ` (${notes.join(' ; ')})` : '');
  }

  /** Vider n'efface QUE l'affichage — le frein garde sa mémoire. */
  #vider(): void {
    this.#donnees = { type: 'FeatureCollection', features: [] };
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
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 5, 14, 8, 17, 11],
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
    const texte = (clef: string): string => (typeof p[clef] === 'string' ? p[clef] : '');
    const nombre = (clef: string): number => (typeof p[clef] === 'number' ? p[clef] : -1);

    const bloc = document.createElement('div');
    bloc.className = 'transports-popup';
    const titre = document.createElement('strong');
    const ligne = texte('ligne');
    titre.textContent = ligne ? `Ligne ${ligne}` : 'Véhicule en circulation';
    bloc.append(titre);

    const etiquette = texte('etiquette');
    if (etiquette && etiquette !== ligne) {
      const detail = document.createElement('p');
      detail.className = 'transports-detail';
      detail.textContent = etiquette;
      bloc.append(detail);
    }

    const faits: string[] = [texte('reseau')];
    // Pas de vitesse chiffrée : l'unité publiée est indéchiffrable chez trois
    // réseaux sur neuf (voir src/lib/transports.ts). Zéro, en revanche, veut
    // dire la même chose dans toutes les unités.
    if (p['arret'] === true) faits.push('à l’arrêt');
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
