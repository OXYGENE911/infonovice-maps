import { describe, it, expect } from 'vitest';
import { pictoMenu, type NomPicto } from '../src/carte/icone-menu';

/* PIC-1 (variante A, validée le 29/08) : les pictos de menu sont dessinés
 * par le code — le contrat vérifiable est qu'ils restent DÉCORATIFS et
 * COHÉRENTS : mêmes attributs pour tous, jamais de couleur en dur qui
 * ignorerait le thème, jamais de sens porté par l'image seule. */

const NOMS: NomPicto[] = [
  'recharge', 'monuments', 'feuille', 'partage',
  'vehicule', 'couches', 'options',
  'itineraire', 'favoris', 'fonds', 'trafic',
  // PIC-2 (29/08) : les options du trajet.
  'pieton', 'rapide', 'court', 'autoroute', 'tunnel', 'pont',
];

describe('pictoMenu', () => {
  it('rend chaque picto décoratif : aria-hidden, hors tabulation, carré de 24', () => {
    for (const nom of NOMS) {
      const svg = pictoMenu(nom);
      expect(svg, nom).toContain('aria-hidden="true"');
      expect(svg, nom).toContain('focusable="false"');
      expect(svg, nom).toContain('viewBox="0 0 24 24"');
      expect(svg, nom).toContain('class="picto-menu"');
    }
  });

  it('ne fige AUCUNE couleur en dur : le trait suit currentColor via le CSS', () => {
    /* Une couleur hexadécimale dans le markup ignorerait le mode sombre.
       Les seules exceptions autorisées sont les jetons var(--…). */
    for (const nom of NOMS) {
      expect(pictoMenu(nom), nom).not.toMatch(/#[0-9a-fA-F]{3,8}/);
      expect(pictoMenu(nom), nom).not.toMatch(/fill="(?!none)[a-z]+"/);
    }
  });

  it('l’éclair des arrêts de recharge est la seule forme pleine', () => {
    const pleins = NOMS.filter((n) => pictoMenu(n).includes('picto-menu-plein'));
    expect(pleins).toEqual(['recharge']);
  });

  it('autant de tracés que de pictos — pas de doublon copié-collé', () => {
    const traces = new Set(NOMS.map((n) => pictoMenu(n)));
    expect(traces.size).toBe(NOMS.length);
  });
});
