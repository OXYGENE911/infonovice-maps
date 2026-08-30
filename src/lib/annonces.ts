/* CE QU'IL FAUT DIRE, ET QUAND — la logique du guidage vocal.
 *
 * LA DEMANDE. Armelin, le 30/08/2026 : « fais le guidage vocal ».
 *
 * CE MODULE NE PARLE PAS : il décide. La voix est une affaire de navigateur
 * (carte/voix.ts) ; ce qui se dit, à quelle distance, et surtout ce qui ne se
 * dit PAS, sont des règles — donc elles se testent à sec.
 *
 * POURQUOI UNE ÉCHELLE D'ANNONCES, ET PAS UNE PHRASE CONTINUE. Un GPS qui
 * parle sans cesse finit coupé, et un GPS coupé ne prévient plus de rien. On
 * annonce donc à des PALIERS — loin, puis près, puis au moment — et JAMAIS
 * deux fois le même palier pour la même manœuvre.
 *
 * ET L'ON SE TAIT SUR CE QUI NE SE JOUE PAS. « Continuez tout droit » sur
 * quinze kilomètres d'autoroute n'apprend rien ; l'annoncer userait
 * l'attention qu'il faudra avoir à la sortie. Les manœuvres droites ne sont
 * annoncées qu'à l'arrivée ou dans un giratoire, où « tout droit » veut dire
 * « la deuxième sortie ».
 */
import type { Manoeuvre } from './feuille-de-route';
import { libelleRang } from './giratoire';

/** Un palier d'annonce, du plus lointain au plus proche. */
export type Palier = 'loin' | 'proche' | 'maintenant';

/* LES PALIERS, EN MÈTRES. Mille mètres : sur autoroute c'est trente
   secondes, en ville c'est deux carrefours avant — assez tôt pour se
   déporter. Trois cents : la dernière occasion de changer de file. Cinquante :
   on y est. Ce sont les distances des GPS du commerce, et elles sont
   éprouvées par l'usage ; les inventer autrement serait de la coquetterie. */
export const PALIERS: readonly { palier: Palier; metres: number }[] = [
  { palier: 'loin', metres: 1_000 },
  { palier: 'proche', metres: 300 },
  { palier: 'maintenant', metres: 50 },
];

/**
 * Le palier atteint à cette distance — PURE.
 *
 * ON N'ANNONCE PAS UN PALIER PLUS LOIN QUE L'ÉTAPE ELLE-MÊME : dire « dans
 * un kilomètre, tournez à droite » quand la manœuvre précédente était à
 * trois cents mètres ferait se succéder deux annonces contradictoires. Le
 * palier doit tenir dans la longueur de l'étape.
 */
export function palierA(distanceM: number, longueurEtapeM: number): Palier | null {
  /* ON PARCOURT DU PLUS PROCHE AU PLUS LOIN, et l'ordre est tout : le palier
     courant est le DERNIER franchi, pas le premier de la liste. Parcourue à
     l'endroit, la boucle rendait « loin » jusqu'au dernier mètre — la voix
     n'aurait jamais dit « dans 300 mètres ». Trouvé par un test. */
  for (let i = PALIERS.length - 1; i >= 0; i -= 1) {
    const { palier, metres } = PALIERS[i]!;
    if (distanceM > metres) continue;
    if (metres > longueurEtapeM && palier !== 'maintenant') continue;
    return palier;
  }
  return null;
}

/** Ce qu'on sait de la manœuvre à venir, au moment de la formuler. */
export interface ContexteAnnonce {
  manoeuvre: Manoeuvre;
  /** Le rang dans le giratoire, quand c'en est un. */
  rangGiratoire?: number | null;
  /** Le numéro de sortie d'autoroute — « 14 ». */
  sortie?: string | null;
  /** Les villes desservies, dans l'ordre du panneau. */
  villes?: readonly string[];
  /** La voie qu'on prend : « A7 ». */
  voie?: string;
}

