// Suggestion des arrêts de recharge — calcul PUR, testé à sec. C'est le cœur
// d'un planificateur électrique : pas « où sont les bornes », mais « lesquelles
// dois-je prendre, avec combien de batterie j'y arrive, et combien de temps ».
//
// LE SERVICE LE PLUS UTILE EST PARFOIS DE DIRE NON, TÔT, AVEC LE MOTIF.
import { describe, expect, test } from 'vitest';
import {
  planifierArrets, cleBorne, type BorneCandidate, type OptionsPlan,
} from '../src/lib/arrets';

/** La VF8 d'Armelin, relevés réels : 82,44 kWh utilisables, 29,4 kWh/100 km
 *  sur autoroute — soit 280 km à pleine charge. */
const VF8: OptionsPlan['vehicule'] = {
  capaciteKwh: 82.44,
  consommationKwh100: 29.4,
  puissanceMaxKw: 150,
};

const borne = (km: number, puissance: number, nom = `Borne ${km}`): BorneCandidate =>
  // La longitude vaut le kilométrage : deux bornes distinctes ont ainsi deux
  // clés distinctes, comme dans la vraie vie.
  ({ nom, avancementM: km * 1000, puissanceKw: puissance, ecartM: 200, lon: km, lat: 0 });

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


/* CE QUE L'USAGER IMPOSE AU PLANIFICATEUR — la demande d'Armelin du
   25/08/2026 : « des + et des - pour choisir moi-même les arrêts ». Un
   planificateur qui décide seul est un planificateur qu'on subit. */
