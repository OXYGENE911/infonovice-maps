// Export GPX/KML et partage par URL : tout est pur, tout se prouve à sec.
import { describe, it, expect } from 'vitest';
import { versGPX, versKML } from '../src/lib/trace';
import { versFragment, depuisFragment } from '../src/lib/partage-url';
import type { Itineraire } from '../src/lib/itineraire';

const ITI: Itineraire = {
  geometrie: { type: 'LineString', coordinates: [[2.3522, 48.8566], [4.8357, 45.764]] },
  distance: 465_000, duree: 15_480,
};

describe('versGPX', () => {
  it('trkpt porte lat PUIS lon — l’inverse du GeoJSON, l’erreur classique', () => {
    const gpx = versGPX(ITI, 'Essai');
    expect(gpx).toContain('<trkpt lat="48.8566" lon="2.3522"/>');
    expect(gpx).toContain('<trkpt lat="45.764" lon="4.8357"/>');
    expect(gpx).toContain('version="1.1"');
  });
  it('échappe le nom : il vient des libellés BAN, un service externe', () => {
    const gpx = versGPX(ITI, 'A <b> & "c"');
    expect(gpx).toContain('A &lt;b&gt; &amp; &quot;c&quot;');
    expect(gpx).not.toContain('<b>');
  });
});

describe('versKML', () => {
  it('coordonnées lon,lat séparées par des espaces', () => {
    const kml = versKML(ITI, 'Essai');
    expect(kml).toContain('<coordinates>2.3522,48.8566 4.8357,45.764</coordinates>');
    expect(kml).toContain('http://www.opengis.net/kml/2.2');
  });
});

describe('partage par URL', () => {
  const P = { depart: { lon: 2.3522, lat: 48.8566 }, arrivee: { lon: 4.8357, lat: 45.764 }, profil: 'car' as const };

  it('l’aller-retour fragment → objet est exact à cinq décimales', () => {
    const relu = depuisFragment(versFragment(P));
    expect(relu).not.toBeNull();
    expect(relu?.depart.lon).toBeCloseTo(2.3522, 5);
    expect(relu?.arrivee.lat).toBeCloseTo(45.764, 5);
    expect(relu?.profil).toBe('car');
  });

  it('UN FRAGMENT FORGÉ REND NULL, jamais une exception', () => {
    for (const f of ['#iti=', '#iti=a,b;c,d;car', '#iti=2,48;5,45;fusee',
      '#iti=200,48;5,45;car', '#iti=2,95;5,45;car', '#autre', '', '#iti=2,48;5,45;car;bonus']) {
      expect(depuisFragment(f), f).toBeNull();
    }
  });
});
