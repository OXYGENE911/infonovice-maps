// Contrat de route — ce qui lie le TRACÉ et la FEUILLE DE ROUTE, et ce qui se
// passe quand ils ne se répondent plus. Module PUR, sans réseau ni DOM.
//
// POURQUOI CE FICHIER EXISTE. Le guidage vit de deux réponses obtenues par
// DEUX APPELS SÉPARÉS au service d'itinéraire : l'une donne la géométrie et
// les totaux, l'autre les instructions. Rien, jusqu'ici, ne vérifiait qu'elles
// décrivent la même route ; on les raccordait par la seule distance cumulée,
// en supposant que tout concorde. L'audit du 06/09 pointait précisément cette
// couture : « contrat de route commun (points raccordés, provenance) ».
//
// CE QUE LA MESURE A MONTRÉ (09/09, quatre trajets réels sur data.geopf.fr) :
//
//   1. DANS UNE MÊME RÉPONSE, la somme des longueurs d'étapes égale la
//      distance annoncée à moins de 0,5 m sur 600 km — l'hypothèse écrite
//      dans `guidage.ts` était donc juste. Elle n'était simplement jamais
//      vérifiée.
//   2. ENTRE DEUX RÉPONSES DIFFÉRENTES, l'écart n'a rien de modeste : le même
//      Paris–Lyon rend 465,6 km en 99 étapes en `fastest` et 448,1 km en 439
//      étapes en `shortest`. Une feuille prise sur la seconde et posée sur le
//      tracé de la première décalerait l'instruction de dix-sept kilomètres,
//      en silence, à cent trente à l'heure.
//   3. LES DEUX CÔTÉS NE COMPTENT PAS AVEC LA MÊME RÈGLE. Le service annonce
//      465 601,6 m ; la même géométrie mesurée à la haversine — celle que le
//      guidage emploie pour situer la voiture — en rend 465 470,9, soit
//      0,028 % de moins, et ce biais est CONSTANT sur les quatre trajets
//      (−0,028 %, −0,028 %, −0,028 %, −0,029 %). C'est la différence entre la
//      géodésie du moteur et notre sphère. Elle vaut 131 m sur Paris–Lyon :
//      la dernière instruction tombait cent trente mètres trop tôt.
//
// CE FICHIER RÉPOND AUX TROIS. Il exige que les deux réponses viennent de la
// MÊME demande (1 et 2), et il raccorde les étapes sur la règle du tracé
// plutôt que sur celle du service (3).
import type { EtapeRoute } from './feuille-de-route';
import { distanceM } from './le-long-du-trajet';
import { urlItineraire, type Profil, type OptionsItineraire } from './itineraire';
import type { PointGeo } from './coordonnees';

/**
 * D'où vient un morceau de trajet.
 *
 * LA PROVENANCE EST L'URL DEMANDÉE, et ce n'est pas un raccourci paresseux :
 * `urlItineraire` porte déjà le service, la ressource, le profil,
 * l'optimisation, les points de départ et d'arrivée, les étapes intermédiaires
 * et les évitements — c'est-à-dire TOUT ce qui change la route. Deux URL
 * identiques ne peuvent pas décrire deux routes différentes ; le moteur est
 * déterministe, vérifié le 09/09 par deux appels successifs rendant la même
 * distance au dixième de mètre et le même nombre de points. Comparer les
 * chaînes est donc un test complet, et non une approximation.
 *
 * `obtenuLe` NE SERT PAS DE GARDE. Il serait facile d'ajouter « et pas plus
 * vieux que dix minutes » ; ce serait une règle inventée. Le moteur étant
 * déterministe, l'âge ne dit rien sur l'accord des deux réponses. On le note
 * pour l'expliquer à l'usager et pour le journal, pas pour décider.
 */
export interface Provenance {
  /** L'URL demandée, SANS le supplément `getSteps` qui ne change pas la route. */
  requete: string;
  /** L'instant de la réponse, en millisecondes depuis l'époque. */
  obtenuLe: number;
}

