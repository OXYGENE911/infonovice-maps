// Le répertoire des communes : le tri de ce que rend le service, et sa
// résilience. Ce module est le socle de l'adressage en mots — une commune mal
// choisie déplace l'adresse de plusieurs kilomètres sans rien signaler.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { communeDuPoint, communesParNom, ErreurCommune } from '../src/lib/commune';

afterEach(() => vi.restoreAllMocks());

/** Fabrique une réponse `fetch` déjà décodée. */
function repond(corps: unknown, statut = 200): Response {
  return {
    ok: statut >= 200 && statut < 300,
    status: statut,
    json: async () => corps,
  } as Response;
}

const DIJON = { nom: 'Dijon', code: '21231', centre: { type: 'Point', coordinates: [5.0322, 47.3319] } };

describe('communeDuPoint', () => {
  it('rend la commune qui contient le point', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(repond([DIJON]));
    expect(await communeDuPoint({ lon: 5.04, lat: 47.32 })).toEqual({
      nom: 'Dijon', code: '21231', centre: { lon: 5.0322, lat: 47.3319 },
    });
  });

  it('rend null en pleine mer — une liste vide n’est pas une erreur', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(repond([]));
    expect(await communeDuPoint({ lon: -5, lat: 47 })).toBeNull();
  });

  it('rend null plutôt qu’une commune à moitié : une entrée difforme est écartée', async () => {
    for (const brut of [
      {},                                                   // rien
      { nom: 'X', code: '21231' },                          // sans centre
      { nom: 'X', code: '21231', centre: { coordinates: [] } },
      { nom: 'X', code: 'ABCDE', centre: { coordinates: [1, 2] } },   // code non INSEE
      { nom: 'X', code: '21231', centre: { coordinates: ['a', 2] } }, // coordonnée textuelle
      { nom: 'X', code: '21231', centre: { coordinates: [NaN, 2] } }, // coordonnée non finie
    ]) {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(repond([brut]));
      expect(await communeDuPoint({ lon: 5, lat: 47 }), JSON.stringify(brut)).toBeNull();
    }
  });

  it('accepte les codes corses 2A/2B — ils ne sont pas numériques', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(repond([
      { nom: 'Ajaccio', code: '2A004', centre: { coordinates: [8.7369, 41.9264] } },
    ]));
    const c = await communeDuPoint({ lon: 8.73, lat: 41.92 });
    expect(c?.code).toBe('2A004');
  });
});

describe('communesParNom', () => {
  /* LE PIÈGE DU SERVICE : `nom=` est une recherche APPROCHÉE. Demander
     « Dijon » rend aussi « Fontaine-lès-Dijon », dont le centre est à 2 km.
     Décoder une adresse sur la mauvaise commune la déplace d'autant, en
     silence. Ce test est la sentinelle de ce filtre. */
  it('ÉCARTE les communes dont le nom n’est pas exactement celui demandé', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(repond([
      DIJON,
      { nom: 'Fontaine-lès-Dijon', code: '21278', centre: { coordinates: [5.025, 47.3477] } },
      { nom: 'Dijon-le-Vieux', code: '21999', centre: { coordinates: [5.1, 47.4] } },
    ]));
    const r = await communesParNom('Dijon', '21');
    expect(r.map((c) => c.nom)).toEqual(['Dijon']);
  });

  it('compare sans buter sur les accents ni la casse', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(repond([
      { nom: 'Bécon-les-Granits', code: '49026', centre: { coordinates: [-0.79, 47.51] } },
    ]));
    expect(await communesParNom('becon-les-granits', '49')).toHaveLength(1);
    expect(await communesParNom('BÉCON-LES-GRANITS', '49')).toHaveLength(1);
  });

  it('écarte l’homonyme d’un AUTRE département', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(repond([
      { nom: 'Saint-Denis', code: '93066', centre: { coordinates: [2.3568, 48.9362] } },
      { nom: 'Saint-Denis', code: '97411', centre: { coordinates: [55.4504, -20.8823] } },
    ]));
    expect((await communesParNom('Saint-Denis', '93')).map((c) => c.code)).toEqual(['93066']);
    expect((await communesParNom('Saint-Denis', '974')).map((c) => c.code)).toEqual(['97411']);
  });

  it('rend TOUS les homonymes du même département plutôt que d’en élire un', async () => {
    // Six couples nom/département restent ambigus outre-mer : on les montre.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(repond([
      { nom: 'Sainte-Rose', code: '97129', centre: { coordinates: [-61.7, 16.33] } },
      { nom: 'Sainte-Rose', code: '97118', centre: { coordinates: [-61.6, 16.4] } },
    ]));
    expect(await communesParNom('Sainte-Rose', '971')).toHaveLength(2);
  });

  it('rend une liste vide quand la commune n’existe pas', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(repond([]));
    expect(await communesParNom('Zorglub', '99')).toEqual([]);
  });

  it('une réponse difforme rend une liste vide, jamais une exception', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(repond({ erreur: 'zut' }));
    expect(await communesParNom('Dijon', '21')).toEqual([]);
  });
});

describe('résilience', () => {
  it('REJOUE UNE FOIS sur panne passagère, puis parle français', async () => {
    const espion = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('réseau'));
    await expect(communesParNom('Dijon', '21')).rejects.toThrow(/momentanément indisponible/);
    expect(espion).toHaveBeenCalledTimes(2);
  });

  it('REJOUE sur 5xx — la panne est du côté du service', async () => {
    const espion = vi.spyOn(globalThis, 'fetch').mockResolvedValue(repond(null, 503));
    await expect(communeDuPoint({ lon: 5, lat: 47 })).rejects.toThrow(ErreurCommune);
    expect(espion).toHaveBeenCalledTimes(2);
  });

  it('NE REJOUE PAS sur 4xx : un refus est une réponse, pas une panne', async () => {
    const espion = vi.spyOn(globalThis, 'fetch').mockResolvedValue(repond(null, 400));
    await expect(communeDuPoint({ lon: 5, lat: 47 })).rejects.toThrow(/réponse 400/);
    expect(espion).toHaveBeenCalledTimes(1);
  });

  it('une frappe annulée ne se rejoue pas : l’annulation remonte telle quelle', async () => {
    const controle = new AbortController();
    controle.abort();
    const espion = vi.spyOn(globalThis, 'fetch')
      .mockRejectedValue(new DOMException('annulé', 'AbortError'));
    await expect(communesParNom('Dijon', '21', controle.signal)).rejects.toThrow(DOMException);
    expect(espion).toHaveBeenCalledTimes(1);
  });
});
