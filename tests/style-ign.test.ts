// Le style IGN : la partie pure de la carte, éprouvée sans navigateur.
import { describe, it, expect } from 'vitest';
import {
  styleIGNPlan, styleCarte, urlTuiles, ATTRIBUTION_IGN, LOCALE_FR,
} from '../src/carte/style-ign';

describe('styleIGNPlan', () => {
  it('pointe vers la Géoplateforme, et nulle part ailleurs', () => {
    const style = styleIGNPlan();
    const source = style.sources['plan-ign'];
    expect(source).toBeDefined();
    const tuiles = (source as { tiles: string[] }).tiles;
    for (const url of tuiles) {
      expect(url).toMatch(/^https:\/\/data\.geopf\.fr\//);
    }
  });

  it('porte l’attribution IGN exigée par la Géoplateforme', () => {
    const source = styleIGNPlan().sources['plan-ign'] as { attribution: string };
    expect(source.attribution).toBe(ATTRIBUTION_IGN);
    expect(ATTRIBUTION_IGN).toContain('IGN');
  });

  it('assemble l’URL WMTS avec le gabarit x/y/z de MapLibre', () => {
    const u = urlTuiles('GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2', 'image/png');
    expect(u).toContain('TILEMATRIX={z}');
    expect(u).toContain('TILEROW={y}');
    expect(u).toContain('TILECOL={x}');
    expect(u).toContain('LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2');
  });
});

describe('LOCALE_FR', () => {
  it('traduit les contrôles que la carte affiche', () => {
    // Un produit souverain qui dit « Zoom in » à un lecteur d'écran français
    // raterait sa première promesse.
    for (const cle of ['NavigationControl.ZoomIn', 'NavigationControl.ZoomOut',
      'GeolocateControl.FindMyLocation']) {
      expect(LOCALE_FR[cle], `${cle} sans traduction`).toBeTruthy();
    }
    for (const valeur of Object.values(LOCALE_FR)) {
      expect(valeur).not.toMatch(/zoom in|zoom out|find my/i);
    }
  });
});

describe('les étiquettes qui manquent au raster (FOND-1, 01/09)', () => {
  /* Armelin, deux défauts d'un coup : « quand je configure la carte avec un
     fond Carte Satellite, les noms de ville et village ne s'affichent pas »
     et « quand on zoome, il n'y a pas les numéros de nationale,
     départementale et autoroute qui s'affichent sur la carte ».
     LA CAUSE EST LA MÊME : le fond est RASTER, ses étiquettes sont peintes
     dans l'image. On les rétablit par une surcouche vectorielle. */
  const idsDe = (s: ReturnType<typeof styleCarte>): string[] => s.layers.map((c) => c.id);

  it('le satellite reçoit les noms de communes ET les numéros de route', () => {
    const ids = idsDe(styleCarte({ fond: 'ortho' }));
    expect(ids.some((i) => i.startsWith('toponyme-')), 'les noms de communes').toBe(true);
    expect(ids.some((i) => i.startsWith('num-route-')), 'les numéros de route').toBe(true);
  });

  /* SUR LE PLAN, PAS DE NOMS EN DOUBLE : la planche raster les dessine déjà,
     et deux textes superposés décalés d'un pixel se lisent plus mal qu'un. */
  it('le Plan IGN ne reçoit QUE les numéros de route', () => {
    const ids = idsDe(styleCarte({ fond: 'plan' }));
    expect(ids.some((i) => i.startsWith('num-route-'))).toBe(true);
    expect(ids.some((i) => i.startsWith('toponyme-')),
      'les noms sont déjà dans la planche').toBe(false);
  });

  it('les étiquettes passent APRÈS le fond et le cadastre', () => {
    const ids = idsDe(styleCarte({ fond: 'ortho', cadastre: true }));
    const premiereEtiquette = ids.findIndex((i) => i.startsWith('toponyme-') || i.startsWith('num-route-'));
    expect(premiereEtiquette).toBeGreaterThan(ids.indexOf('fond-ortho'));
    expect(premiereEtiquette).toBeGreaterThan(ids.indexOf('surcouche-cadastre'));
  });

  /* SANS GLYPHES, AUCUN TEXTE NE SE DESSINE — et MapLibre ne le dit pas fort.
     Le style doit donc les déclarer dès qu'il porte un symbole, et se taire
     sinon plutôt qu'annoncer une police qu'il n'ira jamais chercher. */
  it('déclare les polices quand il y a du texte', () => {
    expect(styleCarte({ fond: 'ortho' }).glyphs).toContain('data.geopf.fr');
    expect(styleCarte({ fond: 'plan' }).glyphs).toContain('data.geopf.fr');
  });

  it('la source vectorielle est déclarée une seule fois, avec son attribution', () => {
    const s = styleCarte({ fond: 'ortho' });
    const src = s.sources['etiquettes-ign'] as { type: string; tiles: string[]; attribution: string };
    expect(src.type).toBe('vector');
    expect(src.tiles[0]).toContain('data.geopf.fr/tms/1.0.0/PLAN.IGN');
    expect(src.attribution).toContain('IGN');
  });

  it('les trois classes de route sont là, aux seuils d’IGN', () => {
    const routes = styleCarte({ fond: 'plan' }).layers
      .filter((c) => c.id.startsWith('num-route-'));
    expect(routes).toHaveLength(3);
    // L'autoroute et la nationale dès le zoom 7, la départementale au 11.
    const zooms = routes.map((c) => (c as { minzoom?: number }).minzoom);
    expect([...zooms].sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual([7, 7, 11]);
  });
});
