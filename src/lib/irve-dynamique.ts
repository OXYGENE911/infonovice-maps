// L'ÉTAT DÉCLARÉ DES POINTS DE CHARGE — et ce qu'il vaut vraiment (IRVE-1).
//
// LA DEMANDE. Armelin, le 01/09 : « il existe une base de données de l'état
// dynamique des bornes […] montrer les points libres ou occupés et proposer un
// reroutage automatique quand une station est trop chargée, en interrogeant la
// base à intervalles quand on s'en approche ».
//
// CE QUE J'AI MESURÉ, ET QUI CHANGE LA RÉPONSE. Le jeu existe bien
// (`tabular-api.data.gouv.fr`, consolidation nationale, sans clé), mais il
// n'est PAS vivant :
//
//   - sur 1 400 points tirés au hasard le 01/09, AUCUN relevé n'avait moins de
//     **9,6 heures** ; 45 % dataient de plus de sept jours ;
//   - autour du Plessis-Trévise, 14 points sur 40 seulement portent un relevé,
//     le plus récent vieux de seize heures, le plus ancien de six semaines ;
//   - le catalogue le confirme : les producteurs y DÉPOSENT des fichiers, ils
//     n'y publient pas un flux.
//
// DONC LE REROUTAGE AUTOMATIQUE NE SE FERA PAS SUR CETTE SOURCE, et interroger
// la base « à intervalles en approchant » ne ferait que redemander la même
// valeur d'hier à un service public. Promettre « libre » sur un relevé de la
// veille, c'est exactement le genre de promesse que cette application refuse.
//
// CE QUI RESTE, ET QUI VAUT : l'état HORS SERVICE, qui ne se périme pas comme
// l'occupation — un point en panne depuis six semaines l'est probablement
// encore (mesuré : 8,5 % des points, dont les trois quarts relevés il y a plus
// d'une semaine). Et l'occupation elle-même, à condition de la DATER en toutes
// lettres et de ne jamais la donner pour l'instant présent.

/** L'état d'un point, tel que le producteur l'a déclaré. */
export type EtatPdc = 'en_service' | 'hors_service' | 'inconnu';

/** Son occupation au moment du relevé. */
export type OccupationPdc = 'libre' | 'occupe' | 'inconnu';

export interface RelevePdc {
  id: string;
  etat: EtatPdc;
  occupation: OccupationPdc;
  /** L'instant du relevé, en millisecondes — `null` si le jeu ne le dit pas. */
  instant: number | null;
}

export class ErreurReleves extends Error {}

const RACINE = 'https://tabular-api.data.gouv.fr/api/resources/'
  + '411443b1-6667-473f-8217-1c57c167408f/data/';

/* LE PLAFOND DU PORTAIL, et la taille d'une station : cent points suffisent
   très largement — la plus grosse station mesurée en compte trente. */
const PLAFOND = 100;

/**
 * L'URL des relevés d'une liste de points — PURE.
 *
 * UN SEUL APPEL POUR TOUTE LA STATION : le filtre `__in` accepte la liste
 * entière (mesuré : quarante identifiants tiennent dans une URL de 838
 * caractères). Un appel par point aurait multiplié par quarante la charge
 * posée sur un service public pour la même réponse.
 *
 * ATTENTION À LA JOINTURE : l'identifiant de STATION n'est PAS un préfixe de
 * celui de ses POINTS. Mesuré : la station `FRALLPGO000669` porte le point
 * `FRALLEGO6000361`. Une recherche par préfixe rendait zéro — ce sont les
 * identifiants de points, et eux seuls, qui joignent les deux jeux.
 */
export function urlReleves(idsPdc: readonly string[]): string | null {
  const ids = [...new Set(idsPdc.filter((s) => s.trim() !== ''))].slice(0, PLAFOND);
  if (ids.length === 0) return null;
  const p = new URLSearchParams({
    id_pdc_itinerance__in: ids.join(','),
    page_size: String(ids.length),
  });
  return `${RACINE}?${p.toString()}`;
}

const ETATS: Record<string, EtatPdc> = {
  en_service: 'en_service', hors_service: 'hors_service',
};
const OCCUPATIONS: Record<string, OccupationPdc> = {
  libre: 'libre', occupe: 'occupe',
};

