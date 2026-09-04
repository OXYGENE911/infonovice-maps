/* L'INDEX NATIONAL DES BORNES RAPIDES — pourquoi il existe, et ce qu'il coûte.
 *
 * LE DÉFAUT QU'IL CORRIGE. Armelin, le 25/08/2026, capture à l'appui : « les
 * points de charge ne s'affichent qu'entre 0 et 1 km de zoom », et « le filtre
 * réseau devrait fonctionner quel que soit le niveau de zoom ». Les deux
 * viennent de la même cause : les portails Opendatasoft plafonnent DUREMENT à
 * 100 enregistrements par requête. Demander la France entière rendait donc
 * cent bornes au hasard — pire qu'un refus, parce qu'un tel affichage ment
 * sans le dire. Le zoom 12 était la rustine ; l'index est le remède.
 *
 * CE QU'IL EST. Un export agrégé PAR STATION, mesuré le 26/08/2026 :
 *   - 21 555 lignes (station × combinaison de prises), 14 133 stations ;
 *   - 709 Ko sur le fil, gzip du serveur compris, en 1,7 s ;
 *   - une seule requête, gardée en local et rafraîchie au mois.
 * En regard, la couche par emprise émet une requête par déplacement de carte.
 * L'index est donc AUSSI le choix frugal — les quotas publics sont un bien
 * commun, et ce module les ménage plutôt que de les user.
 *
 * SON SEUIL EST UN DÉFAUT, PLUS UNE LIMITE. Cinquante kilowatts par défaut :
 * en deçà, on ne s'arrête pas en voyage, on se gare pour la nuit. Mais Armelin
 * l'a dit le 26/08 — « la carte n'affiche pas toutes les stations électriques
 * de France » — et il avait raison de le prendre pour un manque. Le seuil est
 * devenu un CHOIX, avec son prix affiché : « toutes les bornes » demande
 * 56 781 stations pour 2,5 Mo, contre 14 133 pour 700 Ko.
 *
 * ET LES DEUX CHIFFRES SONT DITS. Un index muet sur ce qu'il omet serait le
 * même mensonge que les cent bornes au hasard — d'autant que l'Avere annonce
 * 200 045 POINTS DE RECHARGE ouverts au public au 31/07/2026, quand nous
 * parlons de STATIONS. Comparer les deux sans le préciser fait croire à un
 * trou de quatre-vingt-dix pour cent.
 *
 * ET IL RÉPOND HORS LIGNE. Une fois chargé, le réseau rapide français entier
 * tient dans le navigateur : la PR #17 a promis une carte utilisable sans
 * réseau, celle-ci y ajoute les bornes.
 */
import { lirePreference, ecrirePreference } from './stockage';
import { enItinerance, type Bbox, type ClePrise, type FiltresBornes } from './poi';

/** Le seuil de l'index, en kW. Voir l'en-tête : c'est une décision. */
export const SEUIL_RAPIDE = 50;

/**
 * LES DEUX ÉTENDUES QUE L'USAGER PEUT DEMANDER.
 *
 * Armelin, le 26/08/2026 : « la carte n'affiche pas toutes les stations
 * électriques de France ». C'était vrai, et le seuil de 50 kW en était la
 * cause. Il reste le défaut par jugement — en deçà on ne s'arrête pas en
 * voyage — mais ce jugement n'est plus imposé : il devient un choix, avec son
 * prix affiché. Chiffres MESURÉS le 26/08/2026, pas estimés.
 */
export const ETENDUES = [
  {
    cle: 'rapide' as const,
    seuilKw: SEUIL_RAPIDE,
    libelle: 'Recharge rapide (50 kW et plus)',
    stations: 14_133,
    points: 76_024,
    poids: '≈ 700 Ko',
  },
  {
    cle: 'toutes' as const,
    seuilKw: 0,
    libelle: 'Toutes les bornes',
    stations: 56_781,
    points: 200_000,
    poids: '≈ 2,5 Mo',
  },
] as const;

export type CleEtendue = (typeof ETENDUES)[number]['cle'];

export const etendue = (cle: CleEtendue): (typeof ETENDUES)[number] =>
  ETENDUES.find((e) => e.cle === cle) ?? ETENDUES[0];

