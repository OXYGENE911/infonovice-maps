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
  /** Les tronçons, dans l'ordre (MESURE-2) — vide sous deux points. */
  segmentsM: number[];
  /** Quand la figure est fermée sur trois points ou plus (MESURE-2). */
  surfaceM2: number | null;
  perimetreM: number | null;
}

/* LA SURFACE ET LE PÉRIMÈTRE (MESURE-2, 06/09/2026). Armelin : « un bouton
   pour relier le premier point et le dernier afin de sceller une surface, et
   afficher sa superficie et son périmètre ». L'aire est celle du polygone SUR
   LA SPHÈRE (la formule de Chamberlain & Duquette, celle de Turf) : un carré
   d'un centième de degré à l'équateur fait 1,236 km², pas 1,111 × 1,111. */
const RAYON_M = 6_371_008.8;
const rad = (d: number): number => d * Math.PI / 180;

/** Les tronçons, point à point — PURE. */
export function segmentsM(points: readonly PointMesure[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < points.length; i += 1) out.push(distanceM(points[i - 1]!, points[i]!));
  return out;
}

/** L'aire du polygone fermé sur les points, en m² — PURE, 0 sous trois points. */
export function surfaceM2(points: readonly PointMesure[]): number {
  const n = points.length;
  if (n < 3) return 0;
  let somme = 0;
  for (let i = 0; i < n; i += 1) {
    const p0 = points[i]!;
    const p1 = points[(i + 1) % n]!;
    const p2 = points[(i + 2) % n]!;
    somme += (rad(p2[0]) - rad(p0[0])) * Math.sin(rad(p1[1]));
  }
  return Math.abs(somme * RAYON_M * RAYON_M / 2);
}

/** Le périmètre de la figure fermée, en m — PURE. */
export function perimetreM(points: readonly PointMesure[]): number {
  if (points.length < 3) return longueurM(points);
  return longueurM([...points, points[0]!]);
}

/** Une surface comme sur un plan : m² sous l'hectare, hectares, puis km². */
export function formaterSurface(m2: number): string {
  if (!Number.isFinite(m2) || m2 <= 0) return '0 m²';
  if (m2 < 10_000) return `${Math.round(m2)} m²`;
  // Sans zéro inutile : « 45 ha », pas « 45,0 ha ».
  const net = (v: number, d: number): string => v.toFixed(d).replace(/\.?0+$/, '').replace('.', ',');
  if (m2 < 1_000_000) {
    const ha = m2 / 10_000;
    return `${net(ha, ha < 10 ? 2 : ha < 100 ? 1 : 0)} ha`;
  }
  const km2 = m2 / 1_000_000;
  return `${net(km2, km2 < 10 ? 2 : km2 < 100 ? 1 : 0)} km²`;
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

/** Ce que le relevé affiche pour une suite de points — vide, un seul, ou plus ;
 *  fermée (MESURE-2), la figure dit sa surface et son périmètre. */
export function bilanMesure(points: readonly PointMesure[], ferme = false): BilanMesure {
  const nb = points.length;
  const vide = { segmentsM: [] as number[], surfaceM2: null, perimetreM: null };
  if (nb === 0) {
    return { nb, totalM: 0, dernierM: 0, texte: 'Touchez la carte pour poser le premier point.', ...vide };
  }
  if (nb === 1) {
    return { nb, totalM: 0, dernierM: 0, texte: 'Un point posé — touchez le suivant.', ...vide };
  }
  const totalM = longueurM(points);
  const dernierM = distanceM(points[nb - 2]!, points[nb - 1]!);
  const segs = segmentsM(points);
  if (ferme && nb >= 3) {
    const surface = surfaceM2(points);
    const perimetre = perimetreM(points);
    return {
      nb, totalM, dernierM, segmentsM: segs, surfaceM2: surface, perimetreM: perimetre,
      texte: `${nb} points · surface ${formaterSurface(surface)} · périmètre ${formaterDistance(perimetre)}`,
    };
  }
  const texte = `${nb} points · ${formaterDistance(totalM)} à vol d’oiseau`
    + (nb > 2 ? ` · dernier segment ${formaterDistance(dernierM)}` : '');
  return { nb, totalM, dernierM, texte, segmentsM: segs, surfaceM2: null, perimetreM: null };
}

/** Le dessin : le trait (dès deux points), les points numérotés — et, fermée
 *  sur trois points ou plus, la surface (MESURE-2) avec le trait qui se boucle. */
export function geojsonMesure(points: readonly PointMesure[], ferme = false): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = points.map((p, i) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [p[0], p[1]] },
    properties: { rang: i + 1 },
  }));
  const anneau = points.map((p) => [p[0], p[1]]);
  const boucle = ferme && points.length >= 3;
  if (points.length >= 2) {
    features.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: boucle ? [...anneau, anneau[0]!] : anneau },
      properties: {},
    });
  }
  if (boucle) {
    features.push({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [[...anneau, anneau[0]!]] },
      properties: {},
    });
  }
  return { type: 'FeatureCollection', features };
}
