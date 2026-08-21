// Météo — choix de l'heure visée, traduction des codes OMM et bulletin
// français, purs et testés à sec. Fixtures au FORMAT RÉEL d'Open-Meteo
// (vérifié le 22/08/2026) : `hourly` en tableaux parallèles, heures locales
// sans fuseau.
import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  urlMeteo, versMeteo, phraseMeteo, libelleTemps, symboleTemps,
  heureArrivee, formaterHeure, meteoA, ErreurMeteo,
} from '../src/lib/meteo';

const REPONSE = {
  hourly: {
    time: ['2026-08-22T12:00', '2026-08-22T13:00', '2026-08-22T14:00', '2026-08-22T15:00'],
    temperature_2m: [19.4, 21.2, 23.8, 24.1],
    precipitation: [0, 0.4, 1.8, 0],
    weather_code: [2, 61, 95, 3],
    wind_speed_10m: [8, 14, 32, 11],
  },
};

describe('urlMeteo', () => {
  test('demande les prévisions horaires dans le fuseau du LIEU', () => {
    const u = new URL(urlMeteo(4.8357, 45.764));
    expect(u.host).toBe('api.open-meteo.com');
    expect(u.searchParams.get('latitude')).toBe('45.7640');
    expect(u.searchParams.get('longitude')).toBe('4.8357');
    expect(u.searchParams.get('timezone')).toBe('auto');
    expect(u.searchParams.get('hourly')).toContain('temperature_2m');
    expect(u.searchParams.get('hourly')).toContain('weather_code');
  });
});

describe('versMeteo', () => {
  test('choisit l’heure la PLUS PROCHE de l’arrivée, pas la première', () => {
    const m = versMeteo(REPONSE, new Date('2026-08-22T13:50'));
    expect(m.heure).toBe('2026-08-22T14:00');
    expect(m.temperature).toBe(23.8);
    expect(m.code).toBe(95);
  });

  test('une arrivée avant la première heure disponible prend la première', () => {
    const m = versMeteo(REPONSE, new Date('2026-08-22T06:00'));
    expect(m.heure).toBe('2026-08-22T12:00');
  });

  test('une arrivée au-delà de la prévision prend la dernière heure connue', () => {
    const m = versMeteo(REPONSE, new Date('2026-08-30T09:00'));
    expect(m.heure).toBe('2026-08-22T15:00');
  });

  test('refuse une réponse sans prévision, en français', () => {
    expect(() => versMeteo({}, new Date())).toThrow(ErreurMeteo);
    expect(() => versMeteo({ hourly: { time: [] } }, new Date())).toThrow('exploitable');
    // Heures présentes mais valeurs absentes : on ne fabrique pas un bulletin.
    expect(() => versMeteo({ hourly: { time: ['2026-08-22T12:00'] } }, new Date()))
      .toThrow(ErreurMeteo);
  });

  test('des champs secondaires manquants valent zéro, sans faire échouer', () => {
    const m = versMeteo({ hourly: {
      time: ['2026-08-22T12:00'], temperature_2m: [17], weather_code: [3],
    } }, new Date('2026-08-22T12:00'));
    expect(m.pluie).toBe(0);
    expect(m.ventKmh).toBe(0);
  });
});

describe('libellés et bulletin', () => {
  test('les codes OMM courants ont tous un libellé français', () => {
    for (const code of [0, 1, 2, 3, 45, 51, 61, 63, 65, 71, 80, 81, 95, 99]) {
      expect(libelleTemps(code), `code ${code}`).not.toBe('temps indéterminé');
    }
  });

  test('un code inconnu ne casse pas le bulletin', () => {
    expect(libelleTemps(1234)).toBe('temps indéterminé');
    expect(symboleTemps(1234)).toBe('·');
  });

  test('le bulletin ne mentionne pluie et vent QUE s’ils comptent', () => {
    expect(phraseMeteo({ heure: '', temperature: 23.8, pluie: 1.8, ventKmh: 32, code: 95 }))
      .toBe('24 °C · orage · 1,8 mm de pluie · vent 32 km/h');
    // Bruine négligeable et brise : le bulletin reste court.
    expect(phraseMeteo({ heure: '', temperature: 19.4, pluie: 0.1, ventKmh: 8, code: 2 }))
      .toBe('19 °C · partiellement nuageux');
  });
});

describe('heure d’arrivée', () => {
  test('ajoute la durée du trajet à l’instant du calcul', () => {
    const depart = new Date('2026-08-22T10:00:00');
    expect(heureArrivee(4 * 3600 + 46 * 60, depart).getHours()).toBe(14);
    expect(heureArrivee(4 * 3600 + 46 * 60, depart).getMinutes()).toBe(46);
  });

  test('se formate à la française, minutes sur deux chiffres', () => {
    expect(formaterHeure(new Date('2026-08-22T14:05:00'))).toBe('14 h 05');
    expect(formaterHeure(new Date('2026-08-22T09:30:00'))).toBe('9 h 30');
  });
});

describe('meteoA (fetch simulé)', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  test('une panne se rejoue UNE fois, un double échec parle français', async () => {
    const f = vi.fn()
      .mockRejectedValueOnce(new TypeError('failed to fetch'))
      .mockResolvedValueOnce(new Response(JSON.stringify(REPONSE), { status: 200 }));
    vi.stubGlobal('fetch', f);
    expect((await meteoA(4.8, 45.7, new Date('2026-08-22T14:00'))).temperature).toBe(23.8);
    expect(f).toHaveBeenCalledTimes(2);

    const g = vi.fn(async () => { throw new TypeError('failed to fetch'); });
    vi.stubGlobal('fetch', g);
    await expect(meteoA(4.8, 45.7, new Date())).rejects.toThrow('momentanément indisponible');
  });

  test('un 4xx ne se rejoue pas ; un 5xx si', async () => {
    const f = vi.fn(async () => new Response('', { status: 400 }));
    vi.stubGlobal('fetch', f);
    await expect(meteoA(4.8, 45.7, new Date())).rejects.toThrow('réponse 400');
    expect(f).toHaveBeenCalledTimes(1);

    const g = vi.fn()
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(REPONSE), { status: 200 }));
    vi.stubGlobal('fetch', g);
    await expect(meteoA(4.8, 45.7, new Date('2026-08-22T12:00'))).resolves.toBeTruthy();
    expect(g).toHaveBeenCalledTimes(2);
  });
});
