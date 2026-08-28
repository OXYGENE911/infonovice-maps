import { describe, it, expect } from 'vitest';
import {
  CATEGORIES, urlCategorie, versLieux, PLAFOND_LIEUX,
} from '../src/lib/categories';

/* LA RECHERCHE PAR CATÉGORIES (mandat UX du 28/08, POI-1). Le piège de ce
   domaine : Overpass ordonne son emprise (sud, ouest, nord, est), l'inverse
   partiel de MapLibre — une inversion silencieuse rendrait des lieux de
   l'autre hémisphère, sans une erreur pour le dire. */

const pharmacie = CATEGORIES[0]!;
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
