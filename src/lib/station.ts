/* LE DÉTAIL D'UNE STATION DE RECHARGE — ce qu'on veut savoir avant d'y aller.
 *
 * POURQUOI CE MODULE EXISTE. Armelin, le 25/08/2026 : « on ne peut pas cliquer
 * sur un point de charge suggéré pour avoir son détail, ni le nom de
 * l'opérateur du réseau ». La popup d'alors tenait en quatre lignes — nom,
 * puissance, nombre de points, réseau — quand le jeu IRVE en porte quarante.
 * On y trouve notamment de quoi répondre à trois questions que cette popup
 * laissait sans réponse :
 *
 *   - « AI-JE LE DROIT DE M'Y BRANCHER ? » Onze pour cent des stations sont
 *     en accès réservé (mesuré : 23 901 sur 224 541). L'ancienne popup les
 *     montrait comme les autres.
 *   - « QUI APPELER SI ELLE EST EN PANNE ? » Le téléphone de l'opérateur est
 *     renseigné sur 76 % des lignes, et n'était affiché nulle part.
 *   - « QU'EST-CE QU'IL Y A EXACTEMENT COMME PRISES ? » Une station mêle
 *     souvent des points de 300 kW en CCS et de 22 kW en Type 2.
 *
 * CE QU'IL N'Y A PAS, ET QU'IL FAUT DIRE. Pas d'occupation en direct :
 * aucune source publique française ne la donne à l'échelle nationale — Belib
 * l'expose pour Paris, et la mesure du 25/08/2026 y a trouvé 6 % de statuts
 * datant de moins d'une heure (123 sur 1 967), soit une information dont la
 * fraîcheur ne peut pas être promise. Pas de tarif fiable non plus : le champ
 * `tarification` n'est rempli que sur 24 % des lignes, en texte libre, et
 * contient aussi bien « 0,29 €/kWh » qu'une adresse de site web. On l'affiche
 * quand il existe, TEL QUEL, en disant d'où il vient.
 *
 * Ces deux absences sont écrites dans l'interface. Un cartouche muet sur ce
 * qu'il ignore laisse croire qu'il n'y a rien à savoir.
 */
import { PRISES, type ClePrise } from './poi';

export class ErreurStation extends Error {}

const DELAI_MS = 8000;

/** Une composition de points de charge : « 14 points de 300 kW en CCS ». */
export interface GroupePdc {
  puissanceKw: number;
  prises: ClePrise[];
  nombre: number;
}

export interface DetailStation {
  nom: string;
  adresse: string | null;
  /** L'enseigne peinte sur la borne. */
  reseau: string | null;
  /** La société qui exploite — souvent différente de l'enseigne. */
  operateur: string | null;
  /** Celle qui a posé les bornes. Utile quand les deux autres manquent. */
  amenageur: string | null;
  /** Numéro déjà nettoyé du préfixe `tel:` du jeu. */
  telephone: string | null;
  /** `false` = accès réservé : on ne peut PAS y recharger. */
  ouvert: boolean | null;
  /** Texte du producteur : « 24/7 », « Mo-Fr 09:00-19:00 »… */
  horaires: string | null;
  /** « Voirie », « Station dédiée à la recharge rapide »… */
  implantation: string | null;
  /** `null` quand le producteur déclare « accessibilité inconnue ». */
  pmr: string | null;
  paiementCb: boolean | null;
  paiementActe: boolean | null;
  reservation: boolean | null;
  deuxRoues: boolean | null;
  /** Texte libre du producteur, ou `null`. Jamais interprété. */
  tarification: string | null;
  gratuit: boolean | null;
  /** Composition réelle, du plus puissant au moins puissant. */
  groupes: GroupePdc[];
  /** Nombre de points de charge déclaré par le producteur. */
  pdc: number | null;
  /** L'identifiant d'itinérance — celui qu'on retrouve dans son application. */
  id: string | null;
  /** Date de dernière mise à jour déclarée, au format ISO. */
  majLe: string | null;
}

/* ---- URL : pures, testées à sec ---- */

const CHAMPS = [
  'nom_station', 'adresse_station', 'nom_enseigne', 'nom_operateur',
  'nom_amenageur', 'telephone_operateur', 'condition_acces', 'horaires',
  'implantation_station', 'accessibilite_pmr', 'paiement_cb', 'paiement_acte',
  'reservation', 'station_deux_roues', 'tarification', 'gratuit',
  'puissance_nominale', 'nbre_pdc', 'id_station_itinerance',
  'id_pdc_itinerance', 'date_maj',
  ...PRISES.map((p) => p.champ),
].join(',');

