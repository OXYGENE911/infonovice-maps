import { describe, it, expect } from 'vitest';
import {
  versFragmentFavoris, depuisFragmentFavoris, sansDejaConnus,
  ErreurPartageFavoris, MAX_LIEUX_PARTAGES,
} from '../src/lib/partage-favoris';

/* LE PARTAGE DE FAVORIS PAR LIEN (demande d'Armelin du 28/08). Comme le
   partage de trajet : tout dans le fragment, jamais au serveur, analyse
   défensive — un lien forgé rend null, jamais une exception, jamais un lot
   PARTIEL qui ferait croire à un import réussi. */

const CHEZ_MA_SOEUR = { nom: 'Chez ma sœur', lon: 4.8357, lat: 45.764 };
const CABANE = { nom: 'Cabane du lac & co', lon: 5.88, lat: 45.65 };

describe('versFragmentFavoris / depuisFragmentFavoris', () => {
  it('l’aller-retour est exact — accents, espaces et « & » compris', () => {
    const relu = depuisFragmentFavoris(versFragmentFavoris([CHEZ_MA_SOEUR, CABANE]));
    expect(relu).toHaveLength(2);
    expect(relu?.[0]).toMatchObject({ nom: 'Chez ma sœur' });
    expect(relu?.[0]?.lon).toBeCloseTo(4.8357, 5);
    expect(relu?.[1]?.nom).toBe('Cabane du lac & co');
  });

  it('cinq décimales, la précision de la BAN — comme le partage de trajet', () => {
    expect(versFragmentFavoris([CHEZ_MA_SOEUR])).toContain('~4.83570~45.76400');
  });

  it('un lot vide ou débordant est REFUSÉ avec son remède, jamais tronqué en silence', () => {
    expect(() => versFragmentFavoris([])).toThrow(ErreurPartageFavoris);
    const trop = Array.from({ length: MAX_LIEUX_PARTAGES + 1 },
      (_, i) => ({ nom: `Lieu ${i}`, lon: 2, lat: 48 }));
    expect(() => versFragmentFavoris(trop)).toThrow(/Exporter mes données/);
  });

  it('UN FRAGMENT FORGÉ REND NULL, jamais une exception ni un lot partiel', () => {
    for (const frag of ['#favs=', '#favs=abc', '#favs=a~2', '#favs=a~2~48~9',
      '#favs=a~200~48', '#favs=a~2~95', '#favs=%E0~2~48', '#favs=a~2~48|b~x~y',
      '#autre', '', `#favs=${'a~2~48|'.repeat(MAX_LIEUX_PARTAGES + 1)}a~2~48`]) {
      expect(depuisFragmentFavoris(frag), frag).toBeNull();
    }
  });

  it('un nom démesuré invalide tout : 120 caractères suffisent à nommer un lieu', () => {
    const long = encodeURIComponent('x'.repeat(121));
    expect(depuisFragmentFavoris(`#favs=${long}~2~48`)).toBeNull();
  });
});

describe('sansDejaConnus', () => {
  it('écarte le même ENDROIT, pas le même nom : renommé, un lieu reste lui-même', () => {
    const restants = sansDejaConnus(
      [CHEZ_MA_SOEUR, CABANE],
      [{ lon: 4.8357, lat: 45.764 }],
    );
    expect(restants).toHaveLength(1);
    expect(restants[0]?.nom).toBe('Cabane du lac & co');
  });
  it('compare à cinq décimales : un mètre d’écart n’est pas un autre lieu', () => {
    expect(sansDejaConnus([CABANE], [{ lon: 5.880001, lat: 45.650004 }])).toHaveLength(0);
  });
});
