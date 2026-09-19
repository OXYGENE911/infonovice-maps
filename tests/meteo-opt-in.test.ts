// La garde de meteoA (mission C24, 18/09/2026) : par défaut, AUCUN appel
// réseau vers Open-Meteo. L'usager doit l'avoir activée lui-même pour que
// meteoA interroge le service. Témoin négatif dans le même fichier :
// préférence activée, l'appel part bien — une suite qui ne sait que
// refuser ne prouve rien.
import { readFileSync } from 'node:fs';
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

/* LES CINQ SITES D'APPEL DE meteoA (C26, 19/09/2026 — Alerte
   recaREU3B9yCg7SnM), ET CE QUI EST AFFICHÉ À CHACUN QUAND LA PRÉFÉRENCE EST
   DÉSACTIVÉE — pas seulement le fait que meteoA a été appelée.

   TESTS SOURCE, ET NON DOM : bandeau-guidage.ts, panneau-itineraire.ts et
   panneau-vehicule.ts définissent des éléments personnalisés et importent
   `Marker` de maplibre-gl en valeur (pas seulement en type). Ce dépôt n'a
   pas de dépendance jsdom — decoupage-demarrage.test.ts et
   iti-lent-seuils.test.ts évitent déjà d'exécuter ces mêmes fichiers pour
   cette raison, en lisant le source et en ancrant des assertions sur le
   littéral exact plutôt que sur un DOM rendu. Ajouter jsdom aurait résolu
   le problème autrement, mais modifier une dépendance est interdit à cette
   mission (mandat du 16/09, §5.4) : chaque assertion ci-dessous porte donc
   sur le texte littéral qui DEVIENT l'affichage (le `textContent` assigné,
   ou le corps du `catch` qui décide ce qui reste absent), ancrée assez
   précisément pour rougir si ce littéral disparaît ou change de sens. */

// `\r\n` normalisé : ce dépôt est cloné en CRLF sous Windows, et les
// littéraux ci-dessous sont écrits en `\n` — sans quoi `toContain` ne
// trouverait jamais rien, quel que soit le contenu réel du fichier.
const versLF = (s: string): string => s.replace(/\r\n/g, '\n');
const BANDEAU = versLF(readFileSync(new URL('../src/carte/bandeau-guidage.ts', import.meta.url), 'utf-8'));
const PANNEAU_ITINERAIRE = versLF(readFileSync(new URL('../src/carte/panneau-itineraire.ts', import.meta.url), 'utf-8'));
const PANNEAU_VEHICULE = versLF(readFileSync(new URL('../src/carte/panneau-vehicule.ts', import.meta.url), 'utf-8'));

describe('les cinq sites d’appel de meteoA — ce qui est affiché quand la préférence est désactivée', () => {
  test('bandeau-guidage:3608 — le paragraphe affiche le texte positif exact, jamais un blanc', () => {
    const debutAppel = BANDEAU.indexOf('meteoA(destination[0], destination[1], vise).then(');
    expect(debutAppel, 'le site d’appel meteoA(destination…) a disparu ou a été déplacé').toBeGreaterThan(-1);
    const finGestionnaire = BANDEAU.indexOf('corps.append(meteo);', debutAppel);
    const gestionnaire = BANDEAU.slice(debutAppel, finGestionnaire);

    expect(BANDEAU, 'ErreurMeteoDesactivee doit être importée depuis lib/meteo')
      .toMatch(/^import \{ meteoA, phraseMeteo, ECART_MAX_MINUTES, ErreurMeteo, ErreurMeteoDesactivee \} from '\.\.\/lib\/meteo';$/m);
    // La classe, jamais la vacuité du message : le message est vide par construction.
    expect(gestionnaire, 'la distinction doit porter sur `instanceof ErreurMeteoDesactivee`')
      .toMatch(/err instanceof ErreurMeteoDesactivee/);
    expect(gestionnaire, "err.message === '' mentirait le jour où une autre erreur naîtrait vide")
      .not.toMatch(/err\.message\s*===\s*''/);
    expect(gestionnaire, 'le texte doit être celui-ci, mot pour mot — tiret cadratin et chevron compris')
      .toContain("? 'Météo non activée — à activer dans Réglages › Météo.'");
    // Les deux autres cas (ErreurMeteo, tout le reste) restent inchangés.
    expect(gestionnaire, 'le repli ErreurMeteo / « Météo indisponible. » a été modifié')
      .toMatch(/: err instanceof ErreurMeteo\s*\n\s*\? err\.message : 'Météo indisponible\.';/);
  });

  test('bandeau-guidage:2021 — #temperatureALArrivee rend null, sans jamais lever', () => {
    expect(BANDEAU, '#temperatureALArrivee a disparu ou a changé de signature')
      .toContain('async #temperatureALArrivee(d: PointGeo | null): Promise<number | null> {');
    expect(BANDEAU, 'le rejet (ErreurMeteoDesactivee comme tout le reste) doit rester absorbé par un catch muet qui rend null')
      .toContain(
        '    try {\n'
        + '      const m = await meteoA(d.lon, d.lat, new Date());\n'
        + '      return Number.isFinite(m.temperature) ? m.temperature : null;\n'
        + '    } catch {\n'
        + '      return null;\n'
        + '    }',
      );
  });

  test('panneau-itineraire:2066 — conditions.tempDepartC reste undefined, sans jamais lever', () => {
    expect(PANNEAU_ITINERAIRE, 'le site d’appel meteoA(pDep…) a disparu ou a été déplacé')
      .toContain(
        '      pDep\n'
        + '        ? meteoA(pDep[0]!, pDep[1]!, maintenant, signal)\n'
        + '          .then((m) => { conditions.tempDepartC = m.temperature; })\n'
        + '          .catch(() => { /* le plan vivra à 20 °C, et le dira */ })\n'
        + '        : Promise.resolve(),',
      );
  });

  test('panneau-itineraire:2071 — conditions.tempArriveeC reste undefined, sans jamais lever', () => {
    expect(PANNEAU_ITINERAIRE, 'le site d’appel meteoA(pArr…) a disparu ou a été déplacé')
      .toContain(
        '      pArr\n'
        + '        ? meteoA(pArr[0]!, pArr[1]!, arriveeEstimee, signal)\n'
        + '          .then((m) => { conditions.tempArriveeC = m.temperature; })\n'
        + '          .catch(() => { /* idem */ })\n'
        + '        : Promise.resolve(),',
      );
  });

  test('panneau-vehicule:87 — le rayon d’action affiché reste celui de la référence, sans jamais lever', () => {
    expect(PANNEAU_VEHICULE, '#celsius doit rester la référence (null) par défaut')
      .toContain('#celsius: number | null = null;');
    expect(PANNEAU_VEHICULE, 'le site d’appel meteoA(p.lon, p.lat…) a disparu, ou son catch ne retombe plus silencieusement sur la référence')
      .toContain(
        '    void meteoA(p.lon, p.lat, new Date())\n'
        + '      .then((m) => {\n'
        + '        if (!Number.isFinite(m.temperature)) return;\n'
        + '        this.#celsius = m.temperature;\n'
        + '        this.#bilan();\n'
        + '        if (this.#actif) this.#poser();\n'
        + '      })\n'
        + "      .catch(() => { /* sans météo, la référence — c'est le comportement d'avant */ });",
      );
  });
});
