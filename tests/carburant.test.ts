import { describe, expect, it } from 'vitest';
import {
  autonomieCarburantKm, profilCarburant, planifierCarburant, carburantValide, euros, prixLitre, pastillesPleins,
  type StationCarburant, type ProfilCarburant,
} from '../src/lib/carburant';

/* THERMIQUE-2 (06/09). Un trajet de 465 km en 4 h 40 (Paris–Lyon), un
   réservoir de 50 L à 6,5 L/100 km : 769 km plein, 385 km à moitié. */

const PROFIL: ProfilCarburant = {
  motorisation: 'thermique', carburant: 'gazole', reservoirL: 50, consommationL100: 6.5, jaugePourcent: 50,
};
const station = (km: number, prixL: number, ville = 'Quelque part'): StationCarburant => ({
  lon: 0, lat: 0, adresse: `${km} km`, ville, prixL, avancementM: km * 1000, ecartM: 300,
});

describe('autonomieCarburantKm et le profil', () => {
  it('kilomètres = litres dans le réservoir / consommation', () => {
    expect(Math.round(autonomieCarburantKm(50, 6.5, 100))).toBe(769);
    expect(Math.round(autonomieCarburantKm(50, 6.5, 50))).toBe(385);
    expect(autonomieCarburantKm(0, 6.5)).toBe(0);
    expect(autonomieCarburantKm(50, 0)).toBe(0);
  });
  it('le profil se lit d’IndexedDB, jauge à 100 % par défaut, et refuse l’incomplet', () => {
    expect(profilCarburant({ vehicule: { motorisation: 'thermique', carburant: 'gazole', reservoirL: 50, consommationL100: 6.5 } }))
      .toMatchObject({ carburant: 'gazole', jaugePourcent: 100 });
    expect(profilCarburant({ vehicule: { motorisation: 'hybride-rechargeable', carburant: 'e10', reservoirL: 40, consommationL100: 5, jaugePourcent: 30 } }))
      .toMatchObject({ motorisation: 'hybride-rechargeable', jaugePourcent: 30 });
    expect(profilCarburant({ vehicule: { motorisation: 'electrique', carburant: 'gazole', reservoirL: 50, consommationL100: 6 } })).toBeNull();
    expect(profilCarburant({ vehicule: { motorisation: 'thermique', carburant: 'kérosène', reservoirL: 50, consommationL100: 6 } })).toBeNull();
    expect(profilCarburant({ vehicule: { motorisation: 'thermique', carburant: 'gazole', reservoirL: 0, consommationL100: 6 } })).toBeNull();
    expect(carburantValide('sp98')).toBe(true);
    expect(carburantValide('diesel')).toBe(false);
  });
});

describe('planifierCarburant', () => {
  it('sans station et avec de la marge : aucun arrêt, l’autonomie à l’arrivée est dite', () => {
    const p = planifierCarburant({ distanceM: 200_000, dureeS: 7200, profil: PROFIL, stations: [], pauseS: 0 });
    expect(p.faisable).toBe(true);
    expect(p.arrets).toHaveLength(0);
    expect(Math.round(p.autonomieArriveeKm)).toBe(185);
  });
  it('la pause des deux heures choisit la station LA MOINS CHÈRE de la fenêtre, et le plein se chiffre', () => {
    const stations = [station(155, 1.72, 'Auxerre'), station(232, 1.65, 'Beaune'), station(310, 1.80, 'Mâcon')];
    const p = planifierCarburant({ distanceM: 465_000, dureeS: 16_800, profil: PROFIL, stations });
    expect(p.faisable).toBe(true);
    // 2 h à 99,6 km/h ≈ 199 km : la fenêtre 119–199 km ne contient qu'Auxerre.
    expect(p.arrets.map((a) => a.station.ville)).toEqual(['Auxerre', 'Mâcon']);
    expect(p.arrets[0]!.motif).toBe('pause');
    // Arrivée à Auxerre avec 385 − 155 = 230 km ; plein = (769 − 230) × 6,5 / 100 ≈ 35 L.
    expect(Math.round(p.arrets[0]!.autonomieArriveeKm)).toBe(230);
    expect(Math.round(p.arrets[0]!.litres)).toBe(35);
    expect(p.arrets[0]!.coutEur).toBeCloseTo(35.04 * 1.72, 0);
    expect(p.moinsChere?.ville).toBe('Beaune');
    expect(p.coutTotalEur).toBeGreaterThan(p.arrets[0]!.coutEur);
  });
  it('sans pause, c’est la réserve qui commande : la station la moins chère avant la limite', () => {
    const stations = [station(155, 1.72), station(232, 1.65), station(330, 1.60), station(400, 1.90)];
    const p = planifierCarburant({ distanceM: 465_000, dureeS: 16_800, profil: PROFIL, stations, pauseS: 0 });
    // Limite 385 − 40 = 345 km ; fenêtre 265–345 : la station à 330 km (1,60).
    expect(p.arrets.map((a) => a.station.avancementM / 1000)).toEqual([330]);
    expect(p.arrets[0]!.motif).toBe('carburant');
  });
  it('sans station avant la limite du réservoir, le plan le DIT plutôt que d’inventer', () => {
    const p = planifierCarburant({ distanceM: 465_000, dureeS: 16_800, profil: PROFIL, stations: [station(420, 1.7)], pauseS: 0 });
    expect(p.faisable).toBe(false);
    expect(p.motif).toMatch(/Aucune station relevée entre 265 et 345 km/);
  });
  it('une pause sans station ne bloque rien : on roule jusqu’à la prochaine fenêtre', () => {
    const p = planifierCarburant({ distanceM: 300_000, dureeS: 10_800, profil: PROFIL, stations: [station(280, 1.7)] });
    expect(p.faisable).toBe(true);
    expect(p.arrets).toHaveLength(0);
  });
  it('écrit les prix comme à la pompe', () => {
    expect(prixLitre(1.7)).toBe('1,700 €/L');
    expect(euros(60.256)).toBe('60,26 €');
    expect(euros(123.4)).toBe('123 €');
  });
});

describe('pastillesPleins (PLEINS-CARTE-1)', () => {
  it('une pastille numérotée par plein, le prix du litre dans la pilule, l’enseigne dans le nom', () => {
    const stations = [{ ...station(155, 1.72, 'Auxerre'), enseigne: 'TotalEnergies' }, station(310, 1.80, 'Mâcon')];
    const plan = planifierCarburant({ distanceM: 465_000, dureeS: 16_800, profil: PROFIL, stations });
    const fc = pastillesPleins(plan);
    expect(fc.features).toHaveLength(2);
    expect(fc.features[0]!.properties).toMatchObject({ type: 'carburant', rang: '1', duree: '1,720 €/L', nom: 'TotalEnergies, 155 km, Auxerre' });
    expect(fc.features[1]!.properties).toMatchObject({ rang: '2', nom: '310 km, Mâcon' });
    expect((fc.features[0]!.geometry as GeoJSON.Point).coordinates).toEqual([0, 0]);
  });
});
