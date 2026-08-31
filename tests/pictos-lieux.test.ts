import { describe, it, expect } from 'vitest';
import { motifDe } from '../src/lib/pictos-lieux';
import { familleDe } from '../src/lib/categories';

/* LE MOTIF DIT LE TYPE, LA COULEUR DIT LA FAMILLE (POI-4, 31/08).
 *
 * Armelin a donné une liste de dessins plus FINE que les familles du filtre :
 * une tasse pour un café et un verre pour un bar, alors que les deux vivent
 * dans la même famille. Ces parcours défendent cette séparation des rôles —
 * c'est elle qui permet d'honorer sa liste sans faire vingt pastilles à
 * cocher sur un téléphone. */

describe('motifDe — la liste d’Armelin, dessin par dessin', () => {
  it.each([
    ['un couteau et une fourchette pour les restaurants', { amenity: 'restaurant' }, 'couverts'],
    ['idem pour la restauration rapide', { amenity: 'fast_food' }, 'couverts'],
    ['un lit pour les hôtels', { tourism: 'hotel' }, 'lit'],
    ['une croix pour les pharmacies', { amenity: 'pharmacy' }, 'croix'],
    ['une tasse de café pour les cafés', { amenity: 'cafe' }, 'tasse'],
    ['un verre à cocktail pour les bars', { amenity: 'bar' }, 'cocktail'],
    ['idem pour les pubs', { amenity: 'pub' }, 'cocktail'],
    ['un P pour les parkings', { amenity: 'parking' }, 'parking'],
    ['un caddie pour les supermarchés', { shop: 'supermarket' }, 'caddie'],
    ['des haltères pour les salles de sport', { leisure: 'fitness_centre' }, 'haltere'],
    ['une grande roue pour les parcs d’attractions', { tourism: 'theme_park' }, 'roue'],
    ['une clé pour les garages', { shop: 'car_repair' }, 'cle'],
    ['idem pour le lavage auto', { amenity: 'car_wash' }, 'cle'],
    ['un cintre pour les pressings', { shop: 'dry_cleaning' }, 'cintre'],
    ['un avion pour les aéroports', { aeroway: 'aerodrome' }, 'avion'],
    ['un train pour les gares', { railway: 'station' }, 'train'],
    ['une dent pour un dentiste', { amenity: 'dentist' }, 'dent'],
    ['une patte pour un vétérinaire', { amenity: 'veterinary' }, 'patte'],
  ])('%s', (_, tags, attendu) => {
    expect(motifDe(tags)).toBe(attendu);
  });
});

describe('les écoles (POI-6)', () => {
  it('la toque de diplômé, de la maternelle à l’université', () => {
    expect(motifDe({ amenity: 'school' })).toBe('toque');
    expect(motifDe({ amenity: 'kindergarten' })).toBe('toque');
    expect(motifDe({ amenity: 'college' })).toBe('toque');
    expect(motifDe({ amenity: 'university' })).toBe('toque');
  });
});

describe('la séparation des rôles', () => {
  /* C'EST LE CŒUR DE POI-4 : sans elle, honorer sa liste aurait demandé une
     famille par dessin — vingt pastilles à cocher, ce que POI-2 refusait à
     bon droit. */
  it('un café et un bar partagent la FAMILLE et diffèrent par le MOTIF', () => {
    expect(familleDe({ amenity: 'cafe' })).toBe(familleDe({ amenity: 'bar' }));
    expect(motifDe({ amenity: 'cafe' })).not.toBe(motifDe({ amenity: 'bar' }));
  });

  it('un supermarché et une boutique de vêtements aussi', () => {
    expect(familleDe({ shop: 'supermarket' })).toBe(familleDe({ shop: 'clothes' }));
    expect(motifDe({ shop: 'supermarket' })).toBe('caddie');
    expect(motifDe({ shop: 'clothes' })).toBe('vetement');
  });

  it('un dentiste et un vétérinaire sont dans « Santé », et se distinguent', () => {
    expect(familleDe({ amenity: 'dentist' })).toBe('sante');
    expect(familleDe({ amenity: 'veterinary' })).toBe('sante');
    expect(motifDe({ amenity: 'dentist' })).toBe('dent');
    expect(motifDe({ amenity: 'veterinary' })).toBe('patte');
  });
});

describe('l’ordre tranche, et le silence est permis', () => {
  it('une pharmacie qui vend des cosmétiques garde sa croix', () => {
    expect(motifDe({ amenity: 'pharmacy', shop: 'chemist' })).toBe('croix');
  });

  it('un restaurant d’hôtel garde ses couverts', () => {
    expect(motifDe({ amenity: 'restaurant', tourism: 'hotel' })).toBe('couverts');
  });

  /* « Si l'information n'est pas forcément compréhensible du premier coup, ça
     devient une information inutile à afficher » (Armelin, 30/08). Un dessin
     approchant serait pire qu'un cercle nu. */
  it('sans type reconnu, un simple point — jamais un dessin approchant', () => {
    expect(motifDe({})).toBe('point');
    expect(motifDe({ office: 'lawyer' })).toBe('point');
  });

  it('ne se laisse pas piéger par des étiquettes vides', () => {
    expect(motifDe({ amenity: '', shop: '' })).toBe('point');
  });
});