describe('l’usager commande : arrêts imposés et bornes écartées', () => {
  test('une borne écartée n’est jamais retenue', () => {
    const rapide = borne(250, 350, 'Rapide');
    const lente = borne(240, 50, 'Lente');
    const r = plan({
      distanceM: 450_000,
      bornes: [lente, rapide],
      ecartees: [cleBorne(rapide)],
    });
    expect(r.faisable).toBe(true);
    expect(r.arrets.map((a) => a.borne.nom)).toEqual(['Lente']);
  });

  test('écarter TOUT ce qui est utilisable fait échouer le plan, avec le motif', () => {
    const seule = borne(250, 150);
    const r = plan({
      distanceM: 450_000, bornes: [seule], ecartees: [cleBorne(seule)],
    });
    expect(r.faisable).toBe(false);
    expect(r.motif).toMatch(/aucune borne utilisable/i);
  });

  test('un arrêt imposé est pris même si le modèle préférait un autre', () => {
    /* Sans consigne, le planificateur choisit la borne rapide et lointaine :
       c'est tout l'intérêt de son score. L'usager, lui, veut déjeuner à la
       première — et il a des raisons que le modèle n'a pas. */
    const tot = borne(120, 50, 'Le restaurant');
    const r = plan({
      distanceM: 450_000,
      bornes: [tot, borne(250, 350, 'La rapide')],
      imposees: [cleBorne(tot)],
    });
    expect(r.faisable).toBe(true);
    expect(r.arrets[0]?.borne.nom).toBe('Le restaurant');
  });

  test('sans la consigne, le même trajet choisit AUTREMENT', () => {
    // Le contraste fait la démonstration : sans le test jumeau ci-dessus, on
    // ne saurait pas si la consigne a changé quoi que ce soit.
    const r = plan({
      distanceM: 450_000,
      bornes: [borne(120, 50, 'Le restaurant'), borne(250, 350, 'La rapide')],
    });
    expect(r.arrets[0]?.borne.nom).toBe('La rapide');
  });

  /* AUCUNE BORNE NE PEUT DÉPASSER L'ARRÊT IMPOSÉ, et l'invariant qui le
     garantit mérite d'être écrit : dès que l'arrêt imposé est À PORTÉE, il est
     pris SANS EXAMEN des autres. Une borne plus loin et plus puissante ne peut
     donc pas se glisser devant lui. C'est ce test, et non une clause dans le
     code, qui tient cette propriété — la clause correspondante aurait été du
     code mort (voir le commentaire dans `planifierArrets`). */
  test('une borne au-delà, même bien meilleure, ne passe pas devant l’arrêt imposé', () => {
    const impose = borne(200, 50, 'Imposée');
    const r = plan({
      distanceM: 400_000,
      bornes: [borne(240, 350, 'Au-delà, et six fois plus rapide'), impose],
      imposees: [cleBorne(impose)],
    });
    expect(r.faisable).toBe(true);
    expect(r.arrets[0]?.borne.nom).toBe('Imposée');
  });

  /* ON NE CHARGE PAS POUR LA DESTINATION QUAND UN ARRÊT EST IMPOSÉ TRENTE
     KILOMÈTRES PLUS LOIN : ce serait remplir une batterie qu'on s'apprête à
     remplir de nouveau, et faire perdre des dizaines de minutes. */
  test('on ne charge que ce qu’il faut pour rallier l’arrêt imposé suivant', () => {
    const proche = borne(130, 150, 'Proche');
    const r = plan({
      distanceM: 500_000,
      bornes: [borne(100, 150, 'Première'), proche, borne(350, 150, 'Ensuite')],
      imposees: [cleBorne(proche)],
      socDepart: 50,
    });
    expect(r.faisable).toBe(true);
    const premier = r.arrets[0]!;
    expect(premier.borne.nom).toBe('Première');
    // Trente kilomètres à parcourir : inutile de dépasser la moitié de la
    // batterie. Sans la règle, ce chiffre montait au plafond de confort.
    expect(premier.socDepart).toBeLessThan(50);
  });

  test('un arrêt imposé hors de portée est refusé en le NOMMANT', () => {
    const trop = borne(600, 150, 'Trop loin');
    const r = plan({
      distanceM: 700_000, bornes: [trop], imposees: [cleBorne(trop)],
    });
    expect(r.faisable).toBe(false);
    expect(r.motif).toContain('Trop loin');
    expect(r.motif).toMatch(/hors de portée/i);
  });

  /* UN ARRÊT IMPOSÉ SUR UN TRAJET QU'ON POUVAIT FAIRE D'UNE TRAITE reste un
     arrêt : l'usager a demandé à s'y arrêter, pas demandé un conseil. */
  test('un arrêt imposé s’impose même quand aucun arrêt n’était nécessaire', () => {
    const halte = borne(100, 150, 'La halte');
    const r = plan({
      distanceM: 200_000, bornes: [halte], imposees: [cleBorne(halte)],
    });
    expect(r.faisable).toBe(true);
    expect(r.arrets.map((a) => a.borne.nom)).toEqual(['La halte']);
    // Et il est inscrit pour ce qu'il est : une pause, pas une charge.
    expect(r.arrets[0]?.energieKwh).toBe(0);
    expect(r.arrets[0]?.dureeMin).toBe(0);
    expect(r.dureeRechargeMin).toBe(0);
  });
});

describe('cleBorne', () => {
  test('l’identifiant d’itinérance prime, quand il existe', () => {
    expect(cleBorne({ ...borne(10, 50), id: 'FRXXXP1' })).toBe('FRXXXP1');
  });

  /* LE NOM NE PEUT PAS SERVIR DE CLÉ : « Lidl » désigne des centaines de
     stations, et en imposer une les imposerait toutes. */
  test('à défaut, la position — jamais le nom', () => {
    const a = cleBorne({ ...borne(10, 50), nom: 'Lidl' });
    const b = cleBorne({ ...borne(20, 50), nom: 'Lidl' });
    expect(a).not.toBe(b);
  });
});

/* LE PLAFOND DE CHARGE — la demande d'Armelin du 27/08/2026 : « spécifier à
   combien de pourcentage de recharge maximale on souhaite partir de la borne.
   Par exemple, filtré à 80 % maximum. » C'est un plafond DUR : il peut ajouter
   des arrêts, et il peut rendre un trajet infaisable — auquel cas le refus
   nomme le réglage plutôt que de laisser chercher. */
