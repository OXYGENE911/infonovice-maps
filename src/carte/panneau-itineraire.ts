// <panneau-itineraire> — le planificateur A→B. Deux champs d'adresse (le
// composant de recherche est RÉUTILISÉ, pas dupliqué), deux profils, le
// résultat en distance/durée, et le tracé sur la carte.
//
// LE TRACÉ SURVIT AU CHANGEMENT DE FOND : `setStyle` (sélecteur de fonds)
// détruit toutes les sources ajoutées. Le panneau garde donc le dernier
// itinéraire et le repose à chaque `style.load` — sans cela, basculer en
// satellite effacerait silencieusement le trajet qu'on vient de calculer.
import type { Map as CarteMapLibre, GeoJSONSource } from 'maplibre-gl';
import { Marker } from 'maplibre-gl';
import { RechercheAdresse } from './recherche';
import { EtapesItineraire } from './etapes-itineraire';
import { calculerItineraire, formaterDistance, formaterDuree, PROFILS, EVITEMENTS, ErreurItineraire, type Profil, type Itineraire, type Eviter } from '../lib/itineraire';
import type { PointGeo } from '../lib/coordonnees';
import type { ResultatAdresse } from '../lib/adresse';
import { versGPX, versKML, telecharger } from '../lib/trace';
import { versFragment, depuisFragment } from '../lib/partage-url';
import { profilItineraire, versTraceSVG, denivele, ErreurAltimetrie } from '../lib/altimetrie';
import { etapesItineraire, ErreurFeuille, type EtapeRoute } from '../lib/feuille-de-route';
import { chercherLeLongDuTrajet, type Categorie, type SurLeTrajet } from '../lib/le-long-du-trajet';
import { planifierArrets, type PlanRecharge } from '../lib/arrets';
import { lirePreference } from '../lib/stockage';
import { PREF_VEHICULE } from './panneau-vehicule';
import { ErreurPoi, type PoiCarburant, type PoiBorne } from '../lib/poi';
import { meteoA, phraseMeteo, symboleTemps, heureArrivee, formaterHeure, ECART_MAX_MINUTES, ErreurMeteo } from '../lib/meteo';

const SOURCE = 'itineraire';

