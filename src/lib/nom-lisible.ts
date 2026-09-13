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
/* ET LA MÊME CHOSE GLISSÉE DANS UNE PHRASE : « OSM way 482190 ». Les motifs
   ci-dessus sont ancrés, et la revue Codex a montré qu'un préfixe suffisait à
   passer dessous. Trois chiffres au moins, collés au mot : « Rue de la
   Relation 12 » n'y ressemble pas, « OSM node 48219 » si. */
const ELEMENT_OSM_DEDANS = /\b(?:way|node|relation|osm)\b[\s/:#-]{0,2}\d{3,}/i;
/* UNE CLÉ TECHNIQUE EN TÊTE : « osm:name », « ref=A4 », « addr:street ».
   Le préfixe est COLLÉ à son séparateur — « Paris : centre » et
   « Saint-Étienne » n'y ressemblent pas.
   ET LA CASSE NE COMPTE PAS, relevé par la revue Codex du 13/09 : le libellé
   de voie est CAPITALISÉ avant d'arriver ici — mesuré, `versEtapes` rend
   « Osm:name » pour un champ `osm:name` — et un motif ancré sur une
   minuscule ne le voyait plus. La règle doit juger la même chaîne quelle que
   soit la main qui l'a mise en forme. */
const CLE_TECHNIQUE = /^[a-z][a-z0-9-]*[:=]/i;
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
  return motifIdentifiant(texte) !== null;
}

/**
 * POURQUOI LE MOTIF, ET PAS SEULEMENT LE VERDICT.
 *
 * Les règles ci-dessous ne disent pas toutes la même chose. Les premières
 * affirment « CECI VIENT D'UNE BASE DE DONNÉES » : un élément OSM, une clé
 * technique, un souligné. Les dernières disent seulement « CECI RESSEMBLE
 * À UN CODE » — et « D606 » ressemble à un code parce que c'en est un, ce
 * qui ne l'empêche pas d'être peint sur les panneaux.
 *
 * `voieLisible` a besoin de cette distinction pour garder les numéros de
 * route SANS rouvrir la porte aux identifiants : la revue Codex du 13/09 a
 * montré qu'une exception posée sur la seule FORME laissait repasser
 * « n4821 » — forme courte d'un nœud OSM à quatre chiffres.
 *
 * @returns le nom du motif déclenché, ou `null` si le texte est lisible.
 */
export function motifIdentifiant(texte: string): string | null {
  const t = texte.trim();
  if (t === '') return null;
  if (!UNE_LETTRE.test(t)) return 'aucune-lettre';
  if (VALEURS_TECHNIQUES.has(t.toLowerCase())) return 'valeur-technique';
  /* LE SOULIGNÉ EST LA SIGNATURE DES VALEURS OSM : `motorway_junction`,
     `traffic_signals`. Aucun nom de lieu français n'en porte. */
  if (t.includes('_')) return 'souligne';
  if (ELEMENT_OSM.test(t)) return 'element-osm';
  if (ELEMENT_OSM_COURT.test(t)) return 'element-osm-court';
  if (ELEMENT_OSM_DEDANS.test(t)) return 'element-osm-dedans';
  if (CLE_TECHNIQUE.test(t)) return 'cle-technique';
  /* CE QUI SUIT NE VAUT QUE POUR LA FORME. Les motifs précédents disent
     « ceci vient d'une base de données » ; ceux-ci disent seulement « ceci
     ressemble à un code », et un nom en plusieurs mots ne ressemble pas à un
     code. On y est donc plus indulgent — voir LONG_NOMBRE_PHRASE. */
  const unSeulMot = !/\s/u.test(t);
  if ((unSeulMot ? LONG_NOMBRE_MOT : LONG_NOMBRE_PHRASE).test(t)) return 'long-nombre';
  if (CODE_SANS_ESPACE.test(t)) return 'forme-de-code';
  return null;
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

/* UN NUMÉRO DE ROUTE EST UN NOM — il est même LE nom qu'on lit sur la tôle.
 *
 * POURQUOI UNE SECONDE RÈGLE. `estIdentifiantBrut` juge des NOMS DE LIEU :
 * dans ce registre, « D606 » ressemble à un code, et c'en est un. Mais le
 * champ « voie » du guidage ne porte pas un nom de lieu, il porte une
 * DÉSIGNATION DE ROUTE, et là « D606 » est exactement ce qu'Armelin veut
 * lire en bas de l'écran — c'est ce qui est peint sur les panneaux. Passer
 * ce champ à `nomLisible` effacerait « A6 », « N7 », « D606 » : on aurait
 * réparé le défaut en supprimant l'information.
 *
 * LE NUMÉRO EST RECONNU À SA FORME COURTE, et c'est ce qui le distingue d'un
 * identifiant : une lettre de réseau, au plus quatre chiffres, un suffixe de
 * branche facultatif. « n48219 » — la forme courte d'un nœud OpenStreetMap —
 * porte cinq chiffres et ne passe donc pas, alors que `classeRoute` seule
 * l'aurait pris pour une nationale. C'est le trou qu'on ferme ici.
 */
const NUMERO_DE_ROUTE = /^R?[AND]\s?\d{1,4}\s?[A-Z]{0,2}$/;

/**
 * La désignation de voie telle qu'on peut l'écrire sur un panneau, ou `null`.
 *
 * Trois sorties, comme `nomLisible` : un numéro de route (rendu tel quel), un
 * nom de rue ou de lieu lisible, `null` quand il ne reste qu'un identifiant
 * ou rien du tout.
 */
export function voieLisible(brut: string | null | undefined): string | null {
  if (typeof brut !== 'string') return null;
  const t = brut.replace(/\s+/gu, ' ').trim();
  if (t === '') return null;
  const motif = motifIdentifiant(t);
  if (motif === null) return t;
  /* L'EXCEPTION NE VAUT QUE CONTRE LE MOTIF DE FORME, et c'est tout son
     intérêt. « D606 » n'est écarté que parce qu'il RESSEMBLE à un code ;
     « n4821 » est écarté parce qu'il EST un élément OpenStreetMap, et
     aucune forme de numéro ne doit le repêcher — relevé par la revue Codex
     du 13/09, où une exception posée sur la seule forme le laissait passer
     jusqu'à l'écusson, la voix et la feuille imprimée. */
  if (motif === 'forme-de-code' && NUMERO_DE_ROUTE.test(t.toUpperCase())) return t;
  return null;
}
