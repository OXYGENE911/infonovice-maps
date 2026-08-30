import { describe, it, expect } from 'vitest';
import {
  fondPanneau, encreSur, cartoucheNumero, routesEuropeennes,
} from '../src/lib/panneau';
import { classeRoute } from '../src/lib/classe-route';

/* LES PANNEAUX (PAN-1, demande d'Armelin du 30/08 : « de vrais panneaux
 * d'autoroute »). Ce qui se teste à sec, c'est la RÈGLE — celle de l'IISR,
 * relevée le 30/08 — et non l'apparence, qui se mesure sur capture et dans
 * les parcours bout-en-bout. */

describe('fondPanneau', () => {
  it('donne le bleu à l’autoroute et le vert aux nationales', () => {
    expect(fondPanneau('autoroute')).toBe('bleu');
    expect(fondPanneau('nationale')).toBe('vert');
  });

  it('donne le BLANC aux départementales — la règle ne connaît pas d’orange', () => {
    /* Armelin avait demandé de l'orange le 29/08 ; la signalisation réelle
       signale une départementale sur fond blanc, et c'est son CARTOUCHE qui
       est jaune. Le jaune reste donc à l'écran, là où il est réglementaire. */
    expect(fondPanneau('departementale')).toBe('blanc');
    expect(fondPanneau('locale')).toBe('blanc');
  });
});

describe('encreSur', () => {
  it('applique la règle telle quelle : bleu et vert en blanc, blanc en noir', () => {
    expect(encreSur('bleu')).toBe('blanche');
    expect(encreSur('vert')).toBe('blanche');
    expect(encreSur('blanc')).toBe('noire');
  });
});

describe('cartoucheNumero', () => {
  it('met du ROUGE sur les autoroutes ET les nationales — c’est le même type', () => {
    expect(cartoucheNumero('autoroute')).toBe('rouge');
    expect(cartoucheNumero('nationale')).toBe('rouge');
  });

  it('met du JAUNE sur les départementales', () => {
    expect(cartoucheNumero('departementale')).toBe('jaune');
  });

  it('ne met RIEN sur une voie locale : un cartouche vide serait un faux panneau', () => {
    expect(cartoucheNumero('locale')).toBeNull();
  });

  it('s’accorde avec la classe lue sur le numéro, bout à bout', () => {
    expect(cartoucheNumero(classeRoute('A6'))).toBe('rouge');
    expect(cartoucheNumero(classeRoute('RN7'))).toBe('rouge');
    expect(cartoucheNumero(classeRoute('D606'))).toBe('jaune');
    expect(cartoucheNumero(classeRoute('Rue de Rivoli'))).toBeNull();
  });
});

describe('routesEuropeennes', () => {
  it('sépare les routes d’un même tronçon : « E15/E50 » en porte DEUX', () => {
    // Valeur RÉELLE, relevée le 30/08 sur la ressource bdtopo-pgr.
    expect(routesEuropeennes('E15/E50')).toEqual(['E15', 'E50']);
    expect(routesEuropeennes('E54')).toEqual(['E54']);
  });

  it('REFUSE ce qui n’est pas un numéro européen — le champ vient d’un service', () => {
    expect(routesEuropeennes('')).toEqual([]);
    expect(routesEuropeennes('N7')).toEqual([]);
    expect(routesEuropeennes('E15/bruit')).toEqual(['E15']);
  });
});
