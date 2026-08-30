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

/* ==========================================================================
   LE TRAFIC PARLÉ (TRAFIC-1, demande d'Armelin du 30/08)
   ========================================================================== */

/* TROIS KILOMÈTRES. Le bandeau, lui, affiche l'événement dix kilomètres
   avant : l'œil peut le lire quand il veut, la voix s'impose. À 130 km/h
   trois kilomètres font quatre-vingts secondes — le temps de décider sans
   avoir oublié à l'arrivée. */
export const PORTEE_TRAFIC_M = 3_000;

/* CE QUI PRIME SUR LE TRAFIC : la manœuvre. Tant qu'un virage est à moins
   d'un kilomètre, on se tait sur les travaux — l'annonce couperait
   l'instruction, ou pire, la remplacerait dans l'oreille de qui conduit. Un
   accident dans trois kilomètres attendra le prochain kilomètre de ligne
   droite. */
export const GARDE_MANOEUVRE_M = 1_000;

/** Un événement à portée de voix. */
export interface TraficADire {
  /** Position de l'événement le long du trajet, en mètres. */
  avancementM: number;
  libelle: string;
  distanceM: number;
}

/**
 * L'événement de trafic à annoncer maintenant, s'il y en a un — PURE.
 *
 * LA MANŒUVRE PASSE D'ABORD, TOUJOURS. C'est la règle qui manquait quand
 * cette fonctionnalité a été proposée : « il ne manque que la règle de quand
 * interrompre ». La voici — on n'interrompt pas, on attend.
 */
export function traficADire(
  evenements: readonly { avancementM: number; libelle: string }[],
  avancementM: number, distanceManoeuvreM: number,
  porteeM: number = PORTEE_TRAFIC_M,
): TraficADire | null {
  if (distanceManoeuvreM < GARDE_MANOEUVRE_M) return null;
  for (const e of evenements) {
    const devant = e.avancementM - avancementM;
    if (devant <= 0 || devant > porteeM) continue;
    return { avancementM: e.avancementM, libelle: e.libelle, distanceM: devant };
  }
  return null;
}

/**
 * La phrase d'un événement de trafic — PURE.
 *
 * « SIGNALÉ », ET LE MOT COMPTE : Bison Futé rapporte des déclarations, pas
 * des mesures. À l'écran, la source est écrite ; à l'oreille, l'adjectif la
 * remplace — dire « Bison Futé » à chaque annonce serait lourd, et taire
 * toute réserve serait faux.
 */
export function phraseTrafic(libelle: string, distanceM: number): string {
  const quoi = libelle.trim();
  if (quoi === '') return '';
  const distance = distanceDite('loin', distanceM);
  return `${quoi.charAt(0).toUpperCase()}${quoi.slice(1)} signalé ${distance}`;
}

/* ==========================================================================
   LES ARRÊTS DE RECHARGE PARLÉS (VOIX-2, demande d'Armelin du 30/08)
   ========================================================================== */

/* DEUX PALIERS, ET PAS TROIS. Dix kilomètres : le moment où l'on décide
   encore de s'arrêter avant, ou de pousser. Un kilomètre : le moment de
   mettre le clignotant. Entre les deux, il n'y a rien à décider — et une
   voix qui répète est une voix qu'on coupe. */
export const PALIERS_RECHARGE_M = [10_000, 1_000] as const;

/** Un arrêt de recharge à annoncer. */
export interface RechargeADire {
  avancementM: number;
  palier: number;
  distanceM: number;
  nom: string;
  reseau: string | null;
  dureeMin: number;
}

/**
 * L'arrêt de recharge à annoncer maintenant, s'il y en a un — PURE.
 *
 * MÊME GARDE QUE LE TRAFIC : la manœuvre passe d'abord. Un arrêt à dix
 * kilomètres attendra la fin du virage ; l'inverse serait absurde.
 */
export function rechargeADire(
  arrets: readonly { avancementM: number; nom: string; reseau: string | null; dureeMin: number }[],
  avancementM: number, distanceManoeuvreM: number,
): RechargeADire | null {
  if (distanceManoeuvreM < GARDE_MANOEUVRE_M) return null;
  for (const a of arrets) {
    const devant = a.avancementM - avancementM;
    if (devant <= 0) continue;
    /* LE PALIER FRANCHI, du plus proche au plus lointain — même logique que
       les manœuvres : c'est le dernier franchi qui vaut. */
    const palier = [...PALIERS_RECHARGE_M].reverse().find((p) => devant <= p);
    if (palier === undefined) continue;
    return {
      avancementM: a.avancementM, palier, distanceM: devant,
      nom: a.nom, reseau: a.reseau, dureeMin: a.dureeMin,
    };
  }
  return null;
}

/**
 * La phrase d'un arrêt de recharge — PURE.
 *
 * TROIS CHOSES, ET DANS CET ORDRE : quand, où, combien de temps. C'est
 * l'ordre dans lequel la question se pose au volant — « c'est loin ? »,
 * « c'est où ? », « ça dure ? ». Le réseau vient avec le nom quand il
 * existe : « Ionity » dit plus long que « aire de Beaune ».
 */
export function phraseRecharge(r: RechargeADire): string {
  const morceaux = [`Arrêt recharge ${distanceDite('loin', r.distanceM)}`];
  const ou = r.reseau && !r.nom.toLowerCase().includes(r.reseau.toLowerCase())
    ? `${r.reseau} ${r.nom}` : r.nom;
  if (ou.trim() !== '') morceaux.push(ou.trim());
  if (r.dureeMin > 0) morceaux.push(`${Math.round(r.dureeMin)} minutes de charge`);
  return morceaux.join(', ');
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

  /* LE MOTIF EST UN TEXTE LIBRE, et non le seul palier : le trafic se note
     dans la même mémoire, sous son propre motif. Deux mémoires séparées
     auraient deux fois les mêmes défauts à corriger. */

  /** Vrai si ce motif n'a pas encore été dit pour ce point du trajet. */
  aDire(reference: number, motif: Palier | 'trafic' | `recharge-${number}`): boolean {
    return !this.#dites.has(`${Math.round(reference)}-${motif}`);
  }

  noter(reference: number, motif: Palier | 'trafic' | `recharge-${number}`): void {
    this.#dites.add(`${Math.round(reference)}-${motif}`);
  }

  /** Tout oublier — au démarrage d'un suivi, ou après un recalcul. */
  vider(): void {
    this.#dites.clear();
  }
}
