/* <outil-mesure> — mesurer une distance sur la carte, point après point.
 *
 * MESURE-1 (05/09/2026). Des amis d'Armelin : « des outils dans le menu :
 * mesurer une distance A→B, et un parcours dessiné point à point ». Un volet
 * du menu lance la mesure ; le menu se referme, un relevé flottant en haut de
 * la carte dit où l'on en est, chaque touche sur la carte pose un point, le
 * trait se dessine, la distance se cumule. « Annuler le dernier point »,
 * « Effacer », « Terminer » — et Échap termine aussi.
 *
 * « TOUTE FONCTION CACHÉE À L'UTILISATEUR EST UNE FONCTION INUTILISABLE » :
 * le relevé est VISIBLE dès le premier instant (« Touchez la carte pour poser
 * le premier point »), il n'attend pas un geste pour paraître. Et il dit
 * « à vol d'oiseau » : une distance de carte n'est pas une distance de route.
 *
 * AUCUN RÉSEAU : tout se calcule ici. */
import type { Map as CarteMapLibre, GeoJSONSource } from 'maplibre-gl';
import { refermerPanneaux } from './panneaux';
import { bilanMesure, geojsonMesure, formaterDistance, type PointMesure } from '../lib/mesure';

const SOURCE = 'mesure';
const TRAIT = 'mesure-trait';
const POINTS = 'mesure-points';
const SURFACE = 'mesure-surface';
const ACCENT = '#2272C4';

export class OutilMesure extends HTMLElement {
  #carte: CarteMapLibre | null = null;
  #points: PointMesure[] = [];
  #actif = false;
  #ferme = false;
  #releve: HTMLElement | null = null;

