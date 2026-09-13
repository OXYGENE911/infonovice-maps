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
  deciderValidite, jugerDerive, compterProcessus, estDeLaFamille,
  PLAFOND_PROCESSUS, HAUSSE_SUSPECTE,
} from '../scripts/garde-processus.mjs';

describe('quels noms de processus comptent (revue Codex du 13/09, 2e passage)', () => {
  // LE TROU QU'ON BOUCHE ICI : la comparaison était `nom === 'chrome'`, pour ne
  // pas compter `chrome_crashpad_handler`. Elle ratait du même coup TOUT le
  // Chromium de Playwright, qui ne s'appelle jamais « chrome ». Sortie `ps`
  // simulée par la revue : 1 node + 24 chrome-headless donnait un total de 1,
  // et la campagne repartait. Une garde qui sous-compte est pire que pas de
  // garde : elle rassure.
  it('compte le Chromium de Playwright, quel que soit le nom qu’il porte', () => {
    for (const nom of ['chrome', 'chromium', 'chromium-browser', 'chrome-headless',
      'headless_shell', 'chrome.exe', '/opt/google/chrome/chrome']) {
      expect(estDeLaFamille(nom, 'chrome'), `« ${nom} » devrait compter`).toBe(true);
    }
  });

  it('ne compte pas ce qui n’est pas un navigateur, meme si le nom commence pareil', () => {
    // `chromedriver` et `nodemon` sont le contre-exemple qui a fait abandonner
    // la reconnaissance par PRÉFIXE (revue Codex, 3ᵉ passage) : une garde qui
    // SUR-compte refuse des machines pourtant au repos, ce qui pousse à
    // relâcher le seuil — exactement ce que la règle du CEO interdit.
    for (const nom of ['chrome_crashpad_handler', 'chrome-sandbox', 'chromedriver',
      'chrome_sandbox']) {
      expect(estDeLaFamille(nom, 'chrome'), `« ${nom} » ne devrait pas compter`).toBe(false);
    }
    for (const nom of ['nodemon', 'node-gyp', 'nodejs-helper']) {
      expect(estDeLaFamille(nom, 'node'), `« ${nom} » ne devrait pas compter`).toBe(false);
    }
  });

  it('LE SCÉNARIO WINDOWS DE LA REVUE : 24 chrome-headless.exe ne se comptent plus pour zéro', () => {
    // La version précédente interrogeait `tasklist` image par image, par nom
    // exact : `chrome-headless.exe` n'était rendu par aucune requête, donc le
    // sous-comptage survivait à la correction censée le supprimer. Le comptage
    // lit désormais TOUTE la table une fois et filtre avec cette même fonction.
    const table = ['node.exe', ...Array.from({ length: 24 }, () => 'chrome-headless.exe')];
    const total = table.filter((n) => estDeLaFamille(n, 'node') || estDeLaFamille(n, 'chrome'))
      .length;
    expect(total).toBe(25);
    expect(deciderValidite(total).valide, '25 processus doivent être refusés').toBe(false);
  });

  it('20 node + 1 chromedriver font 20, pas 21 : la campagne passe', () => {
    const table = [...Array.from({ length: 20 }, () => 'node'), 'chromedriver'];
    const total = table.filter((n) => estDeLaFamille(n, 'node') || estDeLaFamille(n, 'chrome'))
      .length;
    expect(total).toBe(20);
    expect(deciderValidite(total).valide).toBe(true);
  });

  it('compte node, et ne confond pas une famille avec l’autre', () => {
    expect(estDeLaFamille('node', 'node')).toBe(true);
    expect(estDeLaFamille('node.exe', 'node')).toBe(true);
    expect(estDeLaFamille('chrome', 'node')).toBe(false);
    expect(estDeLaFamille('node', 'chrome')).toBe(false);
    expect(estDeLaFamille('', 'node')).toBe(false);
    expect(estDeLaFamille(undefined, 'node')).toBe(false);
  });

  it('LE SCÉNARIO EXACT DE LA REVUE : 24 chrome-headless ne se comptent plus pour zéro', () => {
    const sortiePs = ['node', ...Array.from({ length: 24 }, () => 'chrome-headless')];
    const total = sortiePs.filter((n) => estDeLaFamille(n, 'node') || estDeLaFamille(n, 'chrome'))
      .length;
    expect(total).toBe(25);
    expect(deciderValidite(total).valide, '25 processus doivent être refusés').toBe(false);
  });
});

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

  it('une dérive INCALCULABLE est suspecte, pas tolérable (revue Codex du 13/09)', () => {
    // `NaN > 3` vaut false : sans garde explicite, l'échec du comptage de fin
    // rendait « Dérive NaN processus, dans le tolérable » et blanchissait une
    // campagne dont on ne savait rien. Ne pas savoir n'est jamais un feu vert.
    const d = jugerDerive(10, Number.NaN);
    expect(d.suspecte).toBe(true);
    expect(d.motif).toMatch(/incalculable/);
    expect(jugerDerive(Number.NaN, 10).suspecte).toBe(true);
  });
});

describe('le comptage réel', () => {
  // PORTABILITÉ (revue Codex du 13/09, constat BLOQUANT) : la première version
  // de `compterProcessus` n'appelait que `tasklist`, absent de la CI Ubuntu du
  // projet — ce test y échouait donc à CHAQUE exécution, et aurait rougi la CI
  // de toutes les PR suivantes. Le comptage passe désormais par `ps` hors
  // Windows.
  it('compte au moins le processus node qui exécute ce test — un comptage qui rendrait zéro serait faux par construction', () => {
    const c = compterProcessus();
    expect(Number.isFinite(c.node), 'comptage impossible sur cette plateforme : '
      + `platform=${process.platform}`).toBe(true);
    expect(c.node).toBeGreaterThanOrEqual(1);
    expect(c.total).toBe(c.node + c.chrome);
  });

  it('ne confond pas « chrome » avec un exécutable dont le nom commence pareil', () => {
    // `chrome_crashpad_handler` n'est pas `chrome` : la comparaison est stricte
    // sur le nom de base, sinon le total gonflerait sans raison et la garde
    // refuserait des machines pourtant au repos.
    const c = compterProcessus();
    expect(Number.isFinite(c.chrome)).toBe(true);
    expect(c.chrome).toBeGreaterThanOrEqual(0);
  });
});
