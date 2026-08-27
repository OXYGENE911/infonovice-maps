/* LES PÉAGES DU TRAJET, NOMMÉS — le verdict de l'étude du 27/08/2026
 * (docs/etudes-mandat-27-08.md §2).
 *
 * CE QUE CE MODULE NE PROMET PAS : l'ÉVITEMENT. Le moteur public IGN n'a pas
 * de clause péage (mesuré PR #6), et recalculer un itinéraire pondéré
 * exigerait un graphe routier en mémoire — un backend, hors 0 €. Ce module
 * répond à la question d'avant : « ce tracé franchit-il des péages, et
 * lesquels ? » — de quoi comparer soi-même avec la variante sans autoroute.
 *
 * LA SOURCE EST OPENSTREETMAP (`barrier=toll_booth`), par le miroir français
 * d'Overpass — le même service bénévole que les commodités (PR #29), avec les
 * mêmes égards : une requête étroite, bornée en temps, émise UNIQUEMENT au
 * clic de l'usager. Et la même honnêteté : une gare absente de la carte OSM
 * ne sera pas relevée — l'interface le dit.
 *
 * UNE GARE N'EST PAS UN NŒUD. OpenStreetMap cartographie souvent CHAQUE
 * CABINE d'une barrière (une par voie) : compter les nœuds annoncerait
 * « quatorze péages » là où l'usager n'en franchit qu'un. Les cabines à moins
 * de cinq cents mètres d'avancement l'une de l'autre fondent donc en une
 * seule gare, qui porte le premier nom déclaré du groupe.
 */
import type { LineString } from 'geojson';
import { distanceM, situerSurLeTrace } from './le-long-du-trajet';

export interface Peage {
  /** « Gare de péage de Fleury »… `null` quand OSM ne déclare rien. */
  nom: string | null;
  lon: number;
  lat: number;
  /** Distance depuis le départ, le long du trajet, en mètres. */
  avancementM: number;
}

/* LE RAYON ABSORBE LA CORDE. La requête décrit le trajet par une polyligne
   DÉCIMÉE : entre deux points espacés de deux kilomètres, la corde s'écarte
   de la route dans les courbes. Quatre cents mètres couvrent l'écart des
   courbes d'autoroute sans ramasser la départementale voisine. */
export const RAYON_PEAGE_M = 400;

/** Deux cabines à moins de cet avancement l'une de l'autre sont UNE gare. */
export const FUSION_GARE_M = 500;

/** Au-delà, la requête Overpass deviendrait un roman : on espace les points. */
const MAX_POINTS = 400;

/**
 * Décime un tracé : un point tous les `pasM` mètres environ, premier et
 * dernier gardés, plafonné à MAX_POINTS — PURE.
 *
 * `around` d'Overpass mesure la distance à la POLYLIGNE décrite par la liste
 * de points : décimer n'échantillonne pas des disques, il simplifie une
 * ligne. Le pas s'élargit de lui-même sur les très longs trajets pour tenir
 * sous le plafond.
 */
export function decimer(trace: [number, number][], pasM = 1000): [number, number][] {
  if (trace.length <= 2) return trace;
  let longueur = 0;
  for (let i = 0; i < trace.length - 1; i += 1) longueur += distanceM(trace[i]!, trace[i + 1]!);
  const pas = Math.max(pasM, longueur / MAX_POINTS);

  const garde: [number, number][] = [trace[0]!];
  let depuisDernier = 0;
  for (let i = 1; i < trace.length - 1; i += 1) {
    depuisDernier += distanceM(trace[i - 1]!, trace[i]!);
    if (depuisDernier >= pas) {
      garde.push(trace[i]!);
      depuisDernier = 0;
    }
  }
  garde.push(trace[trace.length - 1]!);
  return garde;
}

/** L'URL Overpass des cabines de péage le long d'un tracé — PURE. */
export function urlPeages(trace: [number, number][]): string {
  const points = decimer(trace)
    .map(([lon, lat]) => `${lat.toFixed(5)},${lon.toFixed(5)}`)
    .join(',');
  /* `nwr` : les barrières sont presque toujours des nœuds, mais quelques
     gares sont dessinées en chemin — `out center tags` rend leur position
     sans leur géométrie. */
  const requete = '[out:json][timeout:25];'
    + `nwr["barrier"="toll_booth"](around:${RAYON_PEAGE_M},${points});`
    + 'out center tags;';
  return `https://overpass.openstreetmap.fr/api/interpreter?data=${encodeURIComponent(requete)}`;
}

/**
 * Décode la réponse et FOND LES CABINES EN GARES, triées par avancement —
 * PURE, défensive : la réponse vient du dehors.
 */
export function versPeages(brut: unknown, trace: [number, number][]): Peage[] {
  const elements = (brut as { elements?: unknown })?.elements;
  if (!Array.isArray(elements)) return [];

  const cabines: Peage[] = [];
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

    const { ecart, avancement } = situerSurLeTrace({ lon, lat }, trace);
    /* LE FILTRE EXACT EST LOCAL, comme partout : la requête a interrogé une
       polyligne décimée, la distance au VRAI tracé se vérifie ici. */
    if (ecart > RAYON_PEAGE_M) continue;

    const nom = ['name', 'operator']
      .map((k) => tags[k])
      .find((v): v is string => typeof v === 'string' && v.trim() !== '');
    cabines.push({ nom: nom?.trim() ?? null, lon, lat, avancementM: avancement });
  }

  cabines.sort((a, b) => a.avancementM - b.avancementM);

  /* LES CABINES FONDENT EN GARES : un trou de plus de cinq cents mètres
     d'avancement ouvre une nouvelle gare ; dans un groupe, le premier nom
     déclaré l'emporte — les cabines anonymes ne volent pas le nom. */
  const gares: Peage[] = [];
  for (const c of cabines) {
    const derniere = gares[gares.length - 1];
    if (derniere && c.avancementM - derniere.avancementM <= FUSION_GARE_M) {
      if (derniere.nom === null && c.nom !== null) derniere.nom = c.nom;
      continue;
    }
    gares.push({ ...c });
  }
  return gares;
}

export class ErreurPeages extends Error {}

/** Cherche les gares de péage d'un itinéraire. UN appel, au clic seulement. */
export async function chargerPeages(
  geometrie: LineString, signal?: AbortSignal,
): Promise<Peage[]> {
  const trace = geometrie.coordinates as [number, number][];
  if (trace.length < 2) return [];
  const horloge = new AbortController();
  const minuteur = setTimeout(() => { horloge.abort(); }, 15_000);
  const relais = (): void => { horloge.abort(); };
  signal?.addEventListener('abort', relais);
  try {
    const r = await fetch(urlPeages(trace), { signal: horloge.signal });
    if (!r.ok) throw new ErreurPeages('Les péages ne sont pas disponibles pour le moment.');
    // En surcharge, Overpass rend une page HTML : on la traduit en français.
    const texte = await r.text();
    try {
      return versPeages(JSON.parse(texte), trace);
    } catch {
      throw new ErreurPeages('Le service des péages est saturé. Réessayez dans un instant.');
    }
  } catch (e) {
    if (e instanceof ErreurPeages) throw e;
    if (signal?.aborted) throw e;
    throw new ErreurPeages('Les péages ne sont pas disponibles pour le moment.');
  } finally {
    clearTimeout(minuteur);
    signal?.removeEventListener('abort', relais);
  }
}
