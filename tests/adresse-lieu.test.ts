import { describe, it, expect } from 'vitest';
import { adresseDesTags, libelleDestination } from '../src/lib/adresse-lieu';

/* L'ADRESSE POSTALE D'UN LIEU (ADRESSE-POI-1, 03/09).
 *
 * Armelin, la nuit du 03/09 : « il y a trop de POI sur lesquels je clique et
 * il n'y a aucune information sur l'adresse du lieu au format texte. Et quand
 * je clic sur "Y aller", le nom commercial du POI s'affiche dans le champ
 * destination et je n'ai toujours aucune idée de l'adresse du lieu. » */

describe('adresseDesTags', () => {
  it('ÉCRIT L’ADRESSE SANS UN SEUL APPEL RÉSEAU quand OSM la porte', () => {
    expect(adresseDesTags({
      'addr:housenumber': '3', 'addr:street': 'Avenue Ardouin',
      'addr:postcode': '94420', 'addr:city': 'Le Plessis-Trévise',
    })).toBe('3 Avenue Ardouin, 94420 Le Plessis-Trévise');
  });

  it('SE PASSE DU NUMÉRO ET DU CODE POSTAL, qui manquent souvent', () => {
    expect(adresseDesTags({ 'addr:street': 'Rue de la Paix', 'addr:city': 'Paris' }))
      .toBe('Rue de la Paix, Paris');
  });

  it('ACCEPTE UN LIEU-DIT à la place d’une rue', () => {
    expect(adresseDesTags({ 'addr:place': 'Le Bourg', 'addr:city': 'Domjean' }))
      .toBe('Le Bourg, Domjean');
  });

  it('NE REND RIEN D’INCOMPLET — c’est pire que rien', () => {
    /* « 12, 94420 » ne s'écrit pas sur une enveloppe et ne se dicte pas au
       téléphone. Le rendre ferait croire à l'usager qu'il tient l'adresse. */
    expect(adresseDesTags({ 'addr:housenumber': '12', 'addr:postcode': '94420' })).toBeNull();
    expect(adresseDesTags({ 'addr:street': 'Rue Machin' })).toBeNull();
    expect(adresseDesTags({ 'addr:city': 'Paris' })).toBeNull();
    expect(adresseDesTags(undefined)).toBeNull();
    expect(adresseDesTags({})).toBeNull();
  });
});

describe('libelleDestination', () => {
  it('COLLE L’ADRESSE AU NOM — c’est la demande d’Armelin', () => {
    expect(libelleDestination('Carrefour City', '3 Avenue Ardouin, 94420 Le Plessis-Trévise'))
      .toBe('Carrefour City — 3 Avenue Ardouin, 94420 Le Plessis-Trévise');
  });

  it('SANS ADRESSE, garde le nom seul plutôt qu’un tiret pendant', () => {
    expect(libelleDestination('Carrefour City', null)).toBe('Carrefour City');
    expect(libelleDestination('Carrefour City', '   ')).toBe('Carrefour City');
  });

  it('NE BÉGAIE PAS quand l’adresse répète déjà le nom', () => {
    /* Cela arrive avec les lieux-dits : le nom du lieu EST le début de son
       adresse, et « Le Bourg — Le Bourg, Domjean » ne dit rien de plus. */
    expect(libelleDestination('Le Bourg', 'Le Bourg, Domjean')).toBe('Le Bourg');
    expect(libelleDestination('Beaucouzé', 'beaucouze')).toBe('Beaucouzé');
  });
});
