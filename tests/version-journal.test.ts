import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/* LA VERSION AFFICHÉE VIENT DU JOURNAL (VERSION-2, 02/09).
 *
 * POURQUOI CE FICHIER EXISTE. VERSION-1 avait mis la version dans
 * `package.json` ; deux livraisons plus tard, la production affichait
 * « 1.31.0 » en servant la 1.33.0 — j'avais oublié d'incrémenter le fichier
 * deux fois de suite. Un numéro FAUX est pire qu'aucun numéro : c'est
 * exactement le doute qu'Armelin signalait, mais estampillé par
 * l'application.
 *
 * LE JOURNAL NE S'OUBLIE PAS : la règle du projet impose une entrée à chaque
 * PR. Ces tests gardent la forme dont `vite.config.ts` dépend — si elle
 * change, la construction échouerait, et mieux vaut l'apprendre ici. */

const JOURNAL = readFileSync(
  resolve(__dirname, '..', 'docs', 'CHANGELOG.md'), 'utf-8',
);

/** La même expression que celle de `vite.config.ts`, sans la dupliquer ailleurs. */
const TETE = /^## \[(\d+\.\d+\.\d+)\]/m;

describe('la version se lit en tête du journal', () => {
  it('l’entrée la plus haute porte un numéro sémantique', () => {
    const m = TETE.exec(JOURNAL);
    expect(m, 'aucune entrée « ## [x.y.z] » en tête de docs/CHANGELOG.md').not.toBeNull();
    expect(m![1]).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('et elle est la PLUS HAUTE des dix premières', () => {
    /* Une entrée insérée au mauvais endroit ferait reculer la version
       affichée sans que rien ne proteste. Dix suffisent : le bas du fichier
       garde l'ordre croissant des toutes premières versions, antérieur à
       cette règle. */
    const versions = [...JOURNAL.matchAll(/^## \[(\d+\.\d+\.\d+)\]/gm)]
      .slice(0, 10)
      .map((m) => m[1]!.split('.').map(Number) as [number, number, number]);
    const trie = [...versions].sort((a, b) =>
      b[0] - a[0] || b[1] - a[1] || b[2] - a[2]);
    expect(versions, `journal désordonné : ${versions.map((v) => v.join('.')).join(', ')}`)
      .toEqual(trie);
  });

  it('aucun numéro n’est écrit deux fois', () => {
    /* Deux PR parallèles portent souvent le même numéro provisoire ; la
       fusion doit en renuméroter une, et l'oubli se voit ici. */
    const toutes = [...JOURNAL.matchAll(/^## \[(\d+\.\d+\.\d+)\]/gm)].map((m) => m[1]!);
    expect(toutes.length - new Set(toutes).size,
      `versions en double : ${toutes.filter((v, i) => toutes.indexOf(v) !== i).join(', ')}`)
      .toBe(0);
  });

  it('le journal ne porte AUCUN marqueur de conflit', () => {
    /* Payé trois fois : une résolution « garder les deux côtés » laisse le
       marqueur fermant, décalé de toute la section conservée. */
    expect(/^(<{7}|>{7}|={7})/m.test(JOURNAL),
      'un marqueur de fusion est resté dans docs/CHANGELOG.md').toBe(false);
  });
});
