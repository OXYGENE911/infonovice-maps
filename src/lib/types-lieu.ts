// LES MOTS DE TYPE DE LIEU ET LES CATÉGORIES DE L'INDEX DES LIEUX (lot 144, 09/10/2026).
//
// PORTÉ DE MAPS PRO (`apps/web/src/carte/recherche/types-lieu.ts`, lots 140 à 142),
// recopié ici par son auteur sous AGPL-3.0 — la règle seule, rien qui appelle un
// serveur. Ce que la saisie DIT d'un type (« stade », « col », « mairie »,
// « cathédrale ») et ce que la Géoplateforme DIT du lieu (sa catégorie : « stade »,
// « col », « mairie », « culte chrétien ») doivent se répondre : c'est ce qui met le
// Stade de France devant l'avenue du Stade de France, et la mairie de
// Boulogne-Billancourt devant la « Villa de la Mairie ».

/** Les mots qui disent un genre de lieu géographique ou bâti. */
export const GEOGRAPHIQUES: ReadonlySet<string> = new Set([
  'cathedrale', 'eglise', 'basilique', 'chapelle', 'abbaye', 'monastere', 'temple', 'mosquee', 'synagogue',
  'chateau', 'palais', 'fort', 'citadelle', 'forteresse', 'remparts', 'donjon', 'tour', 'tours', 'arc', 'arche', 'pont',
  'viaduc', 'aqueduc', 'phare', 'colonne', 'obelisque', 'statue', 'monument', 'memorial', 'mausolee',
  'mont', 'pic', 'puy', 'sommet', 'col', 'cirque', 'gorges', 'grotte', 'gouffre', 'cascade', 'dune', 'falaise', 'cap',
  'ile', 'presqu', 'baie', 'lac', 'etang', 'plage', 'parc', 'jardin', 'bois', 'foret', 'promenade', 'esplanade',
  'stade', 'arena', 'hippodrome', 'velodrome', 'patinoire', 'piscine', 'zoo',
  'musee', 'opera', 'theatre', 'cite', 'domaine', 'quartier', 'halles', 'marche', 'place', 'porte', 'gare', 'aeroport', 'port',
  'centre', 'commercial', 'galerie', 'zone', 'espace', 'parking',
]);

const MONUMENTAUX: ReadonlySet<string> = new Set([
  'cathedrale', 'eglise', 'basilique', 'chapelle', 'abbaye', 'monastere', 'temple', 'mosquee', 'synagogue', 'chateau', 'palais', 'fort',
  'citadelle', 'forteresse', 'remparts', 'donjon', 'tour', 'arc', 'arche', 'pont', 'viaduc', 'aqueduc', 'phare', 'colonne', 'obelisque',
  'statue', 'monument', 'memorial', 'mausolee', 'opera', 'theatre', 'cite', 'domaine', 'halles',
]);

const HOPITAL = ['hôpital', 'etablissement hospitalier'];
const UNIVERSITE = ['université', 'enseignement supérieur'];

/** Les institutions : le mot de la saisie → les catégories de la Géoplateforme qui y répondent. */
export const INSTITUTIONS: ReadonlyMap<string, readonly string[]> = new Map<string, readonly string[]>([
  ['mairie', ['mairie']], ['hotel de ville', ['mairie']],
  ['hopital', HOPITAL], ['chu', HOPITAL], ['clinique', HOPITAL], ['urgences', HOPITAL],
  ['prefecture', ['préfecture', 'préfecture de région', 'sous-préfecture']], ['sous-prefecture', ['sous-préfecture']],
  ['universite', UNIVERSITE], ['fac', UNIVERSITE], ['faculte', UNIVERSITE],
  ['ecole', ['enseignement primaire', 'autre établissement d\'enseignement', 'enseignement supérieur']],
  ['college', ['collège']], ['lycee', ['lycée']],
  ['police', ['police']], ['commissariat', ['police']], ['gendarmerie', ['gendarmerie']],
  ['poste', ['poste']], ['tribunal', ['palais de justice']], ['palais de justice', ['palais de justice']],
  ['pompiers', ['caserne de pompiers']], ['caserne', ['caserne', 'caserne de pompiers']],
  ['mediatheque', ['divers public ou administratif']], ['bibliotheque', ['divers public ou administratif']],
  ['office de tourisme', ['office de tourisme']],
]);

/** Les mots qui disent un commerce ou un service de proximité. */
export const COMMERCES: ReadonlySet<string> = new Set([
  'pharmacie', 'boulangerie', 'patisserie', 'boucherie', 'charcuterie', 'fromagerie', 'poissonnerie', 'epicerie',
  'supermarche', 'hypermarche', 'superette', 'tabac', 'presse', 'librairie', 'fleuriste', 'coiffeur', 'garage',
  'restaurant', 'pizzeria', 'brasserie', 'bar', 'cafe', 'creperie', 'kebab', 'sushi', 'hotel', 'camping', 'auberge',
  'station', 'station-service', 'banque', 'assurance', 'opticien', 'veterinaire', 'dentiste', 'medecin', 'laboratoire',
  'cinema', 'bowling', 'laverie', 'pressing', 'concession', 'jardinerie', 'bricolage', 'animalerie',
]);

/** Ce mot dit-il un TYPE de lieu plutôt qu'un nom ? — PUR. */
export function estType(mot: string): boolean {
  return GEOGRAPHIQUES.has(mot) || INSTITUTIONS.has(mot) || COMMERCES.has(mot);
}

