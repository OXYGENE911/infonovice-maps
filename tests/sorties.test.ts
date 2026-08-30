import { describe, it, expect } from 'vitest';
import {
  versSorties, versDestinations, sortieA, destinationA,
  fragmentSorties, MAX_VILLES, FENETRE_SORTIE_M,
} from '../src/lib/sorties';
import { requeteCorridor, versCorridor, CORRIDOR_VIDE } from '../src/lib/corridor';

/* LES SORTIES ET LEURS DESTINATIONS (SORTIE-1, demande d'Armelin du 30/08 :
 * « fais le numéro de sortie et la destination »).
 *
 * Les valeurs de ces parcours sont RÉELLES : elles viennent du relevé du
 * 30/08 sur le corridor Paris → Melun (46 nœuds de divergence, 82 bretelles
 * annonçant des villes). */

/** Une route droite vers l'est, un point tous les 100 m. */
function versLEst(n: number, lat = 48.85, lon0 = 2.35): [number, number][] {
  const pas = 100 / (111_320 * Math.cos((lat * Math.PI) / 180));
  return Array.from({ length: n }, (_, i) => [lon0 + i * pas, lat] as [number, number]);
}

const trace = versLEst(200); // 20 km

const noeud = (i: number, tags: Record<string, string>) => ({
  type: 'node', lon: trace[i]![0], lat: trace[i]![1],
  tags: { highway: 'motorway_junction', ...tags },
});

describe('versSorties', () => {
  it('recoud les nœuds de divergence, numéro et nom compris', () => {
    const rendu = versSorties([
      noeud(50, { ref: '16', name: 'Châtillon-la-Borde' }),
      noeud(10, { ref: '5' }),
    ], trace);
    // Triées par avancement : la 5 vient avant la 16.
    expect(rendu.map((s) => s.numero)).toEqual(['5', '16']);
    expect(rendu[1]!.nom).toBe('Châtillon-la-Borde');
    expect(rendu[0]!.avancementM).toBeCloseTo(1_000, -2);
  });

  it('JETTE le nœud qui ne dit rien — la moitié des relevés sont dans ce cas', () => {
    /* Mesuré le 30/08 : 46 nœuds sur le corridor, 18 avec un numéro. Un nœud
       sans numéro NI nom n'apprend rien à personne. */
    expect(versSorties([noeud(20, {})], trace)).toEqual([]);
  });

  it('REFUSE ce qui ne ressemble pas à un numéro de sortie', () => {
    /* `ref` est un champ libre : une aire de service s'y glisse. On garde
       alors le nom, sans prétendre à un numéro. */
    const rendu = versSorties([noeud(30, { ref: 'Aire de Darvault', name: 'Aire de Darvault' })], trace);
    expect(rendu).toHaveLength(1);
    expect(rendu[0]!.numero).toBeNull();
    expect(rendu[0]!.nom).toBe('Aire de Darvault');
  });

  it('accepte les numéros à lettre — « 14a » et « 14b » existent', () => {
    expect(versSorties([noeud(40, { ref: '14a' })], trace)[0]!.numero).toBe('14a');
  });

  it('ÉCARTE ce qui n’est pas sur la chaussée suivie', () => {
    const ailleurs = { type: 'node', lon: trace[50]![0], lat: 48.855,
      tags: { highway: 'motorway_junction', ref: '9' } };
    expect(versSorties([ailleurs], trace)).toEqual([]);
  });

  it('ignore ce qui n’est ni un nœud ni une divergence, et ne lève sur RIEN', () => {
    expect(versSorties([
      { type: 'way', tags: { highway: 'motorway_junction', ref: '9' } },
      { type: 'node', lon: trace[10]![0], lat: trace[10]![1], tags: { highway: 'traffic_signals' } },
      null, 'bruit',
    ], trace)).toEqual([]);
  });
});

describe('versDestinations', () => {
  it('ne lève pas non plus sur une liste bruitée', () => {
    expect(versDestinations([null, 'bruit', 42], trace)).toEqual([]);
  });

  const bretelle = (i: number, tags: Record<string, string>) => ({
    type: 'way',
    geometry: [{ lon: trace[i]![0], lat: trace[i]![1] }],
    tags: { highway: 'motorway_link', ...tags },
  });

  it('découpe les villes dans l’ordre du panneau', () => {
    // Valeur RÉELLE relevée le 30/08.
    const rendu = versDestinations([bretelle(20, {
      destination: 'Lyon;Évry', 'destination:ref': 'A 6a',
    })], trace);
    expect(rendu[0]!.villes).toEqual(['Lyon', 'Évry']);
    expect(rendu[0]!.route).toBe('A 6a');
  });

  it('S’ARRÊTE À TROIS VILLES : un panneau n’en aligne pas six', () => {
    /* Valeur réelle : « Troyes;Corbeil-Essonnes;Sénart;Melun;Marne-la-Vallée;
       Lisses-Centre ». Les trois premières sont les plus structurantes —
       c'est l'ordre du panneau qu'OpenStreetMap reprend. */
    const rendu = versDestinations([bretelle(30, {
      destination: 'Troyes;Corbeil-Essonnes;Sénart;Melun;Marne-la-Vallée;Lisses-Centre',
    })], trace);
    expect(rendu[0]!.villes).toHaveLength(MAX_VILLES);
    expect(rendu[0]!.villes).toEqual(['Troyes', 'Corbeil-Essonnes', 'Sénart']);
  });

  it('rend une route nulle quand la bretelle n’en annonce pas', () => {
    const rendu = versDestinations([bretelle(10, {
      destination: 'Périphérique;Porte de Bercy;Charenton',
    })], trace);
    expect(rendu[0]!.route).toBeNull();
  });

  it('ignore une bretelle sans destination utilisable, et une géométrie vide', () => {
    expect(versDestinations([
      bretelle(10, { destination: '  ;  ' }),
      { type: 'way', tags: { destination: 'Lyon' }, geometry: [] },
    ], trace)).toEqual([]);
  });
});

