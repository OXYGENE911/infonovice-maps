/* LES SORTIES D'AUTOROUTE : leur numéro, et les villes qu'elles desservent.
 *
 * LA DEMANDE. Armelin, le 30/08/2026, après avoir lu le tableau de ce qui
 * manquait : « fais le numéro de sortie et la destination ».
 *
 * UNE MESURE EN CORRIGE UNE AUTRE, ENCORE. Il était écrit dans docs/apis.md
 * que le numéro de sortie et la destination étaient « absents » : c'était
 * vrai du service d'itinéraire, et faux d'OpenStreetMap — que ce projet
 * consomme déjà pour les limites de vitesse. La note avait cherché la donnée
 * là où elle n'était pas.
 *
 * CE QUI A ÉTÉ RELEVÉ (30/08, corridor Paris → Melun, 71 km, un appel
 * Overpass de 19 s) :
 *   - 46 nœuds `highway=motorway_junction` le long du trajet, dont 18
 *     portent un `ref` — le NUMÉRO de sortie (« 5 », « 1 ») — et certains un
 *     `name` (« Châtillon-la-Borde », « Sens ») ;
 *   - 82 bretelles portant `destination` : « Lyon;Évry », « Troyes;
 *     Corbeil-Essonnes;Sénart;Melun », avec parfois `destination:ref`
 *     (« A 6a », « N 104 ») — c'est-à-dire EXACTEMENT ce qu'on lit sur un
 *     panneau.
 *
 * LA COUVERTURE EST PARTIELLE, ET C'EST LA RÈGLE DE LA MAISON QUI TRANCHE :
 * on affiche ce qu'on a, on SE TAIT sur le reste. Un numéro de sortie absent
 * n'est pas un numéro faux ; c'est un panneau qui n'en porte pas.
 *
 * ET L'ON NE DEMANDE RIEN DE PLUS AU COMMUN. Ces éléments voyagent dans la
 * MÊME requête Overpass que les limites de vitesse (lib/corridor.ts) :
 * Overpass est tenu par des bénévoles, et deux requêtes là où une suffit
 * seraient deux fois trop.
 */
import { situerSurLeTrace } from './le-long-du-trajet';

/** Une sortie d'autoroute, recousue sur le tracé suivi. */
export interface Sortie {
  /** Avancement du point de divergence, en mètres. */
  avancementM: number;
  /** Le numéro porté par le panneau — « 14 ». Absent : la sortie n'en a pas. */
  numero: string | null;
  /** Le nom de la sortie — « Châtillon-la-Borde ». */
  nom: string | null;
}

/** Les villes desservies par une bretelle, telles qu'elles sont annoncées. */
export interface DestinationBretelle {
  avancementM: number;
  /** « Lyon;Évry » devient ['Lyon', 'Évry'] — l'ordre du panneau. */
  villes: string[];
  /** La route rejointe : « A 6a », « N 104 ». */
  route: string | null;
}

/* AU-DELÀ, CE N'EST PAS NOTRE SORTIE. Quarante mètres pour la couture (le
   rayon de la requête), et le nœud de divergence est SUR la chaussée qu'on
   suit — c'est le point où la bretelle s'en détache. */
const ECART_MAX_M = 40;

/** Le fragment de requête Overpass — PURE. Il se joint à celui des limites. */
export function fragmentSorties(pointsAutour: string): string {
  /* DEUX FAMILLES, ET CHACUNE SA RAISON : le NŒUD de divergence porte le
     numéro de sortie ; la BRETELLE porte les villes. Aucune des deux ne
     porte les deux. On exige `destination` sur les bretelles — sans elle,
     on ramènerait toutes les bretelles de France sans rien à en dire. */
  return `node(around:${ECART_MAX_M},${pointsAutour})[highway=motorway_junction];`
    + `way(around:${ECART_MAX_M},${pointsAutour})`
    + '[highway~"^(motorway|trunk|primary)_link$"][destination];';
}

/** Les valeurs qu'on refuse de prendre pour un numéro de sortie. */
const NUMERO_PLAUSIBLE = /^[0-9]{1,3}[a-zA-Z]?$/;

/**
 * Les sorties, recousues sur le tracé — PURE.
 *
 * ON JETTE CE QUI NE DIT RIEN : un nœud sans numéro NI nom n'apprend rien à
 * personne — la moitié des nœuds relevés sont dans ce cas. Et l'on refuse ce
 * qui ne ressemble pas à un numéro de sortie : `ref` est un champ libre, et
 * une sortie « Aire de Darvault » n'est pas la sortie 14.
 */
