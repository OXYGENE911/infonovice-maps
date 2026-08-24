// Consignes des agents — la source est UNIQUE. CLAUDE.md porte les contraintes ;
// AGENTS.md et GEMINI.md ne portent que le mandat propre à chaque contradicteur.
// Sans ce garde-fou, les trois fichiers redeviennent trois copies qui divergent,
// et une contrainte corrigée à un seul endroit devient un mensonge aux deux autres.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

// fileURLToPath, pas `.pathname` : sous Windows ce dernier rend « /C:/… ».
const RACINE = fileURLToPath(new URL('..', import.meta.url));
const lire = (nom: string) => readFileSync(RACINE + nom, 'utf8');

const CLAUDE = lire('CLAUDE.md');
const POINTEURS = [
  { nom: 'AGENTS.md', mandat: 'diff', texte: lire('AGENTS.md') },
  { nom: 'GEMINI.md', mandat: 'plan', texte: lire('GEMINI.md') },
];

// Phrases qui n'ont qu'un seul domicile légitime : CLAUDE.md.
const CANONIQUES = [
  'Coût de production : 0 €',
  'MapLibre GL JS',
  'api-adresse.data.gouv.fr',
  'Conventional Commits en français',
];

describe('source unique des consignes', () => {
  test('CLAUDE.md porte bien les contraintes canoniques', () => {
    for (const phrase of CANONIQUES) expect(CLAUDE, phrase).toContain(phrase);
  });

  test.each(POINTEURS)('$nom renvoie à CLAUDE.md au lieu de le recopier', ({ texte }) => {
    expect(texte).toContain('CLAUDE.md');
  });

  test.each(POINTEURS)('$nom ne duplique aucune contrainte canonique', ({ texte, nom }) => {
    for (const phrase of CANONIQUES) {
      expect(texte, `${nom} recopie « ${phrase} » — la source doit rester unique`)
        .not.toContain(phrase);
    }
  });

  // Un pointeur qui grossit est un pointeur qui redevient une copie.
  test.each(POINTEURS)('$nom reste court (moins de 40 lignes)', ({ texte }) => {
    expect(texte.trimEnd().split('\n').length).toBeLessThan(40);
  });

  test.each(POINTEURS)('$nom déclare son mandat et sa lecture seule', ({ texte, mandat }) => {
    expect(texte.toLowerCase()).toContain(mandat);
    expect(texte.toLowerCase()).toContain('lecture seule');
  });
});
