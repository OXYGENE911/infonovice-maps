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
import {
  CATALOGUE, libelleModele, modeleParCle, autonomiesProposees,
} from '../lib/catalogue-vehicules';

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
  /* LA RESTAURATION NE DOIT JAMAIS ÉCRASER UN CHOIX DÉJÀ FAIT.
     La lecture IndexedDB est ASYNCHRONE : un usager rapide — ou une machine
     chargée — peut cocher « Afficher mon rayon d'action », le décocher, et
     voir la case se RECOCHER toute seule quand la lecture, partie avant ses
     gestes, se résout enfin avec l'ancienne valeur. Rien ne le signale ; on
     croit avoir mal cliqué.
     Attrapé par un parcours E2E qui ne rougissait QUE dans la suite complète,
     c'est-à-dire quand la machine est assez chargée pour que la lecture arrive
     en retard. Le panneau des points d'intérêt porte le même garde-fou, pour
     la même raison. */
  #touche = false;
  /* LA POSITION DU VÉHICULE, quand la géolocalisation l'a donnée. Les anneaux
     l'entourent ELLE, pas le centre de la carte : faire glisser la carte ne
     déplace pas la voiture. Tant qu'aucune position n'est connue, ils
     entourent le centre — et l'interface le DIT, plutôt que de laisser croire
     à une mesure. */
  #position: { lon: number; lat: number } | null = null;

  set position(p: { lon: number; lat: number }) {
    this.#position = p;
    this.#bilan();
    if (this.#actif) this.#poser();
  }

  set carte(c: CarteMapLibre) {
    if (this.#carte) return;
    this.#carte = c;
    // setStyle détruit les sources : on repose, même contrat que les autres.
    c.on('style.load', () => { this.#poser(); });
    /* On ne suit le déplacement de la carte QUE tant qu'aucune position GPS
       n'est connue — sinon les anneaux s'ancrent sur le véhicule. */
    c.on('moveend', () => { if (this.#actif && !this.#position) this.#poser(); });
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

          <!-- LE CATALOGUE PRÉ-REMPLIT, IL NE VERROUILLE PAS. Saisir cinq
               chiffres avant de pouvoir se servir du planificateur est un
               péage à l'entrée : beaucoup ne le franchissent pas, et ceux qui
               le franchissent y mettent des approximations. Chaque champ reste
               modifiable après application. -->
          <label class="veh-ligne veh-ligne-catalogue">Modèle
            <span><select class="veh-catalogue" aria-label="Choisir un modèle de véhicule">
              <option value="">— saisie manuelle —</option>
              ${CATALOGUE.map((m) => `
                <option value="${m.cle}">${libelleModele(m)}</option>`).join('')}
            </select></span>
          </label>
          <p class="veh-note veh-note-catalogue">Valeurs constructeur
            indicatives, pré-remplies puis modifiables. L’autonomie proposée
            découle du cycle WLTP, optimiste sur autoroute : remplacez-la par
            vos propres relevés dès votre premier long trajet.</p>

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
      this.#touche = true;
      this.#vehicule.nom = (e.target as HTMLInputElement).value;
      this.#enregistrer();
    });

    this.querySelectorAll<HTMLInputElement>('.veh-champ').forEach((c) => {
      c.addEventListener('input', () => {
        this.#touche = true;
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

    /* APPLIQUER UN MODÈLE remplit les champs ET l'état interne, puis
       recalcule. Écrire dans les seuls champs du formulaire ne suffirait
       pas : l'application lit son état, pas le DOM, et le bilan resterait
       muet jusqu'à ce que l'usager touche une case au hasard. */
    this.querySelector<HTMLSelectElement>('.veh-catalogue')?.addEventListener('change', (e) => {
      this.#touche = true;
      const modele = modeleParCle((e.target as HTMLSelectElement).value);
      if (!modele) return;
      const km = autonomiesProposees(modele);
      this.#vehicule = {
        ...this.#vehicule,
        nom: libelleModele(modele),
        capaciteNominale: modele.capaciteKwh,
        /* LA SANTÉ REVIENT À 100 % : le catalogue décrit une voiture NEUVE.
           Garder la santé d'un véhicule précédent appliquerait sa dégradation
           à un modèle qui n'a rien à voir. L'usager corrige ensuite. */
        soce: 100,
        puissanceMaxKw: modele.puissanceMaxKw,
      };
      this.#essais = { ...km };
      this.#refletChamps();
      this.#recalculer();
    });

    this.querySelector<HTMLInputElement>('.veh-anneaux')?.addEventListener('change', (e) => {
      this.#touche = true;
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

  /** Recopie l'état interne dans les champs. Une seule écriture du DOM, que
      la restauration et le catalogue partagent — deux copies divergeraient. */
  #refletChamps(): void {
    const nom = this.querySelector<HTMLInputElement>('.veh-nom');
    if (nom) nom.value = this.#vehicule.nom;
    this.querySelectorAll<HTMLInputElement>('.veh-champ').forEach((c) => {
      const cle = c.dataset['cle'] ?? '';
      const valeur = cle.startsWith('essai-')
        ? this.#essais[cle.slice(6) as CleContexte]
        : this.#vehicule[cle as 'capaciteNominale' | 'soce' | 'soc' | 'puissanceMaxKw'];
      /* ON N'ÉCRASE PAS UN CHAMP AVEC UN ZÉRO : le catalogue ne connaît pas
         l'état de charge du jour, et l'effacer à chaque changement de modèle
         obligerait à le ressaisir sans raison. */
      if (valeur > 0) c.value = String(valeur);
    });
  }

  #enregistrer(): void {
    void ecrirePreference(PREF_VEHICULE, {
      vehicule: this.#vehicule, essais: this.#essais, anneaux: this.#actif,
    });
  }

  async #restaurer(): Promise<void> {
    // Frontière système : la valeur relue se valide, elle ne se croit pas.
    const memo = await lirePreference<unknown>(PREF_VEHICULE);
    /* ET ELLE S'EFFACE DEVANT L'USAGER. Voir `#touche` : ce qui vient d'être
       saisi ou décoché prime sur ce qui dormait en base. */
    if (this.#touche) return;
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

    this.#refletChamps();
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

    /* D'OÙ PART LE RAYON ? La question n'est pas cosmétique : un anneau centré
       sur le regard plutôt que sur la voiture donne une réponse fausse. On dit
       donc lequel des deux sert d'ancre. */
    const ancre = document.createElement('p');
    ancre.className = 'veh-bilan-ancre';
    ancre.textContent = this.#position
      ? 'Rayon mesuré depuis votre position.'
      : 'Rayon mesuré depuis le centre de la carte — activez « Me localiser »'
        + ' pour le rattacher à votre position.';
    boite.appendChild(ancre);
  }

  #poser(): void {
    const carte = this.#carte;
    if (!carte) return;
    /* UNE DEMANDE ARRIVÉE TROP TÔT NE SE PERD PAS, ELLE ATTEND.
       Ce garde-fou rendait `undefined` en silence quand le style n'était pas
       prêt : décocher « Afficher mon rayon d'action » à cet instant ne faisait
       RIEN, les anneaux restaient, et aucun message ne l'expliquait. Il ne
       fallait qu'une machine chargée pour le déclencher — un parcours E2E ne
       rougissait que dans la suite complète, jamais seul.
       `style.load` ne suffit pas à rattraper : il ne se déclenche qu'au
       CHANGEMENT de fond, pas quand un style déjà posé finit de se charger.
       `idle` si. */
    if (!carte.isStyleLoaded()) {
      carte.once('idle', () => { this.#poser(); });
      return;
    }

    const ancre = this.#position ?? {
      lon: carte.getCenter().lng, lat: carte.getCenter().lat,
    };
    const a = autonomies(this.#vehicule);
    const donnees = this.#actif
      ? collectionAnneaux(ancre.lon, ancre.lat, CONTEXTES.map((c) => ({
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