/** Poids annoncé à l'usager pour l'étendue par défaut. */
export const POIDS_ANNONCE = ETENDUES[0].poids;

/** Au-delà, l'index se recharge. Le fichier IRVE est consolidé chaque semaine ;
    un mois est un compromis entre fraîcheur et sobriété. */
export const PEREMPTION_MS = 30 * 24 * 3600 * 1000;

export const CLE_INDEX = 'index-bornes-rapides';

export interface StationRapide {
  lon: number;
  lat: number;
  nom: string;
  /** L'enseigne peinte sur la borne. `null` quand le producteur n'a rien dit. */
  reseau: string | null;
  /* L'EXPLOITANT — et c'est LUI qui sert de filtre, pas l'enseigne.
     Mesuré le 26/08/2026 sur les 14 133 stations rapides : `nom_enseigne`
     forme 1 799 groupes dont 1 314 d'UNE SEULE station, parce que certains
     producteurs y écrivent le nom du site — « Fastned Yvré L'Evèque »,
     « Atlante - Montauban - Aldi », « IONITY GmbH IONITY Vrigny ». Fastned
     occupait ainsi quatre cents entrées d'une station chacune, et n'existait
     nulle part sous son nom. `nom_operateur` en forme 140, dont 27
     singletons : « Fastned France » y vaut pour ses 497 points d'un bloc. */
  operateur: string | null;
  /** Puissance de la borne la plus puissante de la station, en kW. */
  puissance: number;
  /** Nombre de points de charge, `null` si non déclaré. */
  pdc: number | null;
  /** `false` = accès réservé : on ne peut PAS y recharger. */
  ouvert: boolean | null;
  /** Union des standards présents sur la station. */
  prises: ClePrise[];
  /** L'identifiant d'itinérance — celui qu'on retrouve dans son application. */
  id: string | null;
}

/* ---- URL : pure, testée à sec ---- */

const CHAMPS_PRISE: readonly (readonly [string, ClePrise])[] = [
  ['prise_type_combo_ccs', 'combo_ccs'],
  ['prise_type_chademo', 'chademo'],
  ['prise_type_2', 'type_2'],
] as const;

/**
 * L'export agrégé. `consolidated_longitude` ET NON `longitude` : mesuré le
 * 26/08/2026, le second est typé TEXTE dans le portail et toute agrégation
 * dessus est refusée (« StatAggregation only supports numeric expression »).
 * Le premier est numérique. Deux champs d'apparence interchangeable, un seul
 * qui marche — d'où ce commentaire plutôt qu'un jour perdu à le redécouvrir.
 */
export function urlIndexNational(seuilKw = SEUIL_RAPIDE): string {
  const groupes = [
    'id_station_itinerance', 'nom_station', 'nom_enseigne', 'nom_operateur',
    'condition_acces',
    ...CHAMPS_PRISE.map(([champ]) => champ),
  ].join(',');
  const q = new URLSearchParams({
    /* SEUIL ZÉRO = AUCUNE CLAUSE. `puissance_nominale>=0` écarterait en
       silence les lignes où la puissance n'est pas déclarée, qui existent :
       demander « toutes les bornes » et en perdre serait le contraire de la
       promesse. */
    ...(seuilKw > 0 ? { where: `puissance_nominale>=${seuilKw}` } : {}),
    group_by: groupes,
    /* `max(nbre_pdc)` ET NON `sum` — LE DÉFAUT LE PLUS COÛTEUX DE CET INDEX,
       livré le 26/08 et corrigé le jour même. `nbre_pdc` porte le total de la
       STATION, répété à l'identique sur chacune de ses lignes : le sommer le
       multiplie par le nombre de lignes. Mesuré sur « Brico - Hannut » :
       6 points de charge réels, 36 annoncés. À l'échelle du pays,
       496 886 points annoncés pour 76 024 réels — SIX FOIS ET DEMIE trop.
       Le pire est qu'un tel nombre reste crédible : personne ne compte les
       bornes d'une aire pour vérifier. */
    select: 'max(puissance_nominale) as p, max(nbre_pdc) as pdc,'
      + ' max(consolidated_longitude) as lon, max(consolidated_latitude) as lat',
  });
  return 'https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/'
    + `mobilityref-france-irve-220/exports/json?${q.toString()}`;
}

