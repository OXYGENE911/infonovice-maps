// La vitesse limite cartographiée — le calcul pur, testé à sec. Ce que ces
// tests défendent : qu'on SE TAIT plutôt que d'afficher un panneau faux —
// valeurs illisibles, routes qui croisent, échantillon trop lointain.
import { describe, expect, test } from 'vitest';
import {
  kmhDe, versLimites, limiteA, requeteLimites, decimerSerre, TOLERANCE_M,
} from '../src/lib/limites';

/** Un tracé ouest→est le long du 47e parallèle : 0,01° ≈ 760 m. */
const TRACE: [number, number][] =
  Array.from({ length: 101 }, (_, i) => [3 + i * 0.01, 47] as [number, number]);

/** Une route OSM le long du tracé, entre deux longitudes. */
const voie = (deLon: number, aLon: number, maxspeed: string, lat = 47.0001) => ({
  type: 'way', id: Math.round(deLon * 1e5),
  tags: { highway: 'primary', maxspeed },
  geometry: Array.from({ length: 8 }, (_, i) => ({
    lat, lon: deLon + (i * (aLon - deLon)) / 7,
  })),
});

describe('kmhDe', () => {
  test('lit les nombres, traduit les implicites français', () => {
    expect(kmhDe('130')).toBe(130);
    expect(kmhDe('50')).toBe(50);
    expect(kmhDe('FR:urban')).toBe(50);
    expect(kmhDe('FR:rural')).toBe(80);
    expect(kmhDe('FR:motorway')).toBe(130);
  });

  test('se TAIT sur l’illisible — un panneau faux est pire qu’aucun', () => {
    expect(kmhDe('signals')).toBeNull();
    expect(kmhDe('none')).toBeNull();
    expect(kmhDe('50 mph')).toBeNull();
    expect(kmhDe('300')).toBeNull();
    expect(kmhDe(50)).toBeNull();
    expect(kmhDe(null)).toBeNull();
  });
});

describe('versLimites', () => {
  test('une route SUIVIE devient UN intervalle continu — pas des points', () => {
    /* Les nœuds OSM s'espacent parfois d'un kilomètre en ligne droite : lire
       « au plus proche » se taisait AU MILIEU d'un tronçon limité. C'est ce
       test qui l'a montré, à la première écriture. */
    const l = versLimites({ elements: [voie(3.1, 3.3, '80')] }, TRACE);
    expect(l).toHaveLength(1);
    expect(l[0]!.kmh).toBe(80);
    expect(l[0]!.finM - l[0]!.debutM).toBeGreaterThan(14_000);
  });

  test('une route qui CROISE est écartée — un ou deux nœuds sans étalement', () => {
    /* Un pont au-dessus du tracé : un seul nœud proche, empreinte nulle. Sa
       limite de 30 ne doit pas s'afficher sur l'autoroute qu'il enjambe. */
    const pont = {
      type: 'way', id: 1, tags: { highway: 'residential', maxspeed: '30' },
      geometry: [
        { lat: 46.995, lon: 3.2 }, { lat: 47.0001, lon: 3.2 }, { lat: 47.005, lon: 3.2 },
      ],
    };
    expect(versLimites({ elements: [pont] }, TRACE)).toEqual([]);
  });

  test('une réponse difforme rend une liste vide, jamais une exception', () => {
    expect(versLimites(null, TRACE)).toEqual([]);
    expect(versLimites({ elements: [{ tags: {} }, null, 7] }, TRACE)).toEqual([]);
  });
});

describe('limiteA', () => {
  const limites = versLimites({ elements: [voie(3.1, 3.3, '80'), voie(3.5, 3.7, '130')] }, TRACE);

  test('répond la limite du tronçon où l’on est', () => {
    // 0,2° ≈ 15,2 km : au cœur de la première voie.
    expect(limiteA(limites, 15_000)).toBe(80);
    // Au cœur de la seconde (0,6° ≈ 45,6 km).
    expect(limiteA(limites, 45_000)).toBe(130);
  });

  test('SE TAIT hors de tout tronçon — pas la limite d’il y a 3 km', () => {
    // 0,42° ≈ 32 km : dans le trou entre les deux voies.
    expect(limiteA(limites, 32_000)).toBeNull();
    expect(limiteA([], 10_000)).toBeNull();
    expect(TOLERANCE_M).toBeLessThanOrEqual(1000);
  });

  test('au chevauchement, le tronçon commencé en DERNIER l’emporte', () => {
    const l = [
      { debutM: 0, finM: 20_000, kmh: 130 },
      { debutM: 19_500, finM: 30_000, kmh: 90 },
    ];
    expect(limiteA(l, 19_800)).toBe(90);
    expect(limiteA(l, 10_000)).toBe(130);
  });
});

describe('requeteLimites', () => {
  test('demande les routes roulables AVEC maxspeed, géométrie comprise', () => {
    const q = requeteLimites(TRACE);
    expect(q).toContain('"maxspeed"');
    expect(q).toContain('motorway');
    expect(q).toContain('out geom');
    expect(q, 'les chemins et pistes ne roulent pas').not.toContain('cycleway');
  });

  test('la polyligne est décimée mais SERRÉE — la corde doit tenir sous le rayon', () => {
    // Un tracé DENSE (un point tous les 76 m) : la décimation vise ~300 m.
    const dense: [number, number][] =
      Array.from({ length: 1001 }, (_, i) => [3 + i * 0.001, 47] as [number, number]);
    const d = decimerSerre(dense);
    expect(d.length).toBeLessThan(dense.length / 2);
    expect(d.length).toBeGreaterThan(150);
  });
});
