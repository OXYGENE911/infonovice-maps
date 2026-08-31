/* SIMPLIFIER UN TRACÉ SANS S'EN ÉLOIGNER — Douglas-Peucker, PURE.
 *
 * LE DÉFAUT QUE CE MODULE CORRIGE, ET IL ÉTAIT GRAVE (31/08). Armelin : « un
 * rond-point où le GPS m'a demandé de tourner à droite au lieu de m'indiquer
 * un schéma de rond-point ». En remontant, ce n'était pas le détecteur de
 * giratoires — sur les données réelles il trouve les deux anneaux du trajet,
 * rangs 4 et 1. C'était la REQUÊTE qui ne rapportait RIEN.
 *
 * LA MESURE, sur son type de trajet (820 m de rue de banlieue) :
 *
 *   pas de 300 m (livré) →  4 points →  0 anneau,  0 limite
 *   pas de 100 m         →  9 points →  5 anneaux, 0 limite
 *   pas de  25 m         → 18 points →  5 anneaux, 1 limite
 *
 * POURQUOI. `around` d'Overpass mesure la distance à la POLYLIGNE qu'on lui
 * donne. Un point tous les trois cents mètres coupe les virages : la corde
 * s'écarte de la vraie route de bien plus que les vingt-cinq mètres cherchés,
 * et la route n'est plus dans le couloir. Tout le corridor disparaît —
 * limites de vitesse, numéros de sortie, destinations, giratoires,
 * affectation par voie — SANS QUE RIEN NE LE DISE.
 *
 * Sur autoroute la route est droite, la simplification ne coûte rien : c'est
 * pourquoi le panneau de vitesse marchait parfois. Le défaut ne se voyait
 * qu'en ville, là où la conduite est la plus exigeante.
 *
 * POURQUOI DOUGLAS-PEUCKER ET NON UN PAS PLUS FIN. Un pas fixe assez fin pour
 * les virages produit des milliers de points sur les lignes droites — et l'on
 * sait depuis le 31/08 qu'une requête trop grosse expire chez un service
 * bénévole. Douglas-Peucker GARANTIT l'écart : aucun point du tracé d'origine
 * ne s'éloigne de plus d'`epsilon` de la polyligne rendue. Les longues
 * droites d'autoroute retombent à deux points, les virages en gardent autant
 * qu'il en faut. On paie des points là où ils servent, nulle part ailleurs.
 */
import { distanceM } from './le-long-du-trajet';

/**
 * La distance d'un point au SEGMENT [a, b], en mètres — PURE.
 *
 * AU SEGMENT, PAS À LA DROITE : au-delà d'une extrémité, c'est l'extrémité
 * qui est le point le plus proche. Mesurer à la droite infinie
 * sous-estimerait l'écart aux abords d'un virage serré, là précisément où
 * l'on a besoin de la garantie.
 */
export function distanceAuSegment(
  p: readonly [number, number],
  a: readonly [number, number],
  b: readonly [number, number],
): number {
  /* ON TRAVAILLE EN MÈTRES LOCAUX : un degré de longitude vaut moins qu'un
     degré de latitude dès qu'on quitte l'équateur, et raisonner en degrés
     écraserait les distances est-ouest. */
  const mLat = 111_320;
  const mLon = 111_320 * Math.cos((a[1] * Math.PI) / 180);
  const ax = 0; const ay = 0;
  const bx = (b[0] - a[0]) * mLon; const by = (b[1] - a[1]) * mLat;
  const px = (p[0] - a[0]) * mLon; const py = (p[1] - a[1]) * mLat;
  const dx = bx - ax; const dy = by - ay;
  const carre = dx * dx + dy * dy;
  if (carre === 0) return Math.hypot(px, py);
  // La projection, bornée au segment.
  const t = Math.max(0, Math.min(1, (px * dx + py * dy) / carre));
  return Math.hypot(px - t * dx, py - t * dy);
}

/**
 * Simplifie un tracé en garantissant l'écart maximal — PURE.
 *
 * AUCUN POINT ÉCARTÉ NE S'ÉLOIGNE DE PLUS D'`epsilon` de la polyligne rendue.
 * C'est cette garantie qui vaut : elle permet de choisir `epsilon` sous le
 * rayon de recherche, et de savoir que la route restera dans le couloir.
 *
 * Les extrémités sont toujours gardées : un corridor qui ne part pas du
 * départ ne couvre pas les premiers mètres, ceux où l'on démarre.
 */
export function simplifier(
  trace: readonly [number, number][], epsilon: number,
): [number, number][] {
  if (trace.length <= 2) return trace.map((p) => [...p] as [number, number]);

  /* ITÉRATIF, JAMAIS RÉCURSIF. Un tracé de trente mille points — un
     Paris-Marseille en rend vingt-huit mille — ferait déborder la pile sur
     une récursion par point. La pile explicite ne déborde pas. */
  const garder = new Uint8Array(trace.length);
  garder[0] = 1;
  garder[trace.length - 1] = 1;
  const pile: [number, number][] = [[0, trace.length - 1]];

  while (pile.length > 0) {
    const [debut, fin] = pile.pop()!;
    let pire = 0;
    let index = -1;
    for (let i = debut + 1; i < fin; i += 1) {
      const d = distanceAuSegment(trace[i]!, trace[debut]!, trace[fin]!);
      if (d > pire) { pire = d; index = i; }
    }
    if (index >= 0 && pire > epsilon) {
      garder[index] = 1;
      pile.push([debut, index], [index, fin]);
    }
  }

  const rendu: [number, number][] = [];
  for (let i = 0; i < trace.length; i += 1) if (garder[i]) rendu.push([...trace[i]!]);
  return rendu;
}

/**
 * L'écart maximal réellement introduit par une simplification — PURE.
 *
 * ELLE EXISTE POUR ÊTRE MESURÉE. Une garantie qu'on ne vérifie pas est une
 * promesse, et le mandat du projet en interdit une qui ne serait pas mesurée.
 */
export function ecartMaximal(
  origine: readonly [number, number][], simplifie: readonly [number, number][],
): number {
  if (simplifie.length < 2) return Infinity;
  let pire = 0;
  for (const p of origine) {
    let meilleur = Infinity;
    for (let i = 0; i < simplifie.length - 1; i += 1) {
      meilleur = Math.min(meilleur, distanceAuSegment(p, simplifie[i]!, simplifie[i + 1]!));
      if (meilleur === 0) break;
    }
    pire = Math.max(pire, meilleur);
  }
  return pire;
}

/**
 * Découpe une liste de points en paquets d'au plus `max` — PURE.
 *
 * LES PAQUETS SE RECOUVRENT D'UN POINT : sans ce recouvrement, le segment à
 * cheval sur la couture n'appartiendrait à aucun paquet, et le couloir aurait
 * un trou là où l'on roule.
 */
export function paqueter(
  points: readonly [number, number][], max: number,
): [number, number][][] {
  if (points.length <= max) return points.length >= 2 ? [points.map((p) => [...p] as [number, number])] : [];
  const rendu: [number, number][][] = [];
  for (let i = 0; i < points.length - 1; i += max - 1) {
    const bout = points.slice(i, i + max).map((p) => [...p] as [number, number]);
    if (bout.length >= 2) rendu.push(bout);
  }
  return rendu;
}

/** La longueur d'un tracé, en mètres — PURE. */
export function longueurM(trace: readonly [number, number][]): number {
  let l = 0;
  for (let i = 1; i < trace.length; i += 1) l += distanceM(trace[i - 1]!, trace[i]!);
  return l;
}
