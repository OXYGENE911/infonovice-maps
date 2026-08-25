/* CERCLES GÉODÉSIQUES — la géométrie des anneaux d'autonomie.
 *
 * Un « cercle » de 300 km sur une carte n'est pas un cercle : la Terre est
 * ronde et la projection ment. Tracer un cercle en PIXELS donnerait une figure
 * juste au centre de l'écran et fausse sur les bords — d'autant plus fausse
 * qu'on monte vers le nord. On calcule donc des points sur la sphère, et
 * MapLibre les projette.
 */

const RAYON_TERRE_KM = 6371.0088;
const RAD = Math.PI / 180;

/**
 * Un anneau fermé de `points` sommets, à `rayonKm` du centre.
 * Rend un anneau GeoJSON (premier point répété en dernier, comme la
 * spécification l'exige pour un polygone).
 */
export function cercleGeodesique(
  lon: number, lat: number, rayonKm: number, points = 96,
): [number, number][] {
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return [];
  if (!Number.isFinite(rayonKm) || rayonKm <= 0) return [];
  const n = Math.max(8, Math.min(Math.round(points), 512));

  const d = rayonKm / RAYON_TERRE_KM;      // distance angulaire
  const phi1 = lat * RAD;
  const lambda1 = lon * RAD;
  const sinPhi1 = Math.sin(phi1);
  const cosPhi1 = Math.cos(phi1);
  const sinD = Math.sin(d);
  const cosD = Math.cos(d);

  const anneau: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const theta = (i / n) * 2 * Math.PI;    // cap, depuis le nord
    const sinPhi2 = sinPhi1 * cosD + cosPhi1 * sinD * Math.cos(theta);
    const phi2 = Math.asin(Math.min(1, Math.max(-1, sinPhi2)));
    const lambda2 = lambda1 + Math.atan2(
      Math.sin(theta) * sinD * cosPhi1,
      cosD - sinPhi1 * sinPhi2,
    );
    // Ramené dans [-180, 180] : au-delà, MapLibre replie le polygone.
    const lonD = (((lambda2 / RAD) + 540) % 360) - 180;
    anneau.push([lonD, phi2 / RAD]);
  }
  anneau.push(anneau[0]!);   // fermeture explicite
  return anneau;
}

/** Une FeatureCollection d'anneaux, du plus grand au plus petit — l'ordre de
 *  dessin compte : le petit doit se voir PAR-DESSUS le grand. */
export function collectionAnneaux(
  lon: number, lat: number,
  anneaux: { cle: string; rayonKm: number; couleur: string }[],
): GeoJSON.FeatureCollection {
  const tries = [...anneaux].filter((a) => a.rayonKm > 0)
    .sort((a, b) => b.rayonKm - a.rayonKm);
  return {
    type: 'FeatureCollection',
    features: tries.map((a) => ({
      type: 'Feature' as const,
      properties: { cle: a.cle, couleur: a.couleur, rayonKm: Math.round(a.rayonKm) },
      geometry: { type: 'Polygon' as const, coordinates: [cercleGeodesique(lon, lat, a.rayonKm)] },
    })),
  };
}
