/* LE SCHÉMA DE ROND-POINT — dessiné d'après la géométrie, faute de moteur.
 *
 * LA DEMANDE. Armelin, le 29/08/2026 : « pourquoi pas afficher des schémas
 * complexes pour indiquer un rond-point » ; puis, le 30/08 : « fais le
 * schéma de rond-point ».
 *
 * CE QUE LES MOTEURS NE DISENT PAS, ET C'EST MESURÉ DEUX FOIS. Le service
 * d'itinéraire n'émet JAMAIS `roundabout` ni `rotary` : vérifié le 29/08 sur
 * quatre giratoires (63 étapes), puis le 30/08 sur les DEUX moteurs — osrm
 * et valhalla — traversant le même giratoire de Chartres. Neuf étapes d'un
 * côté, sept de l'autre, aucune ne nomme le rond-point : on lit « tournez à
 * droite » quatre fois de suite. Le décodeur du projet sait pourtant lire
 * `instruction.exit` depuis GUID-1 : c'est le service qui se tait.
 *
 * D'OÙ VIENT CE QU'ON DESSINE. D'OpenStreetMap, comme les sorties
 * d'autoroute — et du TRACÉ LUI-MÊME. Overpass rend l'anneau
 * (`junction=roundabout`) ET ses branches dans le MÊME appel (deux `out` en
 * une requête, mesuré le 30/08 : 0,45 s, 18 Ko sur un corridor de 4 km).
 * Le reste est de la géométrie :
 *
 *   - par où l'on ENTRE et par où l'on SORT : c'est notre propre tracé qui
 *     le dit, pas une supposition ;
 *   - dans quel SENS on tourne : la somme des virages du tracé DANS l'anneau
 *     — on ne présume pas le sens français, on le mesure, ce qui vaut aussi
 *     pour un anneau mal numérisé ;
 *   - le RANG de la sortie : on ordonne les branches autour du centre depuis
 *     notre entrée, dans notre sens de rotation, et l'on compte.
 *
 * ET QUAND LA GÉOMÉTRIE NE TRANCHE PAS, ON NE COMPTE PAS. Le rang vaut
 * `null` si aucune branche ne correspond à notre sortie : le schéma se
 * dessine quand même — il montre l'anneau et notre sortie, ce qui est vrai —
 * mais il n'annonce pas « la troisième » quand on ne sait pas compter.
 */
import { distanceM } from './le-long-du-trajet';

/** Un giratoire traversé, tel qu'on saura le dessiner. */
export interface Giratoire {
  /** Avancement de l'entrée dans l'anneau, en mètres. */
  entreeM: number;
  /** Avancement de la sortie, en mètres. */
  sortieM: number;
  /**
   * Les branches, en degrés depuis NOTRE entrée et dans NOTRE sens de
   * rotation : 0 est la route d'où l'on vient, et les valeurs croissent dans
   * l'ordre où on les rencontre. L'entrée elle-même n'y figure pas.
   */
  branches: number[];
  /** Notre sortie, dans le même repère. */
  sortie: number;
  /** Le rang de notre sortie (1 = la première), ou `null` si indécidable. */
  rang: number | null;
}

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** Le cap du centre vers un point, en degrés (0 = nord) — PURE. */
export function capVers(centre: [number, number], point: [number, number]): number {
  const mLon = 111_320 * Math.cos(rad(centre[1]));
  const dx = (point[0] - centre[0]) * mLon;
  const dy = (point[1] - centre[1]) * 111_320;
  return (deg(Math.atan2(dx, dy)) + 360) % 360;
}

/** L'écart d'angle ramené dans (-180, 180] — PURE. */
export function ecartAngle(a: number, b: number): number {
  let d = ((a - b + 540) % 360) - 180;
  if (d === -180) d = 180;
  return d;
}

/* CE QUI COMPTE COMME « DANS L'ANNEAU ». Vingt mètres au-delà du rayon : un
   giratoire de bourg fait quinze mètres de rayon, un échangeur soixante, et
   le tracé calculé ne suit pas exactement l'axe numérisé. */
const MARGE_ANNEAU_M = 20;
/* CE QUI COMPTE COMME « ATTACHÉ À L'ANNEAU » pour une branche : douze mètres
   entre son extrémité et un point de l'anneau. */
