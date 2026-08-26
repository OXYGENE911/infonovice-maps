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
 * SON SEUIL EST UNE DÉCISION, PAS UN HASARD. Cinquante kilowatts : en deçà,
 * on ne s'arrête pas en voyage, on se gare pour la nuit. Descendre à toutes
 * les bornes ferait 224 541 lignes — plusieurs mégaoctets pour des prises
 * domestiques que personne ne cherche sur une carte de France. L'interface DIT
 * ce seuil : un index muet sur ce qu'il omet serait le même mensonge que les
 * cent bornes au hasard.
 *
 * ET IL RÉPOND HORS LIGNE. Une fois chargé, le réseau rapide français entier
 * tient dans le navigateur : la PR #17 a promis une carte utilisable sans
 * réseau, celle-ci y ajoute les bornes.
 */
import { lirePreference, ecrirePreference } from './stockage';
import type { Bbox, ClePrise, FiltresBornes } from './poi';

/** Le seuil de l'index, en kW. Voir l'en-tête : c'est une décision. */
export const SEUIL_RAPIDE = 50;

/** Poids annoncé à l'usager. Mesuré, pas estimé (26/08/2026). */
export const POIDS_ANNONCE = '≈ 700 Ko';

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
    'id_station_itinerance', 'nom_station', 'nom_enseigne', 'condition_acces',
    ...CHAMPS_PRISE.map(([champ]) => champ),
  ].join(',');
  const q = new URLSearchParams({
    where: `puissance_nominale>=${seuilKw}`,
    group_by: groupes,
    select: 'max(puissance_nominale) as p, sum(nbre_pdc) as pdc,'
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
   personnel. Les afficher comme les autres envoie l'usager vers une borne où
   il ne pourra pas brancher — un défaut silencieux que l'ancienne popup
   partageait. Tout ce qui n'est ni l'un ni l'autre rend `null` : on ne devine
   pas un droit d'accès. */
export function acces(v: unknown): boolean | null {
  const t = texteOuNull(v)?.toLowerCase() ?? '';
  if (t.startsWith('accès libre') || t.startsWith('acces libre')) return true;
  if (t.startsWith('accès réservé') || t.startsWith('acces reserve')) return false;
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
    const puissance = nombreOuNull(r['p']);
    if (puissance === null || puissance <= 0) continue;

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
      for (const p of prises) if (!deja.prises.includes(p)) deja.prises.push(p);
      /* LE NOMBRE DE POINTS NE S'ADDITIONNE PAS ENTRE LIGNES : le portail a
         déjà sommé les points de chaque combinaison de prises, et un même
         point compte dans plusieurs si la station est hétérogène. On garde le
         plus grand — minorer vaut mieux que promettre des bornes en trop. */
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

export function cleReseau(nom: string): string {
  return nom
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
     compare `nom_enseigne` à une CHAÎNE EXACTE. N'envoyer que le libellé
     canonique rendrait les 446 Lidl et perdrait les 434 autres — le défaut
     serait simplement déplacé du local vers le distant. */
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
    if (!s.reseau) continue;
    const cle = cleReseau(s.reseau);
    // Une enseigne réduite à rien par la normalisation garde son écriture.
    const groupe = groupes.get(cle) ?? new Map<string, number>();
    groupe.set(s.reseau, (groupe.get(s.reseau) ?? 0) + 1);
    groupes.set(cle, groupe);
  }

  const rendu: ReseauNational[] = [];
  for (const variantes of groupes.values()) {
    const paires = [...variantes.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'fr'));
    const nombre = paires.reduce((t, [, n]) => t + n, 0);
    /* LE LIBELLÉ EST LA VARIANTE LA PLUS RÉPANDUE, pas la première rencontrée :
       l'usager doit lire le nom qu'il verra le plus souvent sur la route. */
    rendu.push({ nom: paires[0]![0], nombre, variantes: paires.map(([n]) => n) });
  }
  return rendu.sort((a, b) => b.nombre - a.nombre || a.nom.localeCompare(b.nom, 'fr'));
}

/** Applique les filtres de l'usager. Local : aucun plafond de 100 ne mord. */
export function filtrerStations(
  stations: StationRapide[], filtres: FiltresBornes = {},
): StationRapide[] {
  const puissanceMin = filtres.puissanceMin ?? 0;
  const prises = filtres.prises ?? [];
  /* LA COMPARAISON SE FAIT SUR LA CLÉ, pas sur la chaîne : cocher « LIDL »
     doit retenir aussi les stations écrites « Lidl France ». Voir `cleReseau`
     et la mesure qui l'a motivée. */
  const reseaux = new Set((filtres.reseaux ?? []).map(cleReseau));
  return stations.filter((s) => {
    if (puissanceMin > 0 && s.puissance < puissanceMin) return false;
    // OU entre les prises : un véhicule accepte l'une OU l'autre.
    if (prises.length > 0 && !prises.some((p) => s.prises.includes(p))) return false;
    if (reseaux.size > 0 && (!s.reseau || !reseaux.has(cleReseau(s.reseau)))) return false;
    return true;
  });
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
    const puissance = nombreOuNull(r['puissance']);
    if (lon === null || Math.abs(lon) > 180) continue;
    if (lat === null || Math.abs(lat) > 90) continue;
    if (puissance === null || puissance <= 0) continue;
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

async function telecharger(signal?: AbortSignal): Promise<StationRapide[]> {
  let reponse: Response;
  try {
    reponse = await fetch(urlIndexNational(), {
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

/* UN SEUL CHARGEMENT À LA FOIS. Sans ce verrou, ouvrir le planificateur et
   dézoomer dans la même seconde émettait DEUX exports de sept cents kilo-octets
   — le genre de gaspillage que la règle « ne jamais marteler les API publiques »
   vise précisément. */
let enCours: Promise<ChargementIndex> | null = null;

/**
 * L'index, du cache s'il est frais, du réseau sinon.
 *
 * UN CACHE PÉRIMÉ VAUT MIEUX QU'UNE PANNE : si le téléchargement échoue alors
 * qu'un vieil index dort en local, on rend le vieux. Des bornes d'il y a six
 * semaines restent des bornes ; une carte vide n'est rien.
 */
export async function indexNational(
  signal?: AbortSignal, maintenant = Date.now(),
): Promise<ChargementIndex> {
  if (enCours) return enCours;

  const travail = (async (): Promise<ChargementIndex> => {
    const memo = await lirePreference<unknown>(CLE_INDEX);
    const m = (memo ?? {}) as Record<string, unknown>;
    // Frontière système : ce qui revient du stockage se valide (règle du projet).
    const gardees = versStationsGardees(m['stations']);
    const charge = nombreOuNull(m['charge']) ?? 0;

    if (gardees.length > 0 && !perime(charge, maintenant)) {
      return { stations: gardees, local: true };
    }
    try {
      const stations = await telecharger(signal);
      void ecrirePreference(CLE_INDEX, { stations, charge: maintenant });
      return { stations, local: false };
    } catch (e) {
      if (gardees.length > 0) return { stations: gardees, local: true };
      throw e;
    }
  })();

  enCours = travail;
  try {
    return await travail;
  } finally {
    enCours = null;
  }
}

/** Pour les tests : oublie le verrou de chargement entre deux cas. */
export function reinitialiserIndex(): void {
  enCours = null;
}
