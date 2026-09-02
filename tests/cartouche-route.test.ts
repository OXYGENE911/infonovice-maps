import { describe, it, expect } from 'vitest';
import {
  cartouchePour, zonesEtirables, CARTOUCHES,
  CARTOUCHE_ROUGE, CARTOUCHE_JAUNE, LARGEUR, HAUTEUR, RAYON,
} from '../src/carte/cartouche-route';

/* LES CARTOUCHES DE ROUTE (FOND-6, 02/09).
 *
 * Armelin : « on voit les numéros des routes s'afficher seulement au format
 * texte. Ce serait bien que les routes et autoroutes soient affichées dans
 * leur vrai cartouche cartographique […] sur Google Maps, une autoroute
 * apparaît dans un cartouche rouge A86 aux contours blancs. » Photo à
 * l'appui : A75 et N89 sur ROUGE, D245 sur JAUNE.
 *
 * CE QUE LES TUILES DONNENT, MESURÉ (02/09, trois tuiles décodées) : la
 * couche `toponyme_routier_numero_lin` porte un `txt_typo` à TROIS valeurs et
 * trois seulement — Autoroute, Nationale, Départementale. Les routes
 * européennes, forestières, rurales et communales de la photo n'y sont pas.
 *
 * LE DESSIN LUI-MÊME N'EST PAS TESTÉ ICI : il demande un canevas, et c'est le
 * parcours de bout en bout qui vérifie qu'un écusson se pose réellement sur
 * la carte. Ce fichier garde les DÉCISIONS : quelle couleur pour quelle
 * route, et où MapLibre a le droit d'étirer. */

describe('cartouchePour', () => {
  /* LA SIGNALISATION FRANÇAISE, pas un goût : blanc sur rouge pour
     l'autoroute et la nationale, noir sur jaune pour la départementale. */
  it('met l’autoroute et la nationale sur du rouge', () => {
    expect(cartouchePour('Autoroute')).toBe(CARTOUCHE_ROUGE);
    expect(cartouchePour('Nationale')).toBe(CARTOUCHE_ROUGE);
    expect(CARTOUCHE_ROUGE.texte).toBe('#FFFFFF');
  });

  it('met la départementale sur du jaune, en noir', () => {
    expect(cartouchePour('Départementale')).toBe(CARTOUCHE_JAUNE);
    expect(CARTOUCHE_JAUNE.texte).toBe('#1A1A1A');
  });

  /* CE QU'ON NE SAIT PAS HABILLER RESTE NU. Inventer une couleur pour une
     catégorie qu'on n'a jamais vue dans les tuiles produirait un écusson
     faux — et un écusson faux dit quelque chose de faux sur la route. */
  it('rend null pour une catégorie inconnue, sans en inventer une', () => {
    expect(cartouchePour('Européenne')).toBeNull();
    expect(cartouchePour('Communale')).toBeNull();
    expect(cartouchePour('')).toBeNull();
  });

  it('n’expose que les deux écussons dessinés', () => {
    expect(CARTOUCHES).toHaveLength(2);
    expect(new Set(CARTOUCHES.map((c) => c.cle)).size).toBe(2);
  });

  /* LE LISERÉ N'EST PAS DÉCORATIF : sur une photographie aérienne, un écusson
     sans liseré se fond dans les toits. */
  it('donne un liseré à chaque écusson', () => {
    for (const c of CARTOUCHES) expect(c.bord).toBe('#FFFFFF');
  });
});

describe('zonesEtirables', () => {
  /* MAPLIBRE N'ÉTIRE QUE CE QU'ON LUI DÉSIGNE. Sans bornes, un « D1054 »
     déformerait les coins arrondis en ovales : on n'étire que la bande
     centrale, coins exclus. */
  it('n’étire que la bande centrale, coins exclus', () => {
    const z = zonesEtirables(2);
    expect(z.stretchX[0]![0]).toBe(RAYON * 2);
    expect(z.stretchX[0]![1]).toBe(LARGEUR * 2 - RAYON * 2);
    expect(z.stretchY[0]![0]).toBe(RAYON * 2);
    expect(z.stretchY[0]![1]).toBe(HAUTEUR * 2 - RAYON * 2);
  });

  it('suit le rapport d’écran demandé', () => {
    expect(zonesEtirables(1).stretchX[0]![1]).toBe(LARGEUR - RAYON);
    expect(zonesEtirables(2).pixelRatio).toBe(2);
  });

  /* LA BOÎTE DE TEXTE RESTE À L'INTÉRIEUR DE L'ÉCUSSON : un « 1054 » qui
     toucherait le bord se lirait mal. */
  it('garde le texte à l’intérieur du dessin', () => {
    const z = zonesEtirables(2);
    const [g, h, d, b] = z.content;
    expect(g).toBeGreaterThan(0);
    expect(h).toBeGreaterThan(0);
    expect(d).toBeLessThan(LARGEUR * 2);
    expect(b).toBeLessThan(HAUTEUR * 2);
    expect(d).toBeGreaterThan(g);
    expect(b).toBeGreaterThan(h);
  });
});
