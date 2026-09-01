import { describe, it, expect } from 'vitest';
import {
  decomposerNumero, requeteNormalisee, versResultats, communeNommee,
  repondALaSaisie,
} from '../src/lib/adresse';

/* LES ADRESSES BIS, TER, QUATER (ADRESSE-2, 01/09).
 *
 * Armelin : « j'habite au 23 BIS Avenue du prophète et je suis obligé de
 * taper 25 pour trouver mon adresse ». Deux causes MESURÉES sur la BAN le
 * 31/08/2026 : la base écrit ses numéros collés (« 12bis » — 0,965 contre
 * 0,818 pour « 12 bis »), et le 23 bis de sa voie n'existe tout simplement
 * pas dans la base (relevé : 12bis, 14bis, 20bis, 33bis). Voir l'en-tête de
 * lib/adresse.ts. */

describe('decomposerNumero', () => {
  it('reconnaît le suffixe espacé comme collé', () => {
    expect(decomposerNumero('23 bis avenue du prophète'))
      .toEqual({ numero: '23', suffixe: 'bis', reste: 'avenue du prophète' });
    expect(decomposerNumero('23bis avenue du prophète'))
      .toEqual({ numero: '23', suffixe: 'bis', reste: 'avenue du prophète' });
  });

  it('accepte ter, quater et quinquies — et la casse de la saisie', () => {
    expect(decomposerNumero('4 TER rue Neuve')?.suffixe).toBe('ter');
    expect(decomposerNumero('9 Quater impasse des Lilas')?.suffixe).toBe('quater');
    expect(decomposerNumero('2 quinquies rue du Port')?.suffixe).toBe('quinquies');
  });

  /* LE DICTIONNAIRE EST FERMÉ, ET C'EST TOUT SON INTÉRÊT : un repli
     déclenché à tort déplacerait silencieusement une adresse juste. */
  it('refuse ce qui n’est pas un suffixe de voirie', () => {
    expect(decomposerNumero('23 avenue du prophète')).toBeNull();
    expect(decomposerNumero('2 B rue du Port')).toBeNull();
    expect(decomposerNumero('12 rue du Bis')).toBeNull();
    expect(decomposerNumero('rue Bisson')).toBeNull();
    expect(decomposerNumero('')).toBeNull();
  });

  it('ne lit le suffixe qu’EN TÊTE, collé à un numéro', () => {
    expect(decomposerNumero('avenue du 8 bis mai')).toBeNull();
  });
});

describe('requeteNormalisee', () => {
  /* LES QUINZE POINTS DE SCORE : « 12 bis » vaut 0,818, « 12bis » vaut
     0,965 — assez, sous autocomplétion et cinq résultats, pour faire sortir
     la bonne adresse de la liste. */
  it('colle le suffixe au numéro — l’écriture de la base', () => {
    expect(requeteNormalisee('23 bis avenue du prophète'))
      .toBe('23bis avenue du prophète');
    expect(requeteNormalisee('4 TER rue Neuve')).toBe('4ter rue Neuve');
  });

  it('laisse intacte une saisie sans suffixe — on ne réécrit pas l’inconnu', () => {
    expect(requeteNormalisee('  25 avenue du prophète  '))
      .toBe('25 avenue du prophète');
    expect(requeteNormalisee('Le Plessis-Trévise')).toBe('Le Plessis-Trévise');
  });
});

describe('versResultats — le numéro de la BAN', () => {
  it('garde le numéro tel que la base l’écrit', () => {
    const r = versResultats({ features: [{
      geometry: { coordinates: [2.5, 48.8] },
      properties: {
        label: '12bis avenue du prophète 94420 Le Plessis-Trévise',
        type: 'housenumber', housenumber: '12bis', postcode: '94420',
        city: 'Le Plessis-Trévise',
      },
    }] });
    expect(r[0]?.numero).toBe('12bis');
    expect(r[0]?.approche).toBeUndefined();
  });

  it('n’invente pas de numéro pour une rue', () => {
    const r = versResultats({ features: [{
      geometry: { coordinates: [2.5, 48.8] },
      properties: { label: 'avenue du prophète', type: 'street' },
    }] });
    expect(r[0]?.numero).toBeUndefined();
  });
});

