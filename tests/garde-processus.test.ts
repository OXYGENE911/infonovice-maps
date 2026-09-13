// LA GARDE DE CHARGE DES CAMPAGNES DE MESURE (SEUIL-1, 13/09/2026).
//
// « Une garde qu'on n'a jamais vue se déclencher n'est pas une garde » (mission
// du 13/09). Elle a été vue se déclencher pour de vrai sur ce poste le
// 13/09/2026 — 30 processus résidents, sortie en code 2, aucune mesure prise ;
// la sortie est reproduite dans docs/mesure-seuil-porte.md.
//
// MAIS UNE GARDE QU'ON NE PEUT PAS VOIR *NE PAS* SE DÉCLENCHER N'EN EST PAS UNE
// NON PLUS : si `deciderValidite` refusait tout, le refus observé ne prouverait
// rien. D'où ces tests des DEUX CÔTÉS du seuil, sur la fonction pure — qui ne
// lit pas la machine, et donne donc le même verdict quel que soit l'état du
// poste qui les exécute.
import { describe, it, expect } from 'vitest';
import {
  deciderValidite, jugerDerive, compterProcessus,
  PLAFOND_PROCESSUS, HAUSSE_SUSPECTE,
} from '../scripts/garde-processus.mjs';

describe('la garde de charge d’une campagne de mesure', () => {
  it('le plafond est 20, celui posé par le CEO le 13/09 — et il est lu, pas recopié', () => {
    expect(PLAFOND_PROCESSUS).toBe(20);
  });

  it('REFUSE au-delà du plafond : 21 processus, campagne rejetée', () => {
    const v = deciderValidite(21);
    expect(v.valide).toBe(false);
    expect(v.motif).toMatch(/REJETÉE/);
  });

  it('ACCEPTE au plafond exactement : 20 processus, la campagne part', () => {
    // « plus de 20 » est un dépassement STRICT : 20 pile reste valide.
    expect(deciderValidite(20).valide).toBe(true);
  });

  it('ACCEPTE nettement sous le plafond : une machine à 3 processus mesure', () => {
    expect(deciderValidite(3).valide).toBe(true);
  });

  it('REFUSE si le comptage a échoué — un comptage impossible n’est pas un comptage à zéro', () => {
    // Sans ce cas, une panne de `tasklist` ouvrirait la porte à une campagne
    // non gardée, et le relevé afficherait « 0 processus » en toute bonne foi.
    const v = deciderValidite(Number.NaN);
    expect(v.valide).toBe(false);
    expect(v.motif).toMatch(/impossible/);
  });

  it('le seuil ne se relâche pas : le plafond par défaut ne peut être forcé que par un argument explicite, jamais par l’environnement', () => {
    // La fonction n'a aucune porte dérobée : pas de variable d'environnement,
    // pas de fichier de configuration. Le seul moyen de mesurer au-delà de 20
    // est de changer ce code et de l'assumer dans une revue.
    const source = String(deciderValidite);
    expect(source).not.toMatch(/process\.env/);
  });
});

describe('la dérive entre le début et la fin d’une campagne', () => {
  it('signale SUSPECTE quand le compte de fin dépasse largement celui du début', () => {
    const d = jugerDerive(10, 18);
    expect(d.suspecte).toBe(true);
    expect(d.hausse).toBe(8);
    expect(d.motif).toMatch(/SUSPECTE/);
  });

  it('ne crie pas pour une variation ordinaire', () => {
    expect(jugerDerive(10, 11).suspecte).toBe(false);
    expect(jugerDerive(10, 10 + HAUSSE_SUSPECTE).suspecte).toBe(false);
  });

  it('une baisse n’est jamais suspecte : des processus qui s’arrêtent ne faussent pas une mesure déjà prise', () => {
    expect(jugerDerive(18, 10).suspecte).toBe(false);
  });
});

describe('le comptage réel', () => {
  it('compte au moins le processus node qui exécute ce test — un comptage qui rendrait zéro serait faux par construction', () => {
    const c = compterProcessus();
    expect(Number.isFinite(c.node)).toBe(true);
    expect(c.node).toBeGreaterThanOrEqual(1);
    expect(c.total).toBe(c.node + c.chrome);
  });
});
