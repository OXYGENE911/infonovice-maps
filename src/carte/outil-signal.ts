/* <outil-signal> — « est-ce que je capte bien ? », en page plein écran.
 *
 * OUTILS-2 (06/09/2026). Voir lib/signal-gps.ts pour ce qu'un navigateur sait
 * et ne sait pas : la liste des satellites n'est PAS accessible au web, et la
 * page le dit en toutes lettres plutôt que d'afficher un ciel inventé.
 *
 * LA POSITION N'EST DEMANDÉE QU'ICI, SUR LE GESTE d'ouvrir cet outil, et le
 * suivi s'arrête en refermant la page (contrainte 4 : rien ne part, rien ne
 * reste). */
import { lignesFixe, qualitePrecision, PHRASES_QUALITE } from '../lib/signal-gps';

export class OutilSignal extends HTMLElement {
  #suivi: number | null = null;
  #nb = 0;
  #minuteur: ReturnType<typeof setInterval> | undefined;
  #dernier: GeolocationPosition | null = null;

  connectedCallback(): void {
    if (this.firstElementChild) return;
    this.innerHTML = `
      <p class="signal-etat" role="status"></p>
      <p class="signal-qualite" hidden></p>
      <dl class="signal-valeurs"></dl>
      <p class="outils-mot">Ce que votre navigateur donne : la position, sa
        précision, l’altitude, la vitesse, le cap. <strong>La liste des
        satellites (constellations, force du signal) n’est pas accessible à une
        application web</strong> — elle viendra avec l’application Android
        native. Ici, la précision répond à la question : capte-t-on bien ?</p>
      <p class="outils-mot">Votre position ne quitte pas cet écran ; le relevé
        s’arrête en le refermant.</p>`;
  }

  demarrer(): void {
    const etat = this.querySelector<HTMLElement>('.signal-etat');
    this.#nb = 0;
    this.#dernier = null;
    this.querySelector('.signal-valeurs')?.replaceChildren();
    const q = this.querySelector<HTMLElement>('.signal-qualite');
    if (q) q.hidden = true;
    if (!('geolocation' in navigator)) {
      if (etat) etat.textContent = 'Ce navigateur ne sait pas donner votre position.';
      return;
    }
    if (etat) etat.textContent = 'En attente du premier relevé…';
    this.arreter();
    this.#suivi = navigator.geolocation.watchPosition(
      (p) => { this.#nb += 1; this.#dernier = p; this.#afficher(); },
      (e) => {
        if (etat) {
          etat.textContent = e.code === e.PERMISSION_DENIED
            ? 'Position refusée : autorisez-la dans le navigateur pour mesurer le signal.'
            : 'Aucun relevé pour l’instant : pas de signal, ou position indisponible.';
        }
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 },
    );
    /* L'ÂGE DU RELEVÉ VIEILLIT À L'ÉCRAN même sans nouveau fixe : un chiffre
       figé se lirait comme une réception parfaite. */
    this.#minuteur = setInterval(() => { this.#afficher(); }, 1000);
  }

  arreter(): void {
    if (this.#suivi !== null && 'geolocation' in navigator) {
      navigator.geolocation.clearWatch(this.#suivi);
    }
    this.#suivi = null;
    clearInterval(this.#minuteur);
  }

  #afficher(): void {
    const p = this.#dernier;
    if (!p) return;
    const etat = this.querySelector<HTMLElement>('.signal-etat');
    if (etat) etat.textContent = 'Relevé en cours.';
    const q = this.querySelector<HTMLElement>('.signal-qualite');
    if (q) {
      const qualite = qualitePrecision(p.coords.accuracy);
      q.hidden = false;
      q.dataset['qualite'] = qualite;
      q.textContent = PHRASES_QUALITE[qualite];
    }
    const dl = this.querySelector<HTMLElement>('.signal-valeurs');
    if (!dl) return;
    dl.replaceChildren();
    for (const l of lignesFixe(p.coords, Date.now() - p.timestamp, this.#nb)) {
      const dt = document.createElement('dt'); dt.textContent = l.libelle;
      const dd = document.createElement('dd'); dd.textContent = l.valeur;
      dl.append(dt, dd);
    }
  }
}

customElements.define('outil-signal', OutilSignal);
