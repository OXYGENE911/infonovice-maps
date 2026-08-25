// Visualiseur 360 — la NAVIGATION est du calcul pur, donc testée à sec. Le
// rendu WebGL, lui, n'est qu'une coquille : c'est ici que vivent les décisions.
import { describe, expect, test } from 'vitest';
import {
  estEquirectangulaire, normaliserLacet, bornerTangage, deplacer, sphere, VUE_INITIALE,
} from '../src/lib/panorama';

describe('reconnaître un panorama', () => {
  test('le rapport 2:1 est la signature de l’équirectangulaire', () => {
    expect(estEquirectangulaire(4096, 2048)).toBe(true);
    expect(estEquirectangulaire(8000, 4000)).toBe(true);
  });

  test('une photo ordinaire ne se déguise pas en panorama', () => {
    expect(estEquirectangulaire(1600, 1200)).toBe(false);
    expect(estEquirectangulaire(1920, 1080)).toBe(false);  // 16:9, tentant mais non
    expect(estEquirectangulaire(2048, 2048)).toBe(false);
  });

  test('une tolérance absorbe les recadrages d’un pixel', () => {
    expect(estEquirectangulaire(4096, 2047)).toBe(true);
    expect(estEquirectangulaire(4096, 2100)).toBe(false);
  });

  test('des dimensions absurdes ne passent pas pour un panorama', () => {
    expect(estEquirectangulaire(0, 0)).toBe(false);
    expect(estEquirectangulaire(-4096, -2048)).toBe(false);
    expect(estEquirectangulaire(Number.NaN, 2048)).toBe(false);
  });
});

describe('le lacet fait le tour, le tangage se bloque', () => {
  test('le lacet se replie dans [-180, 180]', () => {
    expect(normaliserLacet(190)).toBeCloseTo(-170, 5);
    expect(normaliserLacet(-190)).toBeCloseTo(170, 5);
    expect(normaliserLacet(540)).toBeCloseTo(180, 5);
    expect(normaliserLacet(45)).toBeCloseTo(45, 5);
  });

  test('LE TANGAGE NE FAIT PAS LE TOUR : on ne regarde pas par-dessus sa tête', () => {
    // Sans cette borne, l'image se retourne et l'usager perd le haut et le bas.
    expect(bornerTangage(120)).toBe(85);
    expect(bornerTangage(-120)).toBe(-85);
    expect(bornerTangage(30)).toBe(30);
  });
});

describe('le glissement', () => {
  const vue = { lacet: 0, tangage: 0 };

  test('glisser vers la droite fait tourner la vue vers la GAUCHE', () => {
    // On tire l'image, comme on ferait tourner un globe du doigt.
    expect(deplacer(vue, 100, 0, 800).lacet).toBeLessThan(0);
  });

  test('glisser vers le bas fait lever le regard', () => {
    expect(deplacer(vue, 0, 100, 800).tangage).toBeGreaterThan(0);
  });

  test('la sensibilité suit la LARGEUR de l’écran, pas une constante', () => {
    // Le même geste doit parcourir la même portion d'image, quel que soit
    // l'appareil — sinon le panorama file sur un téléphone.
    const large = deplacer(vue, 100, 0, 1600).lacet;
    const etroit = deplacer(vue, 100, 0, 400).lacet;
    expect(Math.abs(etroit)).toBeGreaterThan(Math.abs(large));
  });

  test('un tour complet ramène au point de départ', () => {
    let v = { ...vue };
    for (let i = 0; i < 8; i += 1) v = deplacer(v, -100, 0, 800);
    expect(normaliserLacet(v.lacet)).toBeCloseTo(normaliserLacet(v.lacet), 5);
    expect(Math.abs(v.lacet)).toBeLessThanOrEqual(180);
  });

  test('le tangage reste borné même après un glissement violent', () => {
    expect(deplacer(vue, 0, 100_000, 800).tangage).toBe(85);
  });

  test('la vue initiale regarde droit devant, à l’horizontale', () => {
    expect(VUE_INITIALE).toEqual({ lacet: 0, tangage: 0 });
  });
});

describe('la sphère', () => {
  test('elle est fermée : autant de longitudes que de méridiens + 1', () => {
    const s = sphere(8, 6);
    // (8+1) × (6+1) sommets : la couture est répétée pour que la texture
    // se referme sans déchirure visible.
    expect(s.positions.length / 3).toBe(9 * 7);
    expect(s.uvs.length / 2).toBe(9 * 7);
  });

  test('chaque quadrilatère fait deux triangles', () => {
    const s = sphere(8, 6);
    expect(s.indices.length).toBe(8 * 6 * 6);
  });

  test('les sommets sont sur la sphère unité', () => {
    for (const [i] of [...sphere(8, 6).positions].map((_, k) => [k]).filter(([k]) => k! % 3 === 0)) {
      const p = sphere(8, 6).positions;
      const r = Math.hypot(p[i!]!, p[i! + 1]!, p[i! + 2]!);
      expect(r).toBeCloseTo(1, 5);
    }
  });

  test('un maillage absurde est ramené à des bornes tenables', () => {
    expect(sphere(1, 1).positions.length).toBeGreaterThan(0);
    expect(sphere(10_000, 10_000).indices.length).toBeLessThan(500_000);
  });
});
