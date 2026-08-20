// Partage d'itinéraire par URL — AUCUN serveur : tout vit dans le fragment
// (#…), qui ne quitte jamais le navigateur (il n'est pas envoyé au serveur
// HTTP). Cinq décimales ≈ 1 m : la précision de la BAN, pas plus.
import type { PointGeo } from './coordonnees';
import type { Profil } from './itineraire';

export interface PartageItineraire {
  depart: PointGeo;
  arrivee: PointGeo;
  profil: Profil;
}

const f = (n: number) => n.toFixed(5);

export function versFragment(p: PartageItineraire): string {
  return `#iti=${f(p.depart.lon)},${f(p.depart.lat)};${f(p.arrivee.lon)},${f(p.arrivee.lat)};${p.profil}`;
}

/** Analyse défensive : un fragment forgé rend null, jamais une exception. */
export function depuisFragment(fragment: string): PartageItineraire | null {
  const m = /^#iti=(-?[\d.]+),(-?[\d.]+);(-?[\d.]+),(-?[\d.]+);(car|pedestrian)$/.exec(fragment);
  if (!m) return null;
  const [, lon1, lat1, lon2, lat2, profil] = m;
  const nombres = [lon1, lat1, lon2, lat2].map(Number);
  if (nombres.some((n) => !Number.isFinite(n))) return null;
  const [a, b, c, d] = nombres as [number, number, number, number];
  if (Math.abs(b) > 90 || Math.abs(d) > 90 || Math.abs(a) > 180 || Math.abs(c) > 180) return null;
  return { depart: { lon: a, lat: b }, arrivee: { lon: c, lat: d }, profil: profil as Profil };
}
