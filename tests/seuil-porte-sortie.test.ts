// LA PORTE DE SORTIE RESTE OUVERTE (SEUIL-1, 13/09/2026).
//
// LE DÉFAUT REPRIS DE LA PR #316, arithmétique et non aléatoire : le seuil
// d'abandon ouvrait « Réessayer » à 15 000 ms, et le plafond dur de
// `calculerItineraire` (2 × 8 000 ms + 500 ms d'attente = 16 500 ms) faisait
// rejeter la promesse 1 500 ms plus tard. Le `catch` de `#calculer` masquait
// alors le bandeau d'abandon : le bouton disparaissait. Personne ne clique un
// bouton qui vit une seconde et demie.
//
// LE CORRECTIF RETENU est l'ACCORD des deux mécanismes, pas la baisse du seuil.
// Baisser le seuil ne donne ses huit secondes que dans le seul cas où le
// service épuise ses deux essais ; si le service échoue de lui-même à 8,2 s, la
// soustraction redevient courte et le défaut revient, invisible. L'accord, lui,
// retire la durée de vie du bouton de la soustraction entre deux constantes
// étrangères l'une à l'autre et en fait une propriété de l'écran.
//
// CE QUE CES TESTS PROUVENT, ET CE QU'ILS NE PROUVENT PAS. Ils lisent la source
// (convention de ce dépôt pour `panneau-itineraire.ts`, qui charge maplibre-gl
// à l'import — voir la note de decoupage-demarrage.test.ts). Ils établissent la
// STRUCTURE du correctif. Ils ne sont PAS un chronométrage : la durée de vie
// mesurée en navigateur n'a pas pu être relevée le 13/09, la garde de charge de
// la sonde ayant refusé de mesurer (30 processus résidents pour un plafond de
// 20). Voir docs/mesure-seuil-porte.md, qui le dit sans l'arrondir.
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const SOURCE = readFileSync(
  new URL('../src/carte/panneau-itineraire.ts', import.meta.url), 'utf-8',
);

/** Le corps de `#calculer`, du `const jeton` jusqu'à la fin de son `catch`. */
function corpsDuCatch(): string {
  const debut = SOURCE.indexOf('const jeton = (this.#sequence += 1);');
  expect(debut, '#calculer introuvable').toBeGreaterThan(-1);
  const catchDebut = SOURCE.indexOf('} catch (e) {', debut);
  expect(catchDebut, 'le catch de #calculer est introuvable').toBeGreaterThan(-1);
  return SOURCE.slice(catchDebut, SOURCE.indexOf('\n  }', catchDebut));
}

describe('la porte de sortie ne se referme pas sur l’usager', () => {
  it('le seuil d’abandon note le calcul pour lequel il a parlé', () => {
    // Sans ce jeton, le catch ne peut pas distinguer « la porte était ouverte »
    // de « le calcul a échoué tout de suite » — et il refermerait les deux.
    expect(SOURCE).toMatch(/surAbandon: \(\) => \{[\s\S]{0,200}?this\.#abandonAnnonce = jeton;/);
  });

  it('LE CŒUR DU CORRECTIF : le catch ne masque le bandeau d’abandon QUE s’il ne l’a pas ouvert', () => {
    const corps = corpsDuCatch();
    // ANCRÉ EN DÉBUT DE LIGNE (drapeau m) : une ligne commentée par `//` ne
    // matche pas — leçon de la revue Codex du 12/09, second passage, où un test
    // de présence textuelle serait passé au vert sur un correctif commenté.
    expect(corps).toMatch(/^\s*if \(this\.#abandonAnnonce === jeton\) \{/m);
    // Et la branche « porte ouverte » RÉAFFICHE le bandeau au lieu de le cacher.
    expect(corps).toMatch(/^\s*abandon\.hidden = false;/m);
  });

  it('CONTRE-ÉPREUVE DE LA RÉGRESSION : le catch ne masque plus le bandeau d’abandon inconditionnellement', () => {
    // C'est EXACTEMENT la ligne qui causait le défaut de la PR #316. Si elle
    // revient sans garde, ce test rougit et le bouton se remet à vivre 1 500 ms.
    const corps = corpsDuCatch();
    const inconditionnel = /^\s{6}abandon\.hidden = true;/m.test(corps);
    expect(inconditionnel, 'le catch masque le bandeau d’abandon sans condition : '
      + 'le défaut de la PR #316 est revenu').toBe(false);
  });

  it('l’échec écrit DANS le bandeau ouvert : l’usager garde le message ET le geste', () => {
    const corps = corpsDuCatch();
    expect(corps).toMatch(/\.iti-abandon-texte[\s\S]{0,120}message/);
    // La ligne d'erreur ordinaire reste muette dans ce cas : un seul bloc,
    // pas deux messages concurrents sur le même écran.
    expect(corps).toMatch(/^\s*erreur\.hidden = true;/m);
  });

  it('un calcul qui repart referme la porte du calcul précédent', () => {
    expect(SOURCE).toMatch(/this\.#abandonAnnonce = 0;[\s\S]{0,120}resultat\.hidden = false;/);
  });

  it('« Effacer le trajet » referme la porte explicitement — elle survit désormais à l’échec de la promesse, donc plus personne ne la referme à sa place', () => {
    const debut = SOURCE.indexOf('#effacer(): void {');
    expect(debut, '#effacer() introuvable').toBeGreaterThan(-1);
    const corps = SOURCE.slice(debut, SOURCE.indexOf('\n  }', debut));
    expect(corps).toMatch(/^\s*this\.#abandonAnnonce = 0;/m);
  });

  it('le bouton « Réessayer » reste le même élément, jamais recréé : son écouteur de clic est posé une seule fois au montage, donc une porte qui reste ouverte reste CLIQUABLE', () => {
    // Un bandeau réaffiché par innerHTML aurait perdu son écouteur : le bouton
    // serait visible et mort. Ici il est seulement démasqué.
    expect(SOURCE).toMatch(
      /this\.querySelector\('\.iti-abandon-reessayer'\)\?\.addEventListener\('click'/,
    );
    const corps = corpsDuCatch();
    expect(corps).not.toMatch(/innerHTML/);
  });
});
