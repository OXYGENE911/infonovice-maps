/**
 * Le marqueur « Pro » : ce qu'il dit, ce qu'il n'ouvre pas, et quand il oublie.
 *
 * Il existe parce qu'Armelin, le 17/09/2026, après avoir payé un abonnement de
 * test, a constaté que « rien de distinctif à l'écran ne fait penser à ce que
 * cela ait fonctionné ». Ces tests fixent la seule chose qu'il affirme — on
 * arrive du compte Pro — et son expiration.
 */
import { describe, it, expect } from 'vitest';
import {
  CLE_PRO, DUREE_MARQUEUR_MS,
  marqueurDuFragment, marqueurValable, nettoyerFragment, reglerMarqueur,
} from '../src/lib/marqueur-pro';

/** Un stockage de papier, qui note ce qu'on lui demande. */
function stockageFactice(initial: Record<string, string> = {}) {
  const donnees = new Map(Object.entries(initial));
  return {
    getItem: (c: string) => donnees.get(c) ?? null,
    setItem: (c: string, v: string) => void donnees.set(c, v),
    removeItem: (c: string) => void donnees.delete(c),
    vue: donnees,
  };
}

describe('ce que le fragment demande', () => {
  it('reconnaît la demande, avec ou sans valeur', () => {
    expect(marqueurDuFragment('#pro')).toBe(true);
    expect(marqueurDuFragment('#pro=1')).toBe(true);
    expect(marqueurDuFragment('#lieu=x&pro')).toBe(true);
  });

  it('reconnaît le retrait, qui doit pouvoir venir d’une déconnexion', () => {
    expect(marqueurDuFragment('#pro=0')).toBe(false);
    expect(marqueurDuFragment('#pro=')).toBe(false);
    expect(marqueurDuFragment('#pro=false')).toBe(false);
  });

  it('ne dit rien quand le fragment ne parle pas de Pro', () => {
    expect(marqueurDuFragment('')).toBeNull();
    expect(marqueurDuFragment('#trajet=paris-lyon')).toBeNull();
    /* `promenade` commence par « pro » : le jeton doit être lu en entier,
       sinon un fragment de trajet activerait la mention par accident. */
    expect(marqueurDuFragment('#promenade=1')).toBeNull();
  });
});

describe('le nettoyage du fragment', () => {
  it('retire le seul jeton pro et garde les autres — ce client met des trajets dans le fragment', () => {
    expect(nettoyerFragment('#pro')).toBe('');
    expect(nettoyerFragment('#pro=1')).toBe('');
    expect(nettoyerFragment('#pro&lieu=x')).toBe('#lieu=x');
    expect(nettoyerFragment('#lieu=x&pro=1')).toBe('#lieu=x');
    expect(nettoyerFragment('#a=1&pro&b=2')).toBe('#a=1&b=2');
    expect(nettoyerFragment('#trajet=paris-lyon')).toBe('#trajet=paris-lyon');
  });
});

describe('la durée de vie du marqueur', () => {
  const t = 1_800_000_000_000;

  it('vaut trente jours, pas plus', () => {
    expect(marqueurValable(String(t - DUREE_MARQUEUR_MS + 1000), t)).toBe(true);
    expect(marqueurValable(String(t - DUREE_MARQUEUR_MS - 1000), t)).toBe(false);
  });

  it('refuse ce qui n’est pas une date, et une date future', () => {
    expect(marqueurValable(null, t)).toBe(false);
    expect(marqueurValable('', t)).toBe(false);
    expect(marqueurValable('bientôt', t)).toBe(false);
    expect(marqueurValable('-1', t)).toBe(false);
    // Horloge déréglée ou valeur bricolée : on ne compte pas dessus.
    expect(marqueurValable(String(t + 60_000), t)).toBe(false);
  });
});

describe('le réglage complet', () => {
  const t = 1_800_000_000_000;

  it('garde la date au passage par le compte Pro', () => {
    const s = stockageFactice();
    expect(reglerMarqueur('#pro', s, t)).toEqual({ pro: true, fragmentNettoye: '' });
    expect(s.vue.get(CLE_PRO)).toBe(String(t));
  });

  it('oublie sur demande', () => {
    const s = stockageFactice({ [CLE_PRO]: String(t) });
    expect(reglerMarqueur('#pro=0', s, t).pro).toBe(false);
    expect(s.vue.has(CLE_PRO)).toBe(false);
  });

  it('se souvient d’une visite précédente, et oublie une trop vieille', () => {
    const recent = stockageFactice({ [CLE_PRO]: String(t - 1000) });
    expect(reglerMarqueur('', recent, t).pro).toBe(true);
    const vieux = stockageFactice({ [CLE_PRO]: String(t - DUREE_MARQUEUR_MS - 1) });
    expect(reglerMarqueur('', vieux, t).pro).toBe(false);
  });

  it('survit à un stockage absent : la mention ne dure que l’onglet', () => {
    expect(reglerMarqueur('#pro', null, t)).toEqual({ pro: true, fragmentNettoye: '' });
    expect(reglerMarqueur('', null, t).pro).toBe(false);
  });

  it('survit à un stockage qui lève, sans emporter la page', () => {
    const hostile = {
      getItem: () => { throw new Error('refusé'); },
      setItem: () => { throw new Error('refusé'); },
      removeItem: () => { throw new Error('refusé'); },
    };
    expect(() => reglerMarqueur('#pro', hostile, t)).not.toThrow();
    expect(reglerMarqueur('#pro', hostile, t).pro).toBe(true);
    expect(reglerMarqueur('', hostile, t).pro).toBe(false);
  });
});
