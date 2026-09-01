// L'historique des trajets — ENREGISTRÉ À LA DEMANDE (STATS-2, 01/09).
//
// LA CONCEPTION EST CELLE D'ARMELIN, ET ELLE EST MEILLEURE QUE LA MIENNE.
// J'aurais gardé les trajets tout seul ; il a écrit : « pour l'historique des
// trajets, cela ne doit pas être fait automatiquement, mais proposé à
// l'enregistrement à la fin du parcours au moment du récapitulatif ». Un GPS
// qui archive de lui-même devient un carnet de déplacements — exactement ce
// que le contrat du projet refuse. Un bouton qu'on presse, c'est un
// consentement ; et l'on peut comparer ce qu'on a choisi de garder.
//
// TOUT RESTE DANS LE NAVIGATEUR : IndexedDB, comme les favoris, exportable en
// JSON d'un bloc. Rien ne part sur un serveur — il n'y en a pas.
//
// CE QUE PÈSE UN TRAJET, MESURÉ : un relevé toutes les trente secondes fait
// 360 points pour trois heures de route, soit ~32 Ko en JSON. Deux trajets par
// semaine pendant un an tiennent dans 3 Mo. Cinq secondes n'apprendraient rien
// de plus sur une comparaison et pèseraient six fois plus.

import { lirePreference, ecrirePreference } from './stockage';
import type { ResumeBilan } from './bilan-trajet';

/** La clé du magasin — une seule liste, bornée. */
export const PREF_HISTORIQUE = 'historique-trajets';

/* CINQUANTE TRAJETS GARDÉS. Au-delà, le plus ancien s'efface : une liste sans
   fin finirait par peser sur le navigateur de quelqu'un qui ne l'a jamais
   demandé, et cinquante couvre largement la comparaison « d'une semaine à
   l'autre » qu'Armelin décrit. */
export const TRAJETS_GARDES = 50;

/** Un relevé pris en route — ce qu'on saura comparer plus tard. */
export interface ReleveTrajet {
  /** Millisecondes depuis le départ — pas une heure absolue. */
  tMs: number;
  /** Vitesse instantanée, en m/s. `null` quand le récepteur se tait. */
  vitesseMs: number | null;
  /** Altitude en mètres, quand elle est connue. */
  altitudeM: number | null;
}

/** Un trajet enregistré, tel qu'il vit dans le navigateur. */
export interface TrajetEnregistre {
  /** Identifiant local, stable — sert aux cases à cocher de la comparaison. */
  id: string;
  /** L'instant du départ (ms epoch) : c'est lui qui date le trajet. */
  departMs: number;
  /** Ce que l'usager en dira : « Domicile → Travail ». */
  titre: string;
  /** Le bilan tel que la fenêtre d'arrivée l'a montré. */
  resume: ResumeBilan;
  /** Les relevés réguliers, s'il y en a. */
  releves: ReleveTrajet[];
}

/* UN RELEVÉ TOUTES LES TRENTE SECONDES. Armelin demandait « à intervalle
   régulier (vitesse, météo, trafic, dénivelé) pour avoir un maximum de données
   à comparer ». On garde ici ce qui se MESURE en roulant sans un appel de
   plus : la vitesse et l'altitude viennent du récepteur. La météo et le trafic
   ne se relèvent pas sans réseau — les inscrire ici obligerait à interroger un
   service pendant qu'on conduit, ce que la frugalité du projet refuse ; ils
   restent lisibles dans le copilote, à la demande. */
export const PAS_RELEVE_MS = 30_000;

/** Faut-il prendre un relevé maintenant ? — PURE. */
export function estLHeureDunReleve(dernierMs: number | null, tMs: number): boolean {
  if (dernierMs === null) return true;
  return tMs - dernierMs >= PAS_RELEVE_MS;
}

/** Un titre par défaut, lisible — l'usager le remplacera s'il veut. */
export function titreParDefaut(depart: string, arrivee: string): string {
  const court = (s: string): string => {
    const nu = s.split(',')[0]?.trim() ?? '';
    return nu.length > 28 ? `${nu.slice(0, 27)}…` : nu;
  };
  const d = court(depart); const a = court(arrivee);
  if (d === '' && a === '') return 'Trajet sans nom';
  if (d === '') return `→ ${a}`;
  if (a === '') return `${d} →`;
  return `${d} → ${a}`;
}

