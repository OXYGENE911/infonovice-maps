/* <outil-meteo> — la météo d'une ville, heure par heure puis sur sept jours.
 *
 * METEO-VILLE-1 (05/09/2026). Des amis d'Armelin : « des outils dans le menu :
 * la météo d'une ville au choix, heure par heure, et sur 7 jours ». On tape
 * une ville (la même recherche que partout : BAN), et le bulletin se pose
 * sous le champ : vingt-quatre heures en frise, sept jours en lignes.
 *
 * LA SOURCE EST DITE : Open-Meteo, la dérogation publique du 22/08 (page
 * « À propos ») — aucune autre n'entre ici. Rien d'autre ne part : la ville
 * choisie va au service météo, et c'est tout. */
import { RechercheAdresse } from './recherche';
import type { ResultatAdresse } from '../lib/adresse';
import {
  previsionsA, libelleTemps, symboleTemps, ErreurMeteo, type Previsions,
} from '../lib/meteo';

const mm = (v: number): string => `${v.toFixed(1).replace('.', ',')} mm`;

export class OutilMeteo extends HTMLElement {
  #annulation: AbortController | null = null;

  connectedCallback(): void {
    if (this.firstElementChild) return;
    this.innerHTML = `
      <p class="outils-titre">Météo d’une ville</p>
      <p class="outils-mot">Heure par heure sur vingt-quatre heures, puis sept
        jours. Prévisions Open-Meteo (voir « À propos »).</p>
      <div class="meteo-ville-champ"></div>
      <div class="meteo-ville-corps" role="status"></div>`;
    const champ = new RechercheAdresse();
    this.querySelector('.meteo-ville-champ')?.appendChild(champ);
    const saisie = champ.querySelector('input');
    if (saisie) {
      saisie.placeholder = 'Ville ou adresse…';
      saisie.setAttribute('aria-label', 'Ville dont on veut la météo');
    }
    champ.surSelection = (r: ResultatAdresse) => { void this.#charger(r); };
  }

  async #charger(r: ResultatAdresse): Promise<void> {
    const corps = this.querySelector<HTMLElement>('.meteo-ville-corps');
    if (!corps) return;
    this.#annulation?.abort();
    this.#annulation = new AbortController();
    const { signal } = this.#annulation;
    corps.textContent = `Prévisions pour ${r.libelle}…`;
    try {
      const p = await previsionsA(r.lon, r.lat, signal);
      if (signal.aborted) return;
      this.#rendre(corps, r.libelle, p);
    } catch (e) {
      if (signal.aborted) return;
      /* L'ÉCHEC SE DIT, en français, à la place du bulletin — jamais un
         bulletin d'avant qui resterait là comme s'il valait pour ici. */
      corps.textContent = e instanceof ErreurMeteo
        ? e.message : 'La météo est momentanément indisponible. Réessayez dans un instant.';
    }
  }

  #rendre(corps: HTMLElement, libelle: string, p: Previsions): void {
    corps.replaceChildren();
    const lieu = document.createElement('p');
    lieu.className = 'meteo-ville-lieu';
    lieu.textContent = `Météo à ${libelle}`;
    corps.appendChild(lieu);

    const heures = document.createElement('ol');
    heures.className = 'meteo-ville-heures';
    heures.setAttribute('aria-label', 'Prévisions heure par heure');
    for (const h of p.heures) {
      const li = document.createElement('li');
      li.title = libelleTemps(h.code);
      li.setAttribute('aria-label', `${h.heure} : ${Math.round(h.temperature)} °C, ${libelleTemps(h.code)}`
        + (h.pluie >= 0.2 ? `, ${mm(h.pluie)} de pluie` : ''));
      li.innerHTML = `<span class="mv-h">${h.heure}</span>`
        + `<span class="mv-s" aria-hidden="true">${symboleTemps(h.code)}</span>`
        + `<span class="mv-t">${Math.round(h.temperature)}°</span>`
        + `<span class="mv-p">${h.pluie >= 0.2 ? mm(h.pluie) : ''}</span>`;
      heures.appendChild(li);
    }
    corps.appendChild(heures);

    const jours = document.createElement('ol');
    jours.className = 'meteo-ville-jours';
    jours.setAttribute('aria-label', 'Prévisions sur sept jours');
    for (const j of p.jours) {
      const li = document.createElement('li');
      li.title = libelleTemps(j.code);
      li.setAttribute('aria-label', `${j.jour} : de ${Math.round(j.min)} à ${Math.round(j.max)} °C, `
        + `${libelleTemps(j.code)}` + (j.pluie >= 0.2 ? `, ${mm(j.pluie)} de pluie` : ''));
      li.innerHTML = `<span class="mv-j">${j.jour}</span>`
        + `<span class="mv-s" aria-hidden="true">${symboleTemps(j.code)}</span>`
        + `<span class="mv-t">${Math.round(j.min)} / ${Math.round(j.max)} °C</span>`
        + `<span class="mv-p">${j.pluie >= 0.2 ? mm(j.pluie) : ''}</span>`;
      jours.appendChild(li);
    }
    corps.appendChild(jours);
  }
}

customElements.define('outil-meteo', OutilMeteo);
