import { describe, it, expect } from 'vitest';
import {
  capEntre, curseurSVG, formeValide, FORMES, FORME_DEFAUT,
} from '../src/carte/curseur-vehicule';

/* LE CURSEUR DU VÉHICULE (NAV-2, 29/08). Deux choses se testent à sec : le
 * cap déduit de deux positions — le recours quand le GPS ne donne pas de
 * `heading` —, et le fait que la forme choisie ne puisse JAMAIS venir d'une
 * valeur relue sans contrôle. */

describe('capEntre', () => {
  it('rend le nord, l’est, le sud et l’ouest — à un degré près', () => {
    const paris: [number, number] = [2.3522, 48.8566];
    const nord: [number, number] = [2.3522, 48.8666];
    const est: [number, number] = [2.3722, 48.8566];
    const sud: [number, number] = [2.3522, 48.8466];
    const ouest: [number, number] = [2.3322, 48.8566];
    expect(capEntre(paris, nord)).toBeCloseTo(0, 0);
    expect(capEntre(paris, est)).toBeCloseTo(90, 0);
    expect(capEntre(paris, sud)).toBeCloseTo(180, 0);
    expect(capEntre(paris, ouest)).toBeCloseTo(270, 0);
  });

  it('SE TAIT sous le seuil : deux fixes au même endroit ne sont pas une direction', () => {
    const a: [number, number] = [2.3522, 48.8566];
    // ~1,1 m au nord : le bruit d'un récepteur à l'arrêt.
    const presque: [number, number] = [2.3522, 48.856_61];
    expect(capEntre(a, presque)).toBeNull();
    expect(capEntre(a, a)).toBeNull();
  });

  it('rend toujours un cap dans [0, 360[', () => {
    const depart: [number, number] = [2.3522, 48.8566];
    for (let angle = 0; angle < 360; angle += 17) {
      const r = angle * Math.PI / 180;
      const vers: [number, number] = [
        depart[0] + Math.sin(r) * 0.01, depart[1] + Math.cos(r) * 0.01,
      ];
      const cap = capEntre(depart, vers);
      expect(cap).not.toBeNull();
      expect(cap!).toBeGreaterThanOrEqual(0);
      expect(cap!).toBeLessThan(360);
    }
  });
});

describe('formeValide', () => {
  it('accepte les trois formes proposées', () => {
    for (const f of FORMES) expect(formeValide(f.cle)).toBe(f.cle);
  });

  it('refuse tout le reste — une base altérée ne choisit pas l’affichage', () => {
    for (const brut of ['dragon', '', null, undefined, 42, {}, ['fleche']]) {
      expect(formeValide(brut)).toBe(FORME_DEFAUT);
    }
  });
});

describe('curseurSVG', () => {
  it('rend un SVG décoratif, à la taille demandée, pour chaque forme', () => {
    for (const f of FORMES) {
      const svg = curseurSVG(f.cle, 26);
      expect(svg, f.cle).toContain('aria-hidden="true"');
      expect(svg, f.cle).toContain('viewBox="0 0 32 32"');
      expect(svg, f.cle).toContain('width="26"');
      expect(svg, f.cle).toContain(`curseur-${f.cle}`);
    }
  });

  it('ne fige aucune couleur : le trait et le fond viennent du CSS', () => {
    for (const f of FORMES) expect(curseurSVG(f.cle)).not.toMatch(/#[0-9a-fA-F]{3,8}/);
  });
});
