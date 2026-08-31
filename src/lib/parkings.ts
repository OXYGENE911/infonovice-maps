/* LES PARKINGS AUTOUR DE LA DESTINATION — la suggestion de fin de trajet.
 *
 * LA DEMANDE (PARK-1, 31/08). Armelin : « ce serait bien que l'algorithme
 * affiche un petit panneau rond P lorsqu'on arrive presque à destination,
 * afin de proposer une liste de parkings publics à proximité et si possible
 * le nombre de places disponibles […] avec un bouton "Se garer" pour
 * replanifier automatiquement la destination vers cet emplacement. Les
 * parkings doivent s'afficher du plus près au plus éloigné de la destination
 * finale, car la fin du trajet entre le parking et la destination se fera
 * logiquement à pied. »
 *
 * D'OÙ VIENNENT LES PARKINGS : OpenStreetMap, par Overpass — la même source
 * que les lieux, le même respect du commun bénévole : UNE requête, au clic
 * du bouton P, jamais en tâche de fond.
 *
 * LES PLACES DISPONIBLES : CE QU'ON SAIT, ET CE QU'ON NE SAIT PAS. La
 * CAPACITÉ (nombre de places du parking) est souvent cartographiée — on
 * l'affiche quand elle l'est. La DISPONIBILITÉ EN TEMPS RÉEL, elle, n'a
 * aucune source nationale gratuite et sans clé : chaque exploitant expose la
 * sienne, quand il en expose une, ville par ville. En interroger une poignée
 * ferait un service qui marche à Paris et ment partout ailleurs — et le
 * mandat exige une décision d'Armelin pour toute dérogation. On affiche donc
 * la capacité en la nommant « places », jamais « places libres » : un mot
 * juste vaut mieux qu'une promesse fausse.
 */
import { distanceM } from './le-long-du-trajet';
import type { PointGeo } from './coordonnees';
import { aRenonce, delaiClientMs } from './troncons';

/** Un parking prêt à être proposé. */
export interface Parking {
  nom: string | null;
  lon: number;
  lat: number;
  /** Distance à vol d'oiseau jusqu'à la destination FINALE, en mètres. */
  distanceM: number;
  /** La capacité cartographiée — PAS la disponibilité. `null` si inconnue. */
  places: number | null;
  /** Payant, gratuit, ou on ne sait pas. */
  payant: boolean | null;
}

/* LE RAYON DE RECHERCHE. Six cents mètres : au-delà, la marche dépasse le
   quart d'heure aller-retour et la suggestion cesse d'en être une. */
export const RAYON_PARKINGS_M = 600;

/* COMBIEN DE PARKINGS ON PROPOSE. Huit : une liste qui se lit d'un regard.
   Ils sont déjà triés du plus proche au plus loin — le neuvième serait le
   moins bon de tous. */
export const MAX_PARKINGS = 8;

/* LE BUDGET SERVEUR — et le client attend PLUS (delaiClientMs), la leçon des
   feux et des péages. */
export const BUDGET_PARKINGS_S = 25;

/** Le corps de la requête Overpass — PURE. */
export function requeteParkings(destination: PointGeo): string {
  /* `access` : un parking privé ou réservé n'est pas une suggestion, c'est
     une contravention. On écarte ce qui se déclare fermé au public ; ce qui
     ne déclare rien passe — l'immense majorité des parkings publics n'écrit
     pas `access=yes`. */
  return `[out:json][timeout:${BUDGET_PARKINGS_S}];`
    + `nwr(around:${RAYON_PARKINGS_M},${destination.lat.toFixed(5)},${destination.lon.toFixed(5)})`
    + '["amenity"="parking"]["access"!~"^(private|no|customers|permissive)$"]'
    + '["parking"!~"^(underground_private)$"];'
    + 'out center tags;';
}

/** Décode la réponse — PURE, défensive, triée du plus proche au plus loin. */
export function versParkings(brut: unknown, destination: PointGeo): Parking[] {
  const elements = (brut as { elements?: unknown })?.elements;
  if (!Array.isArray(elements)) return [];
  const rendu: Parking[] = [];
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

    const nom = typeof tags['name'] === 'string' && tags['name'].trim() !== ''
      ? tags['name'].trim() : null;
    /* LA CAPACITÉ EST UN NOMBRE OU RIEN : « capacity=beaucoup » existe dans
       la nature, et l'afficher ferait douter du reste. */
    const capacite = Number(tags['capacity']);
    const places = Number.isFinite(capacite) && capacite > 0
      ? Math.round(capacite) : null;
    const frais = tags['fee'];
    const payant = frais === 'yes' ? true : (frais === 'no' ? false : null);

    rendu.push({
      nom, lon, lat, places, payant,
      distanceM: Math.round(distanceM([destination.lon, destination.lat], [lon, lat])),
    });
  }
  /* DU PLUS PRÈS AU PLUS LOIN DE LA DESTINATION — la demande le dit et la
     justifie : « la fin du trajet entre le parking et la destination se fera
     logiquement à pied ». */
  return rendu.sort((a, b) => a.distanceM - b.distanceM).slice(0, MAX_PARKINGS);
}

export class ErreurParkings extends Error {}

/** Cherche les parkings — UNE requête, au clic du bouton P. */
export async function chargerParkings(
  destination: PointGeo, signal?: AbortSignal,
): Promise<Parking[]> {
  const horloge = new AbortController();
  const minuteur = setTimeout(() => { horloge.abort(); }, delaiClientMs(BUDGET_PARKINGS_S));
  const relais = (): void => { horloge.abort(); };
  signal?.addEventListener('abort', relais);
  try {
    const r = await fetch('https://overpass.openstreetmap.fr/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(requeteParkings(destination))}`,
      signal: horloge.signal,
    });
    if (!r.ok) throw new ErreurParkings('La recherche de parkings est indisponible.');
    const brut: unknown = JSON.parse(await r.text());
    // L'AVEU DU SERVICE SE LIT — la leçon du 31/08, appliquée d'emblée.
    if (aRenonce(brut)) throw new ErreurParkings('Le service OpenStreetMap est saturé.');
    return versParkings(brut, destination);
  } catch (e) {
    if (e instanceof ErreurParkings) throw e;
    throw new ErreurParkings('La recherche de parkings est indisponible.', { cause: e });
  } finally {
    clearTimeout(minuteur);
    signal?.removeEventListener('abort', relais);
  }
}
