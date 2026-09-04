import { describe, expect, it } from 'vitest';
import { traitsFavoris, listeDe, cleImageListe } from '../src/lib/mes-poi-traits';
import { LISTES_LIVREES } from '../src/lib/listes-favoris';
import type { Favori } from '../src/lib/favoris';

/* LA TRADUCTION FAVORIS → TRAITS DE CARTE (MES-POI-1, 04/09). Le point
   délicat est le REPLI : favoris d'avant FAVORIS-2 (sans liste), listes
   effacées laissant un identifiant orphelin dans un import — aucun ne doit
   devenir invisible, c'est le défaut même qu'on corrige. */

const favori = (sup: Partial<Favori>): Favori => ({
  id: 'f1', nom: 'Maison de Mamie', cree: '2026-09-01T10:00:00Z',
  lon: 2.35, lat: 48.85, ...sup,
});

describe('listeDe', () => {
  it('rend la liste du favori quand elle existe', () => {
    expect(listeDe(favori({ liste: 'restaurants' }), LISTES_LIVREES).emoji).toBe('🍽️');
  });

  it('replie sur « Lieux favoris » un favori d’avant les listes', () => {
    expect(listeDe(favori({}), LISTES_LIVREES).id).toBe('favoris');
  });

  it('replie aussi un identifiant orphelin — liste effacée, import ancien', () => {
    expect(listeDe(favori({ liste: 'liste-disparue' }), LISTES_LIVREES).id).toBe('favoris');
  });
});

describe('traitsFavoris', () => {
  it('un trait par favori, portant l’image de SA liste', () => {
    const { traits } = traitsFavoris([
      favori({ id: 'a', liste: 'restaurants' }),
      favori({ id: 'b', nom: 'Cascade', lon: 6.1, lat: 45.9, liste: 'a-visiter' }),
    ], LISTES_LIVREES);
    expect(traits).toHaveLength(2);
    expect(traits[0]?.properties.image).toBe(cleImageListe('restaurants'));
    expect(traits[1]?.properties.image).toBe(cleImageListe('a-visiter'));
    expect(traits[1]?.geometry.coordinates).toEqual([6.1, 45.9]);
    /* Le rang retrouve le favori au clic — il suit l'ordre d'entrée. */
    expect(traits.map((t) => t.properties.rang)).toEqual([0, 1]);
  });

  it('ne fabrique qu’une image par liste, pas une par favori', () => {
    const { listesUtiles } = traitsFavoris([
      favori({ id: 'a', liste: 'restaurants' }),
      favori({ id: 'b', liste: 'restaurants' }),
      favori({ id: 'c' }),
    ], LISTES_LIVREES);
    expect(listesUtiles.map((l) => l.id).sort()).toEqual(['favoris', 'restaurants']);
  });

  it('sans favoris : aucun trait, aucune image à fabriquer', () => {
    const { traits, listesUtiles } = traitsFavoris([], LISTES_LIVREES);
    expect(traits).toEqual([]);
    expect(listesUtiles).toEqual([]);
  });
});
