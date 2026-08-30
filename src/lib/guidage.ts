/* LE GUIDAGE — suivre un itinéraire déjà calculé, et RIEN DE PLUS.
 *
 * LA DEMANDE. Armelin, le 25/08/2026 : « il n'y a pas de bouton pour démarrer
 * l'itinéraire ». Un planificateur qui calcule un trajet et s'arrête là laisse
 * son usager recopier les étapes sur un carnet.
 *
 * CE QUE CE MODULE N'EST PAS, ET QUE L'INTERFACE DIT EN TOUTES LETTRES :
 * ce n'est PAS une navigation guidée. Pas de voix, pas de recalcul
 * automatique quand on quitte la route, pas d'affichage tête haute. Promettre
 * une navigation et rendre un suivi serait pire que ne rien promettre — on s'y
 * fierait au moment précis où l'on ne peut pas regarder l'écran.
 *
 * CE QU'IL EST : la position GPS projetée sur le tracé, qui répond à trois
 * questions dont la réponse tient à l'écran d'un téléphone posé sur un
 * support : quelle est la manœuvre suivante, dans combien de mètres, et
 * combien reste-t-il.
 *
 * TOUT SE CALCULE ICI, À SEC. Le module ne connaît ni MapLibre, ni le DOM, ni
 * la géolocalisation : il reçoit une position et rend des nombres.
 */
import type { EtapeRoute } from './feuille-de-route';
import { situerSurLeTrace } from './le-long-du-trajet';

/** Au-delà de cet écart au tracé, on ne prétend plus suivre l'itinéraire. */
/* CENT-CINQUANTE MÈTRES ÉTAIENT TROP INDULGENTS. Armelin, le 29/08, capture
   à l'appui : « quand on se trompe de destination, le recalcul automatique
   intervient trop tardivement — j'ai pu faire le tour d'un rond-point et
   m'écarter du trajet sans que le recalcul intervienne ». À 150 m, on a le
   temps de prendre une rue entière avant que l'application s'en aperçoive.
   QUATRE-VINGTS EST LE PLANCHER RAISONNABLE, et il se justifie : un
   récepteur de téléphone donne 5 à 15 m en ville dégagée, 30 à 50 dans une
   rue encaissée ; deux rues parallèles sont rarement à moins de 40 m. En
   dessous, on annoncerait « vous avez quitté l'itinéraire » à des gens qui
   roulent droit. */
export const ECART_HORS_ROUTE_M = 80;

/**
 * Part-on à CONTRESENS ? — PURE.
 *
 * L'ÉCART AU TRACÉ NE VOIT PAS TOUT : après un tour de rond-point, on
 * repart sur la même route, à deux mètres du tracé — parfaitement « sur
 * l'itinéraire », et dans le mauvais sens. Ce que l'on constate alors,
 * c'est que l'avancement RECULE. Cent cinquante mètres de recul ne sont
 * pas du bruit de récepteur (il se compte en dizaines de mètres) : c'est
 * un demi-tour.
 */
/* LES MANŒUVRES QUI MÉRITENT QU'ON SE RAPPROCHE. « Tout droit » n'en est
   pas une : zoomer pour une ligne droite ferait respirer la carte sans
   raison, et l'on perdrait la vue d'ensemble au moment où elle sert. */
const MANOEUVRES_SERREES = new Set<string>([
  'right', 'left', 'sharp right', 'sharp left', 'slight right', 'slight left',
  'uturn', 'rond-point', 'arrivee',
]);

/** On se rapproche à cette distance de la manœuvre. */
export const APPROCHE_M = 260;
/** …et l'on ressort au-delà de celle-ci — l'écart évite le clignotement. */
export const SORTIE_APPROCHE_M = 420;

