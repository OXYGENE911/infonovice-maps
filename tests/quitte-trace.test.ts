import { describe, it, expect } from 'vitest';
import {
  quitteLeTrace, ecartAngulaire, ECART_DOUTE_M, ECART_HORS_ROUTE_M,
  DIVERGENCE_CAP_DEG, type FixeEcart,
} from '../src/lib/guidage';

/* CONCLURE PLUS TÔT, SANS CRIER AU LOUP (GUIDE-5, 01/09).
 *
 * Armelin : « quand je refuse de suivre le trajet, le recalcul automatique
 * intervient de plus de 30 m après avoir fait mon écart ». Descendre le seuil
 * de distance serait une faute — à quarante mètres secs, un récepteur qui
 * dérive dans une rue encaissée annoncerait « vous avez quitté l'itinéraire »
 * à quelqu'un qui roule droit. On exige donc DEUX signaux qui s'accordent :
 * l'écart CROÎT, et le cap DIVERGE. */

const f = (ecartM: number, cap: number | null, capTrace = 90): FixeEcart =>
  ({ ecartM, cap, capTrace });

describe('quitteLeTrace', () => {
  it('conclut à moitié chemin du seuil quand tout concorde', () => {
    expect(quitteLeTrace([f(18, 150), f(30, 155), f(45, 160)])).toBe(true);
  });

  /* LE BRUIT D'UN RÉCEPTEUR OSCILLE SANS DIRECTION : il ne croît pas trois
     fois de suite. C'est ce qui sépare la dérive du virage. */
  it('ne conclut pas si l’écart oscille au lieu de croître', () => {
    expect(quitteLeTrace([f(45, 150), f(30, 155), f(48, 160)])).toBe(false);
  });

  /* ROULER DROIT AVEC UN RÉCEPTEUR QUI DÉRIVE : l'écart croît, mais le cap
     reste celui de la route. On attend alors le seuil ordinaire. */
  it('ne conclut pas quand le cap reste celui de la route', () => {
    expect(quitteLeTrace([f(20, 88), f(35, 92), f(46, 90)])).toBe(false);
  });

  it('ne conclut pas sous le seuil de doute', () => {
    expect(quitteLeTrace([f(10, 150), f(20, 155), f(38, 160)])).toBe(false);
  });

  /* À L'ARRÊT, LE RÉCEPTEUR SE TAIT : une absence de cap n'est pas une
     divergence, et l'on ne recalcule pas parce que quelqu'un s'est garé. */
  it('ne conclut pas sans cap connu', () => {
    expect(quitteLeTrace([f(20, null), f(35, null), f(46, null)])).toBe(false);
  });

  it('exige trois fixes — deux, c’est un sursaut', () => {
    expect(quitteLeTrace([f(30, 160), f(46, 165)])).toBe(false);
    expect(quitteLeTrace([])).toBe(false);
  });

  /* LE SEUIL PRÉCOCE EST LA MOITIÉ DE L'ORDINAIRE : assez bas pour répondre
     à « plus de 30 m », assez haut pour ne pas confondre avec le bruit. */
  it('les seuils tiennent l’un à l’autre', () => {
    expect(ECART_DOUTE_M).toBeLessThan(ECART_HORS_ROUTE_M);
    expect(ECART_DOUTE_M * 2).toBe(ECART_HORS_ROUTE_M);
  });
});

describe('ecartAngulaire', () => {
  it('prend toujours l’arc le plus court, y compris par le nord', () => {
    expect(ecartAngulaire(10, 350)).toBe(20);
    expect(ecartAngulaire(350, 10)).toBe(20);
    expect(ecartAngulaire(90, 270)).toBe(180);
    expect(ecartAngulaire(90, 90)).toBe(0);
  });

  it('le seuil de divergence sépare un virage d’une oscillation', () => {
    expect(DIVERGENCE_CAP_DEG).toBeGreaterThan(30);
    expect(DIVERGENCE_CAP_DEG).toBeLessThan(90);
  });
});
