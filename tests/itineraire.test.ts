// Le calcul d'itinéraire : transformation pure, formats français, résilience.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { versItineraire, calculerItineraire, formaterDistance, formaterDuree, ErreurItineraire } from '../src/lib/itineraire';

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
