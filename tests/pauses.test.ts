import { describe, it, expect } from 'vitest';
import {
  PROFILS_PAUSE, corpsRequeteAgrements, versPointsAgrement,
  agrementsParBorne, RAYON_AGREMENT_M,
} from '../src/lib/pauses';
import { cleBorne, type BorneCandidate } from '../src/lib/arrets';

/* LES PROFILS DE PAUSES (décision d'Armelin du 28/08). La forme de la
   requête est elle-même une mesure : le corridor saturait Overpass, l'union
   de disques répond en sept secondes — c'est elle que ces tests verrouillent. */

const borne = (lon: number, lat: number, nom = 'B'): BorneCandidate =>
  ({ nom, lon, lat, avancementM: 0, ecartM: 0, puissanceKw: 150 });

const famille = PROFILS_PAUSE[0]!;

describe('corpsRequeteAgrements', () => {
  it('une UNION de disques autour des bornes — jamais le corridor qui sature', () => {
    const corps = corpsRequeteAgrements(famille, [borne(5.0415, 47.322), borne(4.8357, 45.764)]);
    expect(corps).toContain(`(around:${RAYON_AGREMENT_M},47.32200,5.04150)`);
    expect(corps).toContain(`(around:${RAYON_AGREMENT_M},45.76400,4.83570)`);
    expect(corps).toContain('["leisure"="playground"]');
    expect(corps.startsWith('[out:json]')).toBe(true);
  });
  it('soixante disques au plus : au-delà, la requête grossit pour rien', () => {
    const beaucoup = Array.from({ length: 90 }, (_, i) => borne(2 + i / 100, 47));
    const corps = corpsRequeteAgrements(famille, beaucoup);
    expect((corps.match(/around:/g) ?? []).length).toBe(60);
  });
});

describe('versPointsAgrement', () => {
  it('lit nœuds et chemins (center), écarte le reste — défensif', () => {
    const points = versPointsAgrement({ elements: [
      { lat: 47.3, lon: 5.04 },
      { center: { lat: 47.31, lon: 5.05 } },
      { tags: { name: 'sans position' } },
      42, null,
    ] });
    expect(points).toHaveLength(2);
    expect(versPointsAgrement(null)).toEqual([]);
  });
});

describe('agrementsParBorne', () => {
  it('rend la distance du PLUS PROCHE agrément, par clé de borne', () => {
    const b = borne(5.0415, 47.322, 'Dijon');
    // ~222 m à l'est (0,003° de longitude à cette latitude).
    const carte = agrementsParBorne([b], [
      { lon: 5.0445, lat: 47.322 },
      { lon: 5.06, lat: 47.34 },
    ]);
    const d = carte.get(cleBorne(b));
    expect(d).toBeGreaterThan(180);
    expect(d).toBeLessThan(280);
  });
  it('hors du rayon : la borne n’a PAS d’agrément — on ne promet pas un parc à 2 km', () => {
    const b = borne(5.0415, 47.322);
    expect(agrementsParBorne([b], [{ lon: 5.07, lat: 47.322 }]).size).toBe(0);
  });
});
