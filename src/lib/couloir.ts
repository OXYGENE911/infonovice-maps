// LE COULOIR HORS LIGNE — quelles tuiles emporter avant de partir.
//
// LA DEMANDE (étude CoMaps / OsmAnd du 05/09, quatrième emprunt) : « le
// service worker sait déjà mettre en cache ; il manque le geste et la jauge ».
// Ce fichier ne télécharge rien : il DIT quelles tuiles couvrent une bande le
// long du tracé, et combien elles sont. Le reste — les requêtes, la jauge,
// l'arrêt — vit dans src/carte/couloir-hors-ligne.ts.
//
// POURQUOI SÉPARER. Le calcul est de l'arithmétique sphérique : il se teste à
// sec, sans navigateur et sans réseau, et c'est le seul endroit où une erreur
// coûterait cher — une tuile oubliée fait un trou dans la carte au milieu du
// tunnel, et une tuile de trop est une requête prise à un service public.
//
// « CES QUOTAS SONT UN BIEN COMMUN » : le plafond n'est pas une précaution de
// façade. Un couloir de 465 km à tous les zooms jusqu'à 16 demanderait des
// dizaines de milliers de tuiles ; on s'arrête et on le DIT plutôt que de
// servir en silence une carte à trous.
import { distanceM } from './le-long-du-trajet';

/** Une tuile, dans le repère XYZ du WMTS Géoplateforme (TILEMATRIXSET=PM). */
export interface TuileXYZ {
  z: number;
  x: number;
  y: number;
}

/** La circonférence de la Terre à l'équateur, en mètres (WGS 84). */
const TOUR_M = 40_075_016.686;

/**
 * La tuile qui contient ce point — PURE.
 *
 * C'est la formule « slippy map » classique. Le Y est celui de Mercator, donc
 * il passe par le logarithme de la tangente : l'écrire de tête est le plus sûr
 * moyen de décaler toute la carte d'une tuile vers le nord.
 */
export function tuileDe(lon: number, lat: number, z: number): TuileXYZ {
  const n = 2 ** z;
  const phi = (lat * Math.PI) / 180;
  const x = Math.floor(((lon + 180) / 360) * n);
  const y = Math.floor(((1 - Math.log(Math.tan(phi) + 1 / Math.cos(phi)) / Math.PI) / 2) * n);
  const borne = (v: number): number => Math.min(n - 1, Math.max(0, v));
  return { z, x: borne(x), y: borne(y) };
}

/** Le côté d'une tuile, en mètres, à cette latitude et ce zoom — PURE. */
export function coteTuileM(lat: number, z: number): number {
  return (TOUR_M * Math.cos((lat * Math.PI) / 180)) / 2 ** z;
}

export interface OptionsCouloir {
  /** Les niveaux de zoom à emporter, du plus large au plus fin. */
  zooms: readonly number[];
  /** Demi-largeur du couloir, en mètres, de part et d'autre du tracé. */
  demiLargeurM: number;
  /** Plafond de tuiles. Atteint, on s'arrête — et l'appelante le dit. */
  plafond: number;
}

export interface Couloir {
  tuiles: TuileXYZ[];
  /** Vrai quand le plafond a coupé la liste : la carte aurait des trous. */
  tronque: boolean;
}

/** Réglage par défaut : de la vue d'ensemble au niveau des routes. */
export const COULOIR_PAR_DEFAUT: OptionsCouloir = {
  /* JUSQU'À 13 ET PAS AU-DELÀ. Mesuré sur Paris–Lyon : le 14 double le
     nombre de tuiles pour un détail qui ne sert qu'en ville, et la ville est
     justement l'endroit où l'on a du réseau. Le 8 donne la vue d'ensemble
     qui permet de se resituer quand on est perdu. */
  zooms: [8, 9, 10, 11, 12, 13],
  /* DEUX KILOMÈTRES DE PART ET D'AUTRE : de quoi voir la sortie qu'on vient
     de manquer et la route parallèle, sans emporter le département. */
  demiLargeurM: 2_000,
  plafond: 1_200,
};

