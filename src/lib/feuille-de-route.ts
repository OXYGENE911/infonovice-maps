// Feuille de route — les étapes détaillées d'un itinéraire, en français.
// Service : data.geopf.fr/navigation avec `getSteps=true&waysAttributes=name`,
// vérifié par appels réels le 21/08/2026 (docs/apis.md) : les instructions
// arrivent en CODES OSRM (`type` + `modifier`, parfois `exit`), jamais en
// texte — la langue est notre travail. Les noms de voies arrivent en
// MAJUSCULES ABRÉGÉES BD TOPO (« R DE RIVOLI », « AV VICTORIA ») avec les
// numéros de routes dans `cpx_numero` (« A6 »). Résilience : timeout 8 s,
// une reprise, erreurs en français (règles du projet).
import type { PointGeo } from './coordonnees';
import { urlItineraire, type Profil, type OptionsItineraire } from './itineraire';

const DELAI_MS = 8000;

export class ErreurFeuille extends Error {}

/* LA MANŒUVRE NORMALISÉE — pour la DESSINER, pas seulement la dire. Le suivi
   affiche une flèche par manœuvre (PR C du cadrage navigation mobile) : la
   phrase reste la vérité, la flèche l'anticipe d'un coup d'œil. */
export type Manoeuvre = 'uturn' | 'sharp right' | 'right' | 'slight right'
  | 'straight' | 'slight left' | 'left' | 'sharp left'
  | 'rond-point' | 'arrivee';

export interface EtapeRoute {
  /** L'instruction en français : « Tournez à droite ». */
  texte: string;
  /** La voie concernée, lisible : « Rue de Rivoli », « A6 » — ou ''. */
  voie: string;
  /** Longueur de l'étape en mètres. */
  distance: number;
  /** La manœuvre à dessiner. `straight` quand le code ne dit rien de mieux. */
  manoeuvre: Manoeuvre;
}

/** `type` + `modifier` OSRM → la manœuvre à dessiner — PURE. */
export function manoeuvreDe(i: { type?: string; modifier?: string }): Manoeuvre {
  if (i.type === 'arrive') return 'arrivee';
  if (i.type === 'roundabout' || i.type === 'rotary') return 'rond-point';
  /* AU DÉPART, LE MODIFIER DIT DE QUEL CÔTÉ ON S'ENGAGE — pas une manœuvre à
     venir. Une flèche « à gauche » sous le mot « Départ » se lirait comme un
     ordre : on dessine tout droit. Vu sur les fixtures mêmes de ce fichier. */
  if (i.type === 'depart') return 'straight';
  const m = i.modifier ?? '';
  const connues: Manoeuvre[] = ['uturn', 'sharp right', 'right', 'slight right',
    'straight', 'slight left', 'left', 'sharp left'];
  return (connues as string[]).includes(m) ? m as Manoeuvre : 'straight';
}

/* ---- traduction des codes OSRM, décidée une fois ---- */

const DIRECTIONS: Record<string, string> = {
  uturn: 'demi-tour',
  'sharp right': 'franchement à droite',
  right: 'à droite',
  'slight right': 'légèrement à droite',
  straight: 'tout droit',
  'slight left': 'légèrement à gauche',
  left: 'à gauche',
  'sharp left': 'franchement à gauche',
};

function tourner(modifier: string | undefined): string {
  if (modifier === 'uturn') return 'Faites demi-tour';
  const d = DIRECTIONS[modifier ?? ''];
  return d && modifier !== 'straight' ? `Tournez ${d}` : 'Continuez tout droit';
}

/** `type` + `modifier` (+ `exit`) OSRM → une phrase française — PURE.
    Les gardes `uturn`/`straight` par cas ne sont pas de la manie : « Continuez
    demi-tour » et « tournez tout droit » sont les phrases qu'on obtient sans
    elles, et ces combinaisons sortent réellement des moteurs OSRM (relu par
    contre-expertise le 21/08). */
export function traduireInstruction(i: { type?: string; modifier?: string; exit?: number }): string {
  const m = i.modifier;
  const dir = DIRECTIONS[m ?? ''];
  const tourneOuContinue = m === 'uturn' || m === 'straight' || !dir;
  switch (i.type) {
    case 'depart': return 'Départ';
    case 'arrive': return 'Vous êtes arrivé';
    case 'turn': return tourner(m);
    case 'continue':
    case 'new name': return tourneOuContinue ? tourner(m) : `Continuez ${dir}`;
    case 'merge': return tourneOuContinue ? 'Rejoignez la voie' : `Rejoignez la voie ${dir}`;
    case 'on ramp': return 'Prenez la bretelle d’accès';
    case 'off ramp': return 'Prenez la sortie';
    case 'fork': return tourneOuContinue
      ? 'À l’embranchement, continuez tout droit'
      : `À l’embranchement, restez ${dir}`;
    case 'end of road': return m === 'uturn' || m === 'straight'
      ? `Au bout de la voie, ${m === 'uturn' ? 'faites demi-tour' : 'continuez tout droit'}`
      : (dir ? `Au bout de la voie, tournez ${dir}` : 'Au bout de la voie, tournez');
    case 'roundabout':
    case 'rotary': return i.exit
      ? `Au rond-point, prenez la ${i.exit === 1 ? '1ʳᵉ' : `${i.exit}ᵉ`} sortie`
      : 'Au rond-point, suivez la direction indiquée';
    case 'exit roundabout':
    case 'exit rotary': return 'Sortez du rond-point';
    default:
      // Un code inconnu ne casse pas la feuille : on reste générique.
      return tourner(m);
  }
}

/* ---- noms de voies BD TOPO → libellés lisibles ---- */

