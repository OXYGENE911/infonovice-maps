// L'ADRESSE POSTALE D'UN LIEU (ADRESSE-POI-1, 03/09).
//
// LE TERRAIN. Armelin, la nuit du 03/09 : « je constate qu'il y a trop de POI
// sur lesquels je clique et il n'y a aucune information sur l'adresse du lieu
// au format texte. Et quand je clic sur "Y aller", le nom commercial du POI
// s'affiche dans le champ destination et je n'ai toujours aucune idée de
// l'adresse du lieu. Quand je lance l'itinéraire, ça va bien au bon endroit
// mais toujours pas de connaissance de l'adresse postale exacte du lieu. »
//
// IL A RAISON SUR LE FOND, ET C'EST GÊNANT AU VOLANT. Une destination qui
// s'appelle « Carrefour City » ne se dicte pas au téléphone, ne se recopie pas
// sur un papier et ne se vérifie pas d'un coup d'œil. Le trajet était juste ;
// l'usager, lui, ne savait pas où il allait.
//
// DEUX SOURCES, DANS CET ORDRE, ET LA PREMIÈRE EST GRATUITE.
//
//   1. LES ÉTIQUETTES OSM, déjà chargées avec le point : `addr:housenumber`,
//      `addr:street`, `addr:postcode`, `addr:city`. Quand elles sont là,
//      l'adresse est écrite sans un seul appel réseau de plus.
//
//   2. LE GÉOCODAGE INVERSE DE LA BAN, quand elles manquent — un appel, à
//      l'ouverture de la fiche, jamais avant. C'est la même source que la
//      fiche d'appui long utilise déjà depuis la PR #4.
//
// ON NE DEVINE JAMAIS. Sans étiquette et sans réponse de la BAN, la fiche dit
// qu'elle ne sait pas, plutôt que d'inventer une rue voisine : « ce qui manque
// manque à la carte » est la règle de ce projet depuis les fiches de bornes.

/** Ce qu'une étiquette OSM peut porter d'une adresse. */
export interface EtiquettesAdresse {
  'addr:housenumber'?: string;
  'addr:street'?: string;
  'addr:postcode'?: string;
  'addr:city'?: string;
  'addr:place'?: string;
}

/**
 * L'adresse écrite dans les étiquettes OSM — PURE, `null` si elle n'y est pas.
 *
 * IL FAUT AU MOINS UNE VOIE ET UNE COMMUNE. Un code postal seul, ou un numéro
 * sans rue, ne s'écrit pas sur une enveloppe et ne se dicte pas au téléphone :
 * rendre « 12, 94420 » serait pire que de ne rien rendre, parce que l'usager
 * croirait tenir l'adresse.
 */
export function adresseDesTags(tags: Record<string, string> | undefined): string | null {
  if (!tags) return null;
  const t = tags as EtiquettesAdresse;
  const voie = t['addr:street'] ?? t['addr:place'];
  const commune = t['addr:city'];
  if (voie === undefined || voie === '' || commune === undefined || commune === '') return null;
  const numero = t['addr:housenumber'];
  const cp = t['addr:postcode'];
  const debut = numero !== undefined && numero !== '' ? `${numero} ${voie}` : voie;
  const fin = cp !== undefined && cp !== '' ? `${cp} ${commune}` : commune;
  return `${debut}, ${fin}`;
}

/**
 * Le libellé d'une destination : le nom, et l'adresse quand on l'a — PURE.
 *
 * C'EST LA SECONDE MOITIÉ DU RETOUR D'ARMELIN. « Carrefour City » ne dit pas
 * où l'on va ; « Carrefour City — 3 avenue Ardouin, 94420 Le Plessis-Trévise »
 * le dit. La fiche de borne le faisait déjà depuis le 26/08 ; les lieux, non.
 *
 * ON NE RÉPÈTE PAS. Si l'adresse commence déjà par le nom — ce qui arrive avec
 * les lieux-dits — la coller une seconde fois ferait un libellé bègue.
 */
export function libelleDestination(nom: string, adresse: string | null): string {
  const n = nom.trim();
  if (adresse === null || adresse.trim() === '') return n;
  const a = adresse.trim();
  const nu = (s: string): string => s.normalize('NFD')
    .replace(/[̀-ͯ]/g, '').toLowerCase();
  if (nu(a).startsWith(nu(n)) || nu(n).includes(nu(a))) return n;
  return `${n} — ${a}`;
}
