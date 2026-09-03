// Partage d'itinéraire par URL — AUCUN serveur : tout vit dans le fragment
// (#…), qui ne quitte jamais le navigateur (il n'est pas envoyé au serveur
// HTTP). Cinq décimales ≈ 1 m : la précision de la BAN, pas plus.
//
// Forme : #iti=lon,lat;…;lon,lat;mode[;evite=autoroute|tunnel|pont][;opt=shortest]
// où `mode` vaut car | moto | velo | pedestrian. Les deux premières graphies
// sont les anciennes (MODE-1, 03/09) : « car » veut dire Voiture et
// « pedestrian » À pied, exactement ce qu'elles ont toujours voulu dire. Un
// lien partagé la semaine dernière rouvre donc le même trajet.
// Tous les points dans l'ordre du trajet (départ, étapes, arrivée) — deux
// points minimum. L'ancienne forme à deux points reste un cas particulier :
// les liens déjà partagés ne cassent pas.
import type { PointGeo } from './coordonnees';
import { EVITEMENTS, MAX_ETAPES, type Eviter, type Optimisation } from './itineraire';
import { jetonDe, modeDuJeton, type Mode } from './modes-deplacement';

export interface PartageItineraire {
  depart: PointGeo;
  arrivee: PointGeo;
  mode: Mode;
  etapes: PointGeo[];
  eviter: Eviter[];
  optimisation: Optimisation;
}

const f = (n: number) => n.toFixed(5);
const point = (p: PointGeo) => `${f(p.lon)},${f(p.lat)}`;

export function versFragment(p: Omit<PartageItineraire, 'etapes' | 'eviter' | 'optimisation'>
  & Partial<Pick<PartageItineraire, 'etapes' | 'eviter' | 'optimisation'>>): string {
  const points = [p.depart, ...(p.etapes ?? []), p.arrivee].map(point).join(';');
  const evite = p.eviter?.length ? `;evite=${p.eviter.join('|')}` : '';
  /* `fastest` reste ABSENT du lien : c'est le défaut de toujours, et les
     liens déjà partagés doivent rester identiques à eux-mêmes. */
  const opt = p.optimisation === 'shortest' ? ';opt=shortest' : '';
  return `#iti=${points};${jetonDe(p.mode)}${evite}${opt}`;
}

/** Analyse défensive : un fragment forgé rend null, jamais une exception. */
export function depuisFragment(fragment: string): PartageItineraire | null {
  const m = /^#iti=((?:-?[\d.]+,-?[\d.]+;)+)(car|moto|velo|pedestrian)(?:;evite=([a-z|]+))?(?:;opt=(\w+))?$/.exec(fragment);
  if (!m) return null;
  const [, brutPoints, jeton, brutEvite, brutOpt] = m;
  /* UN JETON INCONNU INVALIDE TOUT, comme un évitement inconnu : on ne
     devine pas ce qu'un lien forgé a voulu dire. */
  const mode = modeDuJeton(jeton!);
  if (mode === null) return null;
  /* Même règle que les évitements : une valeur INCONNUE invalide tout le
     fragment. `fastest` est accepté bien que jamais émis — c'est le défaut,
     l'écrire à la main ne ment sur rien. */
  if (brutOpt !== undefined && brutOpt !== 'shortest' && brutOpt !== 'fastest') return null;
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
    mode,
    optimisation: brutOpt === 'shortest' ? 'shortest' : 'fastest',
  };
}
