// Le style IGN : la partie pure de la carte, éprouvée sans navigateur.
import { describe, it, expect } from 'vitest';
import {
  styleIGNPlan, styleCarte, urlTuiles, ATTRIBUTION_IGN, LOCALE_FR,
  calquesEtiquettes, sourceEtiquettes,
  pourImagerie,
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

describe('les étiquettes qui manquent au raster (FOND-1, puis FOND-2)', () => {
  /* Armelin, deux défauts d'un coup : « quand je configure la carte avec un
     fond Carte Satellite, les noms de ville et village ne s'affichent pas »
     et « quand on zoome, il n'y a pas les numéros de nationale,
     départementale et autoroute qui s'affichent sur la carte ».
     LA CAUSE EST LA MÊME : le fond est RASTER, ses étiquettes sont peintes
     dans l'image. On les rétablit par une surcouche vectorielle.
     FOND-2 (01/09) A DÉPLACÉ LE MOMENT, PAS LE CONTENU : déclarée dans le
     style initial, la surcouche restait vide EN PRODUCTION — sans une erreur
     pour le dire — alors qu'un `setStyle(getStyle())` la faisait paraître
     d'un coup (66 numéros mesurés : A86, A4, N104…). Elle se pose désormais
     sur `style.load`, comme le tracé, les bornes et les POI. */

  it('le style ne porte plus les calques — ils se posent après', () => {
    for (const fond of ['plan', 'ortho'] as const) {
      const ids = styleCarte({ fond }).layers.map((c2) => c2.id);
      expect(ids.some((i) => i.startsWith('num-route-') || i.startsWith('toponyme-')),
        'les calques ne doivent plus naître avec le style').toBe(false);
    }
  });

  /* LES GLYPHES, EUX, RESTENT DANS LE STYLE : un calque de symboles ajouté
     plus tard a besoin d'une police DÉJÀ déclarée, faute de quoi MapLibre le
     refuse. C'est la seule part de la surcouche qui doit naître avec lui. */
  it('déclare les polices dès le style, sans quoi rien ne se dessinerait', () => {
    expect(styleCarte({ fond: 'ortho' }).glyphs).toContain('data.geopf.fr');
    expect(styleCarte({ fond: 'plan' }).glyphs).toContain('data.geopf.fr');
  });

  it('le satellite reçoit les noms de communes ET les numéros de route', () => {
    const ids = calquesEtiquettes('ortho').map((c2) => c2.id);
    expect(ids.some((i) => i.startsWith('toponyme-')), 'les noms de communes').toBe(true);
    expect(ids.some((i) => i.startsWith('num-route-')), 'les numéros de route').toBe(true);
  });

  /* SUR LE PLAN, PAS DE NOMS EN DOUBLE : la planche raster les dessine déjà,
     et deux textes superposés décalés d'un pixel se lisent plus mal qu'un. */
  it('le Plan IGN ne reçoit QUE les numéros de route', () => {
    const ids = calquesEtiquettes('plan').map((c2) => c2.id);
    expect(ids.every((i) => i.startsWith('num-route-'))).toBe(true);
    expect(ids).toHaveLength(3);
  });

  it('la source vectorielle porte son attribution et la bonne adresse', () => {
    const s = sourceEtiquettes();
    expect(s.type).toBe('vector');
    expect(s.tiles[0]).toContain('data.geopf.fr/tms/1.0.0/PLAN.IGN');
    expect(s.attribution).toContain('IGN');
  });

  it('les trois classes de route sont là, aux seuils d’IGN', () => {
    const zooms = calquesEtiquettes('plan')
      .map((c2) => (c2 as { minzoom?: number }).minzoom);
    // L'autoroute et la nationale dès le zoom 7, la départementale au 11.
    expect([...zooms].sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual([7, 7, 11]);
  });
});

describe('les étiquettes sur imagerie (FOND-3)', () => {
  /* Armelin : « en cartographie satellite, la police d'écriture des villes
     n'est pas belle du tout. Un halo blanc en fond […] vient faire tache avec
     un rendu qui bave un peu. »
     Le style d'origine écrit les toponymes en NOIR cerné de blanc à moitié
     transparent : invisible sur un fond uni, laiteux sur une photo. */

  it('sur l’imagerie, le texte devient blanc à cerne noir', () => {
    const c = calquesEtiquettes('ortho');
    const symboles = c.filter((x) => x.type === 'symbol');
    expect(symboles.length).toBeGreaterThan(0);
    for (const s of symboles) {
      const p = s.paint as Record<string, unknown>;
      expect(p['text-color']).toBe('#FFFFFF');
      expect(p['text-halo-color']).toBe('rgba(0, 0, 0, 0.85)');
    }
  });

  it('le fond « ortho-routes » aussi : c’est de la photo également', () => {
    for (const s of calquesEtiquettes('ortho-routes').filter((x) => x.type === 'symbol')) {
      expect((s.paint as Record<string, unknown>)['text-color']).toBe('#FFFFFF');
    }
  });

  it('le cerne est SERRÉ — un halo large auréole au lieu de détacher', () => {
    for (const s of calquesEtiquettes('ortho').filter((x) => x.type === 'symbol')) {
      const p = s.paint as Record<string, unknown>;
      expect(p['text-halo-width']).toBeLessThanOrEqual(2);
      expect(p['text-halo-blur']).toBe(0);
    }
  });

  it('LE FOND PLAN N’EST PAS TOUCHÉ : corriger l’IGN chez lui serait présomptueux', () => {
    for (const s of calquesEtiquettes('plan').filter((x) => x.type === 'symbol')) {
      const p = s.paint as Record<string, unknown>;
      expect(p['text-color']).not.toBe('#FFFFFF');
    }
  });

  it('pourImagerie ne touche pas les calques qui ne portent pas de texte', () => {
    const ligne = { id: 'x', type: 'line' as const, source: 's', paint: { 'line-color': '#123456' } };
    expect(pourImagerie([ligne])[0]).toEqual(ligne);
  });
});