describe('sortieA', () => {
  const sorties = [
    { avancementM: 5_000, numero: '14', nom: null },
    { avancementM: 12_000, numero: '15', nom: 'Sens' },
  ];

  it('trouve la sortie de CETTE manœuvre, la plus proche dans la fenêtre', () => {
    /* Le nœud de divergence et le point de manœuvre décrivent le même
       endroit vu par deux producteurs : la fenêtre absorbe leur désaccord. */
    expect(sortieA(sorties, 5_100)?.numero).toBe('14');
    expect(sortieA(sorties, 4_900)?.numero).toBe('14');
  });

  it('SE TAIT hors fenêtre : la sortie suivante n’est pas celle-ci', () => {
    expect(sortieA(sorties, 5_000 + FENETRE_SORTIE_M + 1)).toBeNull();
    expect(sortieA([], 5_000)).toBeNull();
  });
});

describe('destinationA', () => {
  const destinations = [
    { avancementM: 5_050, villes: ['Lyon'], route: 'A 6' },
    { avancementM: 9_000, villes: ['Sens'], route: null },
  ];

  it('regarde DEVANT : la bretelle commence à la manœuvre, elle ne la précède pas', () => {
    expect(destinationA(destinations, 5_000)?.villes).toEqual(['Lyon']);
    // Cinquante mètres d'amont tolérés — le désaccord des producteurs.
    expect(destinationA(destinations, 5_090)?.villes).toEqual(['Lyon']);
  });

  it('ne va pas chercher la bretelle d’après', () => {
    expect(destinationA(destinations, 4_000)).toBeNull();
    expect(destinationA(destinations, 6_000)).toBeNull();
  });
});

describe('requeteCorridor', () => {
  it('demande TOUT EN UN SEUL APPEL : Overpass est un commun bénévole', () => {
    const q = requeteCorridor(trace);
    expect(q, 'les limites').toContain('maxspeed');
    expect(q, 'les sorties').toContain('motorway_junction');
    expect(q, 'les destinations').toContain('[destination]');
    expect(q, 'les giratoires').toContain('junction=roundabout');
    /* DEUX `out` DANS UNE SEULE REQUÊTE, et c'est voulu : les branches d'un
       giratoire se cherchent à partir de ses nœuds, ce qui demande un second
       jeu de résultats. Overpass l'accepte dans la même requête — donc un
       seul aller-retour, ce qui est toute la question pour un service tenu
       par des bénévoles. */
    expect(q.match(/out geom tags;/g)).toHaveLength(2);
    expect(q, 'les branches se cherchent par les nœuds de l’anneau')
      .toContain('way(bn.bords)[highway]');
    expect(q.startsWith('[out:json]')).toBe(true);
  });

  it('cherche les sorties PLUS LARGE que les limites, et c’est voulu', () => {
    /* Vingt-cinq mètres pour les limites : on veut LA route qu'on suit.
       Quarante pour les sorties : le nœud de divergence est posé au point où
       la bretelle se détache, que les deux producteurs ne placent pas au
       même mètre. */
    const q = requeteCorridor(trace);
    expect(q).toContain('around:25,');
    expect(q).toContain('around:40,');
    expect(fragmentSorties('48.85,2.35')).toContain('around:40,48.85,2.35');
  });
});

describe('versCorridor', () => {
  it('trie une réponse en ses trois relevés, chacun prenant ce qu’il reconnaît', () => {
    const reponse = { elements: [
      noeud(50, { ref: '16' }),
      { type: 'way', tags: { highway: 'motorway_link', destination: 'Lyon' },
        geometry: [{ lon: trace[52]![0], lat: trace[52]![1] }] },
      { type: 'way', tags: { highway: 'motorway', maxspeed: '130' },
        geometry: [
          { lon: trace[0]![0], lat: trace[0]![1] },
          { lon: trace[60]![0], lat: trace[60]![1] },
        ] },
    ] };
    const c = versCorridor(reponse, trace);
    expect(c.sorties).toHaveLength(1);
    expect(c.destinations).toHaveLength(1);
    expect(c.limites).toHaveLength(1);
    expect(c.limites[0]!.kmh).toBe(130);
  });

  it('REFUSE ce qui n’est pas une réponse, sans lever', () => {
    expect(versCorridor(null, trace)).toEqual(CORRIDOR_VIDE);
    expect(versCorridor({ elements: 'non' }, trace)).toEqual(CORRIDOR_VIDE);
  });
});