/* ---- décodage : pur, défensif, testé à sec ---- */

const texteOuNull = (v: unknown): string | null =>
  (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);

/**
 * Un nombre, ou `null` — SANS passer par `Number()` sur n'importe quoi.
 *
 * `Number(null)` vaut ZÉRO, tout comme `Number('')` et `Number(false)`. Une
 * ligne sans longitude franchissait donc `Number.isFinite` et posait la
 * station à l'intersection de l'équateur et du méridien de Greenwich — au
 * large du golfe de Guinée, à deux mille kilomètres des côtes françaises, et
 * sans la moindre erreur pour le signaler. Attrapé par un test à sec, jamais
 * par l'œil : sur une carte de France, ce point est simplement hors champ.
 */
const nombreOuNull = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

/* « Accès libre » / « Accès réservé », couverture 100 % (mesuré). ONZE POUR
   CENT DES STATIONS SONT RÉSERVÉES : flotte d'entreprise, copropriété,
   personnel — mais aussi, souvent, un simple badge d'opérateur : le champ dit
   « une condition existe », pas « entrée interdite ». Tout ce qui n'est ni
   l'un ni l'autre rend `null` : on ne devine pas un droit d'accès.

   LES ENCODAGES CASSÉS DU FICHIER SONT RATTRAPÉS. Mesuré le 27/08/2026 sur
   le portail : 240 lignes portent « Accès libre » dans QUATRE encodages
   estropiés (« Accs libre », « Acc¸s libre », « AccĂ¨s libre »,
   « Accčs libre ») — des producteurs qui téléversent en Latin-1 ou Mac-Roman.
   La comparaison stricte les rendait « non déclarés » ; le motif ci-dessous
   accepte un à deux octets quelconques là où l'accent a été massacré. */
export function acces(v: unknown): boolean | null {
  const t = texteOuNull(v)?.toLowerCase() ?? '';
  if (/^acc.{0,2}s\s+libre/.test(t)) return true;
  if (/^acc.{0,2}s\s+r.{0,2}serv.{0,2}/.test(t)) return false;
  return null;
}

/**
 * Décode l'export et REGROUPE PAR STATION.
 *
 * Le regroupement du portail porte sur la combinaison de prises : une station
 * dont les points de charge diffèrent y occupe plusieurs lignes. On les fond
 * ici en UNE station dont les prises sont l'UNION — 21 555 lignes deviennent
 * 14 133 stations. Sans cette fusion, la carte poserait deux à trois punaises
 * l'une sur l'autre au même endroit, et le filtre par prise écarterait une
 * station qui porte pourtant le bon connecteur sur un autre de ses points.
 *
 * LA CLÉ EST L'IDENTIFIANT D'ITINÉRANCE quand il existe, sinon les
 * coordonnées arrondies : quelques lignes n'en portent pas, et les fondre
 * toutes sous une clé vide n'en laisserait qu'une seule pour toute la France.
 */