/**
 * Les tuiles d'un couloir le long du tracé — PURE, déterministe.
 *
 * L'ÉCHANTILLONNAGE EST LA SEULE SUBTILITÉ. Un tracé d'itinéraire donne des
 * points espacés de façon très inégale : quelques mètres dans un giratoire,
 * plusieurs kilomètres sur une autoroute rectiligne. Se contenter des points
 * fournis laisserait des tuiles entières sans être demandées entre deux
 * sommets — un trou au milieu de la carte, exactement là où l'on roule le plus
 * vite. On repique donc le tracé à intervalle régulier, plus court que le côté
 * d'une tuile.
 *
 * LES ZOOMS SONT TRAITÉS DU PLUS LARGE AU PLUS FIN, et ce n'est pas
 * indifférent : si le plafond coupe, il vaut mieux avoir toute la vue
 * d'ensemble et un détail partiel que l'inverse.
 */
export function tuilesDuCouloir(
  trace: readonly [number, number][], options: OptionsCouloir = COULOIR_PAR_DEFAUT,
): Couloir {
  const vues = new Set<string>();
  const tuiles: TuileXYZ[] = [];
  if (trace.length === 0) return { tuiles, tronque: false };

  const latMoyenne = trace.reduce((s, p) => s + p[1], 0) / trace.length;

  for (const z of [...options.zooms].sort((a, b) => a - b)) {
    const cote = coteTuileM(latMoyenne, z);
    const pas = Math.max(50, cote / 2);
    const rayon = Math.ceil(options.demiLargeurM / cote);

    for (const point of echantillonner(trace, pas)) {
      const centre = tuileDe(point[0], point[1], z);
      const n = 2 ** z;
      for (let dx = -rayon; dx <= rayon; dx += 1) {
        for (let dy = -rayon; dy <= rayon; dy += 1) {
          const x = centre.x + dx;
          const y = centre.y + dy;
          if (x < 0 || y < 0 || x >= n || y >= n) continue;
          const cle = `${z}/${x}/${y}`;
          if (vues.has(cle)) continue;
          if (tuiles.length >= options.plafond) return { tuiles, tronque: true };
          vues.add(cle);
          tuiles.push({ z, x, y });
        }
      }
    }
  }
  return { tuiles, tronque: false };
}

/** Repique un tracé à intervalle régulier, en mètres — PURE. */
export function* echantillonner(
  trace: readonly [number, number][], pasM: number,
): Generator<[number, number]> {
  const premier = trace[0];
  if (!premier) return;
  yield premier;
  /* La distance qu'il reste à parcourir avant le prochain point repiqué. Elle
     traverse les segments : un tracé fait de sommets rapprochés ne doit pas
     produire un point par sommet. */
  let reste = pasM;
  for (let i = 1; i < trace.length; i += 1) {
    const a = trace[i - 1]!;
    const b = trace[i]!;
    const d = distanceM(a, b);
    if (d === 0) continue;
    let parcouru = 0;
    while (parcouru + reste <= d) {
      parcouru += reste;
      const t = parcouru / d;
      yield [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      reste = pasM;
    }
    reste -= d - parcouru;
  }
  const dernier = trace[trace.length - 1];
  if (dernier) yield dernier;
}

/** L'URL d'une tuile à partir du gabarit MapLibre `{z}/{x}/{y}` — PURE. */
export function urlDeTuile(gabarit: string, t: TuileXYZ): string {
  return gabarit
    .replace('{z}', String(t.z))
    .replace('{x}', String(t.x))
    .replace('{y}', String(t.y));
}

/**
 * Le poids d'une tuile, en octets — 58 Ko, MESURÉ LE 08/09/2026 sur seize
 * tuiles réelles réparties le long de Paris–Lyon, aux zooms 10 à 13 (de 24 à
 * 96 Ko selon la densité).
 *
 * Le chiffre de 47 Ko qui traînait ailleurs datait du 22/08 et portait sur des
 * zooms plus larges : annoncer 45 Mo là où l'usager en télécharge 55 aurait
 * été une promesse tenue à la baisse, ce qui reste une promesse fausse.
 */
export const OCTETS_PAR_TUILE = 58_000;

/** « environ 18 Mo » — PURE, pour annoncer AVANT de télécharger. */
export function poidsEnMots(nombre: number): string {
  const mo = (nombre * OCTETS_PAR_TUILE) / 1_000_000;
  return mo >= 10 ? `${Math.round(mo)} Mo` : `${mo.toFixed(1).replace('.', ',')} Mo`;
}
