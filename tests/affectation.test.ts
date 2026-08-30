import { describe, it, expect } from 'vitest';
import {
  parserAffectation, familleDe, voiesPour, memeSens,
  versAffectations, affectationA, libelleAffectation,
} from '../src/lib/affectation';

/* L'AFFECTATION PAR VOIE (AFFECT-1, demande d'Armelin du 30/08).
 *
 * TOUTES LES VALEURS DE CES PARCOURS SONT RÉELLES : elles viennent du relevé
 * du 30/08 sur Paris (503 chemins portant `turn:lanes`) et sur un trajet de
 * 16,5 km à travers la ville. Une erreur ici enverrait l'usager dans la
 * mauvaise file, ou pire, dans les voies du trafic d'en face. */

/** Une route droite vers l'est, un point tous les 100 m. */
function versLEst(n: number, lat = 48.85, lon0 = 2.35): [number, number][] {
  const pas = 100 / (111_320 * Math.cos((lat * Math.PI) / 180));
  return Array.from({ length: n }, (_, i) => [lon0 + i * pas, lat] as [number, number]);
}

const trace = versLEst(200); // 20 km plein est

describe('parserAffectation', () => {
  it('découpe une barre par voie, un point-virgule par mouvement', () => {
    expect(parserAffectation('left|through;right')).toEqual([['left'], ['through', 'right']]);
  });

  it('garde les cases VIDES : ce sont des voies, non peintes', () => {
    /* Valeur réelle du périphérique : trois voies qui continuent, deux qui
       sortent. Les perdre décalerait tous les rangs. */
    expect(parserAffectation('|||slight_right|slight_right')).toEqual([
      [], [], [], ['slight_right'], ['slight_right'],
    ]);
  });

  it('absorbe la casse, les espaces et le « none » de certains contributeurs', () => {
    expect(parserAffectation(' Left | none |THROUGH ')).toEqual([['left'], [], ['through']]);
  });

  it('rend une liste vide sur une valeur vide, sans lever', () => {
    expect(parserAffectation('')).toEqual([]);
    expect(parserAffectation('   ')).toEqual([]);
  });
});

describe('familleDe', () => {
  it('regroupe par CÔTÉ, pas par mot exact', () => {
    /* Le moteur annonce « tournez à droite » là où OpenStreetMap peint
       `slight_right` : exiger le mot exact ferait taire l'affichage
       précisément là où il sert. */
    expect(familleDe('right')).toBe('droite');
    expect(familleDe('slight right')).toBe('droite');
    expect(familleDe('sharp left')).toBe('gauche');
    expect(familleDe('straight')).toBe('tout_droit');
  });

  it('se tait sur ce qui n’a pas de voie dédiée', () => {
    expect(familleDe('rond-point')).toBeNull();
    expect(familleDe('arrivee')).toBeNull();
  });
});

describe('voiesPour', () => {
  const peri = parserAffectation('through|through|through|slight_right'); // valeur réelle

  it('désigne les voies qui autorisent EXPLICITEMENT la manœuvre', () => {
    expect(voiesPour(peri, 'right')).toEqual([4]);
    expect(voiesPour(peri, 'straight')).toEqual([1, 2, 3]);
  });

  it('désigne PLUSIEURS voies quand plusieurs servent', () => {
    const v = parserAffectation('left|through|through;right|right');
    expect(voiesPour(v, 'right')).toEqual([3, 4]);
    expect(voiesPour(v, 'through' as never)).toEqual([]);
    expect(voiesPour(v, 'straight')).toEqual([2, 3]);
  });

  it('lit les voies NON PEINTES comme « tout droit », et seulement pour tout droit', () => {
    /* Valeur réelle : `|||slight_right|slight_right`. La règle du marquage
       français veut qu'une voie qui tourne soit fléchée ; une voie qui
       continue ne l'est pas toujours. Mais pour un VIRAGE, une case vide ne
       dit rien — on préfère alors ne rien montrer. */
    const v = parserAffectation('|||slight_right|slight_right');
    expect(voiesPour(v, 'straight')).toEqual([1, 2, 3]);
    expect(voiesPour(v, 'right')).toEqual([4, 5]);
    expect(voiesPour(parserAffectation('||'), 'left')).toEqual([]);
  });

  it('ne désigne rien quand la manœuvre n’a pas de voie, ou qu’il n’y a rien', () => {
    expect(voiesPour(peri, 'rond-point')).toEqual([]);
    expect(voiesPour([], 'right')).toEqual([]);
  });
});

