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
// LES QUOTAS SONT UN BIEN COMMUN. Rien n'est demandé tant que la couche n'est
// pas cochée ; seuls les réseaux qui desservent VRAIMENT la vue sont
// sollicités, trois au plus ; et le rafraîchissement s'arrête dès que
// l'onglet passe en arrière-plan.
//
// Vérifié par appels réels le 22/08/2026 (docs/apis.md) : 44 réseaux
// proxifiés par transport.data.gouv.fr, `access-control-allow-origin: *`,
// aucune clé, réponses de 13 o à 18 Ko, horodates à la seconde.
import { decoderFlux, ErreurTransports, type FluxVehicules, type Vehicule } from './gtfs-rt';
import { RESEAUX_TEMPS_REEL } from '../donnees/reseaux-temps-reel';
import type { Bbox } from './poi';

export { ErreurTransports } from './gtfs-rt';
export type { Vehicule } from './gtfs-rt';

export type Reseau = (typeof RESEAUX_TEMPS_REEL)[number];

const PROXY = 'https://proxy.transport.data.gouv.fr/resource/';
const DELAI_MS = 8000;

/** Le pas de la grille de couverture, en degrés — celui qu'emploie
    scripts/reseaux-temps-reel.mjs pour engendrer la table. Un test unitaire
    vérifie que les deux ne divergent pas. */
export const PAS_GRILLE = 0.2;

/** Au plus trois réseaux par vue : au-delà, on solliciterait des services
    publics pour des véhicules que l'usager ne regarde pas. */
export const PLAFOND_RESEAUX = 3;

/** Une position plus vieille que ça n'est plus une position « en direct ».
    Dix minutes : assez pour un car à l'arrêt entre deux relevés, trop peu
    pour laisser croire qu'un véhicule circule alors qu'il est rentré. */
export const FRAICHEUR_MAX_S = 600;

/** Tolérance d'AVANCE. Les horloges des producteurs dérivent : relevé le
    22/08, l'en-tête d'Atoumod avançait de 63 s et celui du SETRAM de 85 s.
    Sans marge, une horloge en avance efface tout le réseau — et le volet
    annonçait « aucun véhicule » alors qu'ils roulaient. */
export const AVANCE_MAX_S = 180;

/** Cadence de rafraîchissement. Les flux relevés se renouvellent toutes les
    20 à 30 secondes : demander plus souvent ne rapporterait rien. */
export const INTERVALLE_MS = 30_000;

/* ---- Choix des réseaux — pur, testé à sec ---- */

const cellule = (v: number): number => Math.floor(v / PAS_GRILLE);

/** Le réseau dessert-il vraiment cette vue ?
    LA DÉCISION NE REGARDE QUE LA COUVERTURE, jamais le rectangle. Celui des
    Pays de la Loire couvre Rennes, à 97 km du car Aléop le plus proche : il
    ne peut donc pas trancher. Et le garder comme pré-filtre rapide serait un
    piège — arrondi au centième de degré, il peut tomber un cheveu EN DEÇÀ
    d'une cellule de couverture et rejeter une vue que la couverture accepte
    (attrapé par un test sur le Haut-Rhin). Quarante-quatre réseaux, cent
    vingt bandes en tout : le balayage direct ne coûte rien.
    Le rectangle reste dans la table, pour l'œil qui la relit. */
export function dessert(reseau: Reseau, vue: Bbox): boolean {
  const yMin = cellule(vue.sud);
  const yMax = cellule(vue.nord);
  const xMin = cellule(vue.ouest);
  const xMax = cellule(vue.est);
  return reseau.couverture.some(
    (b) => b[0] >= yMin && b[0] <= yMax && b[2] >= xMin && b[1] <= xMax,
  );
}

/** L'étendue d'un réseau, en cellules — sa « taille ». */
function etendue(reseau: Reseau): number {
  return reseau.couverture.reduce((s, b) => s + (b[2] - b[1] + 1), 0);
}

/** Les réseaux qui desservent la vue, DU PLUS LOCAL AU PLUS VASTE.
    Le tri se fait sur l'étendue du réseau, pas sur sa surface commune avec la
    vue : celle-ci renversait l'ordre dès que la vue débordait d'un bord de
    l'agglomération — à Dieppe, l'agrégat régional passait devant le réseau de
    la ville. L'étendue, elle, ne dépend pas du cadrage. */
export function reseauxDansVue(vue: Bbox, plafond = PLAFOND_RESEAUX): Reseau[] {
  return RESEAUX_TEMPS_REEL
    .filter((r) => dessert(r, vue))
    .slice()
    .sort((a, b) => etendue(a) - etendue(b) || a.id.localeCompare(b.id, 'fr'))
    .slice(0, plafond);
}

/** Combien de réseaux desservent la vue, plafond compris ou non — pour dire
    honnêtement « 3 réseaux sur 5 » plutôt que de taire les autres. */
export function nombreDeReseaux(vue: Bbox): number {
  return RESEAUX_TEMPS_REEL.filter((r) => dessert(r, vue)).length;
}

