import { describe, it, expect } from 'vitest';
import {
  facteurVitesse, facteurTemperature, energieDeniveleKwh,
  consommationAjustee, plafondThermiqueKw, MASSE_DEFAUT_KG,
} from '../src/lib/conditions';

/* LES CONDITIONS DU TRAJET (demande d'Armelin du 28/08). Le contrat de ce
   module : des ordres de grandeur ASSUMÉS, jamais une précision de façade —
   et le comportement d'AVANT quand les conditions manquent : à plat, 20 °C. */

describe('facteurVitesse', () => {
  it('vaut 1 à la vitesse de référence (130), et 1 sans mesure — rien ne change', () => {
    expect(facteurVitesse(130)).toBeCloseTo(1);
    expect(facteurVitesse(undefined)).toBe(1);
    expect(facteurVitesse(0)).toBe(1);
  });
  it('une moyenne de nationale consomme nettement moins qu’une d’autoroute', () => {
    const f = facteurVitesse(90);
    expect(f).toBeGreaterThan(0.6);
    expect(f).toBeLessThan(0.75);
  });
  it('borné [0,6 ; 1,15] : la ville ne double pas l’autonomie, l’allemande ne l’efface pas', () => {
    expect(facteurVitesse(20)).toBe(0.6);
    expect(facteurVitesse(200)).toBe(1.15);
  });
});

describe('facteurTemperature', () => {
  it('1 à la référence (20 °C), et 1 sans mesure — rien ne change', () => {
    expect(facteurTemperature(20, 20)).toBe(1);
    expect(facteurTemperature(undefined, undefined)).toBe(1);
  });
  it('LA MÊME CONVENTION que les anneaux d’autonomie (lib/vehicule.ts)', () => {
    // Deux modèles de température diraient deux autonomies pour le même trajet.
    // +1,2 %/°C sous 20 : à −5 °C, ×1,30 ; le chaud coûte moins (+0,5 %/°C).
    expect(facteurTemperature(-5, undefined)).toBeCloseTo(1.30, 5);
    expect(facteurTemperature(37, undefined)).toBeCloseTo(1.085, 5);
  });
  it('la température LA PLUS DÉFAVORABLE des deux bouts décide', () => {
    // 20 °C au départ, −2 °C à l'arrivée : le trajet finit en hiver.
    expect(facteurTemperature(20, -2)).toBeCloseTo(1.264, 5);
  });
});

describe('energieDeniveleKwh', () => {
  it('monter coûte de la physique : 1 000 m à 2 000 kg ≈ 6,4 kWh (rendement 85 %)', () => {
    expect(energieDeniveleKwh(1000, 0, 2000)).toBeCloseTo(6.41, 1);
  });
  it('descendre en rend une partie (récupération 60 %) — un net négatif est LÉGITIME', () => {
    const net = energieDeniveleKwh(0, 1000, 2000);
    expect(net).toBeCloseTo(-3.27, 1);
  });
  it('sans masse déclarée, 2 000 kg — le défaut est écrit, pas caché', () => {
    expect(energieDeniveleKwh(500, 0, undefined))
      .toBeCloseTo(energieDeniveleKwh(500, 0, MASSE_DEFAUT_KG), 6);
  });
});

describe('consommationAjustee', () => {
  const SANS = {};
  it('sans conditions, la référence reste intacte — la régression est impossible', () => {
    expect(consommationAjustee(20, 390_000, {}, SANS)).toBe(20);
  });
  it('hiver + col : les effets se CUMULENT, multiplication puis kWh du relief', () => {
    // 20 kWh/100 × 1,264 (−2 °C) = 25,28 ; + 6,41 kWh de D+ sur 100 km.
    const c = consommationAjustee(20, 100_000,
      { tempDepartC: -2, monteeM: 1000 }, { masseKg: 2000 });
    expect(c).toBeCloseTo(25.28 + 6.41, 1);
  });
  it('un trajet tout en descente ne devient jamais gratuit : plancher à 30 % de la référence', () => {
    const c = consommationAjustee(20, 20_000, { descenteM: 2000 }, { masseKg: 2500 });
    expect(c).toBeCloseTo(6, 5);
  });
});

describe('plafondThermiqueKw — les chiffres du VF8 d’Armelin comme cas d’école', () => {
  const VF8 = { puissanceFroidKw: 30, puissanceChaudKw: 60 };
  it('sous 0 °C d’air : le bridage à froid — 30 kW', () => {
    expect(plafondThermiqueKw(-3, 2, VF8)).toBe(30);
  });
  it('canicule (≥ 35 °C) : le bridage à chaud — 60 kW', () => {
    expect(plafondThermiqueKw(36, 31, VF8)).toBe(60);
  });
  it('température douce, ou véhicule sans bridage déclaré : AUCUN plafond', () => {
    expect(plafondThermiqueKw(15, 22, VF8)).toBeNull();
    expect(plafondThermiqueKw(-3, 2, {})).toBeNull();
    expect(plafondThermiqueKw(undefined, undefined, VF8)).toBeNull();
  });
  it('un départ gelé vers une arrivée caniculaire : le PIRE des deux bridages', () => {
    expect(plafondThermiqueKw(-1, 36, VF8)).toBe(30);
  });
});