export class PanneauItineraire extends HTMLElement {
  #carte: CarteMapLibre | null = null;
  #depart: PointGeo | null = null;
  #arrivee: PointGeo | null = null;
  #profil: Profil = 'car';
  #eviter = new Set<Eviter>();
  /** Jeton anti-réponses-hors-d'ordre de #calculer (voir le commentaire là-bas). */
  #sequence = 0;
  #dernier: Itineraire | null = null;
  /** Le cliché complet qui a produit #dernier — il vieillit AVEC lui : un
      recalcul raté laisse les deux cohérents entre eux. Feuille de route,
      lien partagé et marqueurs se lisent ICI, jamais dans l'état vivant. */
  #calculPour: {
    depart: PointGeo; arrivee: PointGeo; profil: Profil;
    etapes: PointGeo[]; eviter: Eviter[];
  } | null = null;
  /** Itinéraire dont le profil altimétrique est chargé (ou en cours). */
  #profilPour: Itineraire | null = null;
  /** Itinéraire dont la feuille de route est chargée (ou en cours). */
  #feuillePour: Itineraire | null = null;
  /** Itinéraire dont la recherche « sur le trajet » est faite (ou en cours). */
  #trajetPour: Itineraire | null = null;
  #rechargePour: Itineraire | null = null;
  #annulationRecharge: AbortController | null = null;
  /** Itinéraire dont la météo d'arrivée est chargée (ou en cours), et QUAND :
      un bulletin d'arrivée périme avec l'horloge, pas avec l'itinéraire. */
  #meteoPour: Itineraire | null = null;
  #meteoLe: Date | null = null;
  #annulationTrajet: AbortController | null = null;
  #marqueursTrajet: Marker[] = [];
  /* LES ARRÊTS ONT LEURS PROPRES MARQUEURS. Les mêler à ceux de « sur le
     trajet » ferait disparaître un plan de recharge dès qu'on cherche une
     station-service — deux fonctions distinctes, deux collections. */
  #marqueursArrets: Marker[] = [];
  #marqueurs: Marker[] = [];

  set carte(c: CarteMapLibre) {
    this.#carte = c;
    // Repose le tracé après chaque changement de style (fond).
    c.on('style.load', () => { if (this.#dernier) this.#tracer(this.#dernier); });
  }

  connectedCallback(): void {
    this.innerHTML = `
      <details class="iti">
        <summary aria-label="Ouvrir le planificateur d’itinéraire">Itinéraire</summary>
        <div class="iti-corps">
          <div class="iti-champs">
            <label>Départ<span class="iti-porte" data-role="depart"></span></label>
            <span class="iti-inter"></span>
            <label>Arrivée<span class="iti-porte" data-role="arrivee"></span></label>
          </div>
          <fieldset class="iti-eviter">
            <legend>Éviter</legend>
            ${(Object.keys(EVITEMENTS) as Eviter[]).map((v) => `
              <label class="iti-evite"><input type="checkbox" value="${v}"><span>${EVITEMENTS[v]}</span></label>`).join('')}
          </fieldset>
          <div class="iti-profils" role="radiogroup" aria-label="Mode de déplacement">
            ${(Object.keys(PROFILS) as Profil[]).map((p) => `
              <label class="iti-profil"><input type="radio" name="profil" value="${p}"
                ${p === this.#profil ? 'checked' : ''}><span>${PROFILS[p]}</span></label>`).join('')}
          </div>
          <p class="iti-resultat" role="status" hidden></p>
          <p class="iti-erreur" role="alert" hidden></p>
          <div class="iti-actions" hidden>
            <button type="button" class="iti-gpx">GPX</button>
            <button type="button" class="iti-kml">KML</button>
            <button type="button" class="iti-lien">Copier le lien</button>
            <button type="button" class="iti-effacer">Effacer</button>
          </div>
          <details class="iti-alti" hidden>
            <summary>Profil altimétrique</summary>
            <div class="iti-alti-corps" role="status"></div>
          </details>
          <details class="iti-feuille" hidden>
            <summary>Feuille de route</summary>
            <div class="iti-feuille-corps" role="status"></div>
          </details>
          <details class="iti-trajet" hidden>
            <summary>Sur le trajet</summary>
            <div class="iti-trajet-reglages">
              <label>Chercher
                <select class="trajet-quoi">
                  <option value="carburants">Stations-service</option>
                  <option value="bornes">Bornes de recharge</option>
                </select>
              </label>
              <label>à moins de
                <select class="trajet-rayon">
                  <option value="1000">1 km</option>
                  <option value="3000" selected>3 km</option>
                  <option value="10000">10 km</option>
                </select>
                du trajet
              </label>
            </div>
            <div class="iti-trajet-corps" role="status"></div>
          </details>
          <details class="iti-meteo" hidden>
            <summary>Météo à l’arrivée</summary>
            <div class="iti-meteo-corps" role="status"></div>
          </details>
          <details class="iti-recharge" hidden>
            <summary>Arrêts de recharge</summary>
            <div class="iti-recharge-corps" role="status"></div>
          </details>
        </div>
      </details>`;

    for (const role of ['depart', 'arrivee'] as const) {
      const champ = new RechercheAdresse();
      champ.surSelection = (r: ResultatAdresse) => {
        if (role === 'depart') this.#depart = r; else this.#arrivee = r;
        void this.#calculer();
      };
      this.querySelector(`[data-role="${role}"]`)?.appendChild(champ);
    }
    const etapes = new EtapesItineraire();
    etapes.addEventListener('etapes-changees', () => { void this.#calculer(); });
    this.querySelector('.iti-inter')?.appendChild(etapes);
    this.querySelectorAll('.iti-eviter input').forEach((c) => {
      c.addEventListener('change', () => {
        const case_ = c as HTMLInputElement;
        if (case_.checked) this.#eviter.add(case_.value as Eviter);
        else this.#eviter.delete(case_.value as Eviter);
        void this.#calculer();
      });
    });
    this.querySelectorAll('input[name="profil"]').forEach((r) => {
      r.addEventListener('change', () => {
        this.#profil = (r as HTMLInputElement).value as Profil;
        void this.#calculer();
      });
    });
    this.querySelector('.iti-effacer')?.addEventListener('click', () => this.#effacer());
    this.querySelector('.iti-gpx')?.addEventListener('click', () => {
      if (this.#dernier) telecharger(versGPX(this.#dernier, this.#nomTrajet()),
        'itineraire-infonovice.gpx', 'application/gpx+xml');
    });
    this.querySelector('.iti-kml')?.addEventListener('click', () => {
      if (this.#dernier) telecharger(versKML(this.#dernier, this.#nomTrajet()),
        'itineraire-infonovice.kml', 'application/vnd.google-earth.kml+xml');
    });
    this.querySelector('.iti-lien')?.addEventListener('click', (e) => {
      // Le lien décrit le trajet CALCULÉ (le cliché), pas l'état des champs :
      // entre les deux, l'usager a pu cocher ou saisir sans que rien n'aboutisse.
      const c = this.#calculPour;
      if (!c) return;
      const url = location.origin + location.pathname + versFragment(c);
      void navigator.clipboard.writeText(url);
      (e.target as HTMLElement).textContent = 'Lien copié !';
      setTimeout(() => { (e.target as HTMLElement).textContent = 'Copier le lien'; }, 1800);
    });
    /* LE PROFIL NE SE CALCULE QU'À LA DEMANDE : au plus un appel altimétrie
       par itinéraire, et seulement si l'utilisateur ouvre la section — les
       quotas de la Géoplateforme sont un bien commun. */
    this.querySelector('.iti-alti')?.addEventListener('toggle', () => {
      void this.#chargerProfil();
    });
    this.querySelector('.iti-feuille')?.addEventListener('toggle', () => {
      void this.#chargerFeuille();
    });
    this.querySelector('.iti-trajet')?.addEventListener('toggle', () => {
      void this.#chercherSurLeTrajet();
    });
    this.querySelector('.iti-meteo')?.addEventListener('toggle', () => {
      void this.#chargerMeteo();
    });
    this.querySelector('.iti-recharge')?.addEventListener('toggle', () => {
      void this.#planifierRecharge();
    });
    // Changer de catégorie ou de rayon relance la recherche — mais seulement
    // si la section est ouverte : un réglage invisible ne consomme rien.
    for (const cls of ['.trajet-quoi', '.trajet-rayon']) {
      this.querySelector(cls)?.addEventListener('change', () => {
        this.#trajetPour = null;
        void this.#chercherSurLeTrajet();
      });
    }

    /* UN LIEN PARTAGÉ S'OUVRE TOUT SEUL : le fragment porte l'itinéraire, on
       le rejoue à l'arrivée. Défensif — un fragment forgé rend null et la
       page s'ouvre normalement. */
    const partage = depuisFragment(location.hash);
    if (partage) {
      this.#depart = partage.depart;
      this.#arrivee = partage.arrivee;
      this.#profil = partage.profil;
      etapes.points = partage.etapes;
      this.#eviter = new Set(partage.eviter);
      for (const v of partage.eviter) {
        const case_ = this.querySelector(`.iti-eviter input[value="${v}"]`);
        if (case_) (case_ as HTMLInputElement).checked = true;
      }
      const radio = this.querySelector(`input[name="profil"][value="${partage.profil}"]`);
      if (radio) (radio as HTMLInputElement).checked = true;
      this.querySelector('details')?.setAttribute('open', '');
      // La carte n'est branchée qu'après la construction : on attend le tour
      // de boucle où `carte` est posée.
      queueMicrotask(() => { void this.#calculer(); });
    }
  }

  #nomTrajet(): string {
    return `Itinéraire Infonovice Maps (${PROFILS[this.#profil]})`;
  }

  /** Replie et vide les sections profil/feuille (cachées si `cachees`). */
  #reinitialiserSections(cachees: boolean): void {
    this.#trajetPour = null;
    this.#annulationTrajet?.abort();
    this.#rechargePour = null;
    this.#annulationRecharge?.abort();
    this.#meteoPour = null; this.#meteoLe = null;
    for (const cls of
      ['iti-alti', 'iti-feuille', 'iti-trajet', 'iti-meteo', 'iti-recharge'] as const) {
      const section = this.querySelector(`.${cls}`) as HTMLDetailsElement;
      section.hidden = cachees;
      section.open = false;
      (this.querySelector(`.${cls}-corps`) as HTMLElement).textContent = '';
    }
    this.#profilPour = null;
    this.#feuillePour = null;
  }

  /** La météo À L'HEURE D'ARRIVÉE estimée (départ maintenant + durée) : le
      temps qu'il fait là-bas en ce moment n'intéresse pas qui arrive dans
      cinq heures. À la demande, un seul appel par itinéraire. */
  async #chargerMeteo(): Promise<void> {
    const section = this.querySelector('.iti-meteo') as HTMLDetailsElement;
    const corps = this.querySelector('.iti-meteo-corps') as HTMLElement;
    const iti = this.#dernier;
    const cliche = this.#calculPour;
    if (!section.open || !iti || !cliche) return;
    /* LE BULLETIN NE SE FIGE PAS : il décrit « maintenant + durée », donc il
       PÉRIME avec l'horloge. Se contenter de « déjà calculé pour cet
       itinéraire » affichait, deux heures plus tard, une arrivée déjà passée
       (revue du 22/08). On rejoue passé un quart d'heure. */
    const maintenant = new Date();
    if (this.#meteoPour === iti
      && this.#meteoLe && maintenant.getTime() - this.#meteoLe.getTime() < 15 * 60_000) return;
    this.#meteoPour = iti;
    this.#meteoLe = maintenant;
    corps.textContent = 'Prévision en cours…';
    try {
      const arrivee = heureArrivee(iti.duree, maintenant);
      const m = await meteoA(cliche.arrivee.lon, cliche.arrivee.lat, arrivee);
      if (this.#dernier !== iti) return;
      corps.replaceChildren();
      // AU-DELÀ DE L'HORIZON, ON SE TAIT. Le service ne prévoit que trois
      // jours ; un trajet à pied de plusieurs jours retombait sur la dernière
      // heure connue, présentée comme la prévision d'arrivée (revue du 22/08).
      if (m.ecartMinutes > ECART_MAX_MINUTES) {
        corps.textContent = 'Arrivée trop lointaine : aucune prévision fiable à cette échéance.';
        return;
      }
      const ligne = document.createElement('p');
      ligne.className = 'meteo-ligne';
      const symbole = document.createElement('span');
      symbole.className = 'meteo-symbole';
      symbole.setAttribute('aria-hidden', 'true');
      symbole.textContent = symboleTemps(m.code);
      const texte = document.createElement('span');
      texte.textContent = `Arrivée vers ${formaterHeure(arrivee, m.decalageLieu, maintenant)}`
        + ` (heure locale) — ${phraseMeteo(m)}`;
      ligne.append(symbole, texte);
      const source = document.createElement('p');
      source.className = 'meteo-source';
      // L'écart de souveraineté se dit À L'ENDROIT où il se produit, pas
      // seulement dans une page « À propos » que personne n'ouvre.
      source.textContent = 'Prévision Open-Meteo (service européen) — voir « À propos ».';
      corps.append(ligne, source);
    } catch (e) {
      if (this.#dernier !== iti) return;
      this.#meteoPour = null; this.#meteoLe = null; // réessayable tout de suite
      corps.textContent = e instanceof ErreurMeteo
        ? e.message : 'Météo indisponible pour le moment.';
    }
  }

  /** « Sur le trajet » — à la demande, au plus six appels par couche, et le
      résultat vaut pour l'itinéraire TRACÉ (le cliché), pas pour les champs. */
  async #chercherSurLeTrajet(): Promise<void> {
    const section = this.querySelector('.iti-trajet') as HTMLDetailsElement;
    const corps = this.querySelector('.iti-trajet-corps') as HTMLElement;
    const iti = this.#dernier;
    if (!section.open || !iti || this.#trajetPour === iti) return;
    this.#trajetPour = iti;
    const quoi = (this.querySelector('.trajet-quoi') as HTMLSelectElement).value as Categorie;
    const rayon = Number((this.querySelector('.trajet-rayon') as HTMLSelectElement).value);
    corps.textContent = 'Recherche le long du trajet…';
    this.#annulationTrajet?.abort();
    const annulation = new AbortController();
    this.#annulationTrajet = annulation;
    try {
      const trouves = await chercherLeLongDuTrajet(iti.geometrie, quoi, rayon, annulation.signal);
      if (this.#dernier !== iti || annulation.signal.aborted) return;
      this.#afficherSurLeTrajet(trouves, quoi);
    } catch (e) {
      if (annulation.signal.aborted) return;
      this.#trajetPour = null; // réessayable
      corps.textContent = e instanceof ErreurPoi
        ? e.message : 'Recherche le long du trajet indisponible pour le moment.';
    }
  }

  /* LES ARRÊTS DE RECHARGE — À LA DEMANDE, comme tout le reste de ce panneau.
     Le calcul est LOCAL (lib/arrets.ts) ; le seul appel réseau cherche les
     bornes le long du tracé, et il est plafonné à six tronçons depuis la
     PR #11. Le profil du véhicule vient d'IndexedDB : il n'a jamais quitté le
     navigateur et ne le quitte pas ici non plus. */
  async #planifierRecharge(): Promise<void> {
    const section = this.querySelector('.iti-recharge') as HTMLDetailsElement;
    const corps = this.querySelector('.iti-recharge-corps') as HTMLElement;
    const iti = this.#dernier;
    if (!section.open || !iti || this.#rechargePour === iti) return;
    this.#rechargePour = iti;

    const memo = await lirePreference<unknown>(PREF_VEHICULE);
    const m = (memo ?? {}) as Record<string, unknown>;
    const brut = (m['vehicule'] ?? {}) as Record<string, unknown>;
    const nombre = (x: unknown): number =>
      (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? x : 0);
    const capacite = nombre(brut['capaciteNominale']) * (nombre(brut['soce']) || 100) / 100;
    const conso = ((brut['consommations'] ?? {}) as Record<string, unknown>)['autoroute'];

    if (!(capacite > 0) || !(nombre(conso) > 0)) {
      corps.textContent = 'Renseignez d’abord votre véhicule (panneau « Véhicule ») :'
        + ' batterie, santé et autonomie constatée.';
      this.#rechargePour = null;   // réessayable une fois le profil rempli
      return;
    }

    corps.textContent = 'Recherche des bornes le long du trajet…';
    this.#annulationRecharge?.abort();
    const annulation = new AbortController();
    this.#annulationRecharge = annulation;

    try {
      /* DIX KILOMÈTRES, EN MÈTRES : au-delà, le détour coûte plus que la borne
         ne rapporte. Le paramètre s'appelle `rayonM` — passer « 10 » cherchait
         dans un rayon de dix MÈTRES et ne rendait jamais rien, sans la moindre
         erreur. Le parcours E2E l'a vu ; un test à sec ne l'aurait pas vu. */
      const trouves = await chercherLeLongDuTrajet(
        iti.geometrie, 'bornes', 10_000, annulation.signal,
      );
      if (this.#dernier !== iti || annulation.signal.aborted) return;

      const plan = planifierArrets({
        vehicule: {
          capaciteKwh: capacite,
          consommationKwh100: nombre(conso),
          // 150 kW par défaut : une valeur courante, et l'interface le dit.
          puissanceMaxKw: nombre(brut['puissanceMaxKw']) || 150,
        },
        distanceM: iti.distance,
        bornes: trouves.map((t) => ({
          nom: (t.poi as PoiBorne).nom,
          lon: t.poi.lon, lat: t.poi.lat,
          avancementM: t.avancement, ecartM: t.ecart,
          puissanceKw: (t.poi as PoiBorne).puissance,
        })),
        socDepart: nombre(brut['soc']) || 100,
        socArrivee: 10,
        reserve: 10,
      });
      this.#afficherRecharge(plan);
    } catch (e) {
      if (annulation.signal.aborted) return;
      this.#rechargePour = null;
      corps.textContent = e instanceof ErreurPoi
        ? e.message : 'Recherche des bornes indisponible pour le moment.';
    }
  }

  #afficherRecharge(plan: PlanRecharge): void {
    const corps = this.querySelector('.iti-recharge-corps') as HTMLElement;
    corps.replaceChildren();
    this.#marqueursArrets.forEach((m) => m.remove());
    this.#marqueursArrets = [];

    if (!plan.faisable) {
      /* ON DIT NON, TÔT, AVEC LE MOTIF. Un plan bancal qui laisse découvrir le
         trou à 8 % de batterie est pire que l'aveu. */
      const refus = document.createElement('p');
      refus.className = 'recharge-refus';
      refus.textContent = plan.motif ?? 'Trajet impossible avec ce véhicule.';
      corps.append(refus);
      return;
    }

    const resume = document.createElement('p');
    resume.className = 'recharge-resume';
    resume.textContent = plan.arrets.length === 0
      ? `Aucun arrêt nécessaire — arrivée à ${Math.round(plan.socArrivee)} % de batterie.`
      : `${plan.arrets.length} arrêt${plan.arrets.length > 1 ? 's' : ''}`
        + ` · ${Math.round(plan.dureeRechargeMin)} min de charge`
        + ` · arrivée à ${Math.round(plan.socArrivee)} %`;
    corps.append(resume);

    if (plan.arrets.length > 0) {
      const liste = document.createElement('ol');
      liste.className = 'recharge-liste';
      for (const a of plan.arrets) {
        const item = document.createElement('li');
        /* LE NOM EST UN BOUTON : une liste d'arrêts qu'on ne peut pas situer
           sur la carte oblige à chercher des yeux ce que l'application sait
           déjà. Un clic y vole. */
        const aller = document.createElement('button');
        aller.type = 'button';
        aller.className = 'recharge-aller';
        aller.textContent = a.borne.nom;
        aller.setAttribute('aria-label', `Voir ${a.borne.nom} sur la carte`);
        aller.addEventListener('click', () => {
          this.#carte?.flyTo({ center: [a.borne.lon, a.borne.lat], zoom: 14 });
        });
        const detail = document.createElement('span');
        detail.className = 'recharge-detail';
        detail.textContent = `${Math.round(a.borne.avancementM / 1000)} km`
          + ` · arrivée ${Math.round(a.socArrivee)} % → départ ${Math.round(a.socDepart)} %`
          + ` · ${Math.round(a.dureeMin)} min`
          + (a.borne.puissanceKw ? ` · ${a.borne.puissanceKw} kW` : '');
        item.append(aller, detail);
        liste.append(item);

        // Et le marqueur, dans le vert des bornes, avec son rang.
        if (this.#carte) {
          this.#marqueursArrets.push(
            new Marker({ color: '#1E9E5A', scale: 0.8 })
              .setLngLat([a.borne.lon, a.borne.lat]).addTo(this.#carte),
          );
        }
      }
      corps.append(liste);
    }

    const reserve = document.createElement('p');
    reserve.className = 'recharge-reserve';
    reserve.textContent = 'Estimation à plat, à consommation constante :'
      + ' ni le relief, ni le vent, ni le trafic, ni la vraie courbe de charge'
      + ' de votre véhicule ne sont pris en compte.';
    corps.append(reserve);
  }

  /** Construit la liste EN textContent : les libellés viennent des services. */
  #afficherSurLeTrajet(trouves: SurLeTrajet<PoiCarburant | PoiBorne>[], quoi: Categorie): void {
    const corps = this.querySelector('.iti-trajet-corps') as HTMLElement;
    corps.replaceChildren();
    this.#marqueursTrajet.forEach((m) => m.remove());
    this.#marqueursTrajet = [];
    if (trouves.length === 0) {
      corps.textContent = 'Rien trouvé dans ce rayon le long du trajet.';
      return;
    }
    const resume = document.createElement('p');
    resume.className = 'trajet-resume';
    resume.textContent = `${trouves.length} ${quoi === 'carburants' ? 'station' : 'borne'}${trouves.length > 1 ? 's' : ''} sur le trajet`;
    const liste = document.createElement('ol');
    liste.className = 'trajet-liste';
    for (const t of trouves.slice(0, 30)) {
      const item = document.createElement('li');
      const aller = document.createElement('button');
      aller.type = 'button';
      aller.className = 'trajet-aller';
      const p = t.poi as Partial<PoiCarburant> & Partial<PoiBorne>;
      const titre = quoi === 'carburants'
        ? [p.adresse, p.ville].filter(Boolean).join(', ') || 'Station-service'
        : p.nom ?? 'Borne de recharge';
      aller.textContent = titre;
      aller.setAttribute('aria-label', `Voir ${titre} sur la carte`);
      aller.addEventListener('click', () => {
        this.#carte?.flyTo({ center: [t.poi.lon, t.poi.lat], zoom: 15 });
      });
      const detail = document.createElement('span');
      detail.className = 'trajet-detail';
      const bouts = [
        `km ${Math.round(t.avancement / 1000)}`,
        t.ecart < 100 ? 'sur la route' : `${formaterDistance(t.ecart)} du trajet`,
      ];
      if (quoi === 'carburants' && p.prix?.length) {
        const [libelle, valeur] = p.prix[0]!;
        bouts.push(`${libelle} ${valeur.toFixed(2).replace('.', ',')} €`);
      }
      if (quoi === 'bornes' && p.puissance) bouts.push(`${p.puissance} kW`);
      detail.textContent = bouts.join(' · ');
      item.append(aller, detail);
      liste.append(item);
      // Un marqueur discret par point trouvé, dans la couleur de sa catégorie.
      if (this.#carte) {
        this.#marqueursTrajet.push(
          new Marker({ color: quoi === 'carburants' ? '#E89C2C' : '#3FA877', scale: 0.6 })
            .setLngLat([t.poi.lon, t.poi.lat]).addTo(this.#carte),
        );
      }
    }
    corps.append(resume, liste);
    if (trouves.length > 30) {
      const note = document.createElement('p');
      note.className = 'trajet-note';
      note.textContent = `Les 30 premières sont listées, sur ${trouves.length} trouvées.`;
      corps.append(note);
    }
  }

  async #chargerFeuille(): Promise<void> {
    const section = this.querySelector('.iti-feuille') as HTMLDetailsElement;
    const corps = this.querySelector('.iti-feuille-corps') as HTMLElement;
    // Le CLICHÉ du calcul réussi, jamais l'état vivant : entre-temps l'usager
    // a pu changer de profil ou d'adresse sans que le recalcul aboutisse — la
    // feuille doit décrire le trajet TRACÉ, pas celui des champs (revue 21/08).
    const cliche = this.#calculPour;
    const iti = this.#dernier;
    if (!section.open || !iti || !cliche || this.#feuillePour === iti) return;
    this.#feuillePour = iti;
    corps.textContent = 'Préparation de la feuille de route…';
    try {
      const etapes = await etapesItineraire(cliche.depart, cliche.arrivee, cliche.profil,
        { etapes: cliche.etapes, eviter: cliche.eviter });
      if (this.#dernier !== iti) return;
      corps.textContent = '';
      // Titre et résumé FIGÉS avec les étapes : l'impression décrira ce
      // trajet-là, quel que soit l'état du panneau au moment du clic.
      const titre = `Itinéraire Infonovice Maps (${PROFILS[cliche.profil]})`;
      const resume = `${formaterDistance(iti.distance)} — ${formaterDuree(iti.duree)}`;
      const imprimer = document.createElement('button');
      imprimer.type = 'button';
      imprimer.className = 'feuille-imprimer';
      imprimer.textContent = 'Imprimer';
      imprimer.addEventListener('click', () => this.#imprimerFeuille(etapes, titre, resume));
      corps.append(imprimer, this.#listeEtapes(etapes));
    } catch (e) {
      if (this.#dernier !== iti) return;
      this.#feuillePour = null; // réessayable à la prochaine ouverture
      corps.textContent = e instanceof ErreurFeuille
        ? e.message : 'Feuille de route indisponible pour le moment.';
    }
  }

  /** La liste des étapes, construite en textContent : les noms de voies sont
      des données EXTERNES (BD TOPO via le service) — jamais d'innerHTML. */
  #listeEtapes(etapes: EtapeRoute[]): HTMLOListElement {
    const liste = document.createElement('ol');
    liste.className = 'feuille-etapes';
    for (const e of etapes) {
      const item = document.createElement('li');
      const texte = document.createElement('span');
      texte.className = 'etape-texte';
      texte.textContent = e.voie ? `${e.texte} — ${e.voie}` : e.texte;
      item.append(texte);
      if (e.distance >= 10) {
        const dist = document.createElement('span');
        dist.className = 'etape-dist';
        dist.textContent = formaterDistance(e.distance);
        item.append(dist);
      }
      liste.append(item);
    }
    return liste;
  }

  /** Imprime la feuille seule : un clone au niveau du body, que la feuille de
      styles d'impression est seule à laisser paraître — et SEULEMENT quand la
      classe `impression-feuille` est posée sur body : sans elle, un Ctrl+P
      ordinaire imprime la page normalement (la première version masquait tout,
      pages blanches — revue du 21/08). */
  #imprimerFeuille(etapes: EtapeRoute[], titre: string, resume: string): void {
    // Idempotent : si un afterprint ne s'est jamais présenté (WebView, environ-
    // nements sans impression), on repart d'un body propre au lieu d'empiler.
    document.querySelectorAll('.zone-impression').forEach((z) => z.remove());
    const zone = document.createElement('section');
    zone.className = 'zone-impression';
    const h = document.createElement('h1');
    h.textContent = titre;
    const p = document.createElement('p');
    p.textContent = resume;
    zone.append(h, p, this.#listeEtapes(etapes));
    document.body.append(zone);
    document.body.classList.add('impression-feuille');
    window.addEventListener('afterprint', () => {
      zone.remove();
      document.body.classList.remove('impression-feuille');
    }, { once: true });
    window.print();
  }

  async #chargerProfil(): Promise<void> {
    const section = this.querySelector('.iti-alti') as HTMLDetailsElement;
    const corps = this.querySelector('.iti-alti-corps') as HTMLElement;
    const iti = this.#dernier;
    if (!section.open || !iti || this.#profilPour === iti) return;
    this.#profilPour = iti;
    corps.textContent = 'Calcul du profil…';
    try {
      const points = await profilItineraire(iti.geometrie);
      // Un nouvel itinéraire a pu arriver pendant l'appel : ce profil ne le
      // concerne pas, on ne touche à rien.
      if (this.#dernier !== iti) return;
      const t = versTraceSVG(points, 280, 72);
      const d = denivele(points);
      // Uniquement des nombres formatés par nos soins : ce innerHTML ne porte
      // aucune donnée externe (la règle textContent vaut pour les libellés).
      corps.innerHTML = `
        <svg viewBox="0 0 280 72" preserveAspectRatio="none" role="img"
          aria-label="Profil altimétrique, de ${Math.round(t.zMin)} à ${Math.round(t.zMax)} mètres d’altitude">
          <polygon class="alti-aire" points="${t.aire}"></polygon>
          <polyline class="alti-ligne" points="${t.ligne}"></polyline>
        </svg>
        <p class="alti-bilan">D+ ${Math.round(d.montee)} m · D− ${Math.round(d.descente)} m ·
          de ${Math.round(t.zMin)} à ${Math.round(t.zMax)} m</p>`;
    } catch (e) {
      if (this.#dernier !== iti) return;
      this.#profilPour = null; // réessayable à la prochaine ouverture
      corps.textContent = e instanceof ErreurAltimetrie
        ? e.message : 'Profil indisponible pour le moment.';
    }
  }

  async #calculer(): Promise<void> {
    if (!this.#carte || !this.#depart || !this.#arrivee) return;
    // JETON DE SÉQUENCE : cases à cocher et boutons ↑/↓ relancent des calculs
    // en rafale, et une reprise (500 ms + nouvel essai) peut faire aboutir la
    // requête la plus VIEILLE en dernier — sans ce jeton, elle écraserait le
    // trajet demandé. Effacer incrémente aussi : une réponse tardive ne
    // ressuscite pas un panneau vidé (revue du 21/08).
    const jeton = (this.#sequence += 1);
    const resultat = this.querySelector('.iti-resultat') as HTMLElement;
    const erreur = this.querySelector('.iti-erreur') as HTMLElement;
    erreur.hidden = true;
    resultat.hidden = false;
    resultat.textContent = 'Calcul de l’itinéraire…';
    try {
      const depart = this.#depart; const arrivee = this.#arrivee; const profil = this.#profil;
      const inter = (this.querySelector('etapes-itineraire') as EtapesItineraire).points;
      const eviter = [...this.#eviter];
      const iti = await calculerItineraire(depart, arrivee, profil, { etapes: inter, eviter });
      if (jeton !== this.#sequence) return;
      this.#dernier = iti;
      this.#calculPour = { depart, arrivee, profil, etapes: inter, eviter };
      // Le résumé AVANT la pose : distance et durée ne dépendent pas de la
      // carte, et la pose peut légitimement attendre (style en cours de
      // chargement) — l'utilisateur ne doit pas payer cette attente.
      resultat.textContent = `${formaterDistance(iti.distance)} — ${formaterDuree(iti.duree)}`;
      (this.querySelector('.iti-actions') as HTMLElement).hidden = false;
      // Nouveau trajet : profil et feuille de route réapparaissent repliés et
      // vidés — leurs contenus ne valent que pour l'itinéraire qui les a produits.
      this.#reinitialiserSections(false);
      this.#tracer(iti);
    } catch (e) {
      if (jeton !== this.#sequence) return;
      resultat.hidden = true;
      erreur.textContent = e instanceof ErreurItineraire
        ? e.message : 'Calcul impossible pour le moment.';
      erreur.hidden = false;
    }
  }

  #tracer(iti: Itineraire): void {
    const carte = this.#carte;
    if (!carte) return;
    const donnees = {
      type: 'Feature' as const, properties: {}, geometry: iti.geometrie,
    };
    try {
      const existante = carte.getSource(SOURCE) as GeoJSONSource | undefined;
      if (existante) {
        existante.setData(donnees);
      } else {
        carte.addSource(SOURCE, { type: 'geojson', data: donnees });
        // Le liseré clair sous le trait bleu : lisible sur le plan comme sur
        // l'ortho, sans dépendre du fond.
        carte.addLayer({
          id: 'itineraire-bord', type: 'line', source: SOURCE,
          paint: { 'line-color': '#FFFFFF', 'line-width': 9, 'line-opacity': 0.9 },
          layout: { 'line-cap': 'round', 'line-join': 'round' },
        });
        carte.addLayer({
          id: 'itineraire-trait', type: 'line', source: SOURCE,
          paint: { 'line-color': '#2272C4', 'line-width': 5 },
          layout: { 'line-cap': 'round', 'line-join': 'round' },
        });
      }
    } catch (e) {
      // MapLibre refuse toute pose tant que le STYLE n'a pas fini de charger
      // (rejeu d'un lien partagé plus rapide que le style, onglet ouvert en
      // arrière-plan au rendu suspendu). C'est le SEUL cas différé : la pose
      // se rejouera au prochain style.load — branché dans `set carte`, émis
      // au chargement initial comme à chaque changement de fond. On teste le
      // message faute d'erreur typée côté MapLibre. Un garde isStyleLoaded()
      // ne convient PAS : il attend aussi les tuiles et reste faux au moment
      // même où style.load autorise déjà la pose — en CI, le tracé ne se
      // posait plus jamais (run 32350033200 du 20/08).
      if (e instanceof Error && /style is not done loading/i.test(e.message)) return;
      throw e;
    }

    this.#marqueurs.forEach((m) => m.remove());
    this.#marqueurs = [];
    const points = iti.geometrie.coordinates;
    const premier = points[0]; const dernier = points[points.length - 1];
    if (premier && dernier) {
      this.#marqueurs.push(
        new Marker({ color: '#3FA877' }).setLngLat(premier as [number, number]).addTo(carte),
        new Marker({ color: '#E89C2C' }).setLngLat(dernier as [number, number]).addTo(carte),
        // Les étapes intermédiaires du CLICHÉ (les coordonnées demandées) :
        // marqueurs réduits, dans le bleu du tracé.
        ...(this.#calculPour?.etapes ?? []).map((p) => new Marker({ color: '#2272C4', scale: 0.72 })
          .setLngLat([p.lon, p.lat]).addTo(carte)),
      );
      const lons = points.map((c) => c[0] as number); const lats = points.map((c) => c[1] as number);
      carte.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]],
        { padding: 72, duration: 700 });
    }
  }

  #effacer(): void {
    this.#sequence += 1; // tue toute réponse d'itinéraire encore en vol
    this.#dernier = null; this.#calculPour = null; this.#depart = null; this.#arrivee = null;
    this.#marqueurs.forEach((m) => m.remove()); this.#marqueurs = [];
    this.#marqueursTrajet.forEach((m) => m.remove()); this.#marqueursTrajet = [];
    this.#marqueursArrets.forEach((m) => m.remove()); this.#marqueursArrets = [];
    const carte = this.#carte;
    if (carte?.getSource(SOURCE)) {
      carte.removeLayer('itineraire-trait'); carte.removeLayer('itineraire-bord');
      carte.removeSource(SOURCE);
    }
    (this.querySelector('.iti-resultat') as HTMLElement).hidden = true;
    (this.querySelector('.iti-actions') as HTMLElement).hidden = true;
    this.#reinitialiserSections(true);
    (this.querySelector('etapes-itineraire') as EtapesItineraire).points = [];
    this.#eviter.clear();
    this.querySelectorAll('.iti-eviter input').forEach((c) => { (c as HTMLInputElement).checked = false; });
    this.querySelectorAll('input[type="search"]').forEach((c) => { (c as HTMLInputElement).value = ''; });
  }
}

customElements.define('panneau-itineraire', PanneauItineraire);
