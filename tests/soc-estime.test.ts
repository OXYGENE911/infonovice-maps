import { describe, expect, it } from 'vitest';
import { socEstimeA } from '../src/lib/arrets';

/* L'INTERPOLATION DU SOC (SOC-EDIT, 04/09) : les ancres sont celles du
   plan — départ, arrivée/départ de chaque arrêt, arrivée finale — et la
   recharge est un saut vertical au même kilomètre. */

const ARRETS = [
  { avancementM: 100_000, socArrivee: 20, socDepart: 80 },
];

describe('socEstimeA', () => {
  it('au départ, le SOC est celui du départ', () => {
    expect(socEstimeA(0, 90, ARRETS, 50, 200_000)).toBe(90);
  });
  it('à mi-chemin du premier tronçon, la moyenne des deux ancres', () => {
    expect(socEstimeA(50_000, 90, ARRETS, 50, 200_000)).toBeCloseTo(55, 5);
  });
  it('juste avant la borne : l’arrivée prévue ; juste après : le départ rechargé', () => {
    expect(socEstimeA(100_000, 90, ARRETS, 50, 200_000)).toBeCloseTo(20, 5);
    expect(socEstimeA(100_001, 90, ARRETS, 50, 200_000)).toBeCloseTo(80, 2);
  });
  it('à l’arrivée, le SOC final du plan', () => {
    expect(socEstimeA(200_000, 90, ARRETS, 50, 200_000)).toBeCloseTo(50, 5);
  });
  it('sans arrêt : la droite du départ à l’arrivée', () => {
    expect(socEstimeA(75_000, 80, [], 40, 150_000)).toBeCloseTo(60, 5);
  });
  it('au-delà des bornes, la valeur se borne — jamais une extrapolation', () => {
    expect(socEstimeA(999_999, 90, ARRETS, 50, 200_000)).toBeCloseTo(50, 5);
    expect(socEstimeA(-5, 90, ARRETS, 50, 200_000)).toBe(90);
  });
});
