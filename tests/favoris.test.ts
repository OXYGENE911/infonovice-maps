// Favoris — la validation d'import, PURE et défensive : un fichier forgé
// rend une erreur française ou s'assainit, jamais une surprise. Le CRUD
// IndexedDB, lui, se prouve en E2E (pas d'IndexedDB dans Node).
import { describe, expect, test } from 'vitest';
import { validerSauvegarde, ErreurFavoris } from '../src/lib/favoris';

const FAVORI = {
  id: 'a1b2', nom: '8 Rue de la Paix 75002 Paris',
  lon: 2.330992, lat: 48.868831, cree: '2026-08-22T10:00:00.000Z',
};

describe('validerSauvegarde', () => {
  test('une sauvegarde bien formée rend favoris et préférences tels quels', () => {
    const { favoris, preferences } = validerSauvegarde({
      application: 'infonovice-maps', version: 1, exporte: '2026-08-22T10:00:00Z',
      preferences: { fonds: { fond: 'ortho', cadastre: false }, poi: ['carburants'] },
      favoris: [FAVORI],
    });
    expect(favoris).toEqual([FAVORI]);
    expect(preferences['poi']).toEqual(['carburants']);
  });

  test('refuse ce qui n’est pas une sauvegarde du projet, en français', () => {
    expect(() => validerSauvegarde({})).toThrow(ErreurFavoris);
    expect(() => validerSauvegarde({ application: 'autre-app', version: 1 }))
      .toThrow('pas une sauvegarde Infonovice Maps');
    expect(() => validerSauvegarde({ application: 'infonovice-maps', version: 99 }))
      .toThrow(ErreurFavoris);
    expect(() => validerSauvegarde(null)).toThrow(ErreurFavoris);
  });

  test('écarte les favoris difformes ou hors du globe, garde les sains', () => {
    const { favoris } = validerSauvegarde({
      application: 'infonovice-maps', version: 1,
      preferences: {},
      favoris: [
        FAVORI,
        { id: '', nom: 'sans id', lon: 2, lat: 48, cree: 't' },
        { id: 'x', nom: 'hors globe', lon: 200, lat: 95, cree: 't' },
        { id: 'y', nom: 'lon en chaîne', lon: '2', lat: 48, cree: 't' },
        null,
        'pas-un-objet',
      ],
    });
    expect(favoris).toHaveLength(1);
    expect(favoris[0]!.id).toBe('a1b2');
  });

  test('des préférences difformes deviennent un objet vide, jamais une exception', () => {
    for (const cas of [null, 'texte', 42, ['liste']]) {
      const { preferences } = validerSauvegarde({
        application: 'infonovice-maps', version: 1, preferences: cas, favoris: [],
      });
      expect(preferences).toEqual({});
    }
  });

  test('une date de création absente est remplacée, pas inventée', () => {
    const { favoris } = validerSauvegarde({
      application: 'infonovice-maps', version: 1, preferences: {},
      favoris: [{ id: 'z', nom: 'sans date', lon: 2, lat: 48 }],
    });
    expect(favoris[0]!.cree).toBe(new Date(0).toISOString());
  });
});
