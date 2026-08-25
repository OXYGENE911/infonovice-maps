// Points d'intérêt — trois sources publiques vérifiées par appels réels le
// 21/08/2026 (docs/apis.md) :
// - CARBURANTS : data.economie.gouv.fr, « prix des carburants, flux instantané
//   v2 » (prix du jour, `geom {lon,lat}` propre, CORS *).
// - BORNES IRVE : public.opendatasoft.com, republication à jour du fichier
//   consolidé Etalab (`point_geo` correct). Le jeu ODRE a été ÉCARTÉ avec
//   preuve : figé en 2019 ET coordonnées lon/lat inversées sur tout le jeu.
// - PARKINGS : WFS Géoplateforme, couche PARKING.SUP.500 (> 500 m²),
//   MultiPolygones avec surface — même origine que nos tuiles.
// Les portails Opendatasoft plafonnent `limit` à 100 : on rend aussi le total
// pour que l'interface dise honnêtement « 100 affichés sur N ».
// Résilience : timeout 8 s, une reprise, erreurs en français ; l'annulation
// volontaire (déplacement de carte) ne se rejoue pas (règles du projet).
export interface Bbox { ouest: number; sud: number; est: number; nord: number; }

export class ErreurPoi extends Error {}

const DELAI_MS = 8000;
/** Plafond DUR des portails Opendatasoft — pas un choix de notre part. */
const LIMITE_ODS = 100;
const LIMITE_WFS = 200;

export interface PoiCarburant {
  lon: number; lat: number;
  adresse: string; ville: string;
  /** Prix affichables, dans un ordre stable : [libellé, €/L]. */
  prix: [string, number][];
}

export interface PoiBorne {
  lon: number; lat: number;
  nom: string;
  puissance: number | null;
  pdc: number | null;
  gratuit: boolean | null;
  /** L'enseigne affichée sur la borne (« eborn »), à défaut l'opérateur. */
  reseau: string | null;
  /** Les standards réellement présents sur la station. */
  prises: ClePrise[];
}

/* LES QUATRE STANDARDS RÉELS. Le jeu IRVE porte aussi `prise_type_autre`,
   volontairement absent de ce catalogue : « autre » ne se choisit pas dans un
   filtre — personne ne cherche une prise dont il ignore le nom. */
export type ClePrise = 'combo_ccs' | 'type_2' | 'chademo' | 'ef';

/* LE NOM DE CHAMP EST PORTÉ EXPLICITEMENT, et ce n'est pas de la verbosité :
   la nomenclature du jeu IRVE est IRRÉGULIÈRE. Le Type 2 s'appelle
   `prise_type_2` quand les autres suivent `prise_type_<clé>`. Déduire le champ
   de la clé produisait `prise_type_type_2` — un champ inexistant, sur lequel
   le service ne renvoie rien plutôt qu'une erreur. Attrapé par un test à sec,
   pas en production. */
export const PRISES: readonly { cle: ClePrise; champ: string; libelle: string }[] = [
  { cle: 'combo_ccs', champ: 'prise_type_combo_ccs', libelle: 'CCS Combo' },
  { cle: 'type_2', champ: 'prise_type_2', libelle: 'Type 2' },
  { cle: 'chademo', champ: 'prise_type_chademo', libelle: 'CHAdeMO' },
  { cle: 'ef', champ: 'prise_type_ef', libelle: 'Prise domestique' },
] as const;

const champDe = (cle: ClePrise): string =>
  PRISES.find((p) => p.cle === cle)?.champ ?? `prise_type_${cle}`;

/* `| undefined` EXPLICITE : le projet compile avec `exactOptionalPropertyTypes`,
   qui distingue « propriété absente » de « propriété valant undefined ». Le
   code veut les deux — remettre le filtre à « toutes » écrit undefined plutôt
   que de reconstruire l'objet sans la clé. */
