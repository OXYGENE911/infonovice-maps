import { describe, it, expect } from 'vitest';
import {
  CATEGORIES, urlCategorie, versLieux, PLAFOND_LIEUX, familleDe, urlFamilles,
} from '../src/lib/categories';

/* LA RECHERCHE PAR CATÉGORIES (mandat UX du 28/08, POI-1). Le piège de ce
   domaine : Overpass ordonne son emprise (sud, ouest, nord, est), l'inverse
   partiel de MapLibre — une inversion silencieuse rendrait des lieux de
   l'autre hémisphère, sans une erreur pour le dire. */

/* PAR SA CLÉ, ET NON PAR SON RANG : l'ordre des familles est celui des
   boutons, et il changera. Un test qui s'accroche à `CATEGORIES[0]` casse au
   premier réarrangement, sans que rien ne soit cassé. */
const pharmacie = CATEGORIES.find((c) => c.cle === 'pharmacie')!;
const VUE = { ouest: 2.3, sud: 48.8, est: 2.4, nord: 48.9 };

describe('urlCategorie', () => {
  it('ordonne l’emprise à la façon Overpass : sud, ouest, nord, est', () => {
    const url = decodeURIComponent(urlCategorie(pharmacie, VUE));
    expect(url).toContain('(48.80000,2.30000,48.90000,2.40000)');
  });
  it('porte le filtre de la catégorie et le PLAFOND — la frugalité s’écrit', () => {
    const url = decodeURIComponent(urlCategorie(pharmacie, VUE));
    expect(url).toContain('["amenity"="pharmacy"]');
    expect(url).toContain(`out center tags ${PLAFOND_LIEUX};`);
    expect(url).toContain('overpass.openstreetmap.fr');
  });
});

describe('versLieux', () => {
  it('lit un nœud (lat/lon) ET un chemin (center) — les bâtiments comptent', () => {
    const lieux = versLieux({ elements: [
      { lat: 48.85, lon: 2.35, tags: { name: 'Pharmacie du Centre' } },
      { center: { lat: 48.86, lon: 2.36 }, tags: { name: 'Grande Pharmacie' } },
    ] });
    expect(lieux).toHaveLength(2);
    expect(lieux[1]).toMatchObject({ nom: 'Grande Pharmacie', lon: 2.36 });
  });
  it('écarte un élément sans position : il serait posé à l’équateur', () => {
    expect(versLieux({ elements: [{ tags: { name: 'Fantôme' } }] })).toHaveLength(0);
  });
  it('nomme dans l’ordre marque, exploitant, nom — et null quand rien', () => {
    const lieux = versLieux({ elements: [
      { lat: 1, lon: 1, tags: { brand: 'Carrefour City', name: 'Magasin 4021' } },
      { lat: 1, lon: 1, tags: { operator: 'CCAS', name: 'WC publics' } },
      { lat: 1, lon: 1, tags: {} },
    ] });
    expect(lieux.map((l) => l.nom))
      .toEqual(['Carrefour City', 'CCAS', null]);
  });
  it('rend une liste vide sur une réponse difforme, jamais une exception', () => {
    expect(versLieux(null)).toEqual([]);
    expect(versLieux({ elements: 'non' })).toEqual([]);
    expect(versLieux({ elements: [42, null] })).toEqual([]);
  });
});

/* LES FAMILLES DE LIEUX (POI-2, 30/08). Armelin a donné dix-sept étiquettes
 * et un « etc. » : on les range en douze familles — ce qu'on cherche d'un
 * même geste — et l'on interroge tout en UNE requête. La réponse ne dit pas
 * quel filtre a répondu : c'est le rangement qui tranche. */
describe('familleDe', () => {
  it('range chaque étiquette de la liste demandée', () => {
    expect(familleDe({ amenity: 'restaurant' })).toBe('restaurant');
    expect(familleDe({ amenity: 'bar' })).toBe('cafe');
    expect(familleDe({ shop: 'clothes' })).toBe('commerce');
    expect(familleDe({ shop: 'mall' })).toBe('commerce');
    expect(familleDe({ tourism: 'museum' })).toBe('culture');
    expect(familleDe({ amenity: 'cinema' })).toBe('cinema');
    expect(familleDe({ amenity: 'atm' })).toBe('argent');
    expect(familleDe({ amenity: 'parking' })).toBe('parking');
    expect(familleDe({ shop: 'car_repair' })).toBe('auto');
    expect(familleDe({ shop: 'dry_cleaning' })).toBe('services');
    expect(familleDe({ tourism: 'hotel' })).toBe('hotel');
  });

  it('L’ORDRE TRANCHE quand un lieu porte deux étiquettes', () => {
    /* Une pharmacie qui vend des cosmétiques reste une pharmacie : sans
       ordre, elle basculerait en « commerce » selon l'humeur du service. */
    expect(familleDe({ amenity: 'pharmacy', shop: 'chemist' })).toBe('pharmacie');
    expect(familleDe({ amenity: 'cafe', shop: 'bakery' })).toBe('cafe');
  });

  it('ne range PAS ce qu’elle ne reconnaît pas', () => {
    expect(familleDe({ highway: 'bus_stop' })).toBeNull();
    expect(familleDe({})).toBeNull();
  });
});

describe('urlFamilles', () => {
  const vue = { ouest: 2.3, sud: 48.8, est: 2.4, nord: 48.9 };

  it('met TOUTES les familles cochées dans UNE requête', () => {
    const url = decodeURIComponent(urlFamilles(['restaurant', 'pharmacie'], vue));
    expect(url).toContain('amenity"="pharmacy');
    expect(url).toContain('restaurant|fast_food');
    // Une seule union, un seul `out` : un seul aller-retour.
    expect(url.match(/out center tags/g)).toHaveLength(1);
    expect(url).toContain('(48.80000,2.30000,48.90000,2.40000)');
  });

  it('ignore une clé inconnue, et rend une union vide sans lever', () => {
    expect(decodeURIComponent(urlFamilles(['inexistante'], vue))).toContain('();');
  });

  it('garde le plafond de l’UNION : une vue dense rendrait mille lieux', () => {
    expect(decodeURIComponent(urlFamilles(['restaurant'], vue)))
      .toContain(`out center tags ${PLAFOND_LIEUX}`);
  });
});
