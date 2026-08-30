import { describe, it, expect } from 'vitest';
import {
  versGiratoires, giratoireA, lireAnneaux, capVers, ecartAngle,
  libelleRang, libelleRangCourt,
} from '../src/lib/giratoire';

/* LE SCHÉMA DE ROND-POINT (ROND-1, demandes d'Armelin des 29 et 30/08).
 *
 * CE QUI SE TESTE À SEC, ET C'EST TOUT LE MODULE : le moteur ne dit RIEN des
 * giratoires (mesuré sur les deux moteurs le 30/08), donc TOUT est déduit de
 * la géométrie — le sens de rotation, le rang de la sortie, les branches.
 * Une erreur de géométrie enverrait l'usager dans la mauvaise sortie : ces
 * parcours sont la seule chose qui l'en empêche. */

const CENTRE: [number, number] = [2.35, 48.85];
const M_LAT = 111_320;
const M_LON = 111_320 * Math.cos((48.85 * Math.PI) / 180);

/** Un point à `distance` mètres du centre, au cap donné (0 = nord). */
function auCap(capDeg: number, distance: number): [number, number] {
  const t = (capDeg * Math.PI) / 180;
  return [
    CENTRE[0] + (distance * Math.sin(t)) / M_LON,
    CENTRE[1] + (distance * Math.cos(t)) / M_LAT,
  ];
}

/** L'anneau : seize points à vingt mètres du centre. */
const ANNEAU = {
  type: 'way', id: 1, tags: { junction: 'roundabout', highway: 'tertiary' },
  geometry: Array.from({ length: 16 }, (_, i) => {
    const p = auCap(i * 22.5, 20);
    return { lon: p[0], lat: p[1] };
  }),
};

/** Une branche partant de l'anneau vers l'extérieur, à ce cap. */
function branche(capDeg: number, id: number) {
  const a = auCap(capDeg, 20);
  const b = auCap(capDeg, 60);
  return {
    type: 'way', id, tags: { highway: 'secondary' },
    geometry: [{ lon: a[0], lat: a[1] }, { lon: b[0], lat: b[1] }],
  };
}

/**
 * Un tracé qui entre au SUD et sort au cap donné, en tournant à la
 * française : dans le sens INVERSE des aiguilles d'une montre.
 */
function traverser(capSortie: number): [number, number][] {
  const points: [number, number][] = [auCap(180, 90), auCap(180, 40)];
  /* On entre au sud (cap 180 depuis le centre) et l'on tourne vers l'ouest
     puis le nord : les caps DÉCROISSENT — 180, 160, 140… — c'est le sens
     antihoraire de la conduite à droite. */
  let cap = 180;
  const cible = ((180 - capSortie) + 360) % 360; // degrés à parcourir
  for (let parcouru = 10; parcouru < cible; parcouru += 10) {
    cap = (180 - parcouru + 360) % 360;
    points.push(auCap(cap, 20));
  }
  points.push(auCap(capSortie, 20), auCap(capSortie, 40), auCap(capSortie, 90));
  return points;
}

describe('capVers et ecartAngle', () => {
  it('mesure le cap depuis le centre, nord en tête', () => {
    expect(capVers(CENTRE, auCap(0, 50))).toBeCloseTo(0, 0);
    expect(capVers(CENTRE, auCap(90, 50))).toBeCloseTo(90, 0);
    expect(capVers(CENTRE, auCap(270, 50))).toBeCloseTo(270, 0);
  });

  it('ramène l’écart dans (-180, 180] — le passage par le nord est le piège', () => {
    expect(ecartAngle(10, 350)).toBe(20);
    expect(ecartAngle(350, 10)).toBe(-20);
    expect(ecartAngle(180, 0)).toBe(180);
  });
});

describe('lireAnneaux', () => {
  it('sépare l’anneau de ses branches, et ne le compte pas deux fois', () => {
    /* LES DEUX `out` DE LA REQUÊTE rendent l'anneau deux fois : une fois
       comme anneau, une fois parmi les chemins touchant ses nœuds. Sans
       garde-fou, chaque giratoire compterait double. */
    const { anneaux, branches } = lireAnneaux([ANNEAU, branche(0, 2), ANNEAU]);
    expect(anneaux).toHaveLength(1);
    expect(branches).toHaveLength(1);
  });

  it('ignore ce qui n’est ni chemin ni route, sans lever', () => {
    const { anneaux, branches } = lireAnneaux([
      null, 'bruit', { type: 'node', id: 9 },
      { type: 'way', id: 10, geometry: [{ lon: 2, lat: 48 }] },
      { type: 'way', id: 11, tags: {}, geometry: [{ lon: 2, lat: 48 }, { lon: 2.1, lat: 48 }] },
    ]);
    expect(anneaux).toEqual([]);
    expect(branches).toEqual([]);
  });
});

