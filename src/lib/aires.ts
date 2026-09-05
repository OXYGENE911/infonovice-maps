// LES AIRES D'AUTOROUTE À VENIR (AIRES-1, 05/09/2026).
//
// LE TERRAIN. Armelin : « Quand je roule sur l'autoroute, j'aimerais afficher
// un petit panneau bleu à droite, sous le panneau de direction, indiquant les
// aires de repos à venir et leurs commodités sous forme de pictogrammes […]
// le nom de l'aire, sa distance restante en direct et le temps restant, […]
// le nom du gestionnaire de réseau de bornes si une station de recharge est
// présente. […] Parfois sur la route, on a juste envie d'aller aux toilettes
// ou de s'arrêter, mais on ne sait pas dans combien de temps sera la prochaine
// aire. […] Quitte à m'arrêter, je préfère savoir s'il y aura une station de
// recharge qui me convienne — donc TOUS les réseaux, même hors préférences. »
//
// CE QUE LA MESURE A DIT (05/09, A6 entre Auxerre et Beaune, 78 objets) :
//   · les aires sont des `highway=services` (aire de service, avec carburant)
//     et `highway=rest_area` (aire de repos) — des SURFACES quand elles sont
//     dessinées, des NŒUDS sinon ; les nœuds sans nom sont des refuges de
//     route nationale, pas des aires : on ne garde que les surfaces et les
//     nœuds NOMMÉS ;
//   · `toilets=yes` est porté par l'aire elle-même 55 fois sur 78 ; les
//     services portent `operator` (APRR) ;
//   · le reste est un SEMIS DE NŒUDS dans l'enceinte : carburant avec sa
//     marque (TotalEnergies, Esso), café (Columbus), boutique (Carrefour
//     Express), bornes avec `network` et `operator` (Corri-dor / Sodetrel,
//     Last Mile Solutions / ENGIE), aire de jeux, tables de pique-nique,
//     hôtel. C'est la seconde requête, autour des aires retenues seulement.
//   · deux aires se font face de part et d'autre de l'autoroute (Venoy
//     Soleil Levant / Venoy-Chablis) : celle de l'autre chaussée est à
//     GAUCHE du sens de marche. On ne garde que la DROITE — en France, on
//     s'arrête à droite.
//
// TOUT CE FICHIER EST PUR : les requêtes s'écrivent ici, s'envoient ailleurs.

import { distanceAuSegment, distanceM } from './le-long-du-trajet';

export type TypeAire = 'services' | 'repos';

export interface Aire {
  id: string;
  nom: string;
  type: TypeAire;
  /** Le gestionnaire (APRR, Vinci…) quand OSM le porte ; '' sinon. */
  operateur: string;
  lon: number;
  lat: number;
  /** Position le long du tracé, en mètres depuis le départ. */
  avancementM: number;
  /** Toilettes déclarées sur l'aire elle-même (null : on ne sait pas). */
  toilettes: boolean | null;
}

/** Les commodités relevées dans l'enceinte d'une aire. */
export interface Commodites {
  carburant: string[];
  toilettes: boolean;
  cafe: boolean;
  restauration: string[];
  boutique: boolean;
  piqueNique: boolean;
  jeux: boolean;
  douche: boolean;
  hotel: boolean;
  /** Les réseaux de recharge présents — TOUS, préférences ou non. */
  recharge: string[];
}

/** À quelle distance du tracé une aire est encore « sur la route ». */
export const ECART_AIRE_M = 120;
/** Le rayon des commodités autour du centre d'une aire. */
export const RAYON_COMMODITES_M = 150;
/** La feuille s'ouvre d'elle-même à cette distance de la prochaine aire. */
export const ANNONCE_AIRE_M = 5_000;
/** …et se referme une fois l'aire dépassée de cette marge. */
export const DEPASSEE_M = 300;

