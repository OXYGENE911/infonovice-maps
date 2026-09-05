/* L'OUTIL « MESURER » (MESURE-1, 05/09/2026) — le calcul PUR.
 *
 * Des amis d'Armelin : « des outils dans le menu : mesurer une distance A→B,
 * et un parcours dessiné point à point ». Une mesure à vol d'oiseau, cumulée
 * de point en point, sans réseau : la carte est la règle, le doigt le crayon.
 *
 * CE QUI EST DIT EST CE QUI EST MESURÉ. « À vol d'oiseau » est écrit dans le
 * relevé : une distance de carte n'est pas une distance de route (la route
 * fait 1,19 fois le vol d'oiseau en médiane, mesuré sur huit trajets français,
 * RAYON-1), et laisser croire l'inverse serait le reproche exact d'Armelin sur
 * un chiffre juste et inexpliqué. */
import { distanceM } from './le-long-du-trajet';
import { longueurM } from './simplifier';

export type PointMesure = [number, number];

export interface BilanMesure {
  nb: number;
  totalM: number;
  dernierM: number;
  texte: string;
}

/**
 * Une distance écrite comme on la lit sur une règle : au mètre sous le
 * kilomètre, puis avec la précision que le chiffre mérite (1,25 km ; 12,4 km ;
 * 392 km). Virgule française, espace insécable avant l'unité.
 */
export function formaterDistance(m: number): string {
  if (!Number.isFinite(m) || m < 0) return '0 m';
  if (m < 1000) return `${Math.round(m)} m`;
  const km = m / 1000;
  const decimales = km < 10 ? 2 : km < 100 ? 1 : 0;
  return `${km.toFixed(decimales).replace('.', ',')} km`;
}

/** Ce que le relevé affiche pour une suite de points — vide, un seul, ou plus. */
export function bilanMesure(points: readonly PointMesure[]): BilanMesure {
  const nb = points.length;
  if (nb === 0) {
    return { nb, totalM: 0, dernierM: 0, texte: 'Touchez la carte pour poser le premier point.' };
  }
  if (nb === 1) {
    return { nb, totalM: 0, dernierM: 0, texte: 'Un point posé — touchez le suivant.' };
  }
  const totalM = longueurM(points);
  const dernierM = distanceM(points[nb - 2]!, points[nb - 1]!);
  const texte = `${nb} points · ${formaterDistance(totalM)} à vol d’oiseau`
    + (nb > 2 ? ` · dernier segment ${formaterDistance(dernierM)}` : '');
  return { nb, totalM, dernierM, texte };
}

/** Le dessin : le trait (dès deux points) et les points, numérotés. */
export function geojsonMesure(points: readonly PointMesure[]): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = points.map((p, i) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [p[0], p[1]] },
    properties: { rang: i + 1 },
  }));
  if (points.length >= 2) {
    features.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: points.map((p) => [p[0], p[1]]) },
      properties: {},
    });
  }
  return { type: 'FeatureCollection', features };
}
