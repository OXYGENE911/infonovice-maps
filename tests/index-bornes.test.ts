import { describe, it, expect } from 'vitest';
import {
  urlIndexNational, versStations, versStationsGardees, acces,
  reseauxNationaux, filtrerStations, stationsDans, perime, cleReseau,
  SEUIL_RAPIDE, PEREMPTION_MS, type StationRapide,
} from '../src/lib/index-bornes';

/** Une ligne d'export telle que le portail la rend (forme mesurée le 26/08). */
const ligne = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  id_station_itinerance: 'FRXXXP001',
  nom_station: 'Aire de Beaune',
  nom_enseigne: 'Ionity',
  condition_acces: 'Accès libre',
  prise_type_combo_ccs: '1',
  prise_type_chademo: '0',
  prise_type_2: '0',
  p: 350,
  pdc: 6,
  lon: 4.85,
  lat: 47.02,
  ...extra,
});

describe('urlIndexNational', () => {
  it('demande l’agrégat par station, pas les points de charge', () => {
    const u = new URL(urlIndexNational());
    expect(u.pathname).toContain('/exports/json');
    expect(u.searchParams.get('group_by')).toContain('id_station_itinerance');
    expect(u.searchParams.get('where')).toBe(`puissance_nominale>=${SEUIL_RAPIDE}`);
  });

  /* LE PIÈGE MESURÉ : `longitude` est typé TEXTE côté portail et toute
     agrégation dessus est refusée. Ce test verrouille le champ qui marche. */
  it('agrège sur les coordonnées CONSOLIDÉES, seules numériques', () => {
    const select = new URL(urlIndexNational()).searchParams.get('select') ?? '';
    expect(select).toContain('max(consolidated_longitude)');
    expect(select).toContain('max(consolidated_latitude)');
    expect(select).not.toMatch(/max\(longitude\)/);
  });

  it('accepte un autre seuil', () => {
    expect(new URL(urlIndexNational(150)).searchParams.get('where'))
      .toBe('puissance_nominale>=150');
  });
});

describe('acces', () => {
  it('lit les deux valeurs réelles du jeu', () => {
    expect(acces('Accès libre')).toBe(true);
    expect(acces('Accès réservé')).toBe(false);
  });

  it('tolère l’absence d’accents, que le producteur ne garantit pas', () => {
    expect(acces('Acces libre')).toBe(true);
    expect(acces('acces reserve')).toBe(false);
  });

  /* ON NE DEVINE PAS UN DROIT D'ACCÈS. Une valeur inattendue rend `null`, et
     l'interface dira « non déclaré » plutôt que d'inventer un « ouvert ». */
  it('rend null sur tout le reste, sans replier sur « ouvert »', () => {
    expect(acces('Inconnu')).toBeNull();
    expect(acces(null)).toBeNull();
    expect(acces(42)).toBeNull();
    expect(acces('')).toBeNull();
  });
});

