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

  it('porte les étapes intermédiaires et les évitements — aller-retour exact', () => {
    const relu = depuisFragment(versFragment({
      ...P,
      etapes: [{ lon: 5.0415, lat: 47.322 }],
      eviter: ['autoroute', 'tunnel'],
    }));
    expect(relu).not.toBeNull();
    expect(relu?.etapes).toHaveLength(1);
    expect(relu?.etapes[0]?.lon).toBeCloseTo(5.0415, 5);
    expect(relu?.eviter).toEqual(['autoroute', 'tunnel']);
    expect(relu?.depart.lon).toBeCloseTo(2.3522, 5);
    expect(relu?.arrivee.lat).toBeCloseTo(45.764, 5);
  });

  it('l’ancienne forme à deux points reste lisible : étapes et évitements vides', () => {
    const relu = depuisFragment('#iti=2.35220,48.85660;4.83570,45.76400;car');
    expect(relu?.etapes).toEqual([]);
    expect(relu?.eviter).toEqual([]);
    // Et l'optimisation vaut le défaut de toujours : un vieux lien rejoue
    // EXACTEMENT le trajet qu'il promettait.
    expect(relu?.optimisation).toBe('fastest');
  });

  it('le plus court voyage dans le lien — et fastest reste ABSENT du fragment', () => {
    const frag = versFragment({ ...P, optimisation: 'shortest' });
    expect(frag).toContain(';opt=shortest');
    expect(depuisFragment(frag)?.optimisation).toBe('shortest');
    // fastest est le défaut : l'écrire allongerait tous les liens pour rien.
    expect(versFragment({ ...P, optimisation: 'fastest' })).not.toContain('opt=');
    // Une optimisation inconnue invalide TOUT le fragment, comme un évitement.
    expect(depuisFragment('#iti=2,48;5,45;car;opt=econome')).toBeNull();
    // `fastest` écrit à la main est toléré : c'est le défaut, il ne ment pas.
    expect(depuisFragment('#iti=2,48;5,45;car;opt=fastest')?.optimisation).toBe('fastest');
  });

  it('un évitement inconnu ou une étape hors du globe invalident TOUT le fragment', () => {
    expect(depuisFragment('#iti=2,48;5,45;car;evite=peages')).toBeNull();
    expect(depuisFragment('#iti=2,48;5,45;car;evite=autoroute|nid-de-poule')).toBeNull();
    expect(depuisFragment('#iti=2,48;200,95;5,45;car')).toBeNull();
    expect(depuisFragment('#iti=2,48;car')).toBeNull();
  });

  it('les clés héritées d’Object ne passent pas la validation (hasOwn, pas `in`)', () => {
    // `in` remonte la chaîne de prototypes : `evite=constructor` passait.
    expect(depuisFragment('#iti=2,48;5,45;car;evite=constructor')).toBeNull();
  });

  it('la borne d’étapes du lien est celle de l’interface : 6 passent, 7 invalident', () => {
    const etape = (i: number) => `${(3 + i / 10).toFixed(5)},46.00000`;
    const six = [...Array(6)].map((_, i) => etape(i)).join(';');
    const relu = depuisFragment(`#iti=2.35220,48.85660;${six};4.83570,45.76400;car`);
    expect(relu?.etapes).toHaveLength(6);
    const sept = [...Array(7)].map((_, i) => etape(i)).join(';');
    expect(depuisFragment(`#iti=2.35220,48.85660;${sept};4.83570,45.76400;car`)).toBeNull();
  });
});
