// Le calcul d'itinéraire : transformation pure, formats français, résilience.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { versItineraire, calculerItineraire, formaterDistance, formaterDuree, ErreurItineraire, urlItineraire } from '../src/lib/itineraire';

const REPONSE = {
  geometry: { type: 'LineString', coordinates: [[2.33, 48.85], [2.35, 48.86]] },
  distance: 2450.7, duration: 512,
};

afterEach(() => vi.restoreAllMocks());

describe('versItineraire', () => {
  it('extrait tracé, distance et durée', () => {
    const i = versItineraire(REPONSE);
    expect(i.geometrie.coordinates).toHaveLength(2);
    expect(i.distance).toBeCloseTo(2450.7);
    expect(i.duree).toBe(512);
  });
  it('refuse un tracé absent ou dégénéré plutôt que de dessiner du vide', () => {
    for (const brut of [null, {}, { geometry: { type: 'LineString', coordinates: [[2, 48]] } },
      { geometry: { type: 'Point', coordinates: [2, 48] } }]) {
      expect(() => versItineraire(brut)).toThrow(ErreurItineraire);
    }
  });
});

describe('formats français', () => {
  it('distance : mètres, virgule sous 10 km, entier au-delà', () => {
    expect(formaterDistance(842)).toBe('842 m');
    expect(formaterDistance(2450.7)).toBe('2,5 km');
    expect(formaterDistance(128_400)).toBe('128 km');
  });
  it('durée : minutes, puis heures à la française', () => {
    expect(formaterDuree(30)).toBe('moins d’une minute');
    expect(formaterDuree(512)).toBe('9 min');
    expect(formaterDuree(3900)).toBe('1 h 05');
    expect(formaterDuree(7200)).toBe('2 h');
  });
});

describe('calculerItineraire', () => {
  it('un 404 dit « aucun itinéraire », SANS seconde tentative — c’est une réponse, pas une panne', async () => {
    const espion = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 404 }));
    await expect(calculerItineraire({ lon: 0, lat: 0 }, { lon: 1, lat: 1 }, 'car'))
      .rejects.toThrow(/Aucun itinéraire/);
    expect(espion).toHaveBeenCalledTimes(1);
  });
  it('une panne réseau se rejoue UNE fois puis parle français', async () => {
    const espion = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('réseau'));
    await expect(calculerItineraire({ lon: 0, lat: 0 }, { lon: 1, lat: 1 }, 'car'))
      .rejects.toThrow(/momentanément indisponible/);
    expect(espion).toHaveBeenCalledTimes(2);
  });
  it('l’URL porte le profil, le moteur vérifié et le format GeoJSON', async () => {
    const espion = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(REPONSE), { status: 200 }));
    await calculerItineraire({ lon: 2.33, lat: 48.85 }, { lon: 2.35, lat: 48.86 }, 'pedestrian');
    const url = String(espion.mock.calls[0]?.[0]);
    expect(url).toContain('resource=bdtopo-osrm');
    expect(url).toContain('profile=pedestrian');
    expect(url).toContain('start=2.33,48.85');
    expect(url).toContain('geometryFormat=geojson');
  });
});

describe('urlItineraire', () => {
  const A = { lon: 2.3522, lat: 48.8566 };
  const B = { lon: 4.8357, lat: 45.764 };

  it('sans options : la même URL qu’avant la PR #6 — aucune régression', () => {
    const u = urlItineraire(A, B, 'car');
    expect(u).toContain('resource=bdtopo-osrm');
    expect(u).toContain('start=2.3522,48.8566');
    expect(u).toContain('end=4.8357,45.764');
    expect(u).not.toContain('intermediates');
    expect(u).not.toContain('constraints');
    expect(u).not.toContain('getSteps');
  });

  it('étapes intermédiaires jointes par |, dans l’ordre du trajet', () => {
    const u = urlItineraire(A, B, 'car', { etapes: [{ lon: 5.0415, lat: 47.322 }, { lon: 4.0, lat: 46.0 }] });
    expect(u).toContain('intermediates=5.0415,47.322|4,46');
  });

  it('contraintes en JSON banni waytype, jointes par | et encodées (vérifié 21/08 : le paramètre répété rend 500)', () => {
    const u = urlItineraire(A, B, 'car', { eviter: ['autoroute', 'tunnel'] });
    const brut = decodeURIComponent(u.split('constraints=')[1]!);
    expect(brut).toBe('{"constraintType":"banned","key":"waytype","operator":"=","value":"autoroute"}'
      + '|{"constraintType":"banned","key":"waytype","operator":"=","value":"tunnel"}');
    expect(u.split('constraints=')).toHaveLength(2);
  });

  it('la forme feuille de route ajoute getSteps et waysAttributes', () => {
    const u = urlItineraire(A, B, 'pedestrian', {}, true);
    expect(u).toContain('profile=pedestrian');
    expect(u).toContain('getSteps=true');
    expect(u).toContain('waysAttributes=name');
  });
});