describe('versStations', () => {
  it('décode une ligne complète', () => {
    const [s] = versStations([ligne()]);
    expect(s).toMatchObject({
      lon: 4.85, lat: 47.02, nom: 'Aire de Beaune', reseau: 'Ionity',
      puissance: 350, pdc: 6, ouvert: true, prises: ['combo_ccs'],
      id: 'FRXXXP001',
    });
  });

  /* LE CŒUR DU MODULE : le portail rend une ligne par combinaison de prises.
     Sans fusion, la carte poserait trois punaises au même endroit et le filtre
     « CHAdeMO » écarterait une station qui en porte pourtant une. */
  it('fond les lignes d’une même station et UNIT leurs prises', () => {
    const stations = versStations([
      ligne({ prise_type_combo_ccs: '1', prise_type_chademo: '0', p: 350 }),
      ligne({ prise_type_combo_ccs: '0', prise_type_chademo: '1', p: 50 }),
      ligne({ prise_type_combo_ccs: '0', prise_type_2: '1', p: 22 }),
    ]);
    expect(stations).toHaveLength(1);
    expect(stations[0]?.prises.sort()).toEqual(['chademo', 'combo_ccs', 'type_2']);
    // La puissance retenue est la MEILLEURE de la station, pas la dernière lue.
    expect(stations[0]?.puissance).toBe(350);
  });

  it('ne fond PAS deux stations distinctes', () => {
    expect(versStations([
      ligne({ id_station_itinerance: 'FRAAAP001' }),
      ligne({ id_station_itinerance: 'FRBBBP002' }),
    ])).toHaveLength(2);
  });

  /* SANS IDENTIFIANT, LA CLÉ EST LA POSITION. Les fondre toutes sous une clé
     vide n'en laisserait qu'UNE SEULE pour toute la France. */
  it('sépare par les coordonnées quand l’identifiant manque', () => {
    const stations = versStations([
      ligne({ id_station_itinerance: null, lon: 1.1, lat: 43.6 }),
      ligne({ id_station_itinerance: null, lon: 2.2, lat: 48.8 }),
    ]);
    expect(stations).toHaveLength(2);
    expect(stations.every((s) => s.id === null)).toBe(true);
  });

  it('garde le plus grand nombre de points, sans additionner les lignes', () => {
    const [s] = versStations([ligne({ pdc: 6 }), ligne({ pdc: 4 })]);
    expect(s?.pdc).toBe(6);
  });

  it('écarte les lignes sans position exploitable', () => {
    expect(versStations([
      ligne({ lon: null }),
      ligne({ id_station_itinerance: 'B', lat: 'Nord' }),
      ligne({ id_station_itinerance: 'C', lon: 400 }),
    ])).toHaveLength(0);
  });

  it('écarte les lignes sans puissance : l’index est celui des bornes rapides', () => {
    expect(versStations([ligne({ p: 0 }), ligne({ id: 'B', p: null })])).toHaveLength(0);
  });

  it('nomme les stations anonymes plutôt que de rendre un titre vide', () => {
    expect(versStations([ligne({ nom_station: '   ' })])[0]?.nom)
      .toBe('Station de recharge');
  });

  it('supporte n’importe quelle saleté sans lever', () => {
    expect(versStations(null)).toEqual([]);
    expect(versStations({ results: [] })).toEqual([]);
    expect(versStations([null, 'texte', 42, []])).toEqual([]);
  });
});

describe('versStationsGardees', () => {
  const gardee: StationRapide = {
    lon: 4.85, lat: 47.02, nom: 'Aire de Beaune', reseau: 'Ionity',
    puissance: 350, pdc: 6, ouvert: true, prises: ['combo_ccs'], id: 'FRXXXP001',
  };

  /* LE DÉFAUT QUE CE TEST VERROUILLE : la forme du cache n'est PAS celle du
     portail. Relire le cache avec `versStations` rendait un tableau vide —
     donc un index jugé absent, donc sept cents kilo-octets retéléchargés à
     chaque ouverture, en silence. */
  it('relit ce que le cache a écrit', () => {
    expect(versStationsGardees([gardee])).toEqual([gardee]);
  });

  it('n’est PAS interchangeable avec le lecteur du portail', () => {
    expect(versStations([gardee as unknown as Record<string, unknown>])).toEqual([]);
    expect(versStationsGardees([ligne()])).toEqual([]);
  });

  it('écarte les prises inventées, un cache pouvant être trafiqué', () => {
    const [s] = versStationsGardees([{ ...gardee, prises: ['combo_ccs', 'plasma'] }]);
    expect(s?.prises).toEqual(['combo_ccs']);
  });

  it('ne prend « ouvert » que s’il est booléen', () => {
    expect(versStationsGardees([{ ...gardee, ouvert: 'oui' }])[0]?.ouvert).toBeNull();
    expect(versStationsGardees([{ ...gardee, ouvert: false }])[0]?.ouvert).toBe(false);
  });

  it('supporte n’importe quelle saleté sans lever', () => {
    expect(versStationsGardees(undefined)).toEqual([]);
    expect(versStationsGardees([null, 7])).toEqual([]);
  });
});

const st = (p: Partial<StationRapide>): StationRapide => ({
  lon: 2, lat: 46, nom: 'S', reseau: 'Ionity', puissance: 150, pdc: 4,
  ouvert: true, prises: ['combo_ccs'], id: null, ...p,
});

