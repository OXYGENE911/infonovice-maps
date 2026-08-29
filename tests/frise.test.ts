import { describe, it, expect } from 'vitest';
import { segmentsFrise, niveauDeType, PORTEE_M } from '../src/lib/frise';

/* LA BARRE DU TRAJET (FRISE-2, 29/08). Ce qui se teste à sec : le découpage
 * en segments colorés. Le contrat est géométrique — contigu, sans trou, sans
 * chevauchement — parce qu'une barre qui saute une tranche montrerait un
 * blanc qu'aucune donnée ne justifie. */

const total = 100_000;

/** Les segments couvrent [0, total] d'un bout à l'autre, dans l'ordre. */
function verifierContiguite(segments: { deM: number; aM: number }[]): void {
  expect(segments.length).toBeGreaterThan(0);
  expect(segments[0]!.deM).toBe(0);
  expect(segments[segments.length - 1]!.aM).toBe(total);
  for (let i = 0; i < segments.length - 1; i += 1) {
    expect(segments[i]!.aM, 'trou ou chevauchement').toBe(segments[i + 1]!.deM);
    expect(segments[i]!.aM).toBeGreaterThan(segments[i]!.deM);
  }
}

describe('niveauDeType', () => {
  it('le rouge est réservé à ce qui bloque', () => {
    for (const t of ['ACCIDENT', 'COUPURE', 'BOUCHON']) expect(niveauDeType(t)).toBe('bloque');
  });

  it('l’orange à ce qui ralentit', () => {
    for (const t of ['TRAVAUX', 'INTEMPERIES', 'OBSTACLE']) expect(niveauDeType(t)).toBe('ralenti');
  });

  it('NE COLORE RIEN de ce qui ne dit rien du temps de parcours', () => {
    /* Une interdiction poids lourds ou une information ne ralentit pas une
       voiture : la peindre en orange serait une alerte inventée. */
    for (const t of ['RESTRICTION', 'INTERDICTION_PL', 'INFORMATION',
      'MESURE_GESTION_TRAFIC', 'CE_TYPE_N_EXISTE_PAS']) {
      expect(niveauDeType(t), t).toBeNull();
    }
  });
});

describe('segmentsFrise', () => {
  it('sans événement, tout le trajet est « libre » — un seul segment', () => {
    expect(segmentsFrise(total, [])).toEqual([{ deM: 0, aM: total, niveau: 'libre' }]);
  });

  it('un bouchon peint une bande d’un kilomètre de part et d’autre', () => {
    const s = segmentsFrise(total, [{ avancementM: 50_000, type: 'BOUCHON' }]);
    verifierContiguite(s);
    expect(s).toEqual([
      { deM: 0, aM: 50_000 - PORTEE_M, niveau: 'libre' },
      { deM: 50_000 - PORTEE_M, aM: 50_000 + PORTEE_M, niveau: 'bloque' },
      { deM: 50_000 + PORTEE_M, aM: total, niveau: 'libre' },
    ]);
  });

  it('LE PIRE L’EMPORTE : un bouchon dans une zone de travaux reste rouge', () => {
    const s = segmentsFrise(total, [
      { avancementM: 50_000, type: 'TRAVAUX' },
      { avancementM: 50_200, type: 'ACCIDENT' },
    ]);
    verifierContiguite(s);
    const bloques = s.filter((x) => x.niveau === 'bloque');
    expect(bloques).toHaveLength(1);
    // La tranche commune est rouge, et les ailes de travaux restent orange.
    expect(bloques[0]!.deM).toBe(49_200);
    expect(bloques[0]!.aM).toBe(51_200);
    expect(s.filter((x) => x.niveau === 'ralenti')).toHaveLength(1);
  });

  it('les bandes DÉBORDANTES se rabotent aux bornes du trajet', () => {
    const s = segmentsFrise(total, [
      { avancementM: 200, type: 'BOUCHON' },
      { avancementM: total - 100, type: 'COUPURE' },
    ]);
    verifierContiguite(s);
    expect(s[0]!.niveau).toBe('bloque');
    expect(s[s.length - 1]!.niveau).toBe('bloque');
  });

  it('deux bandes voisines de même niveau n’en font qu’une', () => {
    const s = segmentsFrise(total, [
      { avancementM: 40_000, type: 'BOUCHON' },
      { avancementM: 41_000, type: 'BOUCHON' },
    ]);
    verifierContiguite(s);
    expect(s.filter((x) => x.niveau === 'bloque')).toHaveLength(1);
  });

  it('un trajet de longueur nulle ne rend rien — pas une barre vide à peindre', () => {
    expect(segmentsFrise(0, [{ avancementM: 0, type: 'BOUCHON' }])).toEqual([]);
    expect(segmentsFrise(-5, [])).toEqual([]);
  });

  it('un événement qui ne colore rien laisse le trajet d’une seule pièce', () => {
    expect(segmentsFrise(total, [{ avancementM: 50_000, type: 'INFORMATION' }]))
      .toEqual([{ deM: 0, aM: total, niveau: 'libre' }]);
  });
});