describe('memeSens', () => {
  it('reconnaît qu’on parcourt le chemin dans son sens', () => {
    const chemin: [number, number][] = [trace[10]!, trace[20]!];
    expect(memeSens(chemin, trace)).toBe(true);
  });

  it('reconnaît qu’on le parcourt à CONTRESENS — c’est le piège du module', () => {
    /* Sur une route à double sens, prendre `:forward` au lieu de
       `:backward` afficherait les voies du trafic d'en face. Pire qu'un
       écran vide. */
    const chemin: [number, number][] = [trace[20]!, trace[10]!];
    expect(memeSens(chemin, trace)).toBe(false);
  });

  it('ne lève pas sur des géométries dégénérées', () => {
    expect(memeSens([], trace)).toBe(true);
    expect(memeSens([trace[0]!], trace)).toBe(true);
  });
});

describe('versAffectations', () => {
  const chemin = (i: number, j: number, tags: Record<string, string>) => ({
    type: 'way', tags,
    geometry: [trace[i]!, trace[j]!].map((p) => ({ lon: p[0], lat: p[1] })),
  });

  it('pose l’affectation sur le trajet, du début à la fin du tronçon', () => {
    const a = versAffectations([chemin(10, 20, { 'turn:lanes': 'left|through' })], trace);
    expect(a).toHaveLength(1);
    expect(a[0]!.debutM).toBeCloseTo(1_000, -2);
    // La fin est prolongée : les flèches sont peintes AVANT le carrefour.
    expect(a[0]!.finM).toBeCloseTo(2_030, -2);
    expect(a[0]!.voies).toEqual([['left'], ['through']]);
  });

  it('CHOISIT LE BON SENS sur une route à double sens', () => {
    const bon = versAffectations([chemin(10, 20, {
      'turn:lanes:forward': 'left|through', 'turn:lanes:backward': 'right|right',
    })], trace);
    expect(bon[0]!.voies, 'on suit le chemin dans son sens').toEqual([['left'], ['through']]);

    const inverse = versAffectations([chemin(20, 10, {
      'turn:lanes:forward': 'right|right', 'turn:lanes:backward': 'left|through',
    })], trace);
    expect(inverse[0]!.voies, 'le chemin est numérisé à l’envers du nôtre')
      .toEqual([['left'], ['through']]);
  });

  it('ÉCARTE ce qui n’est pas sur la chaussée suivie', () => {
    const ailleurs = {
      type: 'way', tags: { 'turn:lanes': 'left|through' },
      geometry: [{ lon: trace[10]![0], lat: 48.856 }, { lon: trace[20]![0], lat: 48.856 }],
    };
    expect(versAffectations([ailleurs], trace)).toEqual([]);
  });

  it('ignore un chemin sans affectation, et ne lève sur rien', () => {
    expect(versAffectations([
      chemin(10, 20, { highway: 'primary' }),
      chemin(10, 20, { 'turn:lanes': '' }),
      null, 'bruit', { type: 'node' },
    ], trace)).toEqual([]);
  });
});

describe('affectationA', () => {
  const liste = [
    { debutM: 0, finM: 500, voies: [['through'], ['right']] },
    { debutM: 400, finM: 900, voies: [['left'], ['through']] },
  ];

  it('rend l’affectation qui s’applique ici', () => {
    expect(affectationA(liste, 100)).toEqual([['through'], ['right']]);
    expect(affectationA(liste, 700)).toEqual([['left'], ['through']]);
  });

  it('préfère la PLUS TARDIVE quand deux tronçons se chevauchent', () => {
    /* C'est le marquage le plus proche du carrefour qui décrit ce qu'on a
       sous les roues. */
    expect(affectationA(liste, 450)).toEqual([['left'], ['through']]);
  });

  it('SE TAIT en dehors', () => {
    expect(affectationA(liste, 1_000)).toBeNull();
    expect(affectationA([], 100)).toBeNull();
  });
});

describe('libelleAffectation', () => {
  const v = parserAffectation('through|through|through|slight_right');

  it('dit quelle voie prendre, comptée depuis la gauche', () => {
    expect(libelleAffectation(v, [4])).toBe('4 voies, prenez la 4e en partant de la gauche');
    expect(libelleAffectation(v, [1, 2])).toBe('4 voies, prenez la 1re et 2e en partant de la gauche');
  });

  it('ne fait pas de phrase quand tout passe, ou quand rien n’est su', () => {
    expect(libelleAffectation(v, [1, 2, 3, 4])).toBe('4 voies, toutes praticables');
    expect(libelleAffectation(v, [])).toBe('4 voies');
  });
});