export function versStations(brut: unknown): StationRapide[] {
  if (!Array.isArray(brut)) return [];
  const par = new Map<string, StationRapide>();

  for (const l of brut) {
    if (typeof l !== 'object' || l === null) continue;
    const r = l as Record<string, unknown>;
    const lon = nombreOuNull(r['lon']);
    const lat = nombreOuNull(r['lat']);
    // Sans position, la station serait posée au large du golfe de Guinée.
    if (lon === null || lat === null) continue;
    if (Math.abs(lon) > 180 || Math.abs(lat) > 90) continue;
    /* LA PUISSANCE PEUT MANQUER quand l'usager demande TOUTES les bornes :
       le producteur ne la declare pas toujours. On garde la station avec
       zero — `palierDe` rend alors `null` et la punaise porte une pastille
       neutre, ce qui dit « je ne sais pas » plutot que de mentir. L'ecarter
       reviendrait a promettre toutes les bornes et en perdre. */
    const puissance = nombreOuNull(r['p']) ?? 0;
    if (puissance < 0) continue;

    const id = texteOuNull(r['id_station_itinerance']);
    const cle = id ?? `${lon.toFixed(5)},${lat.toFixed(5)}`;
    const prises = CHAMPS_PRISE
      .filter(([champ]) => r[champ] === '1' || r[champ] === 1)
      .map(([, valeur]) => valeur);
    const pdc = nombreOuNull(r['pdc']);

    const deja = par.get(cle);
    if (deja) {
      // La station la plus puissante de ses lignes, et l'union des prises.
      deja.puissance = Math.max(deja.puissance, puissance);
      if (!deja.operateur) deja.operateur = texteOuNull(r['nom_operateur']);
      for (const p of prises) if (!deja.prises.includes(p)) deja.prises.push(p);
      /* LE NOMBRE DE POINTS NE S'ADDITIONNE PAS : `nbre_pdc` est le total de
         la STATION, repete a l'identique sur chaque ligne. On garde le plus
         grand. Voir le commentaire de `urlIndexNational` : l'avoir somme
         cote portail annoncait six fois trop de bornes. */
      if (pdc !== null && pdc > 0) {
        deja.pdc = Math.max(deja.pdc ?? 0, pdc);
      }
      continue;
    }

    par.set(cle, {
      lon,
      lat,
      nom: texteOuNull(r['nom_station']) ?? 'Station de recharge',
      reseau: texteOuNull(r['nom_enseigne']),
      operateur: texteOuNull(r['nom_operateur']),
      puissance,
      pdc: pdc !== null && pdc > 0 ? pdc : null,
      ouvert: acces(r['condition_acces']),
      prises,
      id,
    });
  }
  return [...par.values()];
}

/* ---- exploitation locale : pure, instantanée, sans réseau ---- */

/**
 * La clé d'une enseigne — ce qui permet de reconnaître deux écritures du même
 * réseau.
 *
 * LE DÉFAUT MESURÉ LE 26/08/2026, sur l'index lui-même : 14 133 stations
 * portent 2 615 écritures d'enseigne, dont ONZE GROUPES désignent visiblement
 * le même réseau sous deux ou trois orthographes — 2 098 stations, soit 15 %
 * du réseau rapide français. Les plus gros :
 *   « LIDL » (446) et « Lidl France » (434) ;
 *   « Freshmile France » (473) et « Freshmile » (2) ;
 *   « SOWATT SOLUTIONS » (114) et « Sowatt Solutions » (86) ;
 *   « REVEO » (52), « Reveo » (41) et « Révéo » (1).
 * Cocher « LIDL » écartait donc 434 stations Lidl — un filtre qui ment sans
 * le dire, exactement le défaut que l'index venait de corriger ailleurs.
 *
 * LA NORMALISATION EST VOLONTAIREMENT TIMIDE : casse, accents, ponctuation,
 * espaces, et le seul suffixe « France ». Rien de plus. Fondre « X » et
 * « X Mobility » serait présumer qu'il s'agit de la même société, ce que rien
 * ne prouve — et fondre à tort deux réseaux distincts est un défaut PIRE que
 * celui qu'on corrige, puisqu'il fait espérer une borne inaccessible.
 */
/** Les mots retires avant comparaison. « France », et rien d'autre. */
const MOTS_IGNORES = new Set(['france']);

/**
 * La cle d'un reseau — ce qui permet de reconnaitre deux ecritures du meme.
 *
 * ELLE S'APPLIQUE A L'OPERATEUR, PAS A L'ENSEIGNE, et la mesure du
 * 26/08/2026 dit pourquoi : sur les 14 133 stations rapides, `nom_enseigne`
 * forme 1 799 groupes dont 1 314 d'UNE SEULE station. Certains producteurs y
 * ecrivent le nom du site — Fastned occupait quatre cents entrees d'une
 * station chacune et n'apparaissait nulle part sous son nom. `nom_operateur`
 * en forme 140.
 *
 * LA COUPE AU SEPARATEUR acheve le travail : « Atlante | FR*ATL » (1 468) et
 * « Atlante France » (1 552) sont le meme reseau, et « Freshmile | FR*FR1 »
 * n'est pas un nom qu'on lit sur une liste.
 *
 * ELLE RESTE TIMIDE POUR LE RESTE : casse, accents, ponctuation, et le seul
 * mot « France ». Fondre a tort deux reseaux distincts est un defaut PIRE que
 * celui qu'on corrige, puisqu'il fait esperer une borne inaccessible.
 */
