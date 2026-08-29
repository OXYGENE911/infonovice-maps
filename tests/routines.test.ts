import { describe, it, expect } from 'vitest';
import { trancheDe, suggerer, type Habitude } from '../src/lib/routines';

/* LES ROUTINES LOCALES (décision d'Armelin du 29/08). Le contrat : des
   suggestions au BON moment, jamais de magie — l'heure entre en paramètre,
   trois trajets font une habitude, trois suggestions au plus. */

const habitude = (nom: string, x: Partial<Habitude>): Habitude => ({
  nom, lon: 4.8357, lat: 45.764, matin: 0, apresMidi: 0, soir: 0,
  dernier: '2026-08-29T08:00:00.000Z', ...x,
});

// Un mardi. Les heures sont LOCALES : new Date(an, mois, jour, heure).
const mardiMatin = new Date(2026, 7, 25, 8, 0);
const mardiSoir = new Date(2026, 7, 25, 18, 0);
const samediMatin = new Date(2026, 7, 29, 9, 0);
const nuit = new Date(2026, 7, 25, 3, 0);

const TRAVAIL = { lon: 2.2945, lat: 48.8584, libelle: '5 avenue Anatole France' };
const MAISON = { lon: 2.35, lat: 48.85, libelle: '8 rue de la Paix' };

describe('trancheDe', () => {
  it('matin 5-11, après-midi 11-16, soir 16-22, nuit sinon', () => {
    expect(trancheDe(new Date(2026, 7, 25, 7))).toBe('matin');
    expect(trancheDe(new Date(2026, 7, 25, 13))).toBe('apresMidi');
    expect(trancheDe(new Date(2026, 7, 25, 19))).toBe('soir');
    expect(trancheDe(new Date(2026, 7, 25, 23))).toBe('nuit');
  });
});

describe('suggerer', () => {
  it('un matin de semaine avec un travail déclaré : « Au travail » d’abord', () => {
    const s = suggerer([], { travail: TRAVAIL }, mardiMatin);
    expect(s[0]).toMatchObject({ nom: 'Au travail', motif: 'un matin de semaine' });
  });
  it('un soir de semaine avec un domicile : « À la maison »', () => {
    const s = suggerer([], { domicile: MAISON }, mardiSoir);
    expect(s[0]?.nom).toBe('À la maison');
  });
  it('le SAMEDI matin, pas de « Au travail » : la semaine décide, pas l’heure seule', () => {
    expect(suggerer([], { travail: TRAVAIL }, samediMatin)).toHaveLength(0);
  });
  it('TROIS trajets font une habitude — deux allers chez le dentiste, non', () => {
    const s = suggerer([
      habitude('Chez ma sœur', { matin: 3 }),
      habitude('Dentiste', { lon: 5.0, matin: 2 }),
    ], {}, mardiMatin);
    expect(s.map((x) => x.nom)).toEqual(['Chez ma sœur']);
    expect(s[0]?.motif).toContain('habituel');
  });
  it('la tranche COURANTE décide : une habitude du soir se tait le matin', () => {
    expect(suggerer([habitude('Club', { soir: 9 })], {}, mardiMatin)).toHaveLength(0);
  });
  it('trois suggestions AU PLUS, sans doublon avec les repères', () => {
    const s = suggerer([
      habitude('Bureau bis', { lon: TRAVAIL.lon, lat: TRAVAIL.lat, matin: 9 }),
      habitude('Piscine', { lon: 5.1, matin: 8 }),
      habitude('Marché', { lon: 5.2, matin: 7 }),
      habitude('Boulangerie', { lon: 5.3, matin: 6 }),
    ], { travail: TRAVAIL }, mardiMatin);
    expect(s).toHaveLength(3);
    expect(s[0]?.nom).toBe('Au travail');
    // « Bureau bis » est LE MÊME ENDROIT que le travail : pas de doublon.
    expect(s.map((x) => x.nom)).not.toContain('Bureau bis');
  });
  it('la nuit ne suggère RIEN : à trois heures du matin, on sait où l’on va', () => {
    expect(suggerer([habitude('X', { matin: 9 })], { travail: TRAVAIL }, nuit)).toHaveLength(0);
  });
});
