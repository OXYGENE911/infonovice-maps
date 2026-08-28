/* LES CONDITIONS DU TRAJET — la demande d'Armelin du 28/08 : le plan de
 * recharge doit sentir la température, le relief et la vitesse du parcours,
 * et savoir qu'un BMS bride la charge quand la batterie est trop froide ou
 * trop chaude (« sur mon VF8, 60 kW à 43 °C de batterie, 30 kW à 45 °C ;
 * sous 0 °C je ne dépasse pas 30 kW »).
 *
 * TOUT EST PUR ET TESTÉ À SEC. Les facteurs sont des ORDRES DE GRANDEUR
 * assumés, écrits ici et redits dans « Pourquoi ce plan ? » : la vraie
 * consommation dépend du vent, de la pluie, du style de conduite et de la
 * charge du véhicule — qu'aucune source ne donne. Mieux vaut un modèle
 * simple qui dit ses hypothèses qu'une précision de façade.
 *
 * LA LIMITE LA PLUS HONNÊTE EST DITE PARTOUT OÙ ELLE COMPTE : nous ne
 * connaissons que la température de l'AIR (Open-Meteo), jamais celle de la
 * batterie. Le bridage thermique est donc une estimation PRUDENTE : par
 * grand froid ou canicule, on suppose la batterie affectée — un plan
 * pessimiste de dix minutes vaut mieux qu'une panne d'optimisme au péage.
 */

import { facteurTemperature as facteurTemperatureVehicule } from './vehicule';

export interface ConditionsTrajet {
  /** Température de l'air au départ, à l'heure du départ (°C). */
  tempDepartC?: number | undefined;
  /** Température de l'air à l'arrivée, à l'heure d'arrivée estimée (°C). */
  tempArriveeC?: number | undefined;
  /** Dénivelé positif cumulé le long du tracé, en mètres. */
  monteeM?: number | undefined;
  /** Dénivelé négatif cumulé, en mètres (valeur positive). */
  descenteM?: number | undefined;
  /** Vitesse moyenne du parcours (distance/durée du moteur IGN), en km/h —
      elle PORTE les limites de vitesse : c'est le graphe routier qui l'a
      calculée tronçon par tronçon. */
  vitesseMoyenneKmh?: number | undefined;
}

/** Ce que le véhicule sait de lui-même face aux conditions. Tout optionnel :
    absent, le modèle reste celui d'avant — à plat, à 20 °C. */
export interface ProfilConditions {
  /** Masse en ordre de marche, kg. Absente : 2 000 kg, et on le dit. */
  masseKg?: number | undefined;
  /** Plafond de charge DC quand l'air est sous 0 °C (bridage BMS à froid). */
  puissanceFroidKw?: number | undefined;
  /** Plafond de charge DC en canicule (air ≥ 35 °C) — bridage BMS à chaud. */
  puissanceChaudKw?: number | undefined;
}

export const MASSE_DEFAUT_KG = 2000;

/** La vitesse de référence de la consommation « Sur autoroute » du profil. */
export const VITESSE_REFERENCE_KMH = 130;

/** Le seuil de canicule retenu — l'air, faute de mieux. */
export const SEUIL_CANICULE_C = 35;

/**
 * Facteur de consommation lié à la vitesse moyenne du parcours.
 *
 * LA TRAÎNÉE CROÎT EN v² et domine sur route ; le roulement, constant,
 * amortit la chute à basse vitesse — d'où le socle de 0,35. Borné à
 * [0,6 ; 1,15] : en ville, l'arrêt-redémarrage mange ce que la lenteur
 * rend, et le modèle ne doit pas promettre une autonomie doublée.
 */
export function facteurVitesse(vitesseKmh: number | undefined): number {
  if (vitesseKmh === undefined || !Number.isFinite(vitesseKmh) || vitesseKmh <= 0) return 1;
  const brut = 0.35 + 0.65 * (vitesseKmh / VITESSE_REFERENCE_KMH) ** 2;
  return Math.min(Math.max(brut, 0.6), 1.15);
}