export function nomCourtReseau(nom: string): string {
  /* Un separateur ENTOURE D'ESPACES, ou une barre verticale : « Atlante -
     Montauban » se coupe, « Ze-Watt » et « E-Totem » NON. Sans cette
     exigence, tous les reseaux a trait d'union perdaient leur seconde
     moitie et se confondaient entre eux. */
  const coupe = nom.split(/\s+[|]\s*|[|]|\s+[-–]\s+/)[0] ?? nom;
  return coupe.trim() === '' ? nom.trim() : coupe.trim();
}

export function cleReseau(nom: string): string {
  return nomCourtReseau(nom)
    // NFD separe la lettre de son accent ; l'intervalle des diacritiques
    // combinants l'efface : « Reveo » et « Révéo » se rejoignent.
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    /* LE DECOUPAGE EN MOTS PLUTOT QU'UN REMPLACEMENT DE CHAINE. Retirer
       « france » par simple substitution amputerait « Francelec » de ses six
       premieres lettres et le confondrait avec « Elec ». En decoupant
       d'abord, seul le MOT entier disparait. */
    .split(/[^a-z0-9]+/)
    .filter((mot) => mot !== '' && !MOTS_IGNORES.has(mot))
    .join('');
}

/** Un réseau tel qu'il est proposé au filtre. */
export interface ReseauNational {
  /** Le libellé montré : la variante la plus répandue. */
  nom: string;
  /** Le nombre de stations, TOUTES variantes confondues. */
  nombre: number;
  /* LES ÉCRITURES RÉELLES, et pourquoi elles voyagent avec le libellé : à
     partir du zoom 12, les bornes viennent du portail, et la clause envoyée
     compare `nom_operateur` à une CHAÎNE EXACTE. N'envoyer que le libellé
     canonique rendrait « Atlante France » et perdrait « Atlante | FR*ATL » —
     le défaut serait simplement déplacé du local vers le distant. */
  variantes: string[];
}

/**
 * Les réseaux de l'index, avec leur nombre de stations.
 *
 * NATIONAL, ET C'EST TOUT L'INTÉRÊT. La facette du portail est bornée à
 * l'emprise : le filtre réseau ne proposait donc que ce que la vue montrait
 * déjà, et changeait de contenu à chaque déplacement. Calculée ici, la liste
 * est stable et complète — c'était la demande d'Armelin du 25/08.
 */
export function reseauxNationaux(stations: StationRapide[]): ReseauNational[] {
  const groupes = new Map<string, Map<string, number>>();
  for (const s of stations) {
    /* L'OPÉRATEUR D'ABORD, L'ENSEIGNE EN SECOURS. Voir `cleReseau` : le
       premier a une identité stable, la seconde porte souvent le nom du site.
       Quand l'opérateur manque — c'est rare — l'enseigne vaut mieux que rien. */
    const brut = s.operateur ?? s.reseau;
    if (!brut) continue;
    const cle = cleReseau(brut);
    if (cle === '') continue;
    const groupe = groupes.get(cle) ?? new Map<string, number>();
    groupe.set(brut, (groupe.get(brut) ?? 0) + 1);
    groupes.set(cle, groupe);
  }

  const rendu: ReseauNational[] = [];
  for (const variantes of groupes.values()) {
    const paires = [...variantes.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'fr'));
    const nombre = paires.reduce((t, [, n]) => t + n, 0);
    /* LE LIBELLÉ EST LA VARIANTE LA PLUS RÉPANDUE, RACCOURCIE : l'usager doit
       lire « Freshmile », pas « Freshmile | FR*FR1 » — un identifiant
       d'itinérance n'aide personne à reconnaître son réseau dans une liste. */
    rendu.push({
      nom: nomCourtReseau(paires[0]![0]),
      nombre,
      variantes: paires.map(([n]) => n),
    });
  }
  return rendu.sort((a, b) => b.nombre - a.nombre || a.nom.localeCompare(b.nom, 'fr'));
}

