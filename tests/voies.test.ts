import { describe, it, expect } from 'vitest';
import {
  recoudreVoies, voiesA, cotePlacement, voieConseillee, libellePlacement,
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
