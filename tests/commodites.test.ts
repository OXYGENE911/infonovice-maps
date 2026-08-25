// Commodités des aires — URL et décodage purs, testés à sec sur des fixtures
// AU FORMAT RÉEL d'Overpass (relevé du 25/08/2026, corridor Beaune-Chalon).
//
// CE QUE LA MESURE A MONTRÉ, et qui décide de tout ce module : l'enseigne
// n'est PAS sur l'aire (1 aire sur 698 porte `brand`) mais sur les objets
// À L'INTÉRIEUR — 74 % d'entre eux portent une identité.
import { describe, expect, test } from 'vitest';
import { urlCommodites, versCommodites, TYPES_COMMODITE } from '../src/lib/commodites';

describe('l’URL Overpass', () => {
  test('interroge autour du point, dans le rayon demandé', () => {
    const u = decodeURIComponent(urlCommodites(4.84, 47.02, 400));
    // Le miroir FRANÇAIS d'OpenStreetMap France, pas l'instance allemande.
    expect(u).toContain('overpass.openstreetmap.fr');
    expect(u).toContain('around:400,47.02,4.84');
  });

  test('demande le format JSON et borne le temps de calcul', () => {
    const u = decodeURIComponent(urlCommodites(4.84, 47.02));
    expect(u).toContain('[out:json]');
    expect(u, 'une requête sans plafond peut occuper le serveur').toMatch(/timeout:\d+/);
  });

  test('ne demande QUE les types utiles — pas tout ce qui traîne', () => {
    const u = decodeURIComponent(urlCommodites(4.84, 47.02));
    for (const t of ['fuel', 'toilets', 'restaurant', 'cafe', 'fast_food']) {
      expect(u).toContain(t);
    }
    expect(u, 'une requête trop large martèle un service bénévole').not.toContain('["amenity"]');
  });

  test('un rayon absurde est ramené dans des bornes raisonnables', () => {
    expect(decodeURIComponent(urlCommodites(4.84, 47.02, 99_999))).toContain('around:2000');
    expect(decodeURIComponent(urlCommodites(4.84, 47.02, -5))).toContain('around:100');
  });
});

/* Fixture AU FORMAT RÉEL : la réponse d'Overpass mêle nœuds et chemins, et
   les chemins portent leur position dans `center`. */
const REEL = {
  version: 0.6,
  elements: [
    { type: 'node', id: 1, lat: 47.021, lon: 4.841,
      tags: { amenity: 'fuel', brand: 'TotalEnergies' } },
    { type: 'node', id: 2, lat: 47.022, lon: 4.842, tags: { amenity: 'toilets' } },
    { type: 'way', id: 3, center: { lat: 47.023, lon: 4.843 },
      tags: { amenity: 'restaurant', name: 'L’Arche' } },
    { type: 'node', id: 4, lat: 47.024, lon: 4.844,
      tags: { amenity: 'cafe', operator: 'Paul' } },
    { type: 'node', id: 5, lat: 47.025, lon: 4.845, tags: { amenity: 'fast_food' } },
    // Bruit : un type dont on ne veut pas, et un objet sans position.
    { type: 'node', id: 6, lat: 47.026, lon: 4.846, tags: { amenity: 'bench' } },
    { type: 'node', id: 7, tags: { amenity: 'fuel' } },
  ],
};

describe('le décodage', () => {
  test('ne garde que les types utiles', () => {
    const c = versCommodites(REEL);
    expect(c.map((x) => x.type).sort())
      .toEqual(['cafe', 'carburant', 'restauration', 'restauration', 'wc']);
  });

  test('un chemin est situé par son `center`, pas ignoré', () => {
    const c = versCommodites(REEL);
    const resto = c.find((x) => x.nom === 'L’Arche');
    expect(resto, 'les chemins portent leur position dans center').toBeTruthy();
    expect(resto!.lat).toBeCloseTo(47.023, 3);
  });

  test('L’IDENTITÉ PRIME DANS L’ORDRE marque → exploitant → nom', () => {
    const c = versCommodites(REEL);
    expect(c.find((x) => x.type === 'carburant')!.nom).toBe('TotalEnergies');
    expect(c.find((x) => x.type === 'cafe')!.nom).toBe('Paul');
  });

  test('un objet sans identité rend null, pas une invention', () => {
    // 26 % des commodités n'en portent aucune : l'interface dira le TYPE.
    expect(versCommodites(REEL).find((x) => x.type === 'wc')!.nom).toBeNull();
  });

  test('un objet sans position est écarté plutôt que posé à l’équateur', () => {
    expect(versCommodites(REEL).filter((x) => x.type === 'carburant')).toHaveLength(1);
  });

  test('une réponse illisible ne casse rien', () => {
    expect(versCommodites(null)).toEqual([]);
    expect(versCommodites({ elements: 'non' })).toEqual([]);
    expect(versCommodites({})).toEqual([]);
  });
});

describe('le catalogue des types', () => {
  test('cinq types, chacun avec un libellé lisible', () => {
    expect(TYPES_COMMODITE.map((t) => t.cle).sort())
      .toEqual(['cafe', 'carburant', 'restauration', 'wc'].sort());
    for (const t of TYPES_COMMODITE) expect(t.libelle.length).toBeGreaterThan(2);
  });
});
