// Repères — la validation est PURE et défensive : la valeur relue vient
// d'IndexedDB, éventuellement d'un fichier d'import forgé. On la vérifie comme
// une frontière système, pas comme une donnée maison.
import { describe, expect, test } from 'vitest';
import { validerRepere, REPERES } from '../src/lib/reperes';

const BON = { lon: 2.3522, lat: 48.8566, libelle: '10 rue de Rivoli, Paris', defini: '2026-08-25T09:00:00.000Z' };

describe('un repère valide passe intact', () => {
  test('coordonnées, libellé et date sont rendus tels quels', () => {
    expect(validerRepere(BON)).toEqual(BON);
  });

  test('le libellé est débarrassé de ses espaces', () => {
    expect(validerRepere({ ...BON, libelle: '  Chez moi  ' })?.libelle).toBe('Chez moi');
  });
});

describe('un repère douteux rend null, jamais une surprise', () => {
  test.each([
    ['null', null],
    ['une chaîne', 'domicile'],
    ['un tableau', []],
    ['sans coordonnées', { libelle: 'X' }],
    ['longitude hors bornes', { ...BON, lon: 181 }],
    ['latitude hors bornes', { ...BON, lat: -91 }],
    ['longitude en chaîne', { ...BON, lon: '2.35' }],
    ['NaN', { ...BON, lat: Number.NaN }],
    ['Infinity', { ...BON, lon: Number.POSITIVE_INFINITY }],
  ])('%s', (_, valeur) => {
    expect(validerRepere(valeur)).toBeNull();
  });

  test('un libellé vide ne fait pas échouer — il devient lisible', () => {
    // La coordonnée est la donnée ESSENTIELLE ; le nom est un confort.
    expect(validerRepere({ ...BON, libelle: '   ' })?.libelle).toBe('Lieu sans nom');
    expect(validerRepere({ lon: 2, lat: 48 })?.libelle).toBe('Lieu sans nom');
  });

  test('une clé héritée du prototype ne passe pas pour une donnée', () => {
    // Le piège attrapé à la revue du 22/08 sur les préférences POI.
    const forge = Object.create({ lon: 2.35, lat: 48.85 }) as object;
    expect(validerRepere(forge)).toBeNull();
  });
});

describe('le catalogue des repères', () => {
  test('deux repères, domicile d’abord', () => {
    expect(REPERES.map((r) => r.cle)).toEqual(['domicile', 'travail']);
  });

  test('chacun porte un libellé ET un verbe d’action', () => {
    for (const r of REPERES) {
      expect(r.libelle.length).toBeGreaterThan(3);
      expect(r.verbe.length, `« ${r.cle} » sans verbe`).toBeGreaterThan(3);
    }
  });
});
