/* ORIENTATION DE LA CARTE EN SUIVI — la partie PURE, testable à sec.
 *
 * Deux sources de cap, chacune avec son défaut : le cap GPS est propre en
 * mouvement et n'est que du bruit à l'arrêt ; la boussole (DeviceOrientation)
 * répond à l'arrêt mais tremble en permanence. Ce module ne décide pas qui
 * parle — le bandeau le fait, il connaît la vitesse — mais il rend les caps
 * UTILISABLES : lissés sur l'arc le plus court, sourds aux micro-écarts.
 */

/**
 * Écart angulaire signé le plus court, de `de` vers `vers`, en degrés.
 *
 * Toujours dans (−180, 180] : de 350° vers 10°, la route courte fait +20°,
 * pas −340° — une carte qui prendrait le grand tour ferait un tour complet
 * au passage du nord.
 */
export function ecartAngulaire(de: number, vers: number): number {
  const brut = (((vers - de) % 360) + 540) % 360 - 180;
  return brut === -180 ? 180 : brut;
}

/** En dessous de cet écart, on ne bouge pas : le tremblement n'est pas un cap. */
const SEUIL_ECART = 3;

/**
 * Lissage exponentiel du cap, sur l'arc le plus court.
 *
 * LE PREMIER CAP EST PRIS ENTIER : lisser depuis rien retarderait
 * l'orientation initiale de plusieurs fixes — la carte partirait de travers
 * au moment précis où l'on démarre. Ensuite, chaque mesure ne déplace la
 * carte que d'une fraction de l'écart : les à-coups du récepteur deviennent
 * une rotation continue. Les écarts sous 3° sont IGNORÉS — c'est du
 * tremblement, pas un virage.
 */
export function lisserCap(precedent: number | null, brut: number, facteur = 0.35): number {
  const normalise = ((brut % 360) + 360) % 360;
  if (precedent === null) return normalise;
  const ecart = ecartAngulaire(precedent, normalise);
  if (Math.abs(ecart) < SEUIL_ECART) return precedent;
  return (((precedent + ecart * facteur) % 360) + 360) % 360;
}

/**
 * Le cap boussole d'un événement DeviceOrientation, ou `null`.
 *
 * `webkitCompassHeading` (iOS) donne le cap directement. Ailleurs, seul un
 * événement ABSOLU se convertit — `360 − alpha` — car l'alpha relatif est
 * arbitraire : l'utiliser orienterait la carte sur la position du téléphone
 * au moment où la page s'est ouverte, pas sur le nord.
 *
 * APPROXIMATION ASSUMÉE : l'écran est supposé tenu face au ciel (portrait,
 * à plat). La correction complète demanderait beta/gamma et l'orientation
 * d'écran — hors de proportion pour orienter une carte à l'arrêt.
 */
export function capDeBoussole(e: {
  webkitCompassHeading?: number | undefined;
  alpha: number | null;
  absolute?: boolean | undefined;
}): number | null {
  if (typeof e.webkitCompassHeading === 'number' && Number.isFinite(e.webkitCompassHeading)) {
    return ((e.webkitCompassHeading % 360) + 360) % 360;
  }
  if (e.absolute === true && typeof e.alpha === 'number' && Number.isFinite(e.alpha)) {
    return ((360 - e.alpha) % 360 + 360) % 360;
  }
  return null;
}

/** Les trois façons d'orienter la carte en suivi. Le choix tient la session. */
export type ModeOrientation = 'cap' | 'nord' | 'libre';

/** Le mode suivant dans le cycle du bouton : cap → nord → libre → cap. */
export function modeSuivant(mode: ModeOrientation): ModeOrientation {
  return mode === 'cap' ? 'nord' : mode === 'nord' ? 'libre' : 'cap';
}

/** L'étiquette française d'un mode — celle du bouton. */
export function libelleMode(mode: ModeOrientation): string {
  return mode === 'cap' ? 'Cap en haut' : mode === 'nord' ? 'Nord en haut' : 'Vue libre';
}