/**
 * Faut-il resserrer la carte sur la manœuvre qui vient ? — PURE.
 *
 * LA DEMANDE (Armelin, 30/08) : « est-ce que l'algorithme peut effectuer
 * automatiquement un zoom lors de l'arrivée à une intersection ou changement
 * d'autoroute ou carrefour complexe pour revenir ensuite à la vue initiale
 * quand l'obstacle est passé ? »
 *
 * DEUX SEUILS, ET C'EST NÉCESSAIRE. Avec un seuil unique, la moindre
 * imprécision du récepteur autour de la limite ferait entrer et sortir la
 * carte du zoom plusieurs fois par seconde — un battement insupportable au
 * volant. On entre à 260 m, on ne ressort qu'au-delà de 420 : l'état
 * courant fait partie de la décision, et c'est ce qui la stabilise.
 */
export function approcheManoeuvre(
  distanceM: number, manoeuvre: string | null, dedans: boolean,
): boolean {
  if (manoeuvre === null || !MANOEUVRES_SERREES.has(manoeuvre)) return false;
  if (!Number.isFinite(distanceM) || distanceM < 0) return false;
  return dedans ? distanceM < SORTIE_APPROCHE_M : distanceM < APPROCHE_M;
}

export function partiAContresens(
  avancementM: number, maxAtteintM: number, margeM = 150,
): boolean {
  return maxAtteintM - avancementM > margeM;
}

export interface Position { lon: number; lat: number }

export interface EtatGuidage {
  /** Distance parcourue le long du tracé, en mètres. */
  avancementM: number;
  /** Écart au tracé, en mètres. */
  ecartM: number;
  /** `true` quand l'écart dépasse le seuil : on le DIT, on ne devine pas. */
  horsRoute: boolean;
  /** Distance restant à parcourir, en mètres. */
  restantM: number;
  /** Durée restante estimée, en secondes. */
  restantS: number;
  /** L'étape en cours — la ROUTE SUR LAQUELLE ON ROULE, pas ce qui vient. */
  etape: EtapeRoute | null;
  /**
   * LA MANŒUVRE À ANNONCER, et c'est elle qu'il faut afficher.
   *
   * LE DÉFAUT QU'ELLE CORRIGE (Armelin, 29/08, captures à l'appui : « le GPS
   * confond sa gauche et sa droite pendant la navigation »). Le service rend
   * l'instruction du DÉBUT de chaque étape et la longueur qui SUIT —
   * vérifié sur une réponse réelle : `depart` puis 30 m, `turn sharp left`
   * puis 46 m, `turn right` puis 205 m… Tant qu'on roule dans l'étape i, la
   * manœuvre déjà faite est celle de l'étape i ; celle qui ARRIVE est celle
   * de l'étape i+1. Le bandeau affichait la première avec la distance de la
   * seconde : « tournez à droite dans 200 m » quand la route tournait à
   * gauche — une manœuvre de retard, systématiquement.
   */
  manoeuvre: EtapeRoute | null;
  /** Mètres jusqu'à cette manœuvre — la fin de l'étape courante. */
  jusquALaManoeuvreM: number;
  /** L'instruction d'après CELLE-CI, pour préparer l'enchaînement. */
  suivante: EtapeRoute | null;
}

/**
 * Trouve l'étape en cours à partir de l'avancement.
 *
 * LES ÉTAPES NE PORTENT PAS DE COORDONNÉES — le service d'itinéraire rend une
 * instruction et une longueur, pas un point. On les cumule donc : l'étape
 * courante est celle dont l'intervalle contient l'avancement.
 *
 * CE QUE CELA SUPPOSE, et qui mérite d'être écrit : que la somme des longueurs
 * d'étapes égale la distance du trajet. Les deux viennent du même service et
 * s'accordent à quelques mètres ; un écart plus grand décalerait l'instruction
 * affichée. C'est le prix d'une feuille de route sans géométrie, et il est
 * modeste comparé à celui d'un second appel réseau.
 */
