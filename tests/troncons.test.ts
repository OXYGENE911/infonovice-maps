import { describe, it, expect } from 'vitest';
import {
  decouperParLongueur, emprise, aRenonce, delaiClientMs,
  TRONCON_M, MARGE_EMPRISE_DEG,
} from '../src/lib/troncons';
import { distanceM } from '../src/lib/le-long-du-trajet';

/** Un tracé ouest→est le long du 47e parallèle : 1° ≈ 76 km en longitude. */
const trace = (points: number, pasDeg = 0.01): [number, number][] =>
  Array.from({ length: points }, (_, i) => [3 + i * pasDeg, 47] as [number, number]);

const longueur = (t: readonly [number, number][]): number => {
  let l = 0;
  for (let i = 0; i < t.length - 1; i += 1) l += distanceM(t[i]!, t[i + 1]!);
  return l;
};

describe('decouperParLongueur', () => {
  it('rend un seul tronçon quand le trajet tient dedans', () => {
    const t = trace(20); // ~15 km
    expect(decouperParLongueur(t)).toHaveLength(1);
  });

  it('coupe un long trajet, et aucun tronçon ne dépasse la longueur visée', () => {
    const t = trace(1200); // ~910 km
    const morceaux = decouperParLongueur(t);
    expect(morceaux.length).toBeGreaterThan(5);
    for (const m of morceaux) {
      // La marge d'un segment : on coupe APRÈS avoir dépassé, jamais avant.
      expect(longueur(m)).toBeLessThan(TRONCON_M * 1.1);
    }
  });

  /* SANS RECOUVREMENT, un péage posé exactement sur la couture
     n'appartiendrait à aucun tronçon et disparaîtrait du relevé. */
  it('les tronçons se recouvrent d’un point — rien ne tombe dans la couture', () => {
    const morceaux = decouperParLongueur(trace(600));
    for (let i = 0; i < morceaux.length - 1; i += 1) {
      const finPrecedent = morceaux[i]![morceaux[i]!.length - 1];
      const debutSuivant = morceaux[i + 1]![0];
      expect(debutSuivant).toEqual(finPrecedent);
    }
  });

  it('couvre tout le trajet, du premier au dernier point', () => {
    const t = trace(600);
    const morceaux = decouperParLongueur(t);
    expect(morceaux[0]![0]).toEqual(t[0]);
    const dernier = morceaux[morceaux.length - 1]!;
    expect(dernier[dernier.length - 1]).toEqual(t[t.length - 1]);
  });

  /* UN TRONÇON D'UN SEUL POINT SERAIT REFUSÉ PAR LE SERVICE : la queue
     rejoint le tronçon précédent plutôt que de partir seule. */
  it('ne produit jamais de tronçon dégénéré', () => {
    for (const n of [2, 3, 131, 262, 999]) {
      for (const m of decouperParLongueur(trace(n))) {
        expect(m.length).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('refuse un tracé qui n’en est pas un', () => {
    expect(decouperParLongueur([])).toEqual([]);
    expect(decouperParLongueur([[3, 47]])).toEqual([]);
  });
});

describe('emprise', () => {
  it('englobe tous les points, avec sa marge', () => {
    const e = emprise([[3, 47], [4, 48], [3.5, 46.5]]);
    expect(e.ouest).toBeCloseTo(3 - MARGE_EMPRISE_DEG, 6);
    expect(e.est).toBeCloseTo(4 + MARGE_EMPRISE_DEG, 6);
    expect(e.sud).toBeCloseTo(46.5 - MARGE_EMPRISE_DEG, 6);
    expect(e.nord).toBeCloseTo(48 + MARGE_EMPRISE_DEG, 6);
  });

  it('ne déborde pas des pôles', () => {
    const e = emprise([[0, 89.999], [1, -89.999]], 1);
    expect(e.nord).toBeLessThanOrEqual(90);
    expect(e.sud).toBeGreaterThanOrEqual(-90);
  });
});

describe('aRenonce', () => {
  /* LA LECTURE QUI MANQUAIT, ET QUI A COÛTÉ DEUX FONCTIONNALITÉS. Overpass
     qui expire rend un tableau VIDE et un `remark` qui l'explique. Sans
     cette lecture, « le service a renoncé » se lisait « il n'y a rien ici ». */
  it('reconnaît l’expiration derrière une réponse vide', () => {
    expect(aRenonce({
      elements: [],
      remark: 'runtime error: Query timed out in "query" at line 1 after 26 seconds.',
    })).toBe(true);
  });

  it('laisse passer une vraie réponse vide — un trajet sans péage existe', () => {
    expect(aRenonce({ elements: [] })).toBe(false);
    expect(aRenonce({ elements: [{ type: 'node' }] })).toBe(false);
  });

  it('ne se laisse pas piéger par ce qui vient du dehors', () => {
    expect(aRenonce(null)).toBe(false);
    expect(aRenonce(undefined)).toBe(false);
    expect(aRenonce('timed out')).toBe(false);
    expect(aRenonce({ remark: 42 })).toBe(false);
    // Une remarque anodine n'est pas un renoncement.
    expect(aRenonce({ remark: 'considered 3 elements' })).toBe(false);
  });
});

describe('delaiClientMs', () => {
  /* LA DEUXIÈME CAUSE DU DÉFAUT : le client coupait à 45 s pour un budget
     serveur de 45 s (les feux), et à 15 s pour un budget de 25 s (les
     péages). On renonçait à des réponses qui arrivaient. */
  it('laisse TOUJOURS plus de temps que le serveur ne s’en donne', () => {
    for (const budget of [25, 45, 50, 60]) {
      expect(delaiClientMs(budget)).toBeGreaterThan(budget * 1000);
    }
  });
});
