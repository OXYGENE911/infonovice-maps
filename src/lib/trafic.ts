// Info trafic — Bison Futé (ministère chargé des transports), la source
// NATIONALE des événements routiers : travaux, accidents, coupures,
// bouchons, intempéries. Vérifié par appels réels le 22/08/2026
// (docs/apis.md) : CORS ouvert, aucune clé, rafraîchi toutes les 3 minutes.
//
// L'URL N'EST PAS FIXE, et c'est le piège de cette source. Le service publie
// chaque itération dans un dossier horodaté (`data-AAAAMMJJ-HHMMSS`) : une
// URL notée aujourd'hui rend un fichier VIDE demain. Il faut donc demander
// d'abord l'horodate courante, puis composer le chemin — en heure de PARIS,
// puisque c'est celle qu'utilise le producteur.
//
// Les coordonnées arrivent en Lambert-93 : la reprojection vit dans
// lambert93.ts (sans dépendance).
import { versWGS84, dansEmpriseFrance } from './lambert93';

const HORODATE = 'https://www.bison-fute.gouv.fr/data/iteration/date.json';
const BASE = 'https://www1.bison-fute.gouv.fr';
const DELAI_MS = 8000;

export class ErreurTrafic extends Error {}

export type TypeEvenement =
  | 'TRAVAUX' | 'ACCIDENT' | 'BOUCHON' | 'COUPURE' | 'OBSTACLE'
  | 'RESTRICTION' | 'MESURE_GESTION_TRAFIC' | 'INTEMPERIES'
  | 'INFORMATION' | 'INTERDICTION_PL';

export interface EvenementRoute {
  id: string;
  lon: number;
  lat: number;
  type: TypeEvenement | string;
  /** EFFECTIF, PREVISIONNEL, TERMINE, ou vide. */
  etat: string;
  /** Chemin du détail (à demander seulement si l'usager clique). */
  detail: string | null;
  /** Date de création annoncée par le service (texte, tel quel). */
  cree: string | null;
}

/* Libellés français : le service parle en constantes techniques. */
const LIBELLES: Record<string, string> = {
  TRAVAUX: 'Travaux',
  ACCIDENT: 'Accident',
  BOUCHON: 'Bouchon',
  COUPURE: 'Route coupée',
  OBSTACLE: 'Obstacle',
  RESTRICTION: 'Restriction de circulation',
  MESURE_GESTION_TRAFIC: 'Gestion du trafic',
  INTEMPERIES: 'Intempéries',
  INFORMATION: 'Information',
  INTERDICTION_PL: 'Interdiction poids lourds',
};

export function libelleType(type: string): string {
  return LIBELLES[type] ?? 'Événement routier';
}

/* Couleurs : le rouge est réservé à ce qui bloque ou blesse. */
const COULEURS: Record<string, string> = {
  ACCIDENT: '#C0392B',
  COUPURE: '#C0392B',
  BOUCHON: '#E8722C',
  INTEMPERIES: '#E8722C',
  TRAVAUX: '#E89C2C',
  OBSTACLE: '#E89C2C',
  RESTRICTION: '#2272C4',
  INTERDICTION_PL: '#2272C4',
  MESURE_GESTION_TRAFIC: '#2272C4',
  INFORMATION: '#5F5E5A',
};

export function couleurType(type: string): string {
  return COULEURS[type] ?? '#5F5E5A';
}

/** Compose le chemin du dossier d'itération — PURE, testée à sec.
    L'heure est celle de PARIS : le producteur nomme ses dossiers ainsi, et
    lire l'horloge du visiteur donnerait un chemin inexistant hors de France. */
export function dossierIteration(horodateMs: number): string {
  const d = new Date(horodateMs);
  // `fr-FR` + fuseau explicite : pas de dépendance, et le résultat ne dépend
  // ni du réglage de l'appareil ni de l'heure d'été (que le fuseau gère).
  const parties = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const p = (t: string) => parties.find((x) => x.type === t)?.value ?? '00';
  // `hour` peut valoir « 24 » à minuit selon les moteurs : on ramène à « 00 ».
  const heure = p('hour') === '24' ? '00' : p('hour');
  return `data-${p('year')}${p('month')}${p('day')}-${heure}${p('minute')}${p('second')}`;
}

export function urlEvenements(dossier: string): string {
  return `${BASE}/data/${dossier}/evenementsOL6/maintenant/tfs/evenements/evenementsOL6.json`;
}

interface EntreeBrute {
  geometry?: { type?: string; coordinates?: unknown };
  properties?: Record<string, unknown>;
}

/** Réponse Bison Futé → événements exploitables — PURE et défensive.
    Les événements TERMINÉS sont écartés : le service les garde un temps, et
    afficher un accident déjà dégagé serait pire que de ne rien afficher. */
