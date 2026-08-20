// Création de la carte : plein écran, fond Plan IGN, contrôles localisés.
// Tout ce qui est TESTABLE hors navigateur vit dans style-ign.ts ; ce module
// ne fait que l'assemblage MapLibre.
import { Map as CarteMapLibre, NavigationControl, GeolocateControl, ScaleControl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { styleCarte, LOCALE_FR, type OptionsStyle } from './style-ign';
import { SelecteurFonds } from './selecteur-fonds';

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

  return carte;
}