export interface FiltresBornes {
  /** En kW. Une borne sans puissance déclarée est écartée par le service. */
  puissanceMin?: number | undefined;
  /** Prises acceptées par le véhicule — au moins une suffit. */
  prises?: ClePrise[] | undefined;
  /** Enseignes retenues (« Ionity »…). Vide = toutes. */
  reseaux?: string[] | undefined;
}

export interface Charge<T> { elements: T[]; total: number; }

/* ---- URL — pures, testées à sec ---- */

// in_bbox d'Opendatasoft attend (champ, lat SUD, lon OUEST, lat NORD, lon EST).
const odsBbox = (champ: string, b: Bbox) =>
  `in_bbox(${champ},${b.sud},${b.ouest},${b.nord},${b.est})`;

export function urlCarburants(b: Bbox): string {
  return 'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/'
    + 'prix-des-carburants-en-france-flux-instantane-v2/records'
    + `?where=${encodeURIComponent(odsBbox('geom', b))}&limit=${LIMITE_ODS}`
    + '&select=geom,adresse,ville,gazole_prix,sp95_prix,sp98_prix,e10_prix,e85_prix,gplc_prix';
}

/* Une valeur littérale pour la clause `where` d'Opendatasoft. Le guillemet
   est RETIRÉ, pas échappé : la syntaxe du portail n'a pas d'échappement, et un
   nom d'enseigne qui en contient couperait la clause en deux — le service
   répondrait une erreur, ou pire, autre chose que ce qu'on croit demander. */
const citer = (valeur: string): string => `"${valeur.replace(/"/g, '')}"`;

/* LES FILTRES PARTENT AU SERVICE, JAMAIS APRÈS COUP. Le portail plafonne à
   100 enregistrements : filtrer localement trierait un ensemble DÉJÀ TRONQUÉ,
   et l'on montrerait trois bornes CCS là où la zone en compte cinquante. Ce
   n'est pas une optimisation, c'est une question de justesse.

   Formats vérifiés par appel réel le 25/08/2026 : `puissance_nominale` est un
   NOMBRE (une comparaison entre guillemets ne compare pas), les `prise_type_*`
   sont des CHAÎNES « 0 »/« 1 ». */
export function urlBornes(b: Bbox, filtres: FiltresBornes = {}): string {
  const clauses = [odsBbox('point_geo', b)];

  if (typeof filtres.puissanceMin === 'number' && filtres.puissanceMin > 0) {
    clauses.push(`puissance_nominale >= ${filtres.puissanceMin}`);
  }
  // OU entre les prises : un véhicule accepte l'une OU l'autre. Exiger
  // qu'une même borne les porte toutes ne rendrait presque rien.
  const prises = filtres.prises ?? [];
  if (prises.length > 0) {
    clauses.push(`(${prises.map((p) => `${champDe(p)} = "1"`).join(' OR ')})`);
  }
  const reseaux = filtres.reseaux ?? [];
  if (reseaux.length > 0) {
    clauses.push(`(${reseaux.map((r) => `nom_enseigne = ${citer(r)}`).join(' OR ')})`);
  }

  return 'https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/'
    + 'mobilityref-france-irve-220/records'
    + `?where=${encodeURIComponent(clauses.join(' AND '))}&limit=${LIMITE_ODS}`
    + '&select=point_geo,nom_station,puissance_nominale,nbre_pdc,gratuit'
    + ',nom_enseigne,nom_operateur'
    + PRISES.map((p) => `,${p.champ}`).join('');
}

export function urlParkings(b: Bbox): string {
  const q = new URLSearchParams({
    SERVICE: 'WFS', VERSION: '2.0.0', REQUEST: 'GetFeature',
    TYPENAMES: 'PARKING.SUP.500:parkings_sup500m2',
    OUTPUTFORMAT: 'application/json',
    BBOX: `${b.sud},${b.ouest},${b.nord},${b.est},urn:ogc:def:crs:EPSG::4326`,
    COUNT: String(LIMITE_WFS),
  });
  return `https://data.geopf.fr/wfs/ows?${q.toString()}`;
}

