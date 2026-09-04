import { describe, expect, it } from 'vitest';
import { empriseAutour } from '../src/lib/categories';

/* L'EMPRISE AUTOUR D'UN POINT (RAIL-POI-1, 04/09) : la brique du rail
   « à proximité ». Le piège est la longitude — un degré y rétrécit avec la
   latitude, et l'oublier ferait mentir « 5 km autour de moi » d'un tiers
   à Lille. */
describe('empriseAutour', () => {
  it('rend une emprise centrée sur le point', () => {
    const e = empriseAutour({ lon: 2.4, lat: 46.6 }, 5);
    expect((e.ouest + e.est) / 2).toBeCloseTo(2.4, 10);
    expect((e.sud + e.nord) / 2).toBeCloseTo(46.6, 10);
    expect(e.ouest).toBeLessThan(e.est);
    expect(e.sud).toBeLessThan(e.nord);
  });

  it('donne 5 km de rayon en latitude, partout', () => {
    const e = empriseAutour({ lon: 2.4, lat: 46.6 }, 5);
    expect((e.nord - 46.6) * 111.32).toBeCloseTo(5, 6);
  });

  it('élargit la longitude avec la latitude — le degré y rétrécit', () => {
    const marseille = empriseAutour({ lon: 5.4, lat: 43.3 }, 5);
    const lille = empriseAutour({ lon: 3.06, lat: 50.63 }, 5);
    const largeur = (e: { ouest: number; est: number }): number => e.est - e.ouest;
    expect(largeur(lille)).toBeGreaterThan(largeur(marseille));
    /* Et la largeur EN KILOMÈTRES reste celle demandée. */
    const km = largeur(lille) * 111.32 * Math.cos((50.63 * Math.PI) / 180);
    expect(km).toBeCloseTo(10, 6);
  });

  it('un rayon plus grand contient le plus petit', () => {
    const petit = empriseAutour({ lon: 2.4, lat: 46.6 }, 2);
    const grand = empriseAutour({ lon: 2.4, lat: 46.6 }, 5);
    expect(grand.ouest).toBeLessThan(petit.ouest);
    expect(grand.est).toBeGreaterThan(petit.est);
    expect(grand.sud).toBeLessThan(petit.sud);
    expect(grand.nord).toBeGreaterThan(petit.nord);
  });
});
