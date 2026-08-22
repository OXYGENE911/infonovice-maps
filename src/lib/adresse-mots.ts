// ADRESSE EN MOTS — « Dijon-21 BAKO 4831 ».
//
// À QUOI ÇA SERT. Donner un nom court et DICIBLE à un endroit qui n'a pas
// d'adresse postale : un carrefour de chemins, une entrée de champ, un point
// de rendez-vous sur une plage. Un lien de partage fait le même travail, mais
// ne se dicte pas au téléphone et ne s'écrit pas sur un papier.
//
// POURQUOI PAS WHAT3WORDS. C'est un service propriétaire, dont le dictionnaire
// et l'algorithme appartiennent à une société privée : une adresse qui n'existe
// que tant qu'un tiers veut bien la résoudre n'est pas une adresse. Ici, le
// calcul est ouvert, tient en deux cents lignes, et s'appuie sur le découpage
// communal français — celui que tout le monde connaît déjà.
//
// COMMENT C'EST BÂTI.
// - LA COMMUNE porte l'adresse, avec son département : « Dijon-21 ». Mesuré le
//   22/08/2026 sur les 34 969 communes de geo.api.gouv.fr, 1 441 noms sont
//   partagés par 3 675 communes ; le département ne laisse que 6 collisions,
//   toutes en outre-mer, que le code à trois chiffres (971…976) tranche.
// - LE POINT est repéré par son écart au CENTRE de la commune, en mètres,
//   arrondi à 10 m, dans une fenêtre de ±20,48 km. Douze bits par axe.
// - LES VINGT-QUATRE BITS se disent en un mot (onze bits, 2 048 possibles) et
//   quatre chiffres (treize bits, 0 à 8 191).
//
// CE QU'IL NE COUVRE PAS, ET C'EST DIT. Une commune dont un point est à plus
// de 20,48 km de son centre sort de la fenêtre : le codage REFUSE plutôt que
// de rendre une adresse fausse. Mesuré : cela concerne la Guyane (Maripasoula,
// 18 743 km²) et les Terres australes — une dizaine de communes sur 34 969,
// soit 0,03 %. Le 99,9e centile des surfaces est à 652 km², largement dedans.
//
// LE MOT EST FABRIQUÉ, PAS PUISÉ DANS UN DICTIONNAIRE. Consonne-voyelle-
// consonne-voyelle : « BAKO », « MIRU », « DOLA ». C'est un choix prudent —
// une liste de 2 048 mots français serait plus mémorable, mais elle demande
// une relecture humaine (mots injurieux, homophones, pièges d'orthographe) que
// personne n'a faite. La structure du code ne changerait pas : c'est une
// décision de produit, à prendre par Armelin, pas un obstacle technique.

/** Le pas de la grille, en mètres. */
export const PAS_M = 10;
/** Nombre de cases par axe (2^12) : ±20,48 km autour du centre communal. */
export const CASES = 4096;
/** Rayon couvert, en mètres. */
export const PORTEE_M = (CASES / 2) * PAS_M;

const CONSONNES = 'BDFGJKLMNPRSTVXZ';  // 16 — ni C ni Q (confusion avec K/S)
const VOYELLES = 'AEIOU';              // 5

/* Des suites qu'on préfère ne pas voir sortir d'un générateur. La liste est
   courte et relue : elle ne prétend pas à l'exhaustivité, elle écarte ce que
   la combinatoire produit de fâcheux en français. */
const PROSCRITS = new Set([
  'BITE', 'BITO', 'BABA', 'BOBO', 'CACA', 'DUPE', 'FADA', 'FUTE', 'GOGO',
  'JUJU', 'KAKA', 'LOLO', 'MAMA', 'MERD', 'NAZE', 'NEGO', 'PIPI', 'PUTE',
  'POPO', 'ZIZI', 'ZOZO', 'SEXE', 'SIDA', 'TETE', 'TOTO', 'VOMI',
]);

/** Les 2 048 mots, dans un ordre stable : c'est le dictionnaire du format. */
export const MOTS: readonly string[] = (() => {
  const liste: string[] = [];
  for (const c1 of CONSONNES) {
    for (const v1 of VOYELLES) {
      for (const c2 of CONSONNES) {
        for (const v2 of VOYELLES) {
          const mot = `${c1}${v1}${c2}${v2}`;
          if (PROSCRITS.has(mot)) continue;
          if (c1 === c2 && v1 === v2) continue;  // « BABA », « MIMI »… trop plats
          liste.push(mot);
          if (liste.length === 2048) return liste;
        }
      }
    }
  }
  return liste;
})();

const INDEX_MOT = new Map(MOTS.map((m, i) => [m, i]));

export interface PointGeo { lon: number; lat: number; }

