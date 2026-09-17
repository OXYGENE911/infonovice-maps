// Contre-épreuve du critère n° 1 (mission C21, 17/09/2026) : les TROIS
// appels tiers du calcul (itinéraire IGN, altimétrie, commodités) doivent
// CHACUN rendre la main sous leur propre délai de garde, même muets, pour
// que le calcul d'itinéraire reste sous le plafond de 10 000 ms.
//
// PIRE CAS MESURÉS (avant / après cette mission) :
//   Itinéraire IGN : 8000+500+8000 = 16 500 ms → 4000+500+4000 = 8 500 ms
//   Altimétrie     : déjà gardée (ALTI-GARDE-1) →   2 000 ms (inchangé)
//   Commodités     : 15 000 ms (aucun garde au clic) → 4 000 ms (minuteur seul :
//     cet appel part au clic sur une borne, hors du chemin du calcul —
//     voir le handoff du 17/09/2026)
//
// Horloge RÉELLE, pas simulée : sondé le 17/09/2026, `vi.useFakeTimers()` ne
// fait PAS avancer `AbortSignal.timeout`, qui pose son minuteur via l'API
// interne des timers Node plutôt que le `setTimeout` global que Vitest
// patche — la garde de ce fait n'aurait rien gardé. D'où les délais de test
// généreux ci-dessous plutôt qu'un `vi.advanceTimersByTimeAsync`.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { calculerItineraire, ErreurItineraire } from '../src/lib/itineraire';
import { profilItineraire } from '../src/lib/altimetrie';
import { avecDelaiDeGarde } from '../src/lib/delai-garde';
import { chargerCommodites, ErreurCommodites } from '../src/lib/commodites';

afterEach(() => vi.restoreAllMocks());

/** Un service qui ne répond JAMAIS de lui-même : seul l'abandon du signal
    (notre propre délai de garde) le fait céder — comme un vrai réseau lent
    coupé par `AbortSignal.timeout`, jamais par le service qui « finirait
    par répondre ». */
function fetchMuetGuardeParLeSignal(): typeof fetch {
  return (async (_input: unknown, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
    const signal = init?.signal;
    const rejeter = (): void => reject(new DOMException('Muet — délai dépassé', 'AbortError'));
    if (signal?.aborted) { rejeter(); return; }
    signal?.addEventListener('abort', rejeter);
  })) as typeof fetch;
}

describe('budget du critère n° 1 — 10 000 ms, même services muets', () => {
  it('itinéraire IGN muet : rend la main sous 10 000 ms (pire cas 8 500 ms)', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(fetchMuetGuardeParLeSignal());
    const debut = Date.now();
    await expect(calculerItineraire({ lon: 2.35, lat: 48.85 }, { lon: 4.83, lat: 47.02 }, 'car'))
      .rejects.toThrow(ErreurItineraire);
    expect(Date.now() - debut).toBeLessThan(10_000);
  }, 12_000);

  it('altimétrie muette : le délai de garde (2 000 ms) rend la main sans attendre le service', async () => {
    // Le service lui-même n'est pas mis en cause ici (ALTI-GARDE-1, déjà en
    // place) : on vérifie que `avecDelaiDeGarde` gagne la course même quand
    // la promesse sous-jacente ne se réglera jamais avant très longtemps.
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise<Response>(() => {}));
    const geometrie = { type: 'LineString' as const, coordinates: [[2.35, 48.85], [4.83, 47.02]] };
    const debut = Date.now();
    const DELAI_GARDE_ALTIMETRIE_MS = 2000; // panneau-itineraire.ts:138, inchangé par cette mission
    const points = await avecDelaiDeGarde(profilItineraire(geometrie), DELAI_GARDE_ALTIMETRIE_MS);
    expect(points).toBeUndefined();
    expect(Date.now() - debut).toBeLessThan(2_500);
  }, 5_000);

  it('commodités muettes : le minuteur interne (4 000 ms) rend la main — hors chemin du calcul, garde tout de même bornée', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(fetchMuetGuardeParLeSignal());
    const debut = Date.now();
    await expect(chargerCommodites(4.84, 47.02)).rejects.toThrow(ErreurCommodites);
    expect(Date.now() - debut).toBeLessThan(4_500);
  }, 7_000);
});
