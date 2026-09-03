// L'ANNONCE D'UNE NOUVELLE VERSION (MAJ-1, 03/09).
//
// LE TERRAIN. Armelin, en 1.60 : « j'ai des testeurs qui ne savaient pas
// qu'il fallait rafraîchir l'application pour la mettre à jour. Comment
// est-ce possible de leur afficher une popup quelque part pour les prévenir
// qu'une nouvelle version est disponible ? »
//
// UN BANDEAU, PAS UNE FENÊTRE MODALE. Ces gens conduisent : rien ne doit
// s'interposer entre eux et la carte. Le bandeau se pose en bas, dit la
// chose en une phrase, et offre DEUX portes — « Mettre à jour » et « Plus
// tard ». Il n'agit jamais seul : recharger de sa propre initiative en
// pleine navigation couperait le guidage.
//
// « PLUS TARD » EST UNE VRAIE RÉPONSE : le bandeau ne revient pas hanter la
// session — la version sera là au prochain lancement de toute façon, et le
// bouton « Mettre à jour l'application » du menu reste disponible à tout
// moment.

export class BandeauMaj extends HTMLElement {
  connectedCallback(): void {
    if (this.firstElementChild) return;
    this.hidden = true;
    this.innerHTML = `
      <div class="maj-bandeau" role="status">
        <p class="maj-mot">Une nouvelle version est disponible.</p>
        <div class="maj-boutons">
          <button type="button" class="maj-oui">Mettre à jour</button>
          <button type="button" class="maj-tard">Plus tard</button>
        </div>
      </div>`;
    document.addEventListener('maj-disponible', (e) => {
      const detail = (e as CustomEvent<{ appliquer?: () => void }>).detail;
      this.#montrer(detail?.appliquer);
    });
  }

  #montrer(appliquer?: () => void): void {
    this.hidden = false;
    const oui = this.querySelector<HTMLButtonElement>('.maj-oui');
    const tard = this.querySelector<HTMLButtonElement>('.maj-tard');
    oui?.addEventListener('click', () => {
      if (oui) { oui.disabled = true; oui.textContent = 'Mise à jour…'; }
      /* `appliquer` active le nouveau service worker puis recharge. S'il
         manque — un dispatch sans détail —, on recharge simplement : le
         worker en attente prendra la main. */
      if (appliquer) appliquer();
      else window.location.reload();
    }, { once: true });
    tard?.addEventListener('click', () => { this.hidden = true; }, { once: true });
  }
}

customElements.define('bandeau-maj', BandeauMaj);
