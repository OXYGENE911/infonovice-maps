import { describe, it, expect } from 'vitest';
import { decomposerNumero, requeteNormalisee, versResultats } from '../src/lib/adresse';

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
