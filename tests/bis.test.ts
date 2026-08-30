import { describe, it, expect } from 'vitest';
import {
  pointLateral, divergenceM, tronquer, traceDevant, choisirBis, PORTEE_BIS_M,
  type CandidatBis,
} from '../src/lib/bis';
import { distanceM } from '../src/lib/le-long-du-trajet';

/* L'ITINÉRAIRE BIS (BIS-1, demande d'Armelin du 30/08). Ce qui se teste à
 * sec, c'est le JUGEMENT : est-ce que ce tracé quitte vraiment la route
 * actuelle, et assez tôt ? Le calcul lui-même appartient au service. */

/** Une route droite vers l'est, un point tous les 100 m. */
function versLEst(n: number, lat = 48.85, lon0 = 2.35): [number, number][] {
  const pas = 100 / (111_320 * Math.cos((lat * Math.PI) / 180));
  return Array.from({ length: n }, (_, i) => [lon0 + i * pas, lat] as [number, number]);
}

describe('pointLateral', () => {
  it('pose le point DEVANT et sur le côté, à la distance demandée', () => {
    const p = pointLateral([2.35, 48.85], 90, 3_000, 'droite');
    expect(distanceM([2.35, 48.85], p)).toBeCloseTo(3_000, -1);
    // Cap est, biais à droite : on part vers le sud-est. Donc plus à l'est, plus au sud.
    expect(p[0]).toBeGreaterThan(2.35);
    expect(p[1]).toBeLessThan(48.85);
  });

  it('renvoie de l’autre côté quand on le demande', () => {
    const d = pointLateral([2.35, 48.85], 90, 3_000, 'droite');
    const g = pointLateral([2.35, 48.85], 90, 3_000, 'gauche');
    expect(g[1]).toBeGreaterThan(48.85);
    // Les deux avancent, aucun ne fait faire demi-tour : c'est tout l'objet
    // du biais de 45° plutôt que d'un décalage perpendiculaire.
    expect(d[0]).toBeGreaterThan(2.35);
    expect(g[0]).toBeGreaterThan(2.35);
  });

  it('ne part pas à l’infini au pôle — un tracé importé peut y aller', () => {
    expect(pointLateral([2.35, 90], 90, 3_000, 'droite')).toEqual([2.35, 90]);
  });
});

describe('divergenceM', () => {
  it('rend la distance à laquelle le candidat QUITTE la route actuelle', () => {
    const actuel = versLEst(100);           // 10 km plein est
    const candidat = versLEst(20).concat(   // 2 km ensemble…
      Array.from({ length: 30 }, (_, i) => [
        actuel[19]![0], 48.85 + (i + 1) * 0.001,           // …puis plein nord
      ] as [number, number]),
    );
    const d = divergenceM(actuel, candidat);
    expect(d).not.toBeNull();
    // Il faut ~60 m d'écart pour être « parti » : la sortie se lit vers 2 km.
    expect(d!).toBeGreaterThan(1_800);
    expect(d!).toBeLessThan(2_400);
  });

  it('rend null quand le candidat NE quitte jamais la route — ce n’est pas un bis', () => {
    expect(divergenceM(versLEst(100), versLEst(100))).toBeNull();
  });

  it('rend null quand il ne la quitte qu’APRÈS la portée : l’obstacle est devant', () => {
    const actuel = versLEst(200);                       // 20 km
    const candidat = versLEst(120).concat(              // 12 km ensemble…
      Array.from({ length: 20 }, (_, i) => [
        actuel[119]![0], 48.85 + (i + 1) * 0.001,
      ] as [number, number]),
    );
    // Au-delà de six kilomètres, être dérouté ne répond plus à la demande.
    expect(divergenceM(actuel, candidat, PORTEE_BIS_M)).toBeNull();
    // La même mesure, portée plus large, le trouve : c'est bien la portée
    // qui tranche, pas un défaut de détection.
    expect(divergenceM(actuel, candidat, 20_000)).not.toBeNull();
  });

  it('ne lève pas sur un tracé dégénéré', () => {
    expect(divergenceM([], versLEst(10))).toBeNull();
    expect(divergenceM(versLEst(10), [[2.35, 48.85]])).toBeNull();
  });
});

describe('tronquer', () => {
  it('garde le début du tracé, et un point de plus pour fermer le segment', () => {
    const t = tronquer(versLEst(100), 1_000);
    expect(t.length).toBeGreaterThanOrEqual(11);
    expect(t.length).toBeLessThanOrEqual(12);
    expect(t[0]).toEqual(versLEst(1)[0]);
  });

  it('rend le tracé entier quand il est plus court que demandé', () => {
    expect(tronquer(versLEst(5), 100_000)).toHaveLength(5);
  });
});

describe('choisirBis', () => {
  const actuel = versLEst(200);
  const bifurquer = (apres: number): [number, number][] => versLEst(apres).concat(
    Array.from({ length: 40 }, (_, i) => [
      actuel[apres - 1]![0], 48.85 + (i + 1) * 0.001,
    ] as [number, number]),
  );
  const cand = (cle: string, apres: number, dureeS: number): CandidatBis => ({
    cle, libelle: cle, trace: bifurquer(apres), distanceM: 20_000, dureeS,
  });

  it('préfère celui qui sort le PLUS TÔT — c’est toute la demande', () => {
    const choix = choisirBis(actuel, [cand('tard', 50, 900), cand('tot', 10, 1_800)]);
    expect(choix?.candidat.cle).toBe('tot');
  });

  it('à sortie comparable, préfère le plus rapide', () => {
    /* Départager deux sorties à trois cents mètres près n'a aucun sens sur le
       terrain ; un quart d'heure de trajet en a un. */
    const choix = choisirBis(actuel, [cand('lent', 10, 3_600), cand('vif', 13, 1_200)]);
    expect(choix?.candidat.cle).toBe('vif');
  });

  it('REFUSE de proposer un bis quand aucun candidat ne quitte la route', () => {
    /* Un « bis » qui repasse par l'obstacle serait pire que rien : on
       enverrait l'usager dans le bouchon en lui disant qu'il l'évite. */
    const meme: CandidatBis = {
      cle: 'meme', libelle: 'meme', trace: actuel, distanceM: 20_000, dureeS: 900,
    };
    expect(choisirBis(actuel, [meme])).toBeNull();
    expect(choisirBis(actuel, [])).toBeNull();
  });
});

describe('traceDevant', () => {
  const actuel = versLEst(300);   // 30 km plein est

  it('ne garde que ce qui est DEVANT, depuis la position courante', () => {
    // À dix kilomètres du départ : le reste commence là, pas au départ.
    const devant = traceDevant(actuel, { lon: actuel[100]![0], lat: 48.85 });
    /* Le tracé rendu commence au DÉBUT du segment qu'on occupe, donc au plus
       un point en arrière — c'est voulu : couper à la voiture ferait manquer
       le segment sur lequel on roule. */
    expect(distanceM(devant[0]!, actuel[100]!)).toBeLessThan(150);
    expect(devant[0]![0]).toBeGreaterThan(actuel[98]![0]);
  });

  it('tronque à la portée : la question se joue sur quelques kilomètres', () => {
    const devant = traceDevant(actuel, { lon: actuel[0]![0], lat: 48.85 }, 3_000);
    expect(devant.length).toBeLessThanOrEqual(32);
    expect(devant.length).toBeGreaterThanOrEqual(30);
  });

  it('ne lève pas sur un tracé vide', () => {
    expect(traceDevant([], { lon: 2.35, lat: 48.85 })).toEqual([]);
  });
});
