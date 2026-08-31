/* DÉCOUPER UN TRAJET POUR L'INTERROGER — et savoir quand le service a renoncé.
 *
 * LE DÉFAUT QUE CE MODULE CORRIGE (31/08). Armelin : « quand je clique sur
 * afficher les feux tricolores d'un trajet, ça me met un message m'indiquant
 * que les feux n'ont pas pu être relevés et ça m'invite à réessayer plus
 * tard. Idem pour les péages. » Les deux fonctionnalités étaient livrées et
 * ne fonctionnaient pas sur un long trajet.
 *
 * TROIS CAUSES MESURÉES, le 31/08, sur Paris–Marseille :
 *
 *   1. UNE SEULE REQUÊTE POUR TOUT LE TRAJET. Le couloir de 775 km épuise le
 *      budget d'Overpass : expiration serveur à 26 s pour les péages, 45,7 s
 *      pour les feux. Ce n'est pas une panne du service, c'est une demande
 *      déraisonnable.
 *   2. LE CLIENT ABANDONNAIT AVANT LE SERVEUR. Péages : coupure à 15 s pour
 *      un budget serveur de 25 s — on renonçait à une réponse qui arrivait.
 *      Feux : coupure à 45 s pour un budget de 45 s, une course perdue
 *      d'avance. UN CLIENT DOIT TOUJOURS LAISSER PLUS DE TEMPS QUE LE SERVEUR
 *      NE S'EN DONNE.
 *   3. UNE EXPIRATION SE LISAIT « ZÉRO ». Overpass qui renonce rend
 *      `elements: []` AVEC un champ `remark` — que personne n'inspectait. On
 *      affichait donc « aucun péage » là où la vérité était « je ne sais
 *      pas ». Un chiffre faux est pire qu'un aveu.
 *
 * LE REMÈDE, MESURÉ AUSSI : par tronçons, les péages passent en 7 requêtes et
 * 7,7 secondes, sans une seule expiration — contre 26 secondes et un échec.
 */
import { distanceM } from './le-long-du-trajet';

/* LA BOÎTE ENGLOBANTE D'UN TRONÇON. Elle porte son propre nom plutôt que de
   réutiliser l'emprise du filtre des lieux : les deux décrivent un rectangle,
   mais l'une naît d'une vue de carte et l'autre d'un tracé — les faire
   dépendre l'une de l'autre lierait deux chantiers sans rien y gagner. */
export interface Boite {
  ouest: number;
  sud: number;
  est: number;
  nord: number;
}

/* LA LONGUEUR D'UN TRONÇON. Cent trente kilomètres : mesuré le 31/08, un
   couloir de 139 km (390 points décimés) répond en 12 s, là où 775 km
   expirent. On reste sous la mesure, pas au-dessus. */
export const TRONCON_M = 130_000;

/**
 * Découpe un tracé en tronçons d'au plus `maxM` mètres — PURE.
 *
 * LES TRONÇONS SE RECOUVRENT D'UN POINT : sans ce recouvrement, un péage ou
 * un feu posé exactement sur la couture n'appartiendrait à aucun tronçon et
 * disparaîtrait du relevé.
 */
export function decouperParLongueur(
  trace: readonly [number, number][], maxM = TRONCON_M,
): [number, number][][] {
  if (trace.length < 2) return [];
  const rendu: [number, number][][] = [];
  let courant: [number, number][] = [trace[0]!];
  let longueur = 0;
  for (let i = 1; i < trace.length; i += 1) {
    longueur += distanceM(trace[i - 1]!, trace[i]!);
    courant.push(trace[i]!);
    if (longueur >= maxM && i < trace.length - 1) {
      rendu.push(courant);
      // Le point de coupe OUVRE le tronçon suivant : c'est le recouvrement.
      courant = [trace[i]!];
      longueur = 0;
    }
  }
  if (courant.length >= 2) rendu.push(courant);
  else if (rendu.length > 0 && courant.length === 1) {
    // Une queue d'un seul point rejoint le tronçon précédent plutôt que de
    // former un tronçon dégénéré, qu'Overpass refuserait.
    rendu[rendu.length - 1]!.push(courant[0]!);
  }
  return rendu;
}

/* LA MARGE DE L'EMPRISE, EN DEGRÉS. Un centième de degré vaut environ 1,1 km
   sous nos latitudes : de quoi englober la largeur d'un échangeur sans
   étendre la boîte à la commune voisine. */
export const MARGE_EMPRISE_DEG = 0.01;

/** L'emprise rectangulaire d'un ensemble de points, avec sa marge — PURE. */
export function emprise(
  points: readonly [number, number][], marge = MARGE_EMPRISE_DEG,
): Boite {
  let ouest = 180; let est = -180; let sud = 90; let nord = -90;
  for (const [lon, lat] of points) {
    ouest = Math.min(ouest, lon); est = Math.max(est, lon);
    sud = Math.min(sud, lat); nord = Math.max(nord, lat);
  }
  return {
    ouest: ouest - marge, est: est + marge,
    sud: Math.max(-90, sud - marge), nord: Math.min(90, nord + marge),
  };
}

/**
 * Vrai si Overpass a RENONCÉ — PURE, défensive.
 *
 * C'EST LA LECTURE QUI MANQUAIT. Une expiration rend un tableau vide et un
 * `remark` qui l'explique. Sans cette fonction, « le service a renoncé » se
 * lisait « il n'y a rien ici » — et l'usager voyait un trajet sans péages
 * là où il en traverserait huit.
 */
export function aRenonce(brut: unknown): boolean {
  const remarque = (brut as { remark?: unknown })?.remark;
  return typeof remarque === 'string' && /timed out|runtime error/i.test(remarque);
}

/**
 * Le temps qu'on laisse au client, à partir du budget donné au serveur.
 *
 * TOUJOURS PLUS QUE LE SERVEUR : c'est la deuxième cause du défaut. La marge
 * couvre l'aller-retour réseau et le décodage — un client qui coupe à l'heure
 * exacte du serveur perd une course qu'il a lui-même créée.
 */
export function delaiClientMs(budgetServeurS: number): number {
  return budgetServeurS * 1000 + 15_000;
}

/* LA PAUSE ENTRE DEUX TRONÇONS. Six cents millisecondes : mesuré le 31/08,
   six requêtes lourdes enchaînées sans respirer se font limiter par le
   service — le relevé des feux échouait ENTIÈREMENT lorsqu'il suivait celui
   des péages, alors qu'isolé il aboutissait à cinq tronçons sur six. La
   pause coûte quatre secondes sur un relevé de cent ; elle achète de ne pas
   se faire fermer la porte. */
export const PAUSE_TRONCON_MS = 600;

/* LE NOMBRE MAXIMAL DE TRONÇONS. Dix, soit environ mille trois cents
   kilomètres : au-delà d'un trajet français, et c'est un garde-fou, pas une
   limite d'usage. Sans lui, un tracé aberrant lancerait une rafale sur un
   service bénévole. Ce qui dépasse n'est PAS relevé, et l'appelant le dit. */
export const MAX_TRONCONS = 10;

/** Attend, entre deux tronçons — pour ne pas se faire fermer la porte. */
export function respirer(ms = PAUSE_TRONCON_MS): Promise<void> {
  return new Promise((resoudre) => { setTimeout(resoudre, ms); });
}
