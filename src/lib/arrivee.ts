/* L'ARRIVÉE — au bon moment, du bon côté. PURE.
 *
 * LE DÉFAUT (ARRIVEE-2, 31/08). Armelin : « ne pas indiquer l'arrivée trop
 * tôt, car hier ça m'indiquait que j'étais arrivé à la destination 40 m
 * avant ». Le palier vocal « maintenant » se déclenche à cinquante mètres —
 * et pour une manœuvre ordinaire, c'est juste : à 50 m d'un virage, on
 * tourne. Mais « vous êtes arrivé » n'est pas une manœuvre : c'est un
 * constat, et un constat prononcé 40 m trop tôt est un mensonge de 40 m.
 *
 * LA RÈGLE : aux paliers d'approche, on dit « vous arrivez à destination » —
 * un futur proche, qui prépare. Le « vous êtes arrivé », lui, attend d'être
 * VRAI : vingt mètres, l'ordre de grandeur de l'incertitude du récepteur
 * additionnée d'une longueur de voiture.
 *
 * ET LE CÔTÉ DE LA CHAUSSÉE — sa demande exacte : « Vous êtes arrivé à
 * destination. Votre destination se situe sur la gauche (ou la droite) de la
 * chaussée. » Le tracé s'arrête SUR la route ; l'adresse est à côté. L'angle
 * entre la direction du dernier segment et la direction vers l'adresse dit le
 * côté — et quand l'angle ne tranche pas (l'adresse est droit devant, ou
 * confondue avec la route), ON NE DIT PAS DE CÔTÉ : un côté deviné à pile ou
 * face enverrait l'usager traverser pour rien une fois sur deux.
 */
import type { PointGeo } from './coordonnees';

/* LE SEUIL DU CONSTAT. Vingt mètres : l'incertitude GPS (une dizaine de
   mètres) plus une longueur de voiture. En deçà, « vous êtes arrivé » est
   vrai au sens où l'usager le vit. */
export const SEUIL_ARRIVE_M = 20;

/* L'ANGLE QUI TRANCHE UN CÔTÉ. Vingt-cinq degrés : en deçà, l'adresse est
   « devant » à l'échelle d'une rue, et nommer un côté serait deviner. */
export const ANGLE_COTE_DEG = 25;

const rad = (d: number): number => (d * Math.PI) / 180;
const deg = (r: number): number => (r * 180) / Math.PI;

/** Le cap d'un point vers un autre, en degrés (0 = nord) — PURE. */
function capVers(a: readonly [number, number], b: readonly [number, number]): number {
  const mLon = 111_320 * Math.cos(rad(a[1]));
  const dx = (b[0] - a[0]) * mLon;
  const dy = (b[1] - a[1]) * 111_320;
  return (deg(Math.atan2(dx, dy)) + 360) % 360;
}

/** L'écart signé entre deux caps, dans (-180, 180] — PURE. */
function ecartCap(vers: number, depuis: number): number {
  let e = vers - depuis;
  while (e > 180) e -= 360;
  while (e <= -180) e += 360;
  return e;
}

/**
 * De quel côté de la chaussée est la destination — PURE.
 *
 * `null` quand on ne sait pas trancher : destination absente, tracé trop
 * court, adresse confondue avec la fin du tracé, ou angle trop faible. Un
 * côté deviné vaut moins que pas de côté du tout.
 */
export function coteDestination(
  trace: readonly [number, number][], destination: PointGeo | null | undefined,
): 'gauche' | 'droite' | null {
  if (!destination || trace.length < 2) return null;
  const fin = trace[trace.length - 1]!;
  /* LA DIRECTION D'ARRIVÉE se lit sur les DERNIERS mètres, pas sur le dernier
     couple de points — deux points collés (un tracé dense) donneraient un cap
     de bruit. On remonte jusqu'à trouver un point à plus de dix mètres. */
  let i = trace.length - 2;
  const mLon = 111_320 * Math.cos(rad(fin[1]));
  const distM = (p: readonly [number, number]): number =>
    Math.hypot((fin[0] - p[0]) * mLon, (fin[1] - p[1]) * 111_320);
  while (i > 0 && distM(trace[i]!) < 10) i -= 1;
  const avant = trace[i]!;
  if (distM(avant) < 1) return null;

  const capRoute = capVers(avant, fin);
  const versDest = [destination.lon, destination.lat] as const;
  if (distM(versDest as [number, number]) < 5) return null;
  const capDest = capVers(fin, versDest);
  const ecart = ecartCap(capDest, capRoute);
  if (Math.abs(ecart) < ANGLE_COTE_DEG) return null;
  // Cap horaire : un écart positif est à DROITE du sens de marche.
  return ecart > 0 ? 'droite' : 'gauche';
}

/** La phrase de l'arrivée — celle qu'Armelin a écrite, mot pour mot. */
export function phraseArrivee(cote: 'gauche' | 'droite' | null): string {
  if (cote === null) return 'Vous êtes arrivé à destination.';
  return 'Vous êtes arrivé à destination.'
    + ` Votre destination se situe sur la ${cote} de la chaussée.`;
}
