import { describe, it, expect } from 'vitest';
import {
  normaliserGare, clePaire, estimerPeages, versGrille,
} from '../src/lib/peages-tarifs';

/* LE COÛT DES PÉAGES (PEAGE-1, demande d'Armelin du 30/08). Ce qui se teste
 * à sec : l'APPARIEMENT des noms — c'est là que tout se joue — et la règle
 * qui interdit de présenter un total partiel comme un total. */

describe('normaliserGare', () => {
  it('réduit les graphies d’OpenStreetMap à celle de la grille', () => {
    // Les formes RÉELLEMENT rencontrées : la grille écrit en majuscules non
    // accentuées et abrège « sur » en « S/ » ; OSM écrit en toutes lettres.
    expect(normaliserGare('Belleville-sur-Saône')).toBe('BELLEVILLE SUR SAONE');
    expect(normaliserGare('BELLEVILLE S/SAONE')).toBe('BELLEVILLE SUR SAONE');
    expect(normaliserGare('Beaune-Sud')).toBe('BEAUNE SUD');
    expect(normaliserGare('BEAUNE SUD')).toBe('BEAUNE SUD');
  });

  it('ôte le mot « péage », qui n’appartient pas au nom de la gare', () => {
    expect(normaliserGare('Péage de Fleury')).toBe('FLEURY');
    expect(normaliserGare('Barrière de Vienne')).toBe('VIENNE');
    expect(normaliserGare('Gare du Nord')).toBe('NORD');
  });

  it('rend une chaîne vide sur un nom vide, sans lever', () => {
    expect(normaliserGare('')).toBe('');
    expect(normaliserGare('   ')).toBe('');
  });
});

describe('clePaire', () => {
  it('ne dépend PAS du sens de parcours : un péage se paie dans les deux', () => {
    expect(clePaire('Beaune-Sud', 'Mâcon Nord')).toBe(clePaire('MACON NORD', 'BEAUNE SUD'));
  });
});

describe('estimerPeages', () => {
  const grille = {
    'BEAUNE SUD~MACON NORD': 12.4,
    'LYON~MACON NORD': 9.1,
  };

  it('chiffre les tronçons entre gares CONSÉCUTIVES, dans l’ordre', () => {
    const e = estimerPeages(
      [{ nom: 'Beaune-Sud' }, { nom: 'Mâcon Nord' }, { nom: 'Lyon' }], grille,
    );
    expect(e.troncons).toEqual([
      { entree: 'Beaune-Sud', sortie: 'Mâcon Nord', prixEuros: 12.4 },
      { entree: 'Mâcon Nord', sortie: 'Lyon', prixEuros: 9.1 },
    ]);
    expect(e.totalEuros).toBe(21.5);
    expect(e.inconnus).toEqual([]);
  });

  it('NOMME ce qu’il ne sait pas chiffrer au lieu de l’oublier', () => {
    /* C'est la règle du module : une estimation partielle présentée comme un
       total serait pire que rien — c'est sur elle qu'on déciderait d'éviter
       l'autoroute. Les réseaux Vinci et Sanef ne publient pas leur grille :
       ce cas est la NORME, pas l'exception. */
    const e = estimerPeages(
      [{ nom: 'Beaune-Sud' }, { nom: 'Mâcon Nord' }, { nom: 'Orange' }], grille,
    );
    expect(e.troncons).toHaveLength(1);
    expect(e.totalEuros).toBe(12.4);
    expect(e.inconnus).toEqual([{ entree: 'Mâcon Nord', sortie: 'Orange' }]);
  });

  it('ignore les gares sans nom — OpenStreetMap en porte beaucoup', () => {
    const e = estimerPeages(
      [{ nom: 'Beaune-Sud' }, { nom: null }, { nom: 'Mâcon Nord' }], grille,
    );
    // Les deux gares NOMMÉES redeviennent consécutives : le tronçon se chiffre.
    expect(e.troncons).toHaveLength(1);
    expect(e.totalEuros).toBe(12.4);
  });

  it('rend un total nul, sans lever, quand il n’y a rien à chiffrer', () => {
    expect(estimerPeages([], grille)).toEqual({ troncons: [], totalEuros: 0, inconnus: [] });
    expect(estimerPeages([{ nom: 'Beaune-Sud' }], grille).totalEuros).toBe(0);
  });

  it('additionne des euros SANS traîne binaire', () => {
    /* 12,40 + 9,10 vaut 21,500000000000004 en virgule flottante — un total
       affiché tel quel serait risible. La somme se fait donc en CENTIMES,
       la seule unité où l'addition d'une monnaie soit exacte. (Un prix à
       trois décimales n'existe pas dans la grille : les tarifs sont au
       centime, ce test n'a donc pas à trancher un demi-centime — et il ne
       le pourrait pas, 1,005 n'étant pas représentable.) */
    const e = estimerPeages(
      [{ nom: 'A' }, { nom: 'B' }, { nom: 'C' }],
      { 'A~B': 12.4, 'B~C': 9.1 },
    );
    expect(e.totalEuros).toBe(21.5);
    expect(String(e.totalEuros)).toBe('21.5');
  });
});

describe('versGrille', () => {
  it('relit l’index engendré', () => {
    expect(versGrille({ paires: { 'BEAUNE SUD~MACON NORD': 12.4 } }))
      .toEqual({ 'BEAUNE SUD~MACON NORD': 12.4 });
  });

  it('REFUSE ce qui n’est pas une grille — le fichier est une frontière système', () => {
    expect(versGrille(null)).toEqual({});
    expect(versGrille({})).toEqual({});
    expect(versGrille({ paires: 'non' })).toEqual({});
    // Clé mal formée, prix négatif, prix non numérique : rien ne passe.
    expect(versGrille({ paires: {
      'clé~douteuse<script>': 5, 'A~B': -3, 'C~D': 'gratuit', 'E~F': 7,
    } })).toEqual({ 'E~F': 7 });
  });
});