export function versSorties(
  elements: readonly unknown[], trace: readonly [number, number][],
): Sortie[] {
  if (trace.length < 2) return [];
  const rendu: Sortie[] = [];
  for (const brut of elements) {
    /* LA RÉPONSE VIENT D'UN SERVICE : un `null` dans la liste ne doit pas
       faire tomber le relevé entier. Trouvé par un test, pas en production. */
    if (typeof brut !== 'object' || brut === null) continue;
    const e = brut as {
      type?: string; lon?: number; lat?: number; tags?: Record<string, string>;
    };
    if (e.type !== 'node' || typeof e.lon !== 'number' || typeof e.lat !== 'number') continue;
    if (e.tags?.['highway'] !== 'motorway_junction') continue;
    const ref = e.tags['ref']?.trim() ?? '';
    const nom = e.tags['name']?.trim() ?? '';
    const numero = NUMERO_PLAUSIBLE.test(ref) ? ref : null;
    if (numero === null && nom === '') continue;
    const { ecart, avancement } = situerSurLeTrace(
      { lon: e.lon, lat: e.lat }, trace as [number, number][],
    );
    if (ecart > ECART_MAX_M) continue;
    rendu.push({ avancementM: avancement, numero, nom: nom === '' ? null : nom });
  }
  return rendu.sort((a, b) => a.avancementM - b.avancementM);
}

/* CE QU'UN PANNEAU PORTE, ET PAS PLUS. Les bretelles annoncent jusqu'à six
   villes (« Troyes;Corbeil-Essonnes;Sénart;Melun;Marne-la-Vallée;
   Lisses-Centre », relevé le 30/08) ; un panneau réel en aligne trois ou
   quatre, et notre cartouche fait trois cents pixels. Les trois PREMIÈRES,
   qui sont les plus lointaines et les plus structurantes — c'est l'ordre
   qu'OpenStreetMap reprend du panneau. */
export const MAX_VILLES = 3;

/** Les destinations des bretelles, recousues sur le tracé — PURE. */
export function versDestinations(
  elements: readonly unknown[], trace: readonly [number, number][],
): DestinationBretelle[] {
  if (trace.length < 2) return [];
  const rendu: DestinationBretelle[] = [];
  for (const brut of elements) {
    if (typeof brut !== 'object' || brut === null) continue;
    const e = brut as {
      type?: string; tags?: Record<string, string>;
      geometry?: { lon: number; lat: number }[];
    };
    if (e.type !== 'way' || !Array.isArray(e.geometry) || e.geometry.length === 0) continue;
    const villes = (e.tags?.['destination'] ?? '')
      .split(';')
      .map((v) => v.trim())
      .filter((v) => v !== '')
      .slice(0, MAX_VILLES);
    if (villes.length === 0) continue;
    const tete = e.geometry[0]!;
    const { ecart, avancement } = situerSurLeTrace(
      { lon: tete.lon, lat: tete.lat }, trace as [number, number][],
    );
    if (ecart > ECART_MAX_M) continue;
    const route = e.tags?.['destination:ref']?.trim() ?? '';
    rendu.push({ avancementM: avancement, villes, route: route === '' ? null : route });
  }
  return rendu.sort((a, b) => a.avancementM - b.avancementM);
}

/* LA FENÊTRE AUTOUR DE LA MANŒUVRE. Le nœud de divergence et le point de
   manœuvre décrivent le même endroit vu par deux producteurs : cent
   cinquante mètres absorbent leur désaccord sans attraper la sortie
   suivante, qui est à des kilomètres sur autoroute. */
export const FENETRE_SORTIE_M = 150;

/** La sortie prise à cette manœuvre, s'il y en a une — PURE. */
export function sortieA(
  sorties: readonly Sortie[], manoeuvreM: number, fenetreM: number = FENETRE_SORTIE_M,
): Sortie | null {
  let meilleure: Sortie | null = null;
  let ecart = Infinity;
  for (const s of sorties) {
    const d = Math.abs(s.avancementM - manoeuvreM);
    if (d <= fenetreM && d < ecart) { meilleure = s; ecart = d; }
  }
  return meilleure;
}

/* LA BRETELLE COMMENCE À LA MANŒUVRE, ELLE NE LA PRÉCÈDE PAS. On regarde
   donc DEVANT : de cinquante mètres en amont (le désaccord des producteurs)
   à quatre cents mètres en aval — au-delà, c'est une autre bretelle. */
export function destinationA(
  destinations: readonly DestinationBretelle[], manoeuvreM: number,
): DestinationBretelle | null {
  let meilleure: DestinationBretelle | null = null;
  for (const d of destinations) {
    const ecart = d.avancementM - manoeuvreM;
    if (ecart < -50 || ecart > 400) continue;
    if (!meilleure || d.avancementM < meilleure.avancementM) meilleure = d;
  }
  return meilleure;
}
