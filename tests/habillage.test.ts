import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/* LE NOUVEAU DESIGN, À L'IMAGE DE MAPS PRO (lot 144, 09/10/2026).
 *
 * Décision d'Armelin du 08/10 : le libre prend l'HABIT de Maps Pro, sans
 * exposer la moindre de ses fonctions. Ce fichier garde les promesses que
 * l'habit fait et qu'aucun parcours à l'écran ne verrait se rompre :
 *   - il est posé APRÈS les feuilles de comportement (sinon il ne gagne rien,
 *     ou gagne au hasard de l'ordre) ;
 *   - il ne rend jamais visible ce que `hidden` cache ;
 *   - il ne télécharge rien (ni police, ni image distante) ;
 *   - il ne porte aucun cadenas : le libre n'a pas de fonction verrouillée ;
 *   - ses règles de nuit suivent la transformation du thème ;
 *   - le bouton principal garde un contraste AA, de jour comme de nuit.
 */

const lire = (...chemin: string[]): string =>
  readFileSync(resolve(__dirname, '..', ...chemin), 'utf-8');

const HABIT = lire('src', 'styles', 'habillage.css');
const JETONS = lire('src', 'styles', 'tokens.css');
const MAIN = lire('src', 'main.ts');
const sansCommentaires = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');
const HABIT_NU = sansCommentaires(HABIT);

describe('l’habit Maps Pro du client libre', () => {
  it('est importé APRÈS carte.css et pages.css', () => {
    const habit = MAIN.indexOf("import './styles/habillage.css'");
    expect(habit, 'habillage.css n’est plus importé par main.ts').toBeGreaterThan(-1);
    expect(habit).toBeGreaterThan(MAIN.indexOf("import './styles/carte.css'"));
    expect(habit).toBeGreaterThan(MAIN.indexOf("import './styles/pages.css'"));
  });

  it('ne force jamais un display (la règle globale [hidden] doit rester sans rival)', () => {
    expect(/display:\s*[a-z-]+\s*!important/.test(HABIT_NU)).toBe(false);
  });

  it('ne télécharge rien : ni @import, ni @font-face, ni url() distante', () => {
    expect(/@import|@font-face/.test(HABIT_NU)).toBe(false);
    const urls = [...HABIT_NU.matchAll(/url\(\s*["']?([^"')\s]+)/g)].map((m) => m[1]!);
    expect(urls.filter((u) => !u.startsWith('data:')), 'une url() non embarquée').toEqual([]);
  });

  it('ne porte aucun cadenas : le libre n’a aucune fonction verrouillée', () => {
    expect(/cadenas|verrou|🔒|\bpro-seul/i.test(HABIT_NU)).toBe(false);
  });

  it('chaque règle de nuit est gardée ET doublée sous [data-theme="sombre"]', () => {
    const blocs = [...HABIT_NU.matchAll(/@media \(prefers-color-scheme: dark\) \{([\s\S]*?)\n\}/g)];
    expect(blocs.length).toBeGreaterThan(0);
    for (const [, corps] of blocs) {
      const selecteurs = [...corps!.matchAll(/([^{}]+)\{/g)]
        .flatMap((m) => m[1]!.split(','))
        .map((s) => s.trim())
        .filter((s) => s !== '');
      for (const s of selecteurs) {
        expect(s.startsWith(':root:not([data-theme="clair"])'), `non gardé : ${s}`).toBe(true);
        const jumeau = s.replace(':root:not([data-theme="clair"])', ':root[data-theme="sombre"]');
        expect(HABIT_NU.includes(jumeau), `sans jumeau [data-theme="sombre"] : ${s}`).toBe(true);
      }
    }
  });

  it('les rôles de Maps Pro existent de jour ET dans les deux blocs de nuit', () => {
    const roles = ['--fond-2', '--filet', '--survol', '--bleu-clair', '--bleu-bord', '--accent-texte'];
    const jour = JETONS.split('@media')[0]!;
    const nuits = [...JETONS.matchAll(/:root(?::not\(\[data-theme="clair"\]\)|\[data-theme="sombre"\]) \{([\s\S]*?)\n\s*\}/g)]
      .map((m) => m[1]!);
    expect(nuits).toHaveLength(2);
    for (const r of roles) {
      expect(jour.includes(`${r}:`), `${r} manque de jour`).toBe(true);
      for (const n of nuits) expect(n.includes(`${r}:`), `${r} manque la nuit`).toBe(true);
    }
  });

  it('le bouton principal garde un contraste AA (≥ 4,5:1) avec son texte blanc', () => {
    /* Le bleu du bouton principal se lit dans les jetons : --principal vaut
       --bleu-500, dans les deux thèmes. */
    expect(/--principal:\s*var\(--bleu-500\)/.test(JETONS)).toBe(true);
    const bleu = /--bleu-500:\s*(#[0-9A-Fa-f]{6})/.exec(JETONS)![1]!;
    const lum = (hex: string): number => {
      const [r, g, b] = [1, 3, 5].map((i) => {
        const x = parseInt(hex.slice(i, i + 2), 16) / 255;
        return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
      }) as [number, number, number];
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const ratio = (1 + 0.05) / (lum(bleu) + 0.05);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });
});
