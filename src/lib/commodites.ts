/* COMMODITÉS D'UNE AIRE — ce qu'on trouve là où l'on s'arrête recharger.
 *
 * CE QUE LA MESURE DU 25/08/2026 A MONTRÉ, et qui décide de tout ce module :
 * sur les 698 aires de service françaises d'OpenStreetMap, UNE SEULE porte
 * une balise `brand`, et 13 % un `operator`. L'enseigne n'est donc pas sur
 * l'aire — elle est sur les objets qui la peuplent. Relevé sur le corridor
 * Beaune-Chalon : 9 aires sur 9 ont au moins une commodité à 400 m, 43
 * commodités rattachées (17 stations-service, 11 WC, 7 restauration rapide,
 * 6 restaurants, 2 cafés), dont 74 % portent une identité.
 *
 * On interroge donc AUTOUR du point d'arrêt, pas l'aire elle-même.
 *
 * OVERPASS EST UN SERVICE BÉNÉVOLE. Sa politique d'usage n'est pas une
 * formalité : la requête est étroite (cinq types nommés, jamais `["amenity"]`
 * en entier), bornée en temps, et n'est émise QU'À LA DEMANDE — un clic de
 * l'usager sur un arrêt, jamais au fil de la carte.
 */

export type CleCommodite = 'carburant' | 'restauration' | 'cafe' | 'wc';

export const TYPES_COMMODITE: readonly { cle: CleCommodite; libelle: string }[] = [
  { cle: 'carburant', libelle: 'Station-service' },
  { cle: 'restauration', libelle: 'Restauration' },
  { cle: 'cafe', libelle: 'Café' },
  { cle: 'wc', libelle: 'Toilettes' },
] as const;

export interface Commodite {
  type: CleCommodite;
  /** Marque, à défaut exploitant, à défaut nom. `null` quand rien n'est déclaré. */
  nom: string | null;
  lon: number;
  lat: number;
}

/** Les valeurs OSM que l'on demande, et ce qu'elles deviennent chez nous. */
const CORRESPONDANCE: Record<string, CleCommodite> = {
  fuel: 'carburant',
  restaurant: 'restauration',
  fast_food: 'restauration',
  cafe: 'cafe',
  toilets: 'wc',
};

const RAYON_MIN = 100;
const RAYON_MAX = 2000;

const borner = (v: number, min: number, max: number): number =>
  (Number.isFinite(v) ? Math.min(Math.max(v, min), max) : min);

/** L'URL Overpass pour les commodités autour d'un point. */
export function urlCommodites(lon: number, lat: number, rayonM = 400): string {
  const rayon = Math.round(borner(rayonM, RAYON_MIN, RAYON_MAX));
  const types = Object.keys(CORRESPONDANCE).join('|');
  /* `nwr` couvre nœuds, chemins et relations en une passe ; `out center tags`
     rend la position d'un chemin sans sa géométrie complète — on veut savoir
     OÙ, pas dessiner le bâtiment. */
  const requete = '[out:json][timeout:25];'
    + `nwr["amenity"~"^(${types})$"](around:${rayon},${lat},${lon});`
    + 'out center tags;';
  /* LE MIROIR FRANÇAIS, opéré par OpenStreetMap France. L'instance de
     référence est allemande ; celle-ci répond aussi bien (HTTP 200, CORS *,
     JSON — vérifié le 26/08/2026) et reste cohérente avec la contrainte de
     souveraineté du projet. Overpass figure nommément dans la liste des API
     autorisées de CLAUDE.md : aucune dérogation n'est requise. */
  return `https://overpass.openstreetmap.fr/api/interpreter?data=${encodeURIComponent(requete)}`;
}

/** Décode une réponse Overpass. Défensif : la réponse vient du dehors. */
export function versCommodites(brut: unknown): Commodite[] {
  const elements = (brut as { elements?: unknown })?.elements;
  if (!Array.isArray(elements)) return [];

  const rendu: Commodite[] = [];
  for (const e of elements) {
    if (typeof e !== 'object' || e === null) continue;
    const el = e as Record<string, unknown>;
    const tags = (el['tags'] ?? {}) as Record<string, unknown>;
    const amenity = typeof tags['amenity'] === 'string' ? tags['amenity'] : '';
    const type = CORRESPONDANCE[amenity];
    if (!type) continue;

    /* UN CHEMIN PORTE SA POSITION DANS `center`, un nœud dans `lat`/`lon`.
       Ignorer les chemins écarterait les restaurants, qui sont presque tous
       cartographiés comme des bâtiments. */
    const centre = (el['center'] ?? {}) as Record<string, unknown>;
    const lat = typeof el['lat'] === 'number' ? el['lat']
      : (typeof centre['lat'] === 'number' ? centre['lat'] : null);
    const lon = typeof el['lon'] === 'number' ? el['lon']
      : (typeof centre['lon'] === 'number' ? centre['lon'] : null);
    // Sans position, l'objet serait posé à l'équateur : on l'écarte.
    if (lat === null || lon === null) continue;

    /* L'IDENTITÉ, DANS L'ORDRE : la marque est ce qu'on voit depuis la route,
       l'exploitant ce qui figure sur la facture, le nom ce qui reste. Un quart
       des commodités n'en portent aucune — l'interface dira le type. */
    const identite = ['brand', 'operator', 'name']
      .map((k) => tags[k])
      .find((v): v is string => typeof v === 'string' && v.trim() !== '');

    rendu.push({ type, nom: identite?.trim() ?? null, lon, lat });
  }
  return rendu;
}

export class ErreurCommodites extends Error {}

/**
 * Charge les commodités autour d'un point.
 *
 * OVERPASS TOMBE RÉGULIÈREMENT, et pas par accident : c'est un service
 * bénévole soumis à une charge mondiale. Un `Dispatcher_Client::…::timeout`
 * a été reçu pendant le développement même de cette fonction. L'appel est
 * donc borné dans le temps, et son échec rend un message français plutôt
 * qu'une page d'erreur HTML interprétée comme du JSON.
 */
export async function chargerCommodites(
  lon: number, lat: number, rayonM = 400, signal?: AbortSignal,
): Promise<Commodite[]> {
  const horloge = new AbortController();
  const minuteur = setTimeout(() => { horloge.abort(); }, 15_000);
  const relais = (): void => { horloge.abort(); };
  signal?.addEventListener('abort', relais);
  try {
    const r = await fetch(urlCommodites(lon, lat, rayonM), { signal: horloge.signal });
    if (!r.ok) throw new ErreurCommodites('Les commodités ne sont pas disponibles pour le moment.');
    /* LA RÉPONSE N'EST PAS TOUJOURS DU JSON : en surcharge, Overpass rend une
       page HTML d'erreur. La lire en JSON lèverait une exception illisible ;
       on la traduit ici. */
    const texte = await r.text();
    try {
      return versCommodites(JSON.parse(texte));
    } catch {
      throw new ErreurCommodites('Le service des commodités est saturé. Réessayez dans un instant.');
    }
  } catch (e) {
    if (e instanceof ErreurCommodites) throw e;
    if (signal?.aborted) throw e;
    throw new ErreurCommodites('Les commodités ne sont pas disponibles pour le moment.');
  } finally {
    clearTimeout(minuteur);
    signal?.removeEventListener('abort', relais);
  }
}