const TYPES_DE_VOIE: Record<string, string> = {
  R: 'Rue', AV: 'Avenue', BD: 'Boulevard', PL: 'Place', RTE: 'Route',
  CHE: 'Chemin', IMP: 'Impasse', ALL: 'Allée', QU: 'Quai', CRS: 'Cours',
  SQ: 'Square', PONT: 'Pont', RPT: 'Rond-point', CAR: 'Carrefour',
};
const PARTICULES = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'et', 'sur', 'sous', 'au', 'aux', 'en']);

/** Capitalise un segment en respectant l'apostrophe : l'eglise → l'Eglise. */
function capitaliser(segment: string): string {
  const elision = /^([ld]['’])(.*)$/.exec(segment);
  if (elision) return elision[1]! + capitaliser(elision[2]!);
  return segment ? segment[0]!.toUpperCase() + segment.slice(1) : segment;
}

/** « R DE RIVOLI » → « Rue de Rivoli » — PURE, défensive. */
export function libelleVoie(nom: unknown): string {
  if (typeof nom !== 'string' || !nom.trim()) return '';
  const mots = nom.trim().toLowerCase().split(/\s+/);
  const premier = TYPES_DE_VOIE[mots[0]!.toUpperCase()];
  /* L'ÉLISION SE RECOLLE (TERRAIN-1, 30/08). Le service livre les noms sans
     apostrophe : « R DU CHATEAU D EAU », « R DE L EGLISE ». Rendus mot à
     mot, ils donnaient « Rue du Chateau D Eau » — vu sur capture, une fois
     le nom de rue passé au premier plan du panneau. Un « d » ou un « l »
     seul est une élision : il se recolle au mot suivant. */
  const bruts = premier ? mots.slice(1) : mots;
  const recolles: string[] = [];
  for (let i = 0; i < bruts.length; i += 1) {
    const m = bruts[i]!;
    const suivant = bruts[i + 1];
    if ((m === 'd' || m === 'l') && suivant !== undefined && recolles.length > 0) {
      recolles.push(`${m}’${suivant}`);
      i += 1;
    } else recolles.push(m);
  }
  const reste = recolles.map((m, idx) => {
    // Une particule reste en minuscules — sauf si elle OUVRE le libellé rendu
    // (pas de type de voie devant elle) : « Du Guesclin » reste Du Guesclin.
    if ((premier || idx > 0) && PARTICULES.has(m)) return m;
    /* Une élision recollée garde sa minuscule et capitalise ce qui suit :
       « d’eau » devient « d’Eau », jamais « D’eau ». */
    const elision = /^([dl])’(.+)$/.exec(m);
    if (elision) return `${elision[1]}’${capitaliser(elision[2]!)}`;
    // Chaque segment composé garde sa majuscule : saint-martin → Saint-Martin.
    return m.split('-').map(capitaliser).join('-');
  });
  return [premier, ...reste].filter(Boolean).join(' ');
}

interface EtapeService {
  instruction?: { type?: string; modifier?: string; exit?: number };
  attributes?: { name?: { nom_1_gauche?: unknown; cpx_numero?: unknown; cpx_toponyme?: unknown } };
  distance?: number;
}

/** Réponse du service → étapes propres — PURE, testée à sec. */
export function versEtapes(brut: unknown): EtapeRoute[] {
  const portions = (brut as { portions?: { steps?: EtapeService[] }[] })?.portions;
  const brutes = Array.isArray(portions) ? portions.flatMap((p) => p?.steps ?? []) : [];
  const etapes: EtapeRoute[] = [];
  for (const e of brutes) {
    if (!e || typeof e !== 'object') continue;
    const nom = e.attributes?.name;
    const numero = typeof nom?.cpx_numero === 'string' && nom.cpx_numero.trim() ? nom.cpx_numero.trim() : '';
    const voie = numero || libelleVoie(nom?.nom_1_gauche) || libelleVoie(nom?.cpx_toponyme);
    etapes.push({
      texte: traduireInstruction(e.instruction ?? {}),
      voie,
      distance: Number.isFinite(e.distance) ? (e.distance as number) : 0,
      manoeuvre: manoeuvreDe(e.instruction ?? {}),
    });
  }
  if (etapes.length < 2) {
    throw new ErreurFeuille('Le service n’a pas rendu d’étapes exploitables.');
  }
  return etapes;
}

export async function etapesItineraire(
  depart: PointGeo, arrivee: PointGeo, profil: Profil, options: OptionsItineraire = {},
): Promise<EtapeRoute[]> {
  // La MÊME construction d'URL que le calcul d'itinéraire (options comprises) :
  // la feuille décrit le trajet demandé, pas une variante sans contraintes.
  const url = urlItineraire(depart, arrivee, profil, options, true);
  let derniere: unknown;
  for (let essai = 0; essai < 2; essai += 1) {
    try {
      const r = await fetch(url, {
        signal: AbortSignal.timeout(DELAI_MS),
        headers: { Accept: 'application/json' },
      });
      if (r.status === 404) {
        // Comme dans itineraire.ts : 404 = « aucun graphe ne relie les deux
        // points », une RÉPONSE déterministe — la rejouer gaspillerait le
        // quota public pour le même verdict.
        throw new ErreurFeuille('Aucun itinéraire trouvé entre ces deux points.');
      }
      if (!r.ok) throw new Error(`service ${r.status}`);
      return versEtapes(await r.json());
    } catch (e) {
      if (e instanceof ErreurFeuille) throw e;
      derniere = e;
      if (essai === 0) await new Promise((s) => setTimeout(s, 500));
    }
  }
  throw new ErreurFeuille(
    'La feuille de route est momentanément indisponible. Réessayez dans un instant.',
    { cause: derniere },
  );
}
