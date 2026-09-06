/* PICTOGRAMMES DES AIRES D'AUTOROUTE — dessinés par le code, jamais committés
 * (AIRES-PICTOS-1, 06/09). Le RESTE d'AIRES-1 : « pictogrammes SVG dessinés
 * (émojis pour l'instant) ». Un émoji change de dessin d'un téléphone à
 * l'autre — et manque parfois — quand un panneau d'aire doit se lire d'un
 * coup d'œil, à 130 km/h. Même grammaire que les commodités des bornes
 * (icone-commodite.ts) : carré 24×24, trait de 2, arrondi, `currentColor`.
 * Les quatre types partagés (carburant, restauration, café, WC) sont les
 * MÊMES dessins — une seule famille sur toute l'application.
 */
import { svgCommodite } from './icone-commodite';

const T = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';

const PICTOS: Record<string, string> = {
  recharge: `<path d="M13 2 5 13.5h6L10 22l9-11.5h-6L13 2Z" ${T}/>`,
  boutique: `<path d="M5 8h14l-1 12H6L5 8Z" ${T}/><path d="M9 8V6a3 3 0 0 1 6 0v2" ${T}/>`,
  douche: `<path d="M6 21v-9a5 5 0 0 1 5-5h1a3 3 0 0 1 3 3v1" ${T}/>`
    + `<path d="M11 10h8" ${T}/><path d="M12.5 13.5v1.5M15 13.5v1.5M17.5 13.5v1.5M12.5 18v1.5M15 18v1.5M17.5 18v1.5" ${T}/>`,
  'pique-nique': `<path d="M4 9h16M7 9l-2 10M17 9l2 10M6 15h12" ${T}/>`,
  jeux: `<circle cx="12" cy="12" r="8" ${T}/><path d="M12 4a8 8 0 0 1 0 16M4 12h16" ${T}/>`,
  hotel: `<path d="M3 19V7M3 15h18v4M21 15v-4a2 2 0 0 0-2-2h-8v6" ${T}/><circle cx="7" cy="11" r="2" ${T}/>`,
};

/** Le picto d'une commodité d'aire, en SVG inline — `•` dessiné à défaut. */
export function svgAire(cle: string): string {
  if (cle === 'carburant' || cle === 'restauration' || cle === 'cafe') return svgCommodite(cle);
  if (cle === 'toilettes') return svgCommodite('wc');
  const dessin = PICTOS[cle] ?? `<circle cx="12" cy="12" r="3" fill="currentColor"/>`;
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${dessin}</svg>`;
}
