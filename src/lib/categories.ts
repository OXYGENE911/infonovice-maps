/* RECHERCHE PAR CATÉGORIES — pharmacies, restaurants… dans la VUE COURANTE
 * (mandat UX du 28/08, PR POI-1).
 *
 * FRUGALITÉ STRICTE, et elle se lit dans la forme même de ce module : la
 * recherche part À LA DEMANDE (un clic, un appel), jamais au déplacement de
 * la carte ; l'emprise est celle de la vue, sous un plafond de résultats ;
 * et Overpass — un service bénévole — n'est interrogé qu'au-dessus du zoom
 * où l'emprise reste raisonnable (le seuil vit dans le panneau, avec les
 * autres). Même miroir français que les commodités, même défense contre les
 * réponses HTML d'un service saturé.
 */

export interface LieuCategorie {
  /** Marque, exploitant ou nom — le premier qui existe ; null sinon. */
  nom: string | null;
  lon: number;
  lat: number;
}

/** L'emprise de la vue : ouest, sud, est, nord (l'ordre de MapLibre). */
export interface EmpriseVue { ouest: number; sud: number; est: number; nord: number }

export interface Categorie {
  cle: string;
  /** Le libellé du bouton — pluriel : on cherche « les pharmacies ». */
  libelle: string;
  /** Le filtre Overpass, clé et valeurs OSM standard. */
  filtre: string;
}

/* CINQ CATÉGORIES, PAS QUINZE. Celles qu'on cherche VRAIMENT en route ou en
   ville inconnue — la demande du mandat cite pharmacies, parkings (déjà une
   couche à part entière) et restaurants. Chaque filtre reste sur les valeurs
   OSM les mieux renseignées : promettre « coiffeurs » sur un tag rare ferait
   une carte vide qu'on prendrait pour une panne. */
export const CATEGORIES: readonly Categorie[] = [
  { cle: 'pharmacie', libelle: 'Pharmacies', filtre: '["amenity"="pharmacy"]' },
  { cle: 'restaurant', libelle: 'Restaurants', filtre: '["amenity"~"^(restaurant|fast_food)$"]' },
  { cle: 'boulangerie', libelle: 'Boulangeries', filtre: '["shop"="bakery"]' },
  { cle: 'supermarche', libelle: 'Supermarchés', filtre: '["shop"~"^(supermarket|convenience)$"]' },
  { cle: 'wc', libelle: 'Toilettes', filtre: '["amenity"="toilets"]' },
];

/** Au-delà, on tronque et on le DIT : une vue dense en centre-ville déborde vite. */
export const PLAFOND_LIEUX = 100;

/** L'URL Overpass d'une catégorie dans une emprise. Pure, donc testable à sec. */
export function urlCategorie(categorie: Categorie, vue: EmpriseVue): string {
  /* Overpass ordonne son emprise (sud, ouest, nord, est) — l'inverse partiel
     de MapLibre. L'inversion silencieuse des deux rendrait des lieux de
     l'autre hémisphère : le test à sec verrouille l'ordre. */
  const emprise = [vue.sud, vue.ouest, vue.nord, vue.est]
    .map((v) => v.toFixed(5)).join(',');
  const requete = '[out:json][timeout:25];'
    + `nwr${categorie.filtre}(${emprise});`
    + `out center tags ${PLAFOND_LIEUX};`;
  return `https://overpass.openstreetmap.fr/api/interpreter?data=${encodeURIComponent(requete)}`;
}

/** Décode une réponse Overpass. Défensif : la réponse vient du dehors. */
export function versLieux(brut: unknown): LieuCategorie[] {
  const elements = (brut as { elements?: unknown })?.elements;
  if (!Array.isArray(elements)) return [];

  const rendu: LieuCategorie[] = [];
  for (const e of elements) {
    if (typeof e !== 'object' || e === null) continue;
    const el = e as Record<string, unknown>;
    const tags = (el['tags'] ?? {}) as Record<string, unknown>;
    /* Un chemin porte sa position dans `center`, un nœud dans `lat`/`lon` —
       ignorer les chemins écarterait presque tous les supermarchés, qui sont
       des bâtiments. */
    const centre = (el['center'] ?? {}) as Record<string, unknown>;
    const lat = typeof el['lat'] === 'number' ? el['lat']
      : (typeof centre['lat'] === 'number' ? centre['lat'] : null);
    const lon = typeof el['lon'] === 'number' ? el['lon']
      : (typeof centre['lon'] === 'number' ? centre['lon'] : null);
    if (lat === null || lon === null) continue;

    // La marque est ce qu'on voit de la rue, l'exploitant ce qui facture, le
    // nom ce qui reste — même ordre que les commodités.
    const identite = ['brand', 'operator', 'name']
      .map((k) => tags[k])
      .find((v): v is string => typeof v === 'string' && v.trim() !== '');
    rendu.push({ nom: identite?.trim() ?? null, lon, lat });
  }
  return rendu;
}

export class ErreurCategories extends Error {}

/**
 * Cherche une catégorie dans la vue. UN appel, borné à quinze secondes.
 *
 * Overpass tombe régulièrement — service bénévole, charge mondiale — et rend
 * alors une page HTML : la lire en JSON lèverait une exception illisible, on
 * la traduit en français ici.
 */
export async function chercherCategorie(
  categorie: Categorie, vue: EmpriseVue, signal?: AbortSignal,
): Promise<LieuCategorie[]> {
  const horloge = new AbortController();
  const minuteur = setTimeout(() => { horloge.abort(); }, 15_000);
  const relais = (): void => { horloge.abort(); };
  signal?.addEventListener('abort', relais);
  try {
    const r = await fetch(urlCategorie(categorie, vue), { signal: horloge.signal });
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