/**
 * Les réseaux dont le nom contient `recherche`. Insensible à la casse et aux
 * accents — on tape « ionity » et l'on trouve « IONITY ».
 *
 * POURQUOI UNE RECHERCHE PLUTÔT QU'UNE LISTE PLUS LONGUE. Le filtre montrait
 * les douze premiers réseaux. Armelin, le 26/08 : « plusieurs réseaux que
 * j'ai l'habitude d'utiliser n'y figurent pas » — IZIVIA FAST était treizième,
 * Atlante dix-huitième, ALLEGO vingt-deuxième. Rallonger la liste à cent
 * quarante entrées la rendrait illisible ; la rendre cherchable la rend
 * complète.
 */
export function chercherReseaux(
  reseaux: ReseauNational[], recherche: string,
): ReseauNational[] {
  /* LA RECHERCHE NE COUPE PAS AU SÉPARATEUR, à la différence de la clé de
     regroupement : quelqu'un qui tape « FR*ATL » — l'identifiant d'itinérance
     qu'il lit dans son application — doit trouver Atlante. Grouper et
     chercher sont deux gestes différents ; leur imposer la même normalisation
     ferait perdre à la seconde ce que la première jette exprès. */
  const brut = (n: string): string => n
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  const q = brut(recherche);
  if (q === '') return reseaux;
  return reseaux.filter((r) => brut(r.nom).includes(q)
    || r.variantes.some((v) => brut(v).includes(q)));
}

/** Applique les filtres de l'usager. Local : aucun plafond de 100 ne mord. */
/**
 * Une station passe-t-elle les filtres ? — PURE.
 *
 * SORTIE DE `filtrerStations` LE 01/09 (BORNES-6), parce qu'Armelin a
 * tranché : « le filtre réseau de charge + puissance de charge doit être
 * valide aussi bien en mode carte qu'en mode itinéraire ». La couche du
 * TRAJET avait sa propre règle, plus courte — elle ignorait les réseaux, et
 * c'est ce qui faisait apparaître des bornes sur un itinéraire quand la
 * carte, elle, n'en montrait aucune. Deux règles pour une même question
 * finissent toujours par diverger : il n'y en a plus qu'une.
 */
export function stationPasseFiltres(
  s: StationRapide, filtres: FiltresBornes = {},
): boolean {
  const puissanceMin = filtres.puissanceMin ?? 0;
  const prises = filtres.prises ?? [];
  /* LA COMPARAISON SE FAIT SUR LA CLÉ, pas sur la chaîne : cocher « LIDL »
     doit retenir aussi les stations écrites « Lidl France ». Voir `cleReseau`
     et la mesure qui l'a motivée. */
  const reseaux = new Set((filtres.reseaux ?? []).map(cleReseau));
  const nom = normaliserNom(filtres.nom ?? '');

  if (puissanceMin > 0 && s.puissance < puissanceMin) return false;
  /* L'ITINÉRANCE (BADGE-1) : jugée sur l'identifiant AFIREV — la seule
     donnée publique qui parle des badges, et elle ne nomme aucun badge. */
  if (filtres.itinerance === true && !enItinerance(s.id)) return false;
  // OU entre les prises : un véhicule accepte l'une OU l'autre.
  if (prises.length > 0 && !prises.some((p) => s.prises.includes(p))) return false;
  if (reseaux.size > 0) {
    // Même ordre de préférence qu'à la construction de la liste.
    const brut = s.operateur ?? s.reseau;
    if (!brut || !reseaux.has(cleReseau(brut))) return false;
  }
  /* LE NOM, L'ENSEIGNE ET L'EXPLOITANT (BORNES-3, 31/08) : « Carrefour »
     ne vit que dans l'enseigne, « McDonald » surtout dans le nom de
     station. Chercher un seul champ ratait l'un ou l'autre — mesuré sur le
     jeu réel, pas supposé. */
  if (nom !== ''
    && !normaliserNom(s.nom).includes(nom)
    && !(s.reseau !== null && normaliserNom(s.reseau).includes(nom))
    && !(s.operateur !== null && normaliserNom(s.operateur).includes(nom))) {
    return false;
  }
  return true;
}