/* ---- transformations — pures, défensives, testées à sec ---- */

const CARBURANTS: [string, string][] = [
  ['gazole_prix', 'Gazole'], ['sp95_prix', 'SP95'], ['sp98_prix', 'SP98'],
  ['e10_prix', 'E10'], ['e85_prix', 'E85'], ['gplc_prix', 'GPLc'],
];

interface LigneOds { [cle: string]: unknown; }
interface ReponseOds { total_count?: number; results?: LigneOds[]; }

function point(brut: unknown): { lon: number; lat: number } | null {
  const p = brut as { lon?: unknown; lat?: unknown } | null;
  if (typeof p?.lon !== 'number' || typeof p?.lat !== 'number') return null;
  if (Math.abs(p.lon) > 180 || Math.abs(p.lat) > 90) return null;
  return { lon: p.lon, lat: p.lat };
}

export function versCarburants(brut: unknown): Charge<PoiCarburant> {
  const r = brut as ReponseOds;
  if (!Array.isArray(r?.results)) {
    throw new ErreurPoi('Le service des carburants n’a pas rendu de données exploitables.');
  }
  const elements: PoiCarburant[] = [];
  for (const l of r.results) {
    const geo = point(l['geom']);
    if (!geo) continue;
    const prix: [string, number][] = [];
    for (const [cle, libelle] of CARBURANTS) {
      const v = Number(l[cle]);
      if (Number.isFinite(v) && v > 0) prix.push([libelle, v]);
    }
    // Une station sans le moindre prix n'apprend rien : écartée.
    if (prix.length === 0) continue;
    elements.push({
      ...geo,
      adresse: typeof l['adresse'] === 'string' ? l['adresse'] : '',
      ville: typeof l['ville'] === 'string' ? l['ville'] : '',
      prix,
    });
  }
  return { elements, total: Number(r.total_count) || elements.length };
}

const texteOuNull = (v: unknown): string | null =>
  (typeof v === 'string' && v.trim() !== '' ? v : null);

export function versBornes(brut: unknown): Charge<PoiBorne> {
  const r = brut as ReponseOds;
  if (!Array.isArray(r?.results)) {
    throw new ErreurPoi('Le service des bornes n’a pas rendu de données exploitables.');
  }
  const elements: PoiBorne[] = [];
  for (const l of r.results) {
    const geo = point(l['point_geo']);
    if (!geo) continue;
    const puissance = Number(l['puissance_nominale']);
    const pdc = Number(l['nbre_pdc']);
    // `gratuit` arrive en chaîne « 0 »/« 1 » — parfois null : trois états.
    const g = l['gratuit'];
    elements.push({
      ...geo,
      nom: typeof l['nom_station'] === 'string' ? l['nom_station'] : 'Borne de recharge',
      puissance: Number.isFinite(puissance) && puissance > 0 ? puissance : null,
      pdc: Number.isFinite(pdc) && pdc > 0 ? pdc : null,
      gratuit: g === '1' || g === 1 ? true : g === '0' || g === 0 ? false : null,
      // L'ENSEIGNE PRIME SUR L'OPÉRATEUR : c'est le nom peint sur la borne,
      // celui que l'usager cherche des yeux depuis la route. L'opérateur est
      // souvent une société technique dont le nom ne figure nulle part.
      reseau: texteOuNull(l['nom_enseigne']) ?? texteOuNull(l['nom_operateur']),
      prises: PRISES.filter((p) => l[p.champ] === '1' || l[p.champ] === 1).map((p) => p.cle),
    });
  }
  return { elements, total: Number(r.total_count) || elements.length };
}