const ATTACHE_M = 12;
/* DEUX BRANCHES À MOINS DE DIX-HUIT DEGRÉS N'EN FONT QU'UNE : une route à
   deux chaussées séparées arrive en deux voies OSM distinctes, et ce n'est
   qu'UNE sortie pour qui conduit. */
const FUSION_BRANCHES_DEG = 18;
/* AU-DELÀ, CE N'EST PAS NOTRE SORTIE : vingt-cinq degrés d'écart entre le
   cap de notre tracé et celui d'une branche. */
const TOLERANCE_SORTIE_DEG = 25;

export interface Anneau {
  points: [number, number][];
  centre: [number, number];
  rayonM: number;
}

/** Regroupe les chemins d'anneau : un giratoire est souvent découpé — PURE. */
function grouperAnneaux(chemins: [number, number][][]): Anneau[] {
  const groupes: [number, number][][][] = [];
  for (const c of chemins) {
    if (c.length === 0) continue;
    const centre = barycentre(c);
    const proche = groupes.find((g) => distanceM(barycentre(g.flat()), centre) < 60);
    if (proche) proche.push(c);
    else groupes.push([c]);
  }
  return groupes.map((g) => {
    const points = g.flat();
    const centre = barycentre(points);
    const rayonM = points.reduce((s, p) => s + distanceM(centre, p), 0) / points.length;
    return { points, centre, rayonM };
  });
}

function barycentre(points: readonly [number, number][]): [number, number] {
  const n = points.length || 1;
  return [
    points.reduce((s, p) => s + p[0], 0) / n,
    points.reduce((s, p) => s + p[1], 0) / n,
  ];
}

/** Une branche de giratoire, avec ce qui dit si l'on peut y entrer. */
export interface Branche {
  points: [number, number][];
  /* LE SENS UNIQUE, TEL QU'OSM L'ÉCRIT : `yes` va du premier au dernier
     point, `-1` l'inverse. Une branche à sens unique qui ARRIVE sur l'anneau
     n'est pas une sortie — c'est un sens interdit. */
  sensUnique: 0 | 1 | -1;
}

/** Extrait d'une réponse Overpass les anneaux et les branches — PURE. */
export function lireAnneaux(elements: readonly unknown[]): {
  anneaux: [number, number][][]; branches: Branche[];
} {
  const anneaux: [number, number][][] = [];
  const branches: Branche[] = [];
  const vus = new Set<unknown>();
  for (const brut of elements) {
    if (typeof brut !== 'object' || brut === null) continue;
    const e = brut as {
      type?: string; id?: unknown; tags?: Record<string, string>;
      geometry?: { lon: number; lat: number }[];
    };
    if (e.type !== 'way' || !Array.isArray(e.geometry) || e.geometry.length < 2) continue;
    /* LES DEUX `out` DE LA REQUÊTE RENDENT L'ANNEAU DEUX FOIS : une fois
       comme anneau, une fois parmi les chemins qui touchent ses nœuds. Sans
       ce garde-fou, chaque anneau compterait double. */
    if (vus.has(e.id)) continue;
    vus.add(e.id);
    const points = e.geometry.map((p) => [p.lon, p.lat] as [number, number]);
    if (e.tags?.['junction'] === 'roundabout') anneaux.push(points);
    else if (e.tags?.['highway']) branches.push({ points, sensUnique: lireSensUnique(e.tags) });
  }
  return { anneaux, branches };
}

/** Le sens unique d'un chemin — PURE. */
export function lireSensUnique(tags: Record<string, string>): 0 | 1 | -1 {
  const v = (tags['oneway'] ?? '').trim().toLowerCase();
  if (v === 'yes' || v === 'true' || v === '1') return 1;
  if (v === '-1' || v === 'reverse') return -1;
  /* `junction=roundabout` implique le sens unique — mais l'anneau n'est pas
     une branche, et ce cas ne passe donc pas par ici. */
  return 0;
}

/**
 * Les giratoires traversés par le tracé — PURE.
 *
 * TOUT SE DÉDUIT DE DEUX CHOSES : l'anneau (OpenStreetMap) et notre tracé.
 * On ne demande au moteur ni le sens, ni le rang, ni même de nommer le
 * rond-point — il ne sait rien dire de tout cela.
 */
