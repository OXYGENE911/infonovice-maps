/* SUGGESTION DES ARRÊTS DE RECHARGE — le cœur d'un planificateur électrique.
 *
 * La question n'est pas « où sont les bornes » (la PR #9 y répond) mais
 * « lesquelles dois-je prendre, avec combien de batterie j'y arrive, et
 * combien de temps j'y reste ». Tout est calculé LOCALEMENT, sur le tracé et
 * le profil du véhicule : aucun service ne sait où va l'usager.
 *
 * CE QUE CE MODÈLE NE SAIT PAS, et qu'il ne faut pas lui faire dire : ni le
 * relief, ni le vent, ni le trafic, ni la courbe de charge réelle du véhicule,
 * qui dépend de la température de la batterie. Il répond « à plat, à
 * consommation constante ». L'interface doit le dire aussi franchement.
 *
 * ET LE SERVICE LE PLUS UTILE EST PARFOIS DE DIRE NON, TÔT, AVEC LE MOTIF.
 * Un plan bancal qui laisse découvrir le trou à 8 % de batterie est pire que
 * l'aveu qu'aucune borne n'est à portée au kilomètre 250.
 */

import {
  consommationAjustee, plafondThermiqueKw, facteurVitesse, facteurTemperature,
  energieDeniveleKwh, type ConditionsTrajet, type ProfilConditions,
} from './conditions';

export interface BorneCandidate {
  nom: string;
  lon: number;
  lat: number;
  /** Enseigne du réseau, quand elle est connue — affichée dans le plan. */
  reseau?: string | null | undefined;
  /** Identifiant d'itinérance, pour ouvrir le cartouche de détail. */
  id?: string | null | undefined;
  /** Distance depuis le départ, LE LONG du trajet, en mètres. */
  avancementM: number;
  /** Écart au tracé, en mètres — l'aller simple du détour. */
  ecartM: number;
  /** Puissance nominale, en kW. `null` quand le producteur ne l'a pas déclarée. */
  puissanceKw: number | null;
}

export interface Vehicule {
  /** Capacité RÉELLE, dégradation comprise (voir lib/vehicule.ts). */
  capaciteKwh: number;
  /** Consommation de référence sur ce trajet, en kWh/100 km. */
  consommationKwh100: number;
  /** Ce que le véhicule accepte en pointe. Une borne plus rapide n'y change rien. */
  puissanceMaxKw: number;
  /* CE QU'IL TIENT VRAIMENT SUR UNE SESSION, en kW (RECHARGE-1, 02/09).
     Absent : le modèle ci-dessous l'estime depuis la pointe. */
  puissanceMoyenneKw?: number;
}

export interface OptionsPlan {
  vehicule: Vehicule;
  distanceM: number;
  bornes: BorneCandidate[];
  /** État de charge au départ, en %. */
  socDepart: number;
  /** État de charge VOULU à destination, en %. */
  socArrivee: number;
  /** Marge que l'on refuse d'entamer, en %. On arrive à une borne AVEC. */
  reserve: number;
  /* LE PLAFOND DE CHARGE — la demande d'Armelin du 27/08/2026 : « spécifier à
     combien de pourcentage de recharge maximale on souhaite partir de la
     borne. Par exemple, filtré à 80 % maximum. » Au-dessus de 80 %, la charge
     ralentit fortement ; certains préfèrent DEUX arrêts courts à un long.
     ABSENT OU À 100, ON CHARGE CE QU'IL FAUT — le comportement historique.
     C'est un plafond DUR : le respecter peut ajouter des arrêts, et peut
     rendre un trajet infaisable — auquel cas le refus le dit, avec le remède. */
  plafondCharge?: number | undefined;
  /* CE QUE L'USAGER IMPOSE AU PLANIFICATEUR — sa demande du 25/08/2026 :
     « avec des + et des - pour choisir moi-même les arrêts ». Deux listes de
     clés (voir `cleBorne`) : celles où l'on VEUT s'arrêter, et celles dont on
     ne veut à aucun prix. Un planificateur qui décide seul est un
     planificateur qu'on subit. */
  imposees?: readonly string[] | undefined;
  ecartees?: readonly string[] | undefined;
  /* LES CONDITIONS DU TRAJET (28/08) : température aux deux bouts, dénivelé,
     vitesse moyenne du parcours — et ce que le véhicule sait de son propre
     bridage thermique. TOUT est optionnel : absent, le modèle reste celui
     d'avant — à plat, à 20 °C, sans bridage. */
  conditions?: ConditionsTrajet | undefined;
  profilConditions?: ProfilConditions | undefined;
  /* LES PAUSES HUMAINES (décision d'Armelin du 28/08). Chacune optionnelle,
     absente = le plan d'avant. */
  /** Chaque arrêt dure AU MOINS ce temps — et la pause PAIE la charge :
      on remplit ce que le temps permet, plafond respecté. */
  pauseMinimaleMin?: number | undefined;
  /** Distance maximale entre deux arrêts, en mètres — « une pause toutes
      les deux heures » convertie par l'appelant à la vitesse du trajet. */
  intervalleMaxM?: number | undefined;
  /** Par clé de borne : la distance (m) du plus proche agrément du profil
      choisi (aire de jeux, espace vert, restauration) — un BONUS au choix,
      jamais un filtre. */
  agrements?: ReadonlyMap<string, number> | undefined;
}

