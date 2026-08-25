// Suggestion des arrêts de recharge — calcul PUR, testé à sec. C'est le cœur
// d'un planificateur électrique : pas « où sont les bornes », mais « lesquelles
// dois-je prendre, avec combien de batterie j'y arrive, et combien de temps ».
//
// LE SERVICE LE PLUS UTILE EST PARFOIS DE DIRE NON, TÔT, AVEC LE MOTIF.
import { describe, expect, test } from 'vitest';
import { planifierArrets, type BorneCandidate, type OptionsPlan } from '../src/lib/arrets';

/** La VF8 d'Armelin, relevés réels : 82,44 kWh utilisables, 29,4 kWh/100 km
 *  sur autoroute — soit 280 km à pleine charge. */
const VF8: OptionsPlan['vehicule'] = {
  capaciteKwh: 82.44,
  consommationKwh100: 29.4,
  puissanceMaxKw: 150,
};

const borne = (km: number, puissance: number, nom = `Borne ${km}`): BorneCandidate =>
  ({ nom, avancementM: km * 1000, puissanceKw: puissance, ecartM: 200, lon: 0, lat: 0 });

const plan = (o: Partial<OptionsPlan> & { distanceM: number; bornes: BorneCandidate[] }) =>
  planifierArrets({ vehicule: VF8, socDepart: 100, socArrivee: 10, reserve: 10, ...o });

describe('un trajet à portée ne propose AUCUN arrêt', () => {
  test('200 km avec 280 de portée : on y va directement', () => {
    const r = plan({ distanceM: 200_000, bornes: [borne(100, 150)] });
    expect(r.faisable).toBe(true);
    expect(r.arrets, 'un arrêt inutile fait perdre du temps').toEqual([]);
  });

  test('et le SOC d’arrivée est calculé, pas deviné', () => {
    // 200 km × 29,4 kWh/100 = 58,8 kWh sur 82,44 → il reste 28,7 %.
    const r = plan({ distanceM: 200_000, bornes: [] });
    expect(r.socArrivee).toBeGreaterThan(27);
    expect(r.socArrivee).toBeLessThan(30);
  });
});

describe('un trajet trop long s’arrête, et le dit', () => {
  test('500 km avec une borne bien placée : un arrêt suffit', () => {
    const r = plan({ distanceM: 500_000, bornes: [borne(250, 150), borne(400, 50)] });
    expect(r.faisable).toBe(true);
    expect(r.arrets).toHaveLength(1);
    expect(r.arrets[0]!.borne.nom).toBe('Borne 250');
  });

  test('on arrive à la borne AVEC la réserve, jamais en dessous', () => {
    const r = plan({ distanceM: 500_000, bornes: [borne(250, 150)] });
    expect(r.arrets[0]!.socArrivee).toBeGreaterThanOrEqual(10);
  });

  test('1000 km : plusieurs arrêts, tous en avançant', () => {
    const bornes = [borne(200, 150), borne(420, 150), borne(650, 150), borne(880, 150)];
    const r = plan({ distanceM: 1_000_000, bornes });
    expect(r.faisable).toBe(true);
    expect(r.arrets.length).toBeGreaterThanOrEqual(3);
    const avancements = r.arrets.map((a) => a.borne.avancementM);
    expect(avancements, 'les arrêts doivent se suivre').toEqual([...avancements].sort((a, b) => a - b));
  });
});

describe('quand c’est impossible, on le dit TÔT et avec le motif', () => {
  test('aucune borne à portée : refus explicite, pas un plan bancal', () => {
    const r = plan({ distanceM: 600_000, bornes: [borne(500, 150)] });
    expect(r.faisable).toBe(false);
    expect(r.motif, 'un refus muet ne sert à personne').toBeTruthy();
    expect(r.motif).toContain('km');
  });

  test('le motif situe le point de rupture, en kilomètres', () => {
    const r = plan({ distanceM: 600_000, bornes: [] });
    expect(r.motif).toMatch(/\d+\s*km/);
    expect(r.arrets, 'aucun arrêt fantaisiste dans un plan infaisable').toEqual([]);
  });

  test('une borne EN ARRIÈRE ne sauve pas le plan', () => {
    // Piège : une borne à 50 km alors qu'on est déjà à 250.
    const r = plan({ distanceM: 600_000, bornes: [borne(50, 150), borne(500, 150)] });
    expect(r.faisable).toBe(false);
  });
});

