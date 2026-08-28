import { describe, it, expect } from 'vitest';
import { cranSuivant } from '../src/carte/feuille-basse';

/* LA FEUILLE BASSE (BS-1, décision d'Armelin du 28/08). La seule logique qui
   mérite un test à sec est le choix du palier au relâchement : c'est elle qui
   fait qu'un geste « se comprend » — un flick ferme, un lâcher hésitant
   s'arrête au plus proche. mi = 400, plein = 700 dans tous les cas. */

describe('cranSuivant', () => {
  it('un geste LENT s’arrête au palier le plus proche — fermeture comprise', () => {
    expect(cranSuivant(120, 0, 400, 700)).toBe('fermer');
    expect(cranSuivant(380, 0, 400, 700)).toBe('mi');
    expect(cranSuivant(660, 0, 400, 700)).toBe('plein');
  });

  it('un flick vers le HAUT ouvre en grand — sauf depuis tout en bas, où il rend la mi-hauteur', () => {
    expect(cranSuivant(450, 2, 400, 700)).toBe('plein');
    /* Depuis 150 px, un flick qui sauterait direct au plein écran serait
       brutal : on rend d'abord la mi-hauteur, le geste peut se répéter. */
    expect(cranSuivant(150, 2, 400, 700)).toBe('mi');
  });

  it('un flick vers le BAS descend d’UN palier : plein → mi, mi → fermé', () => {
    expect(cranSuivant(650, -2, 400, 700)).toBe('mi');
    expect(cranSuivant(400, -2, 400, 700)).toBe('fermer');
    expect(cranSuivant(200, -2, 400, 700)).toBe('fermer');
  });

  it('le seuil du flick est un DEMI-pixel par milliseconde — en deçà, on est un geste lent', () => {
    // 0,4 px/ms vers le bas depuis 650 : pas un flick, le plus proche gagne.
    expect(cranSuivant(650, -0.4, 400, 700)).toBe('plein');
  });
});
