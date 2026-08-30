import { describe, it, expect } from 'vitest';
import {
  compterFeux, versFeux, requeteFeux, carrefoursDistincts,
  RAYON_FEU_M, GROUPE_CARREFOUR_M,
} from '../src/lib/feux';

/* LES FEUX DES TROIS VARIANTES (FEUX-1, demande d'Armelin du 30/08).
 *
 * CE QUI SE TESTE ICI EST LE COMPTAGE, et il a un piège : un carrefour à feux
 * porte plusieurs nœuds — un par branche d'accès. Compter les nœuds donnerait
 * trois à quatre fois trop, et le chiffre servirait à comparer deux
 * itinéraires : faux, il ferait choisir le mauvais. */

/** Une route droite vers l'est, un point tous les 100 m. */
function versLEst(n: number, lat = 48.85, lon0 = 2.35): [number, number][] {
  const pas = 100 / (111_320 * Math.cos((lat * Math.PI) / 180));
  return Array.from({ length: n }, (_, i) => [lon0 + i * pas, lat] as [number, number]);
}

const trace = versLEst(100); // 10 km

/** Un feu posé sur le tracé, à `metres` du départ et `ecart` mètres de côté. */
function feu(metres: number, ecart = 0) {
  const i = Math.round(metres / 100);
  return { lon: trace[i]![0], lat: 48.85 + ecart / 111_320 };
}

describe('compterFeux', () => {
  it('compte les feux qui bordent le tracé', () => {
    expect(compterFeux([feu(1_000), feu(3_000), feu(7_000)], trace)).toBe(3);
  });

  it('COMPTE UN CARREFOUR, PAS SES QUATRE TÊTES DE FEUX', () => {
    /* C'est le piège du module : un croisement urbain porte un nœud par
       branche d'accès. Quatre nœuds au même endroit, c'est UN arrêt. */
    const carrefour = [feu(2_000), feu(2_010), feu(2_020), feu(2_030)];
    expect(compterFeux(carrefour, trace)).toBe(1);
  });

  it('sépare deux carrefours voisins mais distincts', () => {
    // Cent mètres : deux arrêts sur un boulevard, pas un seul.
    expect(compterFeux([feu(2_000), feu(2_100)], trace)).toBe(2);
    // Et juste au seuil, ils n'en font qu'un.
    expect(compterFeux([feu(2_000), feu(2_000 + GROUPE_CARREFOUR_M - 5)], trace)).toBe(1);
  });

  it('ÉCARTE le feu de la rue parallèle', () => {
    /* Vingt mètres : le feu du carrefour qu'on traverse est sur la chaussée
       ou à son bord ; celui d'à côté est plus loin. Sans ce filtre, un
       boulevard doublé d'une contre-allée compterait double. */
    expect(compterFeux([feu(2_000, RAYON_FEU_M + 30)], trace)).toBe(0);
    expect(compterFeux([feu(2_000, RAYON_FEU_M - 5)], trace)).toBe(1);
  });

  it('regroupe LE LONG DU TRAJET, pas à vol d’oiseau', () => {
    /* DEUX FEUX À TRENTE MÈTRES L'UN DE L'AUTRE DANS LE PLAN, mais à deux
       kilomètres l'un de l'autre SUR LA ROUTE : ce sont deux arrêts. Un
       regroupement à vol d'oiseau n'en verrait qu'un — c'est le cas d'une
       rue en U, d'un demi-tour, d'un échangeur. */
    const aller = versLEst(20);                       // 2 km vers l'est
    const retour = versLEst(20, 48.8503).reverse();   // 33 m au nord, en sens inverse
    const enU: [number, number][] = [...aller, ...retour];
    const feuAller = { lon: aller[2]![0], lat: 48.85 };
    const feuRetour = { lon: aller[2]![0], lat: 48.8503 };
    expect(compterFeux([feuAller, feuRetour], enU)).toBe(2);
  });

  it('ne compte QU’UNE FOIS un feu traversé deux fois — et c’est assumé', () => {
    /* Un tracé qui repasse au même endroit (une boucle, un demi-tour) ne
       fait compter son feu qu'une fois : la projection retient le point le
       plus proche, et il n'y en a qu'un. Le cas est rare et le chiffre sert
       à COMPARER trois itinéraires, pas à promettre un décompte exact. Le
       dire vaut mieux que le laisser croire. */
    const boucle: [number, number][] = [...versLEst(20), ...versLEst(20).reverse()];
    expect(compterFeux([{ lon: versLEst(20)[10]![0], lat: 48.85 }], boucle)).toBe(1);
  });

  it('ne lève pas sur un tracé dégénéré ni sur une liste vide', () => {
    expect(compterFeux([], trace)).toBe(0);
    expect(compterFeux([feu(1_000)], [])).toBe(0);
  });
});

describe('carrefoursDistincts', () => {
  it('ne garde qu’un feu par carrefour — pour la carte', () => {
    const rendu = carrefoursDistincts([feu(2_000), feu(2_010), feu(5_000)]);
    expect(rendu).toHaveLength(2);
  });
});

describe('requeteFeux', () => {
  it('demande les trois corridors EN UN SEUL appel', () => {
    /* Les corridors se recouvrent largement, et Overpass est tenu par des
       bénévoles : trois requêtes là où une suffit seraient trois fois trop. */
    const q = requeteFeux([versLEst(20), versLEst(20, 48.86), versLEst(20, 48.87)]);
    expect(q).toContain('highway=traffic_signals');
    expect(q).toContain(`around:${RAYON_FEU_M},`);
    expect(q.match(/node\(around/g), 'une seule interrogation').toHaveLength(1);
    // Les trois latitudes sont dans la polyligne.
    expect(q).toContain('48.85');
    expect(q).toContain('48.86');
    expect(q).toContain('48.87');
  });

  it('ignore un tracé vide sans produire de requête bancale', () => {
    expect(requeteFeux([[], versLEst(20)])).toContain('48.85');
  });
});

describe('versFeux', () => {
  it('relit les nœuds rendus par Overpass', () => {
    expect(versFeux({ elements: [{ type: 'node', id: 1, lon: 2.35, lat: 48.85 }] }))
      .toEqual([{ lon: 2.35, lat: 48.85 }]);
  });

  it('REFUSE ce qui n’est pas une réponse — elle vient d’un service', () => {
    expect(versFeux(null)).toEqual([]);
    expect(versFeux({ elements: 'non' })).toEqual([]);
    expect(versFeux({ elements: [null, 'bruit', { type: 'way' }, { type: 'node' }] })).toEqual([]);
  });
});
