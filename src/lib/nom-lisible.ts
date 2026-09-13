/* JAMAIS D'IDENTIFIANT BRUT À L'ÉCRAN (TERRAIN-2, retour du CEO du 11/09).
 *
 * ARMELIN, SON TÉLÉPHONE EN MAIN : un identifiant brut s'affichait dans le
 * panneau de guidage. Ce n'est pas une coquille d'affichage, c'est une
 * donnée qui n'aurait jamais dû sortir de la couche des données : les
 * champs d'OpenStreetMap et ceux du service d'itinéraire portent, à côté
 * des noms que l'on met sur un panneau, des références techniques qui n'ont
 * jamais été écrites pour être lues au volant.
 *
 * LA RÈGLE VIT ICI, PAS DANS LE RENDU. C'était la demande explicite de la
 * tâche, et elle a une raison : le rendu change — le cartouche a déjà
 * déménagé deux fois depuis le 29/08 — et une rustine posée dedans part
 * avec lui. Une fonction pure se teste à sec, se relit, et survit au
 * prochain déménagement.
 *
 * ET ELLE SE TAIT PLUTÔT QUE DE MENTIR. Quand aucun nom lisible ne reste, la
 * ligne secondaire ne paraît pas : l'instruction et les numéros de route
 * suffisent. Mieux vaut moins d'information qu'une information illisible —
 * c'est déjà la règle de la maison sur les numéros de sortie (SORTIE-1,
 * 30/08 : « on affiche ce qu'on a, on se tait sur le reste »).
 */

/* CE QUE LES DONNÉES PORTENT ET QU'ON NE MONTRE PAS. Valeurs techniques
   d'OpenStreetMap qui se retrouvent dans un champ de nom quand la
   cartographie est incomplète — « noname » dit qu'il n'y a pas de nom, ce
   n'est pas un nom. */
const VALEURS_TECHNIQUES: ReadonlySet<string> = new Set([
  'yes', 'no', 'none', 'null', 'undefined', 'unknown', 'unnamed', 'noname',
  'fixme', 'n/a', 'na', 'todo',
]);

/* UN ÉLÉMENT OSM DÉSIGNÉ PAR SON TYPE ET SON NUMÉRO : « way/123456789 »,
   « node 4821 », « relation:77 ». C'est l'adresse d'une donnée, pas un lieu. */
