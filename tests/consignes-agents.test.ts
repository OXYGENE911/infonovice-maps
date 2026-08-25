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

const CLAUDE = lire('CLAUDE.md');
const POINTEURS = [
  {
    nom: 'AGENTS.md',
    texte: lire('AGENTS.md'),
    titreMandat: '## Ton rôle : contester le DIFF',
    titreAutre: '## Ton rôle : contester le PLAN',
  },
  {
    nom: 'GEMINI.md',
    texte: lire('GEMINI.md'),
    titreMandat: '## Ton rôle : contester le PLAN',
    titreAutre: '## Ton rôle : contester le DIFF',
  },
];

// Phrases qui n'ont qu'un seul domicile légitime : CLAUDE.md. Cette liste ne couvre
// QUE ces quatre phrases, et QUE les deux fichiers listés dans POINTEURS : une
// contrainte recopiée hors de ces quatre-là (RGPD, budget bundle, AGPL, Lighthouse…),
// ou un troisième fichier de consignes créé plus tard (`.cursorrules`,
// `.github/copilot-instructions.md`…), échappe entièrement à ce verrou — seul le
// plafond de 40 lignes limite alors la dérive. Étendre cette liste et POINTEURS
// est la seule façon d'élargir la couverture réelle du garde-fou.
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

  // Cible la section « Lis d'abord... » elle-même, pas le fichier entier : un simple
  // `toContain('CLAUDE.md')` sur tout le fichier passerait même si cette section
  // disparaissait, tant qu'une autre occurrence traîne ailleurs (GEMINI.md cite aussi
  // « CLAUDE.md » dans « Quelle règle de CLAUDE.md viole-t-il ? »).
  test.each(POINTEURS)('$nom renvoie à CLAUDE.md au lieu de le recopier', ({ texte, nom }) => {
    const section = extraireSectionMarkdown(texte, "Lis d'abord les règles du projet", nom);
    expect(section).toContain('CLAUDE.md');
  });

  test.each(POINTEURS)('$nom ne duplique aucune contrainte canonique', ({ texte, nom }) => {
    for (const phrase of CANONIQUES) {
      expect(texte, `${nom} recopie « ${phrase} » — la source doit rester unique`)
        .not.toContain(phrase);
    }
  });

  // Un pointeur qui grossit est un pointeur qui redevient une copie.
  test.each(POINTEURS)('$nom reste court (moins de 40 lignes)', ({ texte, nom }) => {
    const nombreDeLignes = texte.trimEnd().split('\n').length;
    expect(
      nombreDeLignes,
      `${nom} fait ${nombreDeLignes} lignes. En cas d'échec : retire des lignes du ` +
      `fichier fautif, ne relève JAMAIS ce seuil de 40 — c'est lui le garde-fou.`
    ).toBeLessThan(40);
  });

  // Le titre de section exact, pas le mot isolé : le mot « plan » se retrouve par
  // accident ailleurs dans GEMINI.md (« la section du plan visée », dans le format
  // imposé), donc une inversion des deux mandats passerait inaperçue avec un simple
  // `toContain('plan')`.
  test.each(POINTEURS)('$nom déclare son mandat par son titre de section, et sa lecture seule', ({ texte, titreMandat }) => {
    expect(texte).toContain(titreMandat);
    expect(texte.toLowerCase()).toContain('lecture seule');
  });

  // Assertion négative symétrique : le titre de section de l'AUTRE mandat ne doit
  // apparaître nulle part. Sans elle, un fichier qui déclarerait les deux mandats à
  // la fois (ou les aurait inversés) passerait quand même le test précédent.
  test.each(POINTEURS)("$nom ne déclare pas le mandat de l'autre pointeur", ({ texte, titreAutre }) => {
    expect(texte).not.toContain(titreAutre);
  });

  // Les deux pointeurs dupliquent volontairement leur clause « lecture seule » pour que
  // chacun soit complet et autonome — un agent ne doit pas avoir besoin de lire l'autre
  // fichier pour connaître son contrat. Mais cette duplication intentionnelle doit
  // être verrouillée : si l'une des deux clauses change sans l'autre, un contradicteur
  // se retrouve sous un contrat silencieusement modifié, ce qui est une régression grave.
  test('la clause « Tu es en LECTURE SEULE » est identique dans AGENTS.md et GEMINI.md', () => {
    const [agents, gemini] = POINTEURS;
    const AGENTS_LECTURE_SEULE = extraireSectionMarkdown(agents.texte, 'Tu es en LECTURE SEULE', agents.nom);
    const GEMINI_LECTURE_SEULE = extraireSectionMarkdown(gemini.texte, 'Tu es en LECTURE SEULE', gemini.nom);

    expect(AGENTS_LECTURE_SEULE,
      'La clause de lecture seule doit être identique dans les deux pointeurs. ' +
      'Si l\'une diverge, un agent fonctionne sous un contrat non vérifié par l\'autre — ' +
      'c\'est une régression silencieuse. Éditer une clause sans synchroniser l\'autre est interdit.'
    ).toBe(GEMINI_LECTURE_SEULE);
  });
});