/**
 * La clé d'une borne, pour la désigner d'une liste à l'autre.
 *
 * L'IDENTIFIANT D'ITINÉRANCE QUAND IL EXISTE, LA POSITION SINON. Le nom seul
 * ne peut pas servir : « Lidl » désigne des centaines de stations, et imposer
 * l'une les imposerait toutes.
 */
export function cleBorne(b: Pick<BorneCandidate, 'id' | 'lon' | 'lat'>): string {
  return b.id ?? `${b.lon.toFixed(5)},${b.lat.toFixed(5)}`;
}

export interface Arret {
  borne: BorneCandidate;
  /** Distance du plus proche agrément du profil de pause, si trouvé. */
  agrementM?: number;
  /** SOC en arrivant à la borne, en %. */
  socArrivee: number;
  /** SOC en repartant, en %. */
  socDepart: number;
  energieKwh: number;
  dureeMin: number;
}

export interface PlanRecharge {
  faisable: boolean;
  arrets: Arret[];
  /** SOC à destination, en %. Zéro quand le plan échoue. */
  socArrivee: number;
  dureeRechargeMin: number;
  /** Pourquoi le plan échoue — jamais vide quand `faisable` est faux. */
  motif?: string;
  /** Ce que les conditions ont RÉELLEMENT changé — « Pourquoi ce plan ? »
      l'énonce, jamais un chiffre sorti de nulle part. */
  conditionsAppliquees?: {
    consommationKwh100: number;
    facteurVitesse: number;
    facteurTemperature: number;
    deniveleKwh: number;
    plafondThermiqueKw: number | null;
  };
}

/* AU-DELÀ DE 80 %, LA CHARGE RALENTIT FORTEMENT : le véhicule bride pour
   protéger la batterie. Ce seuil-là est PHYSIQUE — il gouverne la courbe de
   durée ci-dessous et ne se règle pas. Le plafond que l'usager choisit
   (`plafondCharge`) est une autre chose : jusqu'où il ACCEPTE de remplir.

   L'ANCIEN « PLAFOND DE CONFORT » À 80 % ÉTAIT MORT, et la mesure le montre :
   le plan chargeait toujours exactement ce qu'il faut (socVoulu), et sa clause
   d'échappement relevait la borne à 100 dès que le besoin dépassait 80. Aucune
   valeur ne se trouvait donc jamais tronquée. Le réglage d'Armelin lui donne
   un sens réel : un plafond DUR, assumé jusqu'au refus motivé. */
const SEUIL_RALENTI = 80;

/** Rendement de la charge : une part de l'énergie part en chaleur. */
const RENDEMENT = 0.9;

