/* LES FLÈCHES DE MANŒUVRE — dessinées par le code, comme les éclairs et les
 * pictogrammes de commodités : rien de committé, tout se relit en revue.
 *
 * LA DEMANDE (PR C du cadrage navigation mobile) : « indiquer les flèches de
 * direction à chaque intersection ou sortie ». La PHRASE reste la vérité — la
 * flèche l'anticipe d'un coup d'œil, à la taille qu'on lit depuis un support
 * de téléphone.
 *
 * UNE SEULE FLÈCHE, HUIT ROTATIONS : les manœuvres directionnelles sont le
 * même tracé tourné — c'est ce qui les rend cohérentes entre elles. Le
 * rond-point et l'arrivée ont leur propre glyphe : les tourner n'aurait pas
 * de sens.
 */
import type { Manoeuvre } from '../lib/feuille-de-route';

/** L'angle de chaque manœuvre directionnelle, en degrés horaires. */
export const ANGLES: Partial<Record<Manoeuvre, number>> = {
  straight: 0,
  'slight right': 45,
  right: 90,
  'sharp right': 135,
  uturn: 180,
  'sharp left': -135,
  left: -90,
  'slight left': -45,
};

/* Une flèche pleine, pointe en haut, dans un carré 24×24 — tige épaisse pour
   rester lisible en petit. */
const FLECHE =
  '<path d="M12 3 5.5 10.5h4V20h5v-9.5h4Z" fill="currentColor"/>';

/* Le rond-point : un anneau ouvert, flèche de sortie vers le haut. */
const ROND_POINT =
  '<path d="M12 20a6.5 6.5 0 1 1 6.2-8.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>'
  + '<path d="M12 3 8.5 8h7Z" fill="currentColor"/>'
  + '<path d="M12 8v2" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>';

/* L'arrivée : le fanion du but. */
const ARRIVEE =
  '<path d="M7 21V4" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>'
  + '<path d="M7 4h10l-2.4 3.5L17 11H7Z" fill="currentColor"/>';

/** Le SVG d'une manœuvre — markup engendré depuis des constantes. */
export function flecheManoeuvre(m: Manoeuvre): string {
  let contenu: string;
  if (m === 'rond-point') contenu = ROND_POINT;
  else if (m === 'arrivee') contenu = ARRIVEE;
  else {
    const angle = ANGLES[m] ?? 0;
    contenu = angle === 0 ? FLECHE
      : `<g transform="rotate(${angle} 12 12)">${FLECHE}</g>`;
  }
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${contenu}</svg>`;
}
