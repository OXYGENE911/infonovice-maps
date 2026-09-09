import { describe, it, expect } from 'vitest';
import {
  rangDe, bilanDesRangs, enPourcent, ecartLisible, PROFONDEUR_VUE,
} from '../src/lib/metriques-recherche';

/* LES MÉTRIQUES DU BANC (CORPUS-1, 09/09/2026).
 *
 * Ce fichier garde l'INSTRUMENT, pas le service. Un banc dont les chiffres
 * sont faux est pire qu'un banc absent : il donne l'assurance sans le fond.
 * La leçon est déjà payée — RECHERCHE-10, 04/09 : le banc des douze requêtes
 * passait 12/12 pendant que les rangs disaient « SCI 43 CLER TOUR EFFEIL »
 * devant la Tour Eiffel.
 */

describe('le rang se lit, il ne se devine pas', () => {
  it('la première position vaut 1, l’absence vaut 0', () => {
    expect(rangDe(['a', 'b', 'c'], (r) => r === 'a')).toBe(1);
    expect(rangDe(['a', 'b', 'c'], (r) => r === 'c')).toBe(3);
    expect(rangDe(['a', 'b', 'c'], (r) => r === 'z')).toBe(0);
    expect(rangDe([], () => true)).toBe(0);
  });

  it('c’est la PREMIÈRE bonne réponse qui compte : un lieu rendu deux fois ne '
    + 'vaut pas mieux que rendu une fois', () => {
    expect(rangDe(['x', 'a', 'a'], (r) => r === 'a')).toBe(2);
  });
});

describe('le bilan dit les trois choses, et elles ne disent pas la même', () => {
  it('tout en tête : les trois valent un', () => {
    const b = bilanDesRangs([1, 1, 1, 1]);
    expect(b.top1).toBe(1);
    expect(b.top5).toBe(1);
    expect(b.mrr).toBe(1);
    expect(b.absentes).toBe(0);
  });

  it('rien trouvé : les trois valent zéro, et l’absence se compte à part', () => {
    const b = bilanDesRangs([0, 0, 0]);
    expect(b).toEqual({ total: 3, top1: 0, top5: 0, mrr: 0, absentes: 3 });
  });

  it('LE MRR VOIT CE QUE LES DEUX AUTRES NE VOIENT PAS : remonter de la 5e à la '
    + '2e place ne bouge ni le Top-1 ni le Top-5, et c’est pourtant un progrès '
    + 'que l’usager sent', () => {
    const avant = bilanDesRangs([5, 5, 5, 5]);
    const apres = bilanDesRangs([2, 2, 2, 2]);
    expect(apres.top1).toBe(avant.top1);
    expect(apres.top5).toBe(avant.top5);
    expect(apres.mrr).toBeGreaterThan(avant.mrr);
    expect(apres.mrr).toBeCloseTo(0.5, 10);
    expect(avant.mrr).toBeCloseTo(0.2, 10);
  });

  it('UN RANG AU-DELÀ DE CINQ N’EST PAS UNE RÉUSSITE — la liste n’en montre que '
    + 'cinq — mais il compte dans le MRR : remonter de la douzième à la sixième '
    + 'place va dans le bon sens, même si l’usager n’en voit rien encore', () => {
    const b = bilanDesRangs([6]);
    expect(b.top5).toBe(0);
    expect(b.absentes).toBe(0);
    expect(b.mrr).toBeCloseTo(1 / 6, 10);
  });

  it('la profondeur vue est celle de la LISTE, pas un chiffre d’usage', () => {
    expect(PROFONDEUR_VUE).toBe(5);
    expect(bilanDesRangs([5]).top5).toBe(1);
    expect(bilanDesRangs([6]).top5).toBe(0);
  });

  it('un banc vide ne rend pas de faux zéro triomphant', () => {
    expect(bilanDesRangs([])).toEqual({ total: 0, top1: 0, top5: 0, mrr: 0, absentes: 0 });
  });

  it('un cas mêlé se calcule à la main, et le compte y est', () => {
    // rangs 1, 3, 0, 5 → top1 = 1/4, top5 = 3/4, mrr = (1 + 1/3 + 0 + 1/5)/4
    const b = bilanDesRangs([1, 3, 0, 5]);
    expect(b.total).toBe(4);
    expect(b.top1).toBeCloseTo(0.25, 10);
    expect(b.top5).toBeCloseTo(0.75, 10);
    expect(b.mrr).toBeCloseTo((1 + 1 / 3 + 1 / 5) / 4, 10);
    expect(b.absentes).toBe(1);
  });
});

describe('on ne célèbre pas une décimale', () => {
  it('un pourcentage se lit à la française', () => {
    expect(enPourcent(0.8123)).toBe('81,2 %');
    expect(enPourcent(1)).toBe('100,0 %');
  });

  it('UN ÉCART SE DIT AUSSI EN NOMBRE DE REQUÊTES : sur deux cents requêtes, deux '
    + 'points de Top-1 valent quatre requêtes — du bruit, pas un progrès', () => {
    const avant = bilanDesRangs(Array.from({ length: 200 }, (_, i) => (i < 160 ? 1 : 3)));
    const apres = bilanDesRangs(Array.from({ length: 200 }, (_, i) => (i < 164 ? 1 : 3)));
    const dit = ecartLisible(avant, apres, 'top1');
    expect(dit).toContain('4 requête(s) sur 200');
    expect(dit).toContain('+');
  });

  it('et un recul se dit comme tel', () => {
    const avant = bilanDesRangs([1, 1, 1, 1]);
    const apres = bilanDesRangs([1, 1, 3, 3]);
    expect(ecartLisible(avant, apres, 'top1')).toContain('−');
  });
});