export function filtrerStations(
  stations: StationRapide[], filtres: FiltresBornes = {},
): StationRapide[] {
  return stations.filter((s) => stationPasseFiltres(s, filtres));
}

/**
 * Le nom d'une station, aplati pour la recherche par sous-chaîne.
 *
 * LES GRAPHIES DU FICHIER SONT INCONSTANTES, mesuré le 27/08/2026 sur les
 * stations IZIVIA FAST en restaurant : « Mc Donald's - Bellac »,
 * « McDonald's -  Argentan », et même « Barbezieux-Saint-Hilaire​ » avec
 * un ESPACE SANS CHASSE en fin de nom. On abaisse la casse, on retire les
 * accents et TOUT ce qui n'est pas lettre ou chiffre : « mcdonald » trouve
 * les deux graphies, « st médard » trouve « Saint-Médard » non, mais
 * « medard » oui — l'usager tape un morceau, pas une clé exacte.
 */
export function normaliserNom(brut: string): string {
  return brut
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Valide des stations RELUES DU CACHE — forme déjà cuite, pas celle du portail.
 *
 * DEUX FORMES, DEUX LECTEURS, et confondre les deux est une erreur silencieuse
 * de première classe : `versStations` cherche `p`, `nom_station`, `lon` ; une
 * station gardée porte `puissance`, `nom`, `lon`. Lui donner le contenu du
 * cache aurait rendu un tableau VIDE — donc un index jugé absent, donc un
 * export de sept cents kilo-octets à CHAQUE ouverture, sans le moindre message
 * d'erreur pour le dire. Attrapé en relisant le code, pas par un test.
 */
export function versStationsGardees(brut: unknown): StationRapide[] {
  if (!Array.isArray(brut)) return [];
  const rendu: StationRapide[] = [];
  for (const s of brut) {
    if (typeof s !== 'object' || s === null) continue;
    const r = s as Record<string, unknown>;
    const lon = nombreOuNull(r['lon']);
    const lat = nombreOuNull(r['lat']);
    const puissance = nombreOuNull(r['puissance']) ?? 0;
    if (lon === null || Math.abs(lon) > 180) continue;
    if (lat === null || Math.abs(lat) > 90) continue;
    if (puissance < 0) continue;
    const pdc = nombreOuNull(r['pdc']);
    const prises = Array.isArray(r['prises'])
      ? r['prises'].filter(
        (p): p is ClePrise => CHAMPS_PRISE.some(([, cle]) => cle === p),
      )
      : [];
    rendu.push({
      lon,
      lat,
      nom: texteOuNull(r['nom']) ?? 'Station de recharge',
      reseau: texteOuNull(r['reseau']),
      operateur: texteOuNull(r['operateur']),
      puissance,
      pdc: pdc !== null && pdc > 0 ? pdc : null,
      ouvert: typeof r['ouvert'] === 'boolean' ? r['ouvert'] : null,
      prises,
      id: texteOuNull(r['id']),
    });
  }
  return rendu;
}

/** Les stations d'une emprise. */
export function stationsDans(stations: StationRapide[], b: Bbox): StationRapide[] {
  return stations.filter(
    (s) => s.lon >= b.ouest && s.lon <= b.est && s.lat >= b.sud && s.lat <= b.nord,
  );
}

/* ---- chargement et cache ---- */

export class ErreurIndex extends Error {}

/** Vrai quand l'index mérite d'être rechargé. Pure, pour être testable. */
export function perime(charge: number, maintenant: number): boolean {
  if (!Number.isFinite(charge) || charge <= 0) return true;
  // Une horloge en avance ne doit pas figer l'index pour l'éternité.
  return maintenant - charge > PEREMPTION_MS || charge > maintenant + PEREMPTION_MS;
}

/* SOIXANTE SECONDES, ET NON LES HUIT DE `poi.ts` : c'est un export de sept
   cents kilo-octets, pas une requête d'emprise. Mesuré à 1,7 s en fibre ; le
   délai couvre une connexion mobile médiocre sans abandonner à tort. */
const DELAI_MS = 60_000;

async function telecharger(
  seuilKw: number, signal?: AbortSignal,
): Promise<StationRapide[]> {
  let reponse: Response;
  try {
    reponse = await fetch(urlIndexNational(seuilKw), {
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(DELAI_MS)])
        : AbortSignal.timeout(DELAI_MS),
      headers: { Accept: 'application/json' },
    });
  } catch (e) {
    if (signal?.aborted) throw e;
    throw new ErreurIndex('Le réseau national de recharge n’a pas pu être chargé.');
  }
  if (!reponse.ok) {
    throw new ErreurIndex(
      `Le réseau national de recharge est indisponible (réponse ${reponse.status}).`,
    );
  }
  let donnees: unknown;
  try {
    donnees = await reponse.json();
  } catch {
    throw new ErreurIndex('Le réseau national de recharge a répondu de façon illisible.');
  }
  const stations = versStations(donnees);
  // Un index vide n'est pas un index : mieux vaut l'échec que la carte muette.
  if (stations.length === 0) {
    throw new ErreurIndex('Le réseau national de recharge est revenu vide.');
  }
  return stations;
}

