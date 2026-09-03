// LA MARGE DE PRUDENCE DES VALEURS CONSTRUCTEUR (MARGE-1, 03/09).
//
// LE TERRAIN. Armelin, rapportant ses testeurs sur la 1.60 : « l'algorithme
// s'améliore mais reste encore 5 % plus optimiste que ce qu'ils constatent en
// réel sur leur véhicule PAR RAPPORT AUX CARACTÉRISTIQUES CONSTRUCTEURS
// CHARGÉES PAR DÉFAUT en terme d'autonomie et rayon d'action. Ils préfèrent
// tous avoir un navigateur GPS pessimiste de 5 % qu'optimiste de 5 %. »
// C'est une mesure de terrain — plusieurs conducteurs, plusieurs véhicules —
// et la préférence vient d'eux : tomber en panne à cause d'un modèle flatteur
// coûte une dépanneuse ; arriver avec 5 % de plus que prévu ne coûte rien.
//
// OÙ ELLE S'APPLIQUE, ET POURQUOI LÀ. Trois emplacements ont été essayés :
//
//  1. Au cœur de la physique (`consommationAjustee`, `autonomies`) : VINGT
//     tests d'arrêts sont tombés — pas sur des chiffres, sur des STRUCTURES.
//     Des plans devenaient infaisables, des bornes élues changeaient. Ces
//     tests sont la spécification de l'algèbre du plan, et la marge n'est pas
//     de l'algèbre.
//
//  2. À l'entrée du planificateur et des anneaux : le modèle se mettait alors
//     à CONTREDIRE les relevés réels de l'usager — il tape « 400 km mesurés
//     en ville », le bilan répond 381. Or les testeurs visent les valeurs
//     CONSTRUCTEUR, pas leurs propres mesures : punir de 5 % celui qui a
//     mesuré serait punir l'exactitude.
//
//  3. LÀ OÙ LE CATALOGUE PROPOSE SES AUTONOMIES — l'endroit exact que les
//     testeurs nomment. Les valeurs pré-remplies sont abaissées de 5 % AVANT
//     d'entrer dans les champs : l'usager les VOIT, peut les corriger, et
//     tout l'aval (bilan, plan, anneaux, SOC d'arrivée) raconte la même
//     voiture sans seconde correction ni double compte.

/** Autonomies constructeur divisées par 1,05 : 5 % pessimiste, comme demandé. */
export const FACTEUR_PRUDENCE = 1.05;

/** Une autonomie constructeur vue avec prudence, en kilomètres — PURE. */
export function kmPrudents(km: number): number {
  return Number.isFinite(km) && km > 0 ? Math.round(km / FACTEUR_PRUDENCE) : 0;
}
