// La fabrique de styles multi-fonds : pure, donc éprouvée sans navigateur.
import { describe, it, expect } from 'vitest';
import { styleCarte, FONDS, ATTRIBUTION_IGN } from '../src/carte/style-ign';

const urls = (s: ReturnType<typeof styleCarte>) =>
  Object.values(s.sources).flatMap((src) => (src as { tiles: string[] }).tiles);

describe('styleCarte', () => {
  it('chaque fond annoncé produit un style qui pointe UNIQUEMENT vers la Géoplateforme', () => {
    for (const fond of Object.keys(FONDS) as (keyof typeof FONDS)[]) {
      for (const u of urls(styleCarte({ fond }))) {
        expect(u, `fond ${fond}`).toMatch(/^https:\/\/data\.geopf\.fr\//);
      }
    }
  });

  it('« Satellite + routes » superpose les routes AU-DESSUS de l’ortho', () => {
    const s = styleCarte({ fond: 'ortho-routes' });
    const ids = s.layers.map((l) => l.id);
    expect(ids.indexOf('surcouche-routes')).toBeGreaterThan(ids.indexOf('fond-ortho'));
  });

  it('le cadastre s’ajoute par-dessus n’importe quel fond, semi-transparent', () => {
    for (const fond of ['plan', 'ortho'] as const) {
      const s = styleCarte({ fond, cadastre: true });
      const c = s.layers.find((l) => l.id === 'surcouche-cadastre');
      expect(c, `cadastre absent sur ${fond}`).toBeDefined();
      /* LE CADASTRE PASSE AU-DESSUS DES FONDS, PAS DES ÉTIQUETTES (FOND-1,
         01/09). Ce parcours exigeait qu'il soit la DERNIÈRE couche ; depuis
         que les noms de communes et les numéros de route sont posés en
         surcouche, les laisser dessous les rendrait illisibles sous un
         calque semi-transparent. Il doit donc couvrir le fond — c'est ce
         qu'on vérifie — et rien de plus. */
      const ids = s.layers.map((l) => l.id);
      expect(ids.indexOf('surcouche-cadastre'))
        .toBeGreaterThan(ids.findIndex((i) => i.startsWith('fond-')));
      const premiereEtiquette = ids.findIndex(
        (i) => i.startsWith('toponyme-') || i.startsWith('num-route-'));
      expect(premiereEtiquette, 'les étiquettes doivent rester lisibles')
        .toBeGreaterThan(ids.indexOf('surcouche-cadastre'));
      expect((c as { paint: { 'raster-opacity': number } }).paint['raster-opacity']).toBeLessThan(1);
    }
  });

  it('sans cadastre, aucune trace de la surcouche', () => {
    expect(styleCarte({ fond: 'plan' }).layers.some((l) => l.id === 'surcouche-cadastre')).toBe(false);
  });

  it('chaque source porte l’attribution IGN', () => {
    const s = styleCarte({ fond: 'ortho-routes', cadastre: true });
    for (const src of Object.values(s.sources)) {
      expect((src as { attribution: string }).attribution).toBe(ATTRIBUTION_IGN);
    }
  });

  it('SCAN 25 n’apparaît nulle part : la couche exige une clé (vérifié 400 le 16/08)', () => {
    for (const fond of Object.keys(FONDS) as (keyof typeof FONDS)[]) {
      for (const u of urls(styleCarte({ fond, cadastre: true }))) {
        expect(u).not.toMatch(/SCAN25/);
      }
    }
  });
});
