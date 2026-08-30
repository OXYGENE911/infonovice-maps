// Profil altimétrique — les fonctions pures, testées à sec (la leçon des
// fixtures : au format RÉEL du service, champ `acc` compris, tel que vérifié
// par appels réels le 20/08/2026 — voir docs/apis.md).
import { describe, expect, test } from 'vitest';
import {
  simplifier, versProfil, denivele, versTraceSVG, pointSurTrace, ErreurAltimetrie,
} from '../src/lib/altimetrie';

const point = (lon: number, lat: number, z: number) => ({
  lon, lat, z, acc: 'Variable suivant la source de mesure',
});

describe('simplifier', () => {
  const serie = Array.from({ length: 9730 }, (_, i) => [2 + i / 1000, 48 - i / 2000] as [number, number]);

  test('borne la série et conserve premier et dernier sommets', () => {
    const s = simplifier(serie, 40);
    expect(s).toHaveLength(40);
    expect(s[0]).toEqual(serie[0]);
    expect(s[39]).toEqual(serie[9729]);
  });

  test('rend la série telle quelle si elle tient déjà dans la borne', () => {
    const courte: [number, number][] = [[2, 48], [3, 47], [4, 46]];
    expect(simplifier(courte, 40)).toBe(courte);
  });

  test('refuse une borne qui ne peut pas porter un segment', () => {
    expect(() => simplifier(serie, 1)).toThrow(ErreurAltimetrie);
  });
});

describe('versProfil', () => {
  test('cumule les distances et garde les altitudes', () => {
    // ~111 km par degré de latitude : deux pas de 0,1° ≈ 11,1 km chacun.
    const p = versProfil({ elevations: [
      point(2.35, 48.85, 35), point(2.35, 48.75, 80), point(2.35, 48.65, 60),
    ] });
    expect(p).toHaveLength(3);
    expect(p[0]).toEqual({ distance: 0, z: 35 });
    expect(p[1]!.distance).toBeGreaterThan(11_000);
    expect(p[1]!.distance).toBeLessThan(11_300);
    expect(p[2]!.distance).toBeCloseTo(p[1]!.distance * 2, -2);
  });

  test('écarte les « pas de donnée » (-99999) sans creuser de gouffre', () => {
    const p = versProfil({ elevations: [
      point(2.35, 48.85, 35), point(2.35, 48.80, -99999), point(2.35, 48.75, 80),
    ] });
    expect(p).toHaveLength(2);
    expect(p.map((x) => x.z)).toEqual([35, 80]);
  });

  test('refuse une réponse vide ou difforme, en français', () => {
    expect(() => versProfil({})).toThrow('profil exploitable');
    expect(() => versProfil({ elevations: [point(2, 48, 10)] })).toThrow(ErreurAltimetrie);
    expect(() => versProfil({ elevations: [{ lon: 'a', lat: 'b', z: 'c' }, {}] })).toThrow(ErreurAltimetrie);
  });
});

describe('denivele', () => {
  test('sépare montées et descentes cumulées', () => {
    const d = denivele([
      { distance: 0, z: 100 }, { distance: 1, z: 180 },
      { distance: 2, z: 150 }, { distance: 3, z: 210 },
    ]);
    expect(d.montee).toBe(140); // +80 puis +60
    expect(d.descente).toBe(30);
  });
});

describe('versTraceSVG', () => {
  test('projette dans le repère : zMax en haut, bornes respectées', () => {
    const t = versTraceSVG([
      { distance: 0, z: 0 }, { distance: 500, z: 100 }, { distance: 1000, z: 50 },
    ], 280, 72);
    const xy = t.ligne.split(' ').map((c) => c.split(',').map(Number)) as [number, number][];
    expect(xy[0]![0]).toBe(0);
    expect(xy[2]![0]).toBe(280);
    // Le sommet (z=100) est le point le plus HAUT du SVG (y le plus petit).
    expect(Math.min(...xy.map((c) => c[1]))).toBe(xy[1]![1]);
    for (const [x, y] of xy) {
      expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(280);
      expect(y).toBeGreaterThanOrEqual(0); expect(y).toBeLessThanOrEqual(72);
    }
    expect(t.zMin).toBe(0);
    expect(t.zMax).toBe(100);
  });

  test('un profil plat trace une ligne médiane, pas une division par zéro', () => {
    const t = versTraceSVG([{ distance: 0, z: 42 }, { distance: 100, z: 42 }], 280, 72);
    expect(t.ligne).toBe('0.0,36.0 280.0,36.0');
  });

  test('l’aire referme le polygone par le bas du repère', () => {
    const t = versTraceSVG([{ distance: 0, z: 0 }, { distance: 100, z: 10 }], 280, 72);
    expect(t.aire.endsWith('280,72 0,72')).toBe(true);
  });
});

/* LE VÉHICULE SUR LE PROFIL (COPILOTE-1, 30/08). Armelin : « dans le profil
 * altimétrique, est-ce possible de faire un petit rond de couleur pour
 * indiquer où en est le véhicule sur le tracé ? » Le repère doit être celui
 * du DESSIN — mêmes marges, même échelle que versTraceSVG — sinon le rond
 * flotte à côté de la courbe. */
describe('pointSurTrace', () => {
  const points = [
    { distance: 0, z: 100 },
    { distance: 1_000, z: 200 },
    { distance: 2_000, z: 100 },
  ];

  test('place le rond à l’abscisse du parcours', () => {
    expect(pointSurTrace(points, 0, 280, 64)?.x).toBeCloseTo(0, 1);
    expect(pointSurTrace(points, 1_000, 280, 64)?.x).toBeCloseTo(140, 1);
    expect(pointSurTrace(points, 2_000, 280, 64)?.x).toBeCloseTo(280, 1);
  });

  test('suit la MÊME échelle verticale que le tracé — marges comprises', () => {
    // Au sommet (z = 200 = zMax), le rond touche la marge haute.
    expect(pointSurTrace(points, 1_000, 280, 64)?.y).toBeCloseTo(4, 1);
    // Au plus bas (z = 100 = zMin), il touche la marge basse.
    expect(pointSurTrace(points, 0, 280, 64)?.y).toBeCloseTo(60, 1);
  });

  test('INTERPOLE entre deux échantillons au lieu de sauter de l’un à l’autre', () => {
    // À mi-chemin de la montée : 150 m, soit le milieu de l'échelle.
    expect(pointSurTrace(points, 500, 280, 64)?.y).toBeCloseTo(32, 1);
  });

  test('borne aux extrémités, et refuse un profil trop court', () => {
    expect(pointSurTrace(points, -500, 280, 64)?.x).toBe(0);
    expect(pointSurTrace(points, 99_000, 280, 64)?.x).toBe(280);
    expect(pointSurTrace([{ distance: 0, z: 10 }], 0, 280, 64)).toBeNull();
  });

  test('ne divise pas par zéro sur un profil plat', () => {
    const plat = [{ distance: 0, z: 50 }, { distance: 1_000, z: 50 }];
    expect(pointSurTrace(plat, 500, 280, 64)?.y).toBe(32);
  });
});
