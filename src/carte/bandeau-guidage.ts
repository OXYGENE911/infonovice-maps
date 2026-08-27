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
import { limiteA, type LimiteTrajet } from '../lib/limites';
import { flecheManoeuvre } from './icone-manoeuvre';
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

/* L'INCLINAISON DU SUIVI — la « vue 3D » demandée le 27/08/2026, ESSAYÉE
   AVANT D'ÊTRE PROMISE (le cadrage l'exigeait) : capture du fond Plan IGN
   incliné à 60° sur Lyon au zoom 15,5 — le champ proche reste net, seul le
   lointain rapetisse, ce qui est la nature d'une perspective. 55° garde un
   peu plus de lisibilité au loin. Les étiquettes sont CUITES dans le raster :
   elles rapetissent avec la distance, là où un fond vectoriel les garderait à
   taille d'écran — la limite est connue et assumée. */
const PITCH_SUIVI = 55;

/* LA CAMÉRA REVIENT TOUTE SEULE APRÈS VINGT SECONDES sans nouveau geste.
   Armelin, le 27/08/2026 : « je ne peux plus dézoomer sur la carte car le
   zoom sur ma position se force automatiquement. Ce serait bien de pouvoir
   dézoomer et d'avoir ensuite un bouton qui s'affiche permettant de recentrer
   automatiquement ou d'attendre quelques minutes avant de recentrer. » */
const REPRISE_CAMERA_MS = 20_000;

/** Le verrou d'écran, tel que le navigateur le rend. */
interface VerrouEcran { release(): Promise<void> }

export class BandeauGuidage extends HTMLElement {
  #carte: CarteMapLibre | null = null;
  /* LES LIMITES CARTOGRAPHIÉES du tracé (lib/limites.ts) — livrées APRÈS le
     démarrage : Overpass peut mettre vingt secondes, et « Démarrer » ne doit
     pas les attendre. Tant qu'elles ne sont pas là (ou pas du tout), le
     panneau de limite n'apparaît simplement pas. */
  #limites: readonly LimiteTrajet[] = [];

