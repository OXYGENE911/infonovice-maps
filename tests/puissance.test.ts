// Paliers de puissance — la décision est pure, donc elle se teste à sec. Les
// BORNES des intervalles sont ce qui compte : c'est là que se logent les
// erreurs d'un cran, invisibles à l'œil sur une carte.
import { describe, expect, test } from 'vitest';
import { palierDe, libellePalier, PALIERS } from '../src/lib/puissance';

describe('les trois paliers, et leurs frontières exactes', () => {
  test.each([
    [3.7, 1], [7, 1], [22, 1], [43, 1],
    [50, 1],            // « jusqu'à 50 kW » : 50 est DEDANS
    [50.1, 2], [75, 2], [100, 2],
    [150, 2],           // « de 50 à 150 » : 150 est DEDANS
    [150.1, 3], [250, 3], [350, 3], [600, 3],
  ])('%s kW → %s éclair(s)', (kw, attendu) => {
    expect(palierDe(kw)).toBe(attendu);
  });
});

describe('une puissance inconnue ne se déguise pas en borne lente', () => {
  test.each([
    ['null', null], ['undefined', undefined], ['zéro', 0],
    ['négatif', -22], ['NaN', Number.NaN], ['Infinity', Number.POSITIVE_INFINITY],
  ])('%s rend null', (_, valeur) => {
    expect(palierDe(valeur as number | null | undefined)).toBeNull();
  });

  test('le libellé le dit franchement plutôt que d’inventer', () => {
    expect(libellePalier(null)).toContain('non déclarée');
  });
});

describe('le catalogue des paliers', () => {
  test('trois paliers, du plus lent au plus rapide', () => {
    expect(PALIERS.map((p) => p.palier)).toEqual([1, 2, 3]);
  });

  test('chacun porte une couleur distincte et une borne lisible', () => {
    expect(new Set(PALIERS.map((p) => p.couleur)).size).toBe(3);
    for (const p of PALIERS) {
      expect(p.borne.length).toBeGreaterThan(4);
      expect(p.libelle.length).toBeGreaterThan(4);
    }
  });

  test('le libellé d’une puissance connue nomme le palier ET sa borne', () => {
    expect(libellePalier(22)).toBe('Charge lente (jusqu’à 50 kW)');
    expect(libellePalier(300)).toBe('Charge très rapide (plus de 150 kW)');
  });
});
