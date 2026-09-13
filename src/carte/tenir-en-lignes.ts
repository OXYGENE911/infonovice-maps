/* UN TEXTE QUI NE DÉBORDE PAS DU CADRE (TERRAIN-2, retour du CEO du 11/09).
 *
 * ARMELIN, SON TÉLÉPHONE EN MAIN : « un texte long déborde du cadre ». Le
 * cartouche d'instruction est un panneau de direction : il a une taille, et
 * l'instruction doit tenir DEDANS. Jusqu'ici l'instruction s'écrivait à
 * 23 px quoi qu'elle dise, et « À l'embranchement, restez légèrement à droite
 * vers A4/E54 » demandait quatre lignes sur un écran de 360 px.
 *
 * DEUX LIGNES AU MAXIMUM, ET DANS CET ORDRE :
 *   1. on réduit la police PAR PALIERS, tant que le texte ne tient pas ;
 *   2. si aucun palier ne suffit, ALORS seulement on coupe à l'ellipse.
 * L'ordre n'est pas un détail : une instruction de navigation coupée est une
 * instruction fausse, tandis qu'une instruction plus petite reste juste.
 * L'ellipse est le dernier recours, jamais le premier.
 *
 * ON NE DESCEND PAS SOUS 60 % : en dessous, on aurait remplacé un texte qui
 * déborde par un texte qu'on ne lit plus — au volant, c'est le même défaut.
 * Le palier le plus bas garde donc l'ellipse en filet.
 *
 * MESURÉ, PAS DEVINÉ. Chaque palier est ESSAYÉ puis MESURÉ dans le navigateur :
 * aucune table « tant de caractères = tant de lignes » ne tiendrait — la
 * largeur dépend de la police servie, du zoom du système, de la langue, et
 * d'un cadre qui n'a pas la même largeur sur un téléphone et sur un écran
 * d'ordinateur.
 */

/** La classe posée quand plus rien ne tient : l'ellipse, en dernier recours. */
export const CLASSE_COUPE = 'texte-coupe';

/** Les paliers de réduction, du plein au plus petit encore lisible. */
export const PALIERS: readonly number[] = [1, 0.92, 0.84, 0.76, 0.68, 0.6];

/**
 * Le nombre de lignes occupées — PURE, et c'est la seule part qui se teste à
 * sec. Le reste est une mesure, et une mesure ne se simule pas.
 *
 * L'ARRONDI EST AU PLUS PROCHE, et il compte : les navigateurs rendent des
 * hauteurs en sous-pixels (28,79 px pour deux lignes de 14,4), et un
 * `Math.ceil` y aurait vu trois lignes — le texte aurait rétréci jusqu'au
 * dernier palier sans aucune raison.
 */
export function nombreDeLignes(hauteurPx: number, interlignePx: number): number {
  if (!Number.isFinite(interlignePx) || interlignePx <= 0) return 0;
  return Math.max(1, Math.round(hauteurPx / interlignePx));
}

/** L'interligne effectif de l'élément, en px, avec un repli raisonnable. */
function interligne(style: CSSStyleDeclaration, taillePx: number): number {
  const lu = Number.parseFloat(style.lineHeight);
  if (Number.isFinite(lu) && lu > 0) return lu;
  /* `line-height: normal` ne rend pas de px : 1,2 est la valeur usuelle des
     navigateurs, et l'approximation ne sert qu'au cas où la feuille de style
     n'aurait rien posé. */
  return taillePx * 1.2;
}

/**
 * Ajuste un élément pour qu'il tienne en `maxLignes` lignes au plus.
 *
 * LA TAILLE DE BASE EST RELUE À CHAQUE FOIS, jamais mise en cache : la
 * feuille de style la change selon la largeur de l'écran, et un cache aurait
 * figé la valeur d'une rotation précédente. On efface donc notre réglage
 * AVANT de mesurer, et la cascade redit ce qu'elle veut.
 */
export function ajusterEnLignes(element: HTMLElement, maxLignes = 2): void {
  element.classList.remove(CLASSE_COUPE);
  element.style.removeProperty('font-size');
  if (element.hidden) return;
  if ((element.textContent ?? '').trim() === '') return;

  const base = Number.parseFloat(getComputedStyle(element).fontSize);
  if (!Number.isFinite(base) || base <= 0) return;

  for (const facteur of PALIERS) {
    if (facteur !== 1) element.style.fontSize = (base * facteur).toFixed(2) + 'px';
    const style = getComputedStyle(element);
    const taille = Number.parseFloat(style.fontSize);
    if (nombreDeLignes(element.scrollHeight, interligne(style, taille)) <= maxLignes) return;
  }
  /* AUCUN PALIER N'A SUFFI. On garde le plus petit ET on coupe : mieux vaut
     un nom de ville tronqué qu'un panneau dont le texte sort de la tôle. */
  element.classList.add(CLASSE_COUPE);
}

/**
 * Tient les éléments en deux lignes, et les y GARDE.
 *
 * POURQUOI DES OBSERVATEURS, ET NON UN APPEL À CHAQUE ÉCRITURE : le texte du
 * cartouche est écrit depuis QUATRE endroits du bandeau — la manœuvre à
 * chaque fixe, l'arrivée, le rang dans un giratoire, l'attente de position —
 * et un cinquième viendra. Un appel posé à la main derrière chacun, c'est un
 * oubli programmé le jour où l'on en ajoute un. L'observateur, lui, voit
 * TOUTES les écritures, y compris celles qui n'existent pas encore.
 *
 * ET IL NE S'AUTO-DÉCLENCHE PAS. La mutation observée est le TEXTE, pas les
 * attributs : notre propre `style.fontSize` ne la réveille donc jamais. Le
 * redimensionnement, lui, est filtré sur la LARGEUR du cadre — la hauteur
 * change quand on réduit la police, et réagir à la hauteur serait une boucle.
 *
 * @param cadre l'élément dont la LARGEUR décide (le panneau lui-même)
 * @returns la fonction de retrait : deux installations empileraient les observateurs.
 */
export function installerTenueEnLignes(
  cadre: HTMLElement, elements: readonly HTMLElement[], maxLignes = 2,
): () => void {
  const ajuster = (): void => {
    for (const element of elements) ajusterEnLignes(element, maxLignes);
  };

  const texte = new MutationObserver(ajuster);
  for (const element of elements) {
    texte.observe(element, { childList: true, characterData: true, subtree: true });
  }

  let largeur = cadre.getBoundingClientRect().width;
  let taille: ResizeObserver | null = null;
  if (typeof ResizeObserver === 'function') {
    taille = new ResizeObserver(() => {
      const nouvelle = cadre.getBoundingClientRect().width;
      if (Math.abs(nouvelle - largeur) < 0.5) return;
      largeur = nouvelle;
      ajuster();
    });
    taille.observe(cadre);
  }

  ajuster();
  return () => { texte.disconnect(); taille?.disconnect(); };
}
