// Recherche d'un lieu PAR SON NOM, dans la vue courante (RECHERCHE-2, 01/09).
//
// LE TERRAIN. Armelin : « je voudrais pouvoir chercher un POI, une école ou
// une entreprise par son nom ». La Base Adresse Nationale ne connaît que des
// ADRESSES : chercher « Lycée Champlain » n'y rend rien, et la barre restait
// muette. OpenStreetMap, lui, porte les noms — et nous l'interrogeons déjà
// pour les familles de lieux.
//
// LA FRUGALITÉ N'EST PAS NÉGOCIABLE, et elle décide de la forme de ce module :
//
//  - CE N'EST PAS UNE RECHERCHE NATIONALE. L'emprise est celle de la VUE, et
//    sous le zoom 13 on REFUSE de chercher en le disant. Une expression
//    régulière sur le nom, à l'échelle du pays, ferait payer à un service
//    bénévole le prix d'une base d'entreprises qu'il n'est pas.
//  - ELLE NE PART QU'EN DERNIER RECOURS : seulement quand la BAN n'a rien
//    rendu, derrière le débounce de 300 ms de la barre. Une frappe ne
//    déclenche pas un appel.
//
// CE QUI N'EST PAS FAIT, ET POURQUOI. La consolidation des bases publiques
// (BNCO/Sirene, ministère de la Culture, Éducation nationale, DATAtourisme)
// est un chantier à part entière : quatre formats, quatre quotas, quatre
// politiques de mise à jour. Et les logos par Wikidata/Wikimedia sortiraient
// des sources françaises : la règle 3 du projet demande pour cela une
// décision explicite d'Armelin ET une mention publique sur « À propos ».
// Cette PR ne la prend pas à sa place.

import { versLieux, ErreurCategories, type EmpriseVue, type LieuCategorie } from './categories';

/* SOUS LE ZOOM 13, ON NE CHERCHE PAS PAR NOM — le même seuil que les
   familles, pour la même raison : l'emprise d'une région ferait de chaque
   frappe une requête à l'échelle d'un département. */
export const ZOOM_MIN_NOM = 13;

/** En deçà, la BAN suffit et Overpass n'a pas à être dérangé. */
export const LONGUEUR_MIN_NOM = 3;

/** Au-delà, on tronque : une vue dense rendrait une liste illisible. */
export const PLAFOND_NOMS = 20;

/**
 * Échappe un nom saisi avant de l'écrire dans une requête Overpass — PURE.
 *
 * DEUX DANGERS, PAS UN. Le texte part dans une chaîne entre guillemets ET
 * dans une expression régulière : un guillemet fermerait la chaîne, et une
 * parenthèse — « Carrefour (Paris) » — ferait une regex invalide que le
 * service rejetterait. L'ordre compte : la contre-oblique d'abord, sinon on
 * échapperait les échappements qu'on vient de poser.
 */
export function echapperNom(texte: string): string {
  return texte
    .replace(/\\/g, '\\\\')
    .replace(/[.*+?()[\]{}|^$]/g, (c) => `\\${c}`)
    .replace(/"/g, '\\"');
}

/**
 * L'URL Overpass d'une recherche par nom dans une emprise — PURE.
 *
 * `~` et non `=` : on cherche « Champlain » dans « Lycée Champlain ».
 * `,i` : la casse d'une saisie ne doit pas décider d'un résultat.
 */
export function urlNomLieu(nom: string, vue: EmpriseVue): string {
  const emprise = [vue.sud, vue.ouest, vue.nord, vue.est]
    .map((v) => v.toFixed(5)).join(',');
  const motif = echapperNom(nom.trim());
  const requete = '[out:json][timeout:25];'
    + `nwr["name"~"${motif}",i](${emprise});`
    + `out center tags ${PLAFOND_NOMS};`;
  return `https://overpass.openstreetmap.fr/api/interpreter?data=${encodeURIComponent(requete)}`;
}

/**
 * Cherche un lieu par son nom dans la vue. UN appel, borné à quinze secondes.
 *
 * Même défense que les familles : Overpass tombe régulièrement et rend alors
 * une page HTML, qu'on traduit en français plutôt qu'en exception illisible.
 */
export async function chercherParNom(
  nom: string, vue: EmpriseVue, signal?: AbortSignal,
): Promise<LieuCategorie[]> {
  const horloge = new AbortController();
  const minuteur = setTimeout(() => { horloge.abort(); }, 15_000);
  const relais = (): void => { horloge.abort(); };
  signal?.addEventListener('abort', relais);
  try {
    const r = await fetch(urlNomLieu(nom, vue), { signal: horloge.signal });
    if (!r.ok) throw new ErreurCategories('La recherche de lieux est indisponible pour le moment.');
    const texte = await r.text();
    try {
      return versLieux(JSON.parse(texte));
    } catch {
      throw new ErreurCategories('Le service des lieux est saturé. Réessayez dans un instant.');
    }
  } catch (e) {
    if (e instanceof ErreurCategories) throw e;
    if (signal?.aborted) throw e;
    throw new ErreurCategories('La recherche de lieux est indisponible pour le moment.');
  } finally {
    clearTimeout(minuteur);
    signal?.removeEventListener('abort', relais);
  }
}
