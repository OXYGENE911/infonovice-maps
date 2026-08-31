import { describe, it, expect } from 'vitest';
import {
  requeteParkings, versParkings, RAYON_PARKINGS_M, MAX_PARKINGS,
} from '../src/lib/parkings';

/* LA SUGGESTION DE PARKING (PARK-1, 31/08). Armelin : « les parkings doivent
 * s'afficher du plus près au plus éloigné de la destination finale, car la
 * fin du trajet se fera logiquement à pied ». */

const DEST = { lon: 2.3522, lat: 48.8566 };

const parking = (lon: number, lat: number, tags: Record<string, string> = {}) =>
  ({ type: 'way', id: Math.round(lon * 1e6), center: { lon, lat }, tags });

describe('requeteParkings', () => {
  it('cherche autour de la destination, dans le rayon de la marche', () => {
    const q = requeteParkings(DEST);
    expect(q).toContain(`around:${RAYON_PARKINGS_M}`);
    expect(q).toContain('"amenity"="parking"');
    expect(q).toContain('48.85660');
  });

  /* UN PARKING PRIVÉ N'EST PAS UNE SUGGESTION, c'est une contravention. */
  it('écarte le privé et le réservé, laisse passer le non-déclaré', () => {
    const q = requeteParkings(DEST);
    expect(q).toContain('private');
    expect(q).toContain('customers');
  });
});

describe('versParkings', () => {
  it('trie du plus près au plus loin de la DESTINATION', () => {
    const p = versParkings({ elements: [
      parking(2.3580, 48.8566, { name: 'Loin' }),
      parking(2.3530, 48.8566, { name: 'Près' }),
      parking(2.3550, 48.8566, { name: 'Entre' }),
    ] }, DEST);
    expect(p.map((x) => x.nom)).toEqual(['Près', 'Entre', 'Loin']);
    expect(p[0]!.distanceM).toBeLessThan(p[2]!.distanceM);
  });

  /* LA CAPACITÉ N'EST PAS LA DISPONIBILITÉ : on affiche « places » quand la
     carte les compte, jamais « places libres » — aucune source nationale
     gratuite ne les connaît, et un mot juste vaut mieux qu'une promesse
     fausse. */
  it('lit la capacité quand elle est un nombre, se tait sinon', () => {
    const p = versParkings({ elements: [
      parking(2.353, 48.8566, { capacity: '250' }),
      parking(2.354, 48.8566, { capacity: 'beaucoup' }),
      parking(2.355, 48.8566, {}),
    ] }, DEST);
    expect(p[0]!.places).toBe(250);
    expect(p[1]!.places).toBeNull();
    expect(p[2]!.places).toBeNull();
  });

  it('lit payant, gratuit, ou ne sait pas', () => {
    const p = versParkings({ elements: [
      parking(2.353, 48.8566, { fee: 'yes' }),
      parking(2.354, 48.8566, { fee: 'no' }),
      parking(2.355, 48.8566, {}),
    ] }, DEST);
    expect(p.map((x) => x.payant)).toEqual([true, false, null]);
  });

  it('plafonne la liste — le neuvième serait le moins bon de tous', () => {
    const beaucoup = Array.from({ length: 20 }, (_, i) =>
      parking(2.3530 + i * 0.0004, 48.8566));
    expect(versParkings({ elements: beaucoup }, DEST)).toHaveLength(MAX_PARKINGS);
  });

  it('défensive : la réponse vient du dehors', () => {
    expect(versParkings(null, DEST)).toEqual([]);
    expect(versParkings({ elements: 'non' }, DEST)).toEqual([]);
    expect(versParkings({ elements: [null, 42, { type: 'way' }] }, DEST)).toEqual([]);
  });
});
