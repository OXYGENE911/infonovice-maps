import { describe, it, expect } from 'vitest';
import {
  volDOiseauM, ratioDetour, meriteUneAlternative, vautLaPeine,
  relaisDuTrace, phraseAlternative,
  RATIO_SUSPECT, GAIN_MIN_M, GAIN_MIN_PART,
} from '../src/lib/detour';

/* QUAND LE SERVICE PROPOSE UN DÉTOUR (ROUTE-1, 02/09).
 *
 * LE TERRAIN. Armelin : « je ne comprends pas l'itinéraire… qui me fait faire
 * presque 200 km de plus que le trajet des autres GPS ». Vérifié :
 * Saumur → Montignac-Lascaux rend 492 km chez nous, 345 partout ailleurs.
 *
 * LA CAUSE EST DANS LE GRAPHE PUBLIC, pas dans notre code : les trois moteurs
 * d'IGN rendent la même chose, et la mesure dit pourquoi — le moteur est juste
 * sur autoroute (×1,06 sur Paris → Lyon) et surestime de moitié le temps sur
 * les nationales (×1,51 sur Poitiers → Limoges). Il fuit donc le corridor
 * direct.
 *
 * CES TESTS DÉFENDENT LES TROIS GARDES : un détecteur gratuit, une règle de
 * gain qui écarte les fausses bonnes idées, et des relais pris sur la LONGUEUR
 * du tracé. */

/* Les coordonnées réelles des trajets mesurés le 02/09. */
const SAUMUR = { lon: -0.0769, lat: 47.2603 };
const MONTIGNAC = { lon: 1.1614, lat: 45.0661 };
const PARIS = { lon: 2.3522, lat: 48.8566 };
const LYON = { lon: 4.8357, lat: 45.7640 };

describe('volDOiseauM', () => {
  it('retrouve les distances mesurées', () => {
    /* 262 km relevés le 02/09 entre Saumur et Montignac. */
    expect(volDOiseauM(SAUMUR, MONTIGNAC) / 1000).toBeCloseTo(262, -1);
    expect(volDOiseauM(PARIS, LYON) / 1000).toBeCloseTo(391, -1);
  });

  it('rend zéro entre un point et lui-même', () => {
    expect(volDOiseauM(PARIS, PARIS)).toBeCloseTo(0, 6);
  });
});

describe('meriteUneAlternative — le détecteur gratuit', () => {
  /* LES QUATORZE TRAJETS MESURÉS LE 02/09 : les liaisons autoroutières
     ordinaires tiennent entre 1,10 et 1,36 ; Saumur → Montignac sort à 1,88. */
  it('parle sur le trajet d’Armelin, à 1,88', () => {
    expect(ratioDetour(492_000, SAUMUR, MONTIGNAC)).toBeCloseTo(1.88, 1);
    expect(meriteUneAlternative(492_000, SAUMUR, MONTIGNAC)).toBe(true);
  });

  /* PARIS → LYON EST NORMAL : 466 km pour 391 de vol d'oiseau, ratio 1,19.
     Le faire parler dépenserait deux requêtes pour un trajet parfait. */
  it('se tait sur une liaison autoroutière ordinaire', () => {
    expect(ratioDetour(466_000, PARIS, LYON)).toBeCloseTo(1.19, 1);
    expect(meriteUneAlternative(466_000, PARIS, LYON)).toBe(false);
  });

  it('se tait plutôt que de diviser par zéro', () => {
    expect(ratioDetour(10_000, PARIS, PARIS)).toBe(0);
    expect(meriteUneAlternative(10_000, PARIS, PARIS)).toBe(false);
    expect(ratioDetour(0, SAUMUR, MONTIGNAC)).toBe(0);
  });

  it('garde le seuil mesuré', () => {
    expect(RATIO_SUSPECT).toBe(1.5);
  });
});

