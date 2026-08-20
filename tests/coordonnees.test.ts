// La brique coordonnées : le format français, et le refus de deviner.
import { describe, it, expect } from 'vitest';
import { formaterCoordonnees, analyserCoordonnees } from '../src/lib/coordonnees';

describe('formaterCoordonnees', () => {
  it('affiche latitude avant longitude, virgule française, cinq décimales', () => {
    expect(formaterCoordonnees({ lon: 2.330992, lat: 48.868831 }))
      .toBe('48,86883, 2,33099');
  });
});

describe('analyserCoordonnees', () => {
  it('accepte « lat, lon » au point comme à la virgule décimale', () => {
    expect(analyserCoordonnees('48.85, 2.35')).toEqual({ lat: 48.85, lon: 2.35 });
    expect(analyserCoordonnees('48,85; 2,35')).toEqual({ lat: 48.85, lon: 2.35 });
  });
  it('refuse ce qui sort du globe plutôt que de le tordre', () => {
    expect(analyserCoordonnees('91, 2')).toBeNull();
    expect(analyserCoordonnees('48, 181')).toBeNull();
    expect(analyserCoordonnees('bonjour')).toBeNull();
  });
});