/** Le fragment Overpass à glisser dans la requête de corridor — PURE. */
export function fragmentAires(points: string): string {
  return `nwr(around:${ECART_AIRE_M},${points})["highway"~"^(services|rest_area)$"];`;
}

interface ElementOsm {
  type?: string;
  id?: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  geometry?: { lat: number; lon: number }[];
  bounds?: { minlat: number; minlon: number; maxlat: number; maxlon: number };
  tags?: Record<string, string>;
}

/** Le centre d'un objet OSM, quelle que soit sa forme — PURE. */
export function centreDe(e: ElementOsm): { lon: number; lat: number } | null {
  if (typeof e.lat === 'number' && typeof e.lon === 'number') return { lon: e.lon, lat: e.lat };
  if (e.center) return { lon: e.center.lon, lat: e.center.lat };
  if (Array.isArray(e.geometry) && e.geometry.length > 0) {
    const pts = e.geometry.filter((p) => typeof p?.lat === 'number' && typeof p?.lon === 'number');
    if (pts.length === 0) return null;
    return {
      lon: pts.reduce((s, p) => s + p.lon, 0) / pts.length,
      lat: pts.reduce((s, p) => s + p.lat, 0) / pts.length,
    };
  }
  if (e.bounds) {
    return { lon: (e.bounds.minlon + e.bounds.maxlon) / 2, lat: (e.bounds.minlat + e.bounds.maxlat) / 2 };
  }
  return null;
}

/**
 * Où un point se situe par rapport au tracé : écart, avancement, et CÔTÉ — PURE.
 *
 * Le côté vient du produit vectoriel du segment le plus proche par le point :
 * négatif, le point est à droite du sens de marche. C'est ce qui écarte l'aire
 * de l'autre chaussée, à cent mètres à gauche.
 */
export function situerAvecCote(
  point: { lon: number; lat: number }, trace: readonly [number, number][],
): { ecart: number; avancement: number; cote: 'droite' | 'gauche' } {
  let meilleur = { ecart: Infinity, avancement: 0, cote: 'droite' as 'droite' | 'gauche' };
  let cumul = 0;
  for (let i = 0; i < trace.length - 1; i += 1) {
    const a = trace[i]!;
    const b = trace[i + 1]!;
    const longueur = distanceM(a, b);
    const { distance, t } = distanceAuSegment([point.lon, point.lat], a, b);
    if (distance < meilleur.ecart) {
      const mLon = Math.cos((point.lat * Math.PI) / 180);
      const dx = (b[0] - a[0]) * mLon;
      const dy = b[1] - a[1];
      const px = (point.lon - a[0]) * mLon;
      const py = point.lat - a[1];
      const croix = dx * py - dy * px;
      meilleur = { ecart: distance, avancement: cumul + t * longueur, cote: croix < 0 ? 'droite' : 'gauche' };
    }
    cumul += longueur;
  }
  return meilleur;
}

/**
 * Les aires du corridor, à droite du sens de marche, dans l'ordre — PURE.
 *
 * On ne garde que les surfaces et les nœuds nommés (un nœud `rest_area` sans
 * nom est un refuge de nationale), à moins de ECART_AIRE_M du tracé et à
 * DROITE. Deux objets d'une même aire (la surface et son nœud) se replient
 * sur le nom.
 */
