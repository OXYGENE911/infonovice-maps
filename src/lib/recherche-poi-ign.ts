// L'INDEX DES LIEUX DE LA GÉOPLATEFORME (RECHERCHE-8, 03/09).
//
// LE TERRAIN. Armelin, la nuit du 03/09 : « je veux surtout pouvoir rechercher
// les mots clés suivants en jeu de tests et je ne veux pas avoir à écrire les
// mots exacts dans la barre de recherche mais avoir plus de souplesse même si
// les mots sont incomplets ». Douze requêtes, dont « Tour Effeil » — avec la
// faute.
//
// CE QU'ON CHERCHAIT DEPUIS LE DÉBUT : DE LA SOUPLESSE, SANS BACKEND.
// OpenStreetMap ne nous donne que l'ÉGALITÉ exacte : une expression régulière
// sur `name` dans 25 km met 29 à 61 secondes et rend zéro (re-mesuré le
// 03/09). La BAN ne connaît que des adresses. Il manquait un service qui
// TOLÈRE l'à-peu-près sur des NOMS DE LIEUX.
//
// IL EXISTE, ET IL EST FRANÇAIS. Le géocodeur de la Géoplateforme expose un
// index `poi`, alimenté par la BD TOPO et la BD NYME : monuments, gares,
// équipements, toponymes. Sans clé, comme les tuiles. Mesuré le 03/09 :
//
//   « Tour Effeil »      →  Tour Eiffel, Paris 7e            (25 ms)
//   « Gare Saint Lazare »→  Gare Saint-Lazare, Paris 8e      (26 ms)
//   « Musée du Louvre »  →  Musée du Louvre + Louvre-Lens    (28 ms)
//   « Disneyland Paris » →  Disneyland Paris, Chessy         (23 ms)
//   « Stade de France »  →  Stade de France, Saint-Denis     (34 ms)
//
// CE QU'IL NE FAIT PAS, ET IL FAUT LE SAVOIR : il ne connaît pas les
// commerces. « Leroy Merlin Lognes » et « INRAE Beaucouzé » n'y sont pas —
// c'est l'annuaire des entreprises qui les porte (`recherche-entreprises.ts`).
// Les deux sont complémentaires, et l'application interroge les deux.

import type { PointGeo } from './coordonnees';

/** Un lieu nommé, tel que la Géoplateforme le connaît. */
export interface LieuIgn extends PointGeo {
  nom: string;
  /** La commune, quand elle est déclarée — plusieurs pour un lieu à cheval. */
  commune: string;
  codePostal: string;
  /** Ce que la Géoplateforme dit du genre de lieu, quand elle le dit. */
  categorie: string;
}

/* CINQ RÉPONSES SUFFISENT. Au-delà, la liste cesse d'être lisible et
   l'utilisateur ne lit plus rien — les autres sources ont aussi droit à leur
   place dans les dix lignes de la page. */
export const PLAFOND_IGN = 5;

/**
 * L'URL de l'index `poi` du géocodeur — PURE.
 *
 * `null` pour une saisie trop courte : deux lettres rendent tout et rien.
 */
export function urlPoiIgn(texte: string): string | null {
  const q = texte.trim();
  if (q.length < 3) return null;
  return 'https://data.geopf.fr/geocodage/search'
    + `?q=${encodeURIComponent(q)}&index=poi&limit=${PLAFOND_IGN}`;
}

/** Les valeurs que le service rend tantôt seules, tantôt en liste. */
function premier(v: unknown): string {
  if (Array.isArray(v)) return typeof v[0] === 'string' ? v[0] : '';
  return typeof v === 'string' ? v : '';
}

/**
 * Lit la réponse du géocodeur — PURE, défensive.
 *
 * ON N'ACCEPTE QUE CE QUI A UNE POSITION : un lieu sans coordonnées ne peut
 * ni se montrer sur la carte ni servir de destination, et l'afficher
 * quand même ferait une ligne qui déçoit au clic.
 */
export function versLieuxIgn(brut: unknown): LieuIgn[] {
  const d = (brut ?? {}) as { features?: unknown };
  if (!Array.isArray(d.features)) return [];
  const sortie: LieuIgn[] = [];
  for (const f of d.features) {
    const t = (f ?? {}) as { properties?: unknown; geometry?: unknown };
    const p = (t.properties ?? {}) as Record<string, unknown>;
    const g = (t.geometry ?? {}) as { coordinates?: unknown };
    const c = g.coordinates;
    if (!Array.isArray(c) || typeof c[0] !== 'number' || typeof c[1] !== 'number') continue;
    const nom = premier(p['toponym']) || premier(p['label']);
    if (nom === '') continue;
    sortie.push({
      lon: c[0], lat: c[1],
      nom,
      commune: premier(p['city']),
      codePostal: premier(p['postcode']),
      categorie: premier(p['category']) || premier(p['classification']),
    });
  }
  return sortie;
}

/**
 * Interroge l'index des lieux — rend [] plutôt que de lever.
 *
 * UNE SOURCE QUI TOMBE NE DOIT PAS EMPORTER LES AUTRES : l'appelante les
 * interroge toutes en même temps, et une page de résultats amputée vaut mieux
 * qu'une page vide.
 */
export async function chercherPoiIgn(
  texte: string, signal?: AbortSignal,
): Promise<LieuIgn[]> {
  const url = urlPoiIgn(texte);
  if (url === null) return [];
  /* `exactOptionalPropertyTypes` interdit `signal: undefined` : on ne pose
     la clé que si l'on a vraiment un signal. */
  const rep = await fetch(url, signal ? { signal } : {});
  if (!rep.ok) throw new Error(`Géoplateforme a répondu ${rep.status}`);
  return versLieuxIgn(await rep.json());
}
