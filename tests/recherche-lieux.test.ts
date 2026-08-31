import { describe, it, expect } from 'vitest';
import {
  echapperNom, urlNomLieu, ZOOM_MIN_NOM, PLAFOND_NOMS,
} from '../src/lib/recherche-lieux';

/* LA RECHERCHE PAR NOM (RECHERCHE-2, 01/09).
 *
 * Armelin veut chercher « une école, une entreprise » par son nom. La BAN ne
 * connaît que des adresses ; OpenStreetMap porte les noms. Ce qui se teste
 * ici, c'est ce qui PART : l'échappement (le texte va dans une chaîne ET
 * dans une regex) et la frugalité inscrite dans l'URL. */

const VUE = { ouest: 2.3, sud: 48.8, est: 2.4, nord: 48.9 };

describe('echapperNom', () => {
  /* DEUX DANGERS, PAS UN : un guillemet ferme la chaîne Overpass, une
     parenthèse casse l'expression régulière. */
  it('échappe les guillemets — ils fermeraient la chaîne', () => {
    expect(echapperNom('Le "Bistrot"')).toBe('Le \\"Bistrot\\"');
  });

  it('échappe les métacaractères d’expression régulière', () => {
    expect(echapperNom('Carrefour (Paris)')).toBe('Carrefour \\(Paris\\)');
    expect(echapperNom('A+B')).toBe('A\\+B');
    expect(echapperNom('fin.')).toBe('fin\\.');
    expect(echapperNom('a|b')).toBe('a\\|b');
    expect(echapperNom('[x]')).toBe('\\[x\\]');
  });

  /* L'ORDRE COMPTE : traiter la contre-oblique en dernier échapperait les
     échappements qu'on vient de poser. */
  it('échappe la contre-oblique EN PREMIER', () => {
    expect(echapperNom('a\\b')).toBe('a\\\\b');
    expect(echapperNom('a\\(b')).toBe('a\\\\\\(b');
  });

  it('laisse intact un nom ordinaire — accents compris', () => {
    expect(echapperNom('Lycée Champlain')).toBe('Lycée Champlain');
  });
});

describe('urlNomLieu', () => {
  it('cherche par SOUS-CHAÎNE et SANS égard à la casse', () => {
    const q = decodeURIComponent(urlNomLieu('Champlain', VUE));
    // `~` et non `=` : « Champlain » doit trouver « Lycée Champlain ».
    expect(q).toContain('nwr["name"~"Champlain",i]');
  });

  it('ordonne l’emprise à la façon Overpass : sud, ouest, nord, est', () => {
    const q = decodeURIComponent(urlNomLieu('x', VUE));
    expect(q).toContain('(48.80000,2.30000,48.90000,2.40000)');
  });

  /* LA FRUGALITÉ S'ÉCRIT DANS L'URL : un plafond, et un délai borné. */
  it('porte le plafond et le délai — Overpass est bénévole', () => {
    const q = decodeURIComponent(urlNomLieu('x', VUE));
    expect(q).toContain(`out center tags ${PLAFOND_NOMS};`);
    expect(q).toContain('[timeout:25]');
  });

  it('n’envoie jamais un nom brut — l’échappement passe par l’URL', () => {
    const q = decodeURIComponent(urlNomLieu('Carrefour (Paris)', VUE));
    expect(q).toContain('"Carrefour \\(Paris\\)"');
  });
});

describe('le seuil de zoom', () => {
  /* SOUS CE ZOOM, ON REFUSE DE CHERCHER, et on le dit : une expression
     régulière sur le nom à l'échelle d'une région ferait payer à un service
     bénévole le prix d'une base d'entreprises qu'il n'est pas. */
  it('reste celui des familles — une seule règle à retenir', () => {
    expect(ZOOM_MIN_NOM).toBe(13);
  });
});
