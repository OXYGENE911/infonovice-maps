/* LA VITESSE LIMITE CARTOGRAPHIÉE — le verdict de l'étude du 27/08/2026
 * (docs/navigation-mobile.md §Études) : `maxspeed` couvre 97 à 100 % des
 * axes mesurés (A6, RCEA, départementales) — la donnée porte la
 * fonctionnalité.
 *
 * CE QUE C'EST, ET CE QUE CE N'EST PAS. Une limite CARTOGRAPHIÉE par
 * OpenStreetMap : les zones de travaux, les limites variables et les
 * changements récents lui échappent. Ce n'est JAMAIS « l'ISA » — ce sigle
 * désigne un dispositif réglementaire embarqué à cartographie certifiée.
 * L'interface l'affiche pour ce qu'elle est, et se TAIT quand elle ne sait
 * pas : aucun panneau n'est pire qu'un panneau faux.
 *
 * UN APPEL PAR TRAJET, AU DÉMARRAGE DU SUIVI. La requête décrit le tracé par
 * une polyligne décimée (la mécanique des péages), les limites sont projetées
 * en intervalles d'avancement, et le suivi lit ensuite LOCALEMENT — le GPS
 * bat toutes les secondes, Overpass est un commun bénévole.
 */
import type { LineString } from 'geojson';
import { distanceM, situerSurLeTrace } from './le-long-du-trajet';

/* UN INTERVALLE PAR TRONÇON, PAS DES ÉCHANTILLONS PONCTUELS. La première
   écriture gardait les nœuds OSM comme points de mesure — et un test l'a
   immédiatement prise en défaut : sur une ligne droite, les nœuds d'une même
   route s'espacent de plus d'un kilomètre, et la lecture « au plus proche »
   se taisait AU MILIEU d'un tronçon limité. La route est continue entre ses
   nœuds : c'est l'intervalle [premier, dernier] qui porte la limite. */
export interface LimiteTrajet {
  /** Début du tronçon le long du trajet, en mètres. */
  debutM: number;
  /** Fin du tronçon, en mètres. */
  finM: number;
  kmh: number;
}

/* LE RAYON EST SERRÉ (25 m) : on cherche LA route qu'on suit, pas le quartier.
   La décimation doit donc l'être aussi — à 300 m de pas, la corde d'une
   courbe d'autoroute reste sous le rayon. Le plafond de points est plus haut
   que celui des péages : la requête part en POST, sa taille n'est pas bornée
   par l'URL. */
export const RAYON_LIMITE_M = 25;
const PAS_DECIMATION_M = 300;
const MAX_POINTS = 1500;

/** Marge aux bords d'un tronçon — au-delà, on SE TAIT. */
export const TOLERANCE_M = 200;

/** Décime le tracé pour la requête — PURE. */
export function decimerSerre(trace: [number, number][]): [number, number][] {
  if (trace.length <= 2) return trace;
  let longueur = 0;
  for (let i = 0; i < trace.length - 1; i += 1) longueur += distanceM(trace[i]!, trace[i + 1]!);
  const pas = Math.max(PAS_DECIMATION_M, longueur / MAX_POINTS);
  const garde: [number, number][] = [trace[0]!];
  let depuis = 0;
  for (let i = 1; i < trace.length - 1; i += 1) {
    depuis += distanceM(trace[i - 1]!, trace[i]!);
    if (depuis >= pas) { garde.push(trace[i]!); depuis = 0; }
  }
  garde.push(trace[trace.length - 1]!);
  return garde;
}

/** Le corps de la requête Overpass (à envoyer en POST) — PURE. */
export function requeteLimites(trace: [number, number][]): string {
  const points = decimerSerre(trace)
    .map(([lon, lat]) => `${lat.toFixed(5)},${lon.toFixed(5)}`)
    .join(',');
  /* SEULES LES ROUTES ROULABLES, avec une maxspeed : demander tout `highway`
     ramènerait chemins et pistes cyclables du bord de route. */
  return '[out:json][timeout:25];'
    + 'way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified'
    + '|residential|motorway_link|trunk_link|primary_link)$"]["maxspeed"]'
    + `(around:${RAYON_LIMITE_M},${points});`
    + 'out geom tags;';
}

/**
 * `maxspeed` OSM → km/h — PURE, défensive.
 *
 * Les valeurs françaises implicites sont traduites ; « signals », « none »,
 * « variable » et les unités étrangères rendent `null` : on se tait plutôt
 * que d'afficher un panneau faux.
 */
