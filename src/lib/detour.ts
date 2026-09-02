// QUAND LE SERVICE PROPOSE UN DÉTOUR, ET CE QU'ON PEUT EN FAIRE
// (ROUTE-1, 02/09).
//
// LE TERRAIN. Armelin, premier retour utilisateur : « j'essaye un de mes
// itinéraires fréquents domicile - parents. Là je ne comprends pas
// l'itinéraire… qui me fait faire presque 200 km de plus que le trajet des
// autres GPS. » Vérifié : Saumur → Montignac-Lascaux rend **492 km** chez nous
// contre 345 km partout ailleurs, en contournant Poitiers par Vierzon.
//
// CE N'EST PAS NOTRE CALCUL, ET CE N'EST PAS UNE CONSOLATION. Le service
// public d'itinéraire rend ces 492 km sur ses TROIS moteurs — OSRM, Valhalla
// et pgRouting. J'ai décomposé pour comprendre (02/09) :
//
//   Paris → Lyon (autoroute)      466 km / 4 h 46   réel 465 / 4 h 30   ×1,06
//   Paris → Marseille (autoroute) 775 km / 8 h 09   réel 775 / 7 h 20   ×1,12
//   Poitiers → Limoges (N147)     130 km / 2 h 25   réel 122 / 1 h 45   ×1,51
//
// LE MOTEUR EST JUSTE SUR AUTOROUTE ET SURESTIME DE MOITIÉ LE TEMPS SUR LES
// NATIONALES. Le détour par Vierzon en est la conséquence arithmétique : il
// fuit un corridor qu'il croit lent. On ne peut pas corriger le graphe d'IGN —
// mais on peut PROPOSER l'autre trajet, et dire ce qu'il coûte.
//
// CE QU'ON FAIT, DONC.
//
//   1. UN DÉTECTEUR GRATUIT. Le rapport entre la distance par la route et le
//      vol d'oiseau. Il ne coûte AUCUNE requête, et c'est ce qui permet de
//      n'en dépenser que sur les trajets suspects.
//   2. DEUX REQUÊTES, SEULEMENT ALORS. Le trajet « le plus court » du service,
//      puis un « le plus rapide » CONTRAINT à passer par trois points de son
//      tracé. Le résultat suit le corridor direct tout en empruntant les
//      routes rapides qui s'y trouvent.
//   3. UNE PROPOSITION, JAMAIS UN REMPLACEMENT. On montre les deux chiffres,
//      l'usager choisit. Remplacer d'office ferait de nous le juge d'un graphe
//      public — et il nous arrivera de nous tromper.
//
// CE QUE J'AI MESURÉ SUR SEPT TRAJETS (02/09) :
//
//   Saumur → Montignac    492 → 318 km   (−174)   proposé
//   Saumur → Poitiers     166 →  98 km   (−68)    proposé
//   Poitiers → Grenoble   685 → 560 km   (−125)   proposé
//   Lyon → Nice           477 → 436 km   (−41)    écarté : 8,6 %
//   Lille → Strasbourg    554 → 535 km   (−19)    écarté
//   Clermont → Toulouse   376 → 363 km   (−13)    écarté
//   Paris → Lyon          466 → 499 km   (+33)    écarté : PIRE
//
// LA RÈGLE DE PROPOSITION EN DÉCOULE : au moins un dixième de la distance ET
// au moins vingt-cinq kilomètres. Elle garde les trois vrais cas et écarte les
// quatre autres, Paris → Lyon compris, où le « direct » est plus long.

import type { PointGeo } from './coordonnees';

/* AU-DELÀ DE CE RAPPORT, ON REGARDE DE PLUS PRÈS. Mesuré sur quatorze
   trajets français : les liaisons autoroutières ordinaires tiennent entre 1,10
   et 1,36 ; la montagne monte à 1,60 (Lyon → Nice) et 1,54 (Poitiers →
   Grenoble). Le seuil de 1,5 laisse donc passer quelques trajets de montagne —
   ils coûteront deux requêtes pour rien, et la règle du gain les écartera.
   C'est le bon sens du compromis : mieux vaut deux requêtes inutiles qu'un
   usager envoyé 165 km trop loin. */
export const RATIO_SUSPECT = 1.5;