export function versGiratoires(
  elements: readonly unknown[], trace: readonly [number, number][],
): Giratoire[] {
  if (trace.length < 3) return [];
  const { anneaux: bruts, branches } = lireAnneaux(elements);
  const cumul: number[] = [0];
  for (let i = 1; i < trace.length; i += 1) {
    cumul.push(cumul[i - 1]! + distanceM(trace[i - 1]!, trace[i]!));
  }

  const rendu: Giratoire[] = [];
  for (const anneau of grouperAnneaux(bruts)) {
    const dedans = (p: [number, number]) =>
      distanceM(anneau.centre, p) <= anneau.rayonM + MARGE_ANNEAU_M;
    let premier = -1;
    let dernier = -1;
    for (let i = 0; i < trace.length; i += 1) {
      if (!dedans(trace[i]!)) continue;
      if (premier < 0) premier = i;
      dernier = i;
    }
    /* IL FAUT ENTRER ET SORTIR : un tracé qui frôle l'anneau sans le
       traverser (la route d'à côté) n'a pas de sortie à annoncer. */
    if (premier < 1 || dernier >= trace.length - 1 || dernier - premier < 1) continue;

    const capEntree = capVers(anneau.centre, trace[premier - 1]!);
    const capSortie = capVers(anneau.centre, trace[dernier + 1]!);

    /* LE SENS SE MESURE, IL NE SE PRÉSUME PAS. On somme les virages du tracé
       DANS l'anneau : positif, on tourne dans le sens des aiguilles ; négatif,
       dans l'autre. La France roule à droite, donc à l'envers des aiguilles —
       mais un anneau mal numérisé ou un pays voisin ne s'en soucient pas. */
    let sens = 0;
    for (let i = premier; i < dernier; i += 1) {
      sens += ecartAngle(
        capVers(anneau.centre, trace[i + 1]!), capVers(anneau.centre, trace[i]!),
      );
    }
    const signe = sens >= 0 ? 1 : -1;
    /** Un cap ramené en degrés parcourus depuis l'entrée, dans notre sens. */
    const depuisEntree = (cap: number): number =>
      (signe * ecartAngle(cap, capEntree) + 360) % 360;

    const angles: number[] = [];
    for (const branche of branches) {
      const attache = attacheSurAnneau(branche.points, anneau);
      if (attache === null) continue;
      /* UNE SORTIE INTERDITE N'EST PAS UNE SORTIE (ROND-2, 30/08). Armelin,
         au volant : « le schéma de sortie était bon, sauf que la première
         sortie était un sens interdit. Techniquement, le GPS aurait dû
         m'indiquer de sortir à la première sortie AUTORISÉE ». Il a raison,
         et c'est un défaut de comptage : on comptait toutes les branches, y
         compris celles où l'on ne peut pas s'engager. */
      if (!estSortiePraticable(branche, anneau)) continue;
      const a = depuisEntree(capVers(anneau.centre, attache));
      /* LA BRANCHE D'OÙ L'ON VIENT N'EST PAS UNE SORTIE : elle est à zéro
         degré, c'est-à-dire là où l'on entre. */
      if (a < FUSION_BRANCHES_DEG || a > 360 - FUSION_BRANCHES_DEG) continue;
      if (angles.some((v) => Math.abs(v - a) < FUSION_BRANCHES_DEG)) continue;
      angles.push(a);
    }
    angles.sort((x, y) => x - y);

    const sortie = depuisEntree(capSortie);
    /* LE RANG EST CELUI DE LA BRANCHE QUI CORRESPOND À NOTRE SORTIE. Aucune
       ne correspond : on dessine sans compter, plutôt que de compter faux. */
    let rang: number | null = null;
    for (let i = 0; i < angles.length; i += 1) {
      if (Math.abs(angles[i]! - sortie) <= TOLERANCE_SORTIE_DEG) { rang = i + 1; break; }
    }

    rendu.push({
      entreeM: cumul[premier]!,
      sortieM: cumul[dernier]!,
      branches: angles,
      sortie,
      rang,
    });
  }
  return rendu.sort((a, b) => a.entreeM - b.entreeM);
}