export function versAires(elements: unknown[], trace: readonly [number, number][]): Aire[] {
  const sortie: Aire[] = [];
  const vus = new Set<string>();
  for (const brut of elements) {
    const e = brut as ElementOsm;
    const h = e.tags?.['highway'];
    if (h !== 'services' && h !== 'rest_area') continue;
    const nom = (e.tags?.['name'] ?? '').trim();
    if (e.type === 'node' && nom === '') continue;
    const centre = centreDe(e);
    if (!centre) continue;
    const { ecart, avancement, cote } = situerAvecCote(centre, trace);
    if (ecart > ECART_AIRE_M || cote !== 'droite') continue;
    const cle = nom !== '' ? nom.toLowerCase() : `${e.type}/${e.id}`;
    if (vus.has(cle)) continue;
    vus.add(cle);
    const t = e.tags?.['toilets'];
    sortie.push({
      id: `${e.type ?? 'nwr'}/${e.id ?? 0}`,
      nom: nom !== '' ? nom : (h === 'services' ? 'Aire de service' : 'Aire de repos'),
      type: h === 'services' ? 'services' : 'repos',
      operateur: (e.tags?.['operator'] ?? '').trim(),
      lon: centre.lon,
      lat: centre.lat,
      avancementM: avancement,
      toilettes: t === undefined ? null : t !== 'no',
    });
  }
  return sortie.sort((a, b) => a.avancementM - b.avancementM);
}

/** La requête Overpass des commodités des aires retenues — PURE ; null sans aire. */
export function requeteCommodites(aires: readonly Aire[]): string | null {
  if (aires.length === 0) return null;
  const clauses = aires.map((a) => {
    const ou = `around:${RAYON_COMMODITES_M},${a.lat.toFixed(5)},${a.lon.toFixed(5)}`;
    return `nwr(${ou})["amenity"~"^(fuel|toilets|cafe|restaurant|fast_food|food_court|charging_station|shower|atm|pharmacy)$"];`
      + `nwr(${ou})["shop"];nwr(${ou})["leisure"~"^(picnic_table|playground)$"];nwr(${ou})["tourism"="hotel"];`;
  }).join('');
  return `[out:json][timeout:25];(${clauses});out center tags;`;
}

const COMMODITES_VIDES = (): Commodites => ({
  carburant: [], toilettes: false, cafe: false, restauration: [], boutique: false,
  piqueNique: false, jeux: false, douche: false, hotel: false, recharge: [],
});

const ajouter = (liste: string[], v: string | undefined): void => {
  const x = (v ?? '').trim();
  if (x !== '' && !liste.some((l) => l.toLowerCase() === x.toLowerCase())) liste.push(x);
};

/**
 * Rattache chaque commodité à l'aire la plus proche et la range — PURE.
 *
 * L'aire de l'autre chaussée n'a pas été retenue : on n'attribue donc RIEN à
 * moins de RAYON_COMMODITES_M d'une aire absente — un nœud est pris s'il est à
 * portée d'une aire retenue, et au plus proche s'il l'est de deux.
 */
export function versCommodites(
  elements: unknown[], aires: readonly Aire[],
): Map<string, Commodites> {
  const par = new Map<string, Commodites>();
  for (const a of aires) par.set(a.id, { ...COMMODITES_VIDES(), toilettes: a.toilettes === true });
  for (const brut of elements) {
    const e = brut as ElementOsm;
    const centre = centreDe(e);
    if (!centre || !e.tags) continue;
    let proche: Aire | null = null;
    let dmin = Infinity;
    for (const a of aires) {
      const d = distanceM([centre.lon, centre.lat], [a.lon, a.lat]);
      if (d < dmin) { dmin = d; proche = a; }
    }
    if (!proche || dmin > RAYON_COMMODITES_M) continue;
    const c = par.get(proche.id)!;
    const t = e.tags;
    const marque = t['brand'] ?? t['operator'] ?? t['name'];
    switch (t['amenity']) {
      case 'fuel': ajouter(c.carburant, marque); if (c.carburant.length === 0) c.carburant.push('Carburant'); break;
      case 'toilets': c.toilettes = true; break;
      case 'cafe': c.cafe = true; break;
      case 'restaurant': case 'fast_food': case 'food_court': ajouter(c.restauration, marque ?? 'Restauration'); break;
      case 'charging_station': ajouter(c.recharge, t['network'] ?? t['operator'] ?? t['brand']); if (c.recharge.length === 0) c.recharge.push('Recharge'); break;
      case 'shower': c.douche = true; break;
      default: break;
    }
    if (t['shop'] !== undefined) c.boutique = true;
    if (t['leisure'] === 'picnic_table') c.piqueNique = true;
    if (t['leisure'] === 'playground') c.jeux = true;
    if (t['tourism'] === 'hotel') c.hotel = true;
  }
  return par;
}

