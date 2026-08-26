/* <bandeau-guidage> — suivre un itinéraire en roulant.
 *
 * CE QU'IL PROMET, ET CE QU'IL REFUSE DE PROMETTRE. Armelin, le 25/08/2026 :
 * « il n'y a pas de bouton pour démarrer l'itinéraire ». Ce bandeau est la
 * réponse — mais il s'appelle SUIVI et non navigation, et il l'écrit à
 * l'écran. Pas de voix, pas de recalcul automatique quand on quitte la route.
 * Une application qui annonce « navigation » et rend un suivi trompe au
 * moment précis où l'on ne peut pas regarder l'écran pour vérifier.
 *
 * CE QU'IL FAIT DONC : la position GPS projetée sur le tracé (lib/guidage.ts,
 * testé à sec), et trois réponses lisibles d'un coup d'œil — la manœuvre
 * suivante, ce qui reste, l'heure d'arrivée. Plus le prochain arrêt de
 * recharge quand un plan existe : c'est l'information qui manque le plus en
 * électrique, et aucune application de navigation généraliste ne la porte.
 *
 * LA GÉOLOCALISATION EST UN GESTE, JAMAIS UNE DEMANDE À L'ARRIVÉE — règle du
 * projet. Elle ne démarre qu'au clic sur « Démarrer », et s'arrête au clic sur
 * « Arrêter » ou à la fermeture : un `watchPosition` oublié viderait la
 * batterie de celui qui est arrivé depuis une heure.
 */
import type { Map as CarteMapLibre } from 'maplibre-gl';
import {
  etatGuidage, distanceEnMots, heureArriveeEstimee, type OptionsGuidage,
} from '../lib/guidage';
import { formaterDistance, formaterDuree } from '../lib/itineraire';
import { refermerPanneaux } from './panneaux';

/** Un arrêt de recharge à annoncer pendant le trajet. */
export interface ArretAAnnoncer {
  nom: string;
  reseau: string | null;
  avancementM: number;
  dureeMin: number;
}

export interface DemarrageGuidage extends OptionsGuidage {
  arrets: readonly ArretAAnnoncer[];
}

/** Le zoom du suivi : assez près pour lire la rue, assez loin pour anticiper. */
const ZOOM_SUIVI = 15.5;

export class BandeauGuidage extends HTMLElement {
  #carte: CarteMapLibre | null = null;
  #veille: number | null = null;
  #options: DemarrageGuidage | null = null;

