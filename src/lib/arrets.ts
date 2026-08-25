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

export interface BorneCandidate {
  nom: string;
  lon: number;
  lat: number;
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
}

export interface Arret {
  borne: BorneCandidate;
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
}

/* AU-DELÀ DE 80 %, LA CHARGE RALENTIT FORTEMENT : le véhicule bride pour
   protéger la batterie. Un planificateur qui remplit à 100 % à chaque arrêt
   fait perdre plus de temps qu'il n'en gagne. On plafonne donc, sauf si le
   dernier tronçon l'exige — mieux vaut vingt minutes de plus qu'un trajet
   déclaré impossible. */
const PLAFOND_CONFORT = 80;
const PLAFOND_DUR = 100;

/** Rendement de la charge : une part de l'énergie part en chaleur. */
const RENDEMENT = 0.9;

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
  socDe: number, socA: number,
): number {
  const puissance = Math.min(puissanceBorneKw ?? 0, v.puissanceMaxKw);
  if (!(puissance > 0) || !(energieKwh > 0)) return 0;

  // Part de la charge effectuée au-dessus de 80 %, où le débit s'effondre.
  const hautDe = Math.max(socDe, PLAFOND_CONFORT);
  const hautA = Math.max(socA, PLAFOND_CONFORT);
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
function choisir(
  candidates: BorneCandidate[], departM: number, v: Vehicule,
): BorneCandidate | null {
  let meilleure: BorneCandidate | null = null;
  let meilleurScore = -Infinity;

  for (const c of candidates) {
    const gainKm = (c.avancementM - departM) / 1000;
    const puissance = Math.min(c.puissanceKw ?? 0, v.puissanceMaxKw);
    if (puissance <= 0) continue;
    // Minutes qu'il faudrait pour récupérer 40 kWh sur cette borne : un étalon
    // commun, qui rend les puissances comparables entre elles.
    const minutesEtalon = (40 / (puissance * RENDEMENT)) * 60;
    // Le détour se paie deux fois : aller ET retour.
    const detourKm = (c.ecartM * 2) / 1000;
    const score = gainKm - detourKm - minutesEtalon;
    if (score > meilleurScore) { meilleurScore = score; meilleure = c; }
  }
  return meilleure;
}

const echec = (motif: string): PlanRecharge =>
  ({ faisable: false, arrets: [], socArrivee: 0, dureeRechargeMin: 0, motif });

/** Planifie les arrêts. Aucun appel réseau : tout se calcule ici. */
export function planifierArrets(o: OptionsPlan): PlanRecharge {
  const { vehicule: v, bornes } = o;

  if (!(v.capaciteKwh > 0) || !Number.isFinite(v.capaciteKwh)) {
    return echec('Renseignez la capacité de votre batterie.');
  }
  if (!(v.consommationKwh100 > 0) || !Number.isFinite(v.consommationKwh100)) {
    return echec('Renseignez votre consommation pour estimer l’autonomie.');
  }
  if (!Number.isFinite(o.distanceM) || o.distanceM < 0) {
    return echec('Trajet illisible.');
  }

  const reserve = borner(o.reserve, 0, 50);
  const cible = borner(o.socArrivee, 0, 100);
  let soc = borner(o.socDepart, 0, 100);
  let positionM = 0;
  const arrets: Arret[] = [];

  const socApres = (metres: number, socAvant: number): number =>
    socAvant - (energiePour(metres, v) / v.capaciteKwh) * 100;

  for (let tour = 0; tour <= MAX_ARRETS; tour += 1) {
    const restantM = o.distanceM - positionM;
    const socFin = socApres(restantM, soc);

    // Assez pour finir en gardant la cible ? On s'arrête là.
    if (socFin >= cible) {
      const duree = arrets.reduce((t, a) => t + a.dureeMin, 0);
      return { faisable: true, arrets, socArrivee: socFin, dureeRechargeMin: duree };
    }

    /* IL FAUT S'ARRÊTER. Portée utile : ce qu'on peut faire SANS entamer la
       réserve — arriver à une borne à 2 % n'est pas un plan, c'est un pari. */
    const energieUtile = v.capaciteKwh * ((soc - reserve) / 100);
    const porteeM = energieUtile > 0
      ? (energieUtile / (v.consommationKwh100 / 100)) * 1000 : 0;

    const aPortee = bornes.filter(
      (b) => b.avancementM > positionM && b.avancementM <= positionM + porteeM,
    );
    const choisie = choisir(aPortee, positionM, v);

    if (!choisie) {
      const km = Math.round((positionM + porteeM) / 1000);
      return echec(
        `Aucune borne utilisable avant ${km} km, où la réserve serait entamée.`
        + ' Élargissez les filtres, ou partez avec plus de charge.',
      );
    }

    // On y va.
    const socALaBorne = socApres(choisie.avancementM - positionM, soc);
    positionM = choisie.avancementM;

    /* COMBIEN CHARGER ? Juste ce qu'il faut pour finir avec la cible — pas le
       plein. Si le plafond de confort n'y suffit pas, on monte jusqu'au
       plafond dur : mieux vaut vingt minutes de plus qu'un trajet déclaré
       impossible. */
    const restantApresM = o.distanceM - positionM;
    const besoinKwh = energiePour(restantApresM, v) + v.capaciteKwh * (cible / 100);
    const socVoulu = (besoinKwh / v.capaciteKwh) * 100;
    const socRepart = borner(
      Math.max(socVoulu, socALaBorne),
      socALaBorne,
      socVoulu > PLAFOND_CONFORT ? PLAFOND_DUR : PLAFOND_CONFORT,
    );

    const energieKwh = v.capaciteKwh * ((socRepart - socALaBorne) / 100);
    if (energieKwh <= 0) {
      // La borne n'apporte rien : sans ce garde-fou, la boucle piétinerait.
      return echec(
        `Le trajet n’avance plus à ${Math.round(positionM / 1000)} km :`
        + ' la borne retenue n’apporte pas d’autonomie utile.',
      );
    }

    arrets.push({
      borne: choisie,
      socArrivee: socALaBorne,
      socDepart: socRepart,
      energieKwh,
      dureeMin: dureeChargeMin(energieKwh, choisie.puissanceKw, v, socALaBorne, socRepart),
    });
    soc = socRepart;
  }

  return echec(
    `Ce trajet demanderait plus de ${MAX_ARRETS} arrêts : il sort de ce que`
    + ' ce planificateur sait estimer honnêtement.',
  );
}
