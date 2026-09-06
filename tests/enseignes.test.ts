import { describe, expect, it } from 'vitest';
import {
  requeteEnseignes, versStationsOsm, apparierEnseignes, enseignesDuTrajet,
} from '../src/lib/enseignes';
import { planifierCarburant, type StationCarburant, type ProfilCarburant } from '../src/lib/carburant';

/* ENSEIGNES-1 (06/09). L'enseigne vient d'OpenStreetMap, le prix de l'open
   data : l'appariement se fait à moins de 150 m, jamais au nom. */

const station = (km: number, prixL: number, lon: number, lat: number, ville = ''): StationCarburant => ({
  lon, lat, adresse: `${km} km`, ville, prixL, avancementM: km * 1000, ecartM: 200,
});

describe('requeteEnseignes', () => {
  it('cherche les stations à trois kilomètres d’un tracé simplifié, en une requête', () => {
    const trace: [number, number][] = Array.from({ length: 200 }, (_, i) => [2.35 + i * 0.01, 48.85]);
    const q = requeteEnseignes(trace);
    expect(q).toContain('["amenity"="fuel"]');
    expect(q).toContain('around:3000,');
    expect(q).toContain('out center tags;');
    // Deux cents points en ligne droite se simplifient en deux.
    expect(q.split(',').length).toBeLessThan(10);
  });
});

describe('versStationsOsm', () => {
  it('lit brand, puis operator, puis name ; centre des chemins ; écarte les anonymes', () => {
    const r = versStationsOsm({ elements: [
      { type: 'node', lat: 47.8, lon: 3.6, tags: { amenity: 'fuel', brand: 'TotalEnergies', name: 'Relais X' } },
      { type: 'way', center: { lat: 47.81, lon: 3.61 }, tags: { amenity: 'fuel', operator: 'E.Leclerc' } },
      { type: 'node', lat: 47.82, lon: 3.62, tags: { amenity: 'fuel', name: 'Station du Pont' } },
      { type: 'node', lat: 47.83, lon: 3.63, tags: { amenity: 'fuel' } },
      { type: 'node', tags: { amenity: 'fuel', brand: 'Shell' } },
    ] });
    expect(r.map((s) => s.enseigne)).toEqual(['TotalEnergies', 'E.Leclerc', 'Station du Pont']);
    expect(r[1]).toMatchObject({ lon: 3.61, lat: 47.81 });
    expect(versStationsOsm(null)).toEqual([]);
  });
});

describe('apparierEnseignes et enseignesDuTrajet', () => {
  const prix = [station(10, 1.7, 3.6, 47.8, 'A'), station(20, 1.65, 3.7, 47.8, 'B'), station(30, 1.8, 3.8, 47.8, 'C')];
  const osm = [
    { lon: 3.6005, lat: 47.8, enseigne: 'TotalEnergies' },   // ~38 m de A
    { lon: 3.7, lat: 47.803, enseigne: 'E.Leclerc' },        // ~330 m de B : trop loin
    { lon: 3.8001, lat: 47.8, enseigne: 'TotalEnergies' },   // ~8 m de C
  ];
  it('donne l’enseigne de la voisine à moins de 150 m, laisse l’inconnue inconnue', () => {
    const r = apparierEnseignes(prix, osm);
    expect(r.map((s) => s.enseigne)).toEqual(['TotalEnergies', null, 'TotalEnergies']);
    expect(enseignesDuTrajet(r)).toEqual([{ nom: 'TotalEnergies', nombre: 2 }]);
  });
  it('le plan ne retient que les enseignes cochées — l’inconnue est écartée quand on filtre', () => {
    const profil: ProfilCarburant = { motorisation: 'thermique', carburant: 'gazole', reservoirL: 50, consommationL100: 6.5, jaugePourcent: 20 };
    const stations = apparierEnseignes(prix, osm);
    // 154 km d'autonomie, réserve 40 : la limite est à ~114 km ; fenêtre 34–114 km.
    const sans = planifierCarburant({ distanceM: 200_000, dureeS: 7200, profil, stations: stations.map((s) => ({ ...s, avancementM: s.avancementM * 5 })), pauseS: 0 });
    expect(sans.arrets[0]!.station.ville).toBe('B'); // 100 km, la moins chère
    const avec = planifierCarburant({ distanceM: 200_000, dureeS: 7200, profil, stations: stations.map((s) => ({ ...s, avancementM: s.avancementM * 5 })), pauseS: 0, enseignes: new Set(['TotalEnergies']) });
    expect(avec.arrets[0]!.station.ville).toBe('A'); // 50 km, TotalEnergies
  });
});
