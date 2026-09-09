// Le géocodage BAN : la transformation pure, et la résilience réseau.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { versResultats, chercherAdresses, adresseInverse, contexteADire, ErreurAdresse } from '../src/lib/adresse';

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

describe('la commune ne se dit pas deux fois (A11Y-LECTEUR-1)', () => {
  /* TROUVÉ LE 09/09 EN LISANT L'ARBRE D'ACCESSIBILITÉ, pas en regardant
     l'écran : chaque suggestion s'annonçait « 1 Rue de Rivoli 75001 Paris
     75001 Paris 250 km ». Le libellé de la BAN finit déjà par le code postal
     et la commune, et l'on ajoutait les mêmes en dessous. À l'œil, deux
     lignes qui se répètent se pardonnent — on saute la seconde. À l'oreille,
     il faut les écouter toutes les deux, sur CHAQUE suggestion. */
  it('la répétition tombe quand le libellé porte déjà la commune', () => {
    expect(contexteADire('1 Rue de Rivoli 75001 Paris', '75001 Paris')).toBe('');
  });

  it('LE CONTEXTE RESTE PARTOUT OÙ IL SERT, et c’est pourquoi on ne le retire '
    + 'pas d’office : sur un lieu nommé, il porte la seule commune qu’on ait', () => {
    expect(contexteADire('Boulangerie Martin', '75001 Paris')).toBe('75001 Paris');
  });

  it('il reste aussi quand il lève une homonymie — deux « Rue de la Paix »', () => {
    expect(contexteADire('Rue de la Paix', '75002 Paris')).toBe('75002 Paris');
    expect(contexteADire('Rue de la Paix', '69003 Lyon')).toBe('69003 Lyon');
  });

  it('la casse et les espaces en trop ne cachent pas la répétition', () => {
    expect(contexteADire('1 RUE DE RIVOLI  75001   PARIS', '75001 Paris')).toBe('');
  });

  it('un contexte vide ne fabrique rien', () => {
    expect(contexteADire('1 Rue de Rivoli 75001 Paris', '')).toBe('');
  });
});