/** Les réseaux de recharge de l'index IRVE à portée d'une aire — PURE. */
export function reseauxIrve(
  aire: Aire, stations: readonly { lon: number; lat: number; reseau: string | null; operateur: string | null }[],
  rayonM = 250,
): string[] {
  const sortie: string[] = [];
  for (const s of stations) {
    if (distanceM([s.lon, s.lat], [aire.lon, aire.lat]) > rayonM) continue;
    ajouter(sortie, s.reseau ?? s.operateur ?? undefined);
  }
  return sortie;
}

/** Un pictogramme et son mot — ce que le panneau montre. */
export interface Picto { cle: string; libelle: string }

/** Les pictogrammes d'une aire, dans l'ordre des panneaux routiers — PURE. */
export function pictosAire(a: Aire, c: Commodites): Picto[] {
  const p: Picto[] = [];
  if (c.carburant.length > 0) p.push({ cle: 'carburant', libelle: `Carburant · ${c.carburant.join(', ')}` });
  if (c.recharge.length > 0) p.push({ cle: 'recharge', libelle: `Recharge · ${c.recharge.join(', ')}` });
  if (c.restauration.length > 0) p.push({ cle: 'restauration', libelle: `Restauration · ${c.restauration.join(', ')}` });
  if (c.cafe) p.push({ cle: 'cafe', libelle: 'Café' });
  if (c.boutique) p.push({ cle: 'boutique', libelle: 'Boutique' });
  if (c.toilettes || a.toilettes === true) p.push({ cle: 'toilettes', libelle: 'Toilettes' });
  if (c.douche) p.push({ cle: 'douche', libelle: 'Douches' });
  if (c.piqueNique) p.push({ cle: 'pique-nique', libelle: 'Pique-nique' });
  if (c.jeux) p.push({ cle: 'jeux', libelle: 'Aire de jeux' });
  if (c.hotel) p.push({ cle: 'hotel', libelle: 'Hôtel' });
  return p;
}

/** Les aires encore devant, dans l'ordre — PURE. */
export function airesDevant(aires: readonly Aire[], avancementM: number): Aire[] {
  return aires.filter((a) => a.avancementM > avancementM + DEPASSEE_M);
}

/**
 * Le temps jusqu'à une distance, en secondes — PURE.
 *
 * À la vitesse courante quand on roule (au-dessus de 5 m/s), sinon à la
 * vitesse moyenne du trajet : à l'arrêt au péage, « dans 3 min » ne veut rien
 * dire, « dans 12 min » au rythme du trajet, si.
 */
export function tempsJusquA(
  distanceM: number, vitesseMs: number | null, vitesseMoyenneMs: number,
): number {
  const v = vitesseMs !== null && vitesseMs > 5 ? vitesseMs : Math.max(vitesseMoyenneMs, 8);
  return Math.max(0, distanceM) / v;
}

/** « 12 km », « 800 m » — PURE. */
export function distanceCourte(m: number): string {
  if (m >= 10_000) return `${Math.round(m / 1000)} km`;
  if (m >= 1_000) return `${(m / 1000).toFixed(1).replace('.', ',')} km`;
  return `${Math.round(m / 50) * 50} m`;
}

/** « 12 min », « 1 h 05 » — PURE. */
export function dureeCourte(s: number): string {
  const min = Math.round(s / 60);
  if (min < 1) return 'moins d’une minute';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const r = min % 60;
  return r === 0 ? `${h} h` : `${h} h ${String(r).padStart(2, '0')}`;
}
