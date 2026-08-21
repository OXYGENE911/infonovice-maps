// Points d'intérêt — URL et transformations pures, testées à sec sur des
// fixtures AU FORMAT RÉEL des trois services (vérifiés par appels réels le
// 21/08/2026, docs/apis.md).
import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  urlCarburants, urlBornes, urlParkings,
  versCarburants, versBornes, versParkings,
  chargerCarburants, ErreurPoi, type Bbox,
} from '../src/lib/poi';

const B: Bbox = { ouest: 2.25, sud: 48.8, est: 2.42, nord: 48.9 };

describe('les URL des trois services', () => {
  test('Opendatasoft : in_bbox en ordre (lat sud, lon ouest, lat nord, lon est), encodé', () => {
    const u = urlCarburants(B);
    expect(u).toContain('data.economie.gouv.fr');
    expect(decodeURIComponent(u)).toContain('in_bbox(geom,48.8,2.25,48.9,2.42)');
    expect(u).toContain('limit=100'); // plafond DUR du portail
    const ub = urlBornes(B);
    expect(ub).toContain('public.opendatasoft.com');
    expect(decodeURIComponent(ub)).toContain('in_bbox(point_geo,48.8,2.25,48.9,2.42)');
  });

  test('WFS Géoplateforme : couche parkings, BBOX EPSG:4326, GeoJSON', () => {
    const u = urlParkings(B);
    expect(u).toContain('data.geopf.fr/wfs');
    expect(u).toContain('parkings_sup500m2');
    expect(decodeURIComponent(u)).toContain('BBOX=48.8,2.25,48.9,2.42,urn:ogc:def:crs:EPSG::4326');
  });
});

describe('versCarburants', () => {
  test('garde les prix finis, écarte les stations muettes et les geom difformes', () => {
    const c = versCarburants({ total_count: 78, results: [
      { geom: { lon: 2.33, lat: 48.9 }, adresse: '1 Avenue X', ville: 'Paris',
        gazole_prix: 2.25, e10_prix: 1.99, sp95_prix: null, sp98_prix: undefined },
      { geom: { lon: 2.34, lat: 48.88 }, adresse: 'Sans prix', ville: 'Paris' },
      { geom: null, adresse: 'Sans geom', ville: 'Paris', gazole_prix: 2.0 },
      { geom: { lon: 200, lat: 95 }, adresse: 'Hors globe', ville: '', gazole_prix: 2.0 },
    ] });
    expect(c.elements).toHaveLength(1);
    expect(c.elements[0]).toEqual({
      lon: 2.33, lat: 48.9, adresse: '1 Avenue X', ville: 'Paris',
      prix: [['Gazole', 2.25], ['E10', 1.99]],
    });
    expect(c.total).toBe(78);
  });

  test('refuse une réponse difforme, en français', () => {
    expect(() => versCarburants({})).toThrow(ErreurPoi);
    expect(() => versCarburants({ results: 'pas-une-liste' })).toThrow('exploitables');
  });
});

describe('versBornes', () => {
  test('lit puissance/pdc en nombres et « gratuit » en trois états', () => {
    const c = versBornes({ total_count: 11950, results: [
      { point_geo: { lon: 2.267, lat: 48.882 }, nom_station: 'ENGIE Vianeo',
        puissance_nominale: 400, nbre_pdc: 12, gratuit: '0' },
      { point_geo: { lon: 2.386, lat: 48.832 }, nom_station: 'Bercy Village',
        puissance_nominale: 7, nbre_pdc: 30, gratuit: null },
      { point_geo: { lon: 2.3, lat: 48.85 }, gratuit: '1' },
    ] });
    expect(c.elements).toHaveLength(3);
    expect(c.elements[0]!.gratuit).toBe(false);
    expect(c.elements[1]!.gratuit).toBeNull();
    expect(c.elements[2]).toMatchObject({ nom: 'Borne de recharge', gratuit: true, puissance: null });
    expect(c.total).toBe(11_950);
  });
});

describe('versParkings', () => {
  test('ne garde que les polygones, rend une FeatureCollection prête à poser', () => {
    const c = versParkings({ type: 'FeatureCollection', numberMatched: 15, features: [
      { type: 'Feature', geometry: { type: 'MultiPolygon', coordinates: [] }, properties: { surfm2: 1327 } },
      { type: 'Feature', geometry: { type: 'Point', coordinates: [2, 48] }, properties: {} },
      { type: 'Feature', geometry: null, properties: {} },
    ] });
    expect(c.collection.features).toHaveLength(1);
    expect(c.total).toBe(15);
  });

  test('refuse autre chose qu’une FeatureCollection', () => {
    expect(() => versParkings({ type: 'Feature' })).toThrow(ErreurPoi);
  });
});

describe('chargerCarburants (fetch simulé)', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  const OK = JSON.stringify({ total_count: 1, results: [
    { geom: { lon: 2.33, lat: 48.9 }, adresse: 'A', ville: 'Paris', gazole_prix: 2.1 },
  ] });

  test('une panne se rejoue UNE fois, puis parle français', async () => {
    const f = vi.fn()
      .mockRejectedValueOnce(new TypeError('failed to fetch'))
      .mockResolvedValueOnce(new Response(OK, { status: 200 }));
    vi.stubGlobal('fetch', f);
    const c = await chargerCarburants(B);
    expect(c.elements).toHaveLength(1);
    expect(f).toHaveBeenCalledTimes(2);
  });

  test('l’annulation volontaire (déplacement de carte) ne se rejoue JAMAIS', async () => {
    const controleur = new AbortController();
    const f = vi.fn(() => {
      controleur.abort();
      return Promise.reject(new DOMException('annulé', 'AbortError'));
    });
    vi.stubGlobal('fetch', f);
    await expect(chargerCarburants(B, controleur.signal)).rejects.toThrow();
    expect(f).toHaveBeenCalledTimes(1);
  });

  test('une réponse 200 difforme ne consomme pas de seconde requête', async () => {
    const f = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', f);
    await expect(chargerCarburants(B)).rejects.toThrow('exploitables');
    expect(f).toHaveBeenCalledTimes(1);
  });
});
