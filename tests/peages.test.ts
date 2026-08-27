// Les péages du trajet, nommés — le calcul pur, testé à sec. Ce que ces
// tests défendent : qu'une gare est un LIEU et non un nœud (OSM cartographie
// souvent chaque cabine), que la requête reste bornée, et que le filtre
// exact est local.
import { describe, expect, test } from 'vitest';
import {
  decimer, urlPeages, versPeages, RAYON_PEAGE_M,
} from '../src/lib/peages';

/** Un tracé ouest→est le long du 47e parallèle : 1° ≈ 76 km en longitude. */
const trace = (points: number, pasDeg = 0.01): [number, number][] =>
  Array.from({ length: points }, (_, i) => [3 + i * pasDeg, 47] as [number, number]);

/** Une cabine OSM à une position donnée. */
const cabine = (lon: number, lat: number, nom?: string): Record<string, unknown> => ({
  type: 'node', id: Math.round(lon * 1e5), lat, lon,
  tags: { barrier: 'toll_booth', ...(nom ? { name: nom } : {}) },
});

describe('decimer', () => {
  test('garde le premier et le dernier point, espace le reste', () => {
    const t = trace(200); // ~152 km, un point tous les 760 m
    const d = decimer(t, 5000);
    expect(d[0]).toEqual(t[0]);
    expect(d[d.length - 1]).toEqual(t[t.length - 1]);
    expect(d.length).toBeLessThan(t.length / 4);
  });

  test('plafonne le nombre de points, même sur un très long trajet', () => {
    // 2 000 points serrés : sans plafond, la requête serait un roman.
    const d = decimer(trace(2000, 0.02), 100);
    expect(d.length).toBeLessThanOrEqual(402);
  });

  test('un tracé de deux points reste lui-même', () => {
    const t: [number, number][] = [[3, 47], [4, 47]];
    expect(decimer(t)).toEqual(t);
  });
});

describe('urlPeages', () => {
  test('interroge barrier=toll_booth autour de la polyligne, bornée en temps', () => {
    const u = decodeURIComponent(urlPeages(trace(50)));
    expect(u).toContain('"barrier"="toll_booth"');
    expect(u).toContain(`around:${RAYON_PEAGE_M}`);
    expect(u).toContain('[timeout:25]');
    // Le miroir français, comme les commodités : cohérence de souveraineté.
    expect(u).toContain('overpass.openstreetmap.fr');
  });

  test('les coordonnées partent en lat,lon — l’ordre d’Overpass, pas le nôtre', () => {
    const u = decodeURIComponent(urlPeages([[3, 47], [4, 47.5]]));
    expect(u).toContain('47.00000,3.00000');
    expect(u).toContain('47.50000,4.00000');
  });
});

describe('versPeages', () => {
  const t = trace(101); // 1° de long ≈ 76 km

  test('les cabines d’une même barrière FONDENT en une gare', () => {
    /* Trois cabines côte à côte (une par voie) et une gare isolée plus loin :
       l'usager franchit DEUX péages, pas quatre. */
    const brut = { elements: [
      cabine(3.100, 47.0001),
      cabine(3.101, 47.0002, 'Gare de Fleury'),
      cabine(3.102, 47.0001),
      cabine(3.500, 47.0001, 'Gare de Nemours'),
    ] };
    const gares = versPeages(brut, t);
    expect(gares).toHaveLength(2);
    // Le premier nom déclaré du groupe l'emporte sur les cabines anonymes.
    expect(gares[0]!.nom).toBe('Gare de Fleury');
    expect(gares[1]!.nom).toBe('Gare de Nemours');
  });

  test('triées par avancement, avec leur kilométrage', () => {
    const brut = { elements: [
      cabine(3.500, 47.0001, 'Loin'),
      cabine(3.100, 47.0001, 'Proche'),
    ] };
    const gares = versPeages(brut, t);
    expect(gares.map((g) => g.nom)).toEqual(['Proche', 'Loin']);
    expect(gares[0]!.avancementM).toBeLessThan(gares[1]!.avancementM);
    // 0,1° ≈ 7,6 km à cette latitude : l'avancement est bien en mètres.
    expect(gares[0]!.avancementM).toBeGreaterThan(6000);
    expect(gares[0]!.avancementM).toBeLessThan(9000);
  });

  test('une cabine hors du rayon EXACT est écartée — la corde ne suffit pas', () => {
    // À ~1,1 km au nord du tracé : dans aucune gare honnête.
    const brut = { elements: [cabine(3.1, 47.01, 'Trop loin')] };
    expect(versPeages(brut, t)).toEqual([]);
  });

  test('sans nom déclaré, la gare existe quand même — anonyme, pas absente', () => {
    const gares = versPeages({ elements: [cabine(3.1, 47.0001)] }, t);
    expect(gares).toHaveLength(1);
    expect(gares[0]!.nom).toBeNull();
  });

  test('une réponse difforme rend une liste vide, jamais une exception', () => {
    expect(versPeages(null, t)).toEqual([]);
    expect(versPeages({}, t)).toEqual([]);
    expect(versPeages({ elements: [{ type: 'node' }, null, 42] }, t)).toEqual([]);
  });
});
