import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { preparerMaj, type InscriptionMaj } from '../src/lib/maj-secours';

/* LE SECOURS DE LA MISE À JOUR (MAJ-2, 04/09). Armelin : « quand je clique
   sur "Mise à jour", il ne se passe absolument rien ». Chaque état réel de
   l'inscription a son chemin, et TOUS finissent par un rechargement ou une
   prise de contrôle — jamais un bouton mort. */

interface Harnais {
  clic: () => void;
  demarre: number;
  recharges: number;
  messages: unknown[];
  prendreControle: () => void;
  poserInscription: (i: InscriptionMaj | undefined) => void;
}

function harnais(): Harnais {
  const h = {
    demarre: 0, recharges: 0, messages: [] as unknown[],
    controle: null as (() => void) | null,
    inscription: undefined as InscriptionMaj | undefined,
  };
  const clic = preparerMaj({
    demarrer: () => { h.demarre += 1; },
    inscription: () => Promise.resolve(h.inscription),
    recharger: () => { h.recharges += 1; },
    surPriseDeControle: (f) => { h.controle = f; },
  });
  return {
    clic,
    get demarre() { return h.demarre; },
    get recharges() { return h.recharges; },
    get messages() { return h.messages; },
    prendreControle: () => { h.controle?.(); },
    poserInscription: (i) => {
      h.inscription = i;
      if (i?.waiting) {
        const brut = i.waiting;
        i.waiting = { postMessage: (m) => { h.messages.push(m); brut.postMessage(m); } };
      }
    },
  };
}

const attenteMuette = (): InscriptionMaj => ({
  waiting: { postMessage: () => {} }, installing: null,
});

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('preparerMaj', () => {
  it('quand le greffon aboutit, le secours ne fait RIEN — pas de double rechargement', async () => {
    const h = harnais();
    h.clic();
    expect(h.demarre).toBe(1);
    h.prendreControle();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(h.recharges).toBe(0);
    expect(h.messages).toEqual([]);
  });

  it('un worker attend encore : le SKIP_WAITING se redit', async () => {
    const h = harnais();
    h.poserInscription(attenteMuette());
    h.clic();
    await vi.advanceTimersByTimeAsync(3_000);
    expect(h.messages).toEqual([{ type: 'SKIP_WAITING' }]);
  });

  it('un remplaçant s’installe : on le laisse finir, puis on lui dit de prendre la main', async () => {
    const h = harnais();
    let surEtat: (() => void) | null = null;
    const ins: InscriptionMaj = {
      waiting: null,
      installing: {
        state: 'installing',
        addEventListener: (_t, f) => { surEtat = f; },
      },
    };
    h.poserInscription(ins);
    h.clic();
    await vi.advanceTimersByTimeAsync(3_000);
    expect(surEtat, 'le secours doit guetter la fin d’installation').not.toBeNull();
    /* L'installation aboutit : le remplaçant passe en attente. */
    (ins.installing as { state: string }).state = 'installed';
    const messages: unknown[] = [];
    ins.waiting = { postMessage: (m) => { messages.push(m); } };
    surEtat!();
    expect(messages).toEqual([{ type: 'SKIP_WAITING' }]);
  });

  it('plus rien nulle part : la version est déjà active — on recharge', async () => {
    const h = harnais();
    h.poserInscription({ waiting: null, installing: null });
    h.clic();
    await vi.advanceTimersByTimeAsync(3_000);
    expect(h.recharges).toBe(1);
  });

  it('DERNIER RECOURS : huit secondes sans prise de contrôle, on recharge quoi qu’il arrive', async () => {
    const h = harnais();
    h.poserInscription(attenteMuette()); // un worker sourd au message
    h.clic();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(h.recharges, 'jamais un bouton mort').toBeGreaterThanOrEqual(1);
  });

  it('deux clics ne font qu’une mise à jour', async () => {
    const h = harnais();
    h.clic();
    h.clic();
    expect(h.demarre).toBe(1);
  });
});
