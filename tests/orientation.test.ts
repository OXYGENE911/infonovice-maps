import { describe, it, expect } from 'vitest';
import {
  ecartAngulaire, lisserCap, capDeBoussole, modeSuivant, libelleMode,
} from '../src/lib/orientation';

/* L'ORIENTATION EN SUIVI (mandat UX du 28/08, NAV-1). Le piège de ce domaine
   est le PASSAGE DU NORD : 350° et 10° sont à 20° l'un de l'autre, pas à
   340 — un lissage naïf ferait faire un tour complet à la carte. */

describe('ecartAngulaire', () => {
  it('prend l’arc le plus court, passage du nord compris', () => {
    expect(ecartAngulaire(350, 10)).toBe(20);
    expect(ecartAngulaire(10, 350)).toBe(-20);
    expect(ecartAngulaire(0, 90)).toBe(90);
    expect(ecartAngulaire(90, 0)).toBe(-90);
  });
  it('un demi-tour exact rend +180, jamais −180 — une seule réponse possible', () => {
    expect(ecartAngulaire(0, 180)).toBe(180);
    expect(ecartAngulaire(180, 0)).toBe(180);
  });
});

describe('lisserCap', () => {
  it('prend le PREMIER cap entier : la carte ne part pas de travers', () => {
    expect(lisserCap(null, 90)).toBe(90);
    expect(lisserCap(null, 450)).toBe(90);
  });
  it('ne déplace ensuite que d’une fraction de l’écart', () => {
    expect(lisserCap(90, 100)).toBeCloseTo(93.5);
  });
  it('lisse par l’arc COURT au passage du nord', () => {
    // De 350° vers 10° : +20° d'écart, 35 % → 357°, jamais 231°.
    expect(lisserCap(350, 10)).toBeCloseTo(357);
    // Et le résultat reste normalisé quand il franchit le nord.
    expect(lisserCap(358, 20)).toBeCloseTo(5.7);
  });
  it('ignore le tremblement : sous 3°, le cap acquis ne bouge pas', () => {
    expect(lisserCap(90, 92)).toBe(90);
    expect(lisserCap(90, 88.5)).toBe(90);
  });
});

describe('capDeBoussole', () => {
  it('préfère webkitCompassHeading (iOS), qui donne le cap directement', () => {
    expect(capDeBoussole({ webkitCompassHeading: 45, alpha: 200, absolute: true })).toBe(45);
  });
  it('convertit un alpha ABSOLU en cap : 360 − alpha', () => {
    expect(capDeBoussole({ alpha: 90, absolute: true })).toBe(270);
    expect(capDeBoussole({ alpha: 0, absolute: true })).toBe(0);
  });
  it('refuse un alpha RELATIF : il pointerait sur la position d’ouverture de la page', () => {
    expect(capDeBoussole({ alpha: 90, absolute: false })).toBeNull();
    expect(capDeBoussole({ alpha: 90 })).toBeNull();
  });
  it('refuse un événement sans mesure', () => {
    expect(capDeBoussole({ alpha: null, absolute: true })).toBeNull();
  });
});

describe('le cycle du bouton', () => {
  it('cap → nord → libre → cap, étiquettes françaises à l’appui', () => {
    expect(modeSuivant('cap')).toBe('nord');
    expect(modeSuivant('nord')).toBe('libre');
    expect(modeSuivant('libre')).toBe('cap');
    expect(libelleMode('cap')).toBe('Cap en haut');
    expect(libelleMode('nord')).toBe('Nord en haut');
    expect(libelleMode('libre')).toBe('Vue libre');
  });
});