/** Décode la réponse du portail — PURE, défensive. */
export function versReleves(brut: unknown): RelevePdc[] {
  const lignes = (brut as { data?: unknown[] } | null)?.data;
  if (!Array.isArray(lignes)) return [];
  const sortie: RelevePdc[] = [];
  for (const l of lignes) {
    const o = l as Record<string, unknown>;
    const id = typeof o['id_pdc_itinerance'] === 'string'
      ? o['id_pdc_itinerance'].trim() : '';
    if (id === '') continue;
    /* TOUT CE QU'ON NE RECONNAÎT PAS EST « INCONNU », jamais « en service » :
       un défaut optimiste enverrait quelqu'un vers une borne en panne. */
    const etat = ETATS[String(o['etat_pdc'])] ?? 'inconnu';
    const occupation = OCCUPATIONS[String(o['occupation_pdc'])] ?? 'inconnu';
    const h = o['horodatage'];
    /* LE JEU ÉCRIT « 2026-08-31 14:00:36.713000+00:00 » — un espace là où ISO
       veut un T. Sans cette substitution, le décodage varie d'un navigateur à
       l'autre, et une date illisible vaut un relevé perdu. */
    const t = typeof h === 'string' ? Date.parse(h.replace(' ', 'T')) : Number.NaN;
    sortie.push({ id, etat, occupation, instant: Number.isFinite(t) ? t : null });
  }
  return sortie;
}

/** Ce qu'on peut dire d'une station à partir de ses relevés. */
export interface BilanReleves {
  /** Combien de points portent un relevé — souvent moins que la station n'en a. */
  releves: number;
  horsService: number;
  libres: number;
  occupes: number;
  /** L'instant du relevé le plus RÉCENT, qui borne ce qu'on ose affirmer. */
  leFrais: number | null;
  /** Celui du plus ANCIEN : c'est lui qui dit l'hétérogénéité du lot. */
  leVieux: number | null;
}

/** Résume les relevés d'une station — PURE. */
export function resumerReleves(releves: readonly RelevePdc[]): BilanReleves {
  const instants = releves.map((r) => r.instant)
    .filter((x): x is number => x !== null);
  return {
    releves: releves.length,
    horsService: releves.filter((r) => r.etat === 'hors_service').length,
    libres: releves.filter((r) => r.occupation === 'libre').length,
    occupes: releves.filter((r) => r.occupation === 'occupe').length,
    leFrais: instants.length === 0 ? null : Math.max(...instants),
    leVieux: instants.length === 0 ? null : Math.min(...instants),
  };
}

/* AU-DELÀ, ON NE MONTRE PLUS L'OCCUPATION DU TOUT. Sept jours : passé ce
   délai, la valeur ne dit plus rien d'une place de parking, et l'afficher même
   datée inviterait à la lire. L'état HORS SERVICE, lui, survit à ce délai —
   c'est une panne, pas une place occupée. */
export const PEREMPTION_OCCUPATION_MS = 7 * 24 * 3600_000;

/**
 * L'âge d'un relevé, en toutes lettres — PURE.
 *
 * JAMAIS « à l'instant » : le relevé le plus frais mesuré sur ce jeu avait
 * NEUF HEURES. Les mots doivent rendre cette distance sensible, sans quoi une
 * pastille verte se lira comme « maintenant ».
 */
export function ageEnMots(instant: number, maintenant: number): string {
  const h = Math.floor((maintenant - instant) / 3600_000);
  if (h < 1) return 'il y a moins d’une heure';
  if (h < 24) return `il y a ${h} h`;
  const j = Math.floor(h / 24);
  if (j === 1) return 'hier';
  if (j < 31) return `il y a ${j} jours`;
  const m = Math.floor(j / 30);
  return m === 1 ? 'il y a un mois' : `il y a ${m} mois`;
}

/** Va chercher les relevés d'une station. UN appel, à l'ouverture de la fiche. */
export async function chercherReleves(
  idsPdc: readonly string[], signal?: AbortSignal,
): Promise<RelevePdc[]> {
  const url = urlReleves(idsPdc);
  if (url === null) return [];
  try {
    const r = await fetch(url, { signal: signal ?? AbortSignal.timeout(8000) });
    if (!r.ok) throw new ErreurReleves('L’état des points n’est pas disponible.');
    return versReleves(await r.json());
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    throw new ErreurReleves('L’état des points n’est pas disponible.');
  }
}