describe('le plafond de charge de l’usager', () => {
  test('sans plafond, rien ne change : on charge ce qu’il faut', () => {
    /* Le même trajet que « il MONTE au-delà quand le dernier tronçon
       l'exige » : l'absence de plafond doit reproduire le comportement
       historique à l'identique. */
    const r = plan({ distanceM: 500_000, bornes: [borne(250, 150)] });
    expect(r.faisable).toBe(true);
    expect(r.arrets[0]!.socDepart).toBeGreaterThan(80);
  });

  test('un plafond à 80 tronque la charge… et le plan ajoute un arrêt', () => {
    /* 500 km, borne à 250 : sans plafond, un seul arrêt chargé à ~99 %. Avec
       un plafond à 80, la borne de 250 ne suffit plus (80 % font 224 km, il
       en reste 250 plus la cible) : le plan doit prendre AUSSI la borne
       suivante au lieu de mentir sur le premier départ. */
    const bornes = [borne(250, 150), borne(400, 150)];
    const sans = plan({ distanceM: 500_000, bornes });
    expect(sans.arrets).toHaveLength(1);

    const avec = plan({ distanceM: 500_000, bornes, plafondCharge: 80 });
    expect(avec.faisable).toBe(true);
    for (const a of avec.arrets) {
      expect(a.socDepart, 'aucun départ ne dépasse le plafond').toBeLessThanOrEqual(80);
    }
    expect(avec.arrets.length).toBeGreaterThan(sans.arrets.length);
  });

  test('arriver AU-DESSUS du plafond n’oblige pas à vidanger', () => {
    /* Un arrêt imposé tôt : on y arrive à ~89 %. Le plafond à 80 ne doit pas
       faire « repartir » plus bas qu'on est arrivé. */
    const halte = borne(30, 150, 'La halte');
    const r = plan({
      distanceM: 200_000, bornes: [halte],
      imposees: [cleBorne(halte)], plafondCharge: 80,
    });
    expect(r.faisable).toBe(true);
    expect(r.arrets[0]!.socDepart).toBeCloseTo(r.arrets[0]!.socArrivee, 5);
  });

  test('quand le plafond rend le trajet infaisable, le refus le NOMME', () => {
    /* Une seule borne à 250 km d'un trajet de 500 : à 80 % de départ, les
       250 km restants (89 % de batterie) ne passent pas, et aucune autre
       borne n'existe. Le refus doit désigner le remède. */
    const r = plan({ distanceM: 500_000, bornes: [borne(250, 150)], plafondCharge: 80 });
    expect(r.faisable).toBe(false);
    expect(r.motif).toContain('plafond de charge');
  });

  test('un plafond absurde est ramené dans la fourchette raisonnable', () => {
    // 5 % de plafond interdirait tout tronçon : borné à 50, le plan vit.
    const bornes = [borne(100, 150), borne(200, 150), borne(300, 150), borne(400, 150)];
    const r = plan({ distanceM: 450_000, bornes, plafondCharge: 5 });
    expect(r.faisable).toBe(true);
    for (const a of r.arrets) expect(a.socDepart).toBeLessThanOrEqual(50);
  });
});

/* LES CONDITIONS DU TRAJET (28/08) — l'hiver, la canicule, le col et la
   vitesse entrent dans le plan. Le VF8 d'Armelin sert encore de cas d'école :
   « 60 kW à chaud, 30 kW sous 0 °C » (relevé du 28/08). */
