import { describe, it, expect } from 'vitest';
import {
  coteDestination, phraseArrivee, SEUIL_ARRIVE_M, ANGLE_COTE_DEG,
} from '../src/lib/arrivee';

/* L'ARRIVÉE AU BON MOMENT, DU BON CÔTÉ (ARRIVEE-2, 31/08).
 *
 * Armelin : « ne pas indiquer l'arrivée trop tôt, car hier ça m'indiquait que
 * j'étais arrivé 40 m avant […] Pourquoi pas indiquer en vocal : "Vous êtes
 * arrivé à destination. Votre destination se situe sur la gauche (ou la
 * droite) de la chaussée." » */

/* Un tracé plein est le long du 48.85e parallèle : on roule vers l'EST. */
const TRACE: [number, number][] = Array.from({ length: 10 }, (_, i) =>
  [2.3400 + i * 0.0005, 48.8500]);

describe('coteDestination', () => {
  it('roulant vers l’est, une adresse au NORD est à GAUCHE', () => {
    expect(coteDestination(TRACE, { lon: 2.3445, lat: 48.8506 })).toBe('gauche');
  });

  it('roulant vers l’est, une adresse au SUD est à DROITE', () => {
    expect(coteDestination(TRACE, { lon: 2.3445, lat: 48.8494 })).toBe('droite');
  });

  /* UN CÔTÉ DEVINÉ ENVERRAIT TRAVERSER POUR RIEN une fois sur deux : quand
     l'angle ne tranche pas, on ne dit pas de côté. */
  it('droit devant, PAS de côté', () => {
    expect(coteDestination(TRACE, { lon: 2.3460, lat: 48.8500 })).toBeNull();
  });

  it('adresse confondue avec la fin du tracé : pas de côté', () => {
    const fin = TRACE[TRACE.length - 1]!;
    expect(coteDestination(TRACE, { lon: fin[0], lat: fin[1] })).toBeNull();
  });

  it('sans destination ou sans tracé, pas de côté', () => {
    expect(coteDestination(TRACE, null)).toBeNull();
    expect(coteDestination(TRACE, undefined)).toBeNull();
    expect(coteDestination([[2.34, 48.85]], { lon: 2.35, lat: 48.85 })).toBeNull();
  });

  /* LE CAP D'ARRIVÉE SE LIT SUR LES DERNIERS MÈTRES, pas sur deux points
     collés : un tracé dense donnerait un cap de bruit. */
  it('deux points collés en fin de tracé ne brouillent pas le côté', () => {
    const dense: [number, number][] = [...TRACE,
      [TRACE[9]![0] + 0.00000005, 48.8500]];
    expect(coteDestination(dense, { lon: 2.3446, lat: 48.8506 })).toBe('gauche');
  });
});

describe('phraseArrivee — les mots demandés, mot pour mot', () => {
  it('nomme le côté quand il est sûr', () => {
    expect(phraseArrivee('gauche')).toBe('Vous êtes arrivé à destination.'
      + ' Votre destination se situe sur la gauche de la chaussée.');
    expect(phraseArrivee('droite')).toContain('sur la droite de la chaussée');
  });

  it('se tait sur le côté quand il n’est pas sûr', () => {
    expect(phraseArrivee(null)).toBe('Vous êtes arrivé à destination.');
  });
});

describe('les seuils, dits et défendus', () => {
  /* 40 M TROP TÔT ÉTAIT LE DÉFAUT : le seuil du constat doit être NETTEMENT
     sous ces quarante mètres. */
  it('le constat attend d’être vrai', () => {
    expect(SEUIL_ARRIVE_M).toBeLessThanOrEqual(25);
    expect(ANGLE_COTE_DEG).toBeGreaterThan(0);
  });
});
