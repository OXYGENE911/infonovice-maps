// L'ANNUAIRE DE L'ADMINISTRATION — mairies, préfectures, centres publics
// (RECHERCHE-7, le chantier qu'Armelin a dit « le plus important » le 03/09 :
// « si un utilisateur teste l'application et que ses 3 premières adresses ne
// fonctionnent pas, c'est un utilisateur qui quitte sans jamais revenir »).
//
// LA SOURCE : api-lannuaire.service-public.fr — Licence Ouverte, SANS CLÉ,
// CORS ouvert. MESURÉ le 04/09 avant d'écrire une ligne :
//   · search(nom, "mairie plessis trevise") → la mairie du Plessis-Trévise,
//     insensible aux accents et à l'ordre des mots ;
//   · search(nom, "INRAE Beaucouze") → RIEN : le centre s'appelle « Centre de
//     recherche INRAE - Pays de la Loire - Angers », Beaucouzé est sa COMMUNE ;
//   · search(nom, "INRAE") AND search(adresse, "beaucouze") → le centre. C'est
//     la requête n° 6 du banc d'Armelin, et c'est pourquoi le connecteur prend
//     la commune reconnue À PART du nom.
//
// LE JEU N'A PAS DE CHAMP GÉOGRAPHIQUE interrogeable : pas de distance() comme
// à l'Éducation nationale. Les coordonnées vivent DANS `adresse` — une chaîne
// JSON dont longitude/latitude sont des chaînes. On borne donc par la commune
// quand on la connaît, et par le plafond sinon ; le tri par distance revient
// au classement commun (fusionner), qui le fait déjà pour toutes les sources.

/** Ce qu'on retient d'un organisme — le reste de la fiche ne sert pas ici. */
export interface Administration {
  nom: string;
  commune: string;
  codePostal: string;
  lon: number;
  lat: number;
}

/** Une liste plus longue ne se lit pas dans une barre de recherche. */
export const PLAFOND_ADMINISTRATIONS = 8;

const BASE = 'https://api-lannuaire.service-public.fr/api/explore/v2.1'
  + '/catalog/datasets/api-lannuaire-administration/records';

/**
 * L'URL de recherche d'un organisme par nom, borné à une commune s'il y en a
 * une — PURE.
 */
export function urlAdministrations(
  nom: string, commune: string | null = null,
): string | null {
  const q = nom.trim().replace(/\s+/g, ' ');
  if (q.length < 3) return null;
  // Le guillemet se double : c'est l'échappement que la syntaxe ODSQL attend.
  const sur = q.replace(/"/g, '""');
  const ou = (commune ?? '').trim().replace(/\s+/g, ' ').replace(/"/g, '""');
  const where = ou === ''
    ? `search(nom, "${sur}")`
    : `search(nom, "${sur}") AND search(adresse, "${ou}")`;
  const params = new URLSearchParams({
    where,
    limit: String(PLAFOND_ADMINISTRATIONS),
    select: 'nom,adresse',
  });
  return `${BASE}?${params.toString()}`;
}

/**
 * Décode la réponse — PURE, défensive.
 *
 * `adresse` est une CHAÎNE JSON (liste d'adresses typées) dont les
 * coordonnées sont des chaînes. `Number('')` vaut zéro et `Number(null)`
 * aussi : le vide se rejette AVANT la conversion (la leçon de l'île Nulle,
 * RECHERCHE-9), et (0, 0) se rejette après.
 */
export function versAdministrations(brut: unknown): Administration[] {
  const res = (brut as { results?: unknown[] } | null)?.results;
  if (!Array.isArray(res)) return [];
  const nombreDe = (v: unknown): number | null => {
    if (v === null || v === undefined || v === '') return null;
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const sortie: Administration[] = [];
  for (const r of res) {
    const o = r as Record<string, unknown>;
    const nom = typeof o['nom'] === 'string' ? o['nom'].trim() : '';
    if (nom === '') continue;
    let adresses: unknown;
    try {
      adresses = typeof o['adresse'] === 'string' ? JSON.parse(o['adresse']) : o['adresse'];
    } catch { continue; }
    if (!Array.isArray(adresses)) continue;
    for (const a of adresses) {
      const ad = a as Record<string, unknown>;
      const lon = nombreDe(ad['longitude']);
      const lat = nombreDe(ad['latitude']);
      if (lon === null || lat === null) continue;
      if (lon === 0 && lat === 0) continue; // l'île Nulle n'est pas une adresse
      sortie.push({
        nom,
        commune: typeof ad['nom_commune'] === 'string' ? ad['nom_commune'] : '',
        codePostal: typeof ad['code_postal'] === 'string' ? ad['code_postal'] : '',
        lon, lat,
      });
      break; // la première adresse localisée suffit : une fiche, une ligne
    }
  }
  return sortie;
}

export class ErreurAdministration extends Error {}

/** Cherche un organisme public par nom (et commune s'il y en a une). */
export async function chercherAdministrations(
  nom: string, commune: string | null = null, signal?: AbortSignal,
): Promise<Administration[]> {
  const url = urlAdministrations(nom, commune);
  if (url === null) return [];
  try {
    const r = await fetch(url, { signal: signal ?? AbortSignal.timeout(8000) });
    if (!r.ok) throw new ErreurAdministration('L’annuaire de l’administration est indisponible.');
    return versAdministrations(await r.json());
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    if (e instanceof ErreurAdministration) throw e;
    throw new ErreurAdministration('L’annuaire de l’administration est indisponible.');
  }
}
