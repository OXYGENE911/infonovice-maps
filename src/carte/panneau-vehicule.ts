/* <panneau-vehicule> — le profil du véhicule électrique et son rayon d'action.
 *
 * TOUT VIT DANS LE NAVIGATEUR. La capacité de la batterie, sa santé, l'état de
 * charge : rien de tout cela ne sort, rien n'est envoyé nulle part, et il n'y
 * a aucun compte à créer. C'est la contrainte 4 du projet, et c'est aussi ce
 * que la page « Vie privée » promet en toutes lettres.
 *
 * LES ANNEAUX DISENT « AU MIEUX, À PLAT ». Ils ignorent le relief, le vent, le
 * style de conduite et la charge du véhicule. L'interface le dit sous les
 * anneaux plutôt que de laisser croire à une prédiction — c'est la même ligne
 * éditoriale que la PR #15, qui a préféré écrire « abandonné, avec la mesure »
 * plutôt que de promettre des horaires à moitié.
 */
import type { Map as CarteMapLibre, GeoJSONSource } from 'maplibre-gl';
import { lirePreference, ecrirePreference } from '../lib/stockage';
import {
  autonomies, consommationsDepuisEssais, capaciteReelle,
  CONTEXTES, type Vehicule, type CleContexte,
} from '../lib/vehicule';
import { collectionAnneaux } from '../lib/cercle';

export const PREF_VEHICULE = 'vehicule';
const SOURCE = 'rayon-action';

/* UN VÉHICULE PAR DÉFAUT QUI NE PRÉTEND RIEN. Zéro partout : tant que l'usager
   n'a rien saisi, aucun anneau ne se dessine, et le panneau le dit. Inventer
   une « voiture moyenne » afficherait un rayon crédible et faux. */
const VIDE: Vehicule = {
  nom: '', capaciteNominale: 0, soce: 100, soc: 80,
  consommations: { ville: 0, route: 0, autoroute: 0 },
  puissanceMaxKw: 0,
};

/** Ce qu'on demande à l'usager : des kilomètres, pas des kWh/100 km. Personne
 *  ne connaît sa consommation ; tout le monde sait jusqu'où il va. */
interface Essais { ville: number; route: number; autoroute: number }

export class PanneauVehicule extends HTMLElement {
  #carte: CarteMapLibre | null = null;
  #vehicule: Vehicule = { ...VIDE, consommations: { ...VIDE.consommations } };
  #essais: Essais = { ville: 0, route: 0, autoroute: 0 };
  #actif = false;