/**
 * Facteur de consommation lié à la température de l'air.
 *
 * LA CONVENTION EST CELLE DES ANNEAUX D'AUTONOMIE (lib/vehicule.ts) : +1,2 %
 * par degré sous 20 °C, +0,5 % par degré au-dessus, plafonnés — DEUX modèles
 * de température dans la même application diraient deux autonomies pour le
 * même trajet. On retient la température LA PLUS DÉFAVORABLE du départ et de
 * l'arrivée : le trajet traverse les deux.
 */
export function facteurTemperature(
  tempDepartC: number | undefined, tempArriveeC: number | undefined,
): number {
  const temps = [tempDepartC, tempArriveeC]
    .filter((t): t is number => typeof t === 'number' && Number.isFinite(t));
  if (temps.length === 0) return 1;
  return Math.max(...temps.map(facteurTemperatureVehicule));
}

/**
 * Énergie NETTE du dénivelé sur le trajet, en kWh.
 *
 * De la physique, pas un facteur : monter coûte m·g·h (rendement traction
 * 85 %), descendre en rend une partie (récupération 60 % — le reste part en
 * frein et en pente trop douce pour régénérer). Peut être NÉGATIVE sur un
 * trajet qui descend : la montagne rend alors de l'autonomie, et c'est vrai.
 */
export function energieDeniveleKwh(
  monteeM: number | undefined, descenteM: number | undefined, masseKg: number | undefined,
): number {
  const masse = masseKg && Number.isFinite(masseKg) && masseKg > 0 ? masseKg : MASSE_DEFAUT_KG;
  const g = 9.81;
  const versKwh = 1 / 3_600_000;
  const montee = monteeM && monteeM > 0 ? monteeM : 0;
  const descente = descenteM && descenteM > 0 ? descenteM : 0;
  return (masse * g * montee * versKwh) / 0.85 - masse * g * descente * versKwh * 0.6;
}

/**
 * La consommation AJUSTÉE aux conditions, en kWh/100 km.
 *
 * Vitesse et température MULTIPLIENT la consommation de référence ; le
 * dénivelé s'AJOUTE en énergie répartie sur la distance — un col ne coûte
 * pas un pourcentage, il coûte des kilowattheures.
 */
export function consommationAjustee(
  referenceKwh100: number, distanceM: number,
  conditions: ConditionsTrajet, profil: ProfilConditions,
): number {
  const base = referenceKwh100
    * facteurVitesse(conditions.vitesseMoyenneKmh)
    * facteurTemperature(conditions.tempDepartC, conditions.tempArriveeC);
  if (!(distanceM > 0)) return base;
  const denivele = energieDeniveleKwh(conditions.monteeM, conditions.descenteM, profil.masseKg);
  // Jamais négative : au pire, un trajet tout en descente coûte « presque rien ».
  return Math.max(base + (denivele / (distanceM / 1000)) * 100, referenceKwh100 * 0.3);
}

/**
 * Le plafond de puissance de charge imposé par la température, ou null.
 *
 * L'AIR, PAS LA BATTERIE — on ne sait pas mieux d'ici, et on le dit : sous
 * 0 °C on applique le bridage à froid déclaré par le véhicule, à partir de
 * 35 °C le bridage canicule. La température la plus défavorable des deux
 * bouts du trajet décide : les arrêts sont entre les deux.
 */
export function plafondThermiqueKw(
  tempDepartC: number | undefined, tempArriveeC: number | undefined,
  profil: ProfilConditions,
): number | null {
  const temps = [tempDepartC, tempArriveeC]
    .filter((t): t is number => typeof t === 'number' && Number.isFinite(t));
  if (temps.length === 0) return null;
  const plafonds: number[] = [];
  if (Math.min(...temps) <= 0 && profil.puissanceFroidKw && profil.puissanceFroidKw > 0) {
    plafonds.push(profil.puissanceFroidKw);
  }
  if (Math.max(...temps) >= SEUIL_CANICULE_C && profil.puissanceChaudKw && profil.puissanceChaudKw > 0) {
    plafonds.push(profil.puissanceChaudKw);
  }
  return plafonds.length > 0 ? Math.min(...plafonds) : null;
}