  set limites(l: readonly LimiteTrajet[]) { this.#limites = l; }
  #veille: number | null = null;
  #options: DemarrageGuidage | null = null;
  /** La caméra suit-elle la voiture ? Un geste de l'usager la suspend. */
  #camera = true;
  #reprise: ReturnType<typeof setTimeout> | undefined;
  #dernierePosition: [number, number] | null = null;
  /* L'ÉCRAN RESTE ALLUMÉ PENDANT LE SUIVI (Screen Wake Lock) : un téléphone
     qui se verrouille au premier feu rouge n'est pas un suivi. Le verrou
     TOMBE quand l'onglet passe en arrière-plan — le navigateur l'impose — et
     se REPREND au retour ; son échec est bénin (réglage d'économie d'énergie)
     et l'écran suit alors la règle du téléphone, comme avant. */
  #verrouEcran: VerrouEcran | null = null;
  /** Vrai dès qu'un cap a tourné la carte : l'arrêt devra rendre le nord. */
  #veilleAvaitTourne = false;
  /** La vue inclinée du suivi — un choix de l'usager, retenu pour la session. */
  #en3D = true;
  #surVisibilite = (): void => { void this.#prendreVerrou(); };

  set carte(c: CarteMapLibre) {
    this.#carte = c;
    /* UN GESTE DE L'USAGER SUSPEND LA CAMÉRA — pas un mouvement du code. Les
       événements MapLibre issus d'un vrai geste portent `originalEvent` ;
       nos propres `easeTo` n'en portent pas : c'est LE discriminant. */
    for (const geste of ['movestart', 'zoomstart', 'rotatestart', 'pitchstart'] as const) {
      c.on(geste, (e) => {
        const gesteUsager = (e as { originalEvent?: Event }).originalEvent;
        if (this.actif && gesteUsager) this.#suspendreCamera();
      });
    }
    /* `dragstart` ET `wheel` EN PLUS : ils ne naissent QUE d'un geste — et la
       molette, elle, peut être avalée par un `easeTo` en cours (l'animation
       du suivi tourne huit dixièmes de seconde sur dix) : son `zoomstart`
       n'est alors pas rejoué avec l'originalEvent. L'événement `wheel` du
       niveau du dessous, lui, arrive toujours. */
    for (const geste of ['dragstart', 'wheel'] as const) {
      c.on(geste, () => { if (this.actif) this.#suspendreCamera(); });
    }
  }

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
          <!-- LA FLÈCHE ANTICIPE LA PHRASE : « indiquer les flèches de
               direction à chaque intersection ou sortie » (27/08/2026). La
               phrase reste la vérité ; la flèche se lit depuis un support. -->
          <span class="bg-fleche" aria-hidden="true"></span>
          <div class="bg-manoeuvre-texte">
            <p class="bg-instruction"></p>
            <p class="bg-distance"></p>
          </div>
        </div>
        <p class="bg-restant" role="status"></p>
        <p class="bg-arret"></p>
        <p class="bg-alerte" role="alert" hidden></p>
        <p class="bg-limite">Suivi d’itinéraire, pas navigation guidée :
          aucune voix, et aucun recalcul si vous quittez la route.</p>
        <div class="bg-boutons">
          <!-- LE BANDEAU SE RÉDUIT : « réduire la taille du cartouche en bas
               qui prend 1/3 de l'écran » (Armelin, 27/08/2026). Réduit, il
               garde la manœuvre et le restant — ce qu'on lit en roulant. -->
          <button type="button" class="bg-reduire" aria-pressed="false"
            aria-label="Réduire le bandeau">Réduire</button>
          <!-- LA VUE 3D SE REFUSE : certains lisent mieux à plat. Le choix
               tient la session. -->
          <button type="button" class="bg-3d" aria-pressed="true"
            aria-label="Passer la carte à plat">Vue à plat</button>
          <button type="button" class="bg-arreter">Arrêter le suivi</button>
        </div>
      </div>
      <!-- LE RECENTRAGE, HORS DU BANDEAU : il flotte sur la carte, là où le
           regard est quand on vient de la déplacer. Il ne paraît que quand la
           caméra est suspendue par un geste. -->
      <button type="button" class="bg-recentrer" hidden>Recentrer</button>
      <!-- LA VITESSE GPS — un cercle discret à gauche. Cachée tant que le
           récepteur ne la donne pas : un chiffre figé serait un mensonge. -->
      <p class="bg-vitesse" hidden aria-label="Vitesse GPS">
        <span class="bg-vitesse-nombre">0</span><span class="bg-vitesse-unite">km/h</span></p>
      <!-- LA LIMITE CARTOGRAPHIÉE — un disque cerclé de rouge, au-dessus de
           la vitesse. CARTOGRAPHIÉE, pas mesurée : OpenStreetMap ignore les
           travaux et les limites variables — le title le dit, et le panneau
           SE TAIT quand la carte ne sait pas. -->
      <p class="bg-limite-vitesse" hidden role="status"
        title="Vitesse limite cartographiée (OpenStreetMap) — travaux et limites variables non connus"
        aria-label="Vitesse limite cartographiée">
        <span class="bg-limite-nombre">50</span></p>`;
    this.querySelector('.bg-arreter')?.addEventListener('click', () => { this.arreter(); });
    this.querySelector('.bg-recentrer')?.addEventListener('click', () => { this.#recentrer(); });
    this.querySelector('.bg-3d')?.addEventListener('click', () => {
      this.#en3D = !this.#en3D;
      const bouton = this.querySelector('.bg-3d') as HTMLButtonElement;
      bouton.setAttribute('aria-pressed', String(this.#en3D));
      bouton.textContent = this.#en3D ? 'Vue à plat' : 'Vue 3D';
      bouton.setAttribute('aria-label',
        this.#en3D ? 'Passer la carte à plat' : 'Incliner la carte');
      this.#carte?.easeTo({ pitch: this.#en3D ? PITCH_SUIVI : 0, duration: 500 });
    });
    this.querySelector('.bg-reduire')?.addEventListener('click', () => {
      const reduit = this.classList.toggle('bg-compact');
      const bouton = this.querySelector('.bg-reduire') as HTMLButtonElement;
      bouton.setAttribute('aria-pressed', String(reduit));
      bouton.textContent = reduit ? 'Agrandir' : 'Réduire';
      bouton.setAttribute('aria-label', reduit ? 'Agrandir le bandeau' : 'Réduire le bandeau');
    });
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
      (p) => { this.#majPosition(p.coords); },
      (e) => {
        /* UN REFUS N'EST PAS UNE PANNE, et les deux se disent différemment :
           l'un se répare en changeant un réglage, l'autre en attendant. */
        this.#alerte(e.code === e.PERMISSION_DENIED
          ? 'Position refusée. Autorisez la géolocalisation pour suivre le trajet.'
          : 'Position indisponible pour le moment. Le suivi reprendra dès qu’elle revient.');
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20_000 },
    );
    // Le suivi qui démarre reprend la caméra, incline la vue si l'usager la
    // veut ainsi — et garde l'écran allumé.
    this.#camera = true;
    if (this.#en3D) this.#carte?.easeTo({ pitch: PITCH_SUIVI, duration: 600 });
    this.#dernierePosition = null;
    (this.querySelector('.bg-recentrer') as HTMLElement).hidden = true;
    void this.#prendreVerrou();
    document.addEventListener('visibilitychange', this.#surVisibilite);
    return true;
  }

  arreter(): void {
    if (this.#veille !== null) {
      navigator.geolocation.clearWatch(this.#veille);
      this.#veille = null;
    }
    this.#options = null;
    this.hidden = true;
    clearTimeout(this.#reprise);
    (this.querySelector('.bg-recentrer') as HTMLElement | null)?.setAttribute('hidden', '');
    (this.querySelector('.bg-vitesse') as HTMLElement | null)?.setAttribute('hidden', '');
    (this.querySelector('.bg-limite-vitesse') as HTMLElement | null)?.setAttribute('hidden', '');
    /* LE NORD REVIENT EN HAUT : la carte orientée au cap n'a de sens qu'en
       suivi — la laisser tournée après l'arrêt désoriente la consultation. */
    /* …ET LA CARTE SE REDRESSE : l'inclinaison n'a de sens qu'en suivi. */
    const pitch = this.#carte?.getPitch() ?? 0;
    if (this.#veilleAvaitTourne || pitch > 0) {
      this.#carte?.easeTo({ bearing: 0, pitch: 0, duration: 500 });
      this.#veilleAvaitTourne = false;
    }
    document.removeEventListener('visibilitychange', this.#surVisibilite);
    /* LE VERROU D'ÉCRAN SE REND À L'ARRÊT : le garder viderait la batterie de
       celui qui est arrivé — le même devoir que le clearWatch ci-dessus. */
    void this.#verrouEcran?.release().catch(() => { /* déjà tombé : rien à faire */ });
    this.#verrouEcran = null;
    document.body.classList.remove('en-guidage');
    this.dispatchEvent(new CustomEvent('guidage-arrete', { bubbles: true }));
  }

  /* ---- la caméra appartient à l'usager ---- */

  #suspendreCamera(): void {
    this.#camera = false;
    (this.querySelector('.bg-recentrer') as HTMLElement).hidden = false;
    /* CHAQUE GESTE REPOUSSE LA REPRISE : tant qu'on explore la carte, elle
       reste à nous ; vingt secondes d'immobilité, et le suivi la reprend. */
    clearTimeout(this.#reprise);
    this.#reprise = setTimeout(() => { this.#recentrer(); }, REPRISE_CAMERA_MS);
  }

  #recentrer(): void {
    clearTimeout(this.#reprise);
    this.#camera = true;
    (this.querySelector('.bg-recentrer') as HTMLElement).hidden = true;
    const p = this.#dernierePosition;
    if (p && this.#carte) {
      this.#carte.easeTo({ center: p, zoom: Math.max(this.#carte.getZoom(), ZOOM_SUIVI), duration: 600 });
    }
  }

  async #prendreVerrou(): Promise<void> {
    if (!this.actif || document.visibilityState !== 'visible') return;
    const n = navigator as Navigator & {
      wakeLock?: { request(type: 'screen'): Promise<VerrouEcran> };
    };
    if (!n.wakeLock) return;
    try {
      this.#verrouEcran = await n.wakeLock.request('screen');
    } catch {
      /* Refusé (économie d'énergie, batterie faible) : bénin — l'écran suit
         alors le réglage du téléphone, exactement comme avant ce verrou. */
    }
  }

  #alerte(message: string): void {
    const p = this.querySelector('.bg-alerte') as HTMLElement;
    p.textContent = message;
    p.hidden = message === '';
  }

  #majPosition(coords: {
    longitude: number; latitude: number;
    speed?: number | null; heading?: number | null;
  }): void {
    const o = this.#options;
    if (!o) return;
    const lon = coords.longitude;
    const lat = coords.latitude;
    const e = etatGuidage(o, { lon, lat });
    this.#dernierePosition = [lon, lat];

    /* LA VITESSE GPS, EN TOUTES LETTRES — « un petit cercle indiquant la
       vitesse GPS en temps réel » (Armelin, 27/08/2026). `speed` vient en
       m/s, et il est NULL quand le récepteur ne sait pas : la pastille
       disparaît alors, plutôt que de figer un chiffre périmé. Ce n'est PAS
       la vitesse limite (l'ISA) : elle attend l'étude maxspeed OSM. */
    const vitesse = this.querySelector('.bg-vitesse') as HTMLElement;
    if (typeof coords.speed === 'number' && Number.isFinite(coords.speed)
      && coords.speed >= 0) {
      (vitesse.querySelector('.bg-vitesse-nombre') as HTMLElement).textContent =
        String(Math.round(coords.speed * 3.6));
      vitesse.hidden = false;
    } else {
      vitesse.hidden = true;
    }

    /* LA LIMITE CARTOGRAPHIÉE DU KILOMÈTRE COURANT — lecture locale, le
       relevé a été fait une fois au démarrage. Hors tronçon connu ou hors
       route : le panneau disparaît, il ne mentira pas. */
    const panneauLimite = this.querySelector('.bg-limite-vitesse') as HTMLElement;
    const kmh = e.horsRoute ? null : limiteA(this.#limites, e.avancementM);
    if (kmh !== null) {
      (panneauLimite.querySelector('.bg-limite-nombre') as HTMLElement).textContent = String(kmh);
      panneauLimite.hidden = false;
    } else {
      panneauLimite.hidden = true;
    }

    /* LA CARTE SUIT LA VOITURE — SAUF quand l'usager vient de la prendre :
       son geste suspend la caméra, le bouton « Recentrer » (ou vingt
       secondes d'immobilité) la rend. `easeTo` et non `jumpTo` : un saut à
       chaque fixe GPS — environ une fois par seconde — rendrait la carte
       illisible. */
    if (this.#camera) {
      /* LE CAP GPS ORIENTE LA CARTE : la direction du déplacement en haut,
         comme toute navigation. `heading` n'a de sens QU'EN MOUVEMENT — à
         l'arrêt, c'est du bruit qui ferait tournoyer la carte au feu rouge :
         en dessous de 2 m/s (7 km/h), on garde l'orientation acquise.
         DeviceOrientation (la boussole à l'arrêt) attend son propre chantier :
         elle exige une permission sur iOS, le cap GPS n'exige rien. */
      const cap = typeof coords.heading === 'number' && Number.isFinite(coords.heading)
        && typeof coords.speed === 'number' && (coords.speed ?? 0) > 2
        ? coords.heading : null;
      if (cap !== null) this.#veilleAvaitTourne = true;
      /* L'INCLINAISON VOYAGE AVEC CHAQUE FIXE : un easeTo interrompt le
         précédent et FIGE ce qu'il ne nomme pas — le premier fixe arrivait
         pendant l'animation d'inclinaison du démarrage et la gelait à 2°.
         Mesuré par le parcours E2E avant d'être compris. */
      this.#carte?.easeTo({
        center: [lon, lat],
        zoom: Math.max(this.#carte.getZoom(), ZOOM_SUIVI),
        pitch: this.#en3D ? PITCH_SUIVI : 0,
        ...(cap !== null ? { bearing: cap } : {}),
        duration: 800,
      });
    }

    const instruction = this.querySelector('.bg-instruction') as HTMLElement;
    const distance = this.querySelector('.bg-distance') as HTMLElement;

    /* LA FLÈCHE SUIT L'ÉTAPE — et disparaît hors route ou sans feuille :
       une flèche qui pointe au hasard est pire qu'aucune. */
    const fleche = this.querySelector('.bg-fleche') as HTMLElement;
    if (!e.horsRoute && e.etape) {
      fleche.innerHTML = flecheManoeuvre(e.etape.manoeuvre);
      fleche.hidden = false;
    } else {
      fleche.hidden = true;
    }

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
