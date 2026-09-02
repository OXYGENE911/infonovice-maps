// LES PLACES LIBRES, EN DIRECT ET POUR DE VRAI (PARK-4, 02/09).
//
// LA DEMANDE. Armelin : « certaines villes exposent des API permettant de
// consulter en live le taux d'occupation et disponibilité des places de
// parking […] ce serait bien d'intégrer la disponibilité des parkings en
// codant les API libres et sans clé d'accès. Cela alimentera l'option Parking
// de notre application afin d'afficher les parkings qui ne sont pas complets
// […] pour qu'il ne galère pas à stationner. »
//
// CE QUE J'AI MESURÉ, ET QUI TRIE LES SOURCES. Le 02/09, une par une :
//
//   - **Aix-Marseille Provence** : 38 parkings en temps réel, horodatés à la
//     MINUTE (`datemajpy` relevé sept minutes avant ma requête). Vivant.
//   - **Nantes Métropole** : 21 parcs-relais, horodatés à l'heure. Vivant.
//   - **Issy-les-Moulineaux** (le lien d'Armelin) : le jeu s'appelle
//     « disponibilité temps réel », son dernier relevé date du **6 avril
//     2025** — dix-sept mois — et annonce TOUS les parkings pleins. Le
//     brancher aurait envoyé les gens ailleurs pour rien.
//   - **Paris** (l'autre lien d'Armelin) : `stationnement-en-ouvrage` donne
//     les 125 ouvrages, leurs tarifs et leurs capacités — mais AUCUNE
//     occupation. Paris publie ses parkings, pas leurs places libres.
//
// D'OÙ LA RÈGLE DE CETTE BRIQUE : un nom de jeu ne prouve rien, un horodatage
// si. On n'affiche un nombre de places QUE s'il est frais, et l'on dit son
// âge. Le reste — un parking connu sans chiffre du moment — vaut mieux que
// zéro place annoncées à tort.

import type { PointGeo } from './coordonnees';

/** Un parking dont on connaît les places libres à un instant donné. */
export interface ParkingLive {
  nom: string;
  lon: number;
  lat: number;
  /** Places libres au dernier relevé. */
  libres: number;
  /** Capacité totale déclarée. */
  capacite: number;
  /** L'instant du relevé, en millisecondes. */
  instant: number;
  /** La collectivité qui publie — on cite toujours sa source. */
  source: string;
}

export class ErreurParkingsLive extends Error {}

/* AU-DELÀ, UN NOMBRE DE PLACES NE VEUT PLUS RIEN DIRE. Une heure : un parking
   se remplit en une matinée, pas en une minute, mais annoncer « 69 places »
   sur un relevé d'hier soir ferait exactement ce qu'Issy fait depuis dix-sept
   mois. Les deux sources branchées se rafraîchissent bien en deçà. */
export const PEREMPTION_PLACES_MS = 60 * 60_000;

/* AUTOUR DE LA DESTINATION : le même rayon que les parkings cartographiés, et
   pour la même raison — au-delà, la fin à pied cesse d'être une fin. */
export const RAYON_LIVE_M = 1_500;

/**
 * L'écart de l'heure de Paris à UTC pour un instant donné, en millisecondes.
 *
 * POURQUOI CETTE FONCTION EXISTE, ET CE QU'ELLE A ÉVITÉ. Aix-Marseille
 * horodate en heure LOCALE, sans le dire : `2026-09-02 03:15:07` relevé à
 * 01:22 UTC. Lu comme de l'UTC, ce relevé tombait deux heures dans le
 * FUTUR — et ma garde de fraîcheur, qui compare des âges, l'aurait accepté
 * puis rejeté au premier changement d'heure. Mesuré avant d'écrire la ligne.
 */
export function decalageParis(instant: number): number {
  const f = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
  const p: Record<string, number> = {};
  for (const { type, value } of f.formatToParts(new Date(instant))) {
    if (type !== 'literal') p[type] = Number(value);
  }
  const murParis = Date.UTC(
    p['year'] ?? 1970, (p['month'] ?? 1) - 1, p['day'] ?? 1,
    /* MINUIT S'ÉCRIT « 24 » DANS CE FORMAT : sans ce repli, une heure sur
       vingt-quatre décalait la journée entière. */
    (p['hour'] ?? 0) % 24, p['minute'] ?? 0, p['second'] ?? 0,
  );
  return murParis - instant;
}

