// <panneau-itineraire> — le planificateur A→B. Deux champs d'adresse (le
// composant de recherche est RÉUTILISÉ, pas dupliqué), deux profils, le
// résultat en distance/durée, et le tracé sur la carte.
//
// LE TRACÉ SURVIT AU CHANGEMENT DE FOND : `setStyle` (sélecteur de fonds)
// détruit toutes les sources ajoutées. Le panneau garde donc le dernier
// itinéraire et le repose à chaque `style.load` — sans cela, basculer en
// satellite effacerait silencieusement le trajet qu'on vient de calculer.
import type { Map as CarteMapLibre, GeoJSONSource } from 'maplibre-gl';
import { Marker } from 'maplibre-gl';
import { RechercheAdresse } from './recherche';
import { calculerItineraire, formaterDistance, formaterDuree, PROFILS, ErreurItineraire, type Profil, type Itineraire } from '../lib/itineraire';
import type { PointGeo } from '../lib/coordonnees';
import type { ResultatAdresse } from '../lib/adresse';
import { versGPX, versKML, telecharger } from '../lib/trace';
import { versFragment, depuisFragment } from '../lib/partage-url';

const SOURCE = 'itineraire';

export class PanneauItineraire extends HTMLElement {
  #carte: CarteMapLibre | null = null;
  #depart: PointGeo | null = null;
  #arrivee: PointGeo | null = null;
  #profil: Profil = 'car';
  #dernier: Itineraire | null = null;
  #marqueurs: Marker[] = [];

