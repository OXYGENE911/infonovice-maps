// « Sur le trajet » — les stations-service et bornes de recharge proches de
// l'itinéraire, pas seulement de l'écran.
//
// LE PROBLÈME DES QUOTAS, ET SA SOLUTION. Une boîte englobant Paris→Lyon
// ferait 500 km de côté : les portails plafonnent à 100 résultats, on
// recevrait cent stations groupées n'importe où. Découper finement le trajet
// donnerait la précision… au prix d'une rafale de requêtes contre un service
// public. Compromis retenu : au plus SIX tronçons (donc six requêtes par
// couche), chacun interrogé sur sa propre boîte, puis un filtre EXACT par
// distance réelle au tracé — la précision vient du calcul local, pas du
// nombre d'appels.
import type { LineString } from 'geojson';
import {
  chargerCarburants, chargerBornes,
  type Bbox, type PoiCarburant, type PoiBorne,
} from './poi';
import type { StationRapide } from './index-bornes';

/** Plafond DUR d'appels par couche — la frugalité est une contrainte, pas un réglage. */
export const MAX_TRONCONS = 6;

export interface SurLeTrajet<T> {
  poi: T;
  /** Distance du POI au tracé, en mètres (l'aller simple du détour). */
  ecart: number;
  /** Distance depuis le départ, le long du trajet, en mètres. */
  avancement: number;
}

const RAYON_M = 6_371_000;
const rad = (d: number) => (d * Math.PI) / 180;

/** Distance haversine en mètres — PURE. */
export function distanceM(a: [number, number], b: [number, number]): number {
  const dLat = rad(b[1] - a[1]);
  const dLon = rad(b[0] - a[0]);
  const s = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * RAYON_M * Math.asin(Math.sqrt(s));
}

/** Distance d'un point au SEGMENT [a, b], en mètres, et position du projeté
    (0 = en a, 1 = en b) — PURE. Projection plane locale : à l'échelle d'un
    segment routier, l'erreur est négligeable devant le seuil de recherche. */
export function distanceAuSegment(
  p: [number, number], a: [number, number], b: [number, number],
): { distance: number; t: number } {
  // Mètres par degré à cette latitude : la longitude se resserre vers les pôles.
  const mLat = 111_320;
  const mLon = 111_320 * Math.cos(rad(p[1]));
  const ax = a[0] * mLon, ay = a[1] * mLat;
  const bx = b[0] * mLon, by = b[1] * mLat;
  const px = p[0] * mLon, py = p[1] * mLat;
  const dx = bx - ax, dy = by - ay;
  const carre = dx * dx + dy * dy;
  const t = carre === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / carre));
  const qx = ax + t * dx, qy = ay + t * dy;
  return { distance: Math.hypot(px - qx, py - qy), t };
}

/** Écart au tracé et avancement le long du tracé, en mètres — PURE. */
export function situerSurLeTrace(
  point: { lon: number; lat: number }, trace: [number, number][],
): { ecart: number; avancement: number } {
  let meilleur = { ecart: Infinity, avancement: 0 };
  let cumul = 0;
  for (let i = 0; i < trace.length - 1; i += 1) {
    const a = trace[i]!, b = trace[i + 1]!;
    const longueur = distanceM(a, b);
    const { distance, t } = distanceAuSegment([point.lon, point.lat], a, b);
    if (distance < meilleur.ecart) {
      meilleur = { ecart: distance, avancement: cumul + t * longueur };
    }
    cumul += longueur;
  }
  return meilleur;
}

/** Découpe le tracé en boîtes englobantes successives (au plus MAX_TRONCONS),
    élargies du rayon cherché — PURE, c'est le plan d'appels réseau. */
export function tronconner(trace: [number, number][], rayonM: number): Bbox[] {
  if (trace.length < 2) return [];
  const parTroncon = Math.ceil((trace.length - 1) / MAX_TRONCONS);
  const marge = rayonM / 111_320; // en degrés, majorant (latitude)
  const boites: Bbox[] = [];
  for (let debut = 0; debut < trace.length - 1; debut += parTroncon) {
    const morceau = trace.slice(debut, Math.min(debut + parTroncon + 1, trace.length));
    const lons = morceau.map((c) => c[0]);
    const lats = morceau.map((c) => c[1]);
    boites.push({
      ouest: Math.min(...lons) - marge,
      sud: Math.min(...lats) - marge,
      est: Math.max(...lons) + marge,
      nord: Math.max(...lats) + marge,
    });
  }
  return boites;
}

