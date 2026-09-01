import { describe, it, expect } from 'vitest';
import {
  elargir, contient, dansEmprise, estCouverte, memoriser,
  FACTEUR_MARGE, ZONES_GARDEES,
  type Emprise,
} from '../src/lib/couverture';

const vue = (ouest: number, sud: number, est: number, nord: number): Emprise =>
  ({ ouest, sud, est, nord });

describe('elargir', () => {
  it('garde le centre et multiplie les côtés', () => {
    const e = elargir(vue(0, 0, 2, 2), 2);
    expect(e).toEqual({ ouest: -1, sud: -1, est: 3, nord: 3 });
  });

  it('élargit par défaut de la marge annoncée', () => {
    const e = elargir(vue(0, 0, 10, 10));
    expect(e.est - e.ouest).toBeCloseTo(10 * FACTEUR_MARGE, 6);
  });

  /* SANS BORNAGE, une vue proche du pôle produirait une emprise que le
     service refuse — et un refus se lit comme une panne. */
  it('ne déborde pas des pôles', () => {
    const e = elargir(vue(0, 80, 10, 89), 4);
    expect(e.nord).toBeLessThanOrEqual(90);
    expect(e.sud).toBeGreaterThanOrEqual(-90);
  });
});

describe('contient', () => {
  it('reconnaît une vue incluse', () => {
    expect(contient(vue(0, 0, 10, 10), vue(2, 2, 8, 8))).toBe(true);
  });

  it('refuse une vue qui déborde, même d’un seul côté', () => {
    expect(contient(vue(0, 0, 10, 10), vue(2, 2, 11, 8))).toBe(false);
    expect(contient(vue(0, 0, 10, 10), vue(-1, 2, 8, 8))).toBe(false);
  });

  it('accepte l’égalité — une vue se contient elle-même', () => {
    expect(contient(vue(0, 0, 10, 10), vue(0, 0, 10, 10))).toBe(true);
  });
});

describe('estCouverte', () => {
  it('sans mémoire, rien n’est couvert', () => {
    expect(estCouverte(vue(0, 0, 1, 1), [])).toBe(false);
  });

  /* LA GARDE QUI PROTÈGE LE SERVICE : tant qu'elle répond vrai, aucune
     requête ne part, quel que soit le nombre de déplacements. */
  it('un aller-retour dans une zone déjà cherchée ne redemande rien', () => {
    const zones = [vue(0, 0, 10, 10)];
    expect(estCouverte(vue(1, 1, 2, 2), zones)).toBe(true);
    expect(estCouverte(vue(8, 8, 9, 9), zones)).toBe(true);
  });

  it('sortir de la zone rouvre la recherche', () => {
    expect(estCouverte(vue(11, 11, 12, 12), [vue(0, 0, 10, 10)])).toBe(false);
  });
});

describe('memoriser', () => {
  it('met la plus récente en tête', () => {
    const z = memoriser([vue(0, 0, 1, 1)], vue(5, 5, 6, 6));
    expect(z[0]).toEqual(vue(5, 5, 6, 6));
    expect(z).toHaveLength(2);
  });

  it('avale les zones que la nouvelle recouvre', () => {
    const z = memoriser([vue(2, 2, 3, 3), vue(20, 20, 21, 21)], vue(0, 0, 10, 10));
    expect(z).toHaveLength(2);
    expect(z).toContainEqual(vue(20, 20, 21, 21));
    expect(z).not.toContainEqual(vue(2, 2, 3, 3));
  });

  it('plafonne la mémoire — la liste est parcourue à chaque déplacement', () => {
    let z: Emprise[] = [];
    for (let i = 0; i < ZONES_GARDEES + 5; i += 1) {
      z = memoriser(z, vue(i * 10, 0, i * 10 + 1, 1));
    }
    expect(z).toHaveLength(ZONES_GARDEES);
  });

  it('ne modifie pas la liste reçue', () => {
    const depart = [vue(0, 0, 1, 1)];
    memoriser(depart, vue(5, 5, 6, 6));
    expect(depart).toHaveLength(1);
  });
});

describe('dansEmprise', () => {
  /* CE QUI DÉCIDE SI LA BAN A COMPRIS OÙ L'ON CHERCHE (RECHERCHE-5, 01/09).
     Le cas mesuré : taper « Collège Albert Camus » en regardant Le
     Plessis-Trévise rend un lieu-dit du Nord — que la BAN donne pour sûr à
     0,945. Un score élevé dit qu'elle est sûre de SON lieu-dit ; il ne dit
     pas que c'est celui-là qu'on cherchait. La vue, elle, le dit. */
  const plessis = vue(2.53, 48.79, 2.61, 48.83);

  it('le point du Plessis est dans la vue du Plessis', () => {
    expect(dansEmprise(plessis, { lon: 2.5760, lat: 48.8051 })).toBe(true);
  });

  it('le lieu-dit de Thumeries n’y est pas — c’est tout le sujet', () => {
    expect(dansEmprise(plessis, { lon: 3.0640, lat: 50.4750 })).toBe(false);
  });

  it('une vue sur la France entière n’exclut personne, et c’est voulu', () => {
    /* Une carte qui montre tout le pays n'exprime AUCUNE préférence : elle
       doit donc laisser la BAN décider, et non tirer la recherche vers le
       centre géographique de la France où personne ne cherche rien. */
    const france = vue(-5.2, 41.3, 9.6, 51.1);
    expect(dansEmprise(france, { lon: 2.5760, lat: 48.8051 })).toBe(true);
    expect(dansEmprise(france, { lon: 3.0640, lat: 50.4750 })).toBe(true);
  });

  it('les bords appartiennent à l’emprise', () => {
    expect(dansEmprise(plessis, { lon: 2.53, lat: 48.79 })).toBe(true);
    expect(dansEmprise(plessis, { lon: 2.61, lat: 48.83 })).toBe(true);
  });
});
