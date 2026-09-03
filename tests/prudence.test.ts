import { describe, it, expect } from 'vitest';
import { FACTEUR_PRUDENCE, kmPrudents } from '../src/lib/prudence';
import { autonomiesProposees } from '../src/lib/catalogue-vehicules';

/* LA MARGE DE PRUDENCE DES VALEURS CONSTRUCTEUR (MARGE-1, 03/09).
 *
 * Armelin, rapportant ses testeurs sur la 1.60 : « l'algorithme s'améliore
 * mais reste encore 5 % plus optimiste que ce qu'ils constatent en réel sur
 * leur véhicule par rapport aux caractéristiques constructeurs chargées par
 * défaut. Ils préfèrent tous avoir un navigateur GPS pessimiste de 5 %
 * qu'optimiste de 5 %. »
 *
 * ELLE S'APPLIQUE LÀ OÙ LE CATALOGUE PROPOSE — l'endroit exact que les
 * testeurs nomment — et nulle part ailleurs. Deux emplacements ont été
 * essayés et rejetés avant : le cœur de la physique (vingt tests d'arrêts
 * tombés sur des STRUCTURES, pas des chiffres) et l'entrée du planificateur
 * (le bilan se mettait à contredire les relevés RÉELS de l'usager — punir de
 * 5 % celui qui a mesuré serait punir l'exactitude). L'histoire complète est
 * dans lib/prudence. */

describe('kmPrudents', () => {
  it('ABAISSE DE 5 % — le chiffre des testeurs, pas un goût', () => {
    expect(FACTEUR_PRUDENCE).toBe(1.05);
    expect(kmPrudents(420)).toBe(400);
  });

  it('L’INVALIDE RESTE « je ne sais pas » : zéro, jamais une promesse', () => {
    expect(kmPrudents(0)).toBe(0);
    expect(kmPrudents(Number.NaN)).toBe(0);
    expect(kmPrudents(-50)).toBe(0);
  });
});

describe('les autonomies proposées par le catalogue', () => {
  const MODELE = {
    cle: 'essai', marque: 'Essai', modele: 'Essai', capaciteKwh: 87.7,
    puissanceMaxKw: 150, wltpKm: 471,
  } as Parameters<typeof autonomiesProposees>[0];

  it('PORTENT LA MARGE : 5 % SOUS la déclinaison du WLTP', () => {
    const a = autonomiesProposees(MODELE);
    // Sans marge : ville 495, route 400, autoroute 297. Avec : ÷1,05.
    expect(a.ville).toBe(Math.round((471 * 1.05) / 1.05));
    expect(a.route).toBe(Math.round((471 * 0.85) / 1.05));
    expect(a.autoroute).toBe(Math.round((471 * 0.63) / 1.05));
  });

  it('RESTENT ORDONNÉES — ville > route > autoroute, la signature de l’électrique', () => {
    const a = autonomiesProposees(MODELE);
    expect(a.ville).toBeGreaterThan(a.route);
    expect(a.route).toBeGreaterThan(a.autoroute);
  });
});