/** Part de distance qu'il faut gagner pour que la proposition vaille. */
export const GAIN_MIN_PART = 0.1;

/** Et le gain absolu minimal, en mètres : dix pour cent de 200 km comptent. */
export const GAIN_MIN_M = 25_000;

/** Les fractions du tracé court retenues comme points de passage. */
export const RELAIS: readonly number[] = [0.25, 0.5, 0.75];

const RAYON_TERRE_M = 6_371_008.8;
const RAD = Math.PI / 180;

/** Distance à vol d'oiseau, en mètres — PURE. */
export function volDOiseauM(a: PointGeo, b: PointGeo): number {
  const dLat = (b.lat - a.lat) * RAD;
  const dLon = (b.lon - a.lon) * RAD;
  const s = Math.sin(dLat / 2) ** 2
    + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * RAYON_TERRE_M * Math.asin(Math.sqrt(s));
}

/**
 * Le rapport entre la route proposée et le vol d'oiseau — PURE.
 *
 * `0` quand les deux extrémités se confondent : un rapport n'a alors pas de
 * sens, et rendre l'infini ferait crier au détour sur place.
 */
export function ratioDetour(distanceM: number, depart: PointGeo, arrivee: PointGeo): number {
  const vol = volDOiseauM(depart, arrivee);
  if (!(vol > 0) || !Number.isFinite(distanceM) || distanceM <= 0) return 0;
  return distanceM / vol;
}

/**
 * Faut-il chercher un trajet plus direct ? — PURE.
 *
 * C'EST LA SEULE GARDE AVANT DE DÉPENSER DEUX REQUÊTES, et elle ne coûte
 * rien : deux coordonnées et une racine carrée.
 */
export function meriteUneAlternative(
  distanceM: number, depart: PointGeo, arrivee: PointGeo,
): boolean {
  return ratioDetour(distanceM, depart, arrivee) > RATIO_SUSPECT;
}

/**
 * La proposition vaut-elle d'être montrée ? — PURE.
 *
 * DEUX CONDITIONS, ET LES DEUX SONT NÉCESSAIRES. Le pourcentage seul
 * proposerait un gain de 8 km sur un trajet de 60 ; les kilomètres seuls
 * proposeraient 26 km sur un trajet de 700, où ils ne se voient pas.
 */
export function vautLaPeine(rapideM: number, directM: number): boolean {
  if (!(rapideM > 0) || !(directM > 0)) return false;
  const gain = rapideM - directM;
  return gain >= GAIN_MIN_M && gain >= rapideM * GAIN_MIN_PART;
}

/**
 * Les points de passage tirés d'un tracé — PURE.
 *
 * ILS SE PRENNENT À DES FRACTIONS DE LA LONGUEUR, pas du nombre de points :
 * un tracé est dense en ville et clairsemé sur autoroute, et le milieu du
 * tableau n'est pas le milieu du chemin.
 *
 * TROIS ET PAS UN : mesuré sur Saumur → Montignac, un seul relais rend 449 km,
 * deux en rendent 386 et trois 318. Un relais unique laisse le moteur
 * reprendre son détour de part et d'autre.
 */
export function relaisDuTrace(
  trace: readonly [number, number][], fractions: readonly number[] = RELAIS,
): PointGeo[] {
  if (trace.length < 2) return [];
  const cumul: number[] = [0];
  for (let i = 1; i < trace.length; i += 1) {
    const a = trace[i - 1]!; const b = trace[i]!;
    cumul.push(cumul[i - 1]! + volDOiseauM(
      { lon: a[0], lat: a[1] }, { lon: b[0], lat: b[1] },
    ));
  }
  const total = cumul[cumul.length - 1]!;
  if (!(total > 0)) return [];
  const points: PointGeo[] = [];
  for (const f of fractions) {
    const vise = total * f;
    let i = cumul.findIndex((d) => d >= vise);
    if (i < 0) i = trace.length - 1;
    const p = trace[i]!;
    points.push({ lon: p[0], lat: p[1] });
  }
  return points;
}

/** La phrase de la proposition — PURE. */
export function phraseAlternative(rapideM: number, directM: number): string {
  const km = (m: number): number => Math.round(m / 1000);
  return `Un trajet plus direct existe : ${km(directM)} km au lieu de`
    + ` ${km(rapideM)}.`;
}
