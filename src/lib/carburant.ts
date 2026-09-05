/* LE CARBURANT (THERMIQUE-2, 06/09/2026) — le calcul PUR.
 *
 * Des amis d'Armelin : « pour un thermique, des arrêts stations-service
 * seulement, toutes les deux heures, avec le prix à la pompe avant la
 * station ». Le plan repose sur ce que l'usager sait de sa voiture — le
 * réservoir, la consommation, la jauge — et sur les prix RÉELS du jour
 * (open data prix-carburants, déjà relevés le long du trajet par
 * lib/le-long-du-trajet). Deux règles font un arrêt : la réserve qu'on ne
 * veut pas entamer, et la pause qu'on se doit toutes les deux heures — la
 * seconde ne s'impose que s'il y a une station où la faire.
 *
 * CE QUI MANQUE, DIT : l'open data des prix ne porte pas l'enseigne (Total,
 * Shell…) — le filtre par enseigne attendra qu'on apparie ces stations aux
 * objets OSM qui la portent. */

export type Carburant = 'gazole' | 'sp95' | 'sp98' | 'e10' | 'e85' | 'gplc';
export const CARBURANTS: readonly Carburant[] = ['gazole', 'sp95', 'sp98', 'e10', 'e85', 'gplc'];

export const LIBELLES_CARBURANT: Record<Carburant, string> = {
  gazole: 'Gazole', sp95: 'SP95', sp98: 'SP98', e10: 'E10 (SP95-E10)', e85: 'E85', gplc: 'GPLc',
};

/** Le libellé sous lequel lib/poi range chaque prix (`PoiCarburant.prix`). */
export const LIBELLE_PRIX: Record<Carburant, string> = {
  gazole: 'Gazole', sp95: 'SP95', sp98: 'SP98', e10: 'E10', e85: 'E85', gplc: 'GPLc',
};

export function carburantValide(v: unknown): v is Carburant {
  return typeof v === 'string' && (CARBURANTS as readonly string[]).includes(v);
}

export interface ProfilCarburant {
  motorisation: 'thermique' | 'hybride-rechargeable';
  carburant: Carburant;
  reservoirL: number;
  consommationL100: number;
  /** Niveau de la jauge au départ, en % (100 = plein). */
  jaugePourcent: number;
}

/** Ce qu'IndexedDB sait du carburant — `null` tant que l'essentiel manque. */
export function profilCarburant(memoire: unknown): ProfilCarburant | null {
  const m = (memoire ?? {}) as Record<string, unknown>;
  const v = (m['vehicule'] ?? {}) as Record<string, unknown>;
  const moteur = v['motorisation'];
  if (moteur !== 'thermique' && moteur !== 'hybride-rechargeable') return null;
  const carburant = v['carburant'];
  const nombre = (x: unknown): number =>
    (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? x : 0);
  const reservoirL = nombre(v['reservoirL']);
  const consommationL100 = nombre(v['consommationL100']);
  if (!carburantValide(carburant) || reservoirL <= 0 || consommationL100 <= 0) return null;
  const jauge = nombre(v['jaugePourcent']);
  return {
    motorisation: moteur, carburant, reservoirL, consommationL100,
    jaugePourcent: jauge > 0 ? Math.min(100, jauge) : 100,
  };
}

/** Kilomètres avec ce qu'il y a dans le réservoir — sans réserve retirée. */
export function autonomieCarburantKm(reservoirL: number, consommationL100: number, jaugePourcent = 100): number {
  if (!(reservoirL > 0) || !(consommationL100 > 0)) return 0;
  return (reservoirL * Math.min(100, Math.max(0, jaugePourcent)) / 100) / consommationL100 * 100;
}

export interface StationCarburant {
  lon: number; lat: number;
  adresse: string; ville: string;
  /** Prix du carburant du véhicule, €/L. */
  prixL: number;
  avancementM: number;
  ecartM: number;
}

export interface OptionsPlanCarburant {
  distanceM: number;
  dureeS: number;
  profil: ProfilCarburant;
  stations: StationCarburant[];
  /** Pause imposée toutes les N secondes (0 = jamais). Défaut : deux heures. */
  pauseS?: number;
  /** Réserve qu'on ne veut pas entamer, en km. Défaut : 40. */
  reserveKm?: number;
  /** Fenêtre avant la limite où l'on cherche la station la moins chère, en km. Défaut : 80. */
  fenetreKm?: number;
}

