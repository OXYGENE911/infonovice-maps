// Le style IGN : la partie pure de la carte, éprouvée sans navigateur.
import { describe, it, expect } from 'vitest';
import { styleIGNPlan, urlTuiles, ATTRIBUTION_IGN, LOCALE_FR } from '../src/carte/style-ign';

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