export interface ChargeParkings {
  /** FeatureCollection GeoJSON prête pour une source MapLibre. */
  collection: GeoJSON.FeatureCollection;
  total: number;
}

export function versParkings(brut: unknown): ChargeParkings {
  const r = brut as { type?: string; features?: unknown[]; numberMatched?: number };
  if (r?.type !== 'FeatureCollection' || !Array.isArray(r.features)) {
    throw new ErreurPoi('Le service des parkings n’a pas rendu de données exploitables.');
  }
  const features = r.features.filter((f) => {
    const g = (f as { geometry?: { type?: string } })?.geometry;
    return g?.type === 'Polygon' || g?.type === 'MultiPolygon';
  }) as GeoJSON.Feature[];
  return {
    collection: { type: 'FeatureCollection', features },
    total: Number(r.numberMatched) || features.length,
  };
}

/* ---- appels — résilience du projet, annulation volontaire respectée ---- */

async function appel(url: string, quoi: string, signal?: AbortSignal): Promise<unknown> {
  let derniere: unknown;
  for (let essai = 0; essai < 2; essai += 1) {
    try {
      const r = await fetch(url, {
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(DELAI_MS)])
          : AbortSignal.timeout(DELAI_MS),
        headers: { Accept: 'application/json' },
      });
      if (r.ok) return await r.json();
      // SEULS les 5xx se rejouent : un 4xx est déterministe (même URL, même
      // verdict) et un 429 dit PRÉCISÉMENT de ralentir — le rejouer 500 ms
      // plus tard doublerait la charge au pire moment (revue du 22/08).
      if (r.status >= 500) throw new Error(`service ${r.status}`);
      throw new ErreurPoi(r.status === 429
        ? `Le service des ${quoi} limite le débit. Patientez un instant.`
        : `Les ${quoi} sont momentanément indisponibles (réponse ${r.status}).`);
    } catch (e) {
      // Un déplacement de carte annule l'appel : ce n'est pas une panne.
      if (signal?.aborted) throw e;
      if (e instanceof ErreurPoi) throw e;
      derniere = e;
      if (essai === 0) await new Promise((s) => setTimeout(s, 500));
    }
  }
  throw new ErreurPoi(
    `Les ${quoi} sont momentanément indisponibles. Réessayez dans un instant.`,
    { cause: derniere },
  );
}

/** La vue a-t-elle assez changé pour justifier un rechargement ? PURE.
    Sans ce seuil, le suivi GPS (un moveend par fixe, ~1 Hz en voiture) ou la
    molette cran par cran rechargeaient TOUTES les couches à chaque geste —
    le débounce seul ne protège pas les quotas publics (revue du 22/08). */
export function vueAChange(chargee: Bbox, courante: Bbox): boolean {
  const largeur = chargee.est - chargee.ouest;
  const hauteur = chargee.nord - chargee.sud;
  const dx = Math.abs((courante.ouest + courante.est) - (chargee.ouest + chargee.est)) / 2;
  const dy = Math.abs((courante.sud + courante.nord) - (chargee.sud + chargee.nord)) / 2;
  const largeurCourante = courante.est - courante.ouest;
  return dx > largeur * 0.2 || dy > hauteur * 0.2
    || largeurCourante > largeur * 1.4 || largeurCourante < largeur / 1.4;
}

export async function chargerCarburants(b: Bbox, signal?: AbortSignal): Promise<Charge<PoiCarburant>> {
  return versCarburants(await appel(urlCarburants(b), 'prix des carburants', signal));
}

export async function chargerBornes(
  b: Bbox, signal?: AbortSignal, filtres: FiltresBornes = {},
): Promise<Charge<PoiBorne>> {
  return versBornes(await appel(urlBornes(b, filtres), 'bornes de recharge', signal));
}

export async function chargerParkings(b: Bbox, signal?: AbortSignal): Promise<ChargeParkings> {
  return versParkings(await appel(urlParkings(b), 'parkings', signal));
}
