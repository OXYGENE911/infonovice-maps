import { describe, expect, it } from 'vitest';
import {
  formaterDistance, bilanMesure, geojsonMesure, segmentsM, surfaceM2, perimetreM, formaterSurface,
  type PointMesure,
} from '../src/lib/mesure';

/* MESURE-1 (05/09). Calcul PUR : une règle posée sur la carte. Les distances
   de référence sont géodésiques : un centième de degré de longitude à
   l'équateur fait 1 112 m (rayon 6 371 km) ; Paris–Lyon à vol d'oiseau, 391 km. */

describe('formaterDistance', () => {
  it('au mètre sous le kilomètre, puis la précision que le chiffre mérite', () => {
    expect(formaterDistance(0)).toBe('0 m');
    expect(formaterDistance(829.6)).toBe('830 m');
    expect(formaterDistance(1_250)).toBe('1,25 km');
    expect(formaterDistance(12_440)).toBe('12,4 km');
    expect(formaterDistance(392_400)).toBe('392 km');
  });
  it('ne se laisse pas surprendre par une valeur impossible', () => {
    expect(formaterDistance(-5)).toBe('0 m');
    expect(formaterDistance(Number.NaN)).toBe('0 m');
  });
});

describe('bilanMesure', () => {
  const A: PointMesure = [0, 0];
  const B: PointMesure = [0.01, 0];
  const C: PointMesure = [0.02, 0];
  it('dit quoi faire tant qu’il n’y a rien à mesurer', () => {
    expect(bilanMesure([]).texte).toBe('Touchez la carte pour poser le premier point.');
    expect(bilanMesure([A]).texte).toBe('Un point posé — touchez le suivant.');
    expect(bilanMesure([A]).totalM).toBe(0);
  });
  it('cumule à vol d’oiseau et LE DIT, avec le dernier segment dès trois points', () => {
    const deux = bilanMesure([A, B]);
    expect(Math.round(deux.totalM)).toBe(1112);
    expect(deux.texte).toBe('2 points · 1,11 km à vol d’oiseau');
    const trois = bilanMesure([A, B, C]);
    expect(Math.round(trois.totalM)).toBe(2224);
    expect(Math.round(trois.dernierM)).toBe(1112);
    expect(trois.texte).toBe('3 points · 2,22 km à vol d’oiseau · dernier segment 1,11 km');
  });
  it('Paris–Lyon : 391 km', () => {
    const { totalM } = bilanMesure([[2.3522, 48.8566], [4.8357, 45.7640]]);
    expect(Math.round(totalM / 1000)).toBe(391);
  });
});

describe('geojsonMesure', () => {
  it('des points numérotés, et un trait dès deux points', () => {
    expect(geojsonMesure([]).features).toHaveLength(0);
    const un = geojsonMesure([[1, 2]]);
    expect(un.features).toHaveLength(1);
    expect(un.features[0]!.properties).toEqual({ rang: 1 });
    const deux = geojsonMesure([[1, 2], [3, 4]]);
    expect(deux.features.map((f) => f.geometry.type)).toEqual(['Point', 'Point', 'LineString']);
  });
});

describe('la surface et le périmètre (MESURE-2)', () => {
  // Un carré d'un centième de degré à l'équateur : 1,112 km de côté.
  const CARRE: PointMesure[] = [[0, 0], [0.01, 0], [0.01, 0.01], [0, 0.01]];
  it('les tronçons se listent dans l’ordre', () => {
    expect(segmentsM(CARRE).map(Math.round)).toEqual([1112, 1112, 1112]);
    expect(segmentsM([[0, 0]])).toEqual([]);
  });
  it('l’aire est celle de la sphère : 1,236 km² pour le carré, zéro sous trois points', () => {
    expect(surfaceM2(CARRE) / 1e6).toBeCloseTo(1.236, 2);
    expect(surfaceM2([[0, 0], [0.01, 0]])).toBe(0);
    // Le sens de parcours ne change pas l'aire.
    expect(surfaceM2([...CARRE].reverse())).toBeCloseTo(surfaceM2(CARRE), 3);
  });
  it('le périmètre referme la figure', () => {
    expect(Math.round(perimetreM(CARRE))).toBe(4 * 1112);
    expect(Math.round(perimetreM([[0, 0], [0.01, 0]]))).toBe(1112);
  });
  it('écrit les surfaces comme sur un plan', () => {
    expect(formaterSurface(850)).toBe('850 m²');
    expect(formaterSurface(12_500)).toBe('1,25 ha');
    expect(formaterSurface(450_000)).toBe('45 ha');
    expect(formaterSurface(12_400_000)).toBe('12,4 km²');
  });
  it('fermé sur trois points ou plus, le bilan dit surface et périmètre ; sinon la longueur', () => {
    const ferme = bilanMesure(CARRE, true);
    expect(ferme.texte).toBe('4 points · surface 1,24 km² · périmètre 4,45 km');
    expect(ferme.surfaceM2).not.toBeNull();
    const ouvert = bilanMesure(CARRE, false);
    expect(ouvert.texte).toMatch(/^4 points · 3,34 km à vol d’oiseau/);
    expect(ouvert.surfaceM2).toBeNull();
    expect(ouvert.segmentsM).toHaveLength(3);
    // Deux points fermés : pas de surface possible, la longueur reste.
    expect(bilanMesure([[0, 0], [0.01, 0]], true).surfaceM2).toBeNull();
  });
  it('fermée, la figure dessine un polygone et boucle le trait', () => {
    const g = geojsonMesure(CARRE, true);
    const types = g.features.map((f) => f.geometry.type);
    expect(types.filter((t) => t === 'Polygon')).toHaveLength(1);
    const trait = g.features.find((f) => f.geometry.type === 'LineString')!.geometry as GeoJSON.LineString;
    expect(trait.coordinates).toHaveLength(5);
    expect(geojsonMesure(CARRE, false).features.some((f) => f.geometry.type === 'Polygon')).toBe(false);
  });
});