  connectedCallback(): void {
    if (this.#releve) return;
    /* SANS FORMULAIRE (OUTILS-2, 06/09) : l'outil est une TUILE du volet
       « Outils » (outils-menu.ts) dont l'action appelle `demarrer()` ; cet
       élément ne rend rien lui-même, il porte le relevé et le dessin. */

    /* LE RELEVÉ VIT SUR LE BODY : #carte crée son contexte d'empilement
       (leçon BLANC-1), et le menu se referme au départ de la mesure. */
    const releve = document.createElement('div');
    releve.className = 'mesure-releve';
    releve.hidden = true;
    releve.setAttribute('role', 'status');
    releve.setAttribute('aria-label', 'Mesure en cours');
    releve.innerHTML = `
      <p class="mesure-texte"></p>
      <ol class="mesure-segments" aria-label="Distance de chaque tronçon"></ol>
      <div class="mesure-actions">
        <button type="button" class="mesure-annuler">Annuler le dernier point</button>
        <button type="button" class="mesure-fermer" aria-pressed="false">Fermer la surface</button>
        <button type="button" class="mesure-effacer">Effacer</button>
        <button type="button" class="mesure-terminer">Terminer</button>
      </div>`;
    /* FERMER LA SURFACE (MESURE-2, 06/09) : Armelin — « un bouton pour relier
       le premier point et le dernier afin de sceller une surface à calculer
       et afficher sa superficie et son périmètre ». Un pressoir : fermée, la
       figure dit sa surface ; rouverte, elle redit sa longueur. */
    releve.querySelector('.mesure-fermer')?.addEventListener('click', () => {
      this.#ferme = !this.#ferme;
      this.#poser();
    });
    releve.querySelector('.mesure-annuler')?.addEventListener('click', () => {
      this.#points.pop();
      this.#poser();
    });
    releve.querySelector('.mesure-effacer')?.addEventListener('click', () => {
      this.#points = [];
      this.#poser();
    });
    releve.querySelector('.mesure-terminer')?.addEventListener('click', () => { this.terminer(); });
    /* Les clics dans le relevé ne sont pas des clics « à côté » pour les
       volets (panneaux.ts écoute le document). */
    releve.addEventListener('pointerdown', (e) => { e.stopPropagation(); });
    document.body.appendChild(releve);
    this.#releve = releve;

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.#actif) this.terminer();
    });
  }

  set carte(c: CarteMapLibre) {
    this.#carte = c;
    c.on('click', (e) => {
      if (!this.#actif) return;
      this.#points.push([e.lngLat.lng, e.lngLat.lat]);
      this.#poser();
    });
    /* Un changement de fond rejoue le style : le dessin se repose, comme le
       tracé d'itinéraire et les anneaux du véhicule. */
    c.on('style.load', () => { if (this.#actif) this.#poser(); });
  }

  get actif(): boolean { return this.#actif; }

  demarrer(): void {
    if (this.#actif) return;
    this.#actif = true;
    document.body.classList.add('mesure-active');
    /* LE MENU SE REFERME : la carte doit être libre pour poser les points,
       et le relevé dit tout de suite quoi faire. */
    refermerPanneaux(document);
    const volet = this.closest<HTMLDetailsElement>('details');
    if (volet) volet.open = false;
    if (this.#releve) this.#releve.hidden = false;
    this.#poser();
    this.#releve?.querySelector<HTMLButtonElement>('.mesure-terminer')?.focus();
  }

  terminer(): void {
    if (!this.#actif) return;
    this.#actif = false;
    this.#points = [];
    this.#ferme = false;
    document.body.classList.remove('mesure-active');
    if (this.#releve) this.#releve.hidden = true;
    this.#poser();
  }

  #poser(): void {
    const bilan = bilanMesure(this.#points, this.#ferme);
    const texte = this.#releve?.querySelector<HTMLElement>('.mesure-texte');
    if (texte) texte.textContent = bilan.texte;
    const annuler = this.#releve?.querySelector<HTMLButtonElement>('.mesure-annuler');
    if (annuler) annuler.disabled = bilan.nb === 0;
    const effacer = this.#releve?.querySelector<HTMLButtonElement>('.mesure-effacer');
    if (effacer) effacer.disabled = bilan.nb === 0;
    /* LES TRONÇONS SOUS LE TOTAL (MESURE-2) : « afficher en dessous la
       distance entre chaque tronçon ». Fermée, la figure ajoute le retour. */
    const segments = this.#releve?.querySelector<HTMLElement>('.mesure-segments');
    if (segments) {
      segments.replaceChildren();
      bilan.segmentsM.forEach((m, i) => {
        const li = document.createElement('li');
        li.textContent = `${i + 1} → ${i + 2} : ${formaterDistance(m)}`;
        segments.appendChild(li);
      });
      if (bilan.surfaceM2 !== null && bilan.perimetreM !== null) {
        const li = document.createElement('li');
        li.className = 'mesure-segment-retour';
        li.textContent = `${bilan.nb} → 1 : ${formaterDistance(bilan.perimetreM - bilan.totalM)} (retour)`;
        segments.appendChild(li);
      }
      segments.hidden = segments.children.length === 0;
    }
    const fermer = this.#releve?.querySelector<HTMLButtonElement>('.mesure-fermer');
    if (fermer) {
      fermer.disabled = bilan.nb < 3;
      fermer.setAttribute('aria-pressed', String(this.#ferme && bilan.nb >= 3));
      fermer.textContent = this.#ferme && bilan.nb >= 3 ? 'Rouvrir le tracé' : 'Fermer la surface';
    }

    const carte = this.#carte;
    if (!carte) return;
    const donnees = geojsonMesure(this.#points, this.#ferme);
    /* ON TENTE, ET L'ON NE DIFFÈRE QUE SUR L'ÉCHEC RÉEL — le contrat des
       anneaux du véhicule et du tracé d'itinéraire. */
    try {
      const source = carte.getSource(SOURCE) as GeoJSONSource | undefined;
      if (source) { source.setData(donnees); return; }
      carte.addSource(SOURCE, { type: 'geojson', data: donnees });
    } catch (e) {
      if (e instanceof Error && /style is not done loading/i.test(e.message)) {
        carte.once('idle', () => { this.#poser(); });
        return;
      }
      throw e;
    }
    carte.addLayer({
      id: SURFACE, type: 'fill', source: SOURCE, filter: ['==', ['geometry-type'], 'Polygon'],
      paint: { 'fill-color': ACCENT, 'fill-opacity': 0.16 },
    });
    carte.addLayer({
      id: TRAIT, type: 'line', source: SOURCE, filter: ['==', ['geometry-type'], 'LineString'],
      paint: { 'line-color': ACCENT, 'line-width': 3, 'line-dasharray': [2, 1.5] },
    });
    carte.addLayer({
      id: POINTS, type: 'circle', source: SOURCE, filter: ['==', ['geometry-type'], 'Point'],
      paint: {
        'circle-radius': 6, 'circle-color': '#FFFFFF',
        'circle-stroke-color': ACCENT, 'circle-stroke-width': 3,
      },
    });
  }
}

customElements.define('outil-mesure', OutilMesure);
