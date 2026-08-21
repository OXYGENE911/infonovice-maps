// Création de la carte : plein écran, fond Plan IGN, contrôles localisés.
// Tout ce qui est TESTABLE hors navigateur vit dans style-ign.ts ; ce module
// ne fait que l'assemblage MapLibre.
import { Map as CarteMapLibre, NavigationControl, GeolocateControl, ScaleControl, Marker, Popup, setWorkerUrl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// LE WORKER DE MAPLIBRE DOIT ÊTRE ÉMIS PAR LE BUILD. MapLibre 6 le charge en
// module séparé, résolu PAR DÉFAUT relativement à son propre fichier — dans
// notre bundle, cela donnait /assets/maplibre-gl-worker.mjs… jamais émis :
// 404 silencieux, et AUCUNE couche GeoJSON (tracé d'itinéraire compris) n'a
// été rendue de v0.5.0 à v0.9.0, en production aussi. Marqueurs DOM et résumé
// masquaient l'absence, et aucun test ne vérifiait les PIXELS (corrigé : le
// parcours E2E interroge désormais queryRenderedFeatures). `?worker&url`
// demande à Vite d'empaqueter le worker AVEC ses imports et d'en émettre
// l'URL ; setWorkerUrl est l'API MapLibre prévue pour la lui donner.
import lienWorkerMaplibre from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

setWorkerUrl(lienWorkerMaplibre);
import { styleCarte, LOCALE_FR, type OptionsStyle } from './style-ign';
import { SelecteurFonds } from './selecteur-fonds';
import { RechercheAdresse } from './recherche';
import { PanneauItineraire } from './panneau-itineraire';
import { adresseInverse } from '../lib/adresse';
import { formaterCoordonnees } from '../lib/coordonnees';

// La métropole entière au premier regard : centre sur la France, zoom qui
// montre le pays sans le noyer. La géolocalisation est un GESTE de
// l'utilisateur (bouton), jamais une demande à l'arrivée — RGPD by design.
const CENTRE_FRANCE: [number, number] = [2.4, 46.6];

export function creerCarte(conteneur: HTMLElement): CarteMapLibre {
  const carte = new CarteMapLibre({
    container: conteneur,
    style: styleCarte({ fond: 'plan' }),
    center: CENTRE_FRANCE,
    zoom: 5.4,
    minZoom: 4,
    maxZoom: 19,
    locale: LOCALE_FR,
    attributionControl: { compact: true },
  });

  carte.addControl(new NavigationControl({ visualizePitch: true }), 'top-right');

  /* LE MODE SOMBRE DU FOND PLAN est un filtre CSS sur le canevas — le
     vectoriel ferait mieux, mais il exigerait glyphes et sprites hébergés ;
     le filtre inversé bien réglé rend le Plan IGN parfaitement lisible de
     nuit, et le satellite reste intouché (inverser une photo n'a pas de
     sens). Décision documentée : on repassera au vectoriel si le besoin
     dépasse ce rendu. */
  const sombre = window.matchMedia('(prefers-color-scheme: dark)');
  const appliquerSombre = (o: OptionsStyle) => {
    conteneur.classList.toggle('fond-sombre', sombre.matches && o.fond === 'plan');
  };

  /* LE PLANIFICATEUR — sous le sélecteur de fonds, même colonne. */
  const panneau = new PanneauItineraire();
  panneau.carte = carte;
  const porteIti = document.createElement('div');
  porteIti.className = 'maplibregl-ctrl porte-iti';
  porteIti.appendChild(panneau);
  carte.addControl({ onAdd: () => porteIti, onRemove: () => porteIti.remove() }, 'top-left');

  const selecteur = new SelecteurFonds();
  selecteur.surChangement = (o) => { carte.setStyle(styleCarte(o)); appliquerSombre(o); };
  const support = document.createElement('div');
  support.className = 'maplibregl-ctrl porte-fonds';
  support.appendChild(selecteur);
  carte.addControl({ onAdd: () => support, onRemove: () => support.remove() }, 'top-left');
  appliquerSombre(selecteur.options);
  sombre.addEventListener('change', () => appliquerSombre(selecteur.options));
  carte.addControl(new GeolocateControl({
    positionOptions: { enableHighAccuracy: true },
    trackUserLocation: true,
  }), 'top-right');
  carte.addControl(new ScaleControl({ unit: 'metric' }), 'bottom-left');

  /* LA RECHERCHE vit dans l'en-tête (elle EST la fonction principale d'une
     carte) ; la sélection pose un marqueur et y vole. */
  const recherche = new RechercheAdresse();
  document.querySelector('.entete')?.appendChild(recherche);
  let marqueur: Marker | null = null;
  recherche.surSelection = (r) => {
    marqueur?.remove();
    marqueur = new Marker({ color: '#2272C4' }).setLngLat([r.lon, r.lat]).addTo(carte);
    carte.flyTo({ center: [r.lon, r.lat], zoom: r.type === 'municipality' ? 13 : 17 });
  };

  /* L'APPUI LONG (500 ms, souris comme doigt) répond « où suis-je ? » :
     adresse inverse BAN + coordonnées au format maison, avec un bouton
     copier. Le déplacement annule l'appui — on ne confond pas un pan avec
     une question. */
  let appui: ReturnType<typeof setTimeout> | undefined;
  carte.on('mousedown', (e) => {
    appui = setTimeout(() => { void montrerAdresse(e.lngLat); }, 500);
  });
  carte.on('touchstart', (e) => {
    if (e.points.length === 1) appui = setTimeout(() => { void montrerAdresse(e.lngLat); }, 500);
  });
  for (const fin of ['mouseup', 'touchend', 'move', 'dragstart'] as const) {
    carte.on(fin, () => clearTimeout(appui));
  }

  async function montrerAdresse(ou: { lng: number; lat: number }): Promise<void> {
    const point = { lon: ou.lng, lat: ou.lat };
    const coords = formaterCoordonnees(point);
    const popup = new Popup({ closeButton: true, maxWidth: '320px' })
      .setLngLat(ou)
      .setHTML('<div class="popup-adresse"><p class="pa-libelle">Recherche de l’adresse…</p>'
        + `<p class="pa-coords"></p><button type="button" class="pa-copier">Copier les coordonnées</button></div>`)
      .addTo(carte);
    const bloc = popup.getElement();
    (bloc.querySelector('.pa-coords') as HTMLElement).textContent = coords;
    bloc.querySelector('.pa-copier')?.addEventListener('click', () => {
      void navigator.clipboard.writeText(coords);
      (bloc.querySelector('.pa-copier') as HTMLElement).textContent = 'Copié !';
    });
    try {
      const adresse = await adresseInverse(point);
      (bloc.querySelector('.pa-libelle') as HTMLElement).textContent =
        adresse ? adresse.libelle : 'Aucune adresse connue à cet endroit.';
    } catch {
      (bloc.querySelector('.pa-libelle') as HTMLElement).textContent =
        'Adresse indisponible pour le moment.';
    }
  }

  // Poignée de débogage et d'E2E : lire l'état de la carte depuis la console
  // ou Playwright. Lecture seule par convention — rien du produit n'en dépend.
  (window as unknown as { __carte: CarteMapLibre }).__carte = carte;

  return carte;
}
