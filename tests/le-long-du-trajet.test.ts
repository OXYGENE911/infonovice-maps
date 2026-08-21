// « Sur le trajet » — géométrie et plan d'appels, purs, éprouvés à sec.
// Les distances de référence sont calculées sur des cas où la réponse est
// connue d'avance (un degré de latitude ≈ 111,3 km).
import { describe, expect, test } from 'vitest';
import {
  distanceM, distanceAuSegment, situerSurLeTrace, tronconner, retenir, MAX_TRONCONS,
} from '../src/lib/le-long-du-trajet';

// Un tracé simple : plein est le long du parallèle 48, de 2° à 3°.
const TRACE: [number, number][] = [[2, 48], [2.5, 48], [3, 48]];

describe('distanceM', () => {
  test('un degré de latitude fait ~111,3 km', () => {
    expect(distanceM([2, 48], [2, 49])).toBeGreaterThan(111_000);
    expect(distanceM([2, 48], [2, 49])).toBeLessThan(111_600);
  });
  test('deux points confondus sont à zéro', () => {
    expect(distanceM([2.35, 48.85], [2.35, 48.85])).toBe(0);
  });
});

describe('distanceAuSegment', () => {
  test('un point à l’aplomb du milieu : t = 0,5 et distance = l’écart latéral', () => {
    const r = distanceAuSegment([2.5, 48.01], [2, 48], [3, 48]);
    expect(r.t).toBeCloseTo(0.5, 2);
    expect(r.distance).toBeGreaterThan(1_050);
    expect(r.distance).toBeLessThan(1_180);
  });

  test('un point AVANT le début se rabat sur le début (t = 0), pas sur la droite', () => {
    // Le piège classique : sans bornage, la projection sortirait du segment.
    const r = distanceAuSegment([1, 48], [2, 48], [3, 48]);
    expect(r.t).toBe(0);
    // À 0,5 % près de la distance sphérique : la projection plane est locale
    // par construction (elle sert des segments routiers de quelques centaines
    // de mètres) — sur les 74 km de ce segment d'école, elle dérive de 84 m,
    // sans effet sur un seuil de recherche exprimé en kilomètres.
    const reference = distanceM([1, 48], [2, 48]);
    expect(Math.abs(r.distance - reference) / reference).toBeLessThan(0.005);
  });

  test('un segment dégénéré (deux points identiques) ne divise pas par zéro', () => {
    const r = distanceAuSegment([2.1, 48], [2, 48], [2, 48]);
    expect(Number.isFinite(r.distance)).toBe(true);
    expect(r.t).toBe(0);
  });
});

describe('situerSurLeTrace', () => {
  test('rend l’écart au tracé ET l’avancement depuis le départ', () => {
    const r = situerSurLeTrace({ lon: 2.75, lat: 48.005 }, TRACE);
    expect(r.ecart).toBeLessThan(700);
    // Aux trois quarts d'un tracé d'environ 74 km.
    expect(r.avancement).toBeGreaterThan(52_000);
    expect(r.avancement).toBeLessThan(60_000);
  });

  test('un point loin de tout garde un écart honnête', () => {
    const r = situerSurLeTrace({ lon: 2.5, lat: 49 }, TRACE);
    expect(r.ecart).toBeGreaterThan(100_000);
  });
});

describe('tronconner — le plan d’appels', () => {
  test('ne dépasse JAMAIS le plafond, même sur un tracé de 10 000 points', () => {
    const long: [number, number][] = Array.from({ length: 10_000 },
      (_, i) => [2 + i / 4000, 48 - i / 8000]);
    const boites = tronconner(long, 2_000);
    expect(boites.length).toBeLessThanOrEqual(MAX_TRONCONS);
    expect(boites.length).toBeGreaterThan(1);
  });

  test('les boîtes couvrent tout le tracé, marge du rayon comprise', () => {
    const boites = tronconner(TRACE, 5_000);
    expect(boites.length).toBeGreaterThan(0);
    expect(Math.min(...boites.map((b) => b.ouest))).toBeLessThan(2);
    expect(Math.max(...boites.map((b) => b.est))).toBeGreaterThan(3);
    // La marge vaut bien ~5 km en degrés (≈ 0,045°).
    expect(boites[0]!.sud).toBeLessThan(48 - 0.04);
  });

  test('un tracé dégénéré ne produit aucun appel', () => {
    expect(tronconner([], 1000)).toEqual([]);
    expect(tronconner([[2, 48]], 1000)).toEqual([]);
  });
});

describe('retenir', () => {
  const poi = (lon: number, lat: number) => ({ lon, lat });

  test('écarte les points trop loin, garde les proches, trie par avancement', () => {
    const r = retenir(
      [poi(2.9, 48.002), poi(2.1, 48.001), poi(2.5, 49)],
      TRACE, 1_000,
    );
    expect(r).toHaveLength(2);
    expect(r[0]!.poi.lon).toBe(2.1); // plus tôt sur le trajet
    expect(r[1]!.poi.lon).toBe(2.9);
    expect(r[0]!.avancement).toBeLessThan(r[1]!.avancement);
  });

  test('DÉDOUBLONNE : les tronçons se chevauchent, un point revient deux fois', () => {
    const r = retenir([poi(2.5, 48.001), poi(2.5, 48.001)], TRACE, 1_000);
    expect(r).toHaveLength(1);
  });

  test('un rayon nul ne garde que ce qui est exactement sur le tracé', () => {
    const r = retenir([poi(2.5, 48), poi(2.5, 48.01)], TRACE, 0);
    expect(r).toHaveLength(1);
    expect(r[0]!.ecart).toBeCloseTo(0, 5);
  });
});
