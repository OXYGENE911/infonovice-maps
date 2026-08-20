// Profil altimétrique — API Géoplateforme (data.geopf.fr/altimetrie),
// ressource ign_rge_alti_wld, sans clé. Vérifié par appels réels le
// 20/08/2026 (docs/apis.md) : elevationLine.json échantillonne le long d'une
// polyligne (`lon=a|b|c&lat=d|e|f&sampling=N`) ; 40 sommets tiennent en
// ~800 caractères d'URL. Résilience : timeout 8 s, une reprise, erreurs en
// français (règles du projet).
import type { LineString } from 'geojson';

const SERVICE = 'https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevationLine.json';
const DELAI_MS = 8000;
// Deux bornes distinctes : les sommets ENVOYÉS (l'URL doit rester courte) et
// les points RENDUS par le service (la résolution du profil affiché).
const MAX_SOMMETS = 40;
const ECHANTILLONS = 80;

export class ErreurAltimetrie extends Error {}

export interface PointProfil {
  /** Distance cumulée depuis le départ, en mètres. */
  distance: number;
  /** Altitude en mètres. */
  z: number;
}

/** Ne garde qu'au plus `max` sommets, premier et dernier compris — PURE. */
export function simplifier(points: [number, number][], max: number): [number, number][] {
  if (max < 2) throw new ErreurAltimetrie('Un profil demande au moins deux sommets.');
  if (points.length <= max) return points;
  const gardes: [number, number][] = [];
  const pas = (points.length - 1) / (max - 1);
  for (let i = 0; i < max; i += 1) {
    gardes.push(points[Math.round(i * pas)] as [number, number]);
  }
  return gardes;
}

/** Distance haversine en mètres — assez précise pour l'axe d'un profil. */
function distanceM(a: { lon: number; lat: number }, b: { lon: number; lat: number }): number {
  const RAYON_M = 6_371_000;
  const rad = (d: number): number => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const s = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * RAYON_M * Math.asin(Math.sqrt(s));
}

/** Transformation pure de la réponse du service — testée à sec. */
export function versProfil(brut: unknown): PointProfil[] {
  const els = (brut as { elevations?: { lon?: number; lat?: number; z?: number }[] })?.elevations;
  if (!Array.isArray(els)) {
    throw new ErreurAltimetrie('Le service n’a pas rendu de profil exploitable.');
  }
  const points: PointProfil[] = [];
  let cumul = 0;
  let prec: { lon: number; lat: number } | null = null;
  for (const e of els) {
    const lon = e?.lon; const lat = e?.lat; const z = e?.z;
    if (typeof lon !== 'number' || typeof lat !== 'number' || typeof z !== 'number') continue;
    // Le service marque « pas de donnée » par une altitude très négative
    // (-99999) : on écarte le point plutôt que de dessiner un gouffre.
    if (z <= -1000) continue;
    if (prec) cumul += distanceM(prec, { lon, lat });
    points.push({ distance: cumul, z });
    prec = { lon, lat };
  }
  if (points.length < 2) {
    throw new ErreurAltimetrie('Le service n’a pas rendu de profil exploitable.');
  }
  return points;
}

/** Dénivelés cumulés positif et négatif, en mètres — PURE. */
export function denivele(points: PointProfil[]): { montee: number; descente: number } {
  let montee = 0; let descente = 0;
  for (let i = 1; i < points.length; i += 1) {
    const d = (points[i] as PointProfil).z - (points[i - 1] as PointProfil).z;
    if (d > 0) montee += d; else descente -= d;
  }
  return { montee, descente };
}

export interface TraceSVG {
  /** Points de la polyligne du profil, prêts pour un attribut `points`. */
  ligne: string;
  /** Polygone fermé (ligne + retour par le bas) pour l'aire sous la courbe. */
  aire: string;
  zMin: number;
  zMax: number;
}

/** Projette le profil dans un repère SVG largeur×hauteur — PURE. */
export function versTraceSVG(points: PointProfil[], largeur: number, hauteur: number): TraceSVG {
  if (points.length < 2) throw new ErreurAltimetrie('Un profil demande au moins deux points.');
  const MARGE = 4;
  const zMin = Math.min(...points.map((p) => p.z));
  const zMax = Math.max(...points.map((p) => p.z));
  const total = (points[points.length - 1] as PointProfil).distance || 1;
  const plage = zMax - zMin;
  const y = (z: number): number => (plage === 0
    ? hauteur / 2
    // L'axe SVG descend : zMax en haut (MARGE), zMin en bas (hauteur - MARGE).
    : MARGE + ((zMax - z) / plage) * (hauteur - 2 * MARGE));
  const ligne = points
    .map((p) => `${((p.distance / total) * largeur).toFixed(1)},${y(p.z).toFixed(1)}`)
    .join(' ');
  return { ligne, aire: `${ligne} ${largeur},${hauteur} 0,${hauteur}`, zMin, zMax };
}

export async function profilItineraire(geometrie: LineString): Promise<PointProfil[]> {
  const sommets = simplifier(geometrie.coordinates as [number, number][], MAX_SOMMETS);
  const lons = sommets.map((c) => c[0].toFixed(5)).join('|');
  const lats = sommets.map((c) => c[1].toFixed(5)).join('|');
  const url = `${SERVICE}?lon=${lons}&lat=${lats}&resource=ign_rge_alti_wld&sampling=${ECHANTILLONS}`;
  let derniere: unknown;
  for (let essai = 0; essai < 2; essai += 1) {
    try {
      const r = await fetch(url, {
        signal: AbortSignal.timeout(DELAI_MS),
        headers: { Accept: 'application/json' },
      });
      if (!r.ok) throw new Error(`service ${r.status}`);
      return versProfil(await r.json());
    } catch (e) {
      if (e instanceof ErreurAltimetrie) throw e;
      derniere = e;
      if (essai === 0) await new Promise((s) => setTimeout(s, 500));
    }
  }
  throw new ErreurAltimetrie(
    'Le profil altimétrique est momentanément indisponible. Réessayez dans un instant.',
    { cause: derniere },
  );
}
