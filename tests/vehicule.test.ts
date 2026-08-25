// Modèle de véhicule électrique — calcul PUR, testé à sec. Aucune API, aucun
// réseau : l'autonomie d'une voiture se calcule, elle ne se demande pas.
//
// L'ÉTALON EST UN VÉHICULE RÉEL, celui d'Armelin, avec ses chiffres relevés au
// compteur le 25/08/2026 — pas une fiche constructeur. Une VinFast VF8 :
// 87,7 kWh nominaux, SOCE 94 %, 436 km annoncés à 100 % après dégradation,
// ~400 km en ville, ~280 km sur autoroute à 130 km/h l'été.
import { describe, expect, test } from 'vitest';
import {
  capaciteReelle, energieDisponible, autonomies, consommationsDepuisEssais,
  CONTEXTES, type Vehicule,
} from '../src/lib/vehicule';

const VF8: Vehicule = {
  nom: 'VinFast VF8',
  capaciteNominale: 87.7,
  soce: 94,
  soc: 100,
  consommations: { ville: 20.6, route: 22.9, autoroute: 29.4 },
  puissanceMaxKw: 150,
};

describe('la batterie vieillit, et le calcul le dit', () => {
  test('le SOCE ampute la capacité — 87,7 kWh à 94 % font 82,4 kWh', () => {
    expect(capaciteReelle(VF8)).toBeCloseTo(82.44, 1);
  });

  test('une batterie neuve garde sa capacité nominale', () => {
    expect(capaciteReelle({ ...VF8, soce: 100 })).toBeCloseTo(87.7, 2);
  });

  test('un SOCE absurde ne produit pas une capacité absurde', () => {
    // Frontière système : la valeur vient d'une saisie humaine.
    expect(capaciteReelle({ ...VF8, soce: 0 })).toBe(0);
    expect(capaciteReelle({ ...VF8, soce: 250 })).toBeCloseTo(87.7, 2);
    expect(capaciteReelle({ ...VF8, soce: -5 })).toBe(0);
  });

  test('l’énergie disponible suit l’état de charge', () => {
    expect(energieDisponible({ ...VF8, soc: 50 })).toBeCloseTo(41.22, 1);
    expect(energieDisponible({ ...VF8, soc: 0 })).toBe(0);
  });
});

describe('les trois autonomies, sur un véhicule réel', () => {
  test('la ville dépasse toujours l’autoroute — c’est la signature de l’électrique', () => {
    const a = autonomies(VF8);
    expect(a.ville).toBeGreaterThan(a.route);
    expect(a.route).toBeGreaterThan(a.autoroute);
  });

  test('les chiffres retrouvent le relevé d’Armelin à quelques kilomètres près', () => {
    const a = autonomies(VF8);
    expect(a.ville, 'ville ≈ 400 km').toBeGreaterThan(390);
    expect(a.ville).toBeLessThan(410);
    expect(a.autoroute, 'autoroute ≈ 280 km').toBeGreaterThan(270);
    expect(a.autoroute).toBeLessThan(290);
  });

  test('à moitié chargé, tout est divisé par deux', () => {
    const plein = autonomies(VF8);
    const moitie = autonomies({ ...VF8, soc: 50 });
    expect(moitie.autoroute).toBeCloseTo(plein.autoroute / 2, 0);
  });

  test('le froid mange de l’autonomie, la douceur n’en rend pas plus que le nominal', () => {
    const doux = autonomies(VF8, 20);
    const froid = autonomies(VF8, -5);
    expect(froid.autoroute).toBeLessThan(doux.autoroute);
    // −5 °C coûte cher, mais ne divise pas l'autonomie par deux.
    expect(froid.autoroute).toBeGreaterThan(doux.autoroute * 0.6);
    // La température de référence ne bonifie rien.
    expect(autonomies(VF8, 20).ville).toBeCloseTo(autonomies(VF8).ville, 0);
  });

  test('la canicule coûte aussi — la climatisation n’est pas gratuite', () => {
    expect(autonomies(VF8, 35).autoroute).toBeLessThan(autonomies(VF8, 20).autoroute);
  });
});

describe('déduire les consommations d’essais réels', () => {
  test('les relevés d’Armelin redonnent ses consommations', () => {
    // 82,4 kWh utilisables pour 400 km en ville, 280 sur autoroute.
    const c = consommationsDepuisEssais(82.44, { ville: 400, route: 360, autoroute: 280 });
    expect(c.ville).toBeCloseTo(20.6, 0);
    expect(c.autoroute).toBeCloseTo(29.4, 0);
  });

  test('une distance nulle ou absurde rend ZÉRO, qui se lit « je ne sais pas »', () => {
    /* Le piège serait d'inventer une valeur de repli : l'anneau paraîtrait
       crédible en étant faux. Zéro se propage jusqu'à `autonomies`, qui rend
       zéro à son tour — et un anneau de rayon nul ne ment sur rien. */
    const c = consommationsDepuisEssais(82.44, { ville: 0, route: -10, autoroute: 280 });
    expect(Number.isFinite(c.ville), 'ni Infinity ni NaN').toBe(true);
    expect(c.ville, 'zéro = inconnu, pas une valeur inventée').toBe(0);
    expect(c.route).toBe(0);
    expect(c.autoroute, 'l’essai valide, lui, produit bien une consommation').toBeCloseTo(29.4, 0);
  });

  test('une consommation inconnue rend une autonomie nulle, pas infinie', () => {
    const aucune = autonomies({ ...VF8, consommations: { ville: 0, route: 0, autoroute: 0 } });
    expect(aucune.ville).toBe(0);
    expect(Number.isFinite(aucune.autoroute)).toBe(true);
  });
});

describe('le catalogue des contextes', () => {
  test('trois contextes, du plus économe au plus gourmand', () => {
    expect(CONTEXTES.map((c) => c.cle)).toEqual(['ville', 'route', 'autoroute']);
  });

  test('chacun porte un libellé lisible et une couleur distincte', () => {
    const couleurs = new Set(CONTEXTES.map((c) => c.couleur));
    expect(couleurs.size, 'deux anneaux de même couleur ne se distinguent pas').toBe(3);
    for (const c of CONTEXTES) expect(c.libelle.length).toBeGreaterThan(3);
  });
});
