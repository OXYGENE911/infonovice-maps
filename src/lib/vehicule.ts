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

/* LA MOTORISATION (MOTORISATION-1, 05/09). Des amis d'Armelin : « le site est
   trop axé véhicule électrique, les arrêts recharge automatiques sont
   discriminants pour les thermiques ». Absente (profils enregistrés avant),
   elle vaut « électrique » : personne ne perd son plan de recharge. */
export type Motorisation = 'electrique' | 'hybride-rechargeable' | 'thermique';

/** Lit une motorisation enregistrée — l'inconnu vaut électrique (profils d'avant). */
export function motorisationDe(v: unknown): Motorisation {
  return v === 'thermique' || v === 'hybride-rechargeable' ? v : 'electrique';
}

export interface Vehicule {
  nom: string;
  /** Électrique par défaut ; « thermique » couvre l'hybride simple, l'hybride
   *  rechargeable a les deux : batterie ET réservoir (THERMIQUE-2). */
  motorisation?: Motorisation;
  /* LE CARBURANT (THERMIQUE-2, 06/09) — ce qu'il faut pour planifier les
     pleins : lequel, combien le réservoir contient, ce que la voiture boit,
     et la jauge au départ. Zéro vaut « non déclaré ». */
  carburant?: string;
  reservoirL?: number;
  consommationL100?: number;
  jaugePourcent?: number;
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
  /* CE QUE LE VÉHICULE TIENT VRAIMENT SUR UNE SESSION, en kW (RECHARGE-1,
     02/09). Relevée par le catalogue quand elle est publiée ; absente, le
     planificateur l'estime aux deux tiers de la pointe. */
  puissanceMoyenneKw?: number;
  /** Bridage BMS de la charge DC quand l'air est sous 0 °C, en kW. */
  puissanceFroidKw?: number;
  /** Bridage BMS de la charge DC en canicule (air ≥ 35 °C), en kW. */
  puissanceChaudKw?: number;
  /* DEUX-ROUES (MOTO-1, 02/09). Armelin : « ajouter un mode Moto avec
     l'interfile ». Ce champ ne change ni le tracé — le moteur public n'a pas
     de profil moto — ni l'heure d'arrivée. Il ALLUME l'annonce des sections
     où la remontée d'interfile est permise, avec ses conditions. */
  moto?: boolean;
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

/**
 * Ce qui SÉPARE l'autonomie affichée de l'autonomie saisie — PURE.
 *
 * LE DÉFAUT DU 31/08. Armelin : « dans le menu de la voiture, l'autonomie du
 * rayon d'action affiché ne correspond pas à l'autonomie configurée dans les
 * paramètres du véhicule. » Il avait saisi 480 km en ville et lisait 384.
 *
 * LE CHIFFRE ÉTAIT JUSTE : 480 × 80 % de charge = 384. Mais il s'affichait
 * sous un titre « autonomie constatée à PLEINE CHARGE », sans que rien ne
 * dise qu'on répondait à la charge COURANTE. Un chiffre juste et inexplicable
 * ne se distingue pas d'un chiffre faux — c'est même pire, parce qu'il fait
 * douter de tout le reste.
 *
 * Cette fonction rend les deux facteurs pour que l'interface les NOMME.
 */
export function facteursDAffichage(v: Vehicule): { soc: number; sante: number } {
  return { soc: borner(v.soc, 100), sante: borner(v.soce, 100) };
}

/** L'énergie effectivement embarquée à l'instant, en kWh. */
export function energieDisponible(v: Vehicule): number {
  return capaciteReelle(v) * (borner(v.soc, 100) / 100);
}

/* LA RÉSERVE QU'ON N'ENTAME PAS (RAYON-2, 02/09).
 *
 * LE DÉFAUT. Le cercle d'action supposait qu'on roule jusqu'à ZÉRO POUR CENT.
 * Personne ne le fait, et le planificateur ne le fait pas non plus : son
 * réglage « réserve » vaut 10 % par défaut, et il refuse tout plan qui
 * l'entame. Les deux moitiés de l'application disaient donc deux choses
 * différentes sur la même voiture — le plan s'arrêtait à 10 %, le cercle
 * promettait les kilomètres des dix derniers pourcents.
 *
 * DIX POUR CENT, PARCE QUE C'EST DÉJÀ LE CHIFFRE DU PLAN : la cohérence
 * vaut mieux qu'une seconde valeur à défendre. */
export const RESERVE_ANNEAUX = 10;

/**
 * L'énergie qu'on accepte VRAIMENT de dépenser — PURE.
 *
 * @param reserve part de batterie qu'on refuse d'entamer, en %.
 */
export function energieUtilisable(v: Vehicule, reserve = RESERVE_ANNEAUX): number {
  const soc = borner(v.soc, 100);
  const utile = Math.max(soc - borner(reserve, 100), 0);
  return capaciteReelle(v) * (utile / 100);
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
export function autonomies(
  v: Vehicule, celsius = TEMPERATURE_REFERENCE, reserve = 0,
): Autonomies {
  /* LA RÉSERVE EST NULLE PAR DÉFAUT, et ce n'est pas une négligence : le
     bilan chiffré du panneau répond à « combien contient ma batterie »,
     tandis que le CERCLE répond à « jusqu'où puis-je aller » — deux questions
     dont une seule garde une marge. L'appelant tranche. */
  const energie = reserve > 0 ? energieUtilisable(v, reserve) : energieDisponible(v);
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

/**
 * La masse déclarée dans le profil, en kg — PURE, et `null` si absente.
 *
 * ELLE SE LIT SEULE (PONT-1, 02/09), et c'est le correctif d'un premier jet :
 * je la prenais dans le profil complet du planificateur, qui rend `null` tant
 * que la BATTERIE et la CONSOMMATION ne sont pas renseignées. Or on peut
 * parfaitement connaître le poids de sa voiture sans avoir saisi le reste — et
 * l'avertissement de tonnage n'a besoin que de ce chiffre-là. Attrapé par un
 * parcours, pas au volant.
 */
export function estUneMoto(memoire: unknown): boolean {
  const m = (memoire ?? {}) as Record<string, unknown>;
  const brut = (m['vehicule'] ?? {}) as Record<string, unknown>;
  return brut['moto'] === true;
}

/* LE MODE MOTO SE LIT SEUL, comme la masse. Passer par le profil complet
   demanderait une batterie et une consommation renseignées, et une moto
   thermique n'en a pas — l'usager qui coche « je roule en deux-roues »
   n'aurait alors rien vu paraître. */
/**
 * Le véhicule enregistré roule-t-il au carburant ? Un lecteur unique pour le
 * planificateur (aucun plan de recharge), le panneau du véhicule et le
 * bandeau : un profil d'avant MOTORISATION-1, sans le champ, reste électrique.
 */
export function estThermique(memoire: unknown): boolean {
  const m = (memoire ?? {}) as Record<string, unknown>;
  const brut = (m['vehicule'] ?? {}) as Record<string, unknown>;
  /* L'HYBRIDE RECHARGEABLE ROULE AU CARBURANT SUR LA ROUTE (THERMIQUE-2) :
     sa batterie fait la ville, pas le Paris–Lyon. Aucun arrêt de recharge
     ne lui est imposé ; ses pleins se planifient comme ceux d'un thermique. */
  return brut['motorisation'] === 'thermique' || brut['motorisation'] === 'hybride-rechargeable';
}

export function masseDeclaree(memoire: unknown): number | null {
  const m = (memoire ?? {}) as Record<string, unknown>;
  const brut = (m['vehicule'] ?? {}) as Record<string, unknown>;
  const v = brut['masseKg'];
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;
}
