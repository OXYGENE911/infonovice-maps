// L'annuaire de l'ÉDUCATION NATIONALE — écoles, collèges, lycées (ECOLES-1).
//
// LE TERRAIN. Armelin, le 01/09 : « le collège de ma fille ne donne rien en
// tapant "Collège Albert Camus Plessis-Trévise" ». MESURÉ le jour même :
// OpenStreetMap ne le connaît pas — soixante écoles autour de chez lui, aucune
// de ce nom. L'annuaire de l'Éducation nationale, lui, le porte :
// « Collège Albert Camus, Avenue Albert Camus, Le Plessis-Trévise ».
//
// C'est la première brique du chantier qu'Armelin a ouvert le 01/09 :
// « la consolidation des bases publiques […] 100 % gratuite et française ».
// Celle-ci l'est : data.education.gouv.fr, Licence Ouverte, SANS CLÉ.
//
// CE QU'ELLE FAIT MIEUX QU'OVERPASS, et c'est mesuré : elle accepte un nom
// PARTIEL. « Albert Camus » y trouve « Collège Albert Camus » ; Overpass, lui,
// n'indexe que l'égalité et exige le nom entier (voir recherche-lieux.ts). Les
// deux sources se complètent donc au lieu de se doubler.
//
// LA FRUGALITÉ RESTE LA RÈGLE : un appel, borné à vingt-cinq kilomètres autour
// du point le plus probable, trié par distance, plafonné. Le service est
// public mais il n'est pas gratuit pour celui qui le sert.

/** Ce qu'on retient d'un établissement — le reste de la fiche ne sert pas ici. */
export interface Etablissement {
  nom: string;
  /** « Collège », « Ecole élémentaire », « Lycée »… tel que l'annuaire l'écrit. */
  type: string;
  commune: string;
  lon: number;
  lat: number;
}

/** Au-delà, on ne cherche plus une école, on cherche un nom dans la France. */
export const RAYON_ECOLES_M = 25_000;

/** Une liste plus longue ne se lit pas dans une barre de recherche. */
export const PLAFOND_ECOLES = 8;

const BASE = 'https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets'
  + '/fr-en-annuaire-education/records';

/**
 * L'URL de recherche d'un établissement par nom, autour d'un point — PURE.
 *
 * `search()` accepte un nom partiel ; `distance()` borne l'appel ; `order_by`
 * met le plus proche en tête — sans lui, l'ordre de l'annuaire est le sien,
 * et le collège du bout du département passait devant celui d'à côté.
 */
export function urlEtablissements(
  nom: string, centre: { lon: number; lat: number },
): string | null {
  const q = nom.trim().replace(/\s+/g, ' ');
  if (q.length < 3) return null;
  /* LE GUILLEMET DOIT MOURIR : la valeur part dans une chaîne entre
     guillemets au sein de l'expression `where`. Le doubler est l'échappement
     que la syntaxe ODSQL attend. */
  const sur = q.replace(/"/g, '""');
  const point = `geom'POINT(${centre.lon.toFixed(5)} ${centre.lat.toFixed(5)})'`;
  const params = new URLSearchParams({
    where: `search(nom_etablissement, "${sur}") and distance(position, ${point}, ${RAYON_ECOLES_M}m)`,
    order_by: `distance(position, ${point})`,
    limit: String(PLAFOND_ECOLES),
    select: 'nom_etablissement,type_etablissement,nom_commune,latitude,longitude',
  });
  return `${BASE}?${params.toString()}`;
}

/**
 * Décode la réponse de l'annuaire — PURE, défensive.
 *
 * Une fiche sans position est ÉCARTÉE plutôt que posée à l'équateur : le
 * défaut a déjà été payé une fois sur les bornes (`Number(null)` vaut zéro).
 */
export function versEtablissements(brut: unknown): Etablissement[] {
  const res = (brut as { results?: unknown[] } | null)?.results;
  if (!Array.isArray(res)) return [];
  const sortie: Etablissement[] = [];
  for (const r of res) {
    const o = r as Record<string, unknown>;
    const nom = typeof o['nom_etablissement'] === 'string' ? o['nom_etablissement'].trim() : '';
    const lon = typeof o['longitude'] === 'number' ? o['longitude'] : Number.NaN;
    const lat = typeof o['latitude'] === 'number' ? o['latitude'] : Number.NaN;
    if (nom === '' || !Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    sortie.push({
      nom,
      type: typeof o['type_etablissement'] === 'string' ? o['type_etablissement'] : '',
      commune: typeof o['nom_commune'] === 'string' ? o['nom_commune'] : '',
      lon, lat,
    });
  }
  return sortie;
}

export class ErreurAnnuaire extends Error {}

/** Cherche un établissement par son nom autour d'un point. UN appel, borné. */
export async function chercherEtablissements(
  nom: string, centre: { lon: number; lat: number }, signal?: AbortSignal,
): Promise<Etablissement[]> {
  const url = urlEtablissements(nom, centre);
  if (url === null) return [];
  try {
    const r = await fetch(url, { signal: signal ?? AbortSignal.timeout(8000) });
    if (!r.ok) throw new ErreurAnnuaire('L’annuaire des établissements est indisponible.');
    return versEtablissements(await r.json());
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    if (e instanceof ErreurAnnuaire) throw e;
    throw new ErreurAnnuaire('L’annuaire des établissements est indisponible.');
  }
}