/** Lit un horodatage écrit en heure de Paris, sans fuseau — PURE. */
export function instantHeureParis(texte: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(texte.trim());
  if (!m) return null;
  const [A, M, J, h, mi, s] = m.slice(1).map((x) => Number(x ?? 0));
  const suppose = Date.UTC(A!, M! - 1, J!, h!, mi!, s ?? 0);
  /* ON CORRIGE PAR L'ÉCART RÉEL À CET INSTANT-LÀ, et non par une constante :
     la France passe de +1 à +2 deux fois l'an, et un décalage figé se
     tromperait d'une heure la moitié de l'année. */
  return suppose - decalageParis(suppose);
}

/** Une collectivité qui publie ses places libres, et comment la lire. */
export interface SourceLive {
  cle: string;
  /** Ce qu'on écrit à l'écran — on cite toujours qui publie. */
  nom: string;
  /** L'emprise couverte : au-delà, cette source n'a rien à dire. */
  emprise: { ouest: number; sud: number; est: number; nord: number };
  url: (autour: PointGeo) => string;
  lire: (brut: unknown, source: string) => ParkingLive[];
}

const nombre = (v: unknown): number =>
  (typeof v === 'number' ? v : Number.parseFloat(String(v)));

/* ---- Aix-Marseille Provence ---- */

function urlAmp(autour: PointGeo): string {
  const p = new URLSearchParams({
    where: `tempsreel="True" and distance(pointgeo, geom'POINT(`
      + `${autour.lon.toFixed(5)} ${autour.lat.toFixed(5)})', ${RAYON_LIVE_M}m)`,
    order_by: `distance(pointgeo, geom'POINT(${autour.lon.toFixed(5)} `
      + `${autour.lat.toFixed(5)})')`,
    limit: '10',
    select: 'nom,voitureplacesdisponibles,voitureplacescapacite,longitude,latitude,datemajpy',
  });
  return 'https://data.ampmetropole.fr/api/explore/v2.1/catalog/datasets/'
    + `disponibilites-des-places-de-parkings/records?${p.toString()}`;
}

function lireAmp(brut: unknown, source: string): ParkingLive[] {
  const lignes = (brut as { results?: unknown[] } | null)?.results;
  if (!Array.isArray(lignes)) return [];
  const sortie: ParkingLive[] = [];
  for (const l of lignes) {
    const o = l as Record<string, unknown>;
    const lon = nombre(o['longitude']); const lat = nombre(o['latitude']);
    const libres = nombre(o['voitureplacesdisponibles']);
    const capacite = nombre(o['voitureplacescapacite']);
    const instant = typeof o['datemajpy'] === 'string'
      ? instantHeureParis(o['datemajpy']) : null;
    if (!Number.isFinite(lon) || !Number.isFinite(lat)
      || !Number.isFinite(libres) || instant === null) continue;
    sortie.push({
      nom: typeof o['nom'] === 'string' ? o['nom'] : 'Parking',
      lon, lat, libres, capacite: Number.isFinite(capacite) ? capacite : 0,
      instant, source,
    });
  }
  return sortie;
}

/* ---- Nantes Métropole ---- */

function urlNantes(autour: PointGeo): string {
  const p = new URLSearchParams({
    where: `distance(location, geom'POINT(${autour.lon.toFixed(5)} `
      + `${autour.lat.toFixed(5)})', ${RAYON_LIVE_M}m)`,
    order_by: `distance(location, geom'POINT(${autour.lon.toFixed(5)} `
      + `${autour.lat.toFixed(5)})')`,
    limit: '10',
    select: 'grp_nom,grp_disponible,grp_exploitation,location,grp_horodatage',
  });
  return 'https://data.nantesmetropole.fr/api/explore/v2.1/catalog/datasets/'
    + `244400404_parcs-relais-nantes-metropole-disponibilites/records?${p.toString()}`;
}

