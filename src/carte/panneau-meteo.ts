// <panneau-meteo> — activer/désactiver l'appel à Open-Meteo (mission C24, 18/09/2026).
//
// DÉSACTIVÉ PAR DÉFAUT (décision CEO du 18/09/2026, rectlXpTngiZZK2yG) : tant
// que l'usager n'a rien réglé, aucun appel ne part vers Open-Meteo — ni pour
// le rayon d'action par temps froid, ni pour la météo d'un itinéraire, ni
// pour l'outil « Météo » du menu Outils (voir outil-meteo.ts). L'activation
// est un geste de l'usager, dans ce panneau, et elle seule déclenche la
// confirmation exportée ci-dessous : c'est elle qui envoie son IP à
// Open-Meteo (Suisse), pas la désactivation.
import { lirePreference, ecrirePreference } from '../lib/stockage';
import { pictoMenu } from './icone-menu';
import { PREF_METEO_EXTERNE, invaliderCacheMeteoExterne } from '../lib/meteo';

export { PREF_METEO_EXTERNE };

const TITRE_CONFIRMATION =
  'Activer la météo Open-Meteo ?';
const MESSAGE_CONFIRMATION =
  'Cette option corrige l’autonomie affichée selon la température : par grand froid, la portée réelle peut chuter jusqu’à 45 %. En l’activant, vous transmettez à Open-Meteo (Suisse) votre adresse IP, la position de votre véhicule et les points de votre trajet.';

/** Demande de confirmation à l'activation — UNE fonction, appelée depuis le
    panneau et depuis outil-meteo.ts, pour que le remplacement du libellé
    provisoire se fasse en un seul endroit. */
export function confirmerActivationMeteo(): Promise<boolean> {
  return new Promise((resoudre) => {
    const boite = document.createElement('dialog');
    boite.className = 'confirmation-meteo';
    boite.setAttribute('aria-label', 'Confirmer l’activation de la météo');
    boite.setAttribute('tabindex', '-1');
    const titre = document.createElement('h2');
    titre.textContent = TITRE_CONFIRMATION;
    const texte = document.createElement('p');
    texte.textContent = MESSAGE_CONFIRMATION;
    const actions = document.createElement('div');
    actions.className = 'confirmation-meteo-actions';
    const annuler = document.createElement('button');
    annuler.type = 'button';
    annuler.textContent = 'Ne pas activer';
    const confirmer = document.createElement('button');
    confirmer.type = 'button';
    confirmer.textContent = 'Activer';
    actions.append(annuler, confirmer);
    boite.append(titre, texte, actions);
    document.body.appendChild(boite);
    const clore = (valeur: boolean): void => {
      boite.close();
      boite.remove();
      resoudre(valeur);
    };
    annuler.addEventListener('click', () => clore(false));
    confirmer.addEventListener('click', () => clore(true));
    boite.addEventListener('cancel', () => clore(false)); // Échap
    boite.showModal();
    boite.focus();
  });
}

export class PanneauMeteo extends HTMLElement {
  connectedCallback(): void {
    if (this.firstElementChild) return;
    this.innerHTML = `
      <details class="meteo-externe">
        <summary aria-label="Réglages météo">${pictoMenu('meteo')}Météo</summary>
        <fieldset>
          <legend>Météo (Open-Meteo)</legend>
          <label><input type="checkbox" class="meteo-externe-case">
            Activer les prévisions météo</label>
          <p class="meteo-externe-source">Désactivée par défaut : l’activation
            envoie votre position à Open-Meteo (Suisse) à chaque demande.</p>
        </fieldset>
      </details>`;
    const case_ = this.querySelector('.meteo-externe-case') as HTMLInputElement;
    case_.addEventListener('change', () => { void this.#basculer(case_); });
    void lirePreference<unknown>(PREF_METEO_EXTERNE).then((memo) => {
      case_.checked = memo === true;
    });
  }

  async #basculer(case_: HTMLInputElement): Promise<void> {
    if (!case_.checked) {
      await ecrirePreference(PREF_METEO_EXTERNE, false);
      invaliderCacheMeteoExterne(false);
      return;
    }
    const confirme = await confirmerActivationMeteo();
    if (!confirme) { case_.checked = false; return; }
    await ecrirePreference(PREF_METEO_EXTERNE, true);
    invaliderCacheMeteoExterne(true);
  }
}

customElements.define('panneau-meteo', PanneauMeteo);