/* CE QU'UNE BORNE TIENT VRAIMENT (RECHARGE-1, 02/09).
 *
 * LE DÉFAUT. Le modèle calculait avec la POINTE du véhicule pendant toute la
 * session. Armelin : « il me dit 23 minutes de recharge… c'est très très
 * optimiste » et « quand 16 min de charge sont affichées, j'en fais
 * généralement 5 à 10 de plus ». Il a raison, et l'écart est exactement celui
 * qu'on peut mesurer.
 *
 * CE QUE J'AI RELEVÉ (EV Database, 02/09, huit modèles — table complète en
 * tête de catalogue-vehicules.ts) : la puissance MOYENNE d'une session de 10 à
 * 80 % vaut de 0,50 à 0,90 fois la pointe, médiane 0,63. La VF 8 d'Armelin :
 * 150 kW de pointe, 105 kW de moyenne.
 *
 * LA MOYENNE RELEVÉE PASSE D'ABORD. Elle vient du catalogue quand elle y est ;
 * sinon on applique ce facteur, qui est une ESTIMATION et non une mesure.
 *
 * DEUX TIERS, ET PAS LA MÉDIANE EXACTE : 0,63 collerait à un échantillon de
 * huit, 2/3 est le même ordre de grandeur avec un chiffre rond qu'on peut
 * expliquer. L'erreur moyenne sur les huit relevés est de 14 kW.
 *
 * PLAFOND À 130 kW, et il vient des mêmes relevés : aucune moyenne mesurée ne
 * le dépasse, pointe à 250 kW comprise. Sans lui, une borne annoncée à 400 kW
 * promettrait 267 kW soutenus, que rien ne tient aujourd'hui. */
export const PART_MOYENNE = 2 / 3;
export const PLAFOND_MOYENNE_KW = 130;

/**
 * La puissance réellement soutenue par un véhicule, en kW — PURE.
 *
 * `puissanceMoyenneKw` du catalogue si elle est connue, sinon l'estimation.
 */
export function puissanceSoutenue(v: Vehicule): number {
  if (Number.isFinite(v.puissanceMoyenneKw) && (v.puissanceMoyenneKw ?? 0) > 0) {
    return Math.min(v.puissanceMoyenneKw!, v.puissanceMaxKw);
  }
  return Math.min(v.puissanceMaxKw * PART_MOYENNE, PLAFOND_MOYENNE_KW);
}

/** Garde-fou de boucle. Vingt arrêts dépassent tout trajet français réaliste. */
const MAX_ARRETS = 20;

const borner = (v: number, min: number, max: number): number =>
  Math.min(Math.max(v, min), max);

/**
 * Durée de charge, en minutes.
 *
 * LA COURBE EST SIMPLIFIÉE, ET C'EST DIT : au-delà de 80 % on applique un
 * facteur de ralentissement moyen. La vraie courbe dépend du modèle, de la
 * température de la batterie et de l'état de la borne — la mesurer demanderait
 * les données constructeur qu'aucune source publique ne donne.
 */
export function dureeChargeMin(
  energieKwh: number, puissanceBorneKw: number | null, v: Vehicule,
  socDe: number, socA: number, plafondThermiqueKw2: number | null = null,
): number {
  /* LE BMS A LE DERNIER MOT : batterie trop froide ou trop chaude, la
     puissance réelle tombe sous ce que la borne ET le véhicule promettent
     (relevé d'Armelin sur son VF8, 28/08). */
  /* LA BORNE GARDE SA POINTE, LE VÉHICULE PREND SA MOYENNE. Ce n'est pas une
     dissymétrie de confort : la borne EST capable de sa puissance nominale
     pendant toute la session — c'est le véhicule qui décroît. Appliquer la
     décroissance à la borne compterait deux fois le même phénomène. */
  const puissance = Math.min(
    puissanceBorneKw ?? 0, puissanceSoutenue(v),
    plafondThermiqueKw2 ?? Infinity,
  );
  if (!(puissance > 0) || !(energieKwh > 0)) return 0;

  // Part de la charge effectuée au-dessus de 80 %, où le débit s'effondre.
  const hautDe = Math.max(socDe, SEUIL_RALENTI);
  const hautA = Math.max(socA, SEUIL_RALENTI);
  const partHaute = socA > socDe ? (hautA - hautDe) / (socA - socDe) : 0;
  const ralentissement = 1 + partHaute * 1.5;

  return (energieKwh / (puissance * RENDEMENT)) * 60 * ralentissement;
}

