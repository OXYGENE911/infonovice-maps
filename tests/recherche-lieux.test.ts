import { describe, it, expect } from 'vitest';
import {
  echapperNom, graphiesDe, urlNomLieu, aRenonce, sansLaCommune,
  RAYON_NOM_M, PLAFOND_NOMS,
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

/* CHERCHER UNE ENSEIGNE, ET SITUER PAR LA COMMUNE (RECHERCHE-6, 03/09).
 *
 * LE TERRAIN. Un usager d'Armelin : il tape « INRAE beaucouzé » et ne trouve
 * rien ; « Carrefour », rien ; « Leroy Merlin », rien. « Aucun commerce n'est
 * disponible […] en l'état, l'application est difficilement utilisable. »
 *
 * DEUX CAUSES, TOUTES DEUX MESURÉES LE 03/09 SUR LE SERVICE RÉEL.
 *
 *  1. ON NE CHERCHAIT QUE DANS `name`. Autour d'Angers, OpenStreetMap
 *     connaît « Carrefour City », « Carrefour Market », « Carrefour Contact »,
 *     « Carrefour Angers Saint Serge » — et trois objets seulement nommés
 *     exactement « Carrefour ». La clé `brand`, elle, porte la MARQUE :
 *     `["brand"="Carrefour"]` rend 7 objets en 1,4 s, et l'union des trois
 *     clés en rend ONZE en 1,6 s.
 *
 *  2. LA COMMUNE ÉTAIT CHERCHÉE COMME UN MORCEAU DU NOM. « INRAE beaucouzé »
 *     ne peut pas trouver un objet nommé « INRAE » par égalité exacte.
 *
 * ET L'ÉGALITÉ RESTE LA RÈGLE : re-mesuré le 03/09, une expression régulière
 * sur `name` dans 25 km met 29 à 61 secondes et rend ZÉRO — elle expire en
 * silence. On ajoute des CLÉS, jamais de la souplesse. */

describe('urlNomLieu — les trois clés', () => {
  const centre = { lon: -0.554, lat: 47.474 };

  it('cherche le nom, la MARQUE et l’opérateur', () => {
    const u = decodeURIComponent(urlNomLieu('Carrefour', centre)!);
    expect(u).toContain('["name"="Carrefour"]');
    expect(u, 'sans `brand`, les Carrefour City et Market restent introuvables')
      .toContain('["brand"="Carrefour"]');
    expect(u).toContain('["operator"="Carrefour"]');
  });

  /* CHAQUE GRAPHIE SUR CHAQUE CLÉ : Overpass n'accepte pas `["name"="x",i]`,
     et la casse se rattrape donc par l'union. */
  it('croise les trois graphies avec les trois clés', () => {
    const u = decodeURIComponent(urlNomLieu('carrefour', centre)!);
    expect(u).toContain('["brand"="carrefour"]');
    expect(u).toContain('["brand"="Carrefour"]');
    expect(u).toContain('["brand"="CARREFOUR"]');
  });

  /* AUCUNE EXPRESSION RÉGULIÈRE : c'est la leçon de RECHERCHE-3, re-mesurée
     le 03/09. Une regex expire en silence et rend zéro. */
  it('n’emploie AUCUNE expression régulière', () => {
    const u = decodeURIComponent(urlNomLieu('Leroy Merlin', centre)!);
    expect(u).not.toContain('~');
  });
});

describe('sansLaCommune', () => {
  it('retire la commune que la BAN a reconnue', () => {
    expect(sansLaCommune('INRAE beaucouzé', 'Beaucouzé')).toBe('INRAE');
    expect(sansLaCommune('Leroy Merlin Angers', 'Angers')).toBe('Leroy Merlin');
  });

  it('ignore les accents et la casse', () => {
    expect(sansLaCommune('INRAE BEAUCOUZE', 'Beaucouzé')).toBe('INRAE');
  });

  /* « BEAUCOUZÉ » SEUL NE DOIT PAS DEVENIR UNE RECHERCHE VIDE : s'il ne reste
     rien à chercher, on rend la saisie et la BAN répond, comme avant. */
  it('rend la saisie entière quand il ne resterait rien', () => {
    expect(sansLaCommune('Beaucouzé', 'Beaucouzé')).toBe('Beaucouzé');
    expect(sansLaCommune('Le Mans', 'Le Mans')).toBe('Le Mans');
  });

  it('ne retire rien quand la commune n’est pas dans la saisie', () => {
    expect(sansLaCommune('Leroy Merlin', 'Angers')).toBe('Leroy Merlin');
  });

  it('garde les mots courts qui accompagnent un vrai nom', () => {
    expect(sansLaCommune('Le Bon Marché Paris', 'Paris')).toBe('Le Bon Marché');
  });
});
