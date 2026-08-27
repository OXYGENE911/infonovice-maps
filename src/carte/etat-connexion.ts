// <etat-connexion> — deux choses que l'usager doit savoir : quand il est
// hors ligne, et qu'il peut installer l'application.
//
// LE MODE HORS LIGNE NE PROMET QUE CE QU'IL TIENT. Sans réseau, la carte
// reste consultable là où elle a déjà été vue (les tuiles sont en cache) et
// les favoris répondent (ils vivent dans le navigateur) ; tout le reste
// interroge un service public et ne peut pas fonctionner. Le message le DIT,
// plutôt que de laisser l'usager découvrir des boutons muets.
//
// LA LISTE SE TERMINE PAR SA RÈGLE, pas par une énumération close. Première
// écriture : « recherche, itinéraires, trafic et météo attendent le réseau »
// — quatre noms, qui se lisaient comme la liste complète des empêchements et
// laissaient croire que « Autour » et les photos de rue, eux, marchaient. Ils
// ne marchent pas. On nomme donc ce qui est visible ET on énonce la règle.

/** L'événement d'installation, non standard mais universel sur Chromium. */
interface EvenementInstallation extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const MESSAGE = 'La carte déjà consultée et vos favoris restent accessibles. '
  + 'Tout ce qui interroge un service — recherche, itinéraire, trafic, météo, '
  + 'points d’intérêt, photos de rue — attend le réseau.';

export class EtatConnexion extends HTMLElement {
  #installation: EvenementInstallation | null = null;

  connectedCallback(): void {
    if (this.firstElementChild) return;
    this.innerHTML = `
      <div class="hors-ligne" role="status"></div>
      <button type="button" class="installer" hidden>Installer l’application</button>`;

    const bandeau = this.querySelector('.hors-ligne') as HTMLElement;
    /* LA RÉGION LIVE EST REMPLIE AU MOMENT DE LA COUPURE, jamais au montage.
       Un `role="status"` dont le texte est écrit une fois pour toutes et
       qu'on se contente de démasquer ne produit AUCUNE annonce : NVDA et
       VoiceOver guettent les changements de contenu, pas les bascules de
       visibilité. Un usager non-voyant perdait donc le réseau sans le savoir.
       La règle CSS `.hors-ligne:empty` cache le bandeau vide — la région,
       elle, reste dans le document en permanence, comme il se doit. */
    const afficher = (): void => {
      if (navigator.onLine) { bandeau.replaceChildren(); return; }
      if (bandeau.firstChild) return;
      const titre = document.createElement('strong');
      titre.textContent = 'Hors ligne.';
      const detail = document.createElement('span');
      detail.textContent = MESSAGE;
      bandeau.replaceChildren(titre, detail);
    };
    window.addEventListener('online', afficher);
    window.addEventListener('offline', afficher);
    afficher();

    const bouton = this.querySelector('.installer') as HTMLButtonElement;
    /* LE BOUTON NE PARAÎT QUE SUR LES ÉCRANS QUI EN ONT L'USAGE. Armelin, le
       27/08/2026 : « en mode desktop, le site propose l'encart pour installer
       l'application alors que ça ne devrait le proposer qu'en version
       mobile ». Sur ordinateur, Chrome affiche SA PROPRE icône d'installation
       dans la barre d'adresse — notre bouton la doublait. Sur téléphone,
       cette icône n'existe pas : le bouton y garde sa raison d'être. On
       reconnaît « téléphone » à l'écran étroit OU au pointeur grossier, et le
       verdict se rejoue si la fenêtre change de nature. */
    const mobile = window.matchMedia('(max-width: 768px), (pointer: coarse)');
    const majBouton = (): void => {
      bouton.hidden = !(this.#installation && mobile.matches);
    };
    mobile.addEventListener('change', majBouton);
    window.addEventListener('beforeinstallprompt', (e) => {
      // Sans preventDefault, le navigateur pose sa propre invite quand il veut ;
      // on préfère un bouton discret, que l'usager actionne s'il le souhaite.
      e.preventDefault();
      this.#installation = e as EvenementInstallation;
      majBouton();
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