/** Énergie nécessaire pour parcourir `metres`, en kWh. */
const energiePour = (metres: number, v: Vehicule): number =>
  (metres / 1000) * (v.consommationKwh100 / 100);

/**
 * Choisit la borne la plus utile parmi celles à portée.
 *
 * ALLER LE PLUS LOIN N'EST PAS TOUJOURS LE MIEUX : s'arrêter dix kilomètres
 * plus tôt sur une borne six fois plus puissante fait gagner du temps. On note
 * donc chaque candidate sur l'avancement qu'elle offre ET sur ce qu'elle
 * coûtera en minutes.
 */
/* LE BONUS D'AGRÉMENT VAUT VINGT : le score se compte en kilomètres
   d'avance utiles, et vingt points font préférer une borne à aire de jeux à
   une borne nue jusqu'à vingt kilomètres plus loin — assez pour compter,
   jamais assez pour tordre un plan. */
const BONUS_AGREMENT = 20;

function choisir(
  candidates: BorneCandidate[], departM: number, v: Vehicule,
  plafondKw: number | null = null,
  agrements: ReadonlyMap<string, number> | undefined = undefined,
): BorneCandidate | null {
  let meilleure: BorneCandidate | null = null;
  let meilleurScore = -Infinity;

  for (const c of candidates) {
    const gainKm = (c.avancementM - departM) / 1000;
    /* Bridée par le BMS, une borne de 350 kW ne vaut pas mieux qu'une de
       60 : le score doit compter la puissance qu'on AURA, pas la promesse.
       ET C'EST LA PUISSANCE SOUTENUE (RECHARGE-1, 02/09), la même que celle
       du calcul de durée : comparer des bornes sur des pointes qu'aucune ne
       tient classerait mal celles qui les tiennent le mieux. */
    const puissance = Math.min(
      c.puissanceKw ?? 0, puissanceSoutenue(v), plafondKw ?? Infinity,
    );
    if (puissance <= 0) continue;
    // Minutes qu'il faudrait pour récupérer 40 kWh sur cette borne : un étalon
    // commun, qui rend les puissances comparables entre elles.
    const minutesEtalon = (40 / (puissance * RENDEMENT)) * 60;
    // Le détour se paie deux fois : aller ET retour.
    const detourKm = (c.ecartM * 2) / 1000;
    const bonus = agrements?.has(cleBorne(c)) ? BONUS_AGREMENT : 0;
    const score = gainKm - detourKm - minutesEtalon + bonus;
    if (score > meilleurScore) { meilleurScore = score; meilleure = c; }
  }
  return meilleure;
}

const echec = (motif: string): PlanRecharge =>
  ({ faisable: false, arrets: [], socArrivee: 0, dureeRechargeMin: 0, motif });

/** Planifie les arrêts. Aucun appel réseau : tout se calcule ici. */
/* EN DESSOUS, UN ARRÊT N'EN EST PAS UN. Armelin, le 30/08 : « j'ai parfois
   le dernier arrêt de recharge qui est indiqué pour 1 min d'arrêt, ce qui n'a
   pas de sens. Soit on charge plus longtemps à l'arrêt d'avant, soit on
   recharge plus d'une minute pour que l'arrêt soit utile. » Cinq minutes :
   sortir de l'autoroute, se brancher, repartir en coûte déjà autant. */
const DUREE_UTILE_MIN = 5;

/**
 * Le plan de recharge — et, s'il finit par un arrêt dérisoire, celui qu'on
 * obtient en s'en passant.
 *
 * POURQUOI UN SECOND PASSAGE PLUTÔT QU'UNE RETOUCHE. Le calcul est glouton :
 * à chaque borne il charge JUSTE ce qu'il faut pour atteindre le point de
 * passage suivant. Quand la dernière jambe est courte, cela donne un arrêt
 * d'une minute — exact, et absurde. Plutôt que de rafistoler la durée après
 * coup, on ÉCARTE cette borne et l'on refait le plan : privé d'elle, le
 * calcul charge davantage à l'arrêt d'avant, puisqu'il vise alors la
 * destination. Si ce second plan échoue (le plafond de charge, la batterie),
 * on garde le premier : un arrêt d'une minute vaut mieux qu'un refus.
 */
