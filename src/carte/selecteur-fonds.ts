// <selecteur-fonds> — le premier Web Component du projet (la stack imposée :
// vanilla TS + Web Components). Un bouton « Fonds », un panneau de radios et
// une case cadastre ; le choix est persisté en IndexedDB et rétabli au
// chargement.
import { FONDS, type Fond, type OptionsStyle } from './style-ign';
import { pictoMenu } from './icone-menu';
import { lirePreference, ecrirePreference } from '../lib/stockage';

export const PREF_FONDS = 'fonds';

export class SelecteurFonds extends HTMLElement {
  #options: OptionsStyle = { fond: 'plan', cadastre: false };
  #surChangement: ((o: OptionsStyle) => void) | null = null;

  set surChangement(f: (o: OptionsStyle) => void) { this.#surChangement = f; }
  get options(): OptionsStyle { return { ...this.#options }; }

  async connectedCallback(): Promise<void> {
    const memo = await lirePreference<OptionsStyle>(PREF_FONDS);
    if (memo && memo.fond in FONDS) this.#options = { cadastre: false, ...memo };
    this.#rendre();
    if (memo) this.#surChangement?.(this.options);
  }

  #appliquer(maj: Partial<OptionsStyle>): void {
    this.#options = { ...this.#options, ...maj };
    void ecrirePreference(PREF_FONDS, this.#options);
    this.#surChangement?.(this.options);
  }

  #rendre(): void {
    const { fond, cadastre } = this.#options;
    this.innerHTML = `
      <details class="fonds">
        <summary aria-label="Choisir le fond de carte">${pictoMenu('fonds')}Fonds</summary>
        <fieldset>
          <legend>Fond de carte</legend>
          ${(Object.keys(FONDS) as Fond[]).map((f) => `
            <label><input type="radio" name="fond" value="${f}"
              ${f === fond ? 'checked' : ''}> ${FONDS[f]}</label>`).join('')}
          <hr>
          <label><input type="checkbox" name="cadastre" ${cadastre ? 'checked' : ''}>
            Parcelles cadastrales</label>
        </fieldset>
      </details>`;
    /* LE DOM N'EST RENDU QU'UNE FOIS. La première version reconstruisait tout
       le panneau à chaque changement — et détruisait donc l'élément au milieu
       même du clic qui venait de le cocher (attrapé par Playwright, qui tenait
       encore l'ancien nœud). Les radios et la case PORTENT déjà l'état : il
       n'y a rien à redessiner, seulement à écouter. */
    const detail = this.querySelector('details');
    this.querySelectorAll('input[name="fond"]').forEach((r) => {
      r.addEventListener('change', () => {
        this.#appliquer({ fond: (r as HTMLInputElement).value as Fond });
        detail?.removeAttribute('open');
      });
    });
    this.querySelector('input[name="cadastre"]')?.addEventListener('change', (e) => {
      this.#appliquer({ cadastre: (e.target as HTMLInputElement).checked });
    });
  }
}

customElements.define('selecteur-fonds', SelecteurFonds);