describe('reseauxNationaux', () => {
  it('compte les stations par enseigne, la plus fournie d’abord', () => {
    expect(reseauxNationaux([
      st({ reseau: 'Ionity' }), st({ reseau: 'Tesla' }), st({ reseau: 'Tesla' }),
    ])).toEqual([
      { nom: 'Tesla', nombre: 2, variantes: ['Tesla'] },
      { nom: 'Ionity', nombre: 1, variantes: ['Ionity'] },
    ]);
  });

  it('départage les ex æquo par ordre alphabétique, pour une liste stable', () => {
    expect(reseauxNationaux([st({ reseau: 'Zunder' }), st({ reseau: 'Allego' })])
      .map((r) => r.nom)).toEqual(['Allego', 'Zunder']);
  });

  it('ignore les stations sans enseigne plutôt que d’inventer une case vide', () => {
    expect(reseauxNationaux([st({ reseau: null }), st({ reseau: 'Ionity' })]))
      .toEqual([{ nom: 'Ionity', nombre: 1, variantes: ['Ionity'] }]);
  });

  /* LE DÉFAUT MESURÉ LE 26/08/2026 sur l'index lui-même : 14 133 stations
     portent 2 615 écritures d'enseigne, dont onze groupes désignent le même
     réseau sous deux ou trois orthographes — 2 098 stations, 15 % du réseau
     rapide français. Cocher « LIDL » écartait les 434 « Lidl France ». */
  it('fond les écritures d’un même réseau, et garde la plus répandue', () => {
    const jeu = [
      ...Array.from({ length: 3 }, () => st({ reseau: 'LIDL' })),
      ...Array.from({ length: 5 }, () => st({ reseau: 'Lidl France' })),
    ];
    expect(reseauxNationaux(jeu)).toEqual([
      { nom: 'Lidl France', nombre: 8, variantes: ['Lidl France', 'LIDL'] },
    ]);
  });

  it('fond aussi les accents et la ponctuation', () => {
    const jeu = [
      st({ reseau: 'REVEO' }), st({ reseau: 'REVEO' }),
      st({ reseau: 'Révéo' }), st({ reseau: 'Reveo' }),
    ];
    const [r] = reseauxNationaux(jeu);
    expect(r?.nombre).toBe(4);
    expect(r?.variantes.sort()).toEqual(['REVEO', 'Reveo', 'Révéo']);
  });

  /* ET ELLE NE FOND PAS N'IMPORTE QUOI. Réunir à tort deux réseaux distincts
     est un défaut PIRE que celui qu'on corrige : il fait espérer une borne
     inaccessible. La normalisation reste donc timide. */
  it('ne fond PAS deux réseaux réellement différents', () => {
    expect(reseauxNationaux([
      st({ reseau: 'Ionity' }), st({ reseau: 'Ionity Plus' }),
    ])).toHaveLength(2);
    expect(reseauxNationaux([
      st({ reseau: 'Allego' }), st({ reseau: 'Alego' }),
    ])).toHaveLength(2);
  });
});

