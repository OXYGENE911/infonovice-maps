import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  tuileDe, coteTuileM, tuilesDuCouloir, echantillonner, urlDeTuile, poidsEnMots,
  COULOIR_PAR_DEFAUT,
} from '../src/lib/couloir';
import { emporterLesTuiles } from '../src/carte/couloir-hors-ligne';

/* LE COULOIR HORS LIGNE (COULOIR-1, 08/09/2026).
 *
 * Tout se joue ici, à sec : une tuile oubliée fait un trou dans la carte au
 * milieu du tunnel, une tuile de trop est une requête prise à un service
 * public. Les chiffres cités sont MESURÉS, pas devinés.
 */

const PARIS: [number, number] = [2.3522, 48.8566];
const LYON: [number, number] = [4.8357, 45.7640];
/** Paris → Lyon en ligne droite : 465 km, assez pour dimensionner. */
const PARIS_LYON: [number, number][] = Array.from({ length: 40 }, (_, i) => {
  const t = i / 39;
  return [PARIS[0] + (LYON[0] - PARIS[0]) * t, PARIS[1] + (LYON[1] - PARIS[1]) * t];
});

describe('tuileDe', () => {
  it('place Paris sur la tuile connue du repère PM', () => {
    /* Repère vérifié contre le service : la tuile z12 de Notre-Dame est
       2074/1409 — c'est celle que le WMTS sert (relevé le 08/09). */
    expect(tuileDe(2.3522, 48.8566, 12)).toEqual({ z: 12, x: 2074, y: 1409 });
  });

  it('le Y passe par Mercator, pas par une règle de trois', () => {
    /* À l'équateur, Y est exactement au milieu ; une interpolation linéaire
       sur la latitude donnerait la même chose ICI et se tromperait partout
       ailleurs — d'où le second point, à 60° nord. */
    expect(tuileDe(0, 0, 2)).toEqual({ z: 2, x: 2, y: 2 });
    expect(tuileDe(0, 60, 2).y).toBe(1);
  });

  it('ne sort jamais de la grille, même sur un point aberrant', () => {
    expect(tuileDe(-181, 89.9, 3).x).toBe(0);
    expect(tuileDe(181, -89.9, 3).y).toBe(7);
  });
});

describe('coteTuileM', () => {
  it('donne les côtés mesurés à la latitude de la France', () => {
    // 46° nord : z12 ≈ 6,8 km, z13 ≈ 3,4 km. C'est ce qui fixe le pas.
    expect(Math.round(coteTuileM(46, 12))).toBe(6796);
    expect(Math.round(coteTuileM(46, 13))).toBe(3398);
  });
});

describe('echantillonner', () => {
  it('REPIQUE ENTRE LES SOMMETS : un tracé de deux points en donne beaucoup', () => {
    /* Le défaut que cela ferme : un itinéraire d'autoroute donne des sommets
       distants de plusieurs kilomètres. Sans repiquage, des tuiles entières
       ne seraient jamais demandées — un trou là où l'on roule le plus vite. */
    const points = [...echantillonner([PARIS, LYON], 10_000)];
    expect(points.length).toBeGreaterThan(40);
    expect(points[0]).toEqual(PARIS);
    expect(points[points.length - 1]).toEqual(LYON);
  });

  it('ne produit pas un point par sommet quand ils sont serrés', () => {
    /* Le reste à parcourir traverse les segments : cent sommets à dix mètres
       d'écart, repiqués tous les kilomètres, ne font pas cent points. */
    const serres: [number, number][] = Array.from({ length: 100 }, (_, i) => [2 + i / 10_000, 48]);
    const points = [...echantillonner(serres, 1_000)];
    expect(points.length).toBeLessThan(10);
  });

  it('un tracé vide ne donne rien, sans lever', () => {
    expect([...echantillonner([], 100)]).toEqual([]);
  });
});

