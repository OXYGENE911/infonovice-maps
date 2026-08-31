import { describe, it, expect } from 'vitest';
import {
  urlEtablissements, versEtablissements, RAYON_ECOLES_M, PLAFOND_ECOLES,
} from '../src/lib/annuaire-education';

/* L'ANNUAIRE DE L'ÉDUCATION NATIONALE (ECOLES-1, 01/09).
 *
 * Armelin : « le collège de ma fille ne donne rien ». MESURÉ : OpenStreetMap
 * ne le connaît pas — soixante écoles autour de chez lui, aucune « Albert
 * Camus ». L'annuaire, lui, le porte, et il accepte un nom PARTIEL là où
 * Overpass exige l'égalité. Première brique de la consolidation des bases
 * publiques françaises, ouverte par Armelin le 01/09. */

const CENTRE = { lon: 2.5722, lat: 48.8103 };

/* ON LIT LE PARAMÈTRE, PAS LA CHAÎNE. `URLSearchParams` encode l'espace en
   « + », que `decodeURIComponent` ne rend pas : comparer l'URL brute ferait
   échouer un test qui a raison. Le service, lui, accepte cette forme —
   mesuré le 31/08 : vingt et un établissements rendus. */
const parametre = (url: string, nom: string): string =>
  new URL(url).searchParams.get(nom) ?? '';

describe('urlEtablissements', () => {
  it('cherche par nom PARTIEL — c’est ce qu’Overpass ne sait pas faire', () => {
    expect(parametre(urlEtablissements('Albert Camus', CENTRE)!, 'where'))
      .toContain('search(nom_etablissement, "Albert Camus")');
  });

  it('borne l’appel à un rayon, et le trie par distance', () => {
    const url = urlEtablissements('Albert Camus', CENTRE)!;
    const ou = parametre(url, 'where');
    expect(ou).toContain(`geom'POINT(2.57220 48.81030)'`);
    expect(ou).toContain(`${RAYON_ECOLES_M}m`);
    /* SANS LE TRI, l'annuaire rend son propre ordre : le collège du bout du
       département passait devant celui d'à côté. Mesuré. */
    expect(parametre(url, 'order_by')).toContain('distance(position');
  });

  it('plafonne la liste — une barre de recherche n’est pas un annuaire', () => {
    expect(parametre(urlEtablissements('x y z', CENTRE)!, 'limit'))
      .toBe(String(PLAFOND_ECOLES));
  });

  /* LE GUILLEMET FERMERAIT L'EXPRESSION `where` : ODSQL veut qu'on le double. */
  it('échappe le guillemet en le doublant', () => {
    expect(parametre(urlEtablissements('Jean "Le Grand"', CENTRE)!, 'where'))
      .toContain('search(nom_etablissement, "Jean ""Le Grand""")');
  });

  it('ne part pas pour deux lettres', () => {
    expect(urlEtablissements('ab', CENTRE)).toBeNull();
    expect(urlEtablissements('   ', CENTRE)).toBeNull();
  });
});

describe('versEtablissements', () => {
  it('retient le nom, le type et la commune', () => {
    const r = versEtablissements({ results: [{
      nom_etablissement: 'Collège Albert Camus', type_etablissement: 'Collège',
      nom_commune: 'Le Plessis-Trévise', latitude: 48.80512, longitude: 2.57597,
    }] });
    expect(r).toEqual([{
      nom: 'Collège Albert Camus', type: 'Collège',
      commune: 'Le Plessis-Trévise', lon: 2.57597, lat: 48.80512,
    }]);
  });

  /* UNE FICHE SANS POSITION EST ÉCARTÉE, PAS POSÉE À L'ÉQUATEUR : le défaut a
     déjà été payé une fois sur les bornes (`Number(null)` vaut zéro). */
  it('écarte une fiche sans position plutôt que de l’inventer', () => {
    expect(versEtablissements({ results: [
      { nom_etablissement: 'Sans position', latitude: null, longitude: null },
      { nom_etablissement: 'Texte', latitude: '48.8', longitude: '2.5' },
    ] })).toEqual([]);
  });

  it('écarte une fiche sans nom — on ne propose pas un point anonyme', () => {
    expect(versEtablissements({ results: [
      { nom_etablissement: '   ', latitude: 48.8, longitude: 2.5 },
    ] })).toEqual([]);
  });

  it('rend une liste vide sur une réponse difforme, jamais une exception', () => {
    expect(versEtablissements(null)).toEqual([]);
    expect(versEtablissements({ results: 'oui' })).toEqual([]);
    expect(versEtablissements('<html>')).toEqual([]);
  });
});
