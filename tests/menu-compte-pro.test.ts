// Le libelle du menu de compte doit suivre l'etat de session.
//
// Armelin, apres essai sur telephone le 18/09/2026 : « quand je suis connecte
// en mode PRO, si je clique sur Menu, ca affiche encore le bouton Se connecter
// au lieu d'afficher le bouton Se deconnecter. »
//
// Le defaut etait un lien ecrit en dur dans carte.ts la veille. L'etat existait
// deja dans main.ts, qui lit le marqueur pour la mention « Pro » de l'en-tete ;
// le menu ne le consultait pas. Ce test verifie le contrat des DEUX etats, pas
// seulement celui qui etait casse : un correctif qui casserait le cas
// deconnecte serait aussi faux que le defaut d'origine.
//
// On ne construit pas la carte entiere ici — MapLibre demande un WebGL que
// jsdom n'a pas. On verifie le contrat sur le code source, la ou il est ecrit.
// C'est moins satisfaisant qu'un rendu, et c'est la seule verification qui
// tienne dans un test unitaire ; le rendu reel est couvert a l'oeil sur
// telephone, et par les tests de bout en bout pour le cas deconnecte.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const carte = readFileSync('src/carte/carte.ts', 'utf8');
const main = readFileSync('src/main.ts', 'utf8');

describe('menu de compte', () => {
  it('recoit l etat Pro en option de construction', () => {
    expect(carte).toMatch(/export interface OptionsCarte/);
    expect(carte).toMatch(/creerCarte\(\s*conteneur: HTMLElement,\s*options: OptionsCarte/);
  });

  it('est alimente par main.ts avec le marqueur lu', () => {
    expect(main).toMatch(/creerCarte\(conteneur, \{ pro \}\)/);
    // Le marqueur doit etre lu HORS du bloc `if (entete)`, sinon `pro` n'est
    // pas dans la portee ou la carte se construit. C'est le defaut qu'a
    // introduit le premier jet du correctif.
    const iMarqueur = main.indexOf('const { pro, fragmentNettoye }');
    const iEntete = main.indexOf('if (entete) {');
    expect(iMarqueur).toBeGreaterThan(0);
    expect(iEntete).toBeGreaterThan(0);
    expect(iMarqueur).toBeLessThan(iEntete);
  });

  it('dit « Se connecter » hors abonnement et « Se deconnecter » avec', () => {
    expect(carte).toMatch(/if \(options\.pro\)/);
    expect(carte).toMatch(/'Mon compte Pro'/);
    expect(carte).toMatch(/'Se déconnecter'/);
    expect(carte).toMatch(/'Se connecter'/);
  });

  it('efface le marqueur local avant de naviguer', () => {
    // L'ordre n'est pas cosmetique : si la navigation echoue (hors ligne,
    // service Pro en panne), l'usager a quand meme obtenu la deconnexion sur
    // l'appareil qu'il tient. L'inverse laisserait une carte qui se pretend
    // Pro juste apres un clic sur « Se deconnecter ».
    const iEfface = carte.indexOf('removeItem(CLE_PRO)');
    const iNavigue = carte.indexOf('deconnexion=1');
    expect(iEfface).toBeGreaterThan(0);
    expect(iNavigue).toBeGreaterThan(0);
    expect(iEfface).toBeLessThan(iNavigue);
  });

  it('ne fait AUCUN appel reseau vers maps-pro : la CSP l interdit', () => {
    // La frontiere AGPL passe par `connect-src`, qui ne liste pas maps-pro
    // (voir tests/csp-connect-src.test.ts). Ce client NAVIGUE vers le service
    // Pro, il ne le REQUETE jamais. Un fetch ajoute ici casserait la frontiere
    // sans casser la CSP : le navigateur refuserait l'appel en silence.
    const bloc = carte.slice(carte.indexOf('reglages-compte'), carte.indexOf('deplacerBoutonVers'));
    expect(bloc).not.toMatch(/fetch\s*\(/);
    expect(bloc).not.toMatch(/XMLHttpRequest/);
    expect(bloc).toMatch(/location\.assign/);
  });
});
