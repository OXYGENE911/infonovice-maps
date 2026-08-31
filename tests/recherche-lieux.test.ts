import { describe, it, expect } from 'vitest';
import {
  echapperNom, graphiesDe, urlNomLieu, aRenonce, RAYON_NOM_M, PLAFOND_NOMS,
} from '../src/lib/recherche-lieux';

/* LA RECHERCHE PAR NOM (RECHERCHE-2, refondue par RECHERCHE-3 le 01/09).
 *
 * Ce qui se teste ici, c'est ce qui PART. Et ce qui part a changé, parce que
 * la mesure a parlé : une expression régulière sur `name` EXPIRE sur le
 * service réel (réponse vide + `remark`, à 41 comme à 57 secondes selon la
 * forme), tandis que l'égalité exacte est indexée et rend douze résultats en
 * trois à cinq secondes. Voir l'en-tête de lib/recherche-lieux.ts. */

const CENTRE = { lon: 2.5722, lat: 48.8103 };

describe('graphiesDe', () => {
  /* OVERPASS N'A PAS D'ÉGALITÉ INSENSIBLE À LA CASSE : `["name"="x",i]` n'est
     pas une syntaxe qu'il accepte. On envoie donc trois graphies, ce qui
     reste indexé — mesuré à 3 s pour douze résultats. */
  it('rend la saisie, sa capitale et sa majuscule', () => {
    expect(graphiesDe('castorama')).toEqual(['castorama', 'Castorama', 'CASTORAMA']);
  });

  it('capitalise chaque mot, tirets et apostrophes compris', () => {
    expect(graphiesDe('tour eiffel')).toContain('Tour Eiffel');
    expect(graphiesDe('sainte-thérèse')).toContain('Sainte-Thérèse');
    expect(graphiesDe('l’escale')).toContain('L’Escale');
  });

  it('ne rend pas deux fois la même graphie', () => {
    expect(graphiesDe('IKEA')).toEqual(['IKEA', 'Ikea']);
  });

  it('resserre les espaces, et se tait sur le vide', () => {
    expect(graphiesDe('  Tour   Eiffel ')[0]).toBe('Tour Eiffel');
    expect(graphiesDe('   ')).toEqual([]);
  });
});

describe('echapperNom', () => {
  /* L'ÉGALITÉ EXACTE N'EST PAS UNE REGEX : seuls le guillemet et la
     contre-oblique sont dangereux — et la contre-oblique passe d'abord. */
  it('échappe le guillemet, qui fermerait la chaîne', () => {
    expect(echapperNom('Le "Bistrot"')).toBe('Le \\"Bistrot\\"');
  });

  it('échappe la contre-oblique EN PREMIER', () => {
    expect(echapperNom('a\\b')).toBe('a\\\\b');
    expect(echapperNom('a\\"b')).toBe('a\\\\\\"b');
  });

  it('laisse intacte une parenthèse — elle n’est plus un métacaractère', () => {
    expect(echapperNom('Castorama (Fresnes)')).toBe('Castorama (Fresnes)');
  });
});

describe('urlNomLieu', () => {
  it('cherche l’ÉGALITÉ, jamais une expression régulière', () => {
    const q = decodeURIComponent(urlNomLieu('Castorama', CENTRE)!);
    expect(q).toContain('["name"="Castorama"]');
    expect(q, 'une regex expirerait — mesuré').not.toContain('~');
  });

  it('envoie les trois graphies en UNE union', () => {
    const q = decodeURIComponent(urlNomLieu('castorama', CENTRE)!);
    for (const g of ['castorama', 'Castorama', 'CASTORAMA']) {
      expect(q).toContain(`["name"="${g}"]`);
    }
    expect(q.startsWith('https://overpass.openstreetmap.fr/')).toBe(true);
  });

  it('cherche AUTOUR d’un point, à la portée d’une course', () => {
    const q = decodeURIComponent(urlNomLieu('Castorama', CENTRE)!);
    expect(q).toContain(`around:${RAYON_NOM_M},48.81030,2.57220`);
  });

  it('porte le plafond et le délai — Overpass est bénévole', () => {
    const q = decodeURIComponent(urlNomLieu('x', CENTRE)!);
    expect(q).toContain(`out center tags ${PLAFOND_NOMS};`);
    expect(q).toContain('[timeout:25]');
  });

  it('rend null quand il n’y a rien à chercher', () => {
    expect(urlNomLieu('   ', CENTRE)).toBeNull();
  });
});

describe('aRenonce — une réponse vide n’est pas un zéro', () => {
  /* LE PIÈGE PAYÉ DEUX FOIS. Mesuré sur le service : « Tour Eiffel » en
     expression régulière rend `{"elements":[], "remark":"Query timed out …
     after 57 seconds"}`. Le lire comme « aucun résultat » ferait dire à
     l'application « ce lieu n'existe pas » quand elle veut dire « je n'ai
     pas eu le temps de regarder ». */
  it('reconnaît une expiration : vide AVEC remarque', () => {
    expect(aRenonce({ elements: [], remark: 'runtime error: Query timed out' })).toBe(true);
  });

  it('ne confond pas un vrai zéro avec une expiration', () => {
    expect(aRenonce({ elements: [] })).toBe(false);
    expect(aRenonce({ elements: [], remark: '  ' })).toBe(false);
  });

  it('une réponse pleine n’est jamais une expiration, remarque ou non', () => {
    expect(aRenonce({ elements: [{ id: 1 }], remark: 'note' })).toBe(false);
  });

  it('ne se casse pas sur une réponse difforme', () => {
    expect(aRenonce(null)).toBe(false);
    expect(aRenonce('<html>')).toBe(false);
  });
});