export function planifierArrets(o: OptionsPlan): PlanRecharge {
  const plan = planifierGlouton(o);
  if (!plan.faisable || plan.arrets.length < 2) return plan;
  const dernier = plan.arrets[plan.arrets.length - 1]!;
  const cleDernier = cleBorne(dernier.borne);
  const impose = new Set(o.imposees ?? []).has(cleDernier);
  // Un arrêt VOULU par l'usager n'est jamais retiré, même s'il ne charge rien.
  if (impose || dernier.dureeMin >= DUREE_UTILE_MIN) return plan;

  const sans = planifierGlouton({
    ...o, ecartees: [...(o.ecartees ?? []), cleDernier],
  });
  /* ON NE PREND LE SECOND QUE S'IL EST MEILLEUR : faisable, et pas plus
     d'arrêts. Sans cette garde, écarter une borne pourrait en imposer deux
     autres — on aurait échangé une minute contre un quart d'heure. */
  return sans.faisable && sans.arrets.length <= plan.arrets.length ? sans : plan;
}

function planifierGlouton(o: OptionsPlan): PlanRecharge {
  const { vehicule: v } = o;

  /* CE QUE L'USAGER ÉCARTE N'EXISTE PLUS POUR LE PLANIFICATEUR. On le retire
     avant tout calcul plutôt que de le sauter au moment du choix : sans quoi
     la portée annoncée dans un message d'échec parlerait de bornes qu'on
     s'est interdit d'utiliser. */
  const ecartees = new Set(o.ecartees ?? []);
  const bornes = ecartees.size === 0
    ? o.bornes
    : o.bornes.filter((b) => !ecartees.has(cleBorne(b)));

  /* LES ARRÊTS IMPOSÉS, DANS L'ORDRE DU TRAJET. L'usager peut les cocher dans
     n'importe quel ordre ; c'est la route qui décide de leur succession. */
  const imposees = new Set(o.imposees ?? []);
  const etapesImposees = bornes
    .filter((b) => imposees.has(cleBorne(b)))
    .sort((a, b) => a.avancementM - b.avancementM);

  if (!(v.capaciteKwh > 0) || !Number.isFinite(v.capaciteKwh)) {
    return echec('Renseignez la capacité de votre batterie.');
  }
  if (!(v.consommationKwh100 > 0) || !Number.isFinite(v.consommationKwh100)) {
    return echec('Renseignez votre consommation pour estimer l’autonomie.');
  }
  if (!Number.isFinite(o.distanceM) || o.distanceM < 0) {
    return echec('Trajet illisible.');
  }

  /* LE VÉHICULE AJUSTÉ AUX CONDITIONS : la consommation de référence prend
     la vitesse du parcours (multiplicatif), la température (multiplicatif)
     et le dénivelé (des kilowattheures, pas un pourcentage). Absentes, les
     conditions laissent tout intact — c'est le contrat de lib/conditions. */
  const conditions = o.conditions ?? {};
  const profilCond = o.profilConditions ?? {};
  const consoAjustee = consommationAjustee(
    v.consommationKwh100, o.distanceM, conditions, profilCond,
  );
  const plafondThermique = plafondThermiqueKw(
    conditions.tempDepartC, conditions.tempArriveeC, profilCond,
  );
  const va: Vehicule = { ...v, consommationKwh100: consoAjustee };
  const appliquees = {
    consommationKwh100: consoAjustee,
    facteurVitesse: facteurVitesse(conditions.vitesseMoyenneKmh),
    facteurTemperature: facteurTemperature(conditions.tempDepartC, conditions.tempArriveeC),
    deniveleKwh: energieDeniveleKwh(conditions.monteeM, conditions.descenteM, profilCond.masseKg),
    plafondThermiqueKw: plafondThermique,
  };

  const pauseMin = o.pauseMinimaleMin && o.pauseMinimaleMin > 0 ? o.pauseMinimaleMin : 0;
  const intervalleMax = o.intervalleMaxM && o.intervalleMaxM > 0 ? o.intervalleMaxM : null;

  const reserve = borner(o.reserve, 0, 50);
  const cible = borner(o.socArrivee, 0, 100);
  /* LE PLANCHER DU PLAFOND EST 50 : en dessous, presque aucun tronçon
     d'autoroute ne tiendrait entre deux charges, et le refus deviendrait la
     réponse normale — un réglage qui casse tout n'est pas un réglage. */
  const plafond = borner(o.plafondCharge ?? 100, 50, 100);
  let soc = borner(o.socDepart, 0, 100);
  let positionM = 0;
  const arrets: Arret[] = [];

  const socApres = (metres: number, socAvant: number): number =>
    socAvant - (energiePour(metres, va) / va.capaciteKwh) * 100;

  for (let tour = 0; tour <= MAX_ARRETS; tour += 1) {
    const restantM = o.distanceM - positionM;
    const socFin = socApres(restantM, soc);

    /* LE PROCHAIN POINT DE PASSAGE OBLIGÉ : l'arrêt imposé suivant, ou la
       destination. Ce n'est PAS un détail de confort — sans lui, on chargerait
       à chaque arrêt de quoi rallier la destination, y compris quand l'usager
       a demandé de s'arrêter trente kilomètres plus loin. Le plan ferait
       perdre des dizaines de minutes à remplir une batterie qu'on s'apprête à
       remplir de nouveau. */
    const prochaineImposee = etapesImposees.find((b) => b.avancementM > positionM);

    /* Assez pour finir en gardant la cible, et plus rien d'imposé devant ?
       L'EPSILON N'EST PAS UN DÉTAIL : chaque charge vise EXACTEMENT la cible,
       et l'arithmétique flottante rend alors un socFin à 9,999 999 999 9 pour
       une cible de 10. Sans tolérance, le plan réclamait un arrêt de plus pour
       un manque d'un billionième de pour cent — vu quand le plafond de charge
       a multiplié les arrêts calculés « au plus juste ». */
    /* L'INTERVALLE DE PAUSE BORNE AUSSI LA DERNIÈRE JAMBE : une batterie qui
       tiendrait 350 km d'une traite ne dispense pas de la pause des deux
       heures — c'est tout son sens. */
    if (socFin >= cible - 1e-9 && !prochaineImposee
      && (intervalleMax === null || restantM <= intervalleMax)) {
      const duree = arrets.reduce((t, a) => t + a.dureeMin, 0);
      return {
        faisable: true, arrets, socArrivee: socFin, dureeRechargeMin: duree,
        conditionsAppliquees: appliquees,
      };
    }

    /* IL FAUT S'ARRÊTER. Portée utile : ce qu'on peut faire SANS entamer la
       réserve — arriver à une borne à 2 % n'est pas un plan, c'est un pari. */
    const energieUtile = va.capaciteKwh * ((soc - reserve) / 100);
    const porteeBatterieM = energieUtile > 0
      ? (energieUtile / (va.consommationKwh100 / 100)) * 1000 : 0;
    const porteeM = intervalleMax === null
      ? porteeBatterieM : Math.min(porteeBatterieM, intervalleMax);

    /* UN ARRÊT IMPOSÉ À PORTÉE EST PRIS, SANS DISCUSSION. C'est le sens même
       du « + » : l'usager sait des choses que le modèle ignore — un repas, un
       détour par chez sa sœur, une borne où il a ses habitudes. */
    let choisie: BorneCandidate | null = null;
    if (prochaineImposee && prochaineImposee.avancementM <= positionM + porteeM) {
      choisie = prochaineImposee;
    } else {
      /* SINON, LA MEILLEURE À PORTÉE. Aucune borne ne peut ici dépasser
         l'arrêt imposé suivant, et ce n'est pas un hasard : on n'arrive dans
         cette branche QUE si l'arrêt imposé est hors de portée, donc au-delà
         de toutes les candidates. Une clause « ne pas dépasser l'imposée »
         serait du code mort — écrit, commenté, et jamais exécuté. */
      const aPortee = bornes.filter(
        (b) => b.avancementM > positionM && b.avancementM <= positionM + porteeM,
      );
      choisie = choisir(aPortee, positionM, va, plafondThermique, o.agrements);
    }

    if (!choisie) {
      const km = Math.round((positionM + porteeM) / 1000);
      if (prochaineImposee) {
        return echec(
          `L’arrêt imposé « ${prochaineImposee.nom} » est à`
          + ` ${Math.round(prochaineImposee.avancementM / 1000)} km, hors de portée,`
          + ` et aucune borne utilisable ne le précède avant ${km} km.`
          + ' Retirez cet arrêt, ou ajoutez-en un avant lui.',
        );
      }
      /* SI LE PLAFOND EST EN CAUSE, LE DIRE : un refus qui tait le réglage qui
         l'a produit enferme l'usager. On ne l'écrit que lorsqu'un plafond
         plein aurait pu changer la donne — c'est-à-dire dès qu'il est bridé. */
      /* SI C'EST LA PAUSE QUI BORNE — pas la batterie —, le refus doit la
         nommer : « partez avec plus de charge » n'y changerait rien. */
      if (intervalleMax !== null && intervalleMax < porteeBatterieM) {
        return echec(
          `Aucune borne avant ${km} km, la limite de votre réglage de pause.`
          + ' Espacez les pauses, ou retirez ce réglage.',
        );
      }
      return echec(
        `Aucune borne utilisable avant ${km} km, où la réserve serait entamée.`
        + ' Élargissez les filtres, ou partez avec plus de charge.'
        + (plafond < 100 ? ' Vous pouvez aussi relever le plafond de charge.' : ''),
      );
    }

    // On y va.
    const socALaBorne = socApres(choisie.avancementM - positionM, soc);
    positionM = choisie.avancementM;

    /* COMBIEN CHARGER ? Juste ce qu'il faut pour finir avec la cible — pas le
       plein — et JAMAIS au-delà du plafond choisi. Si le plafond ne suffit
       pas pour rallier la destination d'une traite, le tour suivant cherchera
       une borne plus loin ; et s'il n'y en a pas, le refus nommera le
       plafond. */
    const suivanteImposee = etapesImposees.find((b) => b.avancementM > positionM);
    /* ON VISE LE PROCHAIN POINT DE PASSAGE OBLIGÉ, PAS SYSTÉMATIQUEMENT LA
       DESTINATION : jusqu'à un arrêt imposé, il suffit d'y arriver avec la
       réserve ; jusqu'à la destination, il faut y arriver avec la cible. */
    const restantApresM = (suivanteImposee?.avancementM ?? o.distanceM) - positionM;
    const socALArrivee = suivanteImposee ? reserve : cible;
    const besoinKwh = energiePour(restantApresM, va) + va.capaciteKwh * (socALArrivee / 100);
    const socVoulu = (besoinKwh / va.capaciteKwh) * 100;
    /* ARRIVER AU-DESSUS DU PLAFOND N'EST PAS UNE FAUTE — on ne vidange pas une
       batterie. Le haut de la fourchette est donc le plafond, OU le SOC
       d'arrivée s'il le dépasse déjà. */
    const socRepart = borner(
      Math.max(socVoulu, socALaBorne),
      socALaBorne,
      Math.max(plafond, socALaBorne),
    );

    const energieKwh = va.capaciteKwh * ((socRepart - socALaBorne) / 100);
    /* UN ARRÊT IMPOSÉ PEUT NE RIEN CHARGER, ET C'EST LÉGITIME : on s'y arrête
       pour déjeuner, pour retrouver quelqu'un, ou parce qu'on en a envie. Le
       garde-fou ci-dessous vise le cas où le MODÈLE choisit une borne inutile
       et piétine ; l'appliquer à une consigne de l'usager reviendrait à
       refuser un trajet parfaitement faisable au motif qu'il comporte une
       pause. L'arrêt est alors inscrit à zéro kilowattheure et zéro minute —
       ce qu'il est. */
    /* …ET L'ARRÊT DE PAUSE NON PLUS : quand l'intervalle des pauses a forcé
       l'arrêt, une batterie encore pleine est NORMALE — on s'arrête pour les
       humains, pas pour les électrons. Le garde-fou ne vise que le modèle
       qui piétinerait sans consigne. */
    if (energieKwh <= 0 && choisie !== prochaineImposee && intervalleMax === null) {
      return echec(
        `Le trajet n’avance plus à ${Math.round(positionM / 1000)} km :`
        + ' la borne retenue n’apporte pas d’autonomie utile.',
      );
    }

    /* LA PAUSE MINIMALE PAIE LA CHARGE. Si la charge nécessaire tient en
       moins que la pause demandée, on ne reste pas branché à ne rien faire :
       on remplit ce que le temps permet — plafond respecté — et la marge
       gagnée peut épargner l'arrêt suivant. La courbe de durée n'est pas
       linéaire au-dessus de 80 % : on cherche le SOC atteignable par
       dichotomie plutôt que d'inverser la formule à la main. */
    let socFinal = socRepart;
    let duree = dureeChargeMin(energieKwh, choisie.puissanceKw, va, socALaBorne, socRepart,
      plafondThermique);
    if (pauseMin > 0 && duree < pauseMin) {
      const socMax = Math.max(plafond, socALaBorne);
      let bas = socFinal; let haut = socMax;
      for (let i = 0; i < 24; i += 1) {
        const milieu = (bas + haut) / 2;
        const d = dureeChargeMin(
          va.capaciteKwh * ((milieu - socALaBorne) / 100),
          choisie.puissanceKw, va, socALaBorne, milieu, plafondThermique,
        );
        if (d <= pauseMin) bas = milieu; else haut = milieu;
      }
      socFinal = bas;
      duree = pauseMin;
    }
    const energieFinale = va.capaciteKwh * ((socFinal - socALaBorne) / 100);

    const agrementM = o.agrements?.get(cleBorne(choisie));
    arrets.push({
      borne: choisie,
      ...(agrementM !== undefined ? { agrementM } : {}),
      socArrivee: socALaBorne,
      socDepart: socFinal,
      energieKwh: Math.max(energieFinale, 0),
      dureeMin: duree,
    });
    soc = socFinal;
  }

  return echec(
    `Ce trajet demanderait plus de ${MAX_ARRETS} arrêts : il sort de ce que`
    + ' ce planificateur sait estimer honnêtement.',
  );
}