export function urlFlux(reseau: Reseau): string {
  return `${PROXY}${reseau.id}`;
}

/* ---- Ce que les producteurs publient vraiment — pur, testé à sec ---- */

/** Le nom de ligne, tel qu'un usager peut le lire.
    Un quart des véhicules relevés le 22/08 (102 sur 416) portent un
    identifiant NeTEx complet — `ATOUMOD003:Line:6xC7:LOC` — là où seule
    « 6xC7 » a un sens pour qui attend le bus. */
export function nomDeLigne(brut: string | null): string | null {
  if (!brut) return null;
  const netex = /:Line:([^:]+)/.exec(brut);
  const nom = (netex?.[1] ?? brut).trim();
  // Un libellé à rallonge n'est pas un nom de ligne : mieux vaut ne rien dire
  // que de faire déborder la popup avec un identifiant technique.
  return nom && nom.length <= 24 ? nom : null;
}

/* LA VITESSE N'EST PAS AFFICHÉE EN CHIFFRES, ET C'EST DÉLIBÉRÉ.
   La spécification GTFS-RT la donne en mètres par seconde. Relevé le
   22/08/2026 sur les neuf réseaux qui la publient :
     Metz 13,0 · Rennes 12,8 · Alterneo 13,0 · Amiens 11,0 · Cannes 9,0
     · Aléop 19,6   → cohérents en m/s (47, 46, 47, 40, 32, 70 km/h)
     Dijon 69,0 · Le Mans 62,0 · Bourg-en-Bresse 37,0
                    → 248, 223 et 133 km/h en m/s. Absurde pour un tramway.
   Ces trois-là publient vraisemblablement des km/h — mais « 4 » se lit aussi
   bien 4 km/h que 14 km/h, et RIEN dans le flux ne dit lequel. Trois
   producteurs sur neuf sont donc indéchiffrables, et un chiffre faux d'un
   facteur 3,6 vaut moins que pas de chiffre du tout.
   Reste ce qui est vrai dans les deux unités : zéro, c'est l'arrêt. */

/** Le producteur renseigne-t-il vraiment la vitesse ? Un flux où tout vaut
    zéro ne dit pas que la flotte est à l'arrêt, il dit qu'il ne mesure rien —
    et l'annoncer serait inventer. */
export function vitesseRenseignee(vehicules: readonly Vehicule[]): boolean {
  return vehicules.some((v) => v.vitesse !== null && v.vitesse > 0);
}

/** « à l'arrêt », et seulement quand on peut l'affirmer. */
export function aLArret(v: Vehicule, renseignee: boolean): boolean {
  return renseignee && v.vitesse === 0;
}

/* ---- Fraîcheur — pur, testé à sec ---- */

export interface TriParFraicheur {
  /** Ce qui peut s'afficher comme « en direct ». */
  frais: Vehicule[];
  /** Écartés parce que trop vieux. */
  perimes: number;
  /** Écartés parce que datés du futur — horloge du producteur déréglée. */
  futurs: number;
  /** Gardés, mais dont personne ne dit l'âge. */
  sansHorodate: number;
}

/** L'horodate à retenir pour un véhicule : la sienne si elle est plausible,
    celle de l'en-tête sinon.
    ZÉRO N'EST PAS UNE DATE. Bibus (Brest) publie `timestamp: 0` pour ses
    27 véhicules : pris au pied de la lettre, cela les vieillit de 56 ans et
    les efface tous — mesuré le 22/08, le réseau entier disparaissait en
    silence. Zéro veut dire « je ne sais pas », pas « 1er janvier 1970 ». */
function horodateRetenue(v: Vehicule, flux: FluxVehicules): number | null {
  return v.horodate ?? flux.horodate;
}

export function trierParFraicheur(flux: FluxVehicules, maintenantS: number): TriParFraicheur {
  const tri: TriParFraicheur = { frais: [], perimes: 0, futurs: 0, sansHorodate: 0 };
  for (const v of flux.vehicules) {
    const vu = horodateRetenue(v, flux);
    if (vu === null) { tri.sansHorodate += 1; tri.frais.push(v); continue; }
    const age = maintenantS - vu;
    if (age < -AVANCE_MAX_S) { tri.futurs += 1; continue; }
    if (age > FRAICHEUR_MAX_S) { tri.perimes += 1; continue; }
    tri.frais.push(v);
  }
  return tri;
}

/** L'âge d'un véhicule en secondes, ou null si personne ne l'horodate.
    Négatif quand l'horloge du producteur avance. */
export function ageVehicule(
  v: Vehicule, flux: FluxVehicules, maintenantS: number,
): number | null {
  const vu = horodateRetenue(v, flux);
  return vu === null ? null : maintenantS - vu;
}

/** L'âge du flux en secondes — SIGNÉ. Une valeur négative dit que l'horloge
    du producteur avance ; l'écraser à zéro, comme le faisait la première
    écriture, empêchait le volet de le signaler. */
export function ageDuFlux(flux: FluxVehicules, maintenantS: number): number | null {
  return flux.horodate === null ? null : maintenantS - flux.horodate;
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
