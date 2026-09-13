/* LES TYPES DE `chrono-sonde.mjs`, pour que les parcours E2E puissent
   l'importer sans `any`. La sonde, elle, est en JavaScript pur : elle doit
   pouvoir tourner par `node scripts/…` sans étape de compilation, y compris le
   jour où personne n'a envie d'installer la chaîne de build pour prendre une
   mesure. Ce fichier est donc la seule concession, et il est minuscule. */

/** Ce que l'observateur de page relève, en brut. */
export interface BrutSonde {
  armeA: number | null;
  departA: number | null;
  itiPretA: number | null;
  planPretA: number | null;
  planLisibleA: number | null;
  naturePlan: string | null;
  porteOuverteA?: number | null;
  porteFermeeA?: number | null;
  porteAtteignableA?: number | null;
  dernierRegard: number;
  debutObservationA: number;
  attentes: { a: number; texte: string }[];
}

export interface VerdictCalcul {
  mesure: boolean;
  /** `null` chaque fois que le plan n'est pas venu : une valeur bornée par la
   *  fenêtre d'observation ne sort jamais sous le nom d'une mesure. */
  dureeCalculMs: number | null;
  /** Le plan ÉCRIT, voile retiré — pas nécessairement à l'écran. Jalon, pas critère. */
  dureeCalculInterneMs: number | null;
  dureeItineraireMs: number | null;
  dureeAffichageMs: number | null;
  naturePlan: string | null;
  observeSansPlanMs?: number | null;
  attentes: { a: number; texte: string }[];
  motif: string;
}

export interface VerdictPorte {
  ouverte: boolean;
  refermee: boolean;
  /** `null` tant que la porte ne s'est pas refermée sous nos yeux. */
  dureeDeVieMs: number | null;
  toujoursOuverteApresMs: number | null;
  observeeMs: number | null;
  /** Le bouton était-il dans le champ visible, sans défilement ? */
  atteignableSansDefilement: boolean;
  atteignableApresMs: number | null;
  motif: string;
}

export const SCRIPT_OBSERVATEUR: string;
export function jugerCalcul(brut: Partial<BrutSonde>): VerdictCalcul;
export function jugerPorte(brut: Partial<BrutSonde>): VerdictPorte;
export function comparerEmpreintes(
  servi: Map<string, string>, attendues: Map<string, string>,
): { divergences: string[]; inconnus: string[]; verifies: string[]; conforme: boolean };
export function exigerFichiersAttendus(
  cheminsVus: string[], motifs: string[],
): { ok: boolean; manquants: string[]; motif: string };
