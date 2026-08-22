// Le contrat entre le style de la carte et le cache du service worker.
//
// Ces tests existent parce que la panne serait SILENCIEUSE : si un motif ne
// reconnaît plus l'URL que `urlTuiles()` fabrique, le service worker
// s'installe sans broncher, aucune tuile n'entre en cache, et le mode hors
// ligne montre une carte vide. Aucune erreur, aucun test d'interface rouge —
// le canvas s'affiche même sans une seule tuile. D'où ces assertions-ci.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { JOURS_EN_CACHE, RESERVES_TUILES } from '../src/lib/tuiles-en-cache';
import { urlTuiles } from '../src/carte/style-ign';

describe('réserves de tuiles', () => {
  it('reconnaît l’URL réellement fabriquée pour sa couche', () => {
    for (const reserve of RESERVES_TUILES) {
      const url = urlTuiles(reserve.couche, reserve.format)
        .replace('{z}', '13').replace('{y}', '2989').replace('{x}', '4241');
      expect(reserve.motif.test(url), `${reserve.couche} non reconnue`).toBe(true);
    }
  });

  it('ne reconnaît QUE sa couche', () => {
    for (const reserve of RESERVES_TUILES) {
      for (const autre of RESERVES_TUILES) {
        if (autre.couche === reserve.couche) continue;
        const url = urlTuiles(autre.couche, autre.format);
        expect(reserve.motif.test(url), `${reserve.cache} attrape ${autre.couche}`).toBe(false);
      }
    }
  });

  it('est ancrée sur l’origine — workbox ignore un motif qui ne l’est pas', () => {
    // Une correspondance qui ne démarre pas au premier caractère est écartée
    // par workbox pour les requêtes d'un autre domaine : le cache serait mort
    // sans que rien ne le signale.
    for (const reserve of RESERVES_TUILES) {
      // `source` échappe les barres obliques : /^https:\/\/data\.geopf\.fr\//
      expect(reserve.motif.source.startsWith('^https:\\/\\/data\\.geopf\\.fr\\/')).toBe(true);
      const detourne = `https://exemple.test/relais?cible=${encodeURIComponent(
        urlTuiles(reserve.couche, reserve.format),
      )}`;
      expect(reserve.motif.test(detourne)).toBe(false);
    }
  });

  it('donne un cache distinct et un plafond borné à chaque couche', () => {
    const noms = RESERVES_TUILES.map((r) => r.cache);
    expect(new Set(noms).size).toBe(noms.length);
    for (const reserve of RESERVES_TUILES) {
      expect(reserve.tuiles).toBeGreaterThan(0);
      expect(reserve.tuiles).toBeLessThanOrEqual(400);
    }
  });

  it('reste en deçà des 21 jours annoncés par le serveur IGN', () => {
    // `Cache-Control: private, max-age=1814400` relevé le 22/08/2026.
    expect(JOURS_EN_CACHE).toBeLessThan(1814400 / 86400);
  });

  it('couvre toutes les couches que le style peut demander', () => {
    // Le garde-fou inverse : une couche ajoutée au style sans réserve ne
    // serait jamais mise en cache, et le hors ligne mentirait sur ce fond-là.
    const declarees = new Set(RESERVES_TUILES.map((r) => r.couche));
    const source = readFileSync(
      new URL('../src/carte/style-ign.ts', import.meta.url), 'utf8',
    );
    const employees = [...source.matchAll(/urlTuiles\('([^']+)'/g)].map((m) => m[1]!);
    expect(employees.length).toBeGreaterThan(0);
    for (const couche of employees) expect(declarees.has(couche)).toBe(true);
  });
});
