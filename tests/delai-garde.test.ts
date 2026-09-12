// Délai de garde sur un service lent (ALTI-GARDE-1, 12/09/2026) — la
// réponse tardive simulée ne doit JAMAIS retarder l'appelant au-delà du
// délai de garde, et ne doit jamais devenir un rejet non géré.
import {
  describe, it, expect, vi, beforeEach, afterEach,
} from 'vitest';
import { avecDelaiDeGarde } from '../src/lib/delai-garde';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('avecDelaiDeGarde', () => {
  it('rend la valeur si le service répond avant le délai', async () => {
    const rapide = new Promise<string>((resolve) => {
      setTimeout(() => resolve('altitude'), 500);
    });
    const p = avecDelaiDeGarde(rapide, 2000);
    await vi.advanceTimersByTimeAsync(500);
    await expect(p).resolves.toBe('altitude');
  });

  it('rend undefined dès le délai, SANS attendre le service lent — le point du mandat du 12/09 : le plan ne se calcule jamais au-delà du délai de garde', async () => {
    // Service simulé aussi lent que la pire mesure de la contre-mesure (7 s).
    const lent = new Promise<string>((resolve) => {
      setTimeout(() => resolve('altitude tardive'), 7000);
    });
    const p = avecDelaiDeGarde(lent, 2000);
    let tranche = false;
    void p.then(() => { tranche = true; });

    await vi.advanceTimersByTimeAsync(1999);
    expect(tranche).toBe(false); // pas encore : le délai n'est pas écoulé

    await vi.advanceTimersByTimeAsync(2); // franchit les 2000 ms
    expect(tranche).toBe(true);
    await expect(p).resolves.toBeUndefined();

    // La promesse tardive aboutit ensuite (5 s plus tard) sans effet observable :
    // aucune relance, aucun deuxième appel — voir le module.
    await vi.advanceTimersByTimeAsync(5000);
  });

  it('rend undefined si le service échoue avant le délai, sans jamais rejeter', async () => {
    const echoue = Promise.reject(new Error('service indisponible'));
    // Le test échouerait avec un rejet non géré si avecDelaiDeGarde le laissait fuiter.
    await expect(avecDelaiDeGarde(echoue, 2000)).resolves.toBeUndefined();
  });

  it('rend undefined si le service échoue APRÈS que le délai a déjà tranché, sans rejet non géré', async () => {
    let rejeter: (e: unknown) => void = () => {};
    const tardEnErreur = new Promise<string>((_resolve, reject) => { rejeter = reject; });
    const p = avecDelaiDeGarde(tardEnErreur, 2000);
    await vi.advanceTimersByTimeAsync(2000);
    await expect(p).resolves.toBeUndefined();
    // L'échec arrive après coup : ne doit rien faire fuiter (pas d'unhandled rejection).
    rejeter(new Error('trop tard'));
    await vi.advanceTimersByTimeAsync(0);
  });
});
