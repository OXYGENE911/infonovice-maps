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
 * Retire de la saisie la commune que la BAN vient d'y reconnaître — PURE.
 *
 * LE TERRAIN (RECHERCHE-6, 03/09). Un usager tape « INRAE beaucouzé » et ne
 * trouve rien. OpenStreetMap connaît pourtant TROIS objets nommés « INRAE »
 * à Beaucouzé — mais nommés « INRAE », pas « INRAE beaucouzé ». L'égalité
 * exacte, qui est ce qui rend la recherche rapide, ne pouvait pas aboutir.
 *
 * OR LA COMMUNE EST UNE INDICATION DE LIEU, PAS UNE PARTIE DU NOM. C'est
 * même ainsi qu'on parle : on dit « le INRAE de Beaucouzé » pour dire « le
 * INRAE, à Beaucouzé ». La BAN, elle, a déjà reconnu Beaucouzé — elle la rend
 * en tête, comme commune. On s'en sert donc pour SITUER la recherche, et l'on
 * cherche le reste comme nom.
 *
 * ON NE RETIRE QUE CE QUI RESTE UN NOM. « Beaucouzé » seul ne doit pas
 * devenir une recherche vide : s'il ne reste rien, on rend la saisie telle
 * quelle et la BAN répond, comme avant.
 */
export function sansLaCommune(texte: string, commune: string): string {
  const nu = (s: string): string => s.normalize('NFD')
    .replace(/[̀-ͯ]/g, '').toLowerCase();
  const mots = texte.trim().split(/\s+/).filter((m) => m !== '');
  const cible = nu(commune).split(/\s+/).filter((m) => m.length >= 3);
  if (cible.length === 0) return texte.trim();
  const gardes = mots.filter((m) => !cible.includes(nu(m)));
  /* IL FAUT QU'IL RESTE QUELQUE CHOSE À CHERCHER, et que ce ne soit pas un
     mot de liaison : « de » ou « la » ne nomment aucun lieu. */
  const utiles = gardes.filter((m) => nu(m).length >= 3);
  if (utiles.length === 0) return texte.trim();
  return gardes.join(' ').trim();
}

/* LES TROIS CLÉS OÙ VIT UN NOM D'ENSEIGNE (RECHERCHE-6, 03/09).
 *
 * LE TERRAIN. Un usager d'Armelin tape « Carrefour » et ne trouve rien ; il
 * tape « Leroy Merlin », rien non plus. « Aucun commerce n'est disponible […]
 * en l'état, l'application est difficilement utilisable. »
 *
 * LA CAUSE, MESURÉE LE 03/09. On ne cherchait que dans `name`, et les
 * enseignes ne s'y appellent pas comme on les nomme : autour d'Angers,
 * OpenStreetMap connaît « Carrefour City », « Carrefour Market », « Carrefour
 * Contact », « Carrefour Angers Saint Serge » — et TROIS objets seulement
 * nommés exactement « Carrefour ». Chercher l'égalité sur `name` ne pouvait
 * donc pas rendre l'hypermarché qu'on visait.
 *
 * CE QUI LE REND, ET POUR LE MÊME PRIX : la clé `brand`. OpenStreetMap y
 * inscrit la MARQUE, identique quelle que soit l'enseigne locale. Mesuré au
 * même endroit : `["brand"="Carrefour"]` rend 7 objets en 1,4 s, et l'union
 * des trois clés en rend ONZE en 1,6 s — Carrefour City, Market, Express,
 * Contact et l'hypermarché Saint-Serge compris.
 *
 * `operator` COMPLÈTE : les services publics et les réseaux s'y déclarent là
 * où ils n'ont pas de « marque » commerciale.
 *
 * ET TOUT RESTE INDEXÉ. C'est l'essentiel : la leçon de RECHERCHE-3 tient
 * toujours, et elle a été re-mesurée le 03/09 sur le service réel — une
 * expression régulière sur `name` dans un rayon de 25 km met **29 à 61
 * secondes** et rend zéro (elle expire en silence), là où l'égalité répond en
 * une à six secondes. On ajoute donc des CLÉS, jamais de la souplesse. */
const CLES_NOM: readonly string[] = ['name', 'brand', 'operator'];

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
    .flatMap((g) => CLES_NOM.map(
      (cle) => `nwr["${cle}"="${echapperNom(g)}"](${autour});`,
    ))
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
