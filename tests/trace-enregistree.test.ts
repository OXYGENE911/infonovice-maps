import { describe, it, expect } from 'vitest';
import { versGPXTrace } from '../src/lib/trace';

/* LE GPX DU TRAJET PARCOURU (HIST-4, 08/09/2026).
 *
 * L'export du trajet CALCULÉ existait ; celui du trajet PARCOURU, non. La
 * différence n'est pas cosmétique : Garmin, OsmAnd et Strava calculent le
 * dénivelé et la vitesse à partir de `ele` et `time`. Un GPX sans eux leur
 * paraît vide, et c'est ce qu'un export de tracé enregistré aurait produit
 * s'il s'était contenté de recopier la fonction voisine.
 */

const DEPART = Date.UTC(2026, 8, 8, 6, 30, 0); // 8 septembre 2026, 06:30 UTC

describe('versGPXTrace', () => {
  it('écrit l’altitude et l’heure ABSOLUE de chaque point', () => {
    const gpx = versGPXTrace([
      { lon: 2.3522, lat: 48.8566, altitudeM: 35.2, tMs: 0 },
      { lon: 2.3600, lat: 48.8600, altitudeM: 41.9, tMs: 30_000 },
    ], 'Domicile → Travail', DEPART);

    expect(gpx).toContain('<trkpt lat="48.8566" lon="2.3522">');
    expect(gpx).toContain('<ele>35.2</ele>');
    expect(gpx).toContain('<time>2026-09-08T06:30:00.000Z</time>');
    // Le second point est trente secondes plus tard, pas trente millisecondes.
    expect(gpx).toContain('<time>2026-09-08T06:30:30.000Z</time>');
    // L'en-tête date le trajet lui-même.
    expect(gpx).toMatch(/<metadata><name>Domicile → Travail<\/name><time>2026-09-08T06:30:00.000Z<\/time><\/metadata>/);
  });

  it('LAT PUIS LON, l’ordre inverse du GeoJSON — l’erreur classique des exports cassés', () => {
    const gpx = versGPXTrace([{ lon: 2.3522, lat: 48.8566 }], 'Essai');
    expect(gpx).toContain('lat="48.8566" lon="2.3522"');
    expect(gpx).not.toContain('lat="2.3522"');
  });

  it('un point sans altitude ni heure reste un point : mieux qu’un trou', () => {
    const gpx = versGPXTrace([
      { lon: 1, lat: 2 },
      { lon: 3, lat: 4, altitudeM: null },
    ], 'Essai');
    expect(gpx).toContain('<trkpt lat="2" lon="1"/>');
    expect(gpx).toContain('<trkpt lat="4" lon="3"/>');
    expect(gpx).not.toContain('<ele>');
  });

  it('SANS DÉPART, aucune heure inventée', () => {
    const gpx = versGPXTrace([{ lon: 1, lat: 2, tMs: 5_000 }], 'Essai');
    expect(gpx).not.toContain('<time>');
  });

  it('le nom vient de l’usager : il est échappé', () => {
    /* Le titre d'un parcours porte des libellés BAN, donc du texte venu d'un
       service externe. Une esperluette ou un chevron non échappés casseraient
       le fichier chez celui qui le relit. */
    const gpx = versGPXTrace([{ lon: 1, lat: 2 }], 'Chez « A & B » <chef>');
    expect(gpx).toContain('Chez « A &amp; B » &lt;chef&gt;');
    expect(gpx).not.toContain('<chef>');
  });

  it('un tracé vide reste un GPX valide, pas une erreur', () => {
    const gpx = versGPXTrace([], 'Rien');
    expect(gpx).toContain('<trkseg>');
    expect(gpx).toContain('</gpx>');
  });
});