/**
 * Peut-on SORTIR par cette branche — PURE.
 *
 * LE RAISONNEMENT EST CELUI DU CONDUCTEUR. Une branche à double sens est
 * toujours une sortie. Une branche à sens unique ne l'est que si la
 * circulation s'en éloigne de l'anneau : si elle y ARRIVE, c'est une entrée,
 * et s'y engager serait un sens interdit.
 *
 * On regarde donc PAR QUEL BOUT la branche touche l'anneau. Le sens `yes` va
 * du premier point au dernier : si c'est le DERNIER qui touche, la
 * circulation va vers l'anneau — interdit. Et `-1` renverse tout.
 */
export function estSortiePraticable(branche: Branche, anneau: Anneau): boolean {
  if (branche.sensUnique === 0) return true;
  const debutTouche = anneau.points.some(
    (q) => distanceM(branche.points[0]!, q) < ATTACHE_M,
  );
  const finTouche = anneau.points.some(
    (q) => distanceM(branche.points[branche.points.length - 1]!, q) < ATTACHE_M,
  );
  /* LES DEUX BOUTS TOUCHENT : la branche fait le tour et revient. On ne
     tranche pas — et l'on préfère la compter, pour ne pas faire disparaître
     une sortie réelle. */
  if (debutTouche && finTouche) return true;
  const sortDuDebut = branche.sensUnique === 1;
  return debutTouche ? sortDuDebut : !sortDuDebut;
}

/** Le point d'une branche qui touche l'anneau, ou `null` — PURE. */
function attacheSurAnneau(
  branche: readonly [number, number][], anneau: Anneau,
): [number, number] | null {
  for (const bout of [0, branche.length - 1]) {
    const p = branche[bout]!;
    if (!anneau.points.some((q) => distanceM(p, q) < ATTACHE_M)) continue;
    /* ON VISE LE LARGE, PAS L'ATTACHE : le point de contact est SUR l'anneau,
       donc son cap depuis le centre est celui de l'anneau, pas celui de la
       branche. On s'éloigne de vingt mètres le long de la branche. */
    const sens = bout === 0 ? 1 : -1;
    for (let i = bout + sens; i >= 0 && i < branche.length; i += sens) {
      if (distanceM(p, branche[i]!) >= 20) return branche[i]!;
    }
    return branche[bout === 0 ? branche.length - 1 : 0]!;
  }
  return null;
}

/* LA FENÊTRE : on annonce le giratoire dont l'entrée est devant nous, à
   moins de neuf cents mètres — le même seuil que la chaussée et les sorties,
   parce que c'est la même question : « que dois-je faire tout de suite ? » */
export function giratoireA(
  giratoires: readonly Giratoire[], avancementM: number, porteeM = 900,
): Giratoire | null {
  let plusProche: Giratoire | null = null;
  for (const g of giratoires) {
    /* On le garde tant qu'on n'en est pas SORTI : au milieu de l'anneau, le
       schéma est encore ce qu'on a de plus utile sous les yeux. */
    if (g.sortieM < avancementM) continue;
    const devant = g.entreeM - avancementM;
    if (devant > porteeM) continue;
    if (!plusProche || g.entreeM < plusProche.entreeM) plusProche = g;
  }
  return plusProche;
}

/** Le rang en toutes lettres — pour qui ÉCOUTE la page. */
export function libelleRang(rang: number | null): string {
  if (rang === null) return 'Prenez votre sortie au rond-point';
  if (rang === 1) return 'Au rond-point, prenez la première sortie';
  return `Au rond-point, prenez la ${rang}e sortie`;
}

/**
 * Le rang tel qu'il s'ÉCRIT dans le panneau — PURE.
 *
 * PLUS COURT QUE CE QUI SE DIT, et c'est mesuré : « Prenez la première
 * sortie » faisait passer le cartouche du numéro de route à la ligne
 * suivante (vu sur capture). « 1re » tient, et se lit d'un coup d'œil au
 * volant — c'est d'ailleurs ce qu'écrivent les panneaux. La version longue
 * reste pour le lecteur d'écran, où la place ne coûte rien.
 */
export function libelleRangCourt(rang: number | null): string {
  if (rang === null) return 'Prenez votre sortie';
  return `Prenez la ${rang === 1 ? '1re' : `${rang}e`} sortie`;
}
