import { describe, expect, it } from 'vitest';
import { qualitePrecision, lignesFixe, PHRASES_QUALITE, type Fixe } from '../src/lib/signal-gps';

/* OUTILS-2 (06/09). Ce qu'un navigateur sait du signal, dit en clair — et
   rien d'inventé sur les satellites. */

const FIXE: Fixe = {
  latitude: 48.8566, longitude: 2.3522, accuracy: 6.4,
  altitude: 41.2, altitudeAccuracy: 3, heading: 87.5, speed: 12.5,
};

describe('qualitePrecision', () => {
  it('qualifie la précision par paliers de terrain', () => {
    expect(qualitePrecision(4)).toBe('excellente');
    expect(qualitePrecision(8)).toBe('excellente');
    expect(qualitePrecision(15)).toBe('bonne');
    expect(qualitePrecision(35)).toBe('moyenne');
    expect(qualitePrecision(120)).toBe('faible');
    expect(qualitePrecision(Number.NaN)).toBe('faible');
  });
  it('chaque qualité a sa phrase', () => {
    for (const q of ['excellente', 'bonne', 'moyenne', 'faible'] as const) {
      expect(PHRASES_QUALITE[q].length).toBeGreaterThan(10);
    }
  });
});

describe('lignesFixe', () => {
  it('écrit précision, position, altitude, vitesse en km/h, cap, âge et compte', () => {
    const l = Object.fromEntries(lignesFixe(FIXE, 3400, 7).map((x) => [x.libelle, x.valeur]));
    expect(l['Précision']).toBe('± 6 m');
    expect(l['Qualité']).toBe('excellente');
    expect(l['Position']).toBe('48,85660, 2,35220');
    expect(l['Altitude']).toBe('41 m (± 3 m)');
    expect(l['Vitesse']).toBe('45 km/h');
    expect(l['Cap']).toBe('88°');
    expect(l['Âge du relevé']).toBe('il y a 3 s');
    expect(l['Relevés reçus']).toBe('7');
  });
  it('dit « non donnée » plutôt que zéro quand le navigateur ne sait pas', () => {
    const l = Object.fromEntries(lignesFixe(
      { ...FIXE, altitude: null, altitudeAccuracy: null, heading: null, speed: null }, 500, 1,
    ).map((x) => [x.libelle, x.valeur]));
    expect(l['Altitude']).toBe('non donnée');
    expect(l['Vitesse']).toBe('non donnée');
    expect(l['Cap']).toBe('non donné');
    expect(l['Âge du relevé']).toBe('à l’instant');
  });
});