/** Valide ce qui revient du navigateur — frontière système — PURE. */
export function versTrajets(brut: unknown): TrajetEnregistre[] {
  if (!Array.isArray(brut)) return [];
  const sortie: TrajetEnregistre[] = [];
  for (const t of brut) {
    const o = t as Record<string, unknown>;
    const r = o['resume'] as Record<string, unknown> | undefined;
    if (typeof o['id'] !== 'string' || typeof o['departMs'] !== 'number'
      || !r || typeof r['dureeMs'] !== 'number') continue;
    sortie.push({
      id: o['id'],
      departMs: o['departMs'],
      titre: typeof o['titre'] === 'string' ? o['titre'] : 'Trajet sans nom',
      resume: {
        dureeMs: r['dureeMs'],
        vitesseMaxKmh: typeof r['vitesseMaxKmh'] === 'number' ? r['vitesseMaxKmh'] : 0,
        vitesseMoyenneKmh: typeof r['vitesseMoyenneKmh'] === 'number'
          ? r['vitesseMoyenneKmh'] : null,
        arrets: typeof r['arrets'] === 'number' ? r['arrets'] : 0,
        arretMs: typeof r['arretMs'] === 'number' ? r['arretMs'] : 0,
      },
      releves: Array.isArray(o['releves'])
        ? (o['releves'] as unknown[]).filter(
          (x): x is ReleveTrajet => typeof (x as ReleveTrajet)?.tMs === 'number',
        ) : [],
    });
  }
  return sortie;
}

/**
 * Ajoute un trajet en tête, et borne la liste — PURE.
 *
 * LE PLUS RÉCENT D'ABORD : c'est celui qu'on vient de faire, et celui qu'on
 * veut comparer à la semaine dernière.
 */
export function ajouterTrajet(
  liste: readonly TrajetEnregistre[], trajet: TrajetEnregistre,
): TrajetEnregistre[] {
  return [trajet, ...liste.filter((t) => t.id !== trajet.id)].slice(0, TRAJETS_GARDES);
}

/** Lit l'historique — jamais une exception, la liste vide au pire. */
export async function lireHistorique(): Promise<TrajetEnregistre[]> {
  return versTrajets(await lirePreference<unknown>(PREF_HISTORIQUE));
}

/** Écrit l'historique. */
export async function ecrireHistorique(liste: readonly TrajetEnregistre[]): Promise<void> {
  await ecrirePreference(PREF_HISTORIQUE, liste);
}

/* ==========================================================================
   LA COMPARAISON — ce qu'Armelin veut vraiment en garder.

   « Cela permet par exemple de regarder si on a fait mieux d'une semaine à
   l'autre ou observer la différence quand on voyage seul ou en famille sur un
   même trajet. » Ce ne sont donc pas des chiffres qu'il faut aligner, mais des
   ÉCARTS qu'il faut nommer.
   ========================================================================== */

export interface LigneComparaison {
  libelle: string;
  /** Les valeurs déjà mises en forme, dans l'ordre des trajets comparés. */
  valeurs: string[];
  /** L'indice du meilleur, quand « meilleur » veut dire quelque chose. */
  meilleur: number | null;
}

const duree = (ms: number): string => {
  const min = Math.round(ms / 60_000);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`;
};

/**
 * Compare deux trajets ou plus — PURE.
 *
 * « MEILLEUR » NE VEUT PAS DIRE « PLUS RAPIDE » PARTOUT : c'est vrai pour la
 * durée et le temps d'arrêt, cela n'a aucun sens pour la vitesse maximale —
 * rouler plus vite n'est pas mieux, et le dire serait encourager à le faire.
 * La colonne existe, elle n'est pas couronnée.
 */
export function comparerTrajets(trajets: readonly TrajetEnregistre[]): LigneComparaison[] {
  if (trajets.length === 0) return [];
  const plusPetit = (v: (number | null)[]): number | null => {
    const connus = v.map((x, i) => [x, i] as const).filter((p): p is readonly [number, number] => p[0] !== null);
    if (connus.length < 2) return null;
    return connus.reduce((a, b) => (b[0] < a[0] ? b : a))[1];
  };
  const durees = trajets.map((t) => t.resume.dureeMs);
  const arrets = trajets.map((t) => t.resume.arretMs);
  return [
    {
      libelle: 'Durée du trajet',
      valeurs: durees.map(duree),
      meilleur: plusPetit(durees),
    },
    {
      libelle: 'Vitesse moyenne',
      valeurs: trajets.map((t) => (t.resume.vitesseMoyenneKmh === null
        ? 'non mesurée' : `${t.resume.vitesseMoyenneKmh} km/h`)),
      /* PAS DE COURONNE : sur un même trajet, une moyenne plus haute suit la
         durée — la couronner deux fois dirait deux fois la même chose. */
      meilleur: null,
    },
    {
      libelle: 'Vitesse maximale',
      valeurs: trajets.map((t) => `${t.resume.vitesseMaxKmh} km/h`),
      meilleur: null,
    },
    {
      libelle: 'Arrêts',
      valeurs: trajets.map((t) => (t.resume.arrets === 0
        ? 'aucun' : `${t.resume.arrets} · ${duree(t.resume.arretMs)}`)),
      meilleur: plusPetit(arrets),
    },
  ];
}