describe('versGiratoires', () => {
  /* Quatre branches en croix : sud (par où l'on entre), est, nord, ouest —
     et c'est l'ordre dans lequel on les rencontre en conduite à droite. */
  const elements = [ANNEAU, branche(180, 2), branche(270, 3), branche(0, 4), branche(90, 5)];

  /* L'ORDRE DES SORTIES EN CONDUITE À DROITE, et c'est le cœur du module :
     on entre par le sud, on garde l'îlot à sa gauche, et l'on rencontre
     l'EST d'abord, le NORD ensuite, l'OUEST en dernier. Autrement dit : à
     droite = première, tout droit = deuxième, à gauche = troisième. */

  it('compte la PREMIÈRE sortie : à droite, c’est-à-dire à l’est', () => {
    const g = versGiratoires(elements, traverser(90));
    expect(g).toHaveLength(1);
    expect(g[0]!.rang).toBe(1);
  });

  it('compte la DEUXIÈME : tout droit, c’est-à-dire au nord', () => {
    /* C'est le cas qui trompe : « tout droit » n'est pas « pas de manœuvre »
       dans un rond-point, c'est la deuxième sortie. */
    expect(versGiratoires(elements, traverser(0))[0]!.rang).toBe(2);
  });

  it('compte la TROISIÈME : à gauche, c’est-à-dire à l’ouest', () => {
    expect(versGiratoires(elements, traverser(270))[0]!.rang).toBe(3);
  });

  it('MESURE le sens de rotation au lieu de le présumer', () => {
    /* Un anneau parcouru dans l'AUTRE sens — numérisation étrangère, donnée
       fautive — doit compter ses sorties dans CE sens-là. Ici les caps
       CROISSENT (180, 200, 220…) au lieu de décroître : l'ouest devient la
       première sortie, et non la troisième. */
    const inverse: [number, number][] = [
      auCap(180, 90), auCap(180, 40),
      auCap(200, 20), auCap(220, 20), auCap(240, 20),
      auCap(270, 20), auCap(270, 40), auCap(270, 90),
    ];
    expect(versGiratoires(elements, inverse)[0]!.rang,
      'à l’envers, l’ouest est la première sortie').toBe(1);
  });

  it('rend les branches DEPUIS l’entrée, l’entrée exclue', () => {
    const g = versGiratoires(elements, traverser(0))[0]!;
    // Trois sorties : est (90°), nord (180°), ouest (270°) depuis l'entrée.
    expect(g.branches).toHaveLength(3);
    expect(g.branches[0]).toBeCloseTo(90, -1);
    expect(g.sortie).toBeCloseTo(180, -1);
  });

  it('DESSINE SANS COMPTER quand aucune branche ne correspond', () => {
    /* Sans les branches (OpenStreetMap ne les a pas toutes), le schéma reste
       vrai — l'anneau et notre sortie viennent de notre tracé — mais il
       n'annonce pas « la troisième » quand on ne sait pas compter. */
    const g = versGiratoires([ANNEAU], traverser(90))[0]!;
    expect(g.rang).toBeNull();
    // Notre sortie reste connue : quatre-vingt-dix degrés après l'entrée.
    expect(g.sortie).toBeCloseTo(90, -1);
  });

  it('IGNORE un anneau que le tracé ne fait que frôler', () => {
    // Une route droite qui passe à cent mètres au sud : on ne la traverse pas.
    const aCote: [number, number][] = [auCap(180, 100), auCap(180, 90), auCap(180, 95)];
    expect(versGiratoires(elements, aCote)).toEqual([]);
  });

  it('ne lève pas sur un tracé trop court', () => {
    expect(versGiratoires(elements, [[2.35, 48.85]])).toEqual([]);
  });

  it('FUSIONNE deux chaussées d’une même route : c’est UNE sortie', () => {
    /* Une deux-fois-deux-voies arrive sur l'anneau en deux chemins OSM
       séparés de quelques degrés. Les compter deux fois décalerait tous les
       rangs suivants — l'usager sortirait une sortie trop tôt. */
    const doublee = [...elements, branche(268, 6), branche(272, 7)];
    const g = versGiratoires(doublee, traverser(0))[0]!;
    expect(g.branches).toHaveLength(3);
    expect(g.rang).toBe(2);
  });
});

describe('giratoireA', () => {
  const g = [
    { entreeM: 1_000, sortieM: 1_050, branches: [90], sortie: 90, rang: 1 },
    { entreeM: 5_000, sortieM: 5_060, branches: [180], sortie: 180, rang: 2 },
  ];

  it('annonce celui qui vient, dans la portée', () => {
    expect(giratoireA(g, 300)?.entreeM).toBe(1_000);
    expect(giratoireA(g, 999)?.rang).toBe(1);
  });

  it('le garde tant qu’on n’en est pas SORTI', () => {
    // Au milieu de l'anneau, le schéma est ce qu'on a de plus utile.
    expect(giratoireA(g, 1_020)?.rang).toBe(1);
    // Une fois dehors, il disparaît — et le suivant attend sa portée.
    expect(giratoireA(g, 1_051)).toBeNull();
    expect(giratoireA(g, 4_200)?.entreeM).toBe(5_000);
  });

  it('SE TAIT quand il est trop loin, ou qu’il n’y en a pas', () => {
    expect(giratoireA(g, 0)).toBeNull();
    expect(giratoireA([], 1_000)).toBeNull();
  });
});

describe('libelleRang', () => {
  it('dit le rang, ou se contente de la sortie', () => {
    expect(libelleRang(1)).toBe('Au rond-point, prenez la première sortie');
    expect(libelleRang(3)).toBe('Au rond-point, prenez la 3e sortie');
    expect(libelleRang(null)).toBe('Prenez votre sortie au rond-point');
  });

  it('l’ÉCRIT plus court qu’il ne le DIT — la place manque dans le panneau', () => {
    /* « Prenez la première sortie » faisait passer le cartouche du numéro de
       route à la ligne suivante : mesuré sur capture, pas supposé. */
    expect(libelleRangCourt(1)).toBe('Prenez la 1re sortie');
    expect(libelleRangCourt(3)).toBe('Prenez la 3e sortie');
    expect(libelleRangCourt(null)).toBe('Prenez votre sortie');
    expect(libelleRangCourt(1).length).toBeLessThan(libelleRang(1).length);
  });
});