/** Ce qui a rompu le contrat, ou `null` quand tout se répond. */
export type MotifRupture = 'origine' | 'longueur-etapes';

/* LES TOLÉRANCES SONT DES MULTIPLES DE CE QUI A ÉTÉ MESURÉ, jamais des
   chiffres ronds choisis au jugé.

   Pour les étapes : l'écart mesuré vaut 0,5 m au pire, et 37 parties par
   million en relatif. Cinquante mètres, c'est cent fois le pire écart absolu ;
   deux millièmes, c'est cinquante fois le pire écart relatif. On garde les
   deux — le plancher protège les trajets courts, où deux millièmes de 5 km ne
   feraient que dix mètres. Et l'on reste très loin des 3,8 % qui séparent
   `fastest` de `shortest` : le désaccord qui compte est pris vingt fois. */
export const TOLERANCE_ETAPES_M = 50;
export const TOLERANCE_ETAPES_PART = 0.002;

/* CE QU'ON NE VÉRIFIE PAS, ET POURQUOI — la question s'est posée, et la
   réponse mérite d'être écrite plutôt que d'être devinée du silence.

   Une première version comparait aussi la longueur MESURÉE du tracé à la
   distance annoncée, et écartait la feuille au-delà d'un seuil. Ce contrôle a
   été retiré : il ne teste pas un raccord. La géométrie et la distance
   viennent de la MÊME réponse ; les confronter, c'est juger le service contre
   lui-même, ce qui n'est ni notre rôle ni l'objet de ce fichier. Le seul
   joint qui nous appartient est celui des DEUX réponses, et il est tenu par
   la provenance et par la somme des étapes.

   Et ce contrôle n'aurait rien protégé : la mise à l'échelle ramène les
   bornes sur la polyligne RÉELLE, quelle que soit la distance annoncée. Il
   n'avait donc qu'un effet possible — écarter une feuille juste, et priver un
   conducteur d'instructions bonnes. Vingt parcours l'ont montré du premier
   coup. Ce qu'il prétendait attraper (un tracé tronqué, dégénéré) est déjà
   refusé plus tôt, par `versItineraire`. */

export interface EntreeContrat {
  trace: readonly [number, number][];
  distanceTotaleM: number;
  dureeTotaleS: number;
  etapes: readonly EtapeRoute[];
  provenanceTrace: Provenance;
  /** Absente quand la feuille n'a pas pu être obtenue — ce n'est pas une rupture. */
  provenanceFeuille?: Provenance | undefined;
}

export interface Contrat {
  trace: readonly [number, number][];
  distanceTotaleM: number;
  dureeTotaleS: number;
  /** Les étapes RETENUES : vides dès qu'il y a rupture. */
  etapes: readonly EtapeRoute[];
  /** La fin de chaque étape, en mètres DU TRACÉ — la règle du guidage. */
  bornesM: readonly number[];
  /** La longueur de la géométrie à la règle du guidage. */
  longueurMesureeM: number;
  rupture: MotifRupture | null;
}

/** La longueur d'une polyligne à la règle du guidage (haversine) — PURE. */
export function longueurDuTrace(trace: readonly [number, number][]): number {
  let total = 0;
  for (let i = 0; i < trace.length - 1; i += 1) {
    total += distanceM(trace[i]!, trace[i + 1]!);
  }
  return total;
}

/**
 * La provenance d'une demande d'itinéraire — PURE (l'heure est un paramètre).
 *
 * ON RECONSTRUIT L'URL PLUTÔT QUE DE COMPARER LES ARGUMENTS un par un, parce
 * que c'est l'URL qui part réellement sur le réseau. Comparer des objets
 * laisserait passer ce qu'ils ne portent pas — un point intermédiaire injecté
 * au dernier moment, par exemple. C'est exactement ce qui arrivait au via de
 * l'itinéraire bis.
 */
export function provenanceDe(
  depart: PointGeo, arrivee: PointGeo, profil: Profil,
  options: OptionsItineraire, maintenant: number = Date.now(),
): Provenance {
  return { requete: urlItineraire(depart, arrivee, profil, options), obtenuLe: maintenant };
}

