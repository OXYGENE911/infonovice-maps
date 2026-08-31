import { describe, it, expect } from 'vitest';
import { accentuerMot, accentuerLibelle, AMBIGUS } from '../src/lib/accents-voies';
import { libelleVoie } from '../src/lib/feuille-de-route';

/* LES ACCENTS RENDUS AUX NOMS DE VOIES (ACCENTS-1, 31/08).
 *
 * Armelin : « mon adresse "Avenue du prophète" est écrite "Avenue du
 * Prophete" sans accent. Du coup, la lecture vocale prononce le nom tel quel
 * et phonétiquement, ça fait tache d'entendre "Avenue du Proph[eu]te". »
 *
 * LA SOURCE LES A PERDUS, PAS NOUS — mesuré le 31/08 : la BD TOPO rend
 * « IMP DU PROPHETE », et la BAN elle-même a perdu l'accent sur certaines
 * voies. Ce qui suit défend un dictionnaire FERMÉ, et surtout ce qu'il
 * REFUSE de deviner. */

describe('accentuerMot', () => {
  it('rend l’accent d’un mot connu', () => {
    expect(accentuerMot('prophete')).toBe('prophète');
    expect(accentuerMot('marechale')).toBe('maréchale');
    expect(accentuerMot('eglise')).toBe('église');
    expect(accentuerMot('hopital')).toBe('hôpital');
  });

  /* LA GARANTIE DU DICTIONNAIRE FERMÉ : l'inconnu passe intact. C'est ce qui
     rend le procédé sûr — il ne peut pas inventer de faute. */
  it('laisse passer intact ce qu’il ne connaît pas', () => {
    expect(accentuerMot('rivoli')).toBe('rivoli');
    expect(accentuerMot('barbini')).toBe('barbini');
    expect(accentuerMot('')).toBe('');
  });
});

describe('ce que le dictionnaire REFUSE de deviner', () => {
  /* CES MOTS-LÀ SONT ÉCARTÉS EXPRÈS. Deviner les accents du français en
     général est impossible sans se tromper, et une faute inventée est pire
     qu'une lettre manquante. */
  it.each(AMBIGUS)('n’accentue pas « %s », dont la forme n’est pas certaine', (mot) => {
    expect(accentuerMot(mot)).toBe(mot);
  });

  it('« marche » reste « marche » — la Marche est une région', () => {
    expect(accentuerLibelle('rue de la marche')).toBe('rue de la marche');
  });

  it('« cote » reste « cote » — la Côte et la Cote sont deux mots', () => {
    expect(accentuerLibelle('chemin de la cote')).toBe('chemin de la cote');
  });
});

describe('accentuerLibelle', () => {
  it('traite chaque mot pour lui-même', () => {
    expect(accentuerLibelle('avenue du prophete')).toBe('avenue du prophète');
    expect(accentuerLibelle('place de l’eglise')).toBe('place de l’église');
  });

  /* LES SEGMENTS COMPOSÉS AUSSI : « saint-andre » doit devenir
     « saint-andré », et non rester intact faute d'avoir reconnu le tout. */
  it('descend dans les noms composés', () => {
    expect(accentuerLibelle('saint-andre')).toBe('saint-andré');
    expect(accentuerLibelle('Val-d’Eugene')).toBe('Val-d’Eugène');
  });

  /* LA CASSE D'ORIGINE EST RENDUE : corriger l'accent en cassant la majuscule
     aurait échangé un défaut contre un autre. */
  it('garde la majuscule quand elle était là', () => {
    expect(accentuerLibelle('Prophete')).toBe('Prophète');
    expect(accentuerLibelle('prophete')).toBe('prophète');
  });

  it('ne touche ni aux chiffres ni à la ponctuation', () => {
    expect(accentuerLibelle('D606')).toBe('D606');
    expect(accentuerLibelle('A6 · A7')).toBe('A6 · A7');
  });
});

describe('le nom de voie complet, tel qu’il s’affiche et se dit', () => {
  /* LE CAS EXACT D'ARMELIN, de bout en bout : ce que la BD TOPO rend, et ce
     que l'écran affiche puis que la voix prononce. */
  it('« IMP DU PROPHETE » devient « Impasse du Prophète »', () => {
    expect(libelleVoie('IMP DU PROPHETE')).toBe('Impasse du Prophète');
  });

  it('« AV DE LA MARECHALE » devient « Avenue de la Maréchale »', () => {
    expect(libelleVoie('AV DE LA MARECHALE')).toBe('Avenue de la Maréchale');
  });

  it('« R DOCTEUR LEON PERRIN » retrouve son Léon', () => {
    expect(libelleVoie('R DOCTEUR LEON PERRIN')).toBe('Rue Docteur Léon Perrin');
  });

  /* ET CE QUE LE DICTIONNAIRE NE CONNAÎT PAS RESSORT COMME AVANT : le
     procédé n'abîme rien de ce qui marchait. */
  it('laisse intactes les voies qu’il ne connaît pas', () => {
    expect(libelleVoie('R DE RIVOLI')).toBe('Rue de Rivoli');
    expect(libelleVoie('BD LOUIS VILLECROZE')).toBe('Boulevard Louis Villecroze');
  });
});
