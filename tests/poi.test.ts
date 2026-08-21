// Points d'intérêt — URL et transformations pures, testées à sec sur des
// fixtures AU FORMAT RÉEL des trois services (vérifiés par appels réels le
// 21/08/2026, docs/apis.md).
import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  urlCarburants, urlBornes, urlParkings,
  versCarburants, versBornes, versParkings,
  chargerCarburants, chargerBornes, vueAChange, ErreurPoi, type Bbox,
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

describe('versBornes — réponse difforme', () => {
  test('refuse en français, comme les autres transformations', () => {
    expect(() => versBornes({})).toThrow(ErreurPoi);
    expect(() => versBornes({ results: 'pas-une-liste' })).toThrow('bornes');
  });
});

describe('vueAChange — le seuil qui protège les quotas', () => {
  const CHARGEE: Bbox = { ouest: 2.0, sud: 48.0, est: 2.4, nord: 48.3 };

  test('un glissement minime ou un fixe GPS ne rechargent pas', () => {
    expect(vueAChange(CHARGEE, CHARGEE)).toBe(false);
    expect(vueAChange(CHARGEE, { ouest: 2.01, sud: 48.01, est: 2.41, nord: 48.31 })).toBe(false);
  });

  test('un vrai déplacement ou un changement de zoom rechargent', () => {
    // Décalage de plus de 20 % de la largeur chargée.
    expect(vueAChange(CHARGEE, { ouest: 2.1, sud: 48.0, est: 2.5, nord: 48.3 })).toBe(true);
    // Dézoom : la vue couvre bien plus que ce qui a été chargé.
    expect(vueAChange(CHARGEE, { ouest: 1.7, sud: 47.8, est: 2.7, nord: 48.5 })).toBe(true);
    // Zoom serré : on veut le détail de la nouvelle vue.
    expect(vueAChange(CHARGEE, { ouest: 2.15, sud: 48.1, est: 2.25, nord: 48.17 })).toBe(true);
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

  test('une panne réseau se rejoue UNE fois, un double échec parle français', async () => {
    const f = vi.fn()
      .mockRejectedValueOnce(new TypeError('failed to fetch'))
      .mockResolvedValueOnce(new Response(OK, { status: 200 }));
    vi.stubGlobal('fetch', f);
    const c = await chargerCarburants(B);
    expect(c.elements).toHaveLength(1);
    expect(f).toHaveBeenCalledTimes(2);
    // Double panne : le message final est bien le français promis.
    const g = vi.fn(async () => { throw new TypeError('failed to fetch'); });
    vi.stubGlobal('fetch', g);
    await expect(chargerCarburants(B)).rejects.toThrow('momentanément indisponibles');
    expect(g).toHaveBeenCalledTimes(2);
  });

  test('un 5xx se rejoue, un 4xx JAMAIS, et le 429 dit de patienter', async () => {
    // 500 puis 200 : la reprise sert à quelque chose.
    const f = vi.fn()
      .mockResolvedValueOnce(new Response('', { status: 500 }))
      .mockResolvedValueOnce(new Response(OK, { status: 200 }));
    vi.stubGlobal('fetch', f);
    expect((await chargerCarburants(B)).elements).toHaveLength(1);
    expect(f).toHaveBeenCalledTimes(2);
    // 400 : déterministe — UNE requête, pas de « réessayez » mensonger.
    const g = vi.fn(async () => new Response('', { status: 400 }));
    vi.stubGlobal('fetch', g);
    await expect(chargerCarburants(B)).rejects.toThrow('réponse 400');
    expect(g).toHaveBeenCalledTimes(1);
    // 429 : le service demande de ralentir — on ne le double pas.
    const h = vi.fn(async () => new Response('', { status: 429 }));
    vi.stubGlobal('fetch', h);
    await expect(chargerBornes(B)).rejects.toThrow('limite le débit');
    expect(h).toHaveBeenCalledTimes(1);
  });

  test('le signal d’annulation est RÉELLEMENT câblé jusqu’à fetch', async () => {
    // Le contrôleur est aborté AVANT l'appel : si le signal transmis à fetch
    // en dérive (AbortSignal.any), il naît déjà aborté — c'est le câblage
    // qu'on prouve, pas la garde post-hoc (revue du 22/08).
    const controleur = new AbortController();
    controleur.abort();
    let signalRecu: AbortSignal | undefined;
    const f = vi.fn((_u: string, o: { signal?: AbortSignal }) => {
      signalRecu = o.signal;
      return Promise.reject(new DOMException('annulé', 'AbortError'));
    });
    vi.stubGlobal('fetch', f);
    await expect(chargerCarburants(B, controleur.signal)).rejects.toThrow();
    expect(f).toHaveBeenCalledTimes(1);
    expect(signalRecu?.aborted).toBe(true);
  });

  test('une réponse 200 difforme ne consomme pas de seconde requête', async () => {
    const f = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', f);
    await expect(chargerCarburants(B)).rejects.toThrow('exploitables');
    expect(f).toHaveBeenCalledTimes(1);
  });
});