/**
 * Le SOC estimé à un point du trajet — PURE (SOC-EDIT, 04/09).
 *
 * LES ANCRES SONT CELLES DU PLAN : le départ, puis pour chaque arrêt son
 * arrivée et son départ (la recharge est un saut vertical au même
 * kilomètre), puis l'arrivée finale. Entre deux ancres, la batterie descend
 * LINÉAIREMENT en distance — approximation assumée : le plan lui-même
 * calcule par tronçons, et le Copilote dit « ~ » et « estimation ».
 */
export function socEstimeA(
  avancementM: number,
  socDepart: number,
  arrets: readonly { avancementM: number; socArrivee: number; socDepart: number }[],
  socFinal: number,
  distanceTotaleM: number,
): number {
  const borne = (x: number): number => Math.min(Math.max(x, 0), 1);
  let posPrec = 0;
  let socPrec = socDepart;
  for (const a of arrets) {
    if (avancementM <= a.avancementM) {
      const part = a.avancementM === posPrec ? 1
        : borne((avancementM - posPrec) / (a.avancementM - posPrec));
      return socPrec + (a.socArrivee - socPrec) * part;
    }
    posPrec = a.avancementM;
    socPrec = a.socDepart;
  }
  if (distanceTotaleM <= posPrec) return socFinal;
  const part = borne((avancementM - posPrec) / (distanceTotaleM - posPrec));
  return socPrec + (socFinal - socPrec) * part;
}
