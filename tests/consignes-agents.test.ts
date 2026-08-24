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

// Helper pour extraire une section markdown (d'un ## jusqu'au prochain ## ou fin du texte).
// Vérifie que la section existe ; si absent, échoue avec un message clair plutôt que
// de comparer deux chaînes vides (ce qui passerait silencieusement).
// Normalise les fins de ligne (CRLF → LF, CR stray → LF) : le verrou porte sur la clause,
// pas sur l'état de checkout. Avec git autocrlf=true, des fichiers fraîchement restaurés
// arrivent CRLF tandis que des fichiers écrits par des outils arrivent LF. Cette
// normalisation garantit que la comparaison fonctionne sur toute machine, clone ou branche.
const extraireSectionMarkdown = (texte: string, titre: string, nomFichier: string): string => {
  const lignes = texte.split('\n');
  const indexDebut = lignes.findIndex(l => l.startsWith('## ') && l.includes(titre));

  if (indexDebut === -1) {
    throw new Error(
      `Section « ${titre} » introuvable dans ${nomFichier} — ` +
      `le fichier pointeur est incomplet ou corrompu.`
    );
  }

  const indexFin = lignes.findIndex((l, i) => i > indexDebut && l.startsWith('## '));
  const fin = indexFin === -1 ? lignes.length : indexFin;

  return lignes.slice(indexDebut, fin).join('\n').trimEnd().replace(/\r\n/g, '\n').replace(/\r/g, '\n');
};

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

  // Les deux pointeurs dupliquent volontairement leur clause « lecture seule » pour que
  // chacun soit complet et autonome — un agent ne doit pas avoir besoin de lire l'autre
  // fichier pour connaître son contrat. Mais cette duplication intentionnelle doit
  // être verrouillée : si l'une des deux clauses change sans l'autre, un contradicteur
  // se retrouve sous un contrat silencieusement modifié, ce qui est une régression grave.
  // La normalisation des fins de ligne dans extraireSectionMarkdown garantit que le verrou
  // fonctionne indépendamment de l'état de checkout git ou de la machine : c'est la clause
  // qui compte, pas le CRLF ou LF du disque.
  test('la clause « Tu es en LECTURE SEULE » est identique dans AGENTS.md et GEMINI.md', () => {
    const AGENTS_LECTURE_SEULE = extraireSectionMarkdown(lire('AGENTS.md'), 'Tu es en LECTURE SEULE', 'AGENTS.md');
    const GEMINI_LECTURE_SEULE = extraireSectionMarkdown(lire('GEMINI.md'), 'Tu es en LECTURE SEULE', 'GEMINI.md');

    expect(AGENTS_LECTURE_SEULE,
      'La clause de lecture seule doit être identique dans les deux pointeurs. ' +
      'Si l\'une diverge, un agent fonctionne sous un contrat non vérifié par l\'autre — ' +
      'c\'est une régression silencieuse. Éditer une clause sans synchroniser l\'autre est interdit.'
    ).toBe(GEMINI_LECTURE_SEULE);
  });
});
