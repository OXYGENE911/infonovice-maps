// Le bilan d'un trajet — PUR, donc mesurable à sec (STATS-1, 01/09).
//
// LE TERRAIN. Armelin : « une fenêtre de statistiques à l'arrivée : vitesse
// max, vitesse moyenne, temps total, temps de charge, nombre d'arrêts ».
//
// CE QU'ON MESURE, ON LE DIT ; CE QU'ON NE MESURE PAS, ON SE TAIT. Toutes
// les valeurs ci-dessous sortent des fixes que le suivi reçoit déjà — aucune
// requête de plus, aucune donnée qui sorte du navigateur. Le temps de charge,
// lui, n'est PAS mesuré : il vient du plan de recharge quand il existe, et
// reste absent sinon. Inventer une durée de charge à partir d'un arrêt serait
// prendre une pause déjeuner pour une borne.

/** L'accumulateur, entre deux fixes. Sérialisable : c'est aussi l'historique. */
export interface EtatBilan {
  /** Instant du premier fixe (ms epoch), `null` tant qu'il n'y en a pas. */
  debut: number | null;
  /** Instant du dernier fixe retenu. */
  fin: number | null;
  /** La plus grande vitesse vue, en m/s. */
  vitesseMaxMs: number;
  /** De quoi faire une moyenne PONDÉRÉE PAR LE TEMPS — voir `ajouterFixe`. */
  sommePonderee: number;
  dureeMesureeMs: number;
  /** Combien de fois on s'est arrêté DURABLEMENT. */
  arrets: number;
  /** Temps total passé à l'arrêt (ms). */
  arretMs: number;
  /** Interne : depuis quand la vitesse est sous le seuil, `null` si on roule. */
  immobileDepuis: number | null;
  /** Interne : l'arrêt courant a-t-il déjà été compté ? */
  arretCompte: boolean;
}

/* CE QUI COMPTE COMME UN ARRÊT. Un feu rouge n'est pas une pause : sous
   soixante secondes, on ne compte rien. Le seuil de vitesse (0,5 m/s, soit
   1,8 km/h) est celui du bruit d'un récepteur à l'arrêt — un GPS immobile ne
   rend jamais exactement zéro. */
export const SEUIL_IMMOBILE_MS = 0.5;
export const DUREE_ARRET_MS = 60_000;

/* UN FIXE ÉGARÉ NE FAIT PAS UNE MOYENNE. Au-delà de deux minutes entre deux
   fixes — tunnel, veille de l'écran, perte du signal — on ne PONDÈRE PAS
   l'intervalle : compter dix minutes de tunnel à la dernière vitesse connue
   gonflerait la moyenne d'un trajet qu'on n'a pas mesuré. Le temps total, lui,
   reste vrai : il se lit aux horloges de départ et d'arrivée. */
export const TROU_MAX_MS = 120_000;

export function nouveauBilan(): EtatBilan {
  return {
    debut: null, fin: null, vitesseMaxMs: 0,
    sommePonderee: 0, dureeMesureeMs: 0,
    arrets: 0, arretMs: 0, immobileDepuis: null, arretCompte: false,
  };
}

/**
 * Range un fixe dans le bilan — PURE : rend un ÉTAT NEUF.
 *
 * `vitesse` en m/s telle que le récepteur la donne (`null` s'il se tait).
 * Les fixes hors d'ordre ou identiques sont ignorés : un accumulateur qui
 * recule inventerait des durées négatives.
 */
export function ajouterFixe(
  etat: EtatBilan, fixe: { instant: number; vitesse: number | null },
): EtatBilan {
  const { instant } = fixe;
  if (!Number.isFinite(instant)) return etat;
  if (etat.debut === null) {
    return { ...etat, debut: instant, fin: instant,
      vitesseMaxMs: Math.max(0, fixe.vitesse ?? 0) };
  }
  if (etat.fin === null || instant <= etat.fin) return etat;

  const delta = instant - etat.fin;
  const v = typeof fixe.vitesse === 'number' && Number.isFinite(fixe.vitesse)
    && fixe.vitesse >= 0 ? fixe.vitesse : null;
  const suite: EtatBilan = { ...etat, fin: instant };

  if (v !== null) {
    suite.vitesseMaxMs = Math.max(etat.vitesseMaxMs, v);
    if (delta <= TROU_MAX_MS) {
      suite.sommePonderee = etat.sommePonderee + v * delta;
      suite.dureeMesureeMs = etat.dureeMesureeMs + delta;
    }
  }

  /* L'ARRÊT SE COMPTE UNE FOIS, ET SEULEMENT QUAND IL DURE. Le compteur monte
     au moment où la minute est franchie, pas à l'immobilisation : sinon
     chaque feu rouge deviendrait une pause dans le bilan. */
  const immobile = v !== null && v < SEUIL_IMMOBILE_MS;
  if (!immobile) {
    suite.immobileDepuis = null;
    suite.arretCompte = false;
  } else {
    const depuis = etat.immobileDepuis ?? etat.fin;
    suite.immobileDepuis = depuis;
    if (delta <= TROU_MAX_MS) suite.arretMs = etat.arretMs + delta;
    if (!etat.arretCompte && instant - depuis >= DUREE_ARRET_MS) {
      suite.arrets = etat.arrets + 1;
      suite.arretCompte = true;
    }
  }
  return suite;
}

export interface ResumeBilan {
  /** Du premier au dernier fixe — l'horloge, pas la somme des intervalles. */
  dureeMs: number;
  vitesseMaxKmh: number;
  /** Moyenne PONDÉRÉE PAR LE TEMPS, `null` si rien n'a été mesuré. */
  vitesseMoyenneKmh: number | null;
  arrets: number;
  arretMs: number;
}

/** Le bilan lisible — PURE. `null` si aucun fixe n'a été reçu. */
export function resumerBilan(etat: EtatBilan): ResumeBilan | null {
  if (etat.debut === null || etat.fin === null) return null;
  const kmh = (ms: number): number => Math.round(ms * 3.6);
  return {
    dureeMs: Math.max(0, etat.fin - etat.debut),
    vitesseMaxKmh: kmh(etat.vitesseMaxMs),
    vitesseMoyenneKmh: etat.dureeMesureeMs > 0
      ? kmh(etat.sommePonderee / etat.dureeMesureeMs) : null,
    arrets: etat.arrets,
    arretMs: etat.arretMs,
  };
}

/** Une durée en français court : « 1 h 24 », « 12 min », « moins d’une minute ». */
export function dureeEnMots(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return 'moins d’une minute';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`;
}
