import { describe, it, expect } from 'vitest';
import {
  simplifier, distanceAuSegment, ecartMaximal, paqueter, longueurM,
} from '../src/lib/simplifier';

/* LA GARANTIE D'ÉCART, ET POURQUOI ELLE COMPTE (CORRIDOR-1, 31/08).
 *
 * `around` d'Overpass mesure la distance à la POLYLIGNE qu'on lui donne. Un
 * tracé simplifié qui coupe les virages sort la route du couloir : tout le
 * corridor disparaît — limites, sorties, giratoires — sans que rien ne le
 * dise. Ces parcours défendent la garantie qui empêche cela. */

/** Un arc de cercle : le pire cas pour une simplification. */
const arc = (rayonM: number, points: number): [number, number][] => {
  const mLat = 111_320;
  const mLon = 111_320 * Math.cos((48.85 * Math.PI) / 180);
  return Array.from({ length: points }, (_, i) => {
    const t = (i / (points - 1)) * Math.PI;
    return [
      2.35 + (rayonM * Math.cos(t)) / mLon,
      48.85 + (rayonM * Math.sin(t)) / mLat,
    ] as [number, number];
  });
};

describe('distanceAuSegment', () => {
  it('mesure au SEGMENT, pas à la droite infinie', () => {
    const a: [number, number] = [2.35, 48.85];
    const b: [number, number] = [2.36, 48.85];
    // Un point AU-DELÀ de b : c'est b le plus proche, pas la droite.
    const loin: [number, number] = [2.37, 48.85];
    const d = distanceAuSegment(loin, a, b);
    expect(d).toBeGreaterThan(600);
    /* MESURER À LA DROITE AURAIT RENDU ZÉRO — et sous-estimer l'écart aux
       abords d'un virage serré, là précisément où la garantie sert. */
  });

  it('rend zéro sur le segment lui-même', () => {
    expect(distanceAuSegment([2.355, 48.85], [2.35, 48.85], [2.36, 48.85]))
      .toBeLessThan(0.5);
  });

  it('survit à un segment dégénéré', () => {
    const p: [number, number] = [2.36, 48.85];
    expect(distanceAuSegment(p, [2.35, 48.85], [2.35, 48.85])).toBeGreaterThan(600);
  });

  /* EN MÈTRES LOCAUX, PAS EN DEGRÉS : un degré de longitude vaut moins qu'un
     degré de latitude dès qu'on quitte l'équateur. */
  it('ne confond pas un degré de longitude et un degré de latitude', () => {
    const est = distanceAuSegment([2.36, 48.85], [2.35, 48.85], [2.35, 48.851]);
    const nord = distanceAuSegment([2.35, 48.86], [2.35, 48.85], [2.351, 48.85]);
    // 0,01° de longitude à 48,85° vaut ~733 m ; 0,01° de latitude vaut ~1113 m.
    expect(est).toBeGreaterThan(650);
    expect(est).toBeLessThan(800);
    expect(nord).toBeGreaterThan(1_050);
  });
});

describe('simplifier', () => {
  it('garde les extrémités — un corridor doit couvrir le départ', () => {
    const t = arc(200, 40);
    const s = simplifier(t, 10);
    expect(s[0]).toEqual(t[0]);
    expect(s[s.length - 1]).toEqual(t[t.length - 1]);
  });

  it('laisse passer un tracé trop court pour être simplifié', () => {
    expect(simplifier([[2.35, 48.85], [2.36, 48.85]], 10)).toHaveLength(2);
    expect(simplifier([], 10)).toHaveLength(0);
  });

  /* LA GARANTIE, MESURÉE : c'est tout l'intérêt du procédé, et le mandat du
     projet interdit une promesse qu'on ne mesure pas. */
  it.each([2, 5, 8, 20])('ne s’écarte jamais de plus de %s m', (epsilon) => {
    const t = arc(300, 400);
    const s = simplifier(t, epsilon);
    expect(ecartMaximal(t, s)).toBeLessThanOrEqual(epsilon + 0.001);
  });

  /* CE QUE LE PAS FIXE NE SAIT PAS FAIRE : payer des points là où ils
     servent, et nulle part ailleurs. */
  it('collapse une ligne droite à deux points', () => {
    const droite: [number, number][] = Array.from({ length: 500 }, (_, i) =>
      [2.35 + i * 0.0002, 48.85] as [number, number]);
    expect(simplifier(droite, 8)).toHaveLength(2);
  });

  it('paie ses points DANS les virages, pas sur les droites', () => {
    /* C'EST LA PROPRIÉTÉ QUI COMPTE, et non un nombre choisi au jugé : à
       longueur égale et tolérance égale, une courbe doit coûter plus de
       points qu'une ligne droite. Mon premier seuil exigeait « plus de
       cinq » — or cinq points suffisent, géométriquement, pour un
       demi-cercle de vingt mètres à deux mètres près. Le parcours mesurait
       ma supposition, pas le comportement. */
    const courbe = simplifier(arc(20, 60), 2).length;
    const droite = simplifier(
      Array.from({ length: 60 }, (_, i) =>
        [2.35 + (i * 0.0000063), 48.85] as [number, number]), 2,
    ).length;
    expect(droite).toBe(2);
    expect(courbe).toBeGreaterThan(droite);
  });

  it('plus l’écart toléré est grand, moins il reste de points', () => {
    const t = arc(300, 400);
    const fin = simplifier(t, 2).length;
    const grossier = simplifier(t, 40).length;
    expect(grossier).toBeLessThan(fin);
  });

  /* ITÉRATIF, JAMAIS RÉCURSIF : un Paris-Marseille rend vingt-huit mille
     points, et une récursion par point ferait déborder la pile. */
  it('avale un tracé de trente mille points sans déborder', () => {
    const long: [number, number][] = Array.from({ length: 30_000 }, (_, i) =>
      [2.35 + i * 0.00001, 48.85 + Math.sin(i / 50) * 0.0001] as [number, number]);
    expect(() => simplifier(long, 8)).not.toThrow();
    expect(simplifier(long, 8).length).toBeGreaterThan(2);
  });
});

describe('paqueter', () => {
  const pts = (n: number): [number, number][] =>
    Array.from({ length: n }, (_, i) => [2.35 + i * 0.001, 48.85] as [number, number]);

  it('ne découpe pas ce qui tient', () => {
    expect(paqueter(pts(10), 20)).toHaveLength(1);
  });

  /* SANS RECOUVREMENT, le segment à cheval sur la couture n'appartiendrait à
     aucun paquet — un trou dans le couloir, là où l'on roule. */
  it('les paquets se recouvrent d’un point', () => {
    const p = paqueter(pts(25), 10);
    expect(p.length).toBeGreaterThan(1);
    for (let i = 0; i < p.length - 1; i += 1) {
      expect(p[i + 1]![0]).toEqual(p[i]![p[i]!.length - 1]);
    }
  });

  it('couvre tout, du premier au dernier point', () => {
    const t = pts(25);
    const p = paqueter(t, 10);
    expect(p[0]![0]).toEqual(t[0]);
    const dernier = p[p.length - 1]!;
    expect(dernier[dernier.length - 1]).toEqual(t[t.length - 1]);
  });

  it('ne produit jamais de paquet dégénéré', () => {
    for (const n of [2, 3, 11, 21, 100]) {
      for (const q of paqueter(pts(n), 10)) expect(q.length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('longueurM', () => {
  it('mesure la longueur cumulée', () => {
    expect(longueurM([[2.35, 48.85], [2.36, 48.85]])).toBeGreaterThan(600);
    expect(longueurM([[2.35, 48.85]])).toBe(0);
  });
});
