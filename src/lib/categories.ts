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
  /** La famille à laquelle il appartient — voir `familleDe`. */
  famille?: string;
}

/** L'emprise de la vue : ouest, sud, est, nord (l'ordre de MapLibre). */
export interface EmpriseVue { ouest: number; sud: number; est: number; nord: number }

export interface Categorie {
  cle: string;
  /** Le libellé du bouton — pluriel : on cherche « les pharmacies ». */
  libelle: string;
  /** Le filtre Overpass, clé et valeurs OSM standard. */
  filtre: string;
  /** La couleur du point sur la carte — une famille, une teinte. */
  couleur: string;
}

/* DOUZE FAMILLES, PAS DIX-SEPT ÉTIQUETTES (POI-2, 30/08). Armelin a donné une
   liste : « restaurants, shoppings, supermarchés, vêtements, cafés, hôtels,
   bars, attractions, musées, cinémas, centres commerciaux, DAB, parkings,
   lavage auto, garages auto, pharmacie, pressing, etc. » — et ce « etc. » dit
   bien que la liste n'est pas close.
   DIX-SEPT CASES NE TIENNENT PAS SUR UN TÉLÉPHONE, et l'on ne cherche pas
   « cinémas » sans chercher « musées ». On regroupe donc par FAMILLE — ce
   qu'on cherche d'un même geste — en gardant CHAQUE étiquette de sa liste
   dans le filtre de sa famille. Rien n'est perdu ; tout tient en douze
   boutons.
   CHAQUE FILTRE RESTE SUR DES VALEURS BIEN RENSEIGNÉES : promettre une
   catégorie sur un tag rare ferait une carte vide qu'on prendrait pour une
   panne. */
export const CATEGORIES: readonly Categorie[] = [
  { cle: 'restaurant', libelle: 'Restaurants', couleur: '#D9534F',
    filtre: '["amenity"~"^(restaurant|fast_food)$"]' },
  { cle: 'cafe', libelle: 'Cafés et bars', couleur: '#8A5A2B',
    filtre: '["amenity"~"^(cafe|bar|pub)$"]' },
  { cle: 'commerce', libelle: 'Commerces', couleur: '#2272C4',
    filtre: '["shop"~"^(supermarket|convenience|bakery|mall|department_store|clothes|shoes)$"]' },
  { cle: 'hotel', libelle: 'Hôtels', couleur: '#6C4FA1',
    filtre: '["tourism"~"^(hotel|motel|guest_house)$"]' },
  { cle: 'culture', libelle: 'Culture et visites', couleur: '#B8860B',
    filtre: '["tourism"~"^(museum|attraction|viewpoint)$"]' },
  { cle: 'cinema', libelle: 'Cinémas et théâtres', couleur: '#C2185B',
    filtre: '["amenity"~"^(cinema|theatre)$"]' },
  { cle: 'pharmacie', libelle: 'Pharmacies', couleur: '#1E9E5A',
    filtre: '["amenity"="pharmacy"]' },
  { cle: 'argent', libelle: 'Banques et DAB', couleur: '#00796B',
    filtre: '["amenity"~"^(atm|bank|bureau_de_change)$"]' },
  { cle: 'parking', libelle: 'Parkings', couleur: '#455A64',
    filtre: '["amenity"="parking"]' },
  { cle: 'auto', libelle: 'Garages et lavage', couleur: '#5D4037',
    filtre: '["shop"~"^(car_repair|car_parts)$"]' },
  { cle: 'services', libelle: 'Services', couleur: '#546E7A',
    filtre: '["shop"~"^(laundry|dry_cleaning|hairdresser)$"]' },
  { cle: 'wc', libelle: 'Toilettes', couleur: '#0097A7',
    filtre: '["amenity"="toilets"]' },
];

/* CE QUI RANGE UN LIEU DANS SA FAMILLE, à la lecture de ses étiquettes. Les
   douze filtres partent en UNE requête — Overpass est bénévole — et la
   réponse ne dit pas lequel a répondu : c'est donc ce tableau qui tranche,
   DANS L'ORDRE. Le premier qui correspond gagne, et l'ordre compte : une
   pharmacie qui vend des cosmétiques reste une pharmacie. */
const RANGEMENT: readonly { cle: string; test: (t: Record<string, string>) => boolean }[] = [
  { cle: 'pharmacie', test: (t) => t['amenity'] === 'pharmacy' },
  { cle: 'restaurant', test: (t) => ['restaurant', 'fast_food'].includes(t['amenity'] ?? '') },
  { cle: 'cafe', test: (t) => ['cafe', 'bar', 'pub'].includes(t['amenity'] ?? '') },
  { cle: 'cinema', test: (t) => ['cinema', 'theatre'].includes(t['amenity'] ?? '') },
  { cle: 'argent', test: (t) => ['atm', 'bank', 'bureau_de_change'].includes(t['amenity'] ?? '') },
  { cle: 'parking', test: (t) => t['amenity'] === 'parking' },
  { cle: 'wc', test: (t) => t['amenity'] === 'toilets' },
  { cle: 'hotel', test: (t) => ['hotel', 'motel', 'guest_house'].includes(t['tourism'] ?? '') },
  { cle: 'culture', test: (t) => ['museum', 'attraction', 'viewpoint'].includes(t['tourism'] ?? '') },
  { cle: 'auto', test: (t) => ['car_repair', 'car_parts'].includes(t['shop'] ?? '') },
  { cle: 'services', test: (t) => ['laundry', 'dry_cleaning', 'hairdresser'].includes(t['shop'] ?? '') },
  { cle: 'commerce', test: (t) => t['shop'] !== undefined },
];

/** La famille d'un lieu d'après ses étiquettes — PURE. `null` si aucune. */
export function familleDe(tags: Record<string, string>): string | null {
  return RANGEMENT.find((r) => r.test(tags))?.cle ?? null;
}

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

/**
 * L'URL Overpass de PLUSIEURS familles dans une emprise — PURE.
 *
 * UNE SEULE REQUÊTE POUR TOUTES LES FAMILLES COCHÉES : Overpass est tenu par
 * des bénévoles, et douze requêtes là où une suffit seraient douze fois trop.
 * Le plafond vaut pour l'UNION — une vue de centre-ville rendrait sinon mille
 * lieux, illisibles autant qu'inutiles.
 */
export function urlFamilles(cles: readonly string[], vue: EmpriseVue): string {
  const emprise = [vue.sud, vue.ouest, vue.nord, vue.est]
    .map((v) => v.toFixed(5)).join(',');
  const choisies = CATEGORIES.filter((c) => cles.includes(c.cle));
  const requete = '[out:json][timeout:25];('
    + choisies.map((c) => `nwr${c.filtre}(${emprise});`).join('')
    + `);out center tags ${PLAFOND_LIEUX};`;
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
    /* LA FAMILLE SE LIT SUR LES ÉTIQUETTES, parce que la réponse d'une
       requête à douze filtres ne dit pas lequel a répondu. */
    const propres: Record<string, string> = {};
    for (const [k, v] of Object.entries(tags)) if (typeof v === 'string') propres[k] = v;
    const famille = familleDe(propres);
    rendu.push({
      nom: identite?.trim() ?? null, lon, lat,
      ...(famille ? { famille } : {}),
    });
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