  set carte(c: CarteMapLibre) { this.#carte = c; }

  /** `true` tant que le suivi tourne — l'appelant s'en sert pour son bouton. */
  get actif(): boolean { return this.#veille !== null; }

  connectedCallback(): void {
    if (this.firstElementChild) return;
    this.hidden = true;
    this.setAttribute('role', 'complementary');
    this.setAttribute('aria-label', 'Suivi de l’itinéraire');
    this.innerHTML = `
      <div class="bg">
        <div class="bg-manoeuvre">
          <p class="bg-instruction"></p>
          <p class="bg-distance"></p>
        </div>
        <p class="bg-restant" role="status"></p>
        <p class="bg-arret"></p>
        <p class="bg-alerte" role="alert" hidden></p>
        <p class="bg-limite">Suivi d’itinéraire, pas navigation guidée :
          aucune voix, et aucun recalcul si vous quittez la route.</p>
        <button type="button" class="bg-arreter">Arrêter le suivi</button>
      </div>`;
    this.querySelector('.bg-arreter')?.addEventListener('click', () => { this.arreter(); });
  }

  /**
   * Démarre le suivi. Rend `false` si la géolocalisation est indisponible —
   * l'appelant peut alors le dire à sa façon.
   */
  demarrer(o: DemarrageGuidage): boolean {
    this.arreter();
    if (!('geolocation' in navigator)) {
      this.#alerte('Ce navigateur ne sait pas donner votre position.');
      this.hidden = false;
      return false;
    }
    this.#options = o;
    this.hidden = false;
    this.#alerte('');
    /* ON DÉGAGE LA VUE. Volets refermés, et une classe sur le document qui
       efface ce qui ne sert pas au volant — la recherche d'adresse d'abord,
       qui occupe le tiers de l'en-tête. Ce n'est pas un encombrement
       esthétique : c'est de la route qu'on ne voit pas. Tout revient à
       l'arrêt du suivi. */
    refermerPanneaux(document);
    document.body.classList.add('en-guidage');
    (this.querySelector('.bg-instruction') as HTMLElement).textContent =
      'Recherche de votre position…';
    (this.querySelector('.bg-distance') as HTMLElement).textContent = '';

    this.#veille = navigator.geolocation.watchPosition(
      (p) => { this.#majPosition(p.coords.longitude, p.coords.latitude); },
      (e) => {
        /* UN REFUS N'EST PAS UNE PANNE, et les deux se disent différemment :
           l'un se répare en changeant un réglage, l'autre en attendant. */
        this.#alerte(e.code === e.PERMISSION_DENIED
          ? 'Position refusée. Autorisez la géolocalisation pour suivre le trajet.'
          : 'Position indisponible pour le moment. Le suivi reprendra dès qu’elle revient.');
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20_000 },
    );
    return true;
  }

  arreter(): void {
    if (this.#veille !== null) {
      navigator.geolocation.clearWatch(this.#veille);
      this.#veille = null;
    }
    this.#options = null;
    this.hidden = true;
    document.body.classList.remove('en-guidage');
    this.dispatchEvent(new CustomEvent('guidage-arrete', { bubbles: true }));
  }

  #alerte(message: string): void {
    const p = this.querySelector('.bg-alerte') as HTMLElement;
    p.textContent = message;
    p.hidden = message === '';
  }

  #majPosition(lon: number, lat: number): void {
    const o = this.#options;
    if (!o) return;
    const e = etatGuidage(o, { lon, lat });

    /* LA CARTE SUIT LA VOITURE. `easeTo` et non `jumpTo` : un saut à chaque
       fixe GPS — environ une fois par seconde — rendrait la carte illisible. */
    this.#carte?.easeTo({
      center: [lon, lat],
      zoom: Math.max(this.#carte.getZoom(), ZOOM_SUIVI),
      duration: 800,
    });

    const instruction = this.querySelector('.bg-instruction') as HTMLElement;
    const distance = this.querySelector('.bg-distance') as HTMLElement;

    if (e.horsRoute) {
      /* ON LE DIT, ON NE DEVINE PAS. Continuer d'annoncer une manœuvre pour
         une route qu'on ne suit plus est bien pire que de se taire : l'usager
         tournerait sur la foi d'une instruction périmée. */
      instruction.textContent = 'Vous avez quitté l’itinéraire.';
      distance.textContent = `À ${formaterDistance(e.ecartM)} du trajet`;
      this.#alerte('Recalculez l’itinéraire depuis votre position :'
        + ' ce suivi ne le fait pas tout seul.');
    } else {
      this.#alerte('');
      instruction.textContent = e.etape
        ? [e.etape.texte, e.etape.voie].filter(Boolean).join(' — ')
        : 'Suivez l’itinéraire';
      distance.textContent = e.etape ? distanceEnMots(e.jusquALaManoeuvreM) : '';
    }

    const arrivee = heureArriveeEstimee(e.restantS, new Date());
    (this.querySelector('.bg-restant') as HTMLElement).textContent = [
      `${formaterDistance(e.restantM)} restants`,
      e.restantS > 0 ? formaterDuree(Math.round(e.restantS)) : null,
      arrivee ? `arrivée vers ${arrivee.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}` : null,
    ].filter(Boolean).join(' · ');

    /* LE PROCHAIN ARRÊT DE RECHARGE — ce qui manque le plus en électrique, et
       qu'aucune application de navigation généraliste ne porte. */
    const prochain = o.arrets.find((a) => a.avancementM > e.avancementM);
    (this.querySelector('.bg-arret') as HTMLElement).textContent = prochain
      ? `Recharge : ${prochain.nom}`
        + `${prochain.reseau ? ` (${prochain.reseau})` : ''}`
        + ` ${distanceEnMots(prochain.avancementM - e.avancementM)}`
        + `${prochain.dureeMin > 0 ? ` · ${Math.round(prochain.dureeMin)} min sur place` : ''}`
      : '';
  }
}

customElements.define('bandeau-guidage', BandeauGuidage);
