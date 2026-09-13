import { describe, it, expect } from 'vitest';
import { hauteurMax, nombreDeLignes, PALIERS } from '../src/carte/tenir-en-lignes';

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

/* LE PLAFOND DE HAUTEUR — la part qui GARANTIT les deux lignes.
 *
 * IL EXISTE PARCE QUE LE CLAMP CSS NE S’APPLIQUAIT PAS. Mesuré dans le
 * navigateur le 13/09 : `.bg-destination` est un item flex, son `display`
 * calculé vaut `flow-root` alors que `.texte-coupe` déclare `-webkit-box` —
 * `-webkit-line-clamp` n’avait donc aucune boîte sur quoi s’appliquer, et la
 * CI a mesuré trois lignes là où deux étaient promises.
 * Le plafond, lui, ne dépend d’aucun mode de boîte.
 */
describe('hauteurMax', () => {
  it('pose deux interlignes mesurés', () => {
    expect(hauteurMax(2, 11.25)).toBe('22.50px');
  });

  it('suit le nombre de lignes demandé', () => {
    expect(hauteurMax(3, 20)).toBe('60.00px');
  });

  it('NE POSE RIEN quand l’interligne n’a pas pu être mesuré — un plafond faux couperait un texte qui tenait', () => {
    expect(hauteurMax(2, 0)).toBe('');
    expect(hauteurMax(2, Number.NaN)).toBe('');
    expect(hauteurMax(2, -3)).toBe('');
  });

  it('ne pose rien pour un nombre de lignes absurde', () => {
    expect(hauteurMax(0, 11.25)).toBe('');
    expect(hauteurMax(Number.NaN, 11.25)).toBe('');
  });
});
