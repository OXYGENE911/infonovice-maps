import { describe, expect, it } from 'vitest';
import { baseDuLien, lienPosition, textePartage } from '../src/lib/partage-position';
import { depuisFragmentLieu } from '../src/lib/partage-favoris';

/* OUTILS-2 (06/09). Le lien de position est celui que l'application lit déjà
   (#lieu=) : l'aller-retour se prouve avec le lecteur existant. */

describe('lienPosition', () => {
  it('bâtit un lien #lieu= que l’application relit — cinq décimales, un nom encodé', () => {
    const lien = lienPosition('https://maps.infonovice.fr/', 2.352200123, 48.8566, 'Ma position');
    expect(lien).toBe('https://maps.infonovice.fr/#lieu=2.35220,48.85660,Ma%20position');
    const lu = depuisFragmentLieu(new URL(lien).hash);
    expect(lu).toMatchObject({ lon: 2.3522, lat: 48.8566, nom: 'Ma position' });
  });
  it('la base ne garde ni fragment ni requête', () => {
    expect(baseDuLien('https://maps.infonovice.fr/?x=1#iti=2,48;3,47')).toBe('https://maps.infonovice.fr/');
    expect(baseDuLien('http://localhost:4173/index.html#lieu=1,2,a')).toBe('http://localhost:4173/index.html');
  });
  it('le texte nomme l’adresse quand on l’a, les coordonnées sinon', () => {
    expect(textePartage(2.3522, 48.8566, null)).toMatch(/^Ma position : 48,8566/);
    expect(textePartage(2.3522, 48.8566, '8 Rue de la Paix 75002 Paris'))
      .toMatch(/^Ma position : 8 Rue de la Paix 75002 Paris \(48,8566/);
  });
});
