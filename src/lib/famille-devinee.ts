// LA FAMILLE D'UN RÉSULTAT DE RECHERCHE, DEVINÉE À SON NOM (PICTO-2, 03/09).
//
// LE TERRAIN. Armelin, en 1.60 : « dans la barre de recherche principale,
// quand je tape une adresse, le résultat s'affiche mais ce serait bien
// d'afficher un logo de POI si l'adresse de destination est détectée comme
// étant une Gare, un restaurant, un centre commercial ou autre. Ce qui
// permettrait de faire la différence de suite dans les résultats si
// plusieurs items s'affichent. »
//
// LES DESSINS EXISTENT DÉJÀ : les pastilles de la carte (pictos-lieux,
// icone-lieu) portent un motif par famille et une couleur. Ce module ne
// dessine rien — il DEVINE la famille depuis le libellé et le contexte,
// pour les résultats qui n'apportent pas d'étiquettes OSM.
//
// ON NE DEVINE QUE LE SÛR. « Gare Saint-Lazare » est une gare ; « Rue de la
// Gare » n'en est pas une — le mot en tête de libellé pèse plus qu'un mot
// perdu dans une adresse. Dans le doute, on rend null et la ligne reste sans
// dessin : un picto faux ferait pire que pas de picto, c'est le « rond
// honnête » des pastilles appliqué à la recherche.

import { nu } from './saisie-recherche';

/* CHAQUE FAMILLE, SES MOTS. Les mots sont cherchés au DÉBUT du libellé (ou
   après un article), là où le français met la nature du lieu : « Gare de
   Lyon », « Collège Albert Camus », « Musée du Louvre », « Château de
   Versailles ». Les enseignes connues s'ajoutent où le nom ne dit pas la
   nature (Carrefour, Castorama…). */
const REGLES: readonly { famille: string; tete: RegExp; partout?: RegExp }[] = [
  { famille: 'transport', tete: /^(gare|halte|aeroport|aerogare)\b/ },
  { famille: 'restaurant', tete: /^(restaurant|brasserie|bistrot|pizzeria|creperie)\b/,
    partout: /\b(mcdonald|burger king|kfc|quick)\b/ },
  { famille: 'cafe', tete: /^(cafe|bar|pub|salon de the)\b/ },
  { famille: 'hotel', tete: /^(hotel|auberge|gite|camping)\b/,
    partout: /\b(ibis|novotel|mercure|campanile|formule 1|b&b hotel)\b/ },
  { famille: 'culture', tete: /^(musee|chateau|cathedrale|basilique|abbaye|tour|monument|bibliotheque|mediatheque|opera)\b/ },
  { famille: 'cinema', tete: /^(cinema|theatre)\b/, partout: /\b(pathe|gaumont|ugc|cgr)\b/ },
  { famille: 'sante', tete: /^(pharmacie|hopital|clinique|centre hospitalier|cabinet)\b/ },
  { famille: 'ecole', tete: /^(ecole|college|lycee|universite|faculte|institut|campus|creche)\b/ },
  { famille: 'argent', tete: /^(banque|credit)\b/,
    partout: /\b(credit agricole|bnp|societe generale|caisse d.epargne|banque populaire)\b/ },
  { famille: 'parking', tete: /^(parking|parc relais)\b/ },
  { famille: 'sport', tete: /^(stade|gymnase|piscine|complexe sportif|palais des sports)\b/ },
  { famille: 'commerce', tete: /^(centre commercial|supermarche|hypermarche|marche|galerie marchande)\b/,
    partout: /\b(carrefour|leclerc|auchan|intermarche|super u|hyper u|lidl|aldi|monoprix|casino|castorama|leroy merlin|brico depot|bricomarche|ikea|decathlon|fnac|darty|boulanger|action|gifi)\b/ },
];

/**
 * La famille devinée d'un résultat — PURE, `null` quand on n'est pas sûr.
 *
 * Le libellé décide d'abord (le mot en TÊTE dit la nature du lieu) ; les
 * enseignes se reconnaissent n'importe où dans le libellé, jamais dans le
 * contexte — une adresse « avenue de la Gare » ne fait pas une gare.
 */
export function familleDevinee(libelle: string): string | null {
  const l = nu(libelle).replace(/[-'’]/g, ' ').replace(/\s+/g, ' ').trim();
  // L'article de tête s'efface : « Le Grand Hôtel » se juge sur « grand »…
  // non — sur « hôtel » ? Les règles regardent la TÊTE : on retire seulement
  // l'article défini initial pour que « La Gare » reste une gare.
  const sansArticle = l.replace(/^(le|la|les|l) /, '');
  for (const r of REGLES) {
    if (r.tete.test(sansArticle) || r.tete.test(l)) return r.famille;
    if (r.partout && r.partout.test(l)) return r.famille;
  }
  return null;
}