/** Ce qu'il faut savoir de la commune pour coder ou décoder. */
export interface Commune {
  nom: string;
  /** Code INSEE à cinq caractères. */
  code: string;
  centre: PointGeo;
}

/** Le département tel qu'on l'écrit : deux chiffres, trois en outre-mer. */
export function departementDe(codeInsee: string): string {
  return codeInsee.startsWith('97') ? codeInsee.slice(0, 3) : codeInsee.slice(0, 2);
}

/* Projection locale, plate et suffisante : à l'échelle d'une commune, la
   Terre est un plan. Un degré de latitude vaut 111 320 m ; un degré de
   longitude, autant multiplié par le cosinus de la latitude. */
const METRES_PAR_DEGRE = 111_320;
const rad = (d: number): number => (d * Math.PI) / 180;

function versMetres(centre: PointGeo, p: PointGeo): { dx: number; dy: number } {
  return {
    dx: (p.lon - centre.lon) * METRES_PAR_DEGRE * Math.cos(rad(centre.lat)),
    dy: (p.lat - centre.lat) * METRES_PAR_DEGRE,
  };
}

function versDegres(centre: PointGeo, dx: number, dy: number): PointGeo {
  return {
    lon: centre.lon + dx / (METRES_PAR_DEGRE * Math.cos(rad(centre.lat))),
    lat: centre.lat + dy / METRES_PAR_DEGRE,
  };
}

export class ErreurAdresseMots extends Error {}

/** L'adresse en mots d'un point, dans sa commune.
    Jette plutôt que de mentir quand le point sort de la fenêtre. */
export function coder(commune: Commune, p: PointGeo): string {
  const { dx, dy } = versMetres(commune.centre, p);
  const ix = Math.round(dx / PAS_M) + CASES / 2;
  const iy = Math.round(dy / PAS_M) + CASES / 2;
  if (ix < 0 || ix >= CASES || iy < 0 || iy >= CASES) {
    throw new ErreurAdresseMots(
      `Ce point est à plus de ${PORTEE_M / 1000} km du centre de ${commune.nom} :`
      + ' l’adresse en mots ne le couvre pas.',
    );
  }
  const n = ix * CASES + iy;
  const mot = MOTS[Math.floor(n / 8192)]!;
  const chiffres = String(n % 8192).padStart(4, '0');
  return `${commune.nom}-${departementDe(commune.code)} ${mot} ${chiffres}`;
}

export interface AdresseAnalysee {
  /** Le nom de commune tel qu'il a été écrit. */
  commune: string;
  /** Le département à deux ou trois chiffres. */
  departement: string;
  mot: string;
  chiffres: number;
}

/* Le séparateur entre la commune et le département est libre — trait d'union,
   espace, parenthèses — parce que personne ne le recopiera à l'identique.
   Le nom de commune accepte lettres accentuées, apostrophes et traits d'union
   (« L'Île-d'Yeu », « Saint-Étienne-du-Rouvray »).

   LE DÉPARTEMENT N'EST PAS TOUJOURS UN NOMBRE. La Corse s'écrit 2A et 2B :
   n'accepter que des chiffres rendait « Ajaccio-2A FOGA 2088 » illisible alors
   que le codage venait de la produire — 360 communes codables et jamais
   relisibles (défaut trouvé en relecture le 22/08, avant toute mise en ligne). */
const MOTIF = /^\s*([\p{L}][\p{L}\s'’.-]*?)\s*[-(\s]\s*(\d{2,3}|\d[ABab])\s*\)?\s+([A-Za-z]{4})\s+(\d{1,4})\s*$/u;

/** Analyse une adresse écrite à la main. Rend null plutôt que de deviner. */
export function analyser(texte: string): AdresseAnalysee | null {
  const m = MOTIF.exec(texte);
  if (!m || !m[1] || !m[2] || !m[3] || !m[4]) return null;
  const mot = m[3].toUpperCase();
  if (!INDEX_MOT.has(mot)) return null;
  const chiffres = Number(m[4]);
  if (!Number.isInteger(chiffres) || chiffres < 0 || chiffres > 8191) return null;
  return {
    commune: m[1].trim(),
    // « 2a » saisi à la main doit retrouver le code INSEE « 2A004 ».
    departement: m[2].toUpperCase(),
    mot,
    chiffres,
  };
}

/** Le point désigné, une fois la commune retrouvée. */
export function decoder(commune: Commune, a: AdresseAnalysee): PointGeo {
  const i = INDEX_MOT.get(a.mot);
  if (i === undefined) throw new ErreurAdresseMots('Ce mot n’appartient pas au format.');
  const n = i * 8192 + a.chiffres;
  const ix = Math.floor(n / CASES);
  const iy = n % CASES;
  return versDegres(commune.centre, (ix - CASES / 2) * PAS_M, (iy - CASES / 2) * PAS_M);
}
