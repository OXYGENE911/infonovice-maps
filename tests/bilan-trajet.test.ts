import { describe, it, expect } from 'vitest';
import {
  nouveauBilan, ajouterFixe, resumerBilan, dureeEnMots,
  DUREE_ARRET_MS, TROU_MAX_MS, type EtatBilan,
} from '../src/lib/bilan-trajet';

/* LE BILAN DE TRAJET (STATS-1, 01/09).
 *
 * Armelin : « une fenêtre de statistiques à l'arrivée : vitesse max, vitesse
 * moyenne, temps total, temps de charge, nombre d'arrêts ». Tout sort des
 * fixes que le suivi reçoit déjà — rien ne sort du navigateur. */

const T0 = 1_700_000_000_000;

/** Enchaîne des fixes { seconde, vitesse m/s } depuis T0. */
function rouler(fixes: [number, number | null][]): EtatBilan {
  return fixes.reduce(
    (e, [s, v]) => ajouterFixe(e, { instant: T0 + s * 1000, vitesse: v }),
    nouveauBilan(),
  );
}

describe('le bilan, de bout en bout', () => {
  it('rend null tant qu’aucun fixe n’est arrivé', () => {
    expect(resumerBilan(nouveauBilan())).toBeNull();
  });

  it('donne la durée par l’horloge, du premier au dernier fixe', () => {
    const r = resumerBilan(rouler([[0, 10], [60, 12], [600, 11]]))!;
    expect(r.dureeMs).toBe(600_000);
  });

  it('retient la plus grande vitesse, en km/h', () => {
    const r = resumerBilan(rouler([[0, 10], [10, 27.8], [20, 15]]))!;
    expect(r.vitesseMaxKmh).toBe(100);
  });

  /* LA MOYENNE EST PONDÉRÉE PAR LE TEMPS, et c'est la seule honnête : dix
     fixes à l'arrêt et un seul à 130 ne font pas une moyenne de 65. */
  it('pondère la moyenne PAR LE TEMPS, pas par le nombre de fixes', () => {
    // 100 s à 10 m/s, puis 10 s à 30 m/s → (100×10 + 10×30) / 110 ≈ 11,8 m/s.
    const r = resumerBilan(rouler([[0, 10], [100, 10], [110, 30]]))!;
    expect(r.vitesseMoyenneKmh).toBe(Math.round(((100 * 10 + 10 * 30) / 110) * 3.6));
  });

  it('se tait sur la moyenne quand rien n’a pu être mesuré', () => {
    expect(resumerBilan(rouler([[0, null]]))!.vitesseMoyenneKmh).toBeNull();
  });
});

describe('ce qui compte comme un arrêt', () => {
  /* UN FEU ROUGE N'EST PAS UNE PAUSE : sous la minute, on ne compte rien. */
  it('ignore une immobilisation courte', () => {
    const r = resumerBilan(rouler([[0, 12], [30, 0], [50, 0], [70, 12]]))!;
    expect(r.arrets).toBe(0);
  });

  it('compte un arrêt DURABLE, et une seule fois', () => {
    const r = resumerBilan(rouler([
      [0, 12], [30, 0], [60, 0], [95, 0], [130, 0], [200, 12],
    ]))!;
    expect(r.arrets).toBe(1);
  });

  it('compte DEUX arrêts séparés par de la route', () => {
    const r = resumerBilan(rouler([
      [0, 12], [10, 0], [90, 0], [120, 12], [200, 12],
      [210, 0], [300, 0], [340, 12],
    ]))!;
    expect(r.arrets).toBe(2);
  });

  it('le seuil de durée est bien celui qu’on annonce', () => {
    expect(DUREE_ARRET_MS).toBe(60_000);
  });
});

describe('les trous du signal', () => {
  /* UN TUNNEL NE ROULE PAS À LA DERNIÈRE VITESSE CONNUE. Le temps total
     reste vrai — il se lit aux horloges — mais la moyenne ne compte que ce
     qui a été mesuré. */
  it('n’étend pas la dernière vitesse à travers un long trou', () => {
    const long = TROU_MAX_MS / 1000 + 60;
    const r = resumerBilan(rouler([[0, 30], [10, 30], [10 + long, 30]]))!;
    // La durée dit la vérité de l'horloge…
    expect(r.dureeMs).toBe((10 + long) * 1000);
    // …mais la moyenne ne pèse que les dix secondes réellement suivies.
    expect(r.vitesseMoyenneKmh).toBe(108);
  });

  it('ignore un fixe qui recule — une durée négative n’existe pas', () => {
    const e = rouler([[0, 10], [100, 10]]);
    expect(ajouterFixe(e, { instant: T0 + 50_000, vitesse: 40 })).toEqual(e);
    expect(ajouterFixe(e, { instant: Number.NaN, vitesse: 40 })).toEqual(e);
  });
});

describe('dureeEnMots', () => {
  it('dit les minutes, les heures, et le presque-rien', () => {
    expect(dureeEnMots(20_000)).toBe('moins d’une minute');
    expect(dureeEnMots(12 * 60_000)).toBe('12 min');
    expect(dureeEnMots(84 * 60_000)).toBe('1 h 24');
    expect(dureeEnMots(120 * 60_000)).toBe('2 h');
  });
});