describe('vautLaPeine — la règle de proposition', () => {
  /* LES SEPT TRAJETS ÉPROUVÉS LE 02/09, avec le résultat du « direct ». */
  it('propose les trois vrais cas', () => {
    expect(vautLaPeine(492_000, 318_000), 'Saumur → Montignac').toBe(true);
    expect(vautLaPeine(166_000, 98_000), 'Saumur → Poitiers').toBe(true);
    expect(vautLaPeine(685_000, 560_000), 'Poitiers → Grenoble').toBe(true);
  });

  /* ET ÉCARTE LES QUATRE AUTRES. Lyon → Nice gagne 41 km mais seulement
     8,6 % : sur un trajet de montagne, c'est le prix du relief, pas un
     détour. */
  it('écarte un gain trop maigre en proportion', () => {
    expect(vautLaPeine(477_000, 436_000), 'Lyon → Nice').toBe(false);
  });

  it('écarte les gains trop petits en absolu', () => {
    expect(vautLaPeine(376_000, 363_000), 'Clermont → Toulouse').toBe(false);
    expect(vautLaPeine(554_000, 535_000), 'Lille → Strasbourg').toBe(false);
  });

  /* LE DIRECT PEUT ÊTRE PIRE, et c'est le cas sur Paris → Lyon : 499 km
     contre 466. Le proposer serait proposer un détour. */
  it('écarte un « direct » plus long que le trajet du service', () => {
    expect(vautLaPeine(466_000, 499_000), 'Paris → Lyon').toBe(false);
  });

  /* LES DEUX CONDITIONS SONT NÉCESSAIRES : le pourcentage seul proposerait
     8 km sur 60, les kilomètres seuls 26 km sur 700. */
  it('exige LES DEUX conditions, pas l’une ou l’autre', () => {
    // 20 % de gain, mais 12 km : trop petit pour se voir.
    expect(vautLaPeine(60_000, 48_000)).toBe(false);
    // 30 km de gain, mais 4 % : invisible sur un long trajet.
    expect(vautLaPeine(700_000, 670_000)).toBe(false);
    expect(GAIN_MIN_M).toBe(25_000);
    expect(GAIN_MIN_PART).toBeCloseTo(0.1, 5);
  });

  it('refuse des distances absurdes plutôt que de rendre vrai', () => {
    expect(vautLaPeine(0, 100)).toBe(false);
    expect(vautLaPeine(100_000, 0)).toBe(false);
  });
});

describe('relaisDuTrace', () => {
  /* UNE LIGNE DROITE DE ONZE POINTS ÉGAUX : le quart, la moitié et les trois
     quarts tombent sur des points connus. */
  const droite: [number, number][] = Array.from(
    { length: 11 }, (_, i) => [i * 0.1, 45] as [number, number],
  );

  it('prend les points aux fractions de la LONGUEUR', () => {
    const r = relaisDuTrace(droite);
    expect(r).toHaveLength(3);
    expect(r[1]!.lon).toBeCloseTo(0.5, 2);
  });

  /* UN TRACÉ EST DENSE EN VILLE ET CLAIRSEMÉ SUR AUTOROUTE : le milieu du
     TABLEAU n'est pas le milieu du CHEMIN. Ici, dix points serrés au début et
     un seul très loin — la moitié de la longueur tombe donc dans le grand
     saut, pas au dixième point. */
  it('ne confond pas le milieu du tableau et le milieu du chemin', () => {
    const inegal: [number, number][] = [
      ...Array.from({ length: 10 }, (_, i) => [i * 0.001, 45] as [number, number]),
      [2, 45],
    ];
    const r = relaisDuTrace(inegal);
    expect(r[1]!.lon, 'le milieu doit tomber après le grand saut')
      .toBeGreaterThan(0.5);
  });

  it('rend une liste vide sur un tracé inexploitable', () => {
    expect(relaisDuTrace([])).toEqual([]);
    expect(relaisDuTrace([[1, 45]])).toEqual([]);
    expect(relaisDuTrace([[1, 45], [1, 45]])).toEqual([]);
  });
});

describe('phraseAlternative', () => {
  it('donne les deux chiffres, en kilomètres entiers', () => {
    const p = phraseAlternative(492_000, 318_000);
    expect(p).toContain('318 km');
    expect(p).toContain('492');
  });
});
