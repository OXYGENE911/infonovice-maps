import { describe, it, expect } from 'vitest';
import { resumerFiltresBornes } from '../src/lib/poi';

/* LE RÉSUMÉ DES FILTRES ACTIFS (BORNES-4, 01/09).
 *
 * Armelin : « aucune borne n'est visible [...] à l'exception du réseau
 * ZUNDER ». Ce n'était pas une panne : un réseau coché lors d'une visite
 * précédente, rétabli en silence. Ce résumé est la phrase qui empêche le
 * mystère — il DOIT se taire quand rien ne restreint, et tout dire sinon. */

describe('resumerFiltresBornes', () => {
  it('se tait quand rien ne restreint', () => {
    expect(resumerFiltresBornes({})).toBeNull();
    expect(resumerFiltresBornes({ prises: [], reseaux: [] })).toBeNull();
    expect(resumerFiltresBornes({ puissanceMin: 0 })).toBeNull();
    expect(resumerFiltresBornes({ nom: '   ' })).toBeNull();
  });

  it('nomme LE réseau quand il n’y en a qu’un — le cas ZUNDER du terrain', () => {
    expect(resumerFiltresBornes({ reseaux: ['ZUNDER'] })).toBe('réseau ZUNDER');
  });

  it('compte les réseaux quand ils sont plusieurs', () => {
    expect(resumerFiltresBornes({ reseaux: ['ZUNDER', 'Ionity', 'Tesla'] }))
      .toBe('3 réseaux cochés');
  });

  it('dit le nom cherché, la puissance, et les prises par leur libellé', () => {
    expect(resumerFiltresBornes({
      nom: 'McDonald', puissanceMin: 150, prises: ['combo_ccs', 'chademo'],
    })).toBe('nom « McDonald » · 150 kW et plus · prises CCS Combo, CHAdeMO');
  });

  it('assemble tout dans un ordre stable', () => {
    expect(resumerFiltresBornes({ reseaux: ['ZUNDER'], puissanceMin: 50 }))
      .toBe('réseau ZUNDER · 50 kW et plus');
  });

  /* FRONTIÈRE SYSTÈME : la préférence relue peut porter une clé de prise
     inconnue (donnée d'une vieille version) — on la montre telle quelle
     plutôt que de la cacher : un filtre invisible est le défaut soigné. */
  it('montre une clé de prise inconnue plutôt que de la taire', () => {
    expect(resumerFiltresBornes({ prises: ['xx' as never] })).toBe('prises xx');
  });
});
