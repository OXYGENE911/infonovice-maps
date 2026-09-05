import { describe, expect, it } from 'vitest';
import {
  versAires, versCommodites, requeteCommodites, fragmentAires, reseauxIrve, pictosAire,
  airesDevant, tempsJusquA, distanceCourte, dureeCourte, situerAvecCote, centreDe,
  type Aire,
} from '../src/lib/aires';

/* AIRES-1 (05/09). Un tracé plein est (A6 vers le sud-est, simplifié) : les
   aires à DROITE du sens de marche sont au sud (latitude plus basse). Mesuré
   sur l'A6 : les aires se font face de part et d'autre, celle de l'autre
   chaussée est à gauche. */
const TRACE: [number, number][] = Array.from({ length: 30 }, (_, i) => [3.5 + i * 0.01, 47.8]);

const aire = (tags: Record<string, string>, lat: number, lon = 3.6, type = 'way', id = 1) => ({
  type, id, center: { lat, lon }, tags,
});

describe('versAires', () => {
  it('garde les aires nommées à DROITE, écarte celle de l’autre chaussée et les refuges sans nom', () => {
    const el = [
      aire({ highway: 'services', name: 'Aire de Venoy-Chablis', operator: 'APRR', toilets: 'yes' }, 47.7994, 3.6, 'way', 1),
      aire({ highway: 'services', name: 'Aire de Venoy-Soleil Levant', operator: 'APRR' }, 47.8006, 3.6, 'way', 2),
      { type: 'node', id: 3, lat: 47.7995, lon: 3.65, tags: { highway: 'rest_area' } },
      { type: 'node', id: 4, lat: 47.7995, lon: 3.7, tags: { highway: 'rest_area', name: 'Aire de Voutenay' } },
      aire({ highway: 'rest_area' }, 47.7992, 3.75, 'way', 5),
      aire({ highway: 'services', name: 'Trop loin' }, 47.79, 3.62, 'way', 6),
    ];
    const r = versAires(el, TRACE);
    expect(r.map((a) => a.nom)).toEqual(['Aire de Venoy-Chablis', 'Aire de Voutenay', 'Aire de repos']);
    expect(r[0]).toMatchObject({ type: 'services', operateur: 'APRR', toilettes: true });
    expect(r[1]!.type).toBe('repos');
    expect(r[0]!.avancementM).toBeLessThan(r[1]!.avancementM);
  });
  it('replie la surface et son nœud du même nom en UNE aire', () => {
    const el = [
      aire({ highway: 'services', name: 'Aire de Maison-Dieu' }, 47.7994, 3.6, 'way', 1),
      { type: 'node', id: 2, lat: 47.7995, lon: 3.601, tags: { highway: 'services', name: 'Aire de Maison-Dieu' } },
    ];
    expect(versAires(el, TRACE)).toHaveLength(1);
  });
  it('lit le centre d’une géométrie ou d’une emprise quand il n’y a pas de center', () => {
    expect(centreDe({ geometry: [{ lat: 1, lon: 1 }, { lat: 3, lon: 3 }] })).toEqual({ lon: 2, lat: 2 });
    expect(centreDe({ bounds: { minlat: 0, maxlat: 2, minlon: 4, maxlon: 6 } })).toEqual({ lon: 5, lat: 1 });
    expect(centreDe({})).toBeNull();
  });
  it('situerAvecCote : sud = droite pour un tracé vers l’est', () => {
    expect(situerAvecCote({ lon: 3.6, lat: 47.799 }, TRACE).cote).toBe('droite');
    expect(situerAvecCote({ lon: 3.6, lat: 47.801 }, TRACE).cote).toBe('gauche');
  });
});

