/* LA MÉMOIRE DES ZONES DÉJÀ CHERCHÉES — ce qui rend l'automatisme acceptable.
 *
 * LA DEMANDE. Armelin, le 31/08/2026 : « ce serait bien que les POI
 * sélectionnés s'affichent tout seuls, dès lors où le niveau de zoom est
 * suffisant dans la zone et de façon dynamique en se déplaçant dans la carte
 * […] Cela évitera d'avoir à cliquer sur un bouton de recherche. Plus c'est
 * simple pour l'utilisateur et plus facile sera l'adoption. »
 *
 * LA RÉSERVE QU'IL FALLAIT LEVER, PAS CONTOURNER. Le mandat du projet
 * interdit de marteler les communs bénévoles, et Overpass en est un. Une
 * carte qui interroge à chaque déplacement en ferait exactement l'abus qu'on
 * s'interdit — et un aller-retour entre deux rues redemanderait deux fois la
 * même chose.
 *
 * CE MODULE EST LA RÉPONSE : on se souvient de CE QU'ON A DÉJÀ COUVERT. Une
 * vue déjà contenue dans une zone cherchée ne redemande RIEN. Revenir sur ses
 * pas est alors gratuit, et l'automatisme ne coûte au service que les
 * territoires réellement nouveaux.
 *
 * ON CHERCHE PLUS LARGE QU'ON NE REGARDE, aussi : un petit déplacement reste
 * dans la zone couverte, là où une recherche calée sur la vue exacte
 * repartirait au moindre glissement du doigt.
 */

/** Une emprise géographique, en degrés. */
export interface Emprise {
  ouest: number;
  sud: number;
  est: number;
  nord: number;
}

/* DE COMBIEN ON CHERCHE PLUS LARGE QUE LA VUE. 1,6 : la zone cherchée couvre
   la vue et une demi-vue de marge de chaque côté, ce qui absorbe les petits
   déplacements sans demander une emprise si vaste que le plafond de lieux
   tomberait avant d'avoir rendu le voisinage. */
export const FACTEUR_MARGE = 1.6;

/* COMBIEN DE ZONES ON GARDE EN MÉMOIRE. Douze : de quoi traverser une ville
   sans réinterroger, sans faire grossir indéfiniment une liste qu'on parcourt
   à chaque déplacement de carte. */
export const ZONES_GARDEES = 12;

/** Élargit une emprise autour de son centre — PURE. */
export function elargir(e: Emprise, facteur = FACTEUR_MARGE): Emprise {
  const demiLargeur = ((e.est - e.ouest) * facteur) / 2;
  const demiHauteur = ((e.nord - e.sud) * facteur) / 2;
  const lon = (e.ouest + e.est) / 2;
  const lat = (e.sud + e.nord) / 2;
  return {
    ouest: lon - demiLargeur,
    est: lon + demiLargeur,
    /* LES PÔLES ET LES BORDS SONT BORNÉS : une emprise qui déborde de la
       sphère ferait une requête que le service refuse — et un refus se lit
       comme une panne. */
    sud: Math.max(-90, lat - demiHauteur),
    nord: Math.min(90, lat + demiHauteur),
  };
}

/** Vrai si `petite` tient entièrement dans `grande` — PURE. */
export function contient(grande: Emprise, petite: Emprise): boolean {
  return grande.ouest <= petite.ouest && grande.est >= petite.est
    && grande.sud <= petite.sud && grande.nord >= petite.nord;
}

/** Vrai si le point tombe dans l'emprise — PURE. */
export function dansEmprise(e: Emprise, p: { lon: number; lat: number }): boolean {
  return p.lon >= e.ouest && p.lon <= e.est && p.lat >= e.sud && p.lat <= e.nord;
}

/**
 * Vrai si la vue est déjà couverte par une recherche précédente — PURE.
 *
 * C'EST LA GARDE QUI PROTÈGE LE SERVICE : tant qu'elle répond vrai, aucune
 * requête ne part, quel que soit le nombre de déplacements.
 */
export function estCouverte(vue: Emprise, zones: readonly Emprise[]): boolean {
  return zones.some((z) => contient(z, vue));
}

/**
 * Ajoute une zone à la mémoire — PURE, rend une nouvelle liste.
 *
 * LES ZONES AVALÉES DISPARAISSENT : garder une zone déjà contenue dans la
 * nouvelle ferait grossir la liste sans rien couvrir de plus. La plus récente
 * passe en tête, parce que c'est là qu'on cherchera le plus souvent.
 */
export function memoriser(
  zones: readonly Emprise[], zone: Emprise, garde = ZONES_GARDEES,
): Emprise[] {
  const restantes = zones.filter((z) => !contient(zone, z));
  return [zone, ...restantes].slice(0, garde);
}
