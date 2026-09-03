import { describe, it, expect } from 'vitest';
import { versTheme, estSombre, THEMES } from '../src/lib/theme';

/* LE THÈME JOUR / NUIT (THEME-1, 03/09).
 *
 * Armelin, en 1.60 : « par défaut je suis en carte mode nuit, mais je n'ai
 * pas la possibilité de changer ce paramétrage du navigateur en plein écran
 * de l'application PWA. Est-ce possible d'ajouter dans le menu la possibilité
 * de changer le thème Jour/Nuit ? » */

describe('estSombre', () => {
  it('LE CHOIX BAT LE SYSTÈME, dans les deux sens', () => {
    /* C'est tout l'objet de la demande : son téléphone est en sombre, il veut
       pouvoir lire la carte en clair quand même. */
    expect(estSombre('clair', true)).toBe(false);
    expect(estSombre('sombre', false)).toBe(true);
  });

  it('« AUTO » SUIT LE TÉLÉPHONE — le défaut de toujours ne change pas', () => {
    expect(estSombre('auto', true)).toBe(true);
    expect(estSombre('auto', false)).toBe(false);
  });
});

describe('versTheme', () => {
  it('REND LES TROIS ÉTATS, et « auto » pour tout le reste', () => {
    for (const t of THEMES) expect(versTheme(t)).toBe(t);
    expect(versTheme(undefined)).toBe('auto');
    expect(versTheme('dark')).toBe('auto');
    expect(versTheme(42)).toBe('auto');
  });
});