/** Ce que le cache a rendu, et d'où il vient — l'interface le dit à l'usager. */
export interface ChargementIndex {
  stations: StationRapide[];
  /** `true` quand les données sortent du cache local, sans appel réseau. */
  local: boolean;
}

/* UN SEUL CHARGEMENT À LA FOIS, PAR ÉTENDUE. Sans ce verrou, ouvrir le
   planificateur et dézoomer dans la même seconde émettait DEUX exports — le
   genre de gaspillage que la règle « ne jamais marteler les API publiques »
   vise précisément. La clé est l'étendue : basculer de « rapide » à « toutes »
   pendant un chargement ne doit pas rendre l'ancien résultat pour le nouveau. */
const enCours = new Map<CleEtendue, Promise<ChargementIndex>>();

/**
 * L'index, du cache s'il est frais, du réseau sinon.
 *
 * UN CACHE PÉRIMÉ VAUT MIEUX QU'UNE PANNE : si le téléchargement échoue alors
 * qu'un vieil index dort en local, on rend le vieux. Des bornes d'il y a six
 * semaines restent des bornes ; une carte vide n'est rien.
 */
export async function indexNational(
  signal?: AbortSignal, cle: CleEtendue = 'rapide', maintenant = Date.now(),
): Promise<ChargementIndex> {
  const dejaEnCours = enCours.get(cle);
  if (dejaEnCours) return dejaEnCours;

  const quoi = etendue(cle);
  /* CHAQUE ÉTENDUE A SON PROPRE CACHE. Les faire partager une clé ferait
     passer l'index rapide pour l'index complet dès qu'on aurait basculé une
     fois : la carte montrerait 14 133 stations en croyant en montrer 56 781,
     sans qu'aucun message ne dise le contraire. */
  const cleCache = `${CLE_INDEX}:${cle}`;

  const travail = (async (): Promise<ChargementIndex> => {
    const memo = await lirePreference<unknown>(cleCache);
    const m = (memo ?? {}) as Record<string, unknown>;
    // Frontière système : ce qui revient du stockage se valide (règle du projet).
    const gardees = versStationsGardees(m['stations']);
    const charge = nombreOuNull(m['charge']) ?? 0;

    if (gardees.length > 0 && !perime(charge, maintenant)) {
      return { stations: gardees, local: true };
    }
    try {
      const stations = await telecharger(quoi.seuilKw, signal);
      void ecrirePreference(cleCache, { stations, charge: maintenant });
      return { stations, local: false };
    } catch (e) {
      if (gardees.length > 0) return { stations: gardees, local: true };
      throw e;
    }
  })();

  enCours.set(cle, travail);
  try {
    return await travail;
  } finally {
    enCours.delete(cle);
  }
}

/** Pour les tests : oublie le verrou de chargement entre deux cas. */
export function reinitialiserIndex(): void {
  enCours.clear();
}
