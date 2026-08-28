// Itinéraires — API Géoplateforme (data.geopf.fr/navigation), moteur
// bdtopo-osrm, sans clé. Profils vérifiés par getcapabilities le 16/08 :
// `car` et `pedestrian` SEULEMENT — pas de vélo sur les moteurs publics IGN,
// l'écart est documenté dans la roadmap. Résilience : timeout 8 s, une
// reprise, erreurs en français (règles du projet).
import type { LineString } from 'geojson';
import type { PointGeo } from './coordonnees';

const SERVICE = 'https://data.geopf.fr/navigation/itineraire';
const DELAI_MS = 8000;

export type Profil = 'car' | 'pedestrian';
export const PROFILS: Record<Profil, string> = { car: 'Voiture', pedestrian: 'À pied' };

/* Ce que le service permet RÉELLEMENT d'éviter (getcapabilities du 21/08 :
   seule clé `waytype`, valeurs autoroute|tunnel|pont). Les PÉAGES n'existent
   sur aucun moteur public — écart documenté dans la roadmap, comme l'absence
   d'itinéraires alternatifs. */
export type Eviter = 'autoroute' | 'tunnel' | 'pont';
export const EVITEMENTS: Record<Eviter, string> = {
  autoroute: 'Autoroutes', tunnel: 'Tunnels', pont: 'Ponts',
};

/* LE CADRAGE DES « PROFILS DE TRAJET » du mandat du 28/08, tranché par la
   mesure (getcapabilities du 28/08) : le moteur ne connaît que DEUX
   optimisations — fastest et shortest. « Économe » n'a pas de modèle de
   consommation côté service, « Sans péage » pas de contrainte de péage :
   les exposer serait des étiquettes vides. On expose ce qui EST. */
export type Optimisation = 'fastest' | 'shortest';
export const OPTIMISATIONS: Record<Optimisation, string> = {
  fastest: 'Le plus rapide', shortest: 'Le plus court',
};

/* Au-delà, l'URL s'allonge et le trajet devient illisible : six étapes
   suffisent à une tournée. La borne vit ICI (le domaine) : l'interface ET le
   lien de partage la respectent — sinon un lien à dix étapes rejouerait en
   silence un trajet tronqué à six, différent de ce qu'il promet. */
export const MAX_ETAPES = 6;

export interface OptionsItineraire {
  /** Étapes intermédiaires, dans l'ordre du trajet. */
  etapes?: PointGeo[];
  eviter?: Eviter[];
  /** Absente : fastest — le comportement de toujours. */
  optimisation?: Optimisation;
}

/** L'URL du service — PURE, partagée avec la feuille de route, testée à sec.
    Contraintes multiples jointes par `|` (vérifié le 21/08 : le paramètre
    répété rend 500, le `;` rend 400 — seul le pipe passe). */
export function urlItineraire(
  depart: PointGeo, arrivee: PointGeo, profil: Profil,
  options: OptionsItineraire = {}, etapesDetaillees = false,
): string {
  let url = `${SERVICE}?resource=bdtopo-osrm&profile=${profil}`
    + `&optimization=${options.optimisation ?? 'fastest'}`
    + `&start=${depart.lon},${depart.lat}&end=${arrivee.lon},${arrivee.lat}`
    + '&geometryFormat=geojson&distanceUnit=meter&timeUnit=second';
  if (options.etapes?.length) {
    url += `&intermediates=${options.etapes.map((p) => `${p.lon},${p.lat}`).join('|')}`;
  }
  if (options.eviter?.length) {
    url += `&constraints=${encodeURIComponent(options.eviter
      .map((v) => JSON.stringify({ constraintType: 'banned', key: 'waytype', operator: '=', value: v }))
      .join('|'))}`;
  }
  if (etapesDetaillees) url += '&getSteps=true&waysAttributes=name';
  return url;
}

export interface Itineraire {
  /** LineString GeoJSON en WGS 84. */
  geometrie: LineString;
  /** Distance en mètres. */
  distance: number;
  /** Durée en secondes. */
  duree: number;
}

export class ErreurItineraire extends Error {}

interface ReponseService {
  geometry?: LineString;
  distance?: number;
  duration?: number;
}

/** Transformation pure de la réponse du service — testée à sec. */
export function versItineraire(brut: unknown): Itineraire {
  const r = brut as ReponseService;
  const g = r?.geometry;
  if (!g || g.type !== 'LineString' || !Array.isArray(g.coordinates) || g.coordinates.length < 2) {
    throw new ErreurItineraire('Le service n’a pas rendu de tracé exploitable.');
  }
  const distance = Number(r.distance);
  const duree = Number(r.duration);
  if (!Number.isFinite(distance) || !Number.isFinite(duree)) {
    throw new ErreurItineraire('Le service n’a pas rendu de distance ou de durée.');
  }
  return { geometrie: g, distance, duree };
}

export async function calculerItineraire(
  depart: PointGeo, arrivee: PointGeo, profil: Profil, options: OptionsItineraire = {},
): Promise<Itineraire> {
  const url = urlItineraire(depart, arrivee, profil, options);
  let derniere: unknown;
  for (let essai = 0; essai < 2; essai += 1) {
    try {
      const r = await fetch(url, {
        signal: AbortSignal.timeout(DELAI_MS),
        headers: { Accept: 'application/json' },
      });
      if (r.status === 404) {
        // Le service répond 404 quand aucun graphe ne relie les deux points
        // (île, point en mer) : c'est une réponse, pas une panne — pas de
        // seconde tentative.
        throw new ErreurItineraire('Aucun itinéraire trouvé entre ces deux points.');
      }
      if (!r.ok) throw new Error(`service ${r.status}`);
      return versItineraire(await r.json());
    } catch (e) {
      if (e instanceof ErreurItineraire) throw e;
      derniere = e;
      if (essai === 0) await new Promise((s) => setTimeout(s, 500));
    }
  }
  throw new ErreurItineraire(
    'Le calcul d’itinéraire est momentanément indisponible. Réessayez dans un instant.',
    { cause: derniere },
  );
}

/* ---- formats d'affichage, décidés une fois ---- */

export function formaterDistance(metres: number): string {
  if (metres < 1000) return `${Math.round(metres)} m`;
  const km = metres / 1000;
  return km < 10
    ? `${km.toFixed(1).replace('.', ',')} km`
    : `${Math.round(km)} km`;
}

export function formaterDuree(secondes: number): string {
  // Le seuil se juge en SECONDES : 30 s arrondi donnerait « 1 min », ce qui
  // promet plus de précision qu'on n'en a.
  if (secondes < 60) return 'moins d’une minute';
  const minutes = Math.round(secondes / 60);
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
}
