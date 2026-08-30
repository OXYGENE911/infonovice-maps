/* L'ITINÉRAIRE BIS — quitter la route AVANT l'obstacle.
 *
 * LA DEMANDE. Armelin, le 30/08/2026 : « quand on est en mode navigation et
 * qu'on a un obstacle ou une route fermée non prévue, ce serait bien d'avoir
 * dans la barre d'état une icône pour calculer automatiquement un itinéraire
 * bis avant d'arriver à l'obstacle. »
 *
 * CE QUE LE MOTEUR NE SAIT PAS FAIRE, ET IL FAUT LE DIRE. Le service public
 * d'itinéraire n'a AUCUN paramètre « éviter ce tronçon » (capacités relevées
 * le 21/08, reconfirmées le 28/08 : seuls `avoidFeatures` — autoroute,
 * tunnel, pont —, `optimization` — fastest, shortest — et des étapes
 * intermédiaires). On ne peut donc pas lui dire « la D606 est barrée au
 * kilomètre 12 ».
 *
 * CE QU'ON FAIT À LA PLACE, ET QUI EST HONNÊTE. On lui demande PLUSIEURS
 * itinéraires depuis la position courante, avec des consignes qui ont des
 * chances de le faire sortir de la route actuelle — dont deux qui passent par
 * un point LATÉRAL, à quelques kilomètres de côté : le moteur accroche ce
 * point à la route la plus proche, ce qui force un vrai détour. Puis l'on
 * MESURE, sur les tracés rendus, lequel quitte la route actuelle le plus
 * tôt — et l'on écarte ceux qui n'en sortent pas du tout, ou qui n'en
 * sortent qu'après l'obstacle. Si aucun ne convient, on le DIT : proposer un
 * « bis » qui repasse par le même endroit serait pire que ne rien proposer.
 */
import { distanceM, distanceAuSegment } from './le-long-du-trajet';

/** Un itinéraire candidat, réduit à ce qui sert à le juger. */
export interface CandidatBis {
  cle: string;
  libelle: string;
  trace: [number, number][];
  distanceM: number;
  dureeS: number;
}

export interface ChoixBis {
  candidat: CandidatBis;
  /** Distance parcourue sur le bis avant de quitter la route actuelle. */
  divergenceM: number;
}

/* JUSQU'OÙ ON REGARDE. Un bis qui ne quitte la route qu'au bout de vingt
   kilomètres ne répond pas à la demande : l'obstacle est DEVANT, à quelques
   minutes. Six kilomètres, c'est trois à quatre minutes sur route et deux sur
   autoroute — le temps de voir le bouchon et d'avoir encore une sortie. */
export const PORTEE_BIS_M = 6_000;
/* CE QUI COMPTE COMME « QUITTÉ ». Soixante mètres : au-delà, on n'est plus
   sur la même chaussée — c'est le seuil déjà retenu pour dire qu'on a quitté
   son itinéraire (lib/guidage.ts en utilise 80 avec la marge du récepteur ;
   ici la mesure porte sur DEUX tracés calculés, sans bruit GPS). */
const ECART_QUITTE_M = 60;

const rad = (d: number) => (d * Math.PI) / 180;

/**
 * Un point à `distance` mètres sur le côté, devant soi — PURE.
 *
 * POURQUOI DEVANT ET SUR LE CÔTÉ : posé derrière, le point ferait faire
 * demi-tour ; posé pile devant, il retomberait sur la route actuelle. On
 * avance donc d'autant qu'on décale, en diagonale — le moteur accrochera ce
 * point à la route la plus proche, qui est par construction une AUTRE route.
 */
export function pointLateral(
  depuis: [number, number], capDeg: number, distance: number,
  cote: 'gauche' | 'droite',
): [number, number] {
  const biais = cote === 'droite' ? 45 : -45;
  const theta = rad(capDeg + biais);
  const mLat = 111_320;
  const mLon = 111_320 * Math.cos(rad(depuis[1]));
  /* Aux pôles le méridien se referme : sans garde, la longitude partirait à
     l'infini. La France n'y est pas, mais un tracé importé peut l'être. */
  if (mLon < 1) return depuis;
  return [
    depuis[0] + (distance * Math.sin(theta)) / mLon,
    depuis[1] + (distance * Math.cos(theta)) / mLat,
  ];
}

