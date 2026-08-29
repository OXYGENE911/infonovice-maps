import { describe, it, expect } from 'vitest';
import { classeRoute, numeroRoute, libelleClasse } from '../src/lib/classe-route';

/* LA CLASSE D'UNE ROUTE (GUID-2, 29/08). La couleur du cartouche en dépend :
 * un cartouche bleu sur une départementale serait un panneau faux. D'où la
 * prudence testée ici — tout ce qui n'est pas reconnu retombe sur « locale »,
 * qui ne peint rien. */

describe('classeRoute', () => {
  it('reconnaît les autoroutes', () => {
    for (const v of ['A6', 'A 6', 'a6', 'A86', 'A6a', ' A1 ']) {
      expect(classeRoute(v), v).toBe('autoroute');
    }
  });

  it('reconnaît les nationales, avec ou sans le R des producteurs', () => {
    for (const v of ['N7', 'RN 7', 'n118', 'RN118']) {
      expect(classeRoute(v), v).toBe('nationale');
    }
  });

  it('reconnaît les départementales — celles relevées sur le service', () => {
    // D39, D415 et D606 sont les numéros MESURÉS le 29/08 sur un
    // Melun-Fontainebleau : la fixture vient du terrain, pas de la tête.
    for (const v of ['D39', 'D415', 'D606', 'RD 906', 'd14e']) {
      expect(classeRoute(v), v).toBe('departementale');
    }
  });

  it('NE CLASSE PAS ce qui n’est pas une route numérotée', () => {
    /* « Avenue » commence par un A, « Nationale » par un N, « Rue du Nord »
       aussi : sans chiffre, aucune classe — un cartouche bleu sur une
       avenue serait un faux panneau. */
    for (const v of ['Avenue de la République', 'Rue de Rivoli', 'Allée des Tilleuls',
      'Nationale (rue)', 'Digue', '', '   ', 'Boulevard Ney']) {
      expect(classeRoute(v), v).toBe('locale');
    }
  });
});

describe('numeroRoute', () => {
  it('normalise le numéro pour l’écusson', () => {
    expect(numeroRoute('A 6')).toBe('A6');
    expect(numeroRoute(' rn 118 ')).toBe('RN118');
    expect(numeroRoute('d606')).toBe('D606');
  });

  it('rend une chaîne vide pour une voie nommée : pas d’écusson à porter', () => {
    expect(numeroRoute('Rue de Rivoli')).toBe('');
    expect(numeroRoute('')).toBe('');
  });
});

describe('libelleClasse', () => {
  it('nomme chaque classe en toutes lettres — pour qui écoute la page', () => {
    expect(libelleClasse('autoroute')).toBe('autoroute');
    expect(libelleClasse('nationale')).toBe('route nationale');
    expect(libelleClasse('departementale')).toBe('route départementale');
    expect(libelleClasse('locale')).toBe('voie locale');
  });
});
