import { describe, it, expect } from 'vitest';
import { nombreDeLignes, PALIERS } from '../src/carte/tenir-en-lignes';

/* CE QUI SE TESTE À SEC DANS TERRAIN-2 (b) : le comptage de lignes et la
 * forme de l'échelle. La MESURE, elle, vit dans le navigateur et se prouve
 * dans `tests-e2e/guidage.spec.ts` — viewport 360, boîte englobante mesurée.
 * Une mesure ne se simule pas : c'est exactement la leçon du 13/09. */

describe('nombreDeLignes', () => {
  it('compte deux lignes pour deux interlignes', () => {
    expect(nombreDeLignes(36, 18)).toBe(2);
  });

  it('NE COMPTE PAS UNE TROISIÈME LIGNE POUR UN SOUS-PIXEL', () => {
    /* Le piège réel : les navigateurs rendent 28,79 px pour deux lignes de
       14,4. Un `Math.ceil` y aurait vu trois lignes, et le texte aurait
       rétréci jusqu'au dernier palier sans aucune raison. */
    expect(nombreDeLignes(28.79, 14.4)).toBe(2);
  });

  it('voit bien la troisième ligne quand elle est là', () => {
    expect(nombreDeLignes(43.2, 14.4)).toBe(3);
  });

  it('rend au moins une ligne pour un texte court', () => {
    expect(nombreDeLignes(12, 18)).toBe(1);
  });

  it('se protège d’un interligne absurde plutôt que de rendre l’infini', () => {
    expect(nombreDeLignes(36, 0)).toBe(0);
    expect(nombreDeLignes(36, Number.NaN)).toBe(0);
  });
});

describe('PALIERS', () => {
  it('part du plein et descend, sans jamais remonter', () => {
    expect(PALIERS[0]).toBe(1);
    for (let i = 1; i < PALIERS.length; i += 1) {
      expect(PALIERS[i]!).toBeLessThan(PALIERS[i - 1]!);
    }
  });

  it('ne descend pas sous 60 % — en dessous, on ne lit plus au volant', () => {
    expect(Math.min(...PALIERS)).toBeGreaterThanOrEqual(0.6);
  });
});
