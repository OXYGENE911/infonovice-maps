// <etat-connexion> — deux choses que l'usager doit savoir : quand il est
// hors ligne, et qu'il peut installer l'application.
//
// LE MODE HORS LIGNE NE PROMET QUE CE QU'IL TIENT. Sans réseau, la carte
// reste consultable là où elle a déjà été vue (les tuiles sont en cache) et
// les favoris répondent (ils vivent dans le navigateur) ; mais la recherche
// d'adresse, les itinéraires, le trafic et la météo interrogent des services
// publics — ils ne peuvent pas fonctionner. Le bandeau le DIT, plutôt que de
// laisser l'usager découvrir des boutons muets.

/** L'événement d'installation, non standard mais universel sur Chromium. */
interface EvenementInstallation extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export class EtatConnexion extends HTMLElement {
  #installation: EvenementInstallation | null = null;

  connectedCallback(): void {
    if (this.firstElementChild) return;
    this.innerHTML = `
      <div class="hors-ligne" role="status" hidden>
        <strong>Hors ligne.</strong>
        <span>La carte déjà consultée et vos favoris restent accessibles ;
          recherche, itinéraires, trafic et météo attendent le réseau.</span>
      </div>
      <button type="button" class="installer" hidden>Installer l’application</button>`;

    const bandeau = this.querySelector('.hors-ligne') as HTMLElement;
    const afficher = (): void => { bandeau.hidden = navigator.onLine; };
    window.addEventListener('online', afficher);
    window.addEventListener('offline', afficher);
    afficher();

    const bouton = this.querySelector('.installer') as HTMLButtonElement;
    window.addEventListener('beforeinstallprompt', (e) => {
      // Sans preventDefault, le navigateur pose sa propre invite quand il veut ;
      // on préfère un bouton discret, que l'usager actionne s'il le souhaite.
      e.preventDefault();
      this.#installation = e as EvenementInstallation;
      bouton.hidden = false;
    });
    bouton.addEventListener('click', () => {
      const invite = this.#installation;
      if (!invite) return;
      bouton.disabled = true;
      void invite.prompt().then(() => invite.userChoice).then(() => {
        // L'invite ne se rejoue pas : le navigateur ne la propose qu'une fois.
        this.#installation = null;
        bouton.hidden = true;
        bouton.disabled = false;
      }, () => { bouton.disabled = false; });
    });
    window.addEventListener('appinstalled', () => {
      this.#installation = null;
      bouton.hidden = true;
    });
  }
}

customElements.define('etat-connexion', EtatConnexion);