  set carte(c: CarteMapLibre) {
    if (this.#carte) return;
    this.#carte = c;
    // setStyle détruit les sources : on repose, même contrat que les autres.
    c.on('style.load', () => { this.#poser(); });
    // Les anneaux suivent le centre de la carte : ils entourent « d'ici ».
    c.on('moveend', () => { if (this.#actif) this.#poser(); });
  }

  connectedCallback(): void {
    if (this.firstElementChild) return;
    const champ = (cle: string, libelle: string, unite: string, pas = '1') => `
      <label class="veh-ligne">${libelle}
        <span><input type="number" class="veh-champ" data-cle="${cle}"
          min="0" step="${pas}" inputmode="decimal"
          aria-label="${libelle}"> <em>${unite}</em></span>
      </label>`;

    this.innerHTML = `
      <details class="vehicule">
        <summary aria-label="Mon véhicule électrique">Véhicule</summary>
        <fieldset class="veh-corps">
          <legend>Mon véhicule électrique</legend>

          <label class="veh-ligne">Nom
            <span><input type="text" class="veh-nom" placeholder="VinFast VF8"
              aria-label="Nom du véhicule"></span>
          </label>
          ${champ('capaciteNominale', 'Batterie', 'kWh', '0.1')}
          ${champ('soce', 'Santé (SOCE)', '%')}
          ${champ('soc', 'Charge (SOC)', '%')}
          ${champ('puissanceMaxKw', 'Charge max', 'kW')}

          <p class="veh-titre">Autonomie constatée à pleine charge</p>
          ${CONTEXTES.map((c) => champ(`essai-${c.cle}`, c.libelle, 'km')).join('')}
          <p class="veh-note">Vos relevés, pas la fiche du constructeur : c’est
            ce qui rend le calcul juste pour VOTRE voiture.</p>

          <label class="veh-bascule">
            <input type="checkbox" class="veh-anneaux"> Afficher mon rayon d’action
          </label>
          <div class="veh-bilan" role="status"></div>
        </fieldset>
      </details>`;

    this.querySelector('.veh-nom')?.addEventListener('input', (e) => {
      this.#vehicule.nom = (e.target as HTMLInputElement).value;
      this.#enregistrer();
    });

    this.querySelectorAll<HTMLInputElement>('.veh-champ').forEach((c) => {
      c.addEventListener('input', () => {
        const valeur = Number(c.value);
        const cle = c.dataset['cle'] ?? '';
        const nombre = Number.isFinite(valeur) && valeur >= 0 ? valeur : 0;
        if (cle.startsWith('essai-')) {
          this.#essais[cle.slice(6) as CleContexte] = nombre;
        } else if (cle === 'capaciteNominale' || cle === 'soce' || cle === 'soc'
          || cle === 'puissanceMaxKw') {
          this.#vehicule[cle] = nombre;
        }
        this.#recalculer();
      });
    });

    this.querySelector<HTMLInputElement>('.veh-anneaux')?.addEventListener('change', (e) => {
      this.#actif = (e.target as HTMLInputElement).checked;
      this.#enregistrer();
      this.#poser();
    });

    void this.#restaurer();
  }

  /* Les consommations se DÉDUISENT des relevés — un seul endroit où la vérité
     est saisie, pas deux qui pourraient se contredire. */
  #recalculer(): void {
    this.#vehicule.consommations = consommationsDepuisEssais(
      capaciteReelle(this.#vehicule), this.#essais,
    );
    this.#enregistrer();
    this.#bilan();
    if (this.#actif) this.#poser();
  }

  #enregistrer(): void {
    void ecrirePreference(PREF_VEHICULE, {
      vehicule: this.#vehicule, essais: this.#essais, anneaux: this.#actif,
    });
  }

  async #restaurer(): Promise<void> {
    // Frontière système : la valeur relue se valide, elle ne se croit pas.
    const memo = await lirePreference<unknown>(PREF_VEHICULE);
    const m = (memo ?? {}) as Record<string, unknown>;
    const v = (m['vehicule'] ?? {}) as Record<string, unknown>;
    const e = (m['essais'] ?? {}) as Record<string, unknown>;
    const nombre = (x: unknown, defaut = 0): number =>
      (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? x : defaut);

    this.#vehicule = {
      nom: typeof v['nom'] === 'string' ? v['nom'] : '',
      capaciteNominale: nombre(v['capaciteNominale']),
      soce: nombre(v['soce'], 100),
      soc: nombre(v['soc'], 80),
      consommations: { ville: 0, route: 0, autoroute: 0 },
      puissanceMaxKw: nombre(v['puissanceMaxKw']),
    };
    for (const { cle } of CONTEXTES) this.#essais[cle] = nombre(e[cle]);
    this.#actif = m['anneaux'] === true;

    const nom = this.querySelector<HTMLInputElement>('.veh-nom');
    if (nom) nom.value = this.#vehicule.nom;
    this.querySelectorAll<HTMLInputElement>('.veh-champ').forEach((c) => {
      const cle = c.dataset['cle'] ?? '';
      const valeur = cle.startsWith('essai-')
        ? this.#essais[cle.slice(6) as CleContexte]
        : this.#vehicule[cle as 'capaciteNominale' | 'soce' | 'soc' | 'puissanceMaxKw'];
      if (valeur > 0) c.value = String(valeur);
    });
    const bascule = this.querySelector<HTMLInputElement>('.veh-anneaux');
    if (bascule) bascule.checked = this.#actif;

    this.#recalculer();
  }

  #bilan(): void {
    const boite = this.querySelector<HTMLElement>('.veh-bilan');
    if (!boite) return;
    boite.textContent = '';

    const capacite = capaciteReelle(this.#vehicule);
    if (capacite <= 0) {
      boite.textContent = 'Renseignez la batterie pour voir votre rayon d’action.';
      return;
    }

    /* LA DÉGRADATION SE DIT EN KILOMÈTRES, pas en pourcents. « Votre batterie a
       perdu 5,3 kWh, soit 26 km d'autoroute » se comprend ; « SOCE 94 % » ne
       dit rien à personne. */
    const perdus = this.#vehicule.capaciteNominale - capacite;
    const a = autonomies(this.#vehicule);
    const lignes: string[] = [];
    for (const c of CONTEXTES) {
      if (a[c.cle] > 0) lignes.push(`${c.libelle} : ${Math.round(a[c.cle])} km`);
    }
    if (lignes.length === 0) {
      boite.textContent = 'Renseignez au moins une autonomie constatée.';
      return;
    }

    const p = document.createElement('p');
    p.className = 'veh-bilan-lignes';
    p.textContent = lignes.join(' · ');
    boite.appendChild(p);

    if (perdus > 0.05 && a.autoroute > 0) {
      const km = Math.round((perdus / (this.#vehicule.consommations.autoroute || 1)) * 100);
      const d = document.createElement('p');
      d.className = 'veh-bilan-usure';
      d.textContent = `Usure de la batterie : ${perdus.toFixed(1)} kWh perdus,`
        + ` soit environ ${km} km d’autoroute.`;
      boite.appendChild(d);
    }

    const note = document.createElement('p');
    note.className = 'veh-bilan-reserve';
    note.textContent = 'Au mieux, à plat, par temps doux : ni le relief,'
      + ' ni le vent, ni votre conduite ne sont pris en compte.';
    boite.appendChild(note);
  }

  #poser(): void {
    const carte = this.#carte;
    if (!carte || !carte.isStyleLoaded()) return;

    const centre = carte.getCenter();
    const a = autonomies(this.#vehicule);
    const donnees = this.#actif
      ? collectionAnneaux(centre.lng, centre.lat, CONTEXTES.map((c) => ({
        cle: c.cle, rayonKm: a[c.cle], couleur: c.couleur,
      })))
      : { type: 'FeatureCollection' as const, features: [] };

    const source = carte.getSource(SOURCE) as GeoJSONSource | undefined;
    if (source) { source.setData(donnees); return; }

    carte.addSource(SOURCE, { type: 'geojson', data: donnees });
    /* CONTOUR SEUL, PAS DE REMPLISSAGE. Trois disques empilés sur une carte la
       rendent illisible ; trois traits la laissent lisible. */
    carte.addLayer({
      id: 'rayon-action-trait', type: 'line', source: SOURCE,
      paint: {
        'line-color': ['get', 'couleur'],
        'line-width': 2.5,
        'line-opacity': 0.9,
        'line-dasharray': [3, 2],
      },
    });
  }
}

customElements.define('panneau-vehicule', PanneauVehicule);