export interface ArretCarburant {
  station: StationCarburant;
  avancementM: number;
  /** Ce qui impose l'arrêt : le réservoir, ou la pause des deux heures. */
  motif: 'carburant' | 'pause';
  litres: number;
  coutEur: number;
  /** Autonomie restante en arrivant à la station, en km. */
  autonomieArriveeKm: number;
}

export interface PlanCarburant {
  faisable: boolean;
  motif?: string;
  arrets: ArretCarburant[];
  coutTotalEur: number;
  autonomieDepartKm: number;
  /** Autonomie restante à destination, en km (après les pleins). */
  autonomieArriveeKm: number;
  moinsChere: StationCarburant | null;
}

export function planifierCarburant(o: OptionsPlanCarburant): PlanCarburant {
  const pauseS = o.pauseS ?? 7200;
  const reserveKm = o.reserveKm ?? 40;
  const fenetreKm = o.fenetreKm ?? 80;
  const { reservoirL, consommationL100, jaugePourcent } = o.profil;
  const pleinKm = autonomieCarburantKm(reservoirL, consommationL100, 100);
  const autonomieDepartKm = autonomieCarburantKm(reservoirL, consommationL100, jaugePourcent);
  const stations = [...o.stations].sort((a, b) => a.avancementM - b.avancementM);
  const moinsChere = stations.reduce<StationCarburant | null>(
    (m, s) => (m === null || s.prixL < m.prixL ? s : m), null,
  );
  const vitesseMs = o.dureeS > 0 ? o.distanceM / o.dureeS : 25;

  const arrets: ArretCarburant[] = [];
  let posM = 0;
  let autonomieKm = autonomieDepartKm;
  let depuisPauseS = 0;
  for (let garde = 0; garde < 30; garde += 1) {
    const limiteCarburantM = posM + Math.max(0, autonomieKm - reserveKm) * 1000;
    const limitePauseM = pauseS > 0 ? posM + Math.max(0, pauseS - depuisPauseS) * vitesseMs : Infinity;
    const cibleM = Math.min(limiteCarburantM, limitePauseM);
    if (cibleM >= o.distanceM) break;
    const motif: ArretCarburant['motif'] = limiteCarburantM <= limitePauseM ? 'carburant' : 'pause';
    const candidates = stations.filter((s) =>
      s.avancementM > posM + 1000 && s.avancementM <= cibleM
      && s.avancementM >= cibleM - fenetreKm * 1000);
    if (candidates.length === 0) {
      if (motif === 'pause') {
        /* Pas de station pour la pause : on roule, la prochaine fenêtre la
           proposera — la pause n'est pas un carburant. */
        depuisPauseS = 0;
        const rouleM = cibleM - posM;
        autonomieKm -= rouleM / 1000;
        posM = cibleM;
        continue;
      }
      return {
        faisable: false,
        motif: `Aucune station relevée entre ${Math.round(Math.max(0, cibleM - fenetreKm * 1000) / 1000)}`
          + ` et ${Math.round(cibleM / 1000)} km : le réservoir n’y suffit pas avec ${reserveKm} km de réserve.`,
        arrets, coutTotalEur: arrets.reduce((t, a) => t + a.coutEur, 0),
        autonomieDepartKm, autonomieArriveeKm: 0, moinsChere,
      };
    }
    /* LA MOINS CHÈRE DE LA FENÊTRE, et à égalité la plus loin : un centime
       par litre sur un plein, c'est le prix de la fenêtre. */
    candidates.sort((a, b) => a.prixL - b.prixL || b.avancementM - a.avancementM);
    const station = candidates[0]!;
    const rouleKm = (station.avancementM - posM) / 1000;
    const autonomieArriveeKm = autonomieKm - rouleKm;
    const litres = Math.max(0, (pleinKm - autonomieArriveeKm) * consommationL100 / 100);
    arrets.push({
      station, avancementM: station.avancementM, motif, litres,
      coutEur: litres * station.prixL, autonomieArriveeKm,
    });
    posM = station.avancementM;
    autonomieKm = pleinKm;
    depuisPauseS = 0;
  }
  const autonomieArriveeKm = autonomieKm - (o.distanceM - posM) / 1000;
  return {
    faisable: true, arrets,
    coutTotalEur: arrets.reduce((t, a) => t + a.coutEur, 0),
    autonomieDepartKm, autonomieArriveeKm, moinsChere,
  };
}

export const euros = (v: number): string => `${v.toFixed(v >= 100 ? 0 : 2).replace('.', ',')} €`;
export const prixLitre = (v: number): string => `${v.toFixed(3).replace('.', ',')} €/L`;