describe('tuilesDuCouloir', () => {
  it('MESURÉ : Paris–Lyon tient en 947 tuiles, environ 55 Mo', () => {
    const c = tuilesDuCouloir(PARIS_LYON);
    expect(c.tuiles.length).toBe(947);
    expect(c.tronque).toBe(false);
    expect(poidsEnMots(c.tuiles.length)).toBe('55 Mo');
  });

  it('un trajet court coûte peu : 45 km, moins de deux cents tuiles', () => {
    const c = tuilesDuCouloir([[2.3522, 48.8566], [2.66, 48.54]]);
    expect(c.tuiles.length).toBeLessThan(200);
  });

  it('ne rend jamais deux fois la même tuile', () => {
    const c = tuilesDuCouloir(PARIS_LYON);
    const cles = new Set(c.tuiles.map((t) => `${t.z}/${t.x}/${t.y}`));
    expect(cles.size).toBe(c.tuiles.length);
  });

  it('LE PLAFOND COUPE, ET LE DIT — jamais une carte à trous en silence', () => {
    const c = tuilesDuCouloir(PARIS_LYON, { ...COULOIR_PAR_DEFAUT, plafond: 100 });
    expect(c.tuiles.length).toBe(100);
    expect(c.tronque, 'une troncature muette ferait croire à un couloir complet').toBe(true);
  });

  it('coupé, il garde d’abord la VUE D’ENSEMBLE', () => {
    /* Si l'on ne peut pas tout emporter, mieux vaut savoir où l'on est que
       voir une rue en détail : les zooms larges passent d'abord. */
    const c = tuilesDuCouloir(PARIS_LYON, { ...COULOIR_PAR_DEFAUT, plafond: 40 });
    expect(Math.min(...c.tuiles.map((t) => t.z))).toBe(8);
    expect(Math.max(...c.tuiles.map((t) => t.z))).toBeLessThanOrEqual(11);
  });

  it('un tracé vide ne demande rien', () => {
    expect(tuilesDuCouloir([]).tuiles).toEqual([]);
  });

  it('le couloir COUVRE le tracé : chaque point du trajet a sa tuile', () => {
    /* La vraie garantie, celle qui compte dans le tunnel. On reprend des
       points du trajet et l'on vérifie qu'ils sont dans la liste, à chaque
       zoom demandé. */
    const c = tuilesDuCouloir(PARIS_LYON);
    const cles = new Set(c.tuiles.map((t) => `${t.z}/${t.x}/${t.y}`));
    for (const z of COULOIR_PAR_DEFAUT.zooms) {
      for (const p of [PARIS_LYON[5]!, PARIS_LYON[20]!, PARIS_LYON[35]!]) {
        const t = tuileDe(p[0], p[1], z);
        expect(cles.has(`${t.z}/${t.x}/${t.y}`), `trou à z${z} sur ${p.join(',')}`).toBe(true);
      }
    }
  });
});

describe('urlDeTuile et poidsEnMots', () => {
  it('remplit le gabarit WMTS dans le bon ordre', () => {
    const gabarit = 'https://x/wmts?TILEMATRIX={z}&TILEROW={y}&TILECOL={x}';
    expect(urlDeTuile(gabarit, { z: 12, x: 2074, y: 1409 }))
      .toBe('https://x/wmts?TILEMATRIX=12&TILEROW=1409&TILECOL=2074');
  });

  it('dit les mégaoctets comme on les lit', () => {
    expect(poidsEnMots(100)).toBe('5,8 Mo');
    expect(poidsEnMots(947)).toBe('55 Mo');
  });
});

describe('emporter les tuiles : une coupure ne fait pas un trou définitif', () => {
  afterEach(() => vi.restoreAllMocks());

  const image = (): Response => new Response('', {
    status: 200, headers: { 'content-type': 'image/png' },
  });

  it('UNE COUPURE SE REJOUE UNE FOIS — et une seule. Un couloir, ce sont des '
    + 'centaines de requêtes d’affilée : sans reprise, la poignée qui se perd '
    + 'sur une connexion de bord de route laisse des trous que l’usager ne '
    + 'découvrira qu’une fois hors réseau (constaté le 09/09 : 147 sur 149)', async () => {
    let appels = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      appels += 1;
      // La deuxième tuile tombe une fois, puis passe.
      if (appels === 2) return Promise.reject(new TypeError('réseau'));
      return Promise.resolve(image());
    });
    const bilan = await emporterLesTuiles(['a', 'b', 'c'], { concurrence: 1 });
    expect(bilan).toEqual({ faites: 3, total: 3, echouees: 0 });
    expect(appels, 'la tuile perdue n’a pas été redemandée').toBe(4);
  });

  it('deux coupures d’affilée sur la même tuile la comptent perdue, sans insister', async () => {
    let appels = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      appels += 1;
      return appels <= 2 ? Promise.reject(new TypeError('réseau')) : Promise.resolve(image());
    });
    const bilan = await emporterLesTuiles(['a', 'b'], { concurrence: 1 });
    expect(bilan.echouees).toBe(1);
    expect(appels, 'une tuile a été redemandée plus d’une fois').toBe(3);
  });

  it('UN REFUS FRANC NE SE REJOUE PAS : « ces quotas sont un bien commun », et '
    + 'un serveur qui refuse répondra la même chose', async () => {
    let appels = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      appels += 1;
      return Promise.resolve(new Response('', { status: 403 }));
    });
    const bilan = await emporterLesTuiles(['a'], { concurrence: 1 });
    expect(bilan.echouees).toBe(1);
    expect(appels).toBe(1);
  });

  it('UN PORTAIL CAPTIF NE SE REJOUE PAS NON PLUS : il répond 200 en HTML, et '
    + 'insister ne le changerait pas en tuile', async () => {
    let appels = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      appels += 1;
      return Promise.resolve(new Response('<html>', {
        status: 200, headers: { 'content-type': 'text/html' },
      }));
    });
    const bilan = await emporterLesTuiles(['a'], { concurrence: 1 });
    expect(bilan.echouees).toBe(1);
    expect(appels).toBe(1);
  });
});
