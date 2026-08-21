// Partage d'itinéraire par URL — AUCUN serveur : tout vit dans le fragment
// (#…), qui ne quitte jamais le navigateur (il n'est pas envoyé au serveur
// HTTP). Cinq décimales ≈ 1 m : la précision de la BAN, pas plus.
//
// Forme : #iti=lon,lat;…;lon,lat;profil[;evite=autoroute|tunnel|pont]
// Tous les points dans l'ordre du trajet (départ, étapes, arrivée) — deux
// points minimum. L'ancienne forme à deux points reste un cas particulier :
// les liens déjà partagés ne cassent pas.
import type { PointGeo } from './coordonnees';
import { EVITEMENTS, MAX_ETAPES, type Eviter, type Profil } from './itineraire';

export interface PartageItineraire {
  depart: PointGeo;
  arrivee: PointGeo;
  profil: Profil;
  etapes: PointGeo[];
  eviter: Eviter[];
}

const f = (n: number) => n.toFixed(5);
const point = (p: PointGeo) => `${f(p.lon)},${f(p.lat)}`;

export function versFragment(p: Omit<PartageItineraire, 'etapes' | 'eviter'>
  & Partial<Pick<PartageItineraire, 'etapes' | 'eviter'>>): string {
  const points = [p.depart, ...(p.etapes ?? []), p.arrivee].map(point).join(';');
  const evite = p.eviter?.length ? `;evite=${p.eviter.join('|')}` : '';
  return `#iti=${points};${p.profil}${evite}`;
}

/** Analyse défensive : un fragment forgé rend null, jamais une exception. */
export function depuisFragment(fragment: string): PartageItineraire | null {
  const m = /^#iti=((?:-?[\d.]+,-?[\d.]+;)+)(car|pedestrian)(?:;evite=([a-z|]+))?$/.exec(fragment);
  if (!m) return null;
  const [, brutPoints, profil, brutEvite] = m;
  const points: PointGeo[] = [];
  for (const seg of brutPoints!.split(';').filter(Boolean)) {
    const [lon, lat] = seg.split(',').map(Number);
    if (lon === undefined || lat === undefined
      || !Number.isFinite(lon) || !Number.isFinite(lat)
      || Math.abs(lon) > 180 || Math.abs(lat) > 90) return null;
    points.push({ lon, lat });
  }
  // Deux extrémités + la même borne d'étapes que l'interface : un lien à dix
  // étapes rejouerait sinon, en silence, un trajet tronqué — différent de ce
  // qu'il promet.
  if (points.length < 2 || points.length > MAX_ETAPES + 2) return null;
  const eviter: Eviter[] = [];
  for (const v of brutEvite ? brutEvite.split('|') : []) {
    // Une valeur inconnue invalide TOUT le fragment : on ne devine pas ce
    // qu'un lien forgé a voulu dire. hasOwn, pas `in` : `in` remonte la chaîne
    // de prototypes et laissait passer `evite=constructor` (revue du 21/08).
    if (!Object.hasOwn(EVITEMENTS, v)) return null;
    if (!eviter.includes(v as Eviter)) eviter.push(v as Eviter);
  }
  return {
    depart: points[0]!,
    arrivee: points[points.length - 1]!,
    etapes: points.slice(1, -1),
    eviter,
    profil: profil as Profil,
  };
}
