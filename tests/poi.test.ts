// Points d'intérêt — URL et transformations pures, testées à sec sur des
// fixtures AU FORMAT RÉEL des trois services (vérifiés par appels réels le
// 21/08/2026, docs/apis.md).
import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  urlCarburants, urlBornes, urlParkings,
  versCarburants, versBornes, versParkings,
  chargerCarburants, chargerBornes, vueAChange, ErreurPoi, type Bbox,
  PRISES, type FiltresBornes,
  urlFacettesReseaux, versReseaux,
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


/* FILTRES DES BORNES (PR #22) — ils s'appliquent CÔTÉ SERVICE, jamais après
   coup. Le portail plafonne à 100 enregistrements : filtrer localement
   trierait un ensemble DÉJÀ TRONQUÉ, et l'on afficherait trois bornes CCS là
   où la zone en compte cinquante. Ce n'est pas une optimisation, c'est une
   question de justesse — et c'est la raison d'être de ces tests.

   Format vérifié par appel réel le 25/08/2026 : `puissance_nominale` est un
   NOMBRE, les `prise_type_*` sont des CHAÎNES « 0 »/« 1 ». */
describe('les filtres de bornes voyagent dans l’URL', () => {
  test('sans filtre, l’URL reste celle d’avant — aucune régression', () => {
    const u = decodeURIComponent(urlBornes(B));
    expect(u).toContain('in_bbox(point_geo,48.8,2.25,48.9,2.42)');
    expect(u, 'aucune clause parasite quand rien n’est filtré').not.toContain(' AND ');
  });

  test('la puissance minimale part en comparaison NUMÉRIQUE', () => {
    const u = decodeURIComponent(urlBornes(B, { puissanceMin: 150 }));
    expect(u).toContain('puissance_nominale >= 150');
    expect(u, 'un nombre entre guillemets ne compare pas').not.toContain('"150"');
  });

  test('les prises partent en comparaison de CHAÎNE, et en OU entre elles', () => {
    const filtres: FiltresBornes = { prises: ['combo_ccs', 'chademo'] };
    const u = decodeURIComponent(urlBornes(B, filtres));
    expect(u).toContain('prise_type_combo_ccs = "1"');
    expect(u).toContain('prise_type_chademo = "1"');
    // Un véhicule accepte l'une OU l'autre : exiger les deux ne rendrait rien.
    expect(u).toContain('OR');
  });

  test('les réseaux se filtrent sur l’enseigne, échappés contre l’injection', () => {
    const u = decodeURIComponent(urlBornes(B, { reseaux: ['Ionity', 'e"born'] }));
    expect(u).toContain('nom_enseigne = "Ionity"');
    // Le guillemet du nom est neutralisé : sans cela, la clause se casse en
    // deux et le service renvoie une erreur — ou pire, autre chose.
    expect(u).not.toContain('"e"born"');
  });

  test('plusieurs familles de filtres se combinent en ET', () => {
    const u = decodeURIComponent(urlBornes(B, { puissanceMin: 50, prises: ['type_2'] }));
    expect(u).toContain('puissance_nominale >= 50');
    // LE CHAMP RÉEL EST `prise_type_2`, pas `prise_type_type_2` : la
    // nomenclature du jeu IRVE est irrégulière, et ce test est ce qui l'a
    // révélé — un champ inexistant ne renvoie rien plutôt qu'une erreur.
    expect(u).toContain('prise_type_2 = "1"');
    expect(u.match(/ AND /g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  test('un filtre vide ne produit pas de clause vide', () => {
    const u = decodeURIComponent(urlBornes(B, { prises: [], reseaux: [] }));
    expect(u).not.toContain('()');
    expect(u).not.toContain(' AND ');
  });
});

describe('la borne rend son réseau et ses prises', () => {
  const REEL = {
    total_count: 1,
    results: [{
      point_geo: { lon: 5.326985, lat: 45.117174 },
      nom_station: 'SAINT-ROMANS - Carrefour Des 4 Routes',
      puissance_nominale: 22, nbre_pdc: 2, gratuit: '0',
      nom_enseigne: 'eborn', nom_operateur: 'EASYCHARGE',
      prise_type_2: '1', prise_type_combo_ccs: '0',
      prise_type_chademo: '0', prise_type_ef: '1', prise_type_autre: '0',
    }],
  };

  test('l’enseigne prime sur l’opérateur — c’est le nom que l’usager voit sur la borne', () => {
    const { elements } = versBornes(REEL);
    expect(elements[0]!.reseau).toBe('eborn');
  });

  test('les prises présentes sont listées, les absentes écartées', () => {
    const { elements } = versBornes(REEL);
    expect(elements[0]!.prises).toEqual(['type_2', 'ef']);
  });

  test('une borne sans enseigne ni prise ne casse pas — trois états, pas deux', () => {
    const { elements } = versBornes({ total_count: 1, results: [{
      point_geo: { lon: 2, lat: 48 }, nom_station: 'X',
    }] });
    expect(elements[0]!.reseau).toBeNull();
    expect(elements[0]!.prises).toEqual([]);
  });
});

describe('le catalogue des prises', () => {
  test('les quatre standards réels sont couverts, dans un ordre stable', () => {
    expect(PRISES.map((p) => p.cle)).toEqual(['combo_ccs', 'type_2', 'chademo', 'ef']);
    // Le champ réel du Type 2 échappe au motif : il vaut d'être verrouillé.
    expect(PRISES.find((p) => p.cle === 'type_2')?.champ).toBe('prise_type_2');
  });

  test('chaque prise porte un libellé lisible, pas une clé technique', () => {
    for (const p of PRISES) {
      expect(p.libelle.length, `« ${p.cle} » sans libellé`).toBeGreaterThan(2);
      expect(p.libelle).not.toBe(p.cle);
    }
  });
});

/* LES RÉSEAUX PRÉSENTS DANS LA VUE (PR #22bis) — on ne propose pas une liste
   figée de 400 enseignes nationales : on demande au portail lesquelles se
   trouvent DANS L'EMPRISE, avec leur nombre. Une case « Ionity » là où il n'y
   en a aucune est une promesse creuse. */
describe('les facettes de réseaux', () => {
  test('l’URL interroge la facette nom_enseigne, dans l’emprise', () => {
    const u = decodeURIComponent(urlFacettesReseaux(B));
    expect(u).toContain('/facets');
    expect(u).toContain('facet=nom_enseigne');
    expect(u).toContain('in_bbox(point_geo,48.8,2.25,48.9,2.42)');
  });

  /* Fixture AU FORMAT RÉEL, relevée le 26/08/2026 sur Paris intra-muros. */
  const REEL = {
    facets: [{
      name: 'nom_enseigne',
      facets: [
        { name: "Belib'", count: 4286, value: "Belib'" },
        { name: 'Bump', count: 90, value: 'Bump' },
        { name: 'ACCOR Hotels', count: 2, value: 'ACCOR Hotels' },
      ],
    }],
  };

  test('les réseaux sortent du PLUS FOURNI au moins fourni', () => {
    expect(versReseaux(REEL).map((r) => r.nom)).toEqual(["Belib'", 'Bump', 'ACCOR Hotels']);
  });

  test('chaque réseau porte son nombre de bornes', () => {
    expect(versReseaux(REEL)[0]).toEqual({ nom: "Belib'", nombre: 4286 });
  });

  test('une réponse illisible rend une liste vide, pas une exception', () => {
    expect(versReseaux(null)).toEqual([]);
    expect(versReseaux({ facets: 'non' })).toEqual([]);
    expect(versReseaux({ facets: [] })).toEqual([]);
    expect(versReseaux({ facets: [{ name: 'autre', facets: [] }] })).toEqual([]);
  });

  test('une entrée sans nom ou sans compte est écartée', () => {
    const bancal = { facets: [{ name: 'nom_enseigne', facets: [
      { name: 'Bon', count: 5, value: 'Bon' },
      { count: 3, value: null },
      { name: 'Sans compte', value: 'Sans compte' },
      { name: '   ', count: 2, value: '   ' },
    ] }] };
    expect(versReseaux(bancal)).toEqual([{ nom: 'Bon', nombre: 5 }]);
  });
});