const ELEMENT_OSM = /^(?:way|node|relation|rel|area)\s*[/:#-]?\s*\d+$/i;
/* ET SA FORME COURTE, celle des exports et des outils : « w123456 », « n48219 ». */
const ELEMENT_OSM_COURT = /^[nwr]\/?\d{4,}$/i;
/* UNE CLÉ TECHNIQUE EN TÊTE : « osm:name », « ref=A4 », « addr:street ».
   Le préfixe est en minuscules ASCII et COLLÉ à son séparateur — « Paris :
   centre » et « Saint-Étienne » n'y ressemblent pas. */
const CLE_TECHNIQUE = /^[a-z][a-z0-9-]*[:=]/;
/* UNE LONGUE SUITE DE CHIFFRES. LE SEUIL DÉPEND DE CE QU'ON LIT, et c'est la
   revue Codex qui l'a montré : « Impasse des 10000 Martyrs Pinet » existe
   vraiment, à Eyzin-Pinet (38), et la règle l'effaçait. Un nom en plusieurs
   mots est une PHRASE, pas un identifiant : on y tolère les nombres qu'un
   nom de voie porte réellement — une date, un code postal, un millésime —
   et l'on ne se méfie qu'au-delà de sept chiffres, longueur qu'aucun nom de
   lieu ne prend et que toutes les clés techniques dépassent (`cleabs` de la
   BD TOPO : neuf chiffres). Un mot SEUL, lui, reste jugé à cinq. */
const LONG_NOMBRE_MOT = /\d{5,}/;
const LONG_NOMBRE_PHRASE = /\d{7,}/;
/* UN CODE D'UN SEUL TENANT, EN CAPITALES ET CHIFFRES : « RD1234 », « FR75056 ».
   Quatre caractères au moins, et au moins un chiffre — « CHU » et « RN7 »
   restent lisibles, ce sont des mots qu'on lit sur un panneau. */
const CODE_SANS_ESPACE = /^(?=.*\d)[A-Z0-9]{4,}$/;
/** Au moins une lettre, quelle que soit la langue. Sinon, ce n'est pas un nom. */
const UNE_LETTRE = /\p{L}/u;

/**
 * Le texte est-il un identifiant brut, c'est-à-dire une chaîne qui n'a pas
 * été écrite pour être lue ?
 *
 * ATTENDU TRIMÉ ET NON VIDE — une chaîne vide n'est pas un identifiant
 * brut, c'est une absence : `nomLisible` les distingue et rend `null` pour
 * les deux, mais la règle, elle, garde la différence.
 *
 * LA RÈGLE PENCHE DU CÔTÉ DE L'AFFICHAGE. Chaque motif ci-dessous vise une
 * forme qu'aucun nom de ville, de rue ou de sortie ne prend : dans le doute,
 * on montre. Effacer « Châtillon-la-Borde » par excès de prudence serait
 * exactement le défaut inverse de celui qu'on répare.
 */
export function estIdentifiantBrut(texte: string): boolean {
  const t = texte.trim();
  if (t === '') return false;
  if (!UNE_LETTRE.test(t)) return true;
  if (VALEURS_TECHNIQUES.has(t.toLowerCase())) return true;
  /* LE SOULIGNÉ EST LA SIGNATURE DES VALEURS OSM : `motorway_junction`,
     `traffic_signals`. Aucun nom de lieu français n'en porte. */
  if (t.includes('_')) return true;
  if (ELEMENT_OSM.test(t)) return true;
  if (ELEMENT_OSM_COURT.test(t)) return true;
  if (CLE_TECHNIQUE.test(t)) return true;
  /* CE QUI SUIT NE VAUT QUE POUR LA FORME. Les motifs précédents disent
     « ceci vient d'une base de données » ; ceux-ci disent seulement « ceci
     ressemble à un code », et un nom en plusieurs mots ne ressemble pas à un
     code. On y est donc plus indulgent — voir LONG_NOMBRE_PHRASE. */
  const unSeulMot = !/\s/u.test(t);
  if ((unSeulMot ? LONG_NOMBRE_MOT : LONG_NOMBRE_PHRASE).test(t)) return true;
  if (CODE_SANS_ESPACE.test(t)) return true;
  return false;
}

/**
 * Le nom tel qu'on peut l'écrire sur un panneau, ou `null`.
 *
 * Trois sorties, et elles se distinguent : un nom lisible (rendu normalisé,
 * espaces resserrés), une chaîne vide ou absente (`null`), un identifiant
 * brut (`null` aussi — mais pour une raison différente, que
 * `estIdentifiantBrut` sait dire).
 */
export function nomLisible(brut: string | null | undefined): string | null {
  if (typeof brut !== 'string') return null;
  /* LES ESPACES SE RESSERRENT : les champs OSM portent des retours à la
     ligne et des doubles espaces qui deviendraient des trous sur le panneau. */
  const t = brut.replace(/\s+/gu, ' ').trim();
  if (t === '') return null;
  return estIdentifiantBrut(t) ? null : t;
}

/**
 * Les noms lisibles d'une liste, dans l'ordre, les autres retirés.
 *
 * UNE LISTE MI-LISIBLE RESTE UTILE : « Lyon ; way/1234 » devient « Lyon ».
 * On ne jette pas la ville parce que sa voisine est un identifiant.
 */
export function nomsLisibles(bruts: readonly (string | null | undefined)[]): string[] {
  const sortie: string[] = [];
  for (const brut of bruts) {
    const nom = nomLisible(brut);
    if (nom !== null) sortie.push(nom);
  }
  return sortie;
}