describe('communeNommee — l’ancre d’une recherche approximative (RECHERCHE-4)', () => {
  /* Deux cas mesurés le 01/09 sur la production, tous deux avec un score BAN
     faible, et qui appellent des ancres OPPOSÉES. Le score ne les sépare
     pas ; la commune, si. */
  it('« Tour Eiffel Paris » nomme Paris — on ancre là-bas', () => {
    expect(communeNommee('Tour Eiffel Paris', '75007 Paris')).toBe(true);
  });

  it('« Collège Albert Camus » ne nomme pas Thumeries — on reste chez soi', () => {
    expect(communeNommee('Collège Albert Camus', '59239 Thumeries')).toBe(false);
  });

  it('les accents et la casse ne décident de rien', () => {
    expect(communeNommee('college albert camus plessis trevise',
      '94420 Le Plessis-Trévise')).toBe(true);
    expect(communeNommee('Gare de LYON', '69002 Lyon')).toBe(true);
  });

  /* LES MOTS COURTS NE PROUVENT RIEN : « Le », « sur » ou « des » se
     retrouvent dans presque toute saisie, et feraient ancrer n'importe où. */
  it('ignore les mots de moins de trois lettres', () => {
    expect(communeNommee('boulangerie le matin', '01000 Le Poizat')).toBe(false);
  });

  it('ne se casse pas sur un contexte vide', () => {
    expect(communeNommee('quoi que ce soit', '')).toBe(false);
  });
});

describe('repondALaSaisie', () => {
  /* CE QUI DÉCIDE D'ALLER CHERCHER AILLEURS (RECHERCHE-5, 01/09), et ce qui
     protège Overpass au passage : deux appels de plus à chaque frappe sur un
     service bénévole, la règle du projet l'interdit. Tous les cas ci-dessous
     ont été mesurés sur la BAN le jour même. */

  it('« lyon » rend « Lyon » : la BAN a répondu, on ne dérange personne', () => {
    expect(repondALaSaisie('lyon', 'Lyon')).toBe(true);
  });

  it('« Collège Albert Camus » rend une avenue : « collège » a disparu', () => {
    expect(repondALaSaisie('Collège Albert Camus',
      'avenue albert camus 94420 Le Plessis-Trévise')).toBe(false);
  });

  it('« Tour Eiffel Paris » rend l’avenue Gustave Eiffel : « tour » manque', () => {
    expect(repondALaSaisie('Tour Eiffel Paris', 'Avenue Gustave Eiffel 75007 Paris'))
      .toBe(false);
  });

  it('LE PIÈGE : le lieu-dit du Nord porte bien les trois mots', () => {
    /* Et c'est pour cela que les mots ne suffisent pas. Ce libellé-là répond
       mot pour mot à la saisie d'Armelin — il est simplement à deux cents
       kilomètres de chez lui. C'est la VUE qui tranche ce cas, pas le texte ;
       ce test existe pour que personne ne croie l'inverse en lisant le nom de
       la fonction. */
    expect(repondALaSaisie('Collège Albert Camus',
      'Collège Albert Camus 59239 Thumeries')).toBe(true);
  });

  it('les accents et la casse ne décident de rien', () => {
    expect(repondALaSaisie('college albert camus', 'Collège Albert Camus')).toBe(true);
  });

  it('un mot n’est pas un morceau de mot', () => {
    /* « camus » ne doit pas se trouver dans « Camusat » : une correspondance
       partielle déclarerait répondu ce qui ne l'est pas. */
    expect(repondALaSaisie('Camus', 'Rue Camusat 10000 Troyes')).toBe(false);
  });

  it('une saisie sans mot utile ne prétend pas avoir sa réponse', () => {
    expect(repondALaSaisie('le', 'Le Mans')).toBe(false);
  });
});