  set carte(c: CarteMapLibre) {
    this.#carte = c;
    // Repose le tracé après chaque changement de style (fond).
    c.on('style.load', () => { if (this.#dernier) this.#tracer(this.#dernier); });
  }

  connectedCallback(): void {
    this.innerHTML = `
      <details class="iti">
        <summary aria-label="Ouvrir le planificateur d’itinéraire">Itinéraire</summary>
        <div class="iti-corps">
          <div class="iti-champs">
            <label>Départ<span class="iti-porte" data-role="depart"></span></label>
            <label>Arrivée<span class="iti-porte" data-role="arrivee"></span></label>
          </div>
          <div class="iti-profils" role="radiogroup" aria-label="Mode de déplacement">
            ${(Object.keys(PROFILS) as Profil[]).map((p) => `
              <label class="iti-profil"><input type="radio" name="profil" value="${p}"
                ${p === this.#profil ? 'checked' : ''}><span>${PROFILS[p]}</span></label>`).join('')}
          </div>
          <p class="iti-resultat" role="status" hidden></p>
          <p class="iti-erreur" role="alert" hidden></p>
          <div class="iti-actions" hidden>
            <button type="button" class="iti-gpx">GPX</button>
            <button type="button" class="iti-kml">KML</button>
            <button type="button" class="iti-lien">Copier le lien</button>
            <button type="button" class="iti-effacer">Effacer</button>
          </div>
        </div>
      </details>`;

    for (const role of ['depart', 'arrivee'] as const) {
      const champ = new RechercheAdresse();
      champ.surSelection = (r: ResultatAdresse) => {
        if (role === 'depart') this.#depart = r; else this.#arrivee = r;
        void this.#calculer();
      };
      this.querySelector(`[data-role="${role}"]`)?.appendChild(champ);
    }
    this.querySelectorAll('input[name="profil"]').forEach((r) => {
      r.addEventListener('change', () => {
        this.#profil = (r as HTMLInputElement).value as Profil;
        void this.#calculer();
      });
    });
    this.querySelector('.iti-effacer')?.addEventListener('click', () => this.#effacer());
    this.querySelector('.iti-gpx')?.addEventListener('click', () => {
      if (this.#dernier) telecharger(versGPX(this.#dernier, this.#nomTrajet()),
        'itineraire-infonovice.gpx', 'application/gpx+xml');
    });
    this.querySelector('.iti-kml')?.addEventListener('click', () => {
      if (this.#dernier) telecharger(versKML(this.#dernier, this.#nomTrajet()),
        'itineraire-infonovice.kml', 'application/vnd.google-earth.kml+xml');
    });
    this.querySelector('.iti-lien')?.addEventListener('click', (e) => {
      if (!this.#depart || !this.#arrivee) return;
      const url = location.origin + location.pathname
        + versFragment({ depart: this.#depart, arrivee: this.#arrivee, profil: this.#profil });
      void navigator.clipboard.writeText(url);
      (e.target as HTMLElement).textContent = 'Lien copié !';
      setTimeout(() => { (e.target as HTMLElement).textContent = 'Copier le lien'; }, 1800);
    });

    /* UN LIEN PARTAGÉ S'OUVRE TOUT SEUL : le fragment porte l'itinéraire, on
       le rejoue à l'arrivée. Défensif — un fragment forgé rend null et la
       page s'ouvre normalement. */
    const partage = depuisFragment(location.hash);
    if (partage) {
      this.#depart = partage.depart;
      this.#arrivee = partage.arrivee;
      this.#profil = partage.profil;
      const radio = this.querySelector(`input[name="profil"][value="${partage.profil}"]`);
      if (radio) (radio as HTMLInputElement).checked = true;
      this.querySelector('details')?.setAttribute('open', '');
      // La carte n'est branchée qu'après la construction : on attend le tour
      // de boucle où `carte` est posée.
      queueMicrotask(() => { void this.#calculer(); });
    }
  }

  #nomTrajet(): string {
    return `Itinéraire Infonovice Maps (${PROFILS[this.#profil]})`;
  }

  async #calculer(): Promise<void> {
    if (!this.#carte || !this.#depart || !this.#arrivee) return;
    const resultat = this.querySelector('.iti-resultat') as HTMLElement;
    const erreur = this.querySelector('.iti-erreur') as HTMLElement;
    erreur.hidden = true;
    resultat.hidden = false;
    resultat.textContent = 'Calcul de l’itinéraire…';
    try {
      const iti = await calculerItineraire(this.#depart, this.#arrivee, this.#profil);
      this.#dernier = iti;
      // Le résumé AVANT la pose : distance et durée ne dépendent pas de la
      // carte, et la pose peut légitimement attendre (style en cours de
      // chargement) — l'utilisateur ne doit pas payer cette attente.
      resultat.textContent = `${formaterDistance(iti.distance)} — ${formaterDuree(iti.duree)}`;
      (this.querySelector('.iti-actions') as HTMLElement).hidden = false;
      this.#tracer(iti);
    } catch (e) {
      resultat.hidden = true;
      erreur.textContent = e instanceof ErreurItineraire
        ? e.message : 'Calcul impossible pour le moment.';
      erreur.hidden = false;
    }
  }

  #tracer(iti: Itineraire): void {
    const carte = this.#carte;
    if (!carte) return;
    const donnees = {
      type: 'Feature' as const, properties: {}, geometry: iti.geometrie,
    };
    try {
      const existante = carte.getSource(SOURCE) as GeoJSONSource | undefined;
      if (existante) {
        existante.setData(donnees);
      } else {
        carte.addSource(SOURCE, { type: 'geojson', data: donnees });
        // Le liseré clair sous le trait bleu : lisible sur le plan comme sur
        // l'ortho, sans dépendre du fond.
        carte.addLayer({
          id: 'itineraire-bord', type: 'line', source: SOURCE,
          paint: { 'line-color': '#FFFFFF', 'line-width': 9, 'line-opacity': 0.9 },
          layout: { 'line-cap': 'round', 'line-join': 'round' },
        });
        carte.addLayer({
          id: 'itineraire-trait', type: 'line', source: SOURCE,
          paint: { 'line-color': '#2272C4', 'line-width': 5 },
          layout: { 'line-cap': 'round', 'line-join': 'round' },
        });
      }
    } catch (e) {
      // MapLibre refuse toute pose tant que le STYLE n'a pas fini de charger
      // (rejeu d'un lien partagé plus rapide que le style, onglet ouvert en
      // arrière-plan au rendu suspendu). C'est le SEUL cas différé : la pose
      // se rejouera au prochain style.load — branché dans `set carte`, émis
      // au chargement initial comme à chaque changement de fond. On teste le
      // message faute d'erreur typée côté MapLibre. Un garde isStyleLoaded()
      // ne convient PAS : il attend aussi les tuiles et reste faux au moment
      // même où style.load autorise déjà la pose — en CI, le tracé ne se
      // posait plus jamais (run 32350033200 du 20/08).
      if (e instanceof Error && /style is not done loading/i.test(e.message)) return;
      throw e;
    }

    this.#marqueurs.forEach((m) => m.remove());
    this.#marqueurs = [];
    const points = iti.geometrie.coordinates;
    const premier = points[0]; const dernier = points[points.length - 1];
    if (premier && dernier) {
      this.#marqueurs.push(
        new Marker({ color: '#3FA877' }).setLngLat(premier as [number, number]).addTo(carte),
        new Marker({ color: '#E89C2C' }).setLngLat(dernier as [number, number]).addTo(carte),
      );
      const lons = points.map((c) => c[0] as number); const lats = points.map((c) => c[1] as number);
      carte.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]],
        { padding: 72, duration: 700 });
    }
  }

  #effacer(): void {
    this.#dernier = null; this.#depart = null; this.#arrivee = null;
    this.#marqueurs.forEach((m) => m.remove()); this.#marqueurs = [];
    const carte = this.#carte;
    if (carte?.getSource(SOURCE)) {
      carte.removeLayer('itineraire-trait'); carte.removeLayer('itineraire-bord');
      carte.removeSource(SOURCE);
    }
    (this.querySelector('.iti-resultat') as HTMLElement).hidden = true;
    (this.querySelector('.iti-actions') as HTMLElement).hidden = true;
    this.querySelectorAll('input[type="search"]').forEach((c) => { (c as HTMLInputElement).value = ''; });
  }
}

customElements.define('panneau-itineraire', PanneauItineraire);