/* CE QUE CHAQUE MANŒUVRE SE DIT. Le vocabulaire est celui de la route, pas
   celui du service : on ne dit pas « effectuez un virage à droite » mais
   « tournez à droite », qui est ce qu'un passager dirait. */
const MOTS: Partial<Record<Manoeuvre, string>> = {
  right: 'tournez à droite',
  left: 'tournez à gauche',
  'slight right': 'serrez à droite',
  'slight left': 'serrez à gauche',
  'sharp right': 'tournez franchement à droite',
  'sharp left': 'tournez franchement à gauche',
  uturn: 'faites demi-tour',
  arrivee: 'vous êtes arrivé',
};

/** La distance, dite comme on la dit — PURE. */
export function distanceDite(palier: Palier, distanceM: number): string {
  if (palier === 'maintenant') return '';
  if (distanceM >= 1_000) {
    const km = distanceM / 1_000;
    /* « UN KILOMÈTRE », PAS « 1,0 KILOMÈTRE » : une voix qui épelle des
       décimales est fatigante, et la précision est fausse de toute façon —
       le récepteur a dix mètres d'incertitude. */
    return km < 1.15 ? 'dans un kilomètre' : `dans ${Math.round(km)} kilomètres`;
  }
  return `dans ${Math.round(distanceM / 100) * 100} mètres`;
}

/**
 * La phrase à dire, ou `''` s'il n'y a rien à dire — PURE.
 *
 * L'ORDRE EST CELUI DE L'URGENCE : la distance d'abord (elle situe), puis la
 * manœuvre, puis ce qui la précise — le numéro de sortie et la destination.
 * Un passager dit « dans trois cents mètres, sortez à droite, sortie 14 vers
 * Lyon » ; il ne dit pas « sortie 14, dans trois cents mètres, à droite ».
 */
export function phraseAnnonce(
  palier: Palier, distanceM: number, contexte: ContexteAnnonce,
): string {
  const morceaux: string[] = [];
  const distance = distanceDite(palier, distanceM);
  if (distance !== '') morceaux.push(distance);

  if (contexte.rangGiratoire !== undefined && contexte.rangGiratoire !== null) {
    morceaux.push(libelleRang(contexte.rangGiratoire).toLowerCase());
  } else if (contexte.manoeuvre === 'rond-point') {
    morceaux.push('au rond-point, prenez votre sortie');
  } else {
    const mot = MOTS[contexte.manoeuvre];
    /* RIEN À DIRE N'EST PAS UNE PHRASE VIDE : c'est le silence. « Continuez
       tout droit » sur quinze kilomètres userait l'attention qu'il faudra
       avoir à la sortie. */
    if (mot === undefined) return '';
    morceaux.push(mot);
  }

  if (contexte.sortie) morceaux.push(`sortie ${contexte.sortie}`);
  const villes = (contexte.villes ?? []).slice(0, 2);
  if (villes.length > 0) morceaux.push(`vers ${villes.join(', ')}`);
  else if (contexte.voie) morceaux.push(`vers ${contexte.voie}`);

  const phrase = morceaux.join(', ');
  return phrase.charAt(0).toUpperCase() + phrase.slice(1);
}

/**
 * La mémoire de ce qui a déjà été dit.
 *
 * LA CLÉ EST L'AVANCEMENT DE LA MANŒUVRE, pas son texte : deux virages à
 * droite successifs portent la même phrase et ne sont pas la même manœuvre.
 * Arrondie au mètre, elle survit au tremblement du récepteur.
 */
export class MemoireAnnonces {
  #dites = new Set<string>();

  /** Vrai si ce palier n'a pas encore été dit pour cette manœuvre. */
  aDire(manoeuvreM: number, palier: Palier): boolean {
    return !this.#dites.has(`${Math.round(manoeuvreM)}-${palier}`);
  }

  noter(manoeuvreM: number, palier: Palier): void {
    this.#dites.add(`${Math.round(manoeuvreM)}-${palier}`);
  }

  /** Tout oublier — au démarrage d'un suivi, ou après un recalcul. */
  vider(): void {
    this.#dites.clear();
  }
}
