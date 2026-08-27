/* PICTOGRAMMES DES COMMODITÉS — dessinés par le code, jamais committés.
 *
 * LA DEMANDE. Armelin, le 27/08/2026, montrant restautoroute.fr : « affiche
 * des informations claires avec de beaux logos toutes les commodités et les
 * aires de repos sur le trajet », là où nous affichions « les commodités à
 * proximité uniquement sous forme de liste ».
 *
 * CE QUE CES PICTOS NE SONT PAS : des logos d'enseignes. Les marques sont
 * déposées et la règle du projet interdit tout binaire au dépôt — le NOM de
 * l'enseigne s'écrit en toutes lettres à côté, le picto ne porte que le TYPE
 * (pompe, couverts, tasse, WC). Même arbitrage que les éclairs de puissance.
 *
 * `currentColor` : le picto prend la couleur du texte qui l'entoure — un seul
 * dessin sert le mode clair, le sombre, et les puces colorées.
 */
import type { CleCommodite } from '../lib/commodites';

/* Chaque picto vit dans un carré 24×24, trait de 2, arrondi — la même
   grammaire pour les quatre, pour qu'ils se lisent comme une famille. */
const PICTOS: Record<CleCommodite, string> = {
  carburant:
    '<path d="M5 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>'
    + '<path d="M3.5 21h13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
    + '<path d="M15 9h2.2a1.8 1.8 0 0 1 1.8 1.8V17a1.5 1.5 0 0 0 3 0v-6.6L19.6 8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
    + '<rect x="7.4" y="5.6" width="5.2" height="4.2" rx="0.8" fill="currentColor"/>',
  restauration:
    '<path d="M7 3v7.5M4.5 3v4.5a2.5 2.5 0 0 0 5 0V3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
    + '<path d="M7 10.5V21" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
    + '<path d="M17.5 3c-1.9 0-3 2.6-3 6 0 2.2 1 3 2 3v9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  cafe:
    '<path d="M4 8h11v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V8Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>'
    + '<path d="M15 9.5h2a2.5 2.5 0 0 1 0 5h-2" fill="none" stroke="currentColor" stroke-width="2"/>'
    + '<path d="M7.5 3.5c0 1-1 1.5-1 2.5m4.5-2.5c0 1-1 1.5-1 2.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
  wc:
    '<rect x="3" y="4" width="18" height="16" rx="3" fill="none" stroke="currentColor" stroke-width="2"/>'
    + '<text x="12" y="16" text-anchor="middle" font-family="system-ui, sans-serif" font-size="9" font-weight="700" fill="currentColor">WC</text>',
};

/** Le picto d'un type, en SVG inline — markup engendré depuis des constantes. */
export function svgCommodite(cle: CleCommodite): string {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${PICTOS[cle]}</svg>`;
}
