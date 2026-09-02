import { describe, it, expect } from 'vitest';
import {
  tonnesDe, versTonnages, tonnagesInterdits, phraseTonnage, RAYON_TONNAGE_M,
} from '../src/lib/tonnage';

/* LES LIMITES DE TONNAGE (PONT-1, 02/09).
 *
 * Armelin : « ma Vinfast VF8 Plus […] pèse 2 520 kg et peut être dangereuse
 * sur certains ponts de France. Par exemple, le pont de fer situé entre
 * Coudret et Germeville en Charente a fait l'objet d'une limitation à
 * 2 tonnes. »
 *
 * MESURÉ AVANT D'ÉCRIRE : 184 chemins `maxweight` dans 35 × 30 km de Charente
 * — 122 à 3,5 t, 26 à 10 t, 22 à 19 t. Les valeurs des tests ci-dessous sont
 * celles-là. */

/** Un tracé droit d'un kilomètre, plein est, au 48,85e parallèle. */
const TRACE: [number, number][] = Array.from({ length: 21 }, (_, i) => [
  2.35 + i * 0.00045, 48.85,
]);

/** Un chemin d'OSM, tel qu'Overpass le rend. */
const chemin = (maxweight: unknown, o: { nom?: string; lon?: number } = {}) => ({
  type: 'way', id: 1,
  tags: { maxweight, ...(o.nom === undefined ? {} : { name: o.nom }) },
  geometry: [
    { lat: 48.85, lon: o.lon ?? 2.3545 },
    { lat: 48.85, lon: (o.lon ?? 2.3545) + 0.0002 },
  ],
});

describe('tonnesDe', () => {
  it('lit les écritures réelles du jeu : « 3.5 », « 10 », « 19 »', () => {
    expect(tonnesDe('3.5')).toBe(3.5);
    expect(tonnesDe('10')).toBe(10);
    expect(tonnesDe('19')).toBe(19);
  });

  it('accepte l’unité explicite, que la spécification autorise', () => {
    expect(tonnesDe('3.5 t')).toBe(3.5);
    expect(tonnesDe('7500 kg')).toBe(7.5);
  });

  it('LIT LES LIVRES PLUTÔT QUE DE LES PRENDRE POUR DES TONNES', () => {
    /* 7 500 lbs valent 3,4 t, pas 7 500. L'erreur serait silencieuse et
       transformerait un pont interdit en pont autorisé. */
    expect(tonnesDe('7500 lbs')).toBeCloseTo(3.402, 2);
  });

  it('la virgule décimale passe, elle traîne dans les données françaises', () => {
    expect(tonnesDe('3,5')).toBe(3.5);
  });

  it('rend null sur ce qui n’est pas un poids', () => {
    /* `maxweight=no` et `maxweight=none` existent dans OSM : les lire comme
       zéro tonne interdirait la route à tout le monde. */
    expect(tonnesDe('none')).toBeNull();
    expect(tonnesDe('no')).toBeNull();
    expect(tonnesDe('')).toBeNull();
    expect(tonnesDe(null)).toBeNull();
    expect(tonnesDe('0')).toBeNull();
  });
});

describe('versTonnages', () => {
  it('retient un passage limité qui touche le tracé', () => {
    const r = versTonnages({ elements: [chemin('2', { nom: 'Pont de fer' })] }, TRACE);
    expect(r).toHaveLength(1);
    expect(r[0]!.tonnes).toBe(2);
    expect(r[0]!.nom).toBe('Pont de fer');
  });

  it('UN SEUL POINT PROCHE SUFFIT — un pont fait parfois trente mètres', () => {
    /* C'est la différence avec les limites de vitesse, qui exigent deux points
       et cent mètres. Cette règle-là aurait écarté l'ouvrage même qu'on veut
       annoncer. */
    const court = {
      type: 'way', id: 2, tags: { maxweight: '2' },
      geometry: [{ lat: 48.85, lon: 2.3545 }],
    };
    expect(versTonnages({ elements: [court] }, TRACE)).toHaveLength(1);
  });

  it('ignore un chemin qui passe loin du tracé', () => {
    const loin = {
      type: 'way', id: 3, tags: { maxweight: '2' },
      geometry: [{ lat: 48.90, lon: 2.3545 }, { lat: 48.90, lon: 2.3547 }],
    };
    expect(versTonnages({ elements: [loin] }, TRACE)).toEqual([]);
  });

  it('les range du plus proche au plus lointain', () => {
    const r = versTonnages({ elements: [
      chemin('3.5', { lon: 2.3580 }), chemin('2', { lon: 2.3510 }),
    ] }, TRACE);
    expect(r.map((x) => x.tonnes)).toEqual([2, 3.5]);
  });

  it('une réponse informe ne fait rien tomber', () => {
    expect(versTonnages(null, TRACE)).toEqual([]);
    expect(versTonnages({ elements: 'oui' }, TRACE)).toEqual([]);
  });

  it('vingt-cinq mètres : LA route qu’on suit, pas la contre-allée', () => {
    expect(RAYON_TONNAGE_M).toBe(25);
  });
});

describe('tonnagesInterdits', () => {
  const limites = [
    { debutM: 100, tonnes: 2, nom: 'Pont de fer' },
    { debutM: 400, tonnes: 3.5, nom: null },
    { debutM: 900, tonnes: 19, nom: null },
  ];

  it('la VF8 d’Armelin (2 520 kg) ne passe pas le pont de 2 t', () => {
    const r = tonnagesInterdits(limites, 2_520);
    expect(r.map((x) => x.tonnes)).toEqual([2]);
  });

  it('une camionnette de 3,6 t est arrêtée deux fois', () => {
    expect(tonnagesInterdits(limites, 3_600).map((x) => x.tonnes)).toEqual([2, 3.5]);
  });

  it('SANS MASSE DÉCLARÉE, ON SE TAIT', () => {
    /* Aucune source publique française ne donne la masse d'un modèle. Le
       silence est donc le défaut, et il est voulu : alerter au hasard vaut
       moins que se taire. */
    expect(tonnagesInterdits(limites, null)).toEqual([]);
    expect(tonnagesInterdits(limites, 0)).toEqual([]);
    expect(tonnagesInterdits(limites, Number.NaN)).toEqual([]);
  });

  it('une limite égale à la masse passe — elle n’est pas « inférieure »', () => {
    /* Un panneau « 3,5 t » autorise 3,5 t. Interdire à l'égalité aurait
       détourné des véhicules parfaitement en règle. */
    expect(tonnagesInterdits([{ debutM: 0, tonnes: 3.5, nom: null }], 3_500))
      .toEqual([]);
  });
});

describe('phraseTonnage', () => {
  it('nomme l’ouvrage, la limite ET la masse', () => {
    /* C'est la COMPARAISON qui décide, et le conducteur doit pouvoir juger :
       vingt kilos d'écart ne valent pas une tonne. */
    expect(phraseTonnage({ debutM: 0, tonnes: 2, nom: 'Pont de fer' }, 2_520))
      .toBe('Pont de fer sur votre trajet est limité à 2 t —'
        + ' votre véhicule pèse 2,5 t.');
  });

  it('se passe d’un nom quand OSM n’en donne pas', () => {
    expect(phraseTonnage({ debutM: 0, tonnes: 3.5, nom: null }, 4_000))
      .toBe('Un passage sur votre trajet est limité à 3,5 t —'
        + ' votre véhicule pèse 4 t.');
  });
});
