// Météo — choix de l'heure visée, traduction des codes OMM et bulletin
// français, purs et testés à sec. Fixtures au FORMAT RÉEL d'Open-Meteo
// (vérifié le 22/08/2026) : `hourly` en tableaux parallèles, heures locales
// sans fuseau.
import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  urlMeteo, versMeteo, phraseMeteo, libelleTemps, symboleTemps,
  heureArrivee, formaterHeure, meteoA, ECART_MAX_MINUTES, ErreurMeteo,
} from '../src/lib/meteo';

const REPONSE = {
  utc_offset_seconds: 7200, // Europe/Paris en été, comme le rend le service
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
    // 13 h 50 À PARIS = 11 h 50 UTC (décalage +2 h porté par la fixture).
    const m = versMeteo(REPONSE, new Date('2026-08-22T11:50:00Z'));
    expect(m.heure).toBe('2026-08-22T14:00');
    expect(m.temperature).toBe(23.8);
    expect(m.code).toBe(95);
    expect(m.ecartMinutes).toBe(10);
  });

  test('LE FUSEAU DU LIEU FAIT FOI, pas celui du navigateur', () => {
    // Même instant absolu, mais un service qui rend des heures d'un lieu à
    // UTC+11 (Nouméa) : la case retenue doit suivre le DÉCALAGE ANNONCÉ.
    // Sans cette prise en compte, on servait la nuit pour une arrivée de jour.
    const ailleurs = { ...REPONSE, utc_offset_seconds: 39_600 };
    const m = versMeteo(ailleurs, new Date('2026-08-22T03:00:00Z')); // 14 h là-bas
    expect(m.heure).toBe('2026-08-22T14:00');
    expect(m.decalageLieu).toBe(39_600);
    // Le même instant, lu avec le décalage de Paris, tomberait ailleurs :
    expect(versMeteo(REPONSE, new Date('2026-08-22T03:00:00Z')).heure).not.toBe('2026-08-22T14:00');
  });

  test('une arrivée avant la première heure disponible prend la première', () => {
    const m = versMeteo(REPONSE, new Date('2026-08-22T04:00:00Z'));
    expect(m.heure).toBe('2026-08-22T12:00');
  });

  test('UNE ARRIVÉE HORS HORIZON se signale par un écart énorme (elle ne se déguise plus)', () => {
    // Trajet de plusieurs jours : la dernière case connue ne décrit RIEN de
    // l'arrivée. versMeteo la rend quand même, mais l'écart le dit — et
    // l'appelant refuse d'afficher au-delà de ECART_MAX_MINUTES.
    const m = versMeteo(REPONSE, new Date('2026-08-30T09:00:00Z'));
    expect(m.heure).toBe('2026-08-22T15:00');
    expect(m.ecartMinutes).toBeGreaterThan(ECART_MAX_MINUTES);
    expect(m.ecartMinutes).toBeGreaterThan(7 * 24 * 60);
  });

  test('refuse une réponse sans prévision, en français', () => {
    expect(() => versMeteo({}, new Date())).toThrow(ErreurMeteo);
    expect(() => versMeteo({ hourly: { time: [] } }, new Date())).toThrow('exploitable');
    // Heures présentes mais valeurs absentes : on ne fabrique pas un bulletin.
    expect(() => versMeteo({ hourly: { time: ['2026-08-22T12:00'] } }, new Date()))
      .toThrow(ErreurMeteo);
  });

  test('des champs secondaires manquants valent zéro, sans faire échouer', () => {
    const m = versMeteo({ utc_offset_seconds: 0, hourly: {
      time: ['2026-08-22T12:00'], temperature_2m: [17], weather_code: [3],
    } }, new Date('2026-08-22T12:00:00Z'));
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

  test('se formate à la française DANS LE FUSEAU DU LIEU', () => {
    const instant = new Date('2026-08-22T12:05:00Z');
    expect(formaterHeure(instant, 7200)).toBe('14 h 05');   // Paris, été
    expect(formaterHeure(instant, 39_600)).toBe('23 h 05'); // Nouméa
    expect(formaterHeure(instant, 0)).toBe('12 h 05');      // UTC
  });

  test('dit le JOUR quand l’arrivée n’est pas pour aujourd’hui', () => {
    const maintenant = new Date('2026-08-22T10:00:00Z');
    const dansDeuxHeures = new Date('2026-08-22T12:00:00Z');
    const demain = new Date('2026-08-23T12:00:00Z');
    const dansTroisJours = new Date('2026-08-25T12:00:00Z');
    const dansDixJours = new Date('2026-09-01T12:00:00Z');
    expect(formaterHeure(dansDeuxHeures, 7200, maintenant)).toBe('14 h 00');
    expect(formaterHeure(demain, 7200, maintenant)).toBe('demain 14 h 00');
    expect(formaterHeure(dansTroisJours, 7200, maintenant)).toBe('mardi 14 h 00');
    expect(formaterHeure(dansDixJours, 7200, maintenant)).toContain('dans 10 jours');
  });
});

describe('meteoA (fetch simulé)', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  test('une panne se rejoue UNE fois, un double échec parle français', async () => {
    const f = vi.fn()
      .mockRejectedValueOnce(new TypeError('failed to fetch'))
      .mockResolvedValueOnce(new Response(JSON.stringify(REPONSE), { status: 200 }));
    vi.stubGlobal('fetch', f);
    expect((await meteoA(4.8, 45.7, new Date('2026-08-22T12:00:00Z'))).temperature).toBe(23.8);
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
    await expect(meteoA(4.8, 45.7, new Date('2026-08-22T10:00:00Z'))).resolves.toBeTruthy();
    expect(g).toHaveBeenCalledTimes(2);
  });
});