/* CENT LIGNES : le plafond dur du portail. Une station en dépasse rarement
   trente ; au-delà, la composition affichée serait incomplète et on le dit
   plutôt que de faire semblant. */
const LIMITE = 100;

const citer = (v: string): string => `"${v.replace(/"/g, '')}"`;

const RACINE = 'https://public.opendatasoft.com/api/explore/v2.1/catalog/'
  + 'datasets/mobilityref-france-irve-220/records';

/** Le détail par identifiant d'itinérance — la voie sûre. */
export function urlStationParId(id: string): string {
  const q = `id_station_itinerance = ${citer(id)}`;
  return `${RACINE}?where=${encodeURIComponent(q)}&limit=${LIMITE}&select=${CHAMPS}`;
}

/**
 * Le détail par position, quand l'identifiant manque.
 *
 * CINQUANTE MÈTRES, ET UNE COMPARAISON DE NOM. Un rayon seul ramènerait les
 * bornes du voisin sur un parking partagé ; le nom seul échouerait sur les
 * stations homonymes d'un même réseau, qui sont légion (« Lidl », « Super U »).
 * Les deux ensemble tiennent.
 */
export function urlStationParLieu(lon: number, lat: number, nom: string): string {
  // 0,00045° ≈ 50 m en latitude ; en longitude c'est moins sous nos latitudes,
  // ce qui resserre encore la fenêtre — dans le bon sens.
  const d = 0.00045;
  const clauses = [
    `in_bbox(point_geo,${(lat - d).toFixed(6)},${(lon - d).toFixed(6)},`
      + `${(lat + d).toFixed(6)},${(lon + d).toFixed(6)})`,
    `nom_station = ${citer(nom)}`,
  ];
  const q = clauses.join(' AND ');
  return `${RACINE}?where=${encodeURIComponent(q)}&limit=${LIMITE}&select=${CHAMPS}`;
}

/* ---- décodage : pur, défensif, testé à sec ---- */

const texteOuNull = (v: unknown): string | null =>
  (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);

/** « 0 »/« 1 », parfois nombre, souvent null : trois états, pas deux. */
const drapeau = (v: unknown): boolean | null => {
  if (v === '1' || v === 1 || v === true) return true;
  if (v === '0' || v === 0 || v === false) return false;
  return null;
};

const nombreOuNull = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

/** « tel:+33-9-69-37-60-09 » → « +33 9 69 37 60 09 ». */
export function telephone(v: unknown): string | null {
  const brut = texteOuNull(v);
  if (!brut) return null;
  const sansPrefixe = brut.replace(/^tel:/i, '').trim();
  // Un champ qui ne contient aucun chiffre n'est pas un numéro.
  if (!/\d/.test(sansPrefixe)) return null;
  return sansPrefixe.replace(/[-.]/g, ' ').replace(/\s+/g, ' ').trim();
}

/* « Accessibilité inconnue » est la valeur PAR DÉFAUT du jeu : elle couvre
   64 % des lignes. L'afficher serait remplir une ligne pour ne rien dire. */
export function pmr(v: unknown): string | null {
  const t = texteOuNull(v);
  if (!t) return null;
  return /inconnue?$/i.test(t) ? null : t;
}

/**
 * Groupe les points de charge par puissance et par jeu de prises.
 *
 * LES LIGNES SE RÉPÈTENT DANS LE JEU. Une station relevée le 26/08/2026
 * rendait 28 lignes pour 14 points de charge déclarés : le fichier consolidé
 * contient des doublons. On dédoublonne donc sur `id_pdc_itinerance` avant de
 * compter — sans quoi le cartouche annoncerait le double de bornes.
 */
export function grouperPdc(lignes: Record<string, unknown>[]): GroupePdc[] {
  const vus = new Set<string>();
  const groupes = new Map<string, GroupePdc>();

  for (const [rang, l] of lignes.entries()) {
    const puissance = nombreOuNull(l['puissance_nominale']);
    if (puissance === null || puissance <= 0) continue;
    const prises = PRISES.filter((p) => drapeau(l[p.champ]) === true).map((p) => p.cle);

    /* SANS IDENTIFIANT DE POINT, LE RANG SERT DE CLÉ : deux points anonymes
       et identiques sont alors comptés deux fois, ce qui est le bon défaut —
       les confondre effacerait une borne réelle. */
    const idPdc = texteOuNull(l['id_pdc_itinerance']) ?? `#${rang}`;
    if (vus.has(idPdc)) continue;
    vus.add(idPdc);

    const cle = `${puissance}|${[...prises].sort().join(',')}`;
    const deja = groupes.get(cle);
    if (deja) { deja.nombre += 1; continue; }
    groupes.set(cle, { puissanceKw: puissance, prises, nombre: 1 });
  }
  return [...groupes.values()].sort((a, b) => b.puissanceKw - a.puissanceKw);
}

