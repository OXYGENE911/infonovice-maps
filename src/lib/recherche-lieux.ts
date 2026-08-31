// Recherche d'un lieu PAR SON NOM (RECHERCHE-2, refondue par RECHERCHE-3).
//
// LE TERRAIN. Armelin : « je voudrais pouvoir chercher un POI, une école ou
// une entreprise par son nom ». La Base Adresse Nationale ne connaît que des
// ADRESSES : chercher « Tour Eiffel Paris » y rend l'avenue Gustave Eiffel,
// « Castorama » n'y rend RIEN. OpenStreetMap, lui, porte les noms.
//
// ═══ CE QUE LA PREMIÈRE VERSION AVAIT MANQUÉ, ET QUE LA MESURE A DIT ═══
//
// RECHERCHE-2 partait sur une expression régulière `["name"~"…",i]` bornée à
// la vue. Deux défauts, tous deux mesurés sur le service réel le 31/08/2026 :
//
//  1. ELLE NE PARTAIT JAMAIS. Elle n'était tentée que si la BAN n'avait RIEN
//     rendu — or la BAN rend presque toujours quelque chose : une rue floue,
//     un lieu-dit. « Collège Albert Camus Plessis-Trévise » y rend
//     « avenue albert camus » (0,636), « Tour Eiffel Paris » rend « Avenue
//     Gustave Eiffel » (0,378). La porte ne s'ouvrait donc pas.
//
//  2. ELLE AURAIT EXPIRÉ. Une regex sur `name` SANS clé indexée force un
//     balayage : mesuré, « Tour Eiffel » dans 5 km rend une réponse VIDE
//     accompagnée de `remark: "Query timed out … after 57 seconds"`. Bornée
//     par clés (`amenity`, `shop`, `tourism`, `leisure`, `office`), elle
//     expire encore à 10 km (36 à 71 s selon le mot). Un préfixe ancré
//     (`~"^Castorama"`) expire aussi, à 41 s.
//
// ═══ CE QUI MARCHE, MESURÉ ═══
//
// L'ÉGALITÉ EXACTE EST INDEXÉE. `["name"="Castorama"](around:25000,…)` rend
// 12 résultats en 5 s ; `["name"="Tour Eiffel"](around:5000,…)` en rend 15 en
// 1 s. Une UNION de trois graphies exactes (saisie, Capitales, MAJUSCULES)
// rend les mêmes 12 en 3 s — elle absorbe la casse sans quitter l'index,
// puisque `["name"="x",i]` n'est pas une syntaxe qu'Overpass accepte.
//
// LE PRIX À PAYER, ET IL EST DIT À L'USAGER : on cherche le nom TEL QU'IL
// EST ÉCRIT dans OpenStreetMap. « Castorama » trouve, « Casto » ne trouve
// pas. Mieux vaut une recherche qui aboutit sur un nom complet qu'une
// recherche par morceaux qui expire toujours.
//
// CE QUI N'EST PAS FAIT ICI : les bases publiques françaises (Éducation
// nationale pour les écoles, entreprises, Culture, DATAtourisme) sont un
// chantier à part — et c'est là que vit le « Collège Albert Camus » que
// cherchait Armelin, qu'OpenStreetMap ne connaît pas (mesuré : 60 écoles
// autour de chez lui, aucune de ce nom).

import { versLieux, ErreurCategories, type LieuCategorie } from './categories';

/** En deçà, la BAN suffit et Overpass n'a pas à être dérangé. */
export const LONGUEUR_MIN_NOM = 3;

/** Au-delà, on tronque : une liste plus longue ne se lit plus. */
export const PLAFOND_NOMS = 20;

/* VINGT-CINQ KILOMÈTRES AUTOUR DU POINT LE PLUS PROBABLE. Mesuré à ce rayon
   sans expiration ; c'est aussi la distance à laquelle on va faire ses
   courses. Au-delà, on ne cherche plus un lieu, on cherche une enseigne. */
export const RAYON_NOM_M = 25_000;

/**
 * Les graphies exactes à tenter — PURE.
 *
 * Overpass n'indexe que l'égalité, et `["name"="x",i]` n'existe pas : on
 * envoie donc la saisie, sa version Capitalisée et sa version MAJUSCULE.
 * Trois clauses restent indexées (mesuré : 3 s pour douze résultats).
 */
