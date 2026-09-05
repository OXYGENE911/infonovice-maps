import { describe, expect, it } from 'vitest';
import { manoeuvreImminente } from '../src/lib/guidage';

/* FLECHE-1 (05/09). Armelin, sur le périphérique : la flèche « à droite »
   montrée à 4 km lui a fait prendre une sortie d'autoroute pour la manœuvre.
   La flèche de virage ne paraît qu'à portée — quarante secondes de route. */
describe('manoeuvreImminente', () => {
  it('à 4 km, on continue tout droit — quelle que soit la vitesse', () => {
    expect(manoeuvreImminente('right', 4000, 36)).toBe(false);
    expect(manoeuvreImminente('right', 4000, 14)).toBe(false);
    expect(manoeuvreImminente('right', 4000, null)).toBe(false);
  });
  it('la portée suit la vitesse : 40 s de route, entre 500 m et 1 500 m', () => {
    expect(manoeuvreImminente('right', 1400, 36)).toBe(true);   // 130 km/h : 1 440 m
    expect(manoeuvreImminente('right', 1400, 14)).toBe(false);  // 50 km/h : 560 m
    expect(manoeuvreImminente('right', 550, 14)).toBe(true);
    expect(manoeuvreImminente('right', 1600, 60)).toBe(false);  // plafond 1 500
    expect(manoeuvreImminente('left', 450, 0)).toBe(true);      // arrêt : plancher 500
    expect(manoeuvreImminente('left', 450, null)).toBe(true);
  });
  it('tout droit, l’arrivée et le giratoire se montrent toujours', () => {
    expect(manoeuvreImminente('straight', 9000, 30)).toBe(true);
    expect(manoeuvreImminente('arrivee', 9000, 30)).toBe(true);
    expect(manoeuvreImminente('rond-point', 9000, 30)).toBe(true);
  });
});