export function etapeAlAvancement(
  etapes: readonly EtapeRoute[], avancementM: number,
): { index: number; debutM: number; finM: number } | null {
  if (etapes.length === 0) return null;
  const cible = Math.max(0, avancementM);
  let cumul = 0;
  for (const [index, e] of etapes.entries()) {
    const longueur = Number.isFinite(e.distance) && e.distance > 0 ? e.distance : 0;
    // Strictement inférieur : à la frontière exacte, on est déjà sur la suivante.
    if (cible < cumul + longueur) return { index, debutM: cumul, finM: cumul + longueur };
    cumul += longueur;
  }
  // Au-delà de la dernière : on est arrivé, l'instruction reste la dernière.
  const dernier = etapes.length - 1;
  return { index: dernier, debutM: cumul, finM: cumul };
}

export interface OptionsGuidage {
  trace: [number, number][];
  distanceTotaleM: number;
  dureeTotaleS: number;
  etapes: readonly EtapeRoute[];
}

/**
 * L'état du guidage pour une position donnée.
 *
 * LA DURÉE RESTANTE EST PROPORTIONNELLE À LA DISTANCE RESTANTE, et rien de
 * plus savant. Le service d'itinéraire ne rend qu'un total ; répartir ce total
 * au prorata suppose une vitesse moyenne constante, ce qui est faux dans les
 * traversées de villes. On ne prétend donc pas à la minute — l'interface
 * arrondit, et ne fabrique pas une heure d'arrivée à la seconde près.
 */
export function etatGuidage(o: OptionsGuidage, p: Position): EtatGuidage {
  const { ecart, avancement } = situerSurLeTrace(p, o.trace);
  const distance = Number.isFinite(o.distanceTotaleM) && o.distanceTotaleM > 0
    ? o.distanceTotaleM : 0;
  const restantM = Math.max(0, distance - avancement);
  const part = distance > 0 ? restantM / distance : 0;
  const duree = Number.isFinite(o.dureeTotaleS) && o.dureeTotaleS > 0 ? o.dureeTotaleS : 0;

  const situe = etapeAlAvancement(o.etapes, avancement);
  const etape = situe ? o.etapes[situe.index] ?? null : null;
  /* CE QUI ARRIVE, c'est l'instruction de l'étape SUIVANTE. À la dernière,
     il n'y a plus rien après : l'étape courante — « Vous êtes arrivé » —
     est alors la bonne réponse. */
  const manoeuvre = situe ? o.etapes[situe.index + 1] ?? etape : null;
  const suivante = situe ? o.etapes[situe.index + 2] ?? null : null;

  return {
    avancementM: avancement,
    ecartM: ecart,
    horsRoute: ecart > ECART_HORS_ROUTE_M,
    restantM,
    restantS: duree * part,
    etape,
    manoeuvre,
    jusquALaManoeuvreM: situe ? Math.max(0, situe.finM - avancement) : 0,
    suivante,
  };
}

/**
 * La distance en mots, calibrée pour un regard d'une demi-seconde.
 *
 * LES PALIERS NE SONT PAS COSMÉTIQUES. « Dans 1 234 m » demande de lire quatre
 * chiffres pour en retenir un ; « dans 1,2 km » en demande deux. Sous cent
 * mètres, en revanche, la précision compte vraiment : c'est le moment de la
 * manœuvre. On arrondit donc à ce que l'œil peut prendre d'un coup.
 */
export function distanceEnMots(metres: number): string {
  if (!Number.isFinite(metres) || metres < 0) return '';
  if (metres < 20) return 'maintenant';
  if (metres < 100) return `dans ${Math.round(metres / 10) * 10} m`;
  if (metres < 1000) return `dans ${Math.round(metres / 50) * 50} m`;
  if (metres < 10_000) return `dans ${(metres / 1000).toFixed(1).replace('.', ',')} km`;
  return `dans ${Math.round(metres / 1000)} km`;
}

/** L'heure d'arrivée estimée, ou `null` quand la durée est inconnue. */
export function heureArriveeEstimee(restantS: number, maintenant: Date): Date | null {
  if (!Number.isFinite(restantS) || restantS < 0) return null;
  return new Date(maintenant.getTime() + restantS * 1000);
}