/** L'écart d'un point au tracé, en mètres — PURE. */
function ecartAuTrace(p: [number, number], trace: readonly [number, number][]): number {
  let mini = Infinity;
  for (let i = 0; i < trace.length - 1; i += 1) {
    const d = distanceAuSegment(p, trace[i]!, trace[i + 1]!).distance;
    if (d < mini) mini = d;
    // Déjà sur la route : inutile d'examiner les mille segments suivants.
    if (mini < ECART_QUITTE_M) return mini;
  }
  return mini;
}

/**
 * À quelle distance, sur le candidat, quitte-t-il la route actuelle — PURE.
 *
 * Rend `null` s'il ne la quitte JAMAIS dans la portée examinée : ce n'est
 * alors pas un bis, c'est le même trajet. On s'arrête à `PORTEE_BIS_M` des
 * deux côtés — au-delà la question ne se pose plus, et comparer deux tracés
 * entiers coûterait des millions de calculs pour rien.
 */
export function divergenceM(
  actuel: readonly [number, number][], candidat: readonly [number, number][],
  porteeM: number = PORTEE_BIS_M,
): number | null {
  if (actuel.length < 2 || candidat.length < 2) return null;
  const proche = tronquer(actuel, porteeM * 2);
  let cumul = 0;
  for (let i = 1; i < candidat.length; i += 1) {
    cumul += distanceM(candidat[i - 1]!, candidat[i]!);
    if (cumul > porteeM) return null;
    if (ecartAuTrace(candidat[i]!, proche) > ECART_QUITTE_M) return cumul;
  }
  return null;
}

/** Le début d'un tracé, jusqu'à `metres` — PURE. */
export function tronquer(
  trace: readonly [number, number][], metres: number,
): [number, number][] {
  const rendu: [number, number][] = [];
  let cumul = 0;
  for (let i = 0; i < trace.length; i += 1) {
    if (i > 0) cumul += distanceM(trace[i - 1]!, trace[i]!);
    rendu.push(trace[i]!);
    if (cumul > metres) break;
  }
  return rendu;
}

/**
 * Ce qui reste du tracé DEVANT soi, tronqué à la portée — PURE.
 *
 * POURQUOI PAS LE TRACÉ ENTIER : la divergence se mesure depuis la position
 * courante. Comparé au tracé complet, un bis qui revient sur ses pas cent
 * kilomètres plus loin paraîtrait « ne jamais quitter la route ». Et
 * comparer deux tracés entiers coûterait des millions de calculs pour une
 * question qui se joue sur six kilomètres.
 */
export function traceDevant(
  trace: readonly [number, number][], position: { lon: number; lat: number },
  porteeM: number = PORTEE_BIS_M * 2,
): [number, number][] {
  if (trace.length < 2) return [];
  let meilleur = { ecart: Infinity, index: 0 };
  for (let i = 0; i < trace.length - 1; i += 1) {
    const { distance } = distanceAuSegment([position.lon, position.lat], trace[i]!, trace[i + 1]!);
    if (distance < meilleur.ecart) meilleur = { ecart: distance, index: i };
  }
  return tronquer(trace.slice(meilleur.index), porteeM);
}

/**
 * Le meilleur bis parmi les candidats — PURE.
 *
 * L'ORDRE DE PRÉFÉRENCE DIT CE QU'ON CHERCHE : sortir TÔT d'abord (c'est
 * toute la demande — être dérouté avant l'obstacle, pas après), et à
 * divergence comparable, le plus rapide. « Comparable » vaut cinq cents
 * mètres : departager deux sorties à trente mètres près n'aurait aucun sens
 * sur le terrain, alors qu'un quart d'heure de trajet en a un.
 */
export function choisirBis(
  actuel: readonly [number, number][], candidats: readonly CandidatBis[],
  porteeM: number = PORTEE_BIS_M,
): ChoixBis | null {
  const juges: ChoixBis[] = [];
  for (const candidat of candidats) {
    const d = divergenceM(actuel, candidat.trace, porteeM);
    if (d !== null) juges.push({ candidat, divergenceM: d });
  }
  if (juges.length === 0) return null;
  juges.sort((x, y) => (Math.abs(x.divergenceM - y.divergenceM) > 500
    ? x.divergenceM - y.divergenceM
    : x.candidat.dureeS - y.candidat.dureeS));
  return juges[0] ?? null;
}