/** Sans accents, en minuscules, en mots — PUR. */
function nus(s: string): string[] {
  return s.replace(/œ|Œ/g, 'oe').replace(/æ|Æ/g, 'ae').normalize('NFD').replace(/\p{Mn}+/gu, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter((m) => m !== '');
}

/**
 * Le mot de type de la saisie répond-il à la catégorie du lieu ? — PUR.
 *
 * La catégorie est celle de la Géoplateforme (« culte chrétien », « col »,
 * « stade ») ou le type d'un lieu connu (« Monument historique », « Musée de
 * France », « basilique » chez Wikidata) : le mot lui-même dans la catégorie
 * suffit.
 */
export function correspond(motType: string, categorie: string | null | undefined): boolean {
  if (!categorie) return false;
  const c = categorie.toLocaleLowerCase('fr-FR').trim();
  if (nus(c).includes(motType)) return true;
  if ((c === 'monument historique' || c === 'monument') && MONUMENTAUX.has(motType)) return true;
  const inst = INSTITUTIONS.get(motType);
  if (inst) return inst.includes(c);
  switch (motType) {
    case 'cathedrale': case 'eglise': case 'basilique': case 'chapelle': case 'abbaye': case 'monastere': case 'temple':
      return c === 'culte chrétien' || c === 'monument' || c === 'culte divers';
    case 'mosquee': return c === 'culte musulman';
    case 'synagogue': return c === 'culte israélite';
    case 'chateau': case 'palais': case 'fort': case 'citadelle': case 'forteresse': case 'donjon':
      return c === 'château' || c === 'monument' || c === 'ouvrage militaire';
    case 'tour': case 'arc': case 'arche': case 'colonne': case 'obelisque': case 'statue': case 'monument': case 'memorial': case 'mausolee':
      return c === 'monument' || c === 'tombeau' || c === 'construction ponctuelle' || c === 'autre construction élevée';
    case 'pont': case 'viaduc': case 'aqueduc': return c.startsWith('pont') || c === 'viaduc' || c === 'aqueduc' || c === 'monument';
    case 'phare': return c === 'phare';
    case 'mont': case 'pic': case 'puy': case 'sommet':
      return c === 'sommet' || c === 'montagne' || c === 'pic' || c === 'volcan' || c.includes('dôme') || c.includes('colline');
    case 'col': return c === 'col';
    case 'grotte': case 'gouffre': return c === 'grotte' || c === 'gouffre';
    case 'cap': return c === 'cap';
    case 'ile': return c === 'ile';
    case 'lac': case 'etang': return c === 'lac' || c === 'plan d\'eau' || c === 'retenue' || c === 'mare';
    case 'plage': return c === 'plage' || c === 'baignade surveillée';
    case 'parc': case 'jardin': return c === 'parc de loisirs' || c === 'parc zoologique' || c === 'bois' || c === 'divers public ou administratif';
    case 'bois': case 'foret': return c === 'bois';
    case 'stade': case 'arena': return c === 'stade' || c === 'complexe sportif couvert';
    case 'hippodrome': return c === 'hippodrome';
    case 'piscine': return c === 'piscine';
    case 'patinoire': return c === 'patinoire';
    case 'zoo': return c === 'parc zoologique';
    case 'musee': return c === 'musée' || c === 'ecomusée';
    case 'opera': case 'theatre': return c === 'monument' || c === 'divers public ou administratif';
    case 'halles': case 'marche': return c === 'marché' || c === 'divers commercial';
    case 'gare': return c.startsWith('gare');
    case 'aeroport': return c === 'aérodrome' || c === 'aérogare';
    default: return false;
  }
}

/** Le genre de transport que dit une catégorie de la Géoplateforme — PUR. */
export type Transport = 'GARE' | 'METRO' | 'TRAM' | 'BUS' | 'AEROPORT' | 'TERMINAL';

export function transportDe(categorie: string | null | undefined): Transport | null {
  const c = categorie?.trim().toLocaleLowerCase('fr-FR') ?? '';
  /* « gare ferroviaire en cul-de-sac » (Paris-Montparnasse, chez Wikidata). */
  if (c.startsWith('gare ferroviaire')) return 'GARE';
  switch (c) {
    case 'gare voyageurs uniquement': case 'gare voyageurs et fret': case 'arrêt voyageurs': case 'gare maritime': return 'GARE';
    case 'station de métro': return 'METRO';
    case 'station de tramway': return 'TRAM';
    case 'gare routière': return 'BUS';
    case 'aérodrome': case 'altiport': return 'AEROPORT';
    case 'aérogare': return 'TERMINAL';
    /* LES TYPES DE WIKIDATA (lot 144) : la même gare, vue par l'extrait embarqué. */
    case 'gare ferroviaire': case 'gare souterraine': case 'station de rer': case 'gare ou arrêt de transport en commun souterrain':
    case 'terminus': return 'GARE';
    case 'aéroport': case 'aérodrome recevant du trafic commercial régulier': return 'AEROPORT';
    default: return null;
  }
}

/** Le filtre de l'index des lieux pour une saisie de transport (Maps Pro, lot 140). */
export const CATEGORIES_TRANSPORT = 'gare voyageurs uniquement,gare voyageurs et fret,station de métro,station de tramway,arrêt voyageurs,gare routière';
export const CATEGORIES_AIR = 'aérodrome,aérogare';
