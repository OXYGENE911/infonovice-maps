// Signaler la lenteur d'un appel obligatoire (ITI-LENT-1, 12/09/2026) — la
// réponse tardive simulée ne doit jamais changer ce que l'appelant reçoit,
// et les deux seuils doivent se déclencher à l'heure, ni avant ni après.
import {
  describe, it, expect, vi, beforeEach, afterEach,
} from 'vitest';
import { signalerLenteur } from '../src/lib/service-lent';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('signalerLenteur', () => {
  it('ne déclenche rien et rend la valeur si le service répond avant le premier seuil', async () => {
    const rapide = new Promise<string>((resolve) => { setTimeout(() => resolve('itinéraire'), 300); });
    const surLenteur = vi.fn();
    const surAbandon = vi.fn();
    const p = signalerLenteur(rapide, { lent: 2500, abandon: 15000 }, { surLenteur, surAbandon });
    await vi.advanceTimersByTimeAsync(300);
    await expect(p).resolves.toBe('itinéraire');
    // Les deux minuteurs sont annulés dès la résolution : on avance large,
    // rien ne doit se déclencher après coup.
    await vi.advanceTimersByTimeAsync(20000);
    expect(surLenteur).not.toHaveBeenCalled();
    expect(surAbandon).not.toHaveBeenCalled();
  });

  it('scénario « ralenti à 3 s » du mandat : le premier seuil (2,5 s) prévient, le second (15 s) ne se déclenche jamais, et le résultat sert normalement', async () => {
    const troisSecondes = new Promise<string>((resolve) => { setTimeout(() => resolve('itinéraire'), 3000); });
    const surLenteur = vi.fn();
    const surAbandon = vi.fn();
    const p = signalerLenteur(
      troisSecondes, { lent: 2500, abandon: 15000 }, { surLenteur, surAbandon },
    );

    await vi.advanceTimersByTimeAsync(2499);
    expect(surLenteur).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(2); // franchit 2 500 ms
    expect(surLenteur).toHaveBeenCalledTimes(1);
    expect(surAbandon).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(600); // t=3101 ms : le service a répondu
    await expect(p).resolves.toBe('itinéraire');
    expect(surAbandon).not.toHaveBeenCalled(); // jamais atteint : résolu avant 15 s
  });

  it('scénario « ralenti à 20 s » du mandat : les deux seuils se déclenchent, et la valeur tardive sert quand même — rien n\'est jeté', async () => {
    const vingtSecondes = new Promise<string>((resolve) => { setTimeout(() => resolve('itinéraire tardif'), 20000); });
    const surLenteur = vi.fn();
    const surAbandon = vi.fn();
    const p = signalerLenteur(
      vingtSecondes, { lent: 2500, abandon: 15000 }, { surLenteur, surAbandon },
    );

    await vi.advanceTimersByTimeAsync(2500);
    expect(surLenteur).toHaveBeenCalledTimes(1);
    expect(surAbandon).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(12500); // t = 15 000 ms
    expect(surAbandon).toHaveBeenCalledTimes(1);

    // L'ABANDON EST UN AFFICHAGE, PAS UNE ANNULATION : la promesse d'origine
    // continue de vivre et sa valeur, quand elle arrive, n'est PAS jetée.
    await vi.advanceTimersByTimeAsync(5000); // t = 20 000 ms : le service répond enfin
    await expect(p).resolves.toBe('itinéraire tardif');
    // Aucun appel de plus qu'un seul déclenchement par seuil.
    expect(surLenteur).toHaveBeenCalledTimes(1);
    expect(surAbandon).toHaveBeenCalledTimes(1);
  });

  it('rend le rejet inchangé si le service échoue, et n\'appelle plus les actions après coup', async () => {
    let rejeter: (e: unknown) => void = () => {};
    const echoueTard = new Promise<string>((_resolve, reject) => { rejeter = reject; });
    const surLenteur = vi.fn();
    const surAbandon = vi.fn();
    const p = signalerLenteur(
      echoueTard, { lent: 2500, abandon: 15000 }, { surLenteur, surAbandon },
    );
    await vi.advanceTimersByTimeAsync(2500);
    expect(surLenteur).toHaveBeenCalledTimes(1);
    rejeter(new Error('service indisponible'));
    await expect(p).rejects.toThrow('service indisponible');
    await vi.advanceTimersByTimeAsync(20000);
    expect(surAbandon).not.toHaveBeenCalled(); // annulé par le rejet, comme le succès
  });
});
