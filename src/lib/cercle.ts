/* CERCLES GÉODÉSIQUES — la géométrie des anneaux d'autonomie.
 *
 * Un « cercle » de 300 km sur une carte n'est pas un cercle : la Terre est
 * ronde et la projection ment. Tracer un cercle en PIXELS donnerait une figure
 * juste au centre de l'écran et fausse sur les bords — d'autant plus fausse
 * qu'on monte vers le nord. On calcule donc des points sur la sphère, et
 * MapLibre les projette.
 */

/* CE QU'UN CERCLE PROMET DE TROP (RAYON-1, 02/09).
 *
 * LE TERRAIN. Un collègue d'Armelin : « le rayon d'action sous forme de cercle
 * était une bonne idée mais semblait beaucoup trop optimiste par défaut […] il
 * vaut mieux afficher des autonomies légèrement plus pessimistes que de faire
 * croire à l'utilisateur qu'il peut aller aussi loin. »
 *
 * IL A RAISON, ET LE BIAIS EST STRUCTUREL, pas un réglage de consommation :
 * une autonomie se dépense sur des ROUTES, un cercle se mesure à VOL D'OISEAU.
 * Tracer un cercle de 300 km de rayon, c'est promettre d'atteindre des points
 * qu'aucune route ne rejoint en 300 km.
 *
 * MESURÉ SUR HUIT TRAJETS FRANÇAIS le 02/09, avec le moteur d'itinéraire de la
 * Géoplateforme (route ÷ vol d'oiseau) :
 *   Nantes–Rennes 1,09 · Paris–Reims 1,11 · Bordeaux–Toulouse 1,16 ·
 *   Lyon–Grenoble 1,18 · Paris–Orléans 1,19 · Le Plessis–Melun 1,21 ·
 *   Marseille–Nice 1,33 · Lille–Amiens 1,42
 *   → médiane 1,19, moyenne 1,21.
 *
 * ON RETIENT 1,25 : au-dessus de la médiane ET de la moyenne, en deçà du pire
 * cas. Le choix penche donc du côté pessimiste, comme demandé — mieux vaut
 * arriver plus loin que prévu que tomber en panne avant le cercle. */
export const FACTEUR_DETOUR = 1.25;

/** Le rayon à TRACER pour une autonomie routière donnée — PURE. */
export function rayonAffichable(autonomieKm: number): number {
  return Number.isFinite(autonomieKm) && autonomieKm > 0
    ? autonomieKm / FACTEUR_DETOUR : 0;
}

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
