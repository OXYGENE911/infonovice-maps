/* LES FEUX TRICOLORES D'UN TRAJET — comptés, jamais optimisés.
 *
 * LA DEMANDE. Armelin, le 30/08/2026 : « existe-t-il un moyen d'afficher les
 * feux rouges sur la carte, afin de pouvoir optimiser les trajets les plus
 * courts avec le moins de feux rouges ? » Puis, après mesure : « fais le
 * comptage des feux sur les trois variantes ».
 *
 * CE QU'ON NE FAIT PAS, ET IL FAUT LE DIRE D'ABORD. On n'OPTIMISE pas : le
 * service d'itinéraire ne prend aucun coût personnalisé et ne rend pas
 * d'alternatives (mesuré en PR #6, reconfirmé le 29/08). On ne peut donc pas
 * lui demander « le trajet avec le moins de feux ». Ce qu'on peut faire —
 * et c'est ce que fait ce module — c'est COMPTER les feux de chacun des trois
 * itinéraires qu'on calcule déjà, pour que le choix soit éclairé. Un chiffre
 * compté sur le tracé réel, pas une estimation.
 *
 * LA SOURCE. `highway=traffic_signals` d'OpenStreetMap, relevé le 30/08 :
 * 1 204 feux dans un carré de Paris centre-nord. La couverture est celle de
 * la ville, où les feux se trouvent.
 *
 * LE PIÈGE, ET C'EST LE CŒUR DE CE MODULE : un carrefour à feux porte
 * PLUSIEURS nœuds — un par branche d'accès. Compter les nœuds donnerait
 * quatre feux pour un seul croisement, et le chiffre serait faux d'un facteur
 * trois. On regroupe donc les nœuds proches en CARREFOURS, et l'on compte les
 * carrefours : c'est ce qu'un conducteur compte, lui qui s'arrête une fois.
 */
import { distanceM, situerSurLeTrace } from './le-long-du-trajet';
import { decimerSerre } from './limites';
import {
  decouperParLongueur, aRenonce, delaiClientMs, respirer, MAX_TRONCONS,
} from './troncons';

/** Un feu relevé, réduit à sa position. */
export interface Feu {
  lon: number;
  lat: number;
}

/* CE QUI COMPTE COMME « SUR LE TRAJET ». Vingt mètres : un feu du carrefour
   qu'on traverse est sur la chaussée ou à son bord ; celui de la rue
   parallèle est plus loin. Le même ordre de grandeur que les limites de
   vitesse (25 m), qui cherchent aussi LA route qu'on suit. */
export const RAYON_FEU_M = 20;

/* CE QUI FAIT UN SEUL CARREFOUR. Quarante mètres entre deux nœuds : c'est la
   largeur d'un croisement urbain avec ses quatre têtes de feux. Au-delà, ce
   sont deux carrefours — et sur un boulevard, deux arrêts. */
export const GROUPE_CARREFOUR_M = 40;

/* LE BUDGET LAISSÉ AU SERVEUR, en secondes. Soixante : mesuré le 31/08, un
   couloir de 139 km répond en 12 s et un de 75 km en 17 s — la charge du
   service compte autant que la longueur. Le client, lui, attend PLUS que ce
   budget (voir `delaiClientMs`) : couper à l'heure exacte du serveur, c'était
   perdre une course qu'on avait soi-même créée. */
export const BUDGET_FEUX_S = 60;

/** Le corps de la requête Overpass — PURE, un seul appel pour trois tracés. */
export function requeteFeux(traces: readonly (readonly [number, number][])[]): string {
  /* UN SEUL APPEL POUR LES TROIS VARIANTES : les corridors se recouvrent
     largement, et Overpass est tenu par des bénévoles. On demande donc
     l'UNION des trois couloirs, et l'on attribue ensuite chaque feu à chaque
     variante par la géométrie — ce qui ne coûte rien à personne. */
  const points = traces
    .filter((t) => t.length >= 2)
    .flatMap((t) => decimerSerre(t as [number, number][]))
    .map(([lon, lat]) => `${lat.toFixed(5)},${lon.toFixed(5)}`)
    .join(',');
  return `[out:json][timeout:${BUDGET_FEUX_S}];`
    + `node(around:${RAYON_FEU_M},${points})[highway=traffic_signals];`
    /* `out skel` : on n'a besoin que des coordonnées. Les étiquettes
       tripleraient la réponse pour rien. */
    + 'out skel;';
}

/** Relit la réponse — DÉFENSIVE : elle vient d'un service. */
export function versFeux(brut: unknown): Feu[] {
  const elements = (brut as { elements?: unknown })?.elements;
  if (!Array.isArray(elements)) return [];
  const rendu: Feu[] = [];
  for (const e of elements) {
    if (typeof e !== 'object' || e === null) continue;
    const n = e as { type?: string; lon?: unknown; lat?: unknown };
    if (n.type !== 'node' || typeof n.lon !== 'number' || typeof n.lat !== 'number') continue;
    rendu.push({ lon: n.lon, lat: n.lat });
  }
  return rendu;
}

