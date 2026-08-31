import { describe, it, expect } from 'vitest';
import { pointDuTrace, SEUIL_AIMANT_M } from '../src/lib/guidage';

/* L'AIMANT AU TRACÉ (GUIDE-1, 01/09).
 *
 * Armelin : « parfois le véhicule est situé à une dizaine de mètres à gauche
 * ou à droite de la route alors que je suis bien sur cette ligne » ; « la
 * flèche représentant ma voiture est à l'envers du sens de la circulation ».
 * Sur la route, on DESSINE la route : le point projeté, le cap du tracé. */

/* Un tracé plein est de 1 km le long du 48.85e parallèle (1° lon ≈ 73,3 km). */
const TRACE: [number, number][] = Array.from({ length: 11 }, (_, i) =>
  [2.3400 + i * (0.1 / 73.3), 48.8500]);

describe('pointDuTrace', () => {
  it('interpole le point à l’avancement demandé', () => {
    const r = pointDuTrace(TRACE, 500)!;
    expect(r.point[1]).toBeCloseTo(48.85, 6);
    // À mi-chemin d'un kilomètre : à ~500 m du départ.
    const attendu = 2.34 + (0.5 / 73.3);
    expect(r.point[0]).toBeCloseTo(attendu, 4);
  });

  /* LE CAP EST CELUI DU TRACÉ — c'est lui qui remet la flèche dans le sens
     de la circulation, là où le heading GPS tournoie à basse vitesse. */
  it('rend le cap du segment — plein est, ici', () => {
    expect(pointDuTrace(TRACE, 500)!.cap).toBeCloseTo(90, 0);
  });

  it('au-delà du bout, la fin du tracé — jamais un point inventé', () => {
    const r = pointDuTrace(TRACE, 99_999)!;
    expect(r.point).toEqual(TRACE[TRACE.length - 1]);
    expect(r.cap).toBeCloseTo(90, 0);
  });

  it('à zéro, le départ', () => {
    expect(pointDuTrace(TRACE, 0)!.point[0]).toBeCloseTo(2.34, 6);
  });

  it('refuse un tracé trop court', () => {
    expect(pointDuTrace([], 10)).toBeNull();
    expect(pointDuTrace([[2.34, 48.85]], 10)).toBeNull();
  });
});

describe('le seuil de l’aimant', () => {
  /* « UNE DIZAINE DE MÈTRES à gauche ou à droite » doit être aimantée ; le
     seuil doit rester SOUS le seuil hors-route, sinon l'aimant collerait un
     usager réellement parti ailleurs. */
  it('couvre la dizaine de mètres du terrain, sans avaler le hors-route', () => {
    expect(SEUIL_AIMANT_M).toBeGreaterThanOrEqual(20);
    expect(SEUIL_AIMANT_M).toBeLessThanOrEqual(40);
  });
});
