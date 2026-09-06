/* LES ENSEIGNES DES STATIONS (ENSEIGNES-1, 06/09/2026) — le calcul PUR, et
 * un appel.
 *
 * Des amis d'Armelin : « filtrer les stations par enseigne (Total, Shell, BP,
 * Avia…) comme les réseaux de bornes ». L'open data des prix (THERMIQUE-2) ne
 * porte PAS l'enseigne ; OpenStreetMap la porte (`brand`, à défaut
 * `operator`, `name`). On demande donc à Overpass les stations le long du
 * tracé — UNE requête, sur un tracé simplifié à 500 m : on cherche des
 * stations à trois kilomètres, pas le dessin de la route — et l'on apparie
 * chaque station de prix à la station OSM la plus proche à moins de 150 m.
 * Sans voisine, l'enseigne reste inconnue, et le plan le dit.
 *
 * « CES QUOTAS SONT UN BIEN COMMUN » : une requête par plan, jamais une par
 * station ; le service d'OpenStreetMap France, celui de tout le projet. */
import { simplifier } from './simplifier';
import { distanceM } from './le-long-du-trajet';
import type { StationCarburant } from './carburant';

export interface StationOsm { lon: number; lat: number; enseigne: string }

export const ECART_TRACE_ENSEIGNES_M = 500;
export const RAYON_ENSEIGNES_M = 3_000;
export const RAYON_APPARIEMENT_M = 150;

/** La requête Overpass : les stations à moins de trois kilomètres du tracé. */
export function requeteEnseignes(trace: readonly [number, number][], rayonM = RAYON_ENSEIGNES_M): string {
  const points = simplifier(trace, ECART_TRACE_ENSEIGNES_M)
    .map(([lon, lat]) => `${lat.toFixed(5)},${lon.toFixed(5)}`)
    .join(',');
  return `[out:json][timeout:25];nwr["amenity"="fuel"](around:${rayonM},${points});out center tags;`;
}

/** Lit la réponse : une station par objet avec une position et un nom d'enseigne. */
export function versStationsOsm(brut: unknown): StationOsm[] {
  const elements = (brut as { elements?: unknown })?.elements;
  if (!Array.isArray(elements)) return [];
  const rendu: StationOsm[] = [];
  for (const e of elements) {
    if (typeof e !== 'object' || e === null) continue;
    const el = e as Record<string, unknown>;
    const tags = (el['tags'] ?? {}) as Record<string, unknown>;
    const centre = (el['center'] ?? {}) as Record<string, unknown>;
    const lat = typeof el['lat'] === 'number' ? el['lat']
      : (typeof centre['lat'] === 'number' ? centre['lat'] : null);
    const lon = typeof el['lon'] === 'number' ? el['lon']
      : (typeof centre['lon'] === 'number' ? centre['lon'] : null);
    if (lat === null || lon === null) continue;
    const enseigne = ['brand', 'operator', 'name']
      .map((k) => tags[k])
      .find((v): v is string => typeof v === 'string' && v.trim() !== '');
    if (!enseigne) continue;
    rendu.push({ lon, lat, enseigne: enseigne.trim() });
  }
  return rendu;
}

/** Donne à chaque station de prix l'enseigne de sa voisine OSM la plus proche (≤ 150 m). */
export function apparierEnseignes(
  stations: readonly StationCarburant[], osm: readonly StationOsm[], rayonM = RAYON_APPARIEMENT_M,
): StationCarburant[] {
  return stations.map((s) => {
    let meilleure: StationOsm | null = null;
    let d = Infinity;
    for (const o of osm) {
      const e = distanceM([s.lon, s.lat], [o.lon, o.lat]);
      if (e < d) { d = e; meilleure = o; }
    }
    return { ...s, enseigne: meilleure && d <= rayonM ? meilleure.enseigne : null };
  });
}

export interface Enseigne { nom: string; nombre: number }

/** Les enseignes présentes, les plus fréquentes d'abord — l'inconnue à part. */
export function enseignesDuTrajet(stations: readonly StationCarburant[]): Enseigne[] {
  const compte = new Map<string, number>();
  for (const s of stations) {
    if (!s.enseigne) continue;
    compte.set(s.enseigne, (compte.get(s.enseigne) ?? 0) + 1);
  }
  return [...compte.entries()]
    .map(([nom, nombre]) => ({ nom, nombre }))
    .sort((a, b) => b.nombre - a.nombre || a.nom.localeCompare(b.nom, 'fr'));
}

export class ErreurEnseignes extends Error {}

/** Les stations OSM le long du tracé — un appel, huit secondes, sans reprise :
 *  l'enseigne est un confort, le plan des pleins n'attend pas après elle. */
export async function chargerEnseignes(
  trace: readonly [number, number][], signal?: AbortSignal,
): Promise<StationOsm[]> {
  if (trace.length < 2) return [];
  const r = await fetch('https://overpass.openstreetmap.fr/api/interpreter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(requeteEnseignes(trace))}`,
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(8000)]) : AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new ErreurEnseignes(`Enseignes indisponibles (réponse ${r.status}).`);
  return versStationsOsm(await r.json());
}