describe('le temps de charge est calculé, et il n’est pas linéaire', () => {
  test('une borne puissante charge plus vite qu’une lente', () => {
    const rapide = plan({ distanceM: 500_000, bornes: [borne(250, 150)] });
    const lente = plan({ distanceM: 500_000, bornes: [borne(250, 50)] });
    expect(lente.arrets[0]!.dureeMin).toBeGreaterThan(rapide.arrets[0]!.dureeMin);
  });

  test('la borne ne dépasse jamais ce que le véhicule accepte', () => {
    const a = plan({ distanceM: 500_000, bornes: [borne(250, 350)] });
    const b = plan({ distanceM: 500_000, bornes: [borne(250, 150)] });
    // 350 kW sur un véhicule qui plafonne à 150 : même durée.
    expect(a.arrets[0]!.dureeMin).toBeCloseTo(b.arrets[0]!.dureeMin, 0);
  });

  test('charger au-delà de 80 % coûte cher — le plan l’évite QUAND IL PEUT', () => {
    /* 400 km, borne à 250 : il reste 150 km, soit 44,1 kWh sur 82,44 — donc
       53,5 %, plus 10 % de cible. Le plafond de confort suffit largement. */
    const r = plan({ distanceM: 400_000, bornes: [borne(250, 150)] });
    expect(r.arrets[0]!.socDepart,
      'inutile de remplir à 100 % quand 64 suffisent').toBeLessThanOrEqual(80);
  });

  test('mais il MONTE au-delà quand le dernier tronçon l’exige', () => {
    /* 500 km avec la même borne : il reste 250 km, soit 73,5 kWh — près de
       90 % de la batterie. Refuser de dépasser 80 % déclarerait le trajet
       impossible alors qu'il ne l'est pas. Vingt minutes de plus valent mieux
       qu'un « non » infondé. */
    const r = plan({ distanceM: 500_000, bornes: [borne(250, 150)] });
    expect(r.faisable).toBe(true);
    expect(r.arrets[0]!.socDepart).toBeGreaterThan(80);
  });

  test('la durée totale additionne les arrêts', () => {
    const bornes = [borne(200, 150), borne(420, 150), borne(650, 150), borne(880, 150)];
    const r = plan({ distanceM: 1_000_000, bornes });
    const somme = r.arrets.reduce((t, a) => t + a.dureeMin, 0);
    expect(r.dureeRechargeMin).toBeCloseTo(somme, 5);
  });
});

describe('les garde-fous des saisies', () => {
  test('une consommation nulle ne rend pas une portée infinie', () => {
    const r = planifierArrets({
      vehicule: { ...VF8, consommationKwh100: 0 }, distanceM: 500_000,
      bornes: [borne(250, 150)], socDepart: 100, socArrivee: 10, reserve: 10,
    });
    expect(r.faisable).toBe(false);
    expect(r.motif).toBeTruthy();
  });

  test('une batterie vide ne part pas', () => {
    const r = plan({ distanceM: 100_000, bornes: [], socDepart: 0 });
    expect(r.faisable).toBe(false);
  });

  test('un trajet de longueur nulle est trivialement faisable', () => {
    const r = plan({ distanceM: 0, bornes: [] });
    expect(r.faisable).toBe(true);
    expect(r.arrets).toEqual([]);
  });

  test('la boucle se termine même si les bornes sont absurdement rapprochées', () => {
    const bornes = Array.from({ length: 300 }, (_, i) => borne(i, 150));
    const r = plan({ distanceM: 400_000, bornes });
    // Le garde-fou doit borner le nombre d'arrêts, pas tourner sans fin.
    expect(r.arrets.length).toBeLessThan(20);
  });
});

describe('le choix de la borne privilégie les arrêts UTILES', () => {
  test('à portée égale, on va le plus loin possible — moins d’arrêts', () => {
    const r = plan({ distanceM: 500_000, bornes: [borne(120, 150), borne(250, 150)] });
    expect(r.arrets[0]!.borne.nom).toBe('Borne 250');
  });

  test('mais une borne bien plus puissante un peu avant peut gagner', () => {
    // 240 km à 150 kW plutôt que 250 km à 22 kW : la charge lente coûterait
    // plus que les dix kilomètres gagnés.
    const r = plan({ distanceM: 500_000, bornes: [borne(240, 150), borne(250, 22)] });
    expect(r.arrets[0]!.borne.nom).toBe('Borne 240');
  });
});
