import { describe, expect, it } from 'vitest';
import { formaterDistance, bilanMesure, geojsonMesure, type PointMesure } from '../src/lib/mesure';

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
