import { describe, expect, it } from 'vitest';
import {
  urlAdministrations, versAdministrations, PLAFOND_ADMINISTRATIONS,
} from '../src/lib/annuaire-administration';

/* L'ANNUAIRE DE L'ADMINISTRATION (RECHERCHE-7, 04/09). Les pièges mesurés :
   les coordonnées sont des CHAÎNES dans une chaîne JSON, et l'absence y est
   un vide — le terrain exact de l'île Nulle. */

const ou = (u: string | null): string =>
  new URL(u ?? '').searchParams.get('where') ?? '';

describe('urlAdministrations', () => {
  it('borne à la commune quand on la connaît — la requête qui trouve l’INRAE d’Angers', () => {
    const u = urlAdministrations('INRAE', 'Beaucouzé');
    expect(ou(u)).toBe('search(nom, "INRAE") AND search(adresse, "Beaucouzé")');
    expect(u).toContain(`limit=${PLAFOND_ADMINISTRATIONS}`);
  });
  it('sans commune : le nom seul, national', () => {
    expect(ou(urlAdministrations('mairie du plessis trevise')))
      .toBe('search(nom, "mairie du plessis trevise")');
  });
  it('double les guillemets — l’échappement ODSQL', () => {
    expect(ou(urlAdministrations('centre "essai"')))
      .toBe('search(nom, "centre ""essai""")');
  });
  it('moins de trois lettres : aucun appel', () => {
    expect(urlAdministrations('ab')).toBeNull();
  });
});

const fiche = (adresse: unknown): unknown => ({
  results: [{ nom: 'Mairie - Le Plessis-Trévise', adresse }],
});

describe('versAdministrations', () => {
  it('lit la chaîne JSON, convertit les coordonnées-chaînes', () => {
    const r = versAdministrations(fiche(JSON.stringify([{
      type_adresse: 'Adresse', code_postal: '94420',
      nom_commune: 'Le Plessis-Trévise', longitude: '2.5721', latitude: '48.8110',
    }])));
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({
      nom: 'Mairie - Le Plessis-Trévise', codePostal: '94420',
      commune: 'Le Plessis-Trévise', lon: 2.5721, lat: 48.811,
    });
  });
  it('rejette le vide AVANT la conversion — Number(\'\') vaut zéro (île Nulle)', () => {
    expect(versAdministrations(fiche(JSON.stringify([
      { longitude: '', latitude: '48.8' },
      { longitude: null, latitude: 48.8 },
    ])))).toHaveLength(0);
  });
  it('rejette (0, 0) — l’île Nulle n’est pas une adresse française', () => {
    expect(versAdministrations(fiche(JSON.stringify([
      { longitude: '0', latitude: '0' },
    ])))).toHaveLength(0);
  });
  it('prend la PREMIÈRE adresse localisée — une fiche, une ligne', () => {
    const r = versAdministrations(fiche(JSON.stringify([
      { longitude: '', latitude: '' },
      { longitude: '2.5', latitude: '48.8', nom_commune: 'A' },
      { longitude: '3.5', latitude: '47.8', nom_commune: 'B' },
    ])));
    expect(r).toHaveLength(1);
    expect(r[0]?.commune).toBe('A');
  });
  it('une adresse illisible écarte la fiche sans casser les autres', () => {
    const r = versAdministrations({ results: [
      { nom: 'Cassée', adresse: '{pas du json' },
      { nom: 'Bonne', adresse: JSON.stringify([{ longitude: '1.5', latitude: '43.5' }]) },
    ] });
    expect(r.map((x) => x.nom)).toEqual(['Bonne']);
  });
});
