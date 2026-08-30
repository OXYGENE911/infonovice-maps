/* LE CORRIDOR : UNE SEULE REQUÊTE OVERPASS POUR TOUT CE QU'ON Y RELÈVE.
 *
 * POURQUOI CE MODULE EXISTE. Le suivi a besoin de trois choses qui vivent
 * toutes dans OpenStreetMap le long du même tracé : les limites de vitesse
 * (lib/limites.ts), les numéros de sortie et les destinations des bretelles
 * (lib/sorties.ts). Les demander séparément ferait DEUX requêtes de vingt
 * secondes au démarrage de chaque suivi.
 *
 * Overpass est tenu par des bénévoles, et le CLAUDE.md du projet en fait une
 * règle : « ne JAMAIS marteler les API publiques […] ces quotas sont un bien
 * commun ». Une union, un aller-retour, un seul temps d'attente — et les
 * réponses se trient à l'arrivée, ce qui ne coûte rien à personne.
 *
 * CE QU'IL NE FAIT PAS : décider. Il transporte et il trie. Les seuils, les
 * refus et les coutures restent dans les deux modules, qui se testent à sec.
 */
import type { LineString } from 'geojson';
import {
  decimerSerre, versLimites, RAYON_LIMITE_M, ErreurLimites, type LimiteTrajet,
} from './limites';
import {
  fragmentSorties, versSorties, versDestinations,
  type Sortie, type DestinationBretelle,
} from './sorties';
import { versGiratoires, type Giratoire } from './giratoire';

export interface Corridor {
  limites: LimiteTrajet[];
  sorties: Sortie[];
  destinations: DestinationBretelle[];
  giratoires: Giratoire[];
}

/** Le corps de la requête unique — PURE. */
export function requeteCorridor(trace: readonly [number, number][]): string {
  const points = decimerSerre(trace as [number, number][])
    .map(([lon, lat]) => `${lat.toFixed(5)},${lon.toFixed(5)}`)
    .join(',');
  /* LE DÉLAI EST CELUI DU PLUS LENT, pas la somme des deux : Overpass
     travaille la requête entière avant de répondre. Quarante secondes —
     mesuré le 30/08 : 19 s pour les seules sorties d'un corridor de 71 km. */
  return '[out:json][timeout:45];('
    + 'way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified'
    + '|residential|motorway_link|trunk_link|primary_link)$"]["maxspeed"]'
    + `(around:${RAYON_LIMITE_M},${points});`
    + fragmentSorties(points)
    /* L'ANNEAU DES GIRATOIRES entre dans la même union, et ses BRANCHES
       suivent par un second `out` — Overpass en accepte plusieurs dans une
       requête, ce qui garde un seul aller-retour (mesuré le 30/08 : 0,45 s,
       18 Ko). Sans les branches, on saurait dessiner l'anneau mais pas
       compter les sorties. */
    + `way(around:40,${points})[junction=roundabout]->.anneaux;`
    + ');out geom tags;'
    + 'node(w.anneaux)->.bords;way(bn.bords)[highway];out geom tags;';
}

/**
 * Trie une réponse d'Overpass en ses trois relevés — PURE.
 *
 * CHAQUE LECTEUR PREND CE QU'IL RECONNAÎT et ignore le reste : les limites
 * ne voient que les chemins portant `maxspeed`, les sorties que les nœuds de
 * divergence, les destinations que les bretelles qui en annoncent. Rien ne
 * se dispute, rien ne se perd.
 */
export function versCorridor(brut: unknown, trace: readonly [number, number][]): Corridor {
  const elements = (brut as { elements?: unknown })?.elements;
  const liste = Array.isArray(elements) ? elements : [];
  return {
    limites: versLimites(brut, trace as [number, number][]),
    sorties: versSorties(liste, trace),
    destinations: versDestinations(liste, trace),
    giratoires: versGiratoires(liste, trace),
  };
}

/** Vide — ce que rend un corridor dont on n'a rien pu relever. */
export const CORRIDOR_VIDE: Corridor = {
  limites: [], sorties: [], destinations: [], giratoires: [],
};

/**
 * Relève le corridor — UN appel POST, au démarrage du suivi.
 *
 * L'ÉCHEC EST BÉNIN et il est global : sans corridor, ni panneau de limite,
 * ni numéro de sortie, ni destination — et le suivi vaut toujours. C'était
 * déjà le contrat des limites seules.
 */
export async function chargerCorridor(
  geometrie: LineString, signal?: AbortSignal,
): Promise<Corridor> {
  const trace = geometrie.coordinates as [number, number][];
  if (trace.length < 2) return CORRIDOR_VIDE;
  const horloge = new AbortController();
  const minuteur = setTimeout(() => { horloge.abort(); }, 45_000);
  const relais = (): void => { horloge.abort(); };
  signal?.addEventListener('abort', relais);
  try {
    /* EN POST : la polyligne serrée dépasse ce qu'une URL accepte. */
    const r = await fetch('https://overpass.openstreetmap.fr/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(requeteCorridor(trace))}`,
      signal: horloge.signal,
    });
    if (!r.ok) throw new ErreurLimites('Le relevé du corridor est indisponible.');
    const texte = await r.text();
    try {
      return versCorridor(JSON.parse(texte), trace);
    } catch {
      /* Overpass rend du HTML quand il est saturé : une erreur claire vaut
         mieux qu'une exception de parseur remontée telle quelle. */
      throw new ErreurLimites('Le service OpenStreetMap est saturé.');
    }
  } catch (e) {
    if (e instanceof ErreurLimites) throw e;
    throw new ErreurLimites('Le relevé du corridor est indisponible.', { cause: e });
  } finally {
    clearTimeout(minuteur);
    signal?.removeEventListener('abort', relais);
  }
}
