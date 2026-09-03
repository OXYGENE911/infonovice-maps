import { describe, it, expect } from 'vitest';
import { familleDevinee } from '../src/lib/famille-devinee';
import { MOTIF_DE_FAMILLE } from '../src/lib/pictos-lieux';
import { CATEGORIES } from '../src/lib/categories';

/* LA FAMILLE DEVINÉE D'UN RÉSULTAT (PICTO-2, 03/09).
 *
 * Armelin, en 1.60 : « ce serait bien d'afficher un logo de POI si l'adresse
 * de destination est détectée comme étant une Gare, un restaurant, un centre
 * commercial ou autre — ce qui permettrait de faire la différence de suite
 * dans les résultats si plusieurs items s'affichent. » */

describe('familleDevinee', () => {
  it('RECONNAÎT LES TROIS EXEMPLES QU’IL DONNE — gare, restaurant, centre commercial', () => {
    expect(familleDevinee('Gare Saint-Lazare')).toBe('transport');
    expect(familleDevinee('Restaurant Le Bistrot')).toBe('restaurant');
    expect(familleDevinee('Centre commercial Pincevent')).toBe('commerce');
  });

  it('LE MOT EN TÊTE DIT LA NATURE — c’est le français des noms de lieux', () => {
    expect(familleDevinee('Collège Albert Camus')).toBe('ecole');
    expect(familleDevinee('Musée du Louvre')).toBe('culture');
    expect(familleDevinee('Stade de France')).toBe('sport');
    expect(familleDevinee('Pharmacie de la Mairie')).toBe('sante');
    expect(familleDevinee('La Gare')).toBe('transport');
  });

  it('LES ENSEIGNES SE RECONNAISSENT n’importe où dans le libellé', () => {
    expect(familleDevinee('CARREFOUR HYPERMARCHES')).toBe('commerce');
    expect(familleDevinee('Castorama')).toBe('commerce');
    expect(familleDevinee('LEROY MERLIN FRANCE')).toBe('commerce');
  });

  it('« RUE DE LA GARE » N’EST PAS UNE GARE — dans le doute, rien', () => {
    /* Un picto faux ferait pire que pas de picto : c'est le « rond honnête »
       des pastilles, appliqué à la recherche. */
    expect(familleDevinee('Rue de la Gare')).toBeNull();
    expect(familleDevinee('Avenue du Stade')).toBeNull();
    expect(familleDevinee('8 Rue de la Paix 75002 Paris')).toBeNull();
    expect(familleDevinee('INRAE')).toBeNull();
  });

  it('CHAQUE FAMILLE DEVINABLE EXISTE dans les pastilles de la carte', () => {
    /* La pastille de la recherche est CELLE de la carte : une famille devinée
       sans motif ni couleur ferait une ligne à trou. */
    for (const libelle of ['Gare de Lyon', 'Restaurant X', 'Café Y', 'Hôtel Z',
      'Musée A', 'Cinéma B', 'Pharmacie C', 'École D', 'Banque E', 'Parking F',
      'Stade G', 'Centre commercial H']) {
      const f = familleDevinee(libelle);
      expect(f, libelle).not.toBeNull();
      expect(MOTIF_DE_FAMILLE[f as string], `motif de ${f}`).toBeDefined();
      expect(CATEGORIES.find((c) => c.cle === f), `couleur de ${f}`).toBeDefined();
    }
  });
});