describe('les commodités', () => {
  const A: Aire = { id: 'way/1', nom: 'Aire de Venoy-Chablis', type: 'services', operateur: 'APRR', lon: 3.6, lat: 47.7994, avancementM: 8000, toilettes: null };
  it('la requête ne part que s’il y a des aires, et cherche autour de chacune', () => {
    expect(requeteCommodites([])).toBeNull();
    const q = requeteCommodites([A])!;
    expect(q).toContain('around:150,47.79940,3.60000');
    expect(q).toContain('charging_station');
    expect(q).toContain('["shop"]');
    expect(fragmentAires('47.8,3.5')).toContain('highway"~"^(services|rest_area)$');
  });
  it('rattache le semis de nœuds à l’aire, réseaux de recharge compris — tous', () => {
    const el = [
      { type: 'node', id: 10, lat: 47.7995, lon: 3.6005, tags: { amenity: 'fuel', brand: 'TotalEnergies' } },
      { type: 'node', id: 11, lat: 47.7995, lon: 3.6006, tags: { amenity: 'charging_station', network: 'Corri-dor', operator: 'Sodetrel' } },
      { type: 'node', id: 12, lat: 47.7996, lon: 3.6007, tags: { amenity: 'charging_station', operator: 'Last Mile Solutions' } },
      { type: 'node', id: 13, lat: 47.7996, lon: 3.6008, tags: { amenity: 'cafe', brand: 'Columbus Café & Co' } },
      { type: 'node', id: 14, lat: 47.7996, lon: 3.6009, tags: { shop: 'convenience', brand: 'Carrefour Express' } },
      { type: 'node', id: 15, lat: 47.7996, lon: 3.6010, tags: { leisure: 'playground' } },
      { type: 'node', id: 16, lat: 47.7996, lon: 3.6011, tags: { amenity: 'toilets' } },
      { type: 'node', id: 17, lat: 47.7996, lon: 3.6012, tags: { amenity: 'fast_food', name: 'Go Fresh' } },
      // Trop loin (l'autre chaussée, 800 m) : n'appartient à personne.
      { type: 'node', id: 18, lat: 47.8066, lon: 3.6, tags: { amenity: 'fuel', brand: 'Esso' } },
    ];
    const c = versCommodites(el, [A]).get('way/1')!;
    expect(c.carburant).toEqual(['TotalEnergies']);
    expect(c.recharge).toEqual(['Corri-dor', 'Last Mile Solutions']);
    expect(c.cafe).toBe(true);
    expect(c.boutique).toBe(true);
    expect(c.jeux).toBe(true);
    expect(c.toilettes).toBe(true);
    expect(c.restauration).toEqual(['Go Fresh']);
    const pictos = pictosAire(A, c).map((p) => p.cle);
    expect(pictos).toEqual(['carburant', 'recharge', 'restauration', 'cafe', 'boutique', 'toilettes', 'jeux']);
  });
  it('l’index IRVE ajoute ses réseaux, sans doublon', () => {
    const stations = [
      { lon: 3.6008, lat: 47.7996, reseau: 'Corri-dor', operateur: 'Sodetrel' },
      { lon: 3.6009, lat: 47.7997, reseau: null, operateur: 'Ionity' },
      { lon: 3.7, lat: 47.7997, reseau: 'Lidl', operateur: null },
    ];
    expect(reseauxIrve(A, stations)).toEqual(['Corri-dor', 'Ionity']);
  });
});

describe('devant, en distance et en temps', () => {
  const aires: Aire[] = [1000, 9000, 30000].map((m, i) => ({
    id: `w/${i}`, nom: `A${i}`, type: 'repos', operateur: '', lon: 0, lat: 0, avancementM: m, toilettes: null,
  }));
  it('ne garde que les aires encore devant, une fois la marge de dépassement passée', () => {
    expect(airesDevant(aires, 0).map((a) => a.nom)).toEqual(['A0', 'A1', 'A2']);
    expect(airesDevant(aires, 800).map((a) => a.nom)).toEqual(['A1', 'A2']);
    expect(airesDevant(aires, 8800).map((a) => a.nom)).toEqual(['A2']);
  });
  it('le temps suit la vitesse courante, et la moyenne du trajet à l’arrêt', () => {
    expect(Math.round(tempsJusquA(3600, 36, 25))).toBe(100);
    expect(Math.round(tempsJusquA(3600, 0, 25))).toBe(144);
    expect(Math.round(tempsJusquA(3600, null, 2))).toBe(450);
  });
  it('écrit les distances et durées comme sur un panneau', () => {
    expect(distanceCourte(12_400)).toBe('12 km');
    expect(distanceCourte(2_340)).toBe('2,3 km');
    expect(distanceCourte(830)).toBe('850 m');
    expect(dureeCourte(90)).toBe('2 min');
    expect(dureeCourte(3900)).toBe('1 h 05');
    expect(dureeCourte(20)).toBe('moins d’une minute');
  });
});
