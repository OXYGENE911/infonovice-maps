import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/* LE MORCEAU DE DÉMARRAGE NE PORTE PAS CE QUI NE SERT PAS AU PREMIER ÉCRAN
 * (PERF-3, 07/09).
 *
 * POURQUOI CE TEST EXISTE. Mesuré le 06/09 au soir (Lighthouse 13, mobile
 * simulé) : la note de performance tient à la quantité de JavaScript sur le
 * chemin critique — sans script, elle vaut 100 ; avec, 66 à 75. Le bandeau de
 * suivi pèse ~68 Ko gzippés à lui seul et ne sert JAMAIS au premier écran.
 * Un `import` statique le ferait rentrer dans le morceau principal sans que
 * rien ne casse ni ne se voie : la note retomberait en silence, et personne
 * ne saurait pourquoi. Ce test dit l'intention à la place du silence.
 */

const CARTE = readFileSync(new URL('../src/carte/carte.ts', import.meta.url), 'utf-8');

describe('le découpage du morceau de démarrage', () => {
  it('charge le bandeau de suivi par import() — jamais statiquement', () => {
    expect(CARTE, 'le chargement à la demande a disparu')
      .toContain("import('./bandeau-guidage')");
    expect(CARTE, 'un import statique ramène 68 Ko gzip dans le morceau de démarrage')
      .not.toMatch(/^import\s[^\n]*from '\.\/bandeau-guidage'/m);
  });

  it('le planificateur ne connaît le bandeau QUE par son type', () => {
    const p = readFileSync(new URL('../src/carte/panneau-itineraire.ts', import.meta.url), 'utf-8');
    const lignes = p.split('\n').filter((l) => l.includes("from './bandeau-guidage'"));
    expect(lignes, 'une seule ligne doit mentionner le bandeau').toHaveLength(1);
    expect(lignes[0], 'un import de valeur le ramènerait au démarrage').toContain('import type');
  });
});
