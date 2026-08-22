// Transports en commun, en temps réel — la position des véhicules publiée
// par les réseaux français, en GTFS-RT.
//
// CE QUI EST FAIT ET CE QUI NE L'EST PAS. Cette couche montre où sont les
// bus, cars et trams À CET INSTANT. Elle ne montre PAS les horaires, les
// arrêts ni les itinéraires : ces données-là vivent dans les GTFS statiques,
// des archives de plusieurs dizaines de mégaoctets par réseau (le fichier
// national consolidé pèse 300 Mo compressés, relevé le 22/08/2026). Les
// digérer demanderait un serveur ; ce projet n'en a pas, et n'en veut pas.
// La feuille de route le dit sans détour plutôt que de promettre un
// « transports en commun » qui n'en serait pas un.
//
// LES QUOTAS SONT UN BIEN COMMUN. Trois garde-fous : rien n'est demandé tant
// que la couche n'est pas cochée ; seuls les réseaux dont l'emprise touche la
// vue sont sollicités, trois au plus ; et le rafraîchissement s'arrête dès
// que l'onglet passe en arrière-plan.
//
// Vérifié par appels réels le 22/08/2026 (docs/apis.md) : 44 réseaux
// proxifiés par transport.data.gouv.fr, `access-control-allow-origin: *`,
// aucune clé, réponses en dizaines de kilo-octets, horodates à la seconde.
import { decoderFlux, ErreurTransports, type FluxVehicules, type Vehicule } from './gtfs-rt';
import { RESEAUX_TEMPS_REEL } from '../donnees/reseaux-temps-reel';
import type { Bbox } from './poi';

export { ErreurTransports } from './gtfs-rt';
export type { Vehicule } from './gtfs-rt';

export type Reseau = (typeof RESEAUX_TEMPS_REEL)[number];

const PROXY = 'https://proxy.transport.data.gouv.fr/resource/';
const DELAI_MS = 8000;

/** Au plus trois réseaux par vue : au-delà, on solliciterait des services
    publics pour des véhicules que l'usager ne regarde pas. */
export const PLAFOND_RESEAUX = 3;

/** Une position plus vieille que ça n'est plus une position « en direct ».
    Dix minutes : assez pour un car à l'arrêt entre deux relevés, trop peu
    pour laisser croire qu'un véhicule circule alors qu'il est rentré. */
export const FRAICHEUR_MAX_S = 600;

/** Cadence de rafraîchissement. Les flux relevés se renouvellent toutes les
    20 à 30 secondes : demander plus souvent ne rapporterait rien. */
export const INTERVALLE_MS = 30_000;

/* ---- Choix des réseaux — pur, testé à sec ---- */

function chevauchement(a: Bbox, r: Reseau): number {
  const [ouest, sud, est, nord] = r.bbox;
  const large = Math.min(a.est, est) - Math.max(a.ouest, ouest);
  const haut = Math.min(a.nord, nord) - Math.max(a.sud, sud);
  if (large <= 0 || haut <= 0) return 0;
  return large * haut;
}

/** Les réseaux dont l'emprise touche la vue, du plus concerné au moins.
    Le tri par surface commune met l'agglomération devant la région qui la
    contient : à Dijon, on veut Divia avant un agrégat régional. */
export function reseauxDansVue(vue: Bbox, plafond = PLAFOND_RESEAUX): Reseau[] {
  return RESEAUX_TEMPS_REEL
    .map((r) => ({ r, part: chevauchement(vue, r) }))
    .filter((x) => x.part > 0)
    .sort((a, b) => {
      if (b.part !== a.part) return b.part - a.part;
      // À surface égale, le réseau le plus RESSERRÉ d'abord : c'est le local.
      const aire = (x: Reseau) => (x.bbox[2] - x.bbox[0]) * (x.bbox[3] - x.bbox[1]);
      return aire(a.r) - aire(b.r);
    })
    .slice(0, plafond)
    .map((x) => x.r);
}

/** Combien de réseaux couvrent la vue, plafond compris ou non — pour dire
    honnêtement « 3 réseaux sur 5 » plutôt que de taire les autres. */
export function nombreDeReseaux(vue: Bbox): number {
  return RESEAUX_TEMPS_REEL.filter((r) => chevauchement(vue, r) > 0).length;
}

export function urlFlux(reseau: Reseau): string {
  return `${PROXY}${reseau.id}`;
}

/* ---- Fraîcheur — pur, testé à sec ---- */

/** Ne garde que les véhicules vus il y a moins de dix minutes.
    Une entité sans horodate propre hérite de celle de l'en-tête : c'est le
    seul repère que son producteur donne. Sans repère du tout, on la garde —
    la carte dira alors que la fraîcheur est inconnue, plutôt que de jeter. */
export function vehiculesFrais(flux: FluxVehicules, maintenantS: number): Vehicule[] {
  return flux.vehicules.filter((v) => {
    const vu = v.horodate ?? flux.horodate;
    if (vu === null) return true;
    const age = maintenantS - vu;
    // Une horodate DANS LE FUTUR trahit une horloge déréglée chez le
    // producteur : on tolère une minute d'avance, pas davantage.
    return age >= -60 && age <= FRAICHEUR_MAX_S;
  });
}

/** L'âge du flux en secondes, ou null s'il ne s'horodate pas. */
export function ageDuFlux(flux: FluxVehicules, maintenantS: number): number | null {
  if (flux.horodate === null) return null;
  return Math.max(0, maintenantS - flux.horodate);
}

/* ---- Appel réseau ---- */

/** Le flux d'un réseau. Une seule requête, une seule reprise, et SEULS les
    5xx se rejouent : un 404 signifie que la ressource a changé de nom, la
    rejouer ne ferait qu'insister pour rien. */
export async function chargerFlux(
  reseau: Reseau,
  signal?: AbortSignal,
): Promise<FluxVehicules> {
  let derniere: unknown;
  for (let essai = 0; essai < 2; essai += 1) {
    try {
      const r = await fetch(urlFlux(reseau), {
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(DELAI_MS)])
          : AbortSignal.timeout(DELAI_MS),
      });
      if (r.ok) return decoderFlux(new Uint8Array(await r.arrayBuffer()));
      if (r.status >= 500) throw new Error(`service ${r.status}`);
      throw new ErreurTransports(
        `Le temps réel de ${reseau.nom} est indisponible (réponse ${r.status}).`,
      );
    } catch (e) {
      if (signal?.aborted) throw e;
      if (e instanceof ErreurTransports) throw e;
      derniere = e;
      if (essai === 0) await new Promise((s) => { setTimeout(s, 500); });
    }
  }
  throw new ErreurTransports(
    `Le temps réel de ${reseau.nom} est momentanément indisponible.`,
    { cause: derniere },
  );
}
