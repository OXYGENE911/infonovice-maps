// LES QUATRE FAÇONS DE PARTIR — voiture, moto, vélo, à pied (MODE-1, 03/09).
//
// LE TERRAIN. Armelin, 03/09 : « "Je roule en deux-roue" devrait plutôt se
// situer dans "Options du trajet" à côté de "Voiture" et "À pieds", et il
// faudrait ajouter un bouton "Moto" et un bouton "Vélo". »
//
// IL A RAISON SUR LE RANGEMENT. « Je roule en deux-roues » était une case à
// cocher dans « Mon véhicule » — un panneau qui parle de batterie, de
// consommation et de masse. Or ce n'est pas une propriété du véhicule qu'on
// possède : c'est une réponse à « comment je pars aujourd'hui », et cette
// question-là a déjà son endroit.
//
// CE QUE LE MOTEUR PUBLIC SAIT FAIRE, REMESURÉ LE 03/09. Le service
// d'itinéraire de la Géoplateforme répond, dans ses propres mots, sur les
// TROIS ressources (`bdtopo-osrm`, `bdtopo-pgr`, `bdtopo-valhalla`) :
//
//     Parameter 'profile' is invalid: value should be one of car,pedestrian
//
// Il n'y a donc TOUJOURS PAS de profil vélo, un an après le constat de la
// PR #5. Un backend BRouter coûterait de l'argent : la contrainte 1 l'interdit.
//
// D'OÙ QUATRE BOUTONS ET DEUX GRAPHES. Voiture et moto partagent le graphe
// routier ; vélo et marche partagent le graphe piéton, qui suit les chemins et
// les pistes plutôt que les voies rapides. Ce n'est PAS un calcul cycliste :
// le graphe piéton ignore les sens interdits levés pour les vélos, et il
// autorise des escaliers qu'on ne monte pas à vélo. On le DIT, plutôt que de
// laisser croire à un moteur qu'on n'a pas.

import type { Profil } from './itineraire';

/* LE MODE SE GARDE. « Je roule en deux-roues » était un fait durable, coché
   une fois dans « Mon véhicule » ; en devenant un bouton de trajet, il ne doit
   pas se perdre à chaque rechargement — sinon on aurait remplacé un réglage
   par une corvée. */
export const PREF_MODE = 'mode-deplacement';

/** Comment on part — ce que l'usager choisit, pas ce que le moteur connaît. */
export type Mode = 'voiture' | 'moto' | 'velo' | 'pied';

export const MODES: Record<Mode, string> = {
  voiture: 'Voiture',
  moto: 'Moto',
  velo: 'Vélo',
  pied: 'À pied',
};

export const TOUS_LES_MODES: readonly Mode[] = ['voiture', 'moto', 'velo', 'pied'];

/**
 * Le profil que le moteur accepte — PURE.
 *
 * DEUX VALEURS, PARCE QU'IL N'EN EXISTE QUE DEUX. La moto emprunte le réseau
 * routier comme une voiture ; le vélo suit le graphe piéton, faute de mieux.
 */
export function profilDe(mode: Mode): Profil {
  return mode === 'voiture' || mode === 'moto' ? 'car' : 'pedestrian';
}

/** Le mode roule-t-il sur deux roues motorisées ? — PURE. */
export function estDeuxRoues(mode: Mode): boolean {
  return mode === 'moto';
}

/* LA VITESSE DE RÉFÉRENCE À VÉLO. Quinze kilomètres-heure, c'est la vitesse
   moyenne retenue par le Cerema pour les déplacements cyclables urbains — et
   c'est un ORDRE DE GRANDEUR, pas une promesse : le relief, le vent et le
   chargement pèsent davantage que le tracé. L'interface écrit le chiffre à
   côté de la durée, pour que personne ne prenne l'estimation pour une mesure. */
export const VITESSE_VELO_KMH = 15;

/**
 * La durée d'un trajet à vélo, en secondes — PURE.
 *
 * LE MOTEUR REND UNE DURÉE DE PIÉTON, sur une distance de piéton. La distance
 * vaut : c'est le même chemin. La durée, non — quatre kilomètres à pied font
 * une heure, à vélo un quart d'heure. On garde donc la distance et l'on refait
 * le temps.
 */
export function dureeVelo(distanceM: number): number {
  if (!Number.isFinite(distanceM) || distanceM <= 0) return 0;
  return (distanceM / 1000) / VITESSE_VELO_KMH * 3600;
}

/**
 * La durée à afficher pour ce mode — PURE.
 *
 * Les trois autres modes rendent la durée du moteur telle quelle : c'est LUI
 * qui sait ce que vaut une côte en voiture ou un feu à pied.
 */
export function dureePour(mode: Mode, distanceM: number, dureeMoteurS: number): number {
  return mode === 'velo' ? dureeVelo(distanceM) : dureeMoteurS;
}

/* LE JETON DU LIEN DE PARTAGE. Les liens déjà partagés portent `car` ou
   `pedestrian` : ils doivent continuer d'ouvrir exactement le même trajet.
   Voiture et marche gardent donc leur ancien jeton, et les deux modes neufs
   en prennent un à eux. */
const JETONS: Record<Mode, string> = {
  voiture: 'car', moto: 'moto', velo: 'velo', pied: 'pedestrian',
};

/** Le jeton d'un mode dans le fragment de partage — PURE. */
export function jetonDe(mode: Mode): string {
  return JETONS[mode];
}

/**
 * Le mode lu du stockage — PURE, défensive.
 *
 * `ancienneCaseMoto` est la case « Je roule en deux-roues » de MOTO-1 : qui
 * l'avait cochée retrouve « Moto » sans rien refaire. Elle ne sert QUE tant
 * qu'aucun mode n'a été choisi depuis ; après, le choix explicite l'emporte.
 */
export function versMode(brut: unknown, ancienneCaseMoto = false): Mode {
  if (typeof brut === 'string') {
    const trouve = TOUS_LES_MODES.find((m) => m === brut);
    if (trouve) return trouve;
  }
  return ancienneCaseMoto ? 'moto' : 'voiture';
}

/**
 * Le mode que porte un jeton de lien — PURE, `null` si on ne le connaît pas.
 *
 * `car` et `pedestrian` sont les anciennes graphies : un lien de la semaine
 * dernière rouvre sur « Voiture » ou « À pied », ce qu'il a toujours voulu
 * dire.
 */
export function modeDuJeton(jeton: string): Mode | null {
  for (const m of TOUS_LES_MODES) if (JETONS[m] === jeton) return m;
  return null;
}
