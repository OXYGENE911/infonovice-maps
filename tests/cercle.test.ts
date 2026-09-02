// Cercles géodésiques — géométrie pure, testée à sec. Un « cercle » de 300 km
// sur une carte n'en est pas un : on vérifie les DISTANCES sur la sphère, pas
// la forme à l'écran.
import { describe, expect, test } from 'vitest';
import {
  cercleGeodesique, collectionAnneaux, rayonAffichable, FACTEUR_DETOUR,
} from '../src/lib/cercle';

const RAYON_TERRE_KM = 6371.0088;
const RAD = Math.PI / 180;

/** Haversine — indépendante du code testé, sinon on vérifierait une formule
 *  avec elle-même. */
function distanceKm(a: [number, number], b: [number, number]): number {
  const dPhi = (b[1] - a[1]) * RAD;
  const dLam = (b[0] - a[0]) * RAD;
  const h = Math.sin(dPhi / 2) ** 2
    + Math.cos(a[1] * RAD) * Math.cos(b[1] * RAD) * Math.sin(dLam / 2) ** 2;
  return 2 * RAYON_TERRE_KM * Math.asin(Math.sqrt(h));
}

describe('un anneau se tient à la bonne distance, tout autour', () => {
  test('chaque sommet est à ±0,5 km du rayon demandé — Paris, 300 km', () => {
    const centre: [number, number] = [2.3522, 48.8566];
    const anneau = cercleGeodesique(centre[0], centre[1], 300);
    for (const p of anneau) {
      expect(Math.abs(distanceKm(centre, p) - 300),
        `sommet à ${distanceKm(centre, p).toFixed(1)} km`).toBeLessThan(0.5);
    }
  });

  test('la justesse tient AUSSI loin de l’équateur — Dunkerque, 400 km', () => {
    // C'est là qu'un cercle tracé en pixels se serait effondré.
    const centre: [number, number] = [2.3768, 51.0344];
    for (const p of cercleGeodesique(centre[0], centre[1], 400)) {
      expect(Math.abs(distanceKm(centre, p) - 400)).toBeLessThan(0.5);
    }
  });

  test('l’anneau est FERMÉ — la spécification GeoJSON l’exige', () => {
    const a = cercleGeodesique(2.35, 48.85, 100);
    expect(a[0]).toEqual(a[a.length - 1]);
  });

  test('les longitudes restent dans [-180, 180], même près de l’antiméridien', () => {
    for (const [lon] of cercleGeodesique(179.6, 0, 200)) {
      expect(lon).toBeGreaterThanOrEqual(-180);
      expect(lon).toBeLessThanOrEqual(180);
    }
  });

  test('un rayon nul ou absurde ne rend pas une figure absurde', () => {
    expect(cercleGeodesique(2, 48, 0)).toEqual([]);
    expect(cercleGeodesique(2, 48, -50)).toEqual([]);
    expect(cercleGeodesique(Number.NaN, 48, 100)).toEqual([]);
  });

  test('le nombre de sommets est borné des deux côtés', () => {
    expect(cercleGeodesique(2, 48, 10, 2).length).toBe(9);      // 8 minimum + fermeture
    expect(cercleGeodesique(2, 48, 10, 99_999).length).toBe(513); // 512 maximum + fermeture
  });
});

describe('la collection d’anneaux', () => {
  const TROIS = [
    { cle: 'ville', rayonKm: 400, couleur: '#1E9E5A' },
    { cle: 'autoroute', rayonKm: 280, couleur: '#C0392B' },
    { cle: 'route', rayonKm: 360, couleur: '#C98A16' },
  ];

  test('les anneaux sortent du PLUS GRAND au plus petit — le petit doit rester visible', () => {
    const c = collectionAnneaux(2.35, 48.85, TROIS);
    expect(c.features.map((f) => f.properties?.['cle'])).toEqual(['ville', 'route', 'autoroute']);
  });

  test('un rayon nul est écarté plutôt que dessiné en point', () => {
    const c = collectionAnneaux(2.35, 48.85, [...TROIS, { cle: 'vide', rayonKm: 0, couleur: '#000' }]);
    expect(c.features).toHaveLength(3);
  });

  test('chaque anneau porte son rayon arrondi, pour être affiché tel quel', () => {
    const c = collectionAnneaux(2.35, 48.85, [{ cle: 'x', rayonKm: 287.6, couleur: '#000' }]);
    expect(c.features[0]!.properties?.['rayonKm']).toBe(288);
  });
});

describe('rayonAffichable (RAYON-1)', () => {
  /* Un collègue d'Armelin : « le rayon d'action sous forme de cercle semblait
     beaucoup trop optimiste par défaut […] il vaut mieux afficher des
     autonomies légèrement plus pessimistes ».
     LE BIAIS EST STRUCTUREL : une autonomie se dépense sur des ROUTES, un
     cercle se mesure à VOL D'OISEAU. Mesuré sur huit trajets français avec le
     moteur de la Géoplateforme : médiane 1,19, moyenne 1,21, pire cas 1,42. */

  test('rétrécit le cercle du détour routier mesuré', () => {
    expect(rayonAffichable(250)).toBe(200);
  });

  test('le facteur penche du côté PESSIMISTE', () => {
    /* 1,25 est au-dessus de la médiane (1,19) et de la moyenne (1,21) : mieux
       vaut arriver plus loin que prévu que tomber en panne avant le cercle. */
    expect(FACTEUR_DETOUR).toBeGreaterThan(1.21);
    expect(FACTEUR_DETOUR).toBeLessThan(1.42);
  });

  test('une autonomie inconnue ne trace pas de cercle', () => {
    /* Zéro se lit « je ne sais pas ». Un cercle de rayon nul ne promet rien —
       un cercle par défaut promettrait au hasard. */
    expect(rayonAffichable(0)).toBe(0);
    expect(rayonAffichable(Number.NaN)).toBe(0);
    expect(rayonAffichable(-10)).toBe(0);
  });
});