describe('les conditions changent le plan — et leur absence ne change RIEN', () => {
  const VF8_THERMIQUE = { puissanceFroidKw: 30, puissanceChaudKw: 60, masseKg: 2500 };

  test('sans conditions : exactement le plan d’avant (régression impossible)', () => {
    const avant = plan({ distanceM: 500_000, bornes: [borne(250, 150)] });
    const avec = plan({ distanceM: 500_000, bornes: [borne(250, 150)], conditions: {}, profilConditions: {} });
    expect(avec).toEqual({ ...avant, conditionsAppliquees: avec.conditionsAppliquees });
    expect(avec.conditionsAppliquees?.consommationKwh100).toBeCloseTo(29.4, 5);
    expect(avec.conditionsAppliquees?.plafondThermiqueKw).toBeNull();
  });

  test('sous 0 °C, la charge est bridée à 30 kW : les MÊMES bornes, bien plus long', () => {
    /* Les bornes à 180 et 330 km restent à portée d'hiver (202 km à 90 %) :
       on compare le TEMPS, pas la faisabilité. */
    const bornes = [borne(180, 150), borne(330, 150)];
    const doux = plan({ distanceM: 450_000, bornes });
    const gel = plan({
      distanceM: 450_000, bornes,
      conditions: { tempDepartC: -2, tempArriveeC: 1 },
      profilConditions: VF8_THERMIQUE,
    });
    expect(doux.faisable).toBe(true);
    expect(gel.faisable).toBe(true);
    // Bride 150 → 30 kW ET surconsommation de 25 % : plus d'énergie, moins vite.
    expect(gel.dureeRechargeMin).toBeGreaterThan(doux.dureeRechargeMin * 4);
    expect(gel.conditionsAppliquees?.plafondThermiqueKw).toBe(30);
    // Convention des anneaux : +1,2 %/°C sous 20 — à −2 °C, ×1,264.
    expect(gel.conditionsAppliquees?.facteurTemperature).toBeCloseTo(1.264, 5);
  });

  test('l’hiver RACCOURCIT la portée : un trajet qui passait demande un arrêt', () => {
    // 250 km : passe à 20 °C (portée 280 km)… mais pas à −5 °C (portée ÷ 1,25).
    const doux = plan({ distanceM: 250_000, bornes: [borne(120, 150)] });
    const gel = plan({
      distanceM: 250_000, bornes: [borne(120, 150)],
      conditions: { tempDepartC: -5 },
    });
    expect(doux.arrets).toHaveLength(0);
    expect(gel.faisable).toBe(true);
    expect(gel.arrets, 'l’hiver aurait dû imposer un arrêt').toHaveLength(1);
  });

  test('le col compte en kilowattheures : D+ sans retour fait chuter le SOC d’arrivée', () => {
    const plat = plan({ distanceM: 200_000, bornes: [] });
    const col = plan({
      distanceM: 200_000, bornes: [],
      conditions: { monteeM: 1500, descenteM: 200 },
      profilConditions: { masseKg: 2500 },
    });
    // ≈ 12,7 kWh de plus sur 82,44 : environ 14 points de SOC.
    expect(plat.socArrivee - col.socArrivee).toBeGreaterThan(12);
    expect(plat.socArrivee - col.socArrivee).toBeLessThan(17);
  });

  test('une moyenne de nationale ALLONGE la portée — la vitesse du moteur IGN parle', () => {
    // 350 km d'une traite : impossible à 130 de moyenne, possible à 85.
    const autoroute = plan({ distanceM: 350_000, bornes: [] });
    const nationale = plan({
      distanceM: 350_000, bornes: [],
      conditions: { vitesseMoyenneKmh: 85 },
    });
    expect(autoroute.faisable).toBe(false);
    expect(nationale.faisable).toBe(true);
  });

  test('en canicule, une borne 350 kW ne vaut plus mieux qu’une 60 : le choix suit le BMS', () => {
    /* Deux bornes côte à côte : la 350 kW un peu plus loin gagnerait par
       temps doux ; bridée à 60, son avantage disparaît et la plus proche
       (moins de détour) l'emporte. */
    /* À 210 km : encore à portée d'été (la canicule coûte AUSSI +12 % de
       consommation — 225 km de portée, pas 252). */
    const bornes = [
      { ...borne(210, 60, 'Soixante'), ecartM: 100 },
      { ...borne(208, 350, 'Ultra'), ecartM: 2000 },
    ];
    const doux = plan({ distanceM: 430_000, bornes });
    const chaud = plan({
      distanceM: 430_000, bornes,
      conditions: { tempDepartC: 37 },
      profilConditions: { puissanceChaudKw: 60 },
    });
    expect(doux.arrets[0]?.borne.nom).toBe('Ultra');
    expect(chaud.arrets[0]?.borne.nom).toBe('Soixante');
  });
});
