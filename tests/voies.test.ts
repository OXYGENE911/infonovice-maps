import { describe, it, expect } from 'vitest';
import {
  recoudreVoies, voiesA, cotePlacement, voieConseillee, libellePlacement,
  recoudreEurope, europeA, urlVoies, versTroncons,
  PORTEE_RELEVE_M, type TronconVoies,
} from '../src/lib/voies';

/* LES VOIES (VOIE-1, demande d'Armelin des 29 et 30/08). Ce qui se teste à
 * sec : la COUTURE entre les deux itinéraires — c'est là que tout se joue —
 * et les refus, qui valent autant que les affirmations. */

/** Une route droite vers l'est, un point tous les 100 m. */
function versLEst(n: number, lat = 48.85, lon0 = 2.35): [number, number][] {
  const pas = 100 / (111_320 * Math.cos((lat * Math.PI) / 180));
  return Array.from({ length: n }, (_, i) => [lon0 + i * pas, lat] as [number, number]);
}

describe('recoudreVoies', () => {
  const trace = versLEst(200); // 20 km

  it('projette chaque tronçon sur le tracé suivi, dans l’ordre', () => {
    const troncons: TronconVoies[] = [
      { point: trace[100]!, voies: 2 },
      { point: trace[0]!, voies: 3 },
      { point: trace[50]!, voies: 4 },
    ];
    const releves = recoudreVoies(troncons, trace);
    expect(releves.map((r) => r.voies)).toEqual([3, 4, 2]);
    expect(releves[1]!.avancementM).toBeCloseTo(5_000, -2);
  });

  it('ÉCARTE ce qui n’est pas sur la chaussée suivie', () => {
    /* Mesuré le 30/08 : 1,9 % des tronçons pgr tombent à plus de 60 m du
       tracé osrm, jusqu'à 301 m — deux chaussées séparées, un échangeur pris
       autrement. Un nombre de voies pris sur la chaussée d'en face serait un
       mensonge, pas une approximation. */
    const loin: [number, number] = [trace[50]![0], 48.855]; // ~550 m au nord
    expect(recoudreVoies([{ point: loin, voies: 4 }], trace)).toEqual([]);
  });

  it('REFUSE un nombre de voies nul ou absurde : c’est un « je ne sais pas »', () => {
    // Mesuré : le service rend « 0 » sur huit tronçons d'un Paris-Lyon.
    const rendu = recoudreVoies([
      { point: trace[10]!, voies: 0 },
      { point: trace[20]!, voies: 99 },
      { point: trace[30]!, voies: Number.NaN },
      { point: trace[40]!, voies: 2 },
    ], trace);
    expect(rendu.map((r) => r.voies)).toEqual([2]);
  });

  it('ne garde qu’un relevé par CHANGEMENT — mille tronçons se lisent à chaque fixe', () => {
    const troncons = [0, 10, 20, 30, 40].map((i) => ({ point: trace[i]!, voies: 3 }));
    troncons.push({ point: trace[60]!, voies: 2 });
    const rendu = recoudreVoies(troncons, trace);
    expect(rendu.map((r) => r.voies)).toEqual([3, 2]);
  });

  it('ne lève pas sur un tracé dégénéré', () => {
    expect(recoudreVoies([{ point: [2.35, 48.85], voies: 3 }], [])).toEqual([]);
  });
});