/** Trie, dédoublonne et filtre par écart réel — PURE, testée à sec. */
export function retenir<T extends { lon: number; lat: number }>(
  candidats: T[], trace: [number, number][], rayonM: number,
): SurLeTrajet<T>[] {
  const vus = new Set<string>();
  const gardes: SurLeTrajet<T>[] = [];
  for (const poi of candidats) {
    // Les tronçons se chevauchent : un même point peut revenir deux fois.
    const cle = `${poi.lon.toFixed(5)},${poi.lat.toFixed(5)}`;
    if (vus.has(cle)) continue;
    vus.add(cle);
    const { ecart, avancement } = situerSurLeTrace(poi, trace);
    if (ecart <= rayonM) gardes.push({ poi, ecart, avancement });
  }
  return gardes.sort((a, b) => a.avancement - b.avancement);
}

/** Un point est-il dans l'une des boîtes ? Pré-filtre grossier, mais efficace. */
const dansUneBoite = (p: { lon: number; lat: number }, boites: Bbox[]): boolean =>
  boites.some((b) => p.lon >= b.ouest && p.lon <= b.est && p.lat >= b.sud && p.lat <= b.nord);

/** Les longueurs cumulées du tracé, sommet par sommet — `prefixe[i]` est la
    distance depuis le départ jusqu'à `trace[i]`. Calculée UNE fois pour tout
    le trajet (PERF-PARIS-LYON, 11/09/2026, optim., cible 4) : c'était le rôle
    du `cumul` accumulé pas à pas dans `situerSurLeTrace`, un travail qui se
    répétait à l'identique pour chaque candidat. */
function prefixeCumul(trace: [number, number][]): number[] {
  const prefixe = [0];
  for (let i = 0; i < trace.length - 1; i += 1) {
    prefixe.push(prefixe[i]! + distanceM(trace[i]!, trace[i + 1]!));
  }
  return prefixe;
}

type Grille = Map<string, number[]>;
const cleCellule = (cx: number, cy: number): string => `${cx},${cy}`;

/** Une grille de cellules `celluleDeg` de côté : `grille[cx,cy]` liste les
    indices des segments (`trace[i]` → `trace[i+1]`) dont la boîte englobante
    touche cette cellule. Construite UNE fois par appel — voir
    `stationsDuTrajet`. */
function construireGrille(trace: [number, number][], celluleDeg: number): Grille {
  const grille: Grille = new Map();
  for (let i = 0; i < trace.length - 1; i += 1) {
    const a = trace[i]!; const b = trace[i + 1]!;
    const xMin = Math.floor(Math.min(a[0], b[0]) / celluleDeg);
    const xMax = Math.floor(Math.max(a[0], b[0]) / celluleDeg);
    const yMin = Math.floor(Math.min(a[1], b[1]) / celluleDeg);
    const yMax = Math.floor(Math.max(a[1], b[1]) / celluleDeg);
    for (let x = xMin; x <= xMax; x += 1) {
      for (let y = yMin; y <= yMax; y += 1) {
        const cle = cleCellule(x, y);
        const liste = grille.get(cle);
        if (liste) liste.push(i); else grille.set(cle, [i]);
      }
    }
  }
  return grille;
}

/**
 * Le plus proche segment du tracé, cherché SEULEMENT dans les cellules
 * voisines du point — pas dans le tracé entier (voir `stationsDuTrajet`).
 *
 * POURQUOI LES 9 CELLULES VOISINES SUFFISENT, TOUJOURS. La cellule fait
 * `celluleDeg` (= `rayonM` converti en degrés) de côté. Où que le point
 * tombe À L'INTÉRIEUR de sa propre cellule, il ne peut jamais être à plus de
 * `celluleDeg` (donc `rayonM`) du bord le plus proche des cellules
 * immédiatement voisines — et à plus de `celluleDeg` de tout ce qui est
 * au-delà. Un segment à moins de `rayonM` du point est donc FORCÉMENT
 * inscrit dans l'une des 9 cellules (la sienne ou l'une des 8 voisines) :
 * ce n'est pas une approximation, le résultat est identique à celui d'une
 * recherche en force brute sur le tracé entier.
 */
function situerViaGrille(
  point: { lon: number; lat: number }, trace: [number, number][],
  grille: Grille, celluleDeg: number, prefixe: number[],
): { ecart: number; avancement: number } {
  const cx = Math.floor(point.lon / celluleDeg);
  const cy = Math.floor(point.lat / celluleDeg);
  let meilleur = { ecart: Infinity, avancement: 0 };
  const vus = new Set<number>();
  for (let x = cx - 1; x <= cx + 1; x += 1) {
    for (let y = cy - 1; y <= cy + 1; y += 1) {
      const segments = grille.get(cleCellule(x, y));
      if (!segments) continue;
      for (const i of segments) {
        if (vus.has(i)) continue;
        vus.add(i);
        const a = trace[i]!; const b = trace[i + 1]!;
        const { distance, t } = distanceAuSegment([point.lon, point.lat], a, b);
        if (distance < meilleur.ecart) {
          meilleur = { ecart: distance, avancement: prefixe[i]! + t * (prefixe[i + 1]! - prefixe[i]!) };
        }
      }
    }
  }
  return meilleur;
}

