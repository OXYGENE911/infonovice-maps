// UN HOMONYME LOINTAIN DE LA BAN NE PASSE PAS DEVANT LA VUE (lot 145, 09/10/2026).
//
// Le e2e `recherche-nom.spec.ts:276` (RECHERCHE-4 et -5) l'a dit sur la CI de
// la PR #327 : « Collège Albert Camus », le lieu-dit de Thumeries (0,945, à
// deux cents kilomètres) passait devant le collège de la vue. La note de la
// BAN ne dit que le texte ; une réponse lointaine et non nommée garde au plus
// le plancher de l'IGN.
import { describe, expect, it } from 'vitest';
import { noteBan, PLAFOND_LOINTAINE, type VueRecherche } from '../src/lib/recherche-globale';
import type { ResultatAdresse } from '../src/lib/adresse';

const vue: VueRecherche = {
  lon: 2.5722, lat: 48.8103,
  emprise: { ouest: 2.55, est: 2.6, sud: 48.79, nord: 48.83 },
};
const thumeries: ResultatAdresse = {
  lon: 3.064, lat: 50.475, libelle: 'Collège Albert Camus 59239 Thumeries', contexte: 'Thumeries',
  type: 'locality', score: 0.945,
};

describe('la note de départ d’une réponse de la BAN (noteBan)', () => {
  it('plafonne un homonyme lointain que la saisie ne nomme pas', () => {
    expect(noteBan('Collège Albert Camus', thumeries, vue)).toBe(PLAFOND_LOINTAINE);
  });
  it('garde la note quand la saisie NOMME la commune lointaine', () => {
    expect(noteBan('Collège Albert Camus Thumeries', thumeries, vue)).toBe(0.945);
  });
  it('garde la note d’une réponse proche, ou sans vue connue', () => {
    const proche: ResultatAdresse = { ...thumeries, lon: 2.58, lat: 48.81, contexte: 'Le Plessis-Trévise' };
    expect(noteBan('Collège Albert Camus', proche, vue)).toBe(0.945);
    expect(noteBan('Collège Albert Camus', thumeries, null)).toBe(0.945);
  });
  it('ne relève jamais une note plus basse que le plafond', () => {
    expect(noteBan('Collège Albert Camus', { ...thumeries, score: 0.3 }, vue)).toBe(0.3);
  });
});
