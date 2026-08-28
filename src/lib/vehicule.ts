/* MODÈLE DE VÉHICULE ÉLECTRIQUE — calcul pur, aucune API, aucun réseau.
 *
 * L'autonomie d'une voiture se calcule ; la demander à un service serait
 * envoyer dehors ce qui n'a aucune raison de sortir. Tout ce fichier tourne
 * dans le navigateur, sur des données que l'usager a saisies et qui restent
 * chez lui — c'est la contrainte 4 du projet appliquée à la lettre.
 *
 * CE QUE CE MODÈLE NE SAIT PAS, et qu'il ne faut pas lui faire dire :
 * ni le relief, ni le vent, ni le style de conduite, ni la charge du véhicule.
 * Il répond « au mieux, à plat, par ce temps ». L'interface doit le dire aussi
 * franchement que ce commentaire.
 */

/** Les trois régimes de conduite, du plus économe au plus gourmand. */
export type CleContexte = 'ville' | 'route' | 'autoroute';

export const CONTEXTES: readonly {
  cle: CleContexte; libelle: string; detail: string; couleur: string;
}[] = [
  { cle: 'ville', libelle: 'En ville', detail: 'trafic urbain, récupération au freinage',
    couleur: '#1E9E5A' },
  { cle: 'route', libelle: 'Sur route', detail: 'départementales et nationales, ~80 km/h',
    couleur: '#C98A16' },
  { cle: 'autoroute', libelle: 'Sur autoroute', detail: '130 km/h, la traînée aérodynamique domine',
    couleur: '#C0392B' },
] as const;

export type Consommations = Record<CleContexte, number>;

export interface Vehicule {
  nom: string;
  /** Capacité BRUTE annoncée par le constructeur, en kWh. */
  capaciteNominale: number;
  /** State of Charge Energy : la santé de la batterie, en % de sa capacité d'origine. */
  soce: number;
  /** State of Charge : la charge actuelle, en %. */
  soc: number;
  /** kWh pour 100 km, par régime. */
  consommations: Consommations;
  /* CE QUE LE VÉHICULE ACCEPTE EN POINTE, en kW. Une borne plus rapide n'y
     change rien : brancher une VF8 sur 350 kW ne charge pas plus vite que sur
     150. Sans ce chiffre, un planificateur promet des temps de charge qu'aucun
     véhicule ne tient. */
  puissanceMaxKw: number;
  /* CE QUE LE VÉHICULE SAIT DE SES CONDITIONS (28/08) — tout optionnel, zéro
     vaut « non déclaré » : le plan reste alors celui d'avant. */
  /** Masse en ordre de marche, kg — pour l'énergie du dénivelé. */
  masseKg?: number;
  /** Bridage BMS de la charge DC quand l'air est sous 0 °C, en kW. */
  puissanceFroidKw?: number;
  /** Bridage BMS de la charge DC en canicule (air ≥ 35 °C), en kW. */
  puissanceChaudKw?: number;
}

/** Ramène une valeur dans [0, max] — les saisies humaines sont une frontière système. */
const borner = (v: number, max: number): number =>
  (Number.isFinite(v) ? Math.min(Math.max(v, 0), max) : 0);

/** La capacité qui reste RÉELLEMENT, une fois la dégradation prise en compte. */
export function capaciteReelle(v: Vehicule): number {
  const nominale = Number.isFinite(v.capaciteNominale) && v.capaciteNominale > 0
    ? v.capaciteNominale : 0;
  return nominale * (borner(v.soce, 100) / 100);
}

/** L'énergie effectivement embarquée à l'instant, en kWh. */
export function energieDisponible(v: Vehicule): number {
  return capaciteReelle(v) * (borner(v.soc, 100) / 100);
}

/* L'EFFET DE LA TEMPÉRATURE, en surcoût de consommation.
 *
 * Un véhicule électrique paie le froid deux fois : la chimie de la batterie
 * rend moins, et l'habitacle se chauffe par résistance — là où un thermique
 * chauffe avec ses pertes moteur, gratuitement. La chaleur coûte aussi, mais
 * moins : la climatisation est une pompe à chaleur, plus efficace qu'une
 * résistance.
 *
 * LES COEFFICIENTS SONT UN ORDRE DE GRANDEUR, PAS UNE MESURE. Ils viennent de
 * la forme communément observée sur ce type de véhicule ; ils n'ont pas été
 * relevés sur la VF8 d'Armelin. Un modèle honnête dit d'où il tient ses
 * chiffres — celui-ci les tient d'une convention, et l'interface ne doit pas
 * les présenter comme une prédiction.
 */
const TEMPERATURE_REFERENCE = 20;

export function facteurTemperature(celsius: number): number {
  if (!Number.isFinite(celsius)) return 1;
  const ecart = celsius - TEMPERATURE_REFERENCE;
  // Le froid : environ +1,2 % de consommation par degré sous la référence.
  if (ecart < 0) return 1 + Math.min(-ecart * 0.012, 0.45);
  // Le chaud : environ +0,5 % par degré au-dessus, plafonné.
  return 1 + Math.min(ecart * 0.005, 0.20);
}

export type Autonomies = Record<CleContexte, number>;

/**
 * Les trois autonomies, en kilomètres.
 * @param celsius température extérieure ; omise, on suppose la référence.
 */
export function autonomies(v: Vehicule, celsius = TEMPERATURE_REFERENCE): Autonomies {
  const energie = energieDisponible(v);
  const facteur = facteurTemperature(celsius);
  const rendu = {} as Autonomies;
  for (const { cle } of CONTEXTES) {
    const conso = v.consommations[cle];
    // Une consommation nulle donnerait une autonomie infinie : on rend 0,
    // qui se lit « je ne sais pas » plutôt que « vous pouvez rouler toujours ».
    rendu[cle] = Number.isFinite(conso) && conso > 0
      ? (energie / (conso * facteur)) * 100
      : 0;
  }
  return rendu;
}

/**
 * Déduit les consommations depuis des essais réels — la façon honnête de
 * régler le modèle. Un usager sait combien de kilomètres il fait avec une
 * charge ; il ne sait pas ses kWh/100 km.
 */
export function consommationsDepuisEssais(
  energieUtilisable: number, distances: Partial<Record<CleContexte, number>>,
): Consommations {
  const rendu = {} as Consommations;
  for (const { cle } of CONTEXTES) {
    const km = distances[cle];
    // Une distance absurde ne doit pas produire une consommation infinie :
    // sans ce garde-fou, un zéro saisi par erreur rendait l'autonomie
    // infinie — donc un anneau qui couvre l'Europe.
    rendu[cle] = Number.isFinite(km) && (km as number) > 0
      ? (energieUtilisable / (km as number)) * 100
      : 0;
  }
  return rendu;
}