export function graphiesDe(nom: string): string[] {
  const brut = nom.trim().replace(/\s+/g, ' ');
  if (brut === '') return [];
  const capitales = brut.toLowerCase().replace(
    /(^|[\s'’\-])(\p{L})/gu, (_, avant: string, lettre: string) => avant + lettre.toUpperCase(),
  );
  return [...new Set([brut, capitales, brut.toUpperCase()])];
}

/**
 * Échappe une graphie avant de l'écrire dans une chaîne Overpass — PURE.
 *
 * L'égalité exacte n'est pas une expression régulière : seuls le guillemet
 * et la contre-oblique sont dangereux, et la contre-oblique passe d'abord,
 * sinon on échapperait l'échappement qu'on vient de poser.
 */
export function echapperNom(texte: string): string {
  return texte.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/** Le centre d'une recherche : le point le plus probable, pas la vue. */
export interface CentreRecherche { lon: number; lat: number }

/**
 * L'URL Overpass d'une recherche par nom autour d'un point — PURE.
 *
 * Rend `null` quand il n'y a rien à chercher : l'appelant ne part pas.
 */
export function urlNomLieu(nom: string, centre: CentreRecherche): string | null {
  const graphies = graphiesDe(nom);
  if (graphies.length === 0) return null;
  const autour = `around:${RAYON_NOM_M},${centre.lat.toFixed(5)},${centre.lon.toFixed(5)}`;
  const clauses = graphies
    .map((g) => `nwr["name"="${echapperNom(g)}"](${autour});`)
    .join('');
  const requete = `[out:json][timeout:25];(${clauses});out center tags ${PLAFOND_NOMS};`;
  return `https://overpass.openstreetmap.fr/api/interpreter?data=${encodeURIComponent(requete)}`;
}

/**
 * Une réponse VIDE accompagnée d'un `remark` n'est pas « aucun résultat ».
 *
 * C'est la signature d'une requête expirée côté serveur, et la lire comme un
 * zéro ferait dire à l'application « ce lieu n'existe pas » quand elle veut
 * dire « je n'ai pas eu le temps de regarder ». Le même piège que les feux
 * et les péages (lib/corridor.ts) — payé deux fois, écrit deux fois.
 */
export function aRenonce(brut: unknown): boolean {
  const o = brut as { elements?: unknown[]; remark?: unknown } | null;
  if (!o || typeof o !== 'object') return false;
  const vide = !Array.isArray(o.elements) || o.elements.length === 0;
  return vide && typeof o.remark === 'string' && o.remark.trim() !== '';
}

/**
 * Cherche un lieu par son nom autour d'un point. UN appel, borné.
 *
 * Même défense que les familles : Overpass tombe régulièrement et rend alors
 * une page HTML, qu'on traduit en français plutôt qu'en exception illisible.
 */
export async function chercherParNom(
  nom: string, centre: CentreRecherche, signal?: AbortSignal,
): Promise<LieuCategorie[]> {
  const url = urlNomLieu(nom, centre);
  if (url === null) return [];
  const horloge = new AbortController();
  const minuteur = setTimeout(() => { horloge.abort(); }, 30_000);
  const relais = (): void => { horloge.abort(); };
  signal?.addEventListener('abort', relais);
  try {
    const r = await fetch(url, { signal: horloge.signal });
    if (!r.ok) throw new ErreurCategories('La recherche de lieux est indisponible pour le moment.');
    const texte = await r.text();
    let brut: unknown;
    try {
      brut = JSON.parse(texte);
    } catch {
      throw new ErreurCategories('Le service des lieux est saturé. Réessayez dans un instant.');
    }
    if (aRenonce(brut)) {
      throw new ErreurCategories(
        'Le service des lieux n’a pas eu le temps de répondre. Réessayez dans un instant.',
      );
    }
    return versLieux(brut);
  } catch (e) {
    if (e instanceof ErreurCategories) throw e;
    if (signal?.aborted) throw e;
    throw new ErreurCategories('La recherche de lieux est indisponible pour le moment.');
  } finally {
    clearTimeout(minuteur);
    signal?.removeEventListener('abort', relais);
  }
}