function lireNantes(brut: unknown, source: string): ParkingLive[] {
  const lignes = (brut as { results?: unknown[] } | null)?.results;
  if (!Array.isArray(lignes)) return [];
  const sortie: ParkingLive[] = [];
  for (const l of lignes) {
    const o = l as Record<string, unknown>;
    const g = o['location'] as { lon?: unknown; lat?: unknown } | null;
    const lon = nombre(g?.lon); const lat = nombre(g?.lat);
    const libres = nombre(o['grp_disponible']);
    const capacite = nombre(o['grp_exploitation']);
    /* NANTES HORODATE EN ISO AVEC SON FUSEAU : `Date.parse` suffit, et il ne
       faut SURTOUT pas lui appliquer la correction de Paris — ce serait
       décaler deux fois. */
    const t = typeof o['grp_horodatage'] === 'string'
      ? Date.parse(o['grp_horodatage']) : Number.NaN;
    if (!Number.isFinite(lon) || !Number.isFinite(lat)
      || !Number.isFinite(libres) || !Number.isFinite(t)) continue;
    sortie.push({
      nom: typeof o['grp_nom'] === 'string' ? o['grp_nom'] : 'Parc-relais',
      lon, lat, libres, capacite: Number.isFinite(capacite) ? capacite : 0,
      instant: t, source,
    });
  }
  return sortie;
}

/**
 * Les collectivités branchées.
 *
 * DEUX SEULEMENT, ET C'EST HONNÊTE : ce sont les deux que j'ai mesurées
 * vivantes le 02/09. La liste est faite pour grandir — chaque entrée est un
 * couple (emprise, lecteur), et deux des portails visés parlent déjà la même
 * langue (OpenDataSoft). Ajouter une ville, c'est ajouter dix lignes ici et
 * un test qui la mesure.
 */
export const SOURCES_LIVE: readonly SourceLive[] = [
  {
    cle: 'amp',
    nom: 'Métropole Aix-Marseille-Provence',
    /* L'emprise de la métropole, généreusement bornée : mieux vaut un appel
       qui rend zéro qu'un parking manqué au bord du périmètre. */
    emprise: { ouest: 4.75, sud: 43.10, est: 5.90, nord: 43.65 },
    url: urlAmp,
    lire: lireAmp,
  },
  {
    cle: 'nantes',
    nom: 'Nantes Métropole',
    emprise: { ouest: -1.85, sud: 47.10, est: -1.30, nord: 47.35 },
    url: urlNantes,
    lire: lireNantes,
  },
];

/** La source qui couvre ce point, s'il y en a une — PURE. */
export function sourcePour(p: PointGeo): SourceLive | null {
  return SOURCES_LIVE.find((s) => p.lon >= s.emprise.ouest && p.lon <= s.emprise.est
    && p.lat >= s.emprise.sud && p.lat <= s.emprise.nord) ?? null;
}

/** Ne garde que les relevés assez frais pour vouloir dire quelque chose — PURE. */
export function fraisSeulement(
  parkings: readonly ParkingLive[], maintenant: number,
): ParkingLive[] {
  return parkings.filter((p) => maintenant - p.instant <= PEREMPTION_PLACES_MS
    /* ET PAS DANS LE FUTUR : un horodatage mal lu — le piège d'Aix-Marseille —
       donnerait un âge négatif, qui passerait la garde sans être frais. Une
       minute de tolérance absorbe les horloges qui se cherchent. */
    && p.instant - maintenant <= 60_000);
}

/** Ce qu'on écrit sur une ligne — PURE. */
export function libellePlaces(p: ParkingLive): string {
  if (p.libres <= 0) return 'complet au dernier relevé';
  const sur = p.capacite > 0 ? ` sur ${p.capacite}` : '';
  return `${p.libres} place${p.libres > 1 ? 's' : ''} libre${p.libres > 1 ? 's' : ''}${sur}`;
}

/** Va chercher les places libres autour d'un point. UN appel, ou aucun. */
export async function chercherPlacesLibres(
  autour: PointGeo, signal?: AbortSignal,
): Promise<ParkingLive[]> {
  const source = sourcePour(autour);
  if (source === null) return [];
  try {
    const r = await fetch(source.url(autour), {
      signal: signal ?? AbortSignal.timeout(8000),
    });
    if (!r.ok) throw new ErreurParkingsLive('Les places libres ne répondent pas.');
    return fraisSeulement(source.lire(await r.json(), source.nom), Date.now());
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    throw new ErreurParkingsLive('Les places libres ne répondent pas.');
  }
}
