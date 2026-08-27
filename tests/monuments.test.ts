// Lieux d'exception — le décodage de l'index engendré et le calcul local,
// testés à sec. Ce que ces tests défendent : qu'un fichier altéré rend une
// liste vide plutôt qu'une exception, et que le détour est une distance au
// TRACÉ, pas à l'écran.
import { describe, expect, test } from 'vitest';
import { versMonuments, monumentsDuTrajet, KM_PAR_MINUTE } from '../src/lib/monuments';

/** Un tracé ouest→est le long du 47e parallèle. */
const TRACE: [number, number][] =
  Array.from({ length: 101 }, (_, i) => [3 + i * 0.01, 47] as [number, number]);

describe('versMonuments', () => {
  test('lit la forme engendrée — tuples [lon, lat, titre, commune, réf, siècle, adresse]', () => {
    const m = versMonuments([
      [4.83, 45.76, 'Basilique de Fourvière', 'Lyon', 'PA00117731', '19e s.', '8 place de Fourvière'],
    ]);
    expect(m).toEqual([{
      lon: 4.83, lat: 45.76, titre: 'Basilique de Fourvière', commune: 'Lyon',
      reference: 'PA00117731', siecle: '19e s.', adresse: '8 place de Fourvière',
    }]);
  });

  test('les anciens tuples courts restent lisibles — champs enrichis vides', () => {
    const m = versMonuments([[4.83, 45.76, 'Basilique', 'Lyon']]);
    expect(m[0]).toMatchObject({ titre: 'Basilique', reference: '', siecle: '', adresse: '' });
  });

  /* LA RÉFÉRENCE DEVIENT UNE URL vers pop.culture.gouv.fr : un index altéré
     ne doit pas fabriquer un lien vers n'importe quoi. Motif strict. */
  test('une référence difforme est tue, jamais transformée en lien', () => {
    const m = versMonuments([
      [4.8, 45.7, 'A', 'X', 'PA00078023', '', ''],
      [4.8, 45.7, 'B', 'X', '../evil', '', ''],
      [4.8, 45.7, 'C', 'X', 'pa minuscule', '', ''],
    ]);
    expect(m.map((x) => x.reference)).toEqual(['PA00078023', '', '']);
  });

  test('écarte le difforme et le hors-globe, sans exception', () => {
    expect(versMonuments(null)).toEqual([]);
    expect(versMonuments({})).toEqual([]);
    expect(versMonuments([[200, 45, 'Hors globe', 'X'], [4, 45, '', 'Sans titre'],
      ['a', 'b', 'c', 'd'], [4]])).toEqual([]);
  });
});

describe('monumentsDuTrajet', () => {
  const chateau = { lon: 3.5, lat: 47.02, titre: 'Château', commune: 'Bourg' };
  const lointain = { lon: 3.5, lat: 47.5, titre: 'Abbaye', commune: 'Loin' };

  test('retient ce qui est à portée de détour, écarte le reste', () => {
    /* Le château est à ~2,2 km du tracé (0,02° de latitude), l'abbaye à
       ~55 km. À 5 minutes (5 km), seul le château répond. */
    const t = monumentsDuTrajet([chateau, lointain], TRACE, 5);
    expect(t.map((x) => x.poi.titre)).toEqual(['Château']);
    expect(t[0]!.ecart).toBeGreaterThan(2000);
    expect(t[0]!.ecart).toBeLessThan(2500);
  });

  test('le détour en minutes fixe le rayon — 1 km par minute, et c’est dit', () => {
    // À 1 minute (1 km), même le château (2,2 km) sort du rayon.
    expect(monumentsDuTrajet([chateau], TRACE, 1)).toEqual([]);
    expect(KM_PAR_MINUTE).toBe(1);
  });

  test('l’avancement situe le monument LE LONG du chemin', () => {
    const t = monumentsDuTrajet([chateau], TRACE, 5);
    // 0,5° de longitude à 47° ≈ 38 km depuis le départ.
    expect(t[0]!.avancement).toBeGreaterThan(34_000);
    expect(t[0]!.avancement).toBeLessThan(42_000);
  });
});
