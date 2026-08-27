/* LIEUX D'EXCEPTION PRÈS DU TRAJET — les monuments historiques CLASSÉS de la
 * base Mérimée (ministère de la Culture), à un détour raisonnable de la
 * route.
 *
 * LA DEMANDE. Armelin, le 27/08/2026, montrant Nomadio : « intégrer dans le
 * planificateur une fonction permettant d'afficher des lieux d'exception à
 * proximité de son parcours […] le détour maximal acceptable en termes de
 * minutes ». DATAtourisme étant écarté (clé impossible sur un site statique,
 * décision du 25/08), la base Mérimée est la voie souveraine : ministère de
 * la Culture, sans clé, licence ouverte.
 *
 * L'INDEX EST ENGENDRÉ, PAS TÉLÉCHARGÉ DU MINISTÈRE PAR LE NAVIGATEUR : le
 * CSV source pèse 100 Mo. scripts/generer-monuments.mjs le réduit aux seuls
 * CLASSÉS géolocalisés (mesuré le 27/08/2026 : 14 350 sur 46 760 notices,
 * 890 Ko servis par ce site même) — voir l'en-tête du script pour les
 * mesures qui ont décidé de la coupe. Chargé À LA DEMANDE, une fois, jamais
 * précaché : il n'entre ni dans le budget bundle ni dans l'installation.
 *
 * LE DÉTOUR EST UNE APPROXIMATION, ET C'EST DIT : l'écart au tracé est à vol
 * d'oiseau, converti en minutes à une vitesse d'approche moyenne. La page
 * l'écrit — « environ » n'est pas un mot décoratif.
 */
import { tronconner, retenir, type SurLeTrajet } from './le-long-du-trajet';

export interface Monument {
  lon: number;
  lat: number;
  titre: string;
  commune: string;
}

/** Km parcourus par minute de détour — 60 km/h d'approche moyenne : on
    quitte une nationale, on traverse un bourg. */
export const KM_PAR_MINUTE = 1;

export class ErreurMonuments extends Error {}

/** Décode l'index engendré. Défensif : le fichier pourrait être altéré. */
export function versMonuments(brut: unknown): Monument[] {
  if (!Array.isArray(brut)) return [];
  const rendu: Monument[] = [];
  for (const l of brut) {
    if (!Array.isArray(l) || l.length < 4) continue;
    const [lon, lat, titre, commune] = l as unknown[];
    if (typeof lon !== 'number' || typeof lat !== 'number') continue;
    if (Math.abs(lon) > 180 || Math.abs(lat) > 90) continue;
    if (typeof titre !== 'string' || titre.trim() === '') continue;
    rendu.push({
      lon, lat, titre: titre.trim(),
      commune: typeof commune === 'string' ? commune.trim() : '',
    });
  }
  return rendu;
}

/* L'INDEX SE LIT UNE FOIS PAR SESSION : 890 Ko relus à chaque réglage du
   détour seraient un gâchis — le nôtre, cette fois, mais un gâchis quand
   même. La promesse est partagée pour que deux appels simultanés ne
   téléchargent pas deux fois. */
let enMemoire: Promise<Monument[]> | null = null;

export function chargerMonuments(signal?: AbortSignal): Promise<Monument[]> {
  enMemoire ??= (async () => {
    let r: Response;
    try {
      r = await fetch('/donnees/monuments.json', signal ? { signal } : {});
    } catch (e) {
      enMemoire = null; // réessayable : l'échec ne se grave pas
      throw new ErreurMonuments('Les lieux d’exception ne sont pas disponibles pour le moment.', { cause: e });
    }
    if (!r.ok) {
      enMemoire = null;
      throw new ErreurMonuments('Les lieux d’exception ne sont pas disponibles pour le moment.');
    }
    const monuments = versMonuments(await r.json().catch(() => null));
    if (monuments.length === 0) {
      enMemoire = null;
      throw new ErreurMonuments('Le répertoire des monuments est illisible.');
    }
    return monuments;
  })();
  return enMemoire;
}

/**
 * Les monuments à moins de `detourMin` minutes du tracé — PURE, locale.
 *
 * Même mécanique que les bornes du trajet : pré-filtre par boîtes englobantes
 * (14 350 candidats contre des milliers de segments feraient des dizaines de
 * millions de projections), puis distance EXACTE au tracé.
 */
export function monumentsDuTrajet(
  monuments: Monument[], trace: [number, number][], detourMin: number,
): SurLeTrajet<Monument>[] {
  const rayonM = Math.max(1, detourMin) * KM_PAR_MINUTE * 1000;
  const boites = tronconner(trace, rayonM);
  const candidats = monuments.filter((m) => boites.some((b) =>
    m.lon >= b.ouest && m.lon <= b.est && m.lat >= b.sud && m.lat <= b.nord));
  return retenir(candidats, trace, rayonM);
}