export function versEvenements(brut: unknown): EvenementRoute[] {
  const f = (brut as { features?: unknown[] })?.features;
  if (!Array.isArray(f)) {
    throw new ErreurTrafic('Le service d’info trafic n’a pas rendu de données exploitables.');
  }
  const evenements: EvenementRoute[] = [];
  for (const entree of f) {
    const e = entree as EntreeBrute | null;
    const coords = e?.geometry?.coordinates;
    if (e?.geometry?.type !== 'Point' || !Array.isArray(coords)) continue;
    const [x, y] = coords as [unknown, unknown];
    if (typeof x !== 'number' || typeof y !== 'number') continue;
    const point = versWGS84({ x, y });
    if (!point || !dansEmpriseFrance(point.lon, point.lat)) continue;
    const p = e.properties ?? {};
    const etat = typeof p['etat_evenement'] === 'string' ? p['etat_evenement'] : '';
    if (etat === 'TERMINE') continue;
    const detail = typeof p['urlcpc'] === 'string' && p['urlcpc'].startsWith('/data/')
      ? p['urlcpc'] : null;
    evenements.push({
      // Le service ne donne pas d'identifiant propre : le chemin du détail en
      // fait office, et à défaut la position (deux événements ne partagent
      // pas exactement le même point).
      id: detail ?? `${point.lon.toFixed(5)},${point.lat.toFixed(5)}`,
      lon: point.lon,
      lat: point.lat,
      type: typeof p['type'] === 'string' ? p['type'] : 'INFORMATION',
      etat,
      detail,
      cree: typeof p['dateCreation'] === 'string' ? p['dateCreation'] : null,
    });
  }
  return evenements;
}

/** Le détail d'un événement : un tableau imbriqué, avec du HTML dedans.
    On en tire du TEXTE — jamais de balises : ce contenu vient d'un service
    externe, et le projet n'injecte pas d'HTML étranger dans le DOM. */
export function versDetail(brut: unknown): { titre: string; texte: string } | null {
  const racine = Array.isArray(brut) ? brut[0] : null;
  if (!Array.isArray(racine)) return null;
  const titre = typeof racine[0] === 'string' ? racine[0] : '';
  const bloc = Array.isArray(racine[3]) ? racine[3] : [];
  const brutTexte = bloc.map((v) => (typeof v === 'string' ? v : '')).join(' ');
  const texte = brutTexte
    // Les sauts de ligne HTML deviennent de vrais sauts de ligne…
    .replace(/<br\s*\/?>/gi, '\n')
    // …et toute autre balise disparaît (on ne garde que du texte).
    .replace(/<[^>]*>/g, ' ')
    // Entités NUMÉRIQUES d'abord (le service écrit « jusqu&#39;au »), puis
    // les nommées. L'ordre compte : `&amp;#39;` doit rendre « &#39; », pas
    // une apostrophe — on décode donc `&amp;` en DERNIER.
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, '\'')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n').map((l) => l.trim()).join('\n')
    .trim();
  if (!titre && !texte) return null;
  return { titre, texte };
}

async function appel(url: string, signal?: AbortSignal): Promise<unknown> {
  let derniere: unknown;
  for (let essai = 0; essai < 2; essai += 1) {
    try {
      const r = await fetch(url, {
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(DELAI_MS)])
          : AbortSignal.timeout(DELAI_MS),
        headers: { Accept: 'application/json' },
      });
      if (r.ok) return await r.json();
      if (r.status >= 500) throw new Error(`service ${r.status}`);
      throw new ErreurTrafic(`L’info trafic est indisponible (réponse ${r.status}).`);
    } catch (e) {
      if (signal?.aborted) throw e;
      if (e instanceof ErreurTrafic) throw e;
      derniere = e;
      if (essai === 0) await new Promise((s) => setTimeout(s, 500));
    }
  }
  throw new ErreurTrafic(
    'L’info trafic est momentanément indisponible. Réessayez dans un instant.',
    { cause: derniere },
  );
}

/** Les événements routiers de toute la France (~100 Ko). Deux requêtes :
    l'horodate courante, puis la couche elle-même. */
export async function chargerTrafic(signal?: AbortSignal): Promise<EvenementRoute[]> {
  const horodate = await appel(HORODATE, signal);
  const ms = Array.isArray(horodate) ? Number(horodate[0]) : Number(horodate);
  if (!Number.isFinite(ms)) {
    throw new ErreurTrafic('Le service d’info trafic n’a pas rendu d’horodate exploitable.');
  }
  return versEvenements(await appel(urlEvenements(dossierIteration(ms)), signal));
}

export async function chargerDetail(
  chemin: string, signal?: AbortSignal,
): Promise<{ titre: string; texte: string } | null> {
  // Le chemin vient du service : on n'accepte QUE ses chemins relatifs, et on
  // les recolle nous-mêmes à l'hôte — une URL absolue forgée n'aurait aucune
  // chance d'être appelée.
  if (!chemin.startsWith('/data/')) return null;
  return versDetail(await appel(BASE + chemin, signal));
}