describe('filtrerStations', () => {
  const jeu = [
    st({ nom: 'lente', puissance: 50, reseau: 'A', prises: ['type_2'] }),
    st({ nom: 'rapide', puissance: 150, reseau: 'B', prises: ['combo_ccs'] }),
    st({ nom: 'tres', puissance: 350, reseau: 'B', prises: ['combo_ccs', 'chademo'] }),
  ];

  it('sans filtre, rend tout', () => {
    expect(filtrerStations(jeu)).toHaveLength(3);
  });

  it('filtre par puissance minimale, borne incluse', () => {
    expect(filtrerStations(jeu, { puissanceMin: 150 }).map((s) => s.nom))
      .toEqual(['rapide', 'tres']);
  });

  /* OU, PAS ET : un véhicule accepte l'une OU l'autre de ses prises. Exiger
     qu'une même station les porte toutes ne rendrait presque rien. */
  it('accepte une station qui porte AU MOINS une des prises demandées', () => {
    expect(filtrerStations(jeu, { prises: ['chademo', 'type_2'] }).map((s) => s.nom))
      .toEqual(['lente', 'tres']);
  });

  it('filtre par réseau', () => {
    expect(filtrerStations(jeu, { reseaux: ['B'] })).toHaveLength(2);
  });

  /* LA COMPARAISON SE FAIT SUR LA CLÉ : cocher « LIDL » doit retenir aussi
     les stations écrites « Lidl France » — 434 d'entre elles, mesurées. */
  it('retient toutes les écritures d’un même réseau', () => {
    const lidl = [
      st({ nom: 'a', reseau: 'LIDL' }),
      st({ nom: 'b', reseau: 'Lidl France' }),
      st({ nom: 'c', reseau: 'Ionity' }),
    ];
    expect(filtrerStations(lidl, { reseaux: ['LIDL'] }).map((s) => s.nom))
      .toEqual(['a', 'b']);
    // Et dans l'autre sens : la variante cochée n'a pas d'importance.
    expect(filtrerStations(lidl, { reseaux: ['Lidl France'] })).toHaveLength(2);
  });

  it('cumule les filtres', () => {
    expect(filtrerStations(jeu, { reseaux: ['B'], puissanceMin: 300 }).map((s) => s.nom))
      .toEqual(['tres']);
  });

  it('un filtre réseau écarte les stations sans enseigne', () => {
    expect(filtrerStations([st({ reseau: null })], { reseaux: ['A'] })).toEqual([]);
  });
});

describe('stationsDans', () => {
  it('ne garde que ce qui est dans l’emprise, bornes comprises', () => {
    const jeu = [st({ lon: 0, lat: 45 }), st({ lon: 10, lat: 45 }), st({ lon: 5, lat: 45 })];
    expect(stationsDans(jeu, { ouest: 0, sud: 44, est: 5, nord: 46 })).toHaveLength(2);
  });
});

describe('perime', () => {
  const t = 1_800_000_000_000;

  it('un index frais ne se recharge pas', () => {
    expect(perime(t - 1000, t)).toBe(false);
  });

  it('un index d’un mois et un jour se recharge', () => {
    expect(perime(t - PEREMPTION_MS - 1, t)).toBe(true);
  });

  it('un horodatage absent ou absurde vaut périmé', () => {
    expect(perime(0, t)).toBe(true);
    expect(perime(NaN, t)).toBe(true);
    expect(perime(-5, t)).toBe(true);
  });

  /* UNE HORLOGE EN AVANCE NE DOIT PAS FIGER L'INDEX POUR L'ÉTERNITÉ : un
     horodatage très futur passerait autrement tous les contrôles à vie. */
  it('un horodatage venu du futur vaut périmé', () => {
    expect(perime(t + PEREMPTION_MS + 1, t)).toBe(true);
  });
});


describe('cleReseau', () => {
  it('efface la casse, les accents, la ponctuation et le suffixe France', () => {
    expect(cleReseau('LIDL')).toBe(cleReseau('Lidl France'));
    expect(cleReseau('REVEO')).toBe(cleReseau('Révéo'));
    expect(cleReseau('bp pulse')).toBe(cleReseau('bp Pulse'));
    expect(cleReseau('SOWATT SOLUTIONS')).toBe(cleReseau('Sowatt Solutions'));
    expect(cleReseau('Atlante')).toBe(cleReseau('Atlante France'));
  });

  /* LA TIMIDITÉ EST LE POINT. Fondre « X » et « X Mobility » présumerait qu'il
     s'agit de la même société, ce que rien ne prouve. */
  it('ne rapproche PAS ce qui diffère vraiment', () => {
    expect(cleReseau('Ionity')).not.toBe(cleReseau('Ionity Plus'));
    expect(cleReseau('Allego')).not.toBe(cleReseau('Alego'));
    expect(cleReseau('Engie')).not.toBe(cleReseau('Engie Vianeo'));
  });

  it('ne lève pas sur une enseigne réduite à rien par la normalisation', () => {
    expect(cleReseau('France')).toBe('');
    expect(cleReseau('---')).toBe('');
  });
});