export function kmhDe(brut: unknown): number | null {
  if (typeof brut !== 'string') return null;
  const t = brut.trim().toLowerCase();
  const IMPLICITES: Record<string, number> = {
    'fr:urban': 50, 'fr:rural': 80, 'fr:motorway': 130, 'fr:zone30': 30,
    'fr:walk': 20, 'walk': 20,
  };
  if (t in IMPLICITES) return IMPLICITES[t]!;
  if (!/^\d{1,3}$/.test(t)) return null;
  const n = Number(t);
  return n >= 5 && n <= 130 ? n : null;
}

/**
 * Réponse Overpass → échantillons de limite le long du tracé — PURE.
 *
 * LES ROUTES QUI CROISENT SONT ÉCARTÉES PAR LEUR EMPREINTE : un pont ou une
 * rue transversale n'a qu'un ou deux nœuds près du tracé, sur une longueur
 * d'avancement quasi nulle — la route qu'on SUIT en a plusieurs, étalés.
 * On exige donc deux nœuds proches ET cent mètres d'étalement. L'heuristique
 * n'est pas parfaite (une bretelle courte peut passer au travers) ; la
 * tolérance de lecture et le silence par défaut bornent le dégât.
 */
export function versLimites(brut: unknown, trace: [number, number][]): LimiteTrajet[] {
  const elements = (brut as { elements?: unknown })?.elements;
  if (!Array.isArray(elements)) return [];

  const troncons: LimiteTrajet[] = [];
  for (const e of elements) {
    if (typeof e !== 'object' || e === null) continue;
    const el = e as Record<string, unknown>;
    const tags = (el['tags'] ?? {}) as Record<string, unknown>;
    const kmh = kmhDe(tags['maxspeed']);
    if (kmh === null) continue;
    const geometrie = el['geometry'];
    if (!Array.isArray(geometrie)) continue;

    const proches: number[] = [];
    for (const p of geometrie) {
      const lat = (p as Record<string, unknown>)['lat'];
      const lon = (p as Record<string, unknown>)['lon'];
      if (typeof lat !== 'number' || typeof lon !== 'number') continue;
      const { ecart, avancement } = situerSurLeTrace({ lon, lat }, trace);
      if (ecart <= RAYON_LIMITE_M * 2) proches.push(avancement);
    }
    if (proches.length < 2) continue;
    const debutM = Math.min(...proches);
    const finM = Math.max(...proches);
    if (finM - debutM < 100) continue;
    troncons.push({ debutM, finM, kmh });
  }
  return troncons.sort((a, b) => a.debutM - b.debutM);
}

/**
 * La limite à un avancement donné — PURE, appelée à chaque fixe GPS.
 *
 * L'INTERVALLE QUI CONTIENT l'avancement répond (marge aux bords). Quand deux
 * tronçons se chevauchent — un changement de limite —, celui commencé en
 * DERNIER l'emporte : c'est la route où l'on vient d'entrer. Hors de tout
 * tronçon : `null` — le panneau disparaît plutôt que d'afficher la limite
 * d'il y a trois kilomètres.
 */
export function limiteA(
  limites: readonly LimiteTrajet[], avancementM: number, toleranceM = TOLERANCE_M,
): number | null {
  let retenu: LimiteTrajet | null = null;
  for (const l of limites) {
    if (l.debutM - toleranceM > avancementM) break; // triés par début
    if (avancementM <= l.finM + toleranceM
      && (retenu === null || l.debutM >= retenu.debutM)) retenu = l;
  }
  return retenu?.kmh ?? null;
}

export class ErreurLimites extends Error {}

/** Cherche les limites d'un itinéraire — UN appel POST, au démarrage du suivi. */
export async function chargerLimites(
  geometrie: LineString, signal?: AbortSignal,
): Promise<LimiteTrajet[]> {
  const trace = geometrie.coordinates as [number, number][];
  if (trace.length < 2) return [];
  const horloge = new AbortController();
  const minuteur = setTimeout(() => { horloge.abort(); }, 20_000);
  const relais = (): void => { horloge.abort(); };
  signal?.addEventListener('abort', relais);
  try {
    /* EN POST : la polyligne serrée dépasse ce qu'une URL accepte. */
    const r = await fetch('https://overpass.openstreetmap.fr/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(requeteLimites(trace))}`,
      signal: horloge.signal,
    });
    if (!r.ok) throw new ErreurLimites('Les limites de vitesse ne sont pas disponibles.');
    const texte = await r.text();
    try {
      return versLimites(JSON.parse(texte), trace);
    } catch {
      throw new ErreurLimites('Le service des limites est saturé.');
    }
  } catch (e) {
    if (e instanceof ErreurLimites) throw e;
    throw new ErreurLimites('Les limites de vitesse ne sont pas disponibles.', { cause: e });
  } finally {
    clearTimeout(minuteur);
    signal?.removeEventListener('abort', relais);
  }
}
