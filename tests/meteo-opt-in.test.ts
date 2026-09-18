// La garde de meteoA (mission C24, 18/09/2026) : par défaut, AUCUN appel
// réseau vers Open-Meteo. L'usager doit l'avoir activée lui-même pour que
// meteoA interroge le service. Témoin négatif dans le même fichier :
// préférence activée, l'appel part bien — une suite qui ne sait que
// refuser ne prouve rien.
import { afterEach, describe, expect, test, vi } from 'vitest';
import { meteoA, ErreurMeteo, ErreurMeteoDesactivee, invaliderCacheMeteoExterne } from '../src/lib/meteo';

const REPONSE = {
  utc_offset_seconds: 7200,
  hourly: {
    time: ['2026-08-22T12:00', '2026-08-22T13:00'],
    temperature_2m: [19.4, 21.2],
    precipitation: [0, 0.4],
    weather_code: [2, 61],
    wind_speed_10m: [8, 14],
  },
};

describe('meteoA — préférence meteo-externe', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  test('DÉSACTIVÉE (par défaut) : aucune requête réseau', async () => {
    invaliderCacheMeteoExterne(false);
    const f = vi.fn(async () => new Response(JSON.stringify(REPONSE), { status: 200 }));
    vi.stubGlobal('fetch', f);

    await expect(meteoA(4.8, 45.7, new Date('2026-08-22T12:00:00Z')))
      .rejects.toThrow(ErreurMeteoDesactivee);
    expect(f).toHaveBeenCalledTimes(0);
  });

  test('l’erreur de désactivation reste une ErreurMeteo (les appelants l’absorbent déjà)', async () => {
    invaliderCacheMeteoExterne(false);
    vi.stubGlobal('fetch', vi.fn());
    await expect(meteoA(4.8, 45.7, new Date())).rejects.toThrow(ErreurMeteo);
  });

  // TÉMOIN NÉGATIF : la même suite sait aussi verdir. Sans lui, la garde
  // pourrait bloquer TOUT appel, activé ou non, sans que rien ne le révèle.
  test('ACTIVÉE : l’appel part bien, une seule fois', async () => {
    invaliderCacheMeteoExterne(true);
    const f = vi.fn(async () => new Response(JSON.stringify(REPONSE), { status: 200 }));
    vi.stubGlobal('fetch', f);

    const m = await meteoA(4.8, 45.7, new Date('2026-08-22T12:00:00Z'));
    expect(Number.isFinite(m.temperature)).toBe(true);
    expect(f).toHaveBeenCalledTimes(1);
  });
});

describe('invaliderCacheMeteoExterne', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  test('l’activation depuis le panneau prend effet IMMÉDIATEMENT, sans rechargement', async () => {
    invaliderCacheMeteoExterne(false);
    const f = vi.fn(async () => new Response(JSON.stringify(REPONSE), { status: 200 }));
    vi.stubGlobal('fetch', f);

    await expect(meteoA(4.8, 45.7, new Date())).rejects.toThrow(ErreurMeteoDesactivee);
    invaliderCacheMeteoExterne(true); // ce que fait le panneau à la confirmation
    await expect(meteoA(4.8, 45.7, new Date('2026-08-22T12:00:00Z'))).resolves.toBeTruthy();
    expect(f).toHaveBeenCalledTimes(1);
  });
});
