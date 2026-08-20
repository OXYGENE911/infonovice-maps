// Le géocodage BAN : la transformation pure, et la résilience réseau.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { versResultats, chercherAdresses, adresseInverse, ErreurAdresse } from '../src/lib/adresse';

const REPONSE_BAN = {
  features: [{
    geometry: { coordinates: [2.330992, 48.868831] },
    properties: { label: '8 Rue de la Paix 75002 Paris', type: 'housenumber', postcode: '75002', city: 'Paris' },
  }, {
    geometry: { coordinates: [0, 0] },
    properties: {}, // sans libellé : ignorée, jamais rendue à moitié
  }],
};

afterEach(() => vi.restoreAllMocks());

describe('versResultats', () => {
  it('extrait libellé, coordonnées et contexte', () => {
    const r = versResultats(REPONSE_BAN);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ libelle: '8 Rue de la Paix 75002 Paris', lon: 2.330992, lat: 48.868831, contexte: '75002 Paris' });
  });
  it('une réponse difforme rend une liste vide, jamais une exception', () => {
    for (const brut of [null, {}, { features: 'zut' }, { features: [{}] }]) {
      expect(versResultats(brut)).toEqual([]);
    }
  });
});

describe('chercherAdresses', () => {
  it('n’appelle PAS la BAN sous trois caractères — son minimum documenté', async () => {
    const espion = vi.spyOn(globalThis, 'fetch');
    expect(await chercherAdresses('ab')).toEqual([]);
    expect(espion).not.toHaveBeenCalled();
  });

  it('REJOUE UNE FOIS sur panne passagère, puis rend l’erreur en français', async () => {
    const espion = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('réseau'));
    await expect(chercherAdresses('rue de la paix')).rejects.toThrow(/momentanément indisponible/);
    expect(espion).toHaveBeenCalledTimes(2);
  });

  it('une frappe annulée ne se rejoue pas : l’annulation remonte telle quelle', async () => {
    const espion = vi.spyOn(globalThis, 'fetch')
      .mockRejectedValue(new DOMException('annulé', 'AbortError'));
    await expect(chercherAdresses('rue de la paix')).rejects.toThrow(DOMException);
    expect(espion).toHaveBeenCalledTimes(1);
  });

  it('un 500 de la BAN devient une ErreurAdresse, pas un JSON qui explose', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('boum', { status: 500 }));
    await expect(chercherAdresses('rue de la paix')).rejects.toThrow(ErreurAdresse);
  });
});

describe('adresseInverse', () => {
  it('rend le premier résultat, ou null sans rien inventer', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(REPONSE_BAN), { status: 200 }));
    const r = await adresseInverse({ lon: 2.33, lat: 48.87 });
    expect(r?.libelle).toContain('Rue de la Paix');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ features: [] }), { status: 200 }));
    expect(await adresseInverse({ lon: 0, lat: 0 })).toBeNull();
  });
});