/** Décode la réponse du portail. Rend `null` quand la station est introuvable. */
export function versDetail(brut: unknown): DetailStation | null {
  const resultats = (brut as { results?: unknown })?.results;
  if (!Array.isArray(resultats) || resultats.length === 0) return null;
  const lignes = resultats.filter(
    (l): l is Record<string, unknown> => typeof l === 'object' && l !== null,
  );
  if (lignes.length === 0) return null;

  /* LA PREMIÈRE LIGNE PORTE LES ATTRIBUTS DE STATION — ils sont répétés à
     l'identique sur chacun de ses points de charge dans le fichier consolidé.
     Sauf le téléphone, souvent absent d'une ligne et présent sur la suivante :
     on prend donc le PREMIER RENSEIGNÉ plutôt que celui de la ligne zéro. */
  const premier = <T>(lire: (l: Record<string, unknown>) => T | null): T | null => {
    for (const l of lignes) {
      const v = lire(l);
      if (v !== null) return v;
    }
    return null;
  };

  return {
    nom: premier((l) => texteOuNull(l['nom_station'])) ?? 'Station de recharge',
    adresse: premier((l) => texteOuNull(l['adresse_station'])),
    reseau: premier((l) => texteOuNull(l['nom_enseigne'])),
    operateur: premier((l) => texteOuNull(l['nom_operateur'])),
    amenageur: premier((l) => texteOuNull(l['nom_amenageur'])),
    telephone: premier((l) => telephone(l['telephone_operateur'])),
    ouvert: premier((l) => accesOuvert(l['condition_acces'])),
    horaires: premier((l) => texteOuNull(l['horaires'])),
    implantation: premier((l) => texteOuNull(l['implantation_station'])),
    pmr: premier((l) => pmr(l['accessibilite_pmr'])),
    paiementCb: premier((l) => drapeau(l['paiement_cb'])),
    paiementActe: premier((l) => drapeau(l['paiement_acte'])),
    reservation: premier((l) => drapeau(l['reservation'])),
    deuxRoues: premier((l) => drapeau(l['station_deux_roues'])),
    tarification: premier((l) => texteOuNull(l['tarification'])),
    gratuit: premier((l) => drapeau(l['gratuit'])),
    groupes: grouperPdc(lignes),
    pdc: premier((l) => nombreOuNull(l['nbre_pdc'])),
    id: premier((l) => texteOuNull(l['id_station_itinerance'])),
    majLe: premier((l) => texteOuNull(l['date_maj'])),
  };
}

/** Même règle que l'index, encodages estropiés compris (voir `acces`
    dans lib/index-bornes.ts) : on ne devine pas un droit d'accès. */
function accesOuvert(v: unknown): boolean | null {
  const t = texteOuNull(v)?.toLowerCase() ?? '';
  if (/^acc.{0,2}s\s+libre/.test(t)) return true;
  if (/^acc.{0,2}s\s+r.{0,2}serv.{0,2}/.test(t)) return false;
  return null;
}

/* ---- appel ---- */

async function appeler(url: string, signal?: AbortSignal): Promise<DetailStation | null> {
  let r: Response;
  try {
    r = await fetch(url, {
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(DELAI_MS)])
        : AbortSignal.timeout(DELAI_MS),
      headers: { Accept: 'application/json' },
    });
  } catch (e) {
    if (signal?.aborted) throw e;
    throw new ErreurStation('Le détail de cette station n’est pas disponible pour le moment.');
  }
  if (!r.ok) {
    throw new ErreurStation(
      `Le détail de cette station est indisponible (réponse ${r.status}).`,
    );
  }
  try {
    return versDetail(await r.json());
  } catch {
    throw new ErreurStation('Le détail de cette station est illisible.');
  }
}

/**
 * Le détail d'une station, par identifiant si on l'a, par lieu sinon.
 *
 * LES DEUX VOIES SONT ESSAYÉES DANS CET ORDRE, et non l'une ou l'autre : un
 * identifiant peut exister dans l'index et avoir disparu du jeu depuis (les
 * stations ferment). Retomber sur la position évite un cartouche vide là où
 * la carte montre pourtant une punaise.
 */
export async function chargerDetail(
  cible: { id: string | null; lon: number; lat: number; nom: string },
  signal?: AbortSignal,
): Promise<DetailStation | null> {
  if (cible.id) {
    const parId = await appeler(urlStationParId(cible.id), signal);
    if (parId) return parId;
  }
  return appeler(urlStationParLieu(cible.lon, cible.lat, cible.nom), signal);
}