describe('voiesA', () => {
  /* L'ESPACEMENT EST CELUI DU TERRAIN : les tronçons de la BD TOPO font
     quelques centaines de mètres (mesuré : 1 028 tronçons sur 466 km, soit
     450 m en moyenne). Une fixture à cinq kilomètres d'écart ferait taire la
     lecture — et c'est exactement ce que la portée doit faire. */
  const releves = [
    { avancementM: 0, voies: 2 },
    { avancementM: 600, voies: 3 },
    { avancementM: 1_400, voies: 4 },
  ];

  it('rend le dernier relevé au plus tard ici : une chaussée garde ses voies', () => {
    expect(voiesA(releves, 0)).toBe(2);
    expect(voiesA(releves, 599)).toBe(2);
    expect(voiesA(releves, 600)).toBe(3);
    expect(voiesA(releves, 1_399)).toBe(3);
    expect(voiesA(releves, 2_000)).toBe(4);
  });

  it('SE TAIT loin du dernier relevé, au lieu de prolonger un chiffre périmé', () => {
    expect(voiesA(releves, 1_400 + PORTEE_RELEVE_M + 1)).toBeNull();
    expect(voiesA([], 100)).toBeNull();
    // Avant le premier relevé, on ne sait rien non plus.
    expect(voiesA([{ avancementM: 900, voies: 3 }], 100)).toBeNull();
  });
});

describe('cotePlacement', () => {
  it('déduit le côté des manœuvres qui en ont un', () => {
    expect(cotePlacement('right')).toBe('droite');
    expect(cotePlacement('slight right')).toBe('droite');
    expect(cotePlacement('sharp left')).toBe('gauche');
  });

  it('SE TAIT sur tout le reste — une consigne inutile use la confiance', () => {
    expect(cotePlacement('straight')).toBeNull();
    expect(cotePlacement('uturn')).toBeNull();
    expect(cotePlacement('rond-point')).toBeNull();
    expect(cotePlacement('arrivee')).toBeNull();
  });
});

describe('voieConseillee', () => {
  it('désigne la voie la plus EXTÉRIEURE, une seule', () => {
    /* Sans affectation par voie (pas de `turn:lanes` ici), c'est la seule
       chose que la règle de circulation permette d'affirmer. */
    expect(voieConseillee(3, 'droite')).toBe(3);
    expect(voieConseillee(3, 'gauche')).toBe(1);
    expect(voieConseillee(4, 'droite')).toBe(4);
  });

  it('ne conseille RIEN sur une chaussée à une voie : ce serait du bruit', () => {
    expect(voieConseillee(1, 'droite')).toBeNull();
  });

  it('ne conseille rien sans côté, ni sur une donnée absurde', () => {
    expect(voieConseillee(3, null)).toBeNull();
    expect(voieConseillee(0, 'droite')).toBeNull();
    expect(voieConseillee(Number.NaN, 'gauche')).toBeNull();
  });
});

describe('libellePlacement', () => {
  it('dit le nombre de voies, et le conseil quand il y en a un', () => {
    expect(libellePlacement(3, 3)).toBe('3 voies, placez-vous sur la voie de droite');
    expect(libellePlacement(3, 1)).toBe('3 voies, placez-vous sur la voie de gauche');
    expect(libellePlacement(2, null)).toBe('2 voies');
  });
});

/* LE CARTOUCHE VERT EUROPÉEN (EURO-1, 30/08). La donnée vient de la MÊME
 * requête que les voies — une seconde requête pour un seul champ coûterait
 * deux fois seize secondes au service public. */

describe('recoudreEurope', () => {
  const trace = versLEst(200);

  it('recoud les numéros, et « E15/E50 » en porte DEUX', () => {
    // Valeur RÉELLE, relevée le 30/08 sur bdtopo-pgr.
    const rendu = recoudreEurope([
      { point: trace[0]!, voies: 3, europe: 'E15/E50' },
      { point: trace[100]!, voies: 3, europe: 'E54' },
    ], trace);
    expect(rendu).toHaveLength(2);
    expect(rendu[0]!.routes).toEqual(['E15', 'E50']);
    expect(rendu[1]!.routes).toEqual(['E54']);
  });

  it('IGNORE les tronçons sans numéro européen — la plupart n’en ont pas', () => {
    expect(recoudreEurope([
      { point: trace[0]!, voies: 3 },
      { point: trace[10]!, voies: 3, europe: '' },
    ], trace)).toEqual([]);
  });

  it('ÉCARTE ce qui n’est pas sur la chaussée suivie, comme pour les voies', () => {
    const loin: [number, number] = [trace[50]![0], 48.855];
    expect(recoudreEurope([{ point: loin, voies: 3, europe: 'E15' }], trace)).toEqual([]);
  });

  it('ne garde qu’un relevé par CHANGEMENT : l’E15 court sur des centaines de tronçons', () => {
    const rendu = recoudreEurope([
      { point: trace[0]!, voies: 3, europe: 'E15' },
      { point: trace[10]!, voies: 3, europe: 'E15' },
      { point: trace[20]!, voies: 3, europe: 'E15/E50' },
    ], trace);
    expect(rendu.map((r) => r.routes.join('/'))).toEqual(['E15', 'E15/E50']);
  });
});