/**
 * Le nombre de CARREFOURS à feux d'un tracé — PURE.
 *
 * DEUX ÉTAPES, ET LA SECONDE EST CELLE QUI COMPTE JUSTE. On retient d'abord
 * les feux qui bordent le tracé ; on les regroupe ensuite par carrefour. Un
 * croisement urbain porte jusqu'à quatre têtes de feux : les compter une par
 * une donnerait quatre arrêts là où l'on s'arrête une fois.
 *
 * LE REGROUPEMENT SE FAIT LE LONG DU TRAJET, pas dans le plan : deux feux
 * distants de trente mètres à vol d'oiseau mais séparés par trois cents
 * mètres de route (un aller-retour, un carrefour en Y) sont deux arrêts.
 */
export function compterFeux(
  feux: readonly Feu[], trace: readonly [number, number][],
  rayonM: number = RAYON_FEU_M,
): number {
  if (trace.length < 2) return 0;
  const avancements: number[] = [];
  for (const f of feux) {
    const { ecart, avancement } = situerSurLeTrace(f, trace as [number, number][]);
    if (ecart <= rayonM) avancements.push(avancement);
  }
  avancements.sort((a, b) => a - b);
  let carrefours = 0;
  let dernier = -Infinity;
  for (const a of avancements) {
    if (a - dernier > GROUPE_CARREFOUR_M) carrefours += 1;
    dernier = a;
  }
  return carrefours;
}

/** Les feux à poser sur la carte, dédoublonnés par carrefour — PURE. */
export function carrefoursDistincts(feux: readonly Feu[]): Feu[] {
  const rendu: Feu[] = [];
  for (const f of feux) {
    if (rendu.some((g) => distanceM([g.lon, g.lat], [f.lon, f.lat]) < GROUPE_CARREFOUR_M)) continue;
    rendu.push(f);
  }
  return rendu;
}

export class ErreurFeux extends Error {}

/** Ce qu'un relevé rapporte : les feux, et s'il est COMPLET. */
export interface ReleveFeux {
  feux: Feu[];
  /** Faux si un tronçon a échoué : le comptage est alors un MINIMUM. */
  complet: boolean;
}

/**
 * Relève les feux des trois corridors — UN appel, au clic de comparaison.
 *
 * L'ÉCHEC EST BÉNIN : la comparaison garde ses durées, ses distances et ses
 * arrêts de recharge, et la ligne des feux ne paraît pas. On ne fait pas
 * tomber trois calculs d'itinéraire pour un chiffre d'appoint.
 */
export async function chargerFeux(
  traces: readonly (readonly [number, number][])[], signal?: AbortSignal,
  progres?: (faits: number, total: number) => void,
): Promise<ReleveFeux> {
  const utiles = traces.filter((t) => t.length >= 2);
  if (utiles.length === 0) return { feux: [], complet: true };

  /* CHAQUE TRACÉ EST DÉCOUPÉ, PUIS TOUS LES TRONÇONS SE SUIVENT. Une seule
     requête pour 775 km épuisait le budget du service (mesuré le 31/08 :
     45,7 s puis rien). Un tronçon de 130 km répond ; sept tronçons à la file
     restent polis, là où sept requêtes lancées ensemble ne le seraient pas. */
  const tous = utiles.flatMap((t) => decouperParLongueur(t as [number, number][]));
  const troncons = tous.slice(0, MAX_TRONCONS);
  const feux: Feu[] = [];
  // CE QUI DÉPASSE N'EST PAS RELEVÉ, et se dit.
  let complet = tous.length === troncons.length;
  let unSucces = false;
  // En surcharge, Overpass rend du HTML : « saturé » est un conseil, pas un
  // constat — et il se distingue d'une indisponibilité franche.
  let sature = false;

  for (let i = 0; i < troncons.length; i += 1) {
    /* ON RESPIRE ENTRE DEUX TRONÇONS. Six requêtes lourdes enchaînées sans
       pause se font limiter par le service — mesuré le 31/08. */
    if (i > 0) await respirer();
    if (signal?.aborted) throw new ErreurFeux('Relevé interrompu.');
    const horloge = new AbortController();
    const minuteur = setTimeout(
      () => { horloge.abort(); }, delaiClientMs(BUDGET_FEUX_S),
    );
    const relais = (): void => { horloge.abort(); };
    signal?.addEventListener('abort', relais);
    try {
      const r = await fetch('https://overpass.openstreetmap.fr/api/interpreter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(requeteFeux([troncons[i]!]))}`,
        signal: horloge.signal,
      });
      if (!r.ok) { complet = false; continue; }
      const texte = await r.text();
      let brut: unknown;
      try { brut = JSON.parse(texte); } catch { sature = true; complet = false; continue; }
      /* L'AVEU DU SERVICE SE LIT. Sans cette lecture, une expiration rendait
         un tableau vide qu'on affichait « 0 feu » — un chiffre faux, pire
         qu'un aveu, et c'est exactement ce qu'Armelin a rencontré. */
      if (aRenonce(brut)) { complet = false; continue; }
      feux.push(...versFeux(brut));
      unSucces = true;
    } catch {
      complet = false;
    } finally {
      clearTimeout(minuteur);
      signal?.removeEventListener('abort', relais);
      progres?.(i + 1, troncons.length);
    }
  }

  // TOUT A ÉCHOUÉ : c'est une panne, pas un trajet sans feux.
  if (!unSucces) {
    throw new ErreurFeux(sature
      ? 'Le service OpenStreetMap est saturé.'
      : 'Le relevé des feux est indisponible.');
  }
  return { feux, complet };
}