/**
 * Les stations de l'index national qui bordent un trajet — SANS AUCUN APPEL.
 *
 * POURQUOI CETTE VOIE REMPLACE LA PRÉCÉDENTE pour les bornes. Chercher par
 * emprise coûtait six requêtes plafonnées à cent résultats chacune : sur un
 * Paris-Marseille, le plafond mordait et le planificateur travaillait donc sur
 * un échantillon dont il ignorait qu'il en était un. Il pouvait déclarer un
 * trajet infaisable parce que la borne salvatrice était la cent-unième d'un
 * tronçon. L'index, lui, est complet à partir de 50 kW — exactement le domaine
 * qui intéresse un trajet — et tient en mémoire.
 *
 * LE PRÉ-FILTRE PAR BOÎTES N'EST PAS SUFFISANT, LUI NON PLUS (PERF-PARIS-LYON,
 * 11/09/2026, optim., cible 4). Il ramène les candidats de 14 133 à quelques
 * centaines — mais `retenir` projetait ENSUITE chaque candidat sur TOUS les
 * segments du trajet entier (`situerSurLeTrace`), un coût qui grandit avec la
 * LONGUEUR du trajet (plusieurs milliers de segments sur Paris-Lyon), pas
 * avec le nombre de candidats déjà réduit — mesuré entre 2,1 et 3,9 s
 * (docs/mesure-paris-lyon.md). La grille de cellules (voir `situerViaGrille`)
 * ramène cette recherche aux ~9 cellules qui entourent chaque candidat, sans
 * changer le résultat — la preuve est dans le commentaire de
 * `situerViaGrille`.
 */
export function stationsDuTrajet(
  stations: StationRapide[], trace: [number, number][], rayonM: number,
): SurLeTrajet<StationRapide>[] {
  const boites = tronconner(trace, rayonM);
  if (boites.length === 0) return [];
  const candidats = stations.filter((s) => dansUneBoite(s, boites));
  // Cellule = rayon cherché, en degrés (même formule que la marge de
  // `tronconner`) : c'est elle qui rend la preuve de `situerViaGrille` vraie.
  const celluleDeg = Math.max(rayonM / 111_320, 1e-6);
  const grille = construireGrille(trace, celluleDeg);
  const prefixe = prefixeCumul(trace);
  // DÉDOUBLONNE, comme `retenir` : les tronçons de boîtes se chevauchent, un
  // même point peut revenir deux fois dans `candidats`.
  const vus = new Set<string>();
  const gardes: SurLeTrajet<StationRapide>[] = [];
  for (const poi of candidats) {
    const cle = `${poi.lon.toFixed(5)},${poi.lat.toFixed(5)}`;
    if (vus.has(cle)) continue;
    vus.add(cle);
    const { ecart, avancement } = situerViaGrille(poi, trace, grille, celluleDeg, prefixe);
    if (ecart <= rayonM) gardes.push({ poi, ecart, avancement });
  }
  return gardes.sort((a, b) => a.avancement - b.avancement);
}

export type Categorie = 'carburants' | 'bornes';

/** Cherche le long du trajet. Au plus MAX_TRONCONS appels ; une seule boîte
    en échec ne perd pas les autres (le trajet reste utile). */
export async function chercherLeLongDuTrajet(
  geometrie: LineString, categorie: Categorie, rayonM: number, signal?: AbortSignal,
): Promise<SurLeTrajet<PoiCarburant | PoiBorne>[]> {
  const trace = geometrie.coordinates as [number, number][];
  const boites = tronconner(trace, rayonM);
  const charger: (b: Bbox, s?: AbortSignal) => Promise<{ elements: (PoiCarburant | PoiBorne)[] }> =
    categorie === 'carburants' ? chargerCarburants : chargerBornes;
  const lots = await Promise.allSettled(boites.map((b) => charger(b, signal)));
  if (signal?.aborted) throw new DOMException('Recherche annulée', 'AbortError');
  const candidats: (PoiCarburant | PoiBorne)[] =
    lots.flatMap((l) => (l.status === 'fulfilled' ? l.value.elements : []));
  if (candidats.length === 0 && lots.every((l) => l.status === 'rejected')) {
    const premier = lots[0];
    throw premier && premier.status === 'rejected'
      ? (premier.reason as Error)
      : new Error('recherche le long du trajet impossible');
  }
  return retenir(candidats, trace, rayonM);
}