/** Deux morceaux viennent-ils de la même demande — PURE. */
export function memeOrigine(a: Provenance, b: Provenance): boolean {
  return a.requete === b.requete;
}

/**
 * Le contrat de route : les deux réponses raccordées, ou la feuille écartée.
 *
 * ÉCARTER LA FEUILLE N'EST PAS UN APPAUVRISSEMENT, c'est le choix sûr. Sans
 * instructions, le bandeau dit « Suivez l'itinéraire » et l'usager garde la
 * carte, la distance restante et l'heure d'arrivée. Avec de MAUVAISES
 * instructions, il entend « sortez à droite » là où il ne faut pas. Entre les
 * deux, il n'y a pas à hésiter : une consigne fausse à cent trente à l'heure
 * coûte plus cher qu'une consigne absente.
 *
 * LE RACCORD EST UNE MISE À L'ÉCHELLE, et c'est le cœur de la correction. Les
 * étapes sont comptées dans les mètres du service, l'avancement dans les
 * mètres de la haversine ; les cumuler tels quels, c'est additionner deux
 * règles. On ramène donc les bornes sur la règle du tracé — celle-là même qui
 * situera la voiture. Le facteur vaut 0,99972 en pratique ; il efface les
 * 131 m de retard qui s'accumulaient jusqu'à la dernière instruction.
 */
export function contratDeRoute(e: EntreeContrat): Contrat {
  const distance = Number.isFinite(e.distanceTotaleM) && e.distanceTotaleM > 0
    ? e.distanceTotaleM : 0;
  const longueurMesureeM = longueurDuTrace(e.trace);
  const base = {
    trace: e.trace,
    distanceTotaleM: distance,
    dureeTotaleS: Number.isFinite(e.dureeTotaleS) && e.dureeTotaleS > 0 ? e.dureeTotaleS : 0,
    longueurMesureeM,
  };
  const rompu = (rupture: MotifRupture): Contrat =>
    ({ ...base, etapes: [], bornesM: [], rupture });

  /* PAS DE FEUILLE N'EST PAS UNE RUPTURE. Le service d'étapes peut échouer
     seul ; le trajet reste alors parfaitement guidable, sans instructions. */
  if (e.etapes.length === 0 || !e.provenanceFeuille) {
    return { ...base, etapes: [], bornesM: [], rupture: null };
  }

  if (!memeOrigine(e.provenanceTrace, e.provenanceFeuille)) return rompu('origine');

  const longueurs = e.etapes.map((s) =>
    (Number.isFinite(s.distance) && s.distance > 0 ? s.distance : 0));
  const somme = longueurs.reduce((t, v) => t + v, 0);
  if (somme <= 0) return rompu('longueur-etapes');
  if (distance > 0 && Math.abs(somme - distance)
    > Math.max(TOLERANCE_ETAPES_M, distance * TOLERANCE_ETAPES_PART)) {
    return rompu('longueur-etapes');
  }

  const facteur = longueurMesureeM > 0 ? longueurMesureeM / somme : 1;
  const bornesM: number[] = [];
  let cumul = 0;
  for (const l of longueurs) {
    cumul += l * facteur;
    bornesM.push(cumul);
  }
  /* LA DERNIÈRE BORNE EST LA FIN DU TRACÉ, exactement : les arrondis
     successifs laisseraient sans cela quelques centimètres au-delà desquels
     l'arrivée ne serait jamais atteinte. */
  if (bornesM.length > 0 && longueurMesureeM > 0) {
    bornesM[bornesM.length - 1] = longueurMesureeM;
  }

  return { ...base, etapes: e.etapes, bornesM, rupture: null };
}

/** Ce qu'on dit à l'usager quand le contrat est rompu — PURE. */
export function motDeLaRupture(m: MotifRupture): string {
  switch (m) {
    case 'origine':
      return 'Les instructions détaillées ne décrivent pas ce tracé : elles ont été écartées.';
    case 'longueur-etapes':
      return 'Les instructions détaillées ne concordent pas avec la longueur du trajet : elles ont été écartées.';
  }
}