describe('europeA', () => {
  const releves = [
    { avancementM: 0, routes: ['E15'] },
    { avancementM: 800, routes: ['E15', 'E50'] },
  ];

  it('rend le dernier relevé au plus tard ici', () => {
    expect(europeA(releves, 100)).toEqual(['E15']);
    expect(europeA(releves, 900)).toEqual(['E15', 'E50']);
  });

  it('SE TAIT hors portée, et sur une liste vide', () => {
    expect(europeA(releves, 800 + PORTEE_RELEVE_M + 1)).toEqual([]);
    expect(europeA([], 0)).toEqual([]);
  });
});

describe('urlVoies', () => {
  const paris = { lon: 2.3522, lat: 48.8566 };
  const lyon = { lon: 4.8357, lat: 45.764 };

  it('interroge la ressource des ATTRIBUTS, pas celle des manœuvres', () => {
    /* Tout tient dans ce paramètre : `bdtopo-osrm` rend les manœuvres et
       refuse ces attributs (« value should be one of name », mesuré le
       30/08) ; `bdtopo-pgr` fait l'inverse. */
    const url = urlVoies(paris, lyon);
    expect(url).toContain('resource=bdtopo-pgr');
    expect(url).toContain('getSteps=true');
  });

  it('demande les DEUX attributs en un seul appel', () => {
    const url = urlVoies(paris, lyon);
    expect(url).toContain('nombre_de_voies');
    expect(url).toContain('cpx_numero_route_europeenne');
    // Le séparateur du service est la barre verticale, encodée.
    expect(url).toContain('%7C');
  });

  it('emporte les étapes du trajet : le bis en pose une', () => {
    const url = urlVoies(paris, lyon, [{ lon: 3.1, lat: 47.2 }]);
    expect(url).toContain('intermediates=3.1,47.2');
  });
});

describe('versTroncons', () => {
  const reponse = {
    portions: [{ steps: [
      { geometry: { type: 'LineString', coordinates: [[2.35, 48.85]] },
        attributes: { nombre_de_voies: '3', cpx_numero_route_europeenne: 'E15/E50' } },
      // Un tronçon SANS nombre de voies, mais AVEC un numéro européen.
      { geometry: { type: 'LineString', coordinates: [[2.36, 48.85]] },
        attributes: { cpx_numero_route_europeenne: 'E54' } },
    ] }],
  };

  it('relit les deux champs — le service rend les nombres en TEXTE', () => {
    const rendu = versTroncons(reponse);
    expect(rendu).toHaveLength(2);
    expect(rendu[0]).toEqual({ point: [2.35, 48.85], voies: 3, europe: 'E15/E50' });
  });

  it('GARDE un tronçon sans nombre de voies : il porte l’autre champ', () => {
    /* Le jeter pour un champ absent perdrait le numéro européen. Zéro veut
       dire « je ne sais pas » : la couture des voies le refusera, celle des
       numéros n'en a pas besoin. */
    expect(versTroncons(reponse)[1]).toEqual({ point: [2.36, 48.85], voies: 0, europe: 'E54' });
  });

  it('REFUSE ce qui n’est pas une réponse — elle vient d’un service', () => {
    expect(versTroncons(null)).toEqual([]);
    expect(versTroncons({ portions: 'non' })).toEqual([]);
    expect(versTroncons({ portions: [{ steps: [{ geometry: {} }] }] })).toEqual([]);
  });
});
