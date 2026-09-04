/* <bandeau-guidage> — suivre un itinéraire en roulant.
 *
 * CE QU'IL PROMET, ET CE QU'IL REFUSE DE PROMETTRE. Armelin, le 25/08/2026 :
 * « il n'y a pas de bouton pour démarrer l'itinéraire ». Ce bandeau est la
 * réponse — mais il s'appelle SUIVI et non navigation, et il l'écrit à
 * l'écran. Pas de voix ; depuis le 29/08 (demande d'Armelin), quitter la
 * route déclenche en revanche un recalcul automatique — constaté ici,
 * calculé par le planificateur.
 * Une application qui annonce « navigation » et rend un suivi trompe au
 * moment précis où l'on ne peut pas regarder l'écran pour vérifier.
 *
 * CE QU'IL FAIT DONC : la position GPS projetée sur le tracé (lib/guidage.ts,
 * testé à sec), et trois réponses lisibles d'un coup d'œil — la manœuvre
 * suivante, ce qui reste, l'heure d'arrivée. Plus le prochain arrêt de
 * recharge quand un plan existe : c'est l'information qui manque le plus en
 * électrique, et aucune application de navigation généraliste ne la porte.
 *
 * LA GÉOLOCALISATION EST UN GESTE, JAMAIS UNE DEMANDE À L'ARRIVÉE — règle du
 * projet. Elle ne démarre qu'au clic sur « Démarrer », et s'arrête au clic sur
 * « Arrêter » ou à la fermeture : un `watchPosition` oublié viderait la
 * batterie de celui qui est arrivé depuis une heure.
 */
import type { Map as CarteMapLibre } from 'maplibre-gl';
import {
  tonnagesInterdits, phraseTonnage, type LimiteTonnage,
} from '../lib/tonnage';
import { phraseInterfile, type SectionInterfile } from '../lib/interfile';
import {
  lisserCap, capDeBoussole, type ModeOrientation,
} from '../lib/orientation';
import {
  etatGuidage, distanceEnMots, heureArriveeEstimee, type OptionsGuidage,
  partiAContresens, approcheManoeuvre, pointDuTrace, SEUIL_AIMANT_M,
  quitteLeTrace, FIXES_CONCORDANTS, ECART_DOUTE_M, type FixeEcart,
  type EtatGuidage,
} from '../lib/guidage';
import { formaterDistance, formaterDuree } from '../lib/itineraire';
import { chargerParkings, ErreurParkings, type Parking } from '../lib/parkings';
import {
  chercherPlacesLibres, libellePlaces, sourcePour, type ParkingLive,
} from '../lib/parkings-live';
import { coteDestination, phraseArrivee, SEUIL_ARRIVE_M } from '../lib/arrivee';
import {
  nouveauBilan, ajouterFixe, resumerBilan, dureeEnMots, type EtatBilan,
} from '../lib/bilan-trajet';
import {
  lireHistorique, ecrireHistorique, ajouterTrajet, titreParDefaut,
  reliefDesReleves, type ReliefTrajet,
  estLHeureDunReleve, type ReleveTrajet,
} from '../lib/historique-trajets';
import type { PointGeo } from '../lib/coordonnees';
import { Marker, type GeoJSONSource } from 'maplibre-gl';
import { imagePastille, cleImage, RAPPORT_PASTILLE } from './icone-lieu';
import { chargerCommodites, ErreurCommodites } from '../lib/commodites';
import { meteoA, phraseMeteo, ECART_MAX_MINUTES, ErreurMeteo } from '../lib/meteo';
import { socEstimeA } from '../lib/arrets';
import {
  profilItineraire, versTraceSVG, denivele, pointSurTrace, ErreurAltimetrie,
} from '../lib/altimetrie';
import { limiteA, type LimiteTrajet } from '../lib/limites';
import {
  sortieA, destinationA, type Sortie, type DestinationBretelle,
} from '../lib/sorties';
import {
  giratoireA, libelleRang, libelleRangCourt, type Giratoire,
} from '../lib/giratoire';
import {
  affectationA, voiesPour, libelleAffectation,
  type Affectation, type AffectationTrajet,
} from '../lib/affectation';
import {
  voiesA, cotePlacement, voieConseillee, libellePlacement, europeA,
  type ReleveVoies, type ReleveEurope,
} from '../lib/voies';
import type { EvenementTrajet } from '../lib/trafic';
import { flecheManoeuvre } from './icone-manoeuvre';
import { refermerPanneaux } from './panneaux';
import { classeRoute, numeroRoute, libelleClasse } from '../lib/classe-route';
import { fondPanneau, encreSur, cartoucheNumero } from '../lib/panneau';
import { pictoMenu } from './icone-menu';
import { listeCommodites } from './liste-commodites';
import { Voix } from './voix';
import {
  palierA, phraseAnnonce, traficADire, phraseTrafic,
  rechargeADire, phraseRecharge, MemoireAnnonces, type ContexteAnnonce,
} from '../lib/annonces';
import { CurseurVehicule, capEntre, formeValide, PREF_CURSEUR } from './curseur-vehicule';
import { lirePreference, ecrirePreference } from '../lib/stockage';
import { segmentsFrise } from '../lib/frise';

/** Un arrêt de recharge à annoncer pendant le trajet. */
export interface ArretAAnnoncer {
  nom: string;
  reseau: string | null;
  avancementM: number;
  dureeMin: number;
  /* POUR LE COPILOTE (28/08) : la position ouvre les commodités à la
     demande, les SOC prévus disent dans quel état on arrive et repart. */
  lon: number;
  lat: number;
  socArrivee: number;
  socDepart: number;
}

export interface DemarrageGuidage extends OptionsGuidage {
  arrets: readonly ArretAAnnoncer[];
  /* LES DEUX BOUTS DU FIL DE BATTERIE (SOC-EDIT, 04/09) : avec les SOC des
     arrêts, ils suffisent à estimer le niveau à l'instant T. Absents quand
     aucun plan n'existe — pas de véhicule électrique, pas de section. */
  socDepartTrajet?: number;
  socFinal?: number;
  /* LA DESTINATION DEMANDÉE (PARK-1, 31/08) — pas la fin du tracé : le tracé
     s'arrête SUR la route, la destination est l'adresse. C'est autour d'ELLE
     qu'on cherche les parkings, et son libellé nomme la fin à pied. */
  destination?: PointGeo & { libelle?: string };
}

/** Le zoom du suivi : assez près pour lire la rue, assez loin pour anticiper. */
const ZOOM_SUIVI = 15.5;
/* À L'INTERSECTION, ON SE RAPPROCHE. 17,2 montre les voies et l'amorce des
   rues qui partent — de quoi choisir la bonne sans deviner. Au-delà, on ne
   voit plus d'où l'on vient. */
const ZOOM_APPROCHE = 17.2;

/* L'INCLINAISON DU SUIVI — la « vue 3D » demandée le 27/08/2026, ESSAYÉE
   AVANT D'ÊTRE PROMISE (le cadrage l'exigeait) : capture du fond Plan IGN
   incliné à 60° sur Lyon au zoom 15,5 — le champ proche reste net, seul le
   lointain rapetisse, ce qui est la nature d'une perspective. 55° garde un
   peu plus de lisibilité au loin. Les étiquettes sont CUITES dans le raster :
   elles rapetissent avec la distance, là où un fond vectoriel les garderait à
   taille d'écran — la limite est connue et assumée. */
const PITCH_SUIVI = 55;

/* À QUELLE DISTANCE ON ANNONCE. Dix kilomètres : de quoi décider (sortir,
   changer d'arrêt) sans occuper l'écran pendant une demi-heure. Au-delà,
   l'information n'est pas perdue — elle attend qu'on déplie la barre. */
const ANNONCE_M = 10_000;

/* JUSQU'OÙ LE CONSEIL DE PLACEMENT A UN SENS. Neuf cents mètres : sur
   autoroute c'est une trentaine de secondes — le temps de changer de file
   sans se précipiter — et en ville c'est déjà loin. Plus tôt, la consigne
   arriverait avant la sortie précédente ; plus tard, elle arriverait après
   le trait continu. */
const SEUIL_VOIES_M = 900;

/* LA CLÉ DU CHOIX DE VOIX, dans le même magasin que les autres préférences :
   IndexedDB local, jamais un serveur (CLAUDE.md). */
export const PREF_VOIX = 'guidage-vocal';

/**
 * La flèche d'un mouvement de voie, en SVG — PURE.
 *
 * ELLES SONT DESSINÉES, PAS ÉCRITES : « through;right » en toutes lettres ne
 * se lit pas à quatre-vingt-dix kilomètres-heure. Le vocabulaire est celui
 * d'OpenStreetMap ; ce qu'on ne sait pas dessiner devient une flèche droite,
 * qui est le mouvement par défaut d'une voie.
 */
function flecheDeVoie(mouvement: string): string {
  const tige = 'M9 17V9';
  const pointe = 'M6.2 11.4 9 8.4l2.8 3';
  const formes: Record<string, string> = {
    through: `<path d="${tige}"/><path d="${pointe}"/>`,
    right: '<path d="M9 17v-4a2 2 0 0 1 2-2h3"/><path d="M12.2 8.8 15.2 11l-3 2.2"/>',
    left: '<path d="M9 17v-4a2 2 0 0 0-2-2H4"/><path d="M6.8 8.8 3.8 11l3 2.2"/>',
    slight_right: '<path d="M8 17v-3.5L13 9"/><path d="M9.8 8.2 13.6 8.4l.2 3.8"/>',
    slight_left: '<path d="M10 17v-3.5L5 9"/><path d="M8.2 8.2 4.4 8.4l-.2 3.8"/>',
    sharp_right: '<path d="M9 17v-5a1.6 1.6 0 0 1 1.6-1.6H14"/><path d="M11.6 8 14.6 10.4l-3 2.2"/>',
    sharp_left: '<path d="M9 17v-5a1.6 1.6 0 0 0-1.6-1.6H4"/><path d="M6.4 8 3.4 10.4l3 2.2"/>',
    reverse: '<path d="M11 17v-4a2 2 0 0 0-4 0v1"/><path d="M5.2 12.2 7 14.4l1.8-2.2"/>',
  };
  const merge = { merge_to_right: 'slight_right', merge_to_left: 'slight_left' } as const;
  const cle = merge[mouvement as keyof typeof merge] ?? mouvement;
  return `<svg viewBox="0 0 18 20" aria-hidden="true" focusable="false">`
    + `${formes[cle] ?? formes['through']}</svg>`;
}

/**
 * Le dessin d'un giratoire, en SVG — PURE.
 *
 * LE REPÈRE : l'entrée en bas (angle 0 du modèle = 180° à l'écran), et les
 * angles croissent dans le sens où l'on tourne. On ne cherche PAS à
 * reproduire le sens horaire ou antihoraire réel à l'écran : le schéma dit
 * « la deuxième à partir de maintenant », ce qui se lit de la même façon
 * dans les deux cas, et c'est ce que fait toute la signalisation.
 */
function schemaGiratoire(g: Giratoire): string {
  const R = 13;
  const pointe = (angle: number, longueur: number): string => {
    /* L'entrée est en bas : l'angle 0 du modèle pointe vers le bas de
       l'écran, et l'on tourne dans le sens des angles croissants. */
    const a = ((angle + 180) * Math.PI) / 180;
    /* LE X EST INVERSÉ, ET CE N'EST PAS UN DÉTAIL : la première sortie doit
       partir à DROITE quand on entre par le bas — c'est ce que fait tout
       conducteur en France, et ce que montre tout schéma de navigation. Le
       premier jet l'envoyait à gauche : vu sur capture avant livraison. */
    const x = 24 - Math.sin(a) * longueur;
    const y = 24 - Math.cos(a) * longueur;
    return `${x.toFixed(1)} ${y.toFixed(1)}`;
  };
  const branches = g.branches
    .filter((b) => Math.abs(b - g.sortie) > 8)
    .map((b) => `<path class="bg-gir-branche" d="M${pointe(b, R)}L${pointe(b, 21)}"/>`)
    .join('');
  return '<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">'
    + `<circle class="bg-gir-anneau" cx="24" cy="24" r="${R}"/>`
    /* L'ENTRÉE EST UN TRAIT, PAS UNE FLÈCHE : la flèche est réservée à ce
       qu'il faut faire, et il n'y a rien à faire pour entrer. */
    + `<path class="bg-gir-entree" d="M${pointe(0, R)}L${pointe(0, 23)}"/>`
    + branches
    + `<path class="bg-gir-sortie" d="M${pointe(g.sortie, R)}L${pointe(g.sortie, 22)}"/>`
    + `<path class="bg-gir-fleche" d="M${pointe(g.sortie - 7, 17)}`
    + `L${pointe(g.sortie, 23)}L${pointe(g.sortie + 7, 17)}"/>`
    + (g.rang === null ? ''
      : `<text class="bg-gir-rang" x="24" y="27" text-anchor="middle">${g.rang}</text>`)
    + '</svg>';
}

/* LA CAMÉRA REVIENT TOUTE SEULE APRÈS VINGT SECONDES sans nouveau geste.
   Armelin, le 27/08/2026 : « je ne peux plus dézoomer sur la carte car le
   zoom sur ma position se force automatiquement. Ce serait bien de pouvoir
   dézoomer et d'avoir ensuite un bouton qui s'affiche permettant de recentrer
   automatiquement ou d'attendre quelques minutes avant de recentrer. » */
const REPRISE_CAMERA_MS = 20_000;

/** Le verrou d'écran, tel que le navigateur le rend. */
interface VerrouEcran { release(): Promise<void> }

export class BandeauGuidage extends HTMLElement {
  #carte: CarteMapLibre | null = null;
  /* LES LIMITES CARTOGRAPHIÉES du tracé (lib/limites.ts) — livrées APRÈS le
     démarrage : Overpass peut mettre vingt secondes, et « Démarrer » ne doit
     pas les attendre. Tant qu'elles ne sont pas là (ou pas du tout), le
     panneau de limite n'apparaît simplement pas. */
  #limites: readonly LimiteTrajet[] = [];

  set limites(l: readonly LimiteTrajet[]) { this.#limites = l; }

  /* LES PASSAGES LIMITÉS EN TONNAGE (PONT-1, 02/09) et la masse déclarée du
     véhicule. Les deux ensemble, ou rien : une limite sans masse ne se compare
     à rien, et une masse sans limite n'a rien à dire. */
  #tonnages: readonly LimiteTonnage[] = [];

  #masseKg: number | null = null;

  /** Les tonnages DÉJÀ annoncés — on ne répète pas un pont à chaque fixe. */
  #tonnagesDits = new Set<number>();

  set tonnages(l: readonly LimiteTonnage[]) {
    this.#tonnages = l;
    if (this.#derniersCoords) this.#majPosition(this.#derniersCoords);
  }

  set masseVehiculeKg(m: number | null) { this.#masseKg = m; }

  /* L'INTERFILE (MOTO-1, 02/09), et le même contrat que les tonnages : les
     deux ensemble ou rien. Sans « deux-roues » coché, les sections restent
     muettes ; sans sections relevées, le mode moto n'a rien à dire. */
  #interfiles: readonly SectionInterfile[] = [];

  #moto = false;

  /** Les sections DÉJÀ annoncées — on ne répète pas l'A86 à chaque fixe. */
  #interfilesDites = new Set<number>();

  set interfiles(s: readonly SectionInterfile[]) { this.#interfiles = s; }

  set moto(v: boolean) { this.#moto = v; }

  /* LES REPÈRES CARTOGRAPHIÉS ONT-ILS MANQUÉ ? (CORRIDOR-1, 31/08)
     Leur absence était TOTALEMENT muette : ni panneau de vitesse, ni numéro
     de sortie, ni schéma de rond-point, ni affectation par voie — et rien à
     l'écran pour l'expliquer. Armelin a signalé un giratoire annoncé
     « tournez à droite » ; c'était cela.
     LE SUIVI VAUT TOUJOURS SANS EUX, on ne l'interrompt pas. Mais on le dit
     une fois, discrètement : un GPS qui se tait sur ce qu'il ignore laisse
     croire qu'il sait. */
  #reperesManquants = false;

  set reperesManquants(v: boolean) {
    if (this.#reperesManquants === v) return;
    this.#reperesManquants = v;
    this.#majReperes();
  }

  /** Dit, une fois, que les repères cartographiés n'ont pas pu être relevés. */
  #majReperes(): void {
    const boite = this.querySelector('.bg-reperes') as HTMLElement | null;
    if (!boite) return;
    boite.hidden = !this.#reperesManquants;
    boite.textContent = this.#reperesManquants
      ? 'Repères OpenStreetMap indisponibles : ni limite de vitesse, ni'
        + ' schéma de rond-point sur ce trajet.'
      : '';
  }

  /* LE NOMBRE DE VOIES du tracé (lib/voies.ts) — livré APRÈS le démarrage,
     comme les limites : la seconde requête met seize secondes sur un
     Paris-Lyon (mesuré le 30/08). Tant qu'elle n'est pas là, ou si elle
     échoue, la chaussée ne se dessine pas — le suivi vaut sans elle. */
  #voies: readonly ReleveVoies[] = [];

  /* LA VOIX (VOIX-1, 30/08) — celle du navigateur. Le choix de l'usager
     survit à la fermeture : on ne redemande pas à chaque trajet. */
  #voix = new Voix();

  #parle = false;

  /* Vrai dès qu'une annonce est sortie — sert à savoir si l'allumage a déjà
     dit quelque chose d'utile. */
  #aParle = false;

  #annonces = new MemoireAnnonces();

  /* L'AFFECTATION PAR VOIE — relevée par le MÊME appel Overpass. Quand elle
     existe (29 % des manœuvres mesurées le 30/08), elle REMPLACE le conseil
     de placement : savoir ce que chaque voie autorise vaut mieux que déduire
     un côté. */
  #affectations: readonly AffectationTrajet[] = [];

  set affectations(a: readonly AffectationTrajet[]) {
    this.#affectations = a;
    if (this.#derniersCoords) this.#majPosition(this.#derniersCoords);
  }

  /* LES GIRATOIRES — relevés par le MÊME appel Overpass, et rejoués de la
     même façon quand ils arrivent. */
  #giratoires: readonly Giratoire[] = [];

  set giratoires(g: readonly Giratoire[]) {
    this.#giratoires = g;
    if (this.#derniersCoords) this.#majPosition(this.#derniersCoords);
  }

  /* LES SORTIES ET LEURS DESTINATIONS — relevées par le MÊME appel Overpass
     que les limites de vitesse (lib/corridor.ts). */
  #sorties: readonly Sortie[] = [];

  #destinations: readonly DestinationBretelle[] = [];

  set sorties(s: readonly Sortie[]) {
    this.#sorties = s;
    if (this.#derniersCoords) this.#majPosition(this.#derniersCoords);
  }

  set destinations(d: readonly DestinationBretelle[]) {
    this.#destinations = d;
    if (this.#derniersCoords) this.#majPosition(this.#derniersCoords);
  }

  /* LES ROUTES EUROPÉENNES du tracé — livrées par le MÊME appel que les
     voies, et rejouées de la même façon. */
  #europe: readonly ReleveEurope[] = [];

  set routesEurope(r: readonly ReleveEurope[]) {
    this.#europe = r;
    if (this.#derniersCoords) this.#majPosition(this.#derniersCoords);
  }

  set voies(v: readonly ReleveVoies[]) {
    this.#voies = v;
    /* ON REJOUE LE DERNIER FIXE, sans quoi la chaussée attendrait le
       suivant : la requête arrive seize secondes après le démarrage, et à
       l'arrêt — au feu, sur une aire — le récepteur peut ne plus rien
       envoyer. Elle paraîtrait alors une fois la sortie passée. C'est le
       même rejeu que celui du dépliage de la barre. */
    if (this.#derniersCoords) this.#majPosition(this.#derniersCoords);
  }

  /* LES ÉVÉNEMENTS TRAFIC DU CORRIDOR (Bison Futé) — livrés après le
     démarrage et rafraîchis par le planificateur. La barre de fluidité est
     ÉCARTÉE avec la mesure (docs/navigation-mobile.md §Études) : le flux ne
     porte que des événements ponctuels — on ANNONCE donc le prochain. */
  #evenements: readonly EvenementTrajet[] = [];

  set evenements(l: readonly EvenementTrajet[]) { this.#evenements = l; }
  #veille: number | null = null;
  #options: DemarrageGuidage | null = null;
  /** La caméra suit-elle la voiture ? Un geste de l'usager la suspend. */
  #camera = true;
  #reprise: ReturnType<typeof setTimeout> | undefined;
  #dernierePosition: [number, number] | null = null;
  /* LE CURSEUR DE LA VOITURE (NAV-2, 29/08 — Armelin : « c'est un objet
     fantôme qui se déplace et on ne peut pas savoir où on est »). Il naît
     au premier fixe du suivi et meurt à son arrêt. */
  readonly #curseur = new CurseurVehicule();
  /** Republie la hauteur du bandeau — appelée quand il paraît ou disparaît. */
  #publierHauteur: (() => void) | null = null;
  /* L'ÉCRAN RESTE ALLUMÉ PENDANT LE SUIVI (Screen Wake Lock) : un téléphone
     qui se verrouille au premier feu rouge n'est pas un suivi. Le verrou
     TOMBE quand l'onglet passe en arrière-plan — le navigateur l'impose — et
     se REPREND au retour ; son échec est bénin (réglage d'économie d'énergie)
     et l'écran suit alors la règle du téléphone, comme avant. */
  #verrouEcran: VerrouEcran | null = null;
  /** Vrai dès qu'un cap a tourné la carte : l'arrêt devra rendre le nord. */
  #veilleAvaitTourne = false;

  /* L'ORIENTATION À TROIS ÉTATS (mandat UX 28/08, NAV-1) : cap en haut
     (défaut), nord en haut, ou vue libre — la carte suit la voiture sans lui
     tourner autour. Le choix tient la session, comme la 3D. */
  #modeOrientation: ModeOrientation = 'cap';

  /* Jusqu'à quand un geste sur la carte ne suspend PAS le suivi — voir le
     clic sur la boussole. */
  #gesteBoussoleJusqua = 0;

  /* LE DERNIER CAP CONNU, gardé même quand le lissage repart de zéro. Sans
     lui, revenir au « sens de la voiture » ne faisait RIEN tant qu'aucun
     nouveau cap n'arrivait — et il n'en arrive pas à l'arrêt : le récepteur
     ne donne de cap qu'au-delà de 7 km/h. C'est le défaut qu'Armelin a
     rencontré au volant (« ça ne fonctionne pas »), et il venait de la
     remise à zéro ajoutée le matin même. */
  #dernierCapConnu: number | null = null;

  /** Le cap affiché, LISSÉ : les à-coups du récepteur ne secouent pas la carte. */
  #capLisse: number | null = null;

  /** Le dernier cap boussole reçu — la source de l'arrêt, quand elle existe. */
  #capBoussole: number | null = null;

  /** L'abonnement DeviceOrientation. Nul tant que le geste ne l'a pas ouvert. */
  #boussole: AbortController | null = null;

  /* LE MODE COPILOTE (décision d'Armelin du 28/08) : un panneau pour le
     PASSAGER pendant le suivi — recharges à venir, événements de la route,
     arrivée. Le conducteur garde le bandeau épuré ; le copilote a les mains
     libres. Reconstruit à chaque fixe tant qu'il est ouvert. */
  #copiloteOuvert = false;

  /* LE PROFIL RELEVÉ, gardé pour y replacer le rond du véhicule à chaque
     fixe sans redemander quoi que ce soit au service. */
  #profil: readonly { distance: number; z: number }[] = [];

  /** Le dernier état du guidage — le copilote se rafraîchit dessus. */
  #etat: { avancementM: number; restantM: number; restantS: number } | null = null;

  /* LE RECALCUL AUTOMATIQUE HORS-ROUTE (demande d'Armelin du 29/08). Le
     bandeau ne calcule rien : il CONSTATE que l'écart dure — huit secondes
     au-delà de cinquante mètres, le temps d'écarter le tunnel et le GPS qui
     divague — et demande au planificateur de refaire l'itinéraire depuis la
     position. Trente secondes entre deux demandes : un recalcul qui
     mitraille pendant qu'on cherche une sortie serait pire que l'ancien
     message. */
  #horsRouteDepuis: number | null = null;

  /* LES DERNIERS ÉCARTS, POUR CONCLURE PLUS TÔT (GUIDE-5, 01/09). Armelin :
     « le recalcul automatique intervient de plus de 30 m après avoir fait mon
     écart ». Trois fixes suffisent à distinguer un virage d'une dérive —
     voir `quitteLeTrace` dans lib/guidage.ts. */
  #derniersEcarts: FixeEcart[] = [];

  /* UN FIXE NEUF, PAS UN GESTE D'INTERFACE. `#majPosition` est rejouée par SIX
     chemins (boussole, recentrage, dépliage…), et un écart REJOUÉ à
     l'identique casse la croissance stricte que le détecteur exige : il ne
     concluait jamais. Le même piège que le bilan de trajet, retrouvé par un
     parcours qui restait muet. */
  #numeroFixe = 0;

  #fixeNote = -1;
  /* LE ZOOM D'APPROCHE (ZOOM-1, 30/08). On garde le zoom qu'on a TROUVÉ en
     entrant dans l'approche, et on le rend en sortant : rendre un zoom
     « par défaut » effacerait le réglage que l'usager venait de poser. */
  #zoomAvantApproche: number | null = null;

  /** Le dernier fixe reçu — rejoué quand l'affichage change sans lui. */
  #derniersCoords: { longitude: number; latitude: number;
    speed?: number | null; heading?: number | null } | null = null;

  /** Le plus loin qu'on soit allé sur le tracé — voir `partiAContresens`. */
  #avancementMax = 0;

  /* −Infinity, PAS zéro : performance.now() démarre à zéro AVEC la page, et
     un garde « > 30 s depuis le dernier » initialisé à zéro interdisait tout
     recalcul pendant les trente premières secondes de vie de l'application —
     attrapé par le parcours E2E avant d'être compris. */
  #dernierRecalculMs = Number.NEGATIVE_INFINITY;

  /* L'ÉCART TENU DANS LA BANDE AVEUGLE (FERMEE-1) — depuis quand l'on
     roule au-delà de l'aimant sans être hors-route. */
  #ecartTenuDepuis: number | null = null;

  /** Cherche une route qui s'écarte d'ici — bouton bis et contournement. */
  #lancerBis(): void {
    const c = this.#derniersCoords;
    if (!c) { this.#direBis('Position inconnue : le bis attend un point GPS.'); return; }
    this.#direBis('Recherche d’un itinéraire bis…');
    document.dispatchEvent(new CustomEvent('itineraire-bis', {
      detail: { lon: c.longitude, lat: c.latitude, cap: this.#capLisse },
    }));
  }

  /** La vue inclinée du suivi — un choix de l'usager, retenu pour la session. */
  #en3D = true;
  #surVisibilite = (): void => { void this.#prendreVerrou(); };

  set carte(c: CarteMapLibre) {
    this.#carte = c;
    /* LA BOUSSOLE DE LA CARTE BASCULE L'ORIENTATION (TERRAIN-1, 30/08) —
       cap en haut, nord en haut, et retour. On ne l'empêche PAS de faire ce
       qu'elle fait déjà : MapLibre remet le nord au clic, ce qui est
       exactement l'un des deux états. On note l'autre, et le prochain fixe
       remet la carte dans le sens de la voiture. */
    /* PAR DÉLÉGATION, ET NON SUR LE BOUTON : la boussole de MapLibre est
       créée par un contrôle dont on n'ordonne pas la pose, et elle est
       REFAITE à chaque changement de fond de carte. Un écouteur posé sur le
       bouton lui-même disparaît avec lui — sans une erreur pour le dire. */
    c.getContainer().addEventListener('click', (evt) => {
      if (!(evt.target as HTMLElement | null)?.closest?.('.maplibregl-ctrl-compass')) return;
      {
        if (!this.actif) return;
        this.#modeOrientation = this.#modeOrientation === 'nord' ? 'cap' : 'nord';
        /* LE LISSAGE REPART DE ZÉRO DANS LES DEUX SENS. Il sert à absorber
           le tremblement du récepteur d'un fixe à l'autre, pas à glisser
           depuis un cap vieux de plusieurs minutes : au retour du mode nord,
           la carte doit se mettre dans le sens de la voiture TOUT DE SUITE,
           pas en trois virages. Mesuré : sans cela, un cap réel de 200°
           donnait 148° au premier fixe. */
        this.#capLisse = null;
        if (this.#modeOrientation === 'cap') {
          void this.#ouvrirBoussole();
          /* ON REND LE CAP TOUT DE SUITE, sans attendre un fixe : à l'arrêt
             ou à faible allure, le récepteur ne donne aucun cap, et la carte
             serait restée au nord — exactement ce qu'Armelin a constaté. Le
             dernier cap connu vaut mieux que rien : c'est celui dans lequel
             la voiture est orientée. */
          const cap = this.#dernierCapConnu;
          if (cap !== null) {
            this.#capLisse = cap;
            this.#carte?.easeTo({ bearing: cap, duration: 400 });
          }
        } else this.#fermerBoussole();
        /* APPUYER SUR LA BOUSSOLE N'EST PAS EXPLORER LA CARTE : c'est régler
           le suivi. Or MapLibre passe le clic d'origine à sa propre remise au
           nord, ce qui déclenche notre détection de geste d'usager — le suivi
           se suspendait, « Recentrer » apparaissait, et les fixes suivants ne
           bougeaient plus rien. Recentrer sur-le-champ ne suffisait pas : la
           rotation de MapLibre émet son événement à la frame SUIVANTE, donc
           APRÈS. D'où cette fenêtre d'indulgence d'une demi-seconde. Trouvé
           par un parcours, pas au volant. */
        this.#gesteBoussoleJusqua = Date.now() + 500;
        this.#recentrer();
      }
    });
    /* UN GESTE DE L'USAGER SUSPEND LA CAMÉRA — pas un mouvement du code. Les
       événements MapLibre issus d'un vrai geste portent `originalEvent` ;
       nos propres `easeTo` n'en portent pas : c'est LE discriminant. */
    for (const geste of ['movestart', 'zoomstart', 'rotatestart', 'pitchstart'] as const) {
      c.on(geste, (e) => {
        const gesteUsager = (e as { originalEvent?: Event }).originalEvent;
        if (this.actif && gesteUsager && Date.now() > this.#gesteBoussoleJusqua) {
          this.#suspendreCamera();
        }
      });
    }
    /* `dragstart` ET `wheel` EN PLUS : ils ne naissent QUE d'un geste — et la
       molette, elle, peut être avalée par un `easeTo` en cours (l'animation
       du suivi tourne huit dixièmes de seconde sur dix) : son `zoomstart`
       n'est alors pas rejoué avec l'originalEvent. L'événement `wheel` du
       niveau du dessous, lui, arrive toujours. */
    for (const geste of ['dragstart', 'wheel'] as const) {
      c.on(geste, () => { if (this.actif) this.#suspendreCamera(); });
    }
  }

  /** `true` tant que le suivi tourne — l'appelant s'en sert pour son bouton. */
  get actif(): boolean { return this.#veille !== null; }

  connectedCallback(): void {
    if (this.firstElementChild) return;
    this.hidden = true;
    this.setAttribute('role', 'complementary');
    this.setAttribute('aria-label', 'Suivi de l’itinéraire');
    this.innerHTML = `
      <div class="bg">
        <!-- LA BARRE DU BAS EST MINIMALE (GUID-2, 29/08 — Armelin : « cette
             barre de navigation affiche également les flèches et indication
             de navigation […] ce qui agrandit la fenêtre du bas qui doit
             rester minimaliste. A la limite, la barre de navigation en bas
             peut seulement afficher le nom de la rue sur laquelle on se
             déplace actuellement »). La manœuvre a déménagé dans le
             cartouche flottant ; ici restent la voie, ce qui reste à faire,
             et ce qui arrive. -->
        <!-- LA RANGÉE ESSENTIELLE (NAV-3, 29/08). Armelin : « la barre de
             navigation en bas sur mobile est beaucoup trop grande et les
             informations les plus indispensables sont écrites en trop petit
             […] les seules informations qui doivent apparaître pendant la
             navigation, c'est le nombre de kilomètres restants, le temps
             restant, l'heure d'arrivée estimée, et un bouton pour arrêter ».
             Trois chiffres, gros ; une croix ; le reste se déplie. -->
        <div class="bg-essentiel">
          <button type="button" class="bg-deplier" aria-expanded="false"
            aria-label="Afficher les commandes du suivi">
            <!-- RIEN NE DISAIT QU'ON POUVAIT DÉPLIER (30/08). Armelin : « il
                 n'y a aucune indication visuelle laissant penser à
                 l'utilisateur qu'il peut appuyer sur la barre d'état ou la
                 scroller pour avoir des informations complémentaires ». Une
                 poignée — la même que les feuilles basses — et un chevron
                 qui pivote : deux signes que tout le monde a déjà vus. -->
            <span class="bg-poignee" aria-hidden="true"></span>
            <p class="bg-voie"></p>
            <p class="bg-chiffres" aria-hidden="true">
              <span class="bg-chiffre"><b class="bg-km"></b><i>restants</i></span>
              <span class="bg-chiffre"><b class="bg-temps"></b><i>de route</i></span>
              <span class="bg-chiffre"><b class="bg-eta"></b><i>arrivée</i></span>
            </p>
          </button>
          <button type="button" class="bg-arreter" aria-label="Arrêter le suivi">
            ${pictoMenu('croix')}</button>
        </div>
        <!-- LA PHRASE COMPLÈTE RESTE, POUR QUI ÉCOUTE LA PAGE. Elle n'est
             pas masquée par l'attribut hidden — un élément caché sort de
             l'arbre d'accessibilité, et les trois chiffres, eux, sont
             décoratifs pour un lecteur d'écran (« 390 km / restants » lu
             en morceaux ne s'entend pas). Masquée À L'ŒIL SEULEMENT. -->
        <p class="bg-restant bg-lu-seulement" role="status"></p>
        <p class="bg-trafic" role="status"><span class="bg-trafic-mot"></span><button
          type="button" class="bg-trafic-eviter" hidden>Chercher un contournement</button></p>
        <p class="bg-arret"></p>
        <p class="bg-alerte" role="alert" hidden></p>
        <!-- LE MOT DU BIS A SA PROPRE LIGNE, et ce n'est pas un détail :
             la ligne d'alerte est réécrite à CHAQUE fixe GPS (hors-route,
             contresens), ce qui effacerait la réponse au bout d'une
             seconde. -->
        <p class="bg-bis-mot" role="status" hidden></p>
        <!-- LE PANNEAU P (PARK-1, 31/08). Armelin : « un petit panneau rond P
             lorsqu'on arrive presque à destination, afin de proposer une
             liste de parkings publics à proximité ». Il ne paraît qu'à
             l'approche, et ne demande RIEN tant qu'on ne le presse pas —
             Overpass est un commun bénévole. -->
        <button type="button" class="bg-parking-p" hidden
          aria-label="Suggérer des parkings près de la destination">P</button>
        <div class="bg-parkings" hidden role="region"
          aria-label="Parkings près de la destination">
          <p class="bg-parkings-titre">Se garer près de l’arrivée</p>
          <ul class="bg-parkings-liste"></ul>
          <p class="bg-parkings-etat" role="status"></p>
        </div>
        <!-- FINIR À PIED (point 9) : une fois garé, la fin du trajet se fait
             logiquement à pied — on le PROPOSE, on ne l'impose pas. -->
        <button type="button" class="bg-a-pied" hidden></button>
        <!-- LE BILAN D'ARRIVÉE (STATS-1, 01/09) : « une fenêtre de
             statistiques à l'arrivée ». Il ne coûte AUCUNE requête — tout
             sort des fixes que le suivi recevait déjà, et rien ne quitte le
             navigateur. -->
        <section class="bg-bilan" hidden aria-label="Bilan du trajet">
          <h2 class="bg-bilan-titre">Trajet terminé</h2>
          <dl class="bg-bilan-liste"></dl>
          <!-- ENREGISTRER EST UN GESTE, PAS UN RÉFLEXE DE L'APPLICATION
               (STATS-2, 01/09). Armelin : « pour l'historique des trajets,
               cela ne doit pas être fait automatiquement, mais proposé à
               l'enregistrement à la fin du parcours au moment du récapitulatif
               […] un bouton en bas de la fenêtre "Enregistrer ce parcours" ».
               Un GPS qui archive tout seul devient un carnet de déplacements ;
               un bouton qu'on presse est un consentement. -->
          <div class="bg-bilan-boutons">
            <button type="button" class="bg-bilan-garder">Enregistrer ce parcours</button>
            <button type="button" class="bg-bilan-fermer">Fermer</button>
          </div>
          <p class="bg-bilan-garde" role="status" hidden></p>
        </section>
        <!-- CE QUI SE DÉPLIE. « Soit l'utilisateur scrolle la barre vers le
             haut pour afficher les options cachées, soit il appuie une fois
             sur la barre pour la déployer » — les deux gestes marchent.
             Les libellés sont devenus des ICÔNES : « un unique bouton en
             forme de boussole en mode pressoir », dont le dessin change
             avec l'état. -->
        <div class="bg-boutons" hidden>
          <!-- LE BOUTON DIT SA VUE, PAS SON GESTE (ERGO-2, 30/08). Armelin :
               « ce serait mieux d'afficher simplement 2D ou 3D sur le bouton
               en fonction de la vue affichée, pour que l'utilisateur
               comprenne qu'il faut appuyer de nouveau pour changer ». Deux
               caractères se lisent d'un coup d'œil au volant, là où un
               parallélogramme demande à être interprété. -->
          <button type="button" class="bg-3d" aria-pressed="true"
            aria-label="Vue en relief. Appuyer pour passer à plat">3D</button>
          <!-- LE BOUTON D'ORIENTATION A ÉTÉ RETIRÉ (TERRAIN-1, 30/08).
               Armelin : « j'ai du mal à comprendre les boutons d'orientation,
               boussole et sens de la carte. Il y a un bouton dans la fenêtre
               de navigation au-dessus de Centrer, et deux à gauche dans la
               barre. Le bouton en forme de boussole doit orienter la carte
               vers le nord quand on appuie dessus, et la remettre dans le
               sens de la voiture quand on appuie à nouveau. » C'est fait :
               la boussole de la carte bascule les DEUX états, et le
               troisième — la « vue libre » — n'existait que pour le bouton
               qu'on vient de supprimer. Un geste sur la carte suspend déjà
               la caméra, avec « Recentrer » pour la rendre. -->
          <button type="button" class="bg-copilote-bouton" aria-pressed="false"
            aria-label="Ouvrir le panneau du copilote">${pictoMenu('copilote')}</button>
          <!-- LE GUIDAGE VOCAL (VOIX-1, 30/08). La voix est celle du
               NAVIGATEUR : aucun service, aucun coût, et rien qui quitte
               l'appareil — une synthèse en ligne enverrait à un tiers
               l'itinéraire complet, phrase après phrase. Le bouton ne
               paraît que si l'appareil sait parler. -->
          <button type="button" class="bg-voix" aria-pressed="false" hidden
            aria-label="Activer le guidage vocal">${pictoMenu('voix-muette')}</button>
          <!-- L'ITINÉRAIRE BIS (BIS-1, 30/08). Armelin : « quand on est en
               mode navigation et qu'on a un obstacle ou une route fermée non
               prévue, ce serait bien d'avoir dans la barre d'état une icône
               pour calculer automatiquement un itinéraire bis avant
               d'arriver à l'obstacle ». Le bouton NE PROMET PAS d'éviter
               l'obstacle — le service public n'a aucun paramètre « éviter ce
               tronçon » : il cherche une route qui quitte celle-ci dans les
               six kilomètres, et le dit quand il n'en trouve pas. -->
          <button type="button" class="bg-bis"
            aria-label="Chercher un itinéraire bis">${pictoMenu('bis')}</button>
        </div>
      </div>
      <!-- LE CARTOUCHE D'INSTRUCTION (GUID-2, 29/08) — « des fenêtres
           flottantes rectangulaires en haut à gauche pour donner des
           indications graphiques et textuelles ». Il quitte la barre du bas,
           qui redevient minimale, et prend la COULEUR DE LA ROUTE :
           bleu autoroute, vert nationale, orange départementale (convention
           énoncée par Armelin). L'écusson porte le numéro quand la donnée en
           donne un — mesuré le 29/08 : le champ cpx_numero rend « D39 », « D415 »,
           « D606 ». Le placement sur la chaussée n'est toujours pas promis :
           le champ des voies EXISTE (mesuré le 30/08) mais sur une ressource
           qui ne rend aucune instruction de manœuvre — voir docs/apis.md. -->
      <div class="bg-cartouche" role="status" aria-live="polite" hidden>
        <span class="bg-fleche" aria-hidden="true"></span>
        <div class="bg-cartouche-texte">
          <p class="bg-instruction"></p>
          <p class="bg-distance"></p>
        </div>
        <span class="bg-ecusson" hidden></span>
        <!-- LE CARTOUCHE VERT EUROPÉEN (EURO-1, 30/08) — type E41 de l'IISR.
             Il s'AJOUTE au cartouche national, il ne le remplace pas : sur
             l'A6 on lit « A6 » en rouge ET « E15 » en vert, l'un sous
             l'autre. La donnée vient de la seconde requête, celle des
             attributs de route (docs/apis.md). -->
        <span class="bg-europe" hidden></span>
        <!-- LE NUMÉRO DE SORTIE ET LES VILLES DESSERVIES (SORTIE-1, 30/08).
             Relevés dans OpenStreetMap, où ils EXISTENT — la note qui les
             disait absents avait cherché dans le service d'itinéraire. La
             couverture est partielle : on affiche ce qu'on a, on se tait sur
             le reste. Un numéro absent n'est pas un numéro faux. -->
        <span class="bg-sortie" hidden></span>
        <p class="bg-destination" hidden></p>
        <!-- LE SCHÉMA DE ROND-POINT (ROND-1, 30/08). Armelin : « pourquoi
             pas afficher des schémas complexes pour indiquer un rond-point ».
             Le moteur n'émet JAMAIS de manœuvre « rond-point » — mesuré sur
             les DEUX moteurs — donc tout est dessiné d'après la géométrie :
             l'anneau vient d'OpenStreetMap, l'entrée, le sens et la sortie
             viennent de notre propre tracé. -->
        <div class="bg-giratoire" hidden role="img"></div>
        <!-- L'AVEU, QUAND LES REPÈRES MANQUENT (CORRIDOR-1, 31/08) : sans
             corridor, ni limite de vitesse, ni rond-point, ni sortie — et
             c'était totalement muet. Un GPS qui se tait sur ce qu'il ignore
             laisse croire qu'il sait. -->
        <p class="bg-reperes" role="status" hidden></p>
        <!-- LA CHAUSSÉE ET LE CÔTÉ OÙ SE PLACER (VOIE-1, 30/08). Armelin :
             « des flèches pour préciser où se placer sur la chaussée pour
             tourner à une intersection ou pour sortir d'une autoroute ».
             CE N'EST PAS LE PANNEAU D'AFFECTATION PAR VOIE des GPS du
             commerce : la donnée dit COMBIEN de voies porte la chaussée,
             jamais ce que chaque voie autorise. On dessine donc les voies
             et l'on éclaire CELLE OÙ SE METTRE, déduite de la manœuvre —
             et le libellé lu à voix haute le dit en toutes lettres. -->
        <!-- CHAUSSÉE ET FILES, PAS « VOIES » : la classe .bg-voie nomme déjà
             le nom de rue de la barre du bas. Le premier jet l'a réutilisée,
             et un parcours a compté QUATRE barres là où la chaussée en a
             trois — la quatrième était le nom de rue. C'est la deuxième
             collision de ce genre (recharge-reserve, le 30/08). -->
        <p class="bg-chaussee" hidden role="status"></p>
      </div>
      <!-- LE RECENTRAGE, HORS DU BANDEAU : il flotte sur la carte, là où le
           regard est quand on vient de la déplacer. Il ne paraît que quand la
           caméra est suspendue par un geste. -->
      <button type="button" class="bg-recentrer" hidden>Recentrer</button>
      <!-- LA VITESSE GPS — un cercle discret à gauche. Cachée tant que le
           récepteur ne la donne pas : un chiffre figé serait un mensonge. -->
      <p class="bg-vitesse" hidden aria-label="Vitesse GPS">
        <span class="bg-vitesse-nombre">0</span><span class="bg-vitesse-unite">km/h</span></p>
      <!-- LA LIMITE CARTOGRAPHIÉE — un disque cerclé de rouge, au-dessus de
           la vitesse. CARTOGRAPHIÉE, pas mesurée : OpenStreetMap ignore les
           travaux et les limites variables — le title le dit, et le panneau
           SE TAIT quand la carte ne sait pas. -->
      <p class="bg-limite-vitesse" hidden role="status"
        title="Vitesse limite cartographiée (OpenStreetMap) — travaux et limites variables non connus"
        aria-label="Vitesse limite cartographiée">
        <span class="bg-limite-nombre">50</span></p>
      <!-- LE PANNEAU DU COPILOTE — au-dessus du bandeau, pour le PASSAGER :
           consulter et préparer pendant que le conducteur conduit. Rien n'y
           part tout seul sur le réseau : commodités et météo sont des
           boutons. -->
      <section class="bg-copilote" role="region" aria-label="Panneau du copilote" hidden>
        <div class="bg-copilote-tete">
          <p class="bg-copilote-titre">Copilote</p>
          <button type="button" class="bg-copilote-fermer" aria-label="Fermer le panneau du copilote">✕</button>
        </div>
        <p class="bg-copilote-note">Pour le passager — le conducteur garde les
          yeux sur la route.</p>
        <!-- CE QUE L'APPLICATION NE FAIT PAS, ET CE QUE LES COULEURS DISENT :
             deux textes qui expliquent au lieu d'occuper la route. Ils
             vivaient dans la barre du bas, qu'Armelin voulait minimale
             (29/08) — ils sont ici, à leur place : on les lit à l'arrêt ou en
             passager, jamais au volant. -->
        <p class="bg-limite">Suivi d’itinéraire, pas navigation guidée :
          aucune voix — mais si vous quittez la route, l’itinéraire se
          recalcule tout seul.</p>
        <p class="bg-legende-frise">Barre du trajet, à droite : vert = aucun
          incident signalé, orange = ralentissement annoncé, rouge = bouchon,
          accident ou route coupée. Seuls les arrêts de recharge planifiés y
          portent une pastille.</p>
        <div class="bg-copilote-corps"></div>
      </section>
      <!-- LA FRISE DU TRAJET — la « barre verticale » du mandat du 28/08,
           rendue avec ce que la donnée PERMET : des ÉVÉNEMENTS ponctuels
           (arrêts de recharge, Bison Futé), jamais une fluidité en dégradé
           que Bison Futé ne publie pas. Décorative au sens strict : tout ce
           qu'elle montre est déjà DIT en texte dans le bandeau (prochain
           arrêt, prochain événement) — d'où aria-hidden. -->
      <div class="bg-frise" aria-hidden="true" hidden></div>`;
    /* CE QUE LE BANDEAU MESURE, IL LE PUBLIE (GUID-2, 29/08 — Armelin :
       « cette barre masque de suite les boutons de navigation de zoom et de
       géolocalisation à droite »). Sa hauteur varie avec ce qu'il annonce
       (alerte, arrêt, réduit ou non) : la coder en dur redonnerait le même
       recouvrement au premier message. Les commandes de vue et
       l'attribution IGN se dégagent d'autant — voir carte.css. Même
       mécanique que --attribution-sommet et --hauteur-entete. */
    const carte = this.querySelector('.bg') as HTMLElement;
    const publierHauteur = (): void => {
      const h = this.hidden ? 0 : Math.round(carte.getBoundingClientRect().height);
      document.documentElement.style.setProperty('--hauteur-bandeau', `${h}px`);
    };
    new ResizeObserver(publierHauteur).observe(carte);
    this.#publierHauteur = publierHauteur;

    this.querySelector('.bg-arreter')?.addEventListener('click', () => { this.arreter(); });
    /* LE BOUTON NE PARAÎT QUE SI L'APPAREIL SAIT PARLER : proposer une voix
       qui n'existe pas est une promesse qu'on ne tient pas. */
    const bVoix = this.querySelector<HTMLButtonElement>('.bg-voix');
    if (bVoix && Voix.disponible) {
      bVoix.hidden = false;
      bVoix.addEventListener('click', () => {
        this.#reglerVoix(!this.#parle);
        void ecrirePreference(PREF_VOIX, this.#parle);
        /* ON RÉPOND TOUT DE SUITE, ET C'EST DEUX FOIS NÉCESSAIRE. D'abord
           parce qu'on ne sait pas si la voix marche avant le premier virage
           — le pire moment pour le découvrir ; les navigateurs exigent
           d'ailleurs un geste d'usager avant de laisser une page parler.
           Ensuite parce que l'annonce suivante attendrait le prochain fixe
           GPS, qui peut ne jamais venir à l'arrêt.
           ANNONCER VAUT MIEUX QUE SE PRÉSENTER : s'il y a une manœuvre à
           dire, on la dit — c'est une démonstration ET une information. La
           phrase de présentation ne sert que s'il n'y a rien à annoncer. */
        if (this.#parle) {
          this.#aParle = false;
          if (this.#derniersCoords) this.#majPosition(this.#derniersCoords);
          if (!this.#aParle) this.#voix.dire('Guidage vocal activé');
        }
      });
    }
    /* LE BIS SE DEMANDE D'ICI, IL SE CALCULE AILLEURS : la barre sait où
       l'on est et où l'on va, le planificateur sait calculer. Elle passe
       donc la position et le cap, et attend la réponse — même partage des
       rôles que le recalcul hors-route juste au-dessus. */
    this.querySelector('.bg-parking-p')?.addEventListener('click', () => {
      void this.#ouvrirParkings();
    });
    this.querySelector('.bg-bilan-garder')?.addEventListener('click', () => {
      void this.#garderLeTrajet();
    });
    this.querySelector('.bg-bilan-fermer')?.addEventListener('click', () => {
      const boite = this.querySelector<HTMLElement>('.bg-bilan');
      if (boite) boite.hidden = true;
      this.#publierHauteur?.();
    });
    this.querySelector('.bg-a-pied')?.addEventListener('click', () => {
      const c = this.#derniersCoords;
      /* `=== null`, PAS un test de vérité : un libellé VIDE — trajet venu de
         l'URL, adresse sans nom — passait l'affichage (`!== null`) mais
         tombait ici (`!''`). Le bouton se montrait et ne faisait rien : le
         pire des deux mondes, attrapé par un parcours. */
      if (!c || this.#finApied === null) return;
      document.dispatchEvent(new CustomEvent('finir-a-pied', {
        detail: { lon: c.longitude, lat: c.latitude },
      }));
      const b = this.querySelector<HTMLElement>('.bg-a-pied');
      if (b) b.hidden = true;
    });
    this.querySelector('.bg-bis')?.addEventListener('click', () => { this.#lancerBis(); });
    /* Le contournement d'une route bloquée est LE MÊME geste que le bis —
       un second bouton sur le même circuit, jamais un second chemin. */
    this.querySelector('.bg-trafic-eviter')?.addEventListener('click', () => { this.#lancerBis(); });
    /* La réponse revient par le document : le planificateur ne connaît pas
       la barre, et n'a pas à la connaître. */
    document.addEventListener('itineraire-bis-resultat', (e) => {
      this.#direBis((e as CustomEvent<{ message: string }>).detail.message);
    });
    this.querySelector('.bg-recentrer')?.addEventListener('click', () => { this.#recentrer(); });
    this.querySelector('.bg-3d')?.addEventListener('click', () => {
      this.#en3D = !this.#en3D;
      const bouton = this.querySelector('.bg-3d') as HTMLButtonElement;
      bouton.setAttribute('aria-pressed', String(this.#en3D));
      /* L'ICÔNE DIT CE QU'ON OBTIENDRA EN CLIQUANT — la perspective quand on
         est à plat, le plan quand on est incliné. C'est la convention d'un
         bouton « pressoir » : il montre la sortie, pas l'état. */
      bouton.textContent = this.#en3D ? '3D' : '2D';
      bouton.setAttribute('aria-label', this.#en3D
        ? 'Vue en relief. Appuyer pour passer à plat'
        : 'Vue à plat. Appuyer pour passer en relief');
      this.#carte?.easeTo({ pitch: this.#en3D ? PITCH_SUIVI : 0, duration: 400 });
    });

    this.querySelector('.bg-copilote-bouton')?.addEventListener('click', () => {
      this.#copiloteOuvert = !this.#copiloteOuvert;
      const panneau = this.querySelector<HTMLElement>('.bg-copilote');
      if (panneau) panneau.hidden = !this.#copiloteOuvert;
      this.querySelector('.bg-copilote-bouton')
        ?.setAttribute('aria-pressed', String(this.#copiloteOuvert));
      if (this.#copiloteOuvert) this.#majCopilote();
    });
    this.querySelector('.bg-copilote-fermer')?.addEventListener('click', () => {
      this.#copiloteOuvert = false;
      const panneau = this.querySelector<HTMLElement>('.bg-copilote');
      if (panneau) panneau.hidden = true;
      this.querySelector('.bg-copilote-bouton')?.setAttribute('aria-pressed', 'false');
    });
    /* LE DÉPLIAGE — DEUX GESTES, comme Armelin les a décrits (29/08) :
       « soit l'utilisateur scrolle la barre de navigation vers le haut pour
       afficher les options cachées, soit il appuie une fois sur la barre
       pour faire déployer le menu ». Le bouton « Réduire » disparaît : la
       barre est désormais REPLIÉE par défaut, ce qui était l'intention. */
    const deplier = this.querySelector('.bg-deplier') as HTMLButtonElement;
    const basculer = (ouvert?: boolean): void => {
      const etat = ouvert ?? !this.classList.contains('bg-deploye');
      this.classList.toggle('bg-deploye', etat);
      deplier.setAttribute('aria-expanded', String(etat));
        const boutons = this.querySelector('.bg-boutons') as HTMLElement;
      boutons.hidden = !etat;
      /* DÉPLIÉE, ELLE MONTRE CE QU'ELLE RANGEAIT : les annonces au-delà de
         dix kilomètres reprennent leur place, et l'on retrouve le prochain
         arrêt même à deux cents bornes de là. */
      this.classList.toggle('bg-tout-voir', etat);
      /* ET L'ON REJOUE LE DERNIER FIXE : sans cela, ce que le dépliage
         doit révéler n'apparaîtrait qu'au fixe SUIVANT — à l'arrêt, ou
         dans un tunnel, jamais. Le geste doit répondre tout de suite. */
      if (this.#derniersCoords) this.#majPosition(this.#derniersCoords);
      this.#publierHauteur?.();
    };
    deplier.addEventListener('click', () => { basculer(); });
    /* Le glissement : vers le HAUT on ouvre, vers le BAS on referme. Trente
       pixels séparent un geste d'un tremblement de doigt sur une route. */
    let departY: number | null = null;
    deplier.addEventListener('pointerdown', (e) => { departY = e.clientY; });
    deplier.addEventListener('pointerup', (e) => {
      if (departY === null) return;
      const dy = e.clientY - departY;
      departY = null;
      if (dy < -30) basculer(true);
      else if (dy > 30) basculer(false);
    });
  }

  /**
   * Ouvre l'écoute de la boussole — APRÈS un geste, jamais d'office.
   *
   * iOS exige `DeviceOrientationEvent.requestPermission()` dans un geste ;
   * ailleurs, on s'abonne directement. `deviceorientationabsolute` d'abord
   * (Android le réserve aux mesures absolues), `deviceorientation` en repli —
   * `capDeBoussole` refuse de toute façon les alphas relatifs.
   */
  async #ouvrirBoussole(): Promise<void> {
    if (this.#boussole || !('DeviceOrientationEvent' in window)) return;
    const Evt = DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<string>;
    };
    if (typeof Evt.requestPermission === 'function') {
      const reponse = await Evt.requestPermission().catch(() => 'denied');
      // Refusée : la carte s'oriente au cap GPS seul, comme avant — pas d'alerte,
      // rien n'est cassé, une source manque.
      if (reponse !== 'granted') return;
    }
    this.#boussole = new AbortController();
    const relever = (e: DeviceOrientationEvent): void => {
      const cap = capDeBoussole(e as unknown as {
        webkitCompassHeading?: number | undefined;
        alpha: number | null;
        absolute?: boolean | undefined;
      });
      if (cap !== null) this.#capBoussole = cap;
    };
    window.addEventListener('deviceorientationabsolute', relever as EventListener,
      { signal: this.#boussole.signal });
    window.addEventListener('deviceorientation', relever as EventListener,
      { signal: this.#boussole.signal });
  }

  #fermerBoussole(): void {
    this.#boussole?.abort();
    this.#boussole = null;
    this.#capBoussole = null;
  }

  /**
   * Démarre le suivi. Rend `false` si la géolocalisation est indisponible —
   * l'appelant peut alors le dire à sa façon.
   */
  demarrer(o: DemarrageGuidage): boolean {
    this.arreter();
    const bilan = this.querySelector<HTMLElement>('.bg-bilan');
    if (bilan) bilan.hidden = true;
    /* Le cap lissé repart de zéro : celui du trajet précédent orienterait le
       premier fixe du nouveau. Le MODE, lui, tient la session — comme la 3D. */
    this.#capLisse = null;
    if (this.#modeOrientation === 'cap') void this.#ouvrirBoussole();
    if (!('geolocation' in navigator)) {
      this.#alerte('Ce navigateur ne sait pas donner votre position.');
      this.hidden = false;
      this.#publierHauteur?.();
      return false;
    }
    this.#options = o;
    const frise = this.querySelector<HTMLElement>('.bg-frise');
    if (frise) { frise.hidden = true; frise.replaceChildren(); }
    /* Le copilote du trajet précédent ne décrit plus rien : fermé, vidé. */
    this.#copiloteOuvert = false;
    this.#etat = null;
    this.#horsRouteDepuis = null;
    this.#derniersEcarts = [];
    this.#dernierRecalculMs = Number.NEGATIVE_INFINITY;
    this.#avancementMax = 0;
    this.#zoomAvantApproche = null;
    const copilote = this.querySelector<HTMLElement>('.bg-copilote');
    if (copilote) copilote.hidden = true;
    this.querySelector<HTMLElement>('.bg-copilote-corps')?.replaceChildren();
    this.querySelector('.bg-copilote-bouton')?.setAttribute('aria-pressed', 'false');
    this.hidden = false;
    this.#publierHauteur?.();
    this.#alerte('');
    /* ON DÉGAGE LA VUE. Volets refermés, et une classe sur le document qui
       efface ce qui ne sert pas au volant — la recherche d'adresse d'abord,
       qui occupe le tiers de l'en-tête. Ce n'est pas un encombrement
       esthétique : c'est de la route qu'on ne voit pas. Tout revient à
       l'arrêt du suivi. */
    refermerPanneaux(document);
    document.body.classList.add('en-guidage');
    (this.querySelector('.bg-instruction') as HTMLElement).textContent =
      'Recherche de votre position…';
    (this.querySelector('.bg-distance') as HTMLElement).textContent = '';

    this.#veille = navigator.geolocation.watchPosition(
      (p) => {
        this.#numeroFixe += 1;
        /* LE BILAN SE NOURRIT ICI, ET NULLE PART AILLEURS (STATS-1).
           `#majPosition` est rappelée par SIX chemins d'interface — bascule
           de boussole, recentrage, changement de mode — qui REJOUENT le
           dernier fixe. Y accumuler aurait compté un geste d'interface comme
           un instant de trajet, et gonflé la durée de qui tripote ses
           boutons à l'arrêt. Ici, un appel = un fixe du récepteur.
           LA MESURE BRUTE, pas le point aimanté qu'on DESSINE : une
           statistique se fait de ce qu'on a mesuré. */
        const maintenant = Date.now();
        this.#bilan = ajouterFixe(this.#bilan, {
          instant: maintenant,
          vitesse: typeof p.coords.speed === 'number' && Number.isFinite(p.coords.speed)
            ? p.coords.speed : null,
        });
        /* LE RELEVÉ SUIT LE MÊME CHEMIN QUE LE BILAN — ici, où un appel vaut
           un fixe du récepteur, et nulle part ailleurs. */
        if (this.#departMs === null) this.#departMs = maintenant;
        const tMs = maintenant - this.#departMs;
        if (estLHeureDunReleve(this.#dernierReleveMs, tMs)) {
          this.#dernierReleveMs = tMs;
          this.#releves.push({
            tMs,
            vitesseMs: typeof p.coords.speed === 'number' && Number.isFinite(p.coords.speed)
              ? p.coords.speed : null,
            altitudeM: typeof p.coords.altitude === 'number'
              && Number.isFinite(p.coords.altitude) ? p.coords.altitude : null,
            /* LE TRACÉ (HIST-2, 02/09) — le fixe qui donne la vitesse donne
               déjà la position, et on la jetait. Arrondi au mètre : les dix
               décimales du récepteur auraient triplé le poids pour du bruit. */
            lon: Number(p.coords.longitude.toFixed(5)),
            lat: Number(p.coords.latitude.toFixed(5)),
          });
        }
        this.#majPosition(p.coords);
      },
      (e) => {
        /* UN REFUS N'EST PAS UNE PANNE, et les deux se disent différemment :
           l'un se répare en changeant un réglage, l'autre en attendant. */
        this.#alerte(e.code === e.PERMISSION_DENIED
          ? 'Position refusée. Autorisez la géolocalisation pour suivre le trajet.'
          : 'Position indisponible pour le moment. Le suivi reprendra dès qu’elle revient.');
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20_000 },
    );
    // Le suivi qui démarre reprend la caméra, incline la vue si l'usager la
    // veut ainsi — et garde l'écran allumé.
    this.#camera = true;
    if (this.#en3D) this.#carte?.easeTo({ pitch: PITCH_SUIVI, duration: 600 });
    this.#dernierePosition = null;
    /* La forme choisie se relit à chaque départ : elle a pu changer dans la
       page « Mon véhicule » entre deux trajets. Son échec n'empêche rien —
       la flèche par défaut reste. */
    void lirePreference<string>(PREF_CURSEUR)
      .then((f) => { this.#curseur.forme = formeValide(f); })
      .catch(() => { /* rien à dire : la forme par défaut fait le travail */ });
    /* LA VOIX SE PRÉPARE AU DÉMARRAGE, pas au premier virage : le navigateur
       charge ses voix en tâche de fond, et les demander au moment de parler
       revient à ne rien dire de la première manœuvre. */
    this.#annonces.vider();
    this.#voix.preparer();
    /* LA VOIX PARLE PAR DÉFAUT (VOIX-3, 01/09), et c'est un renversement.
       LE TERRAIN. Armelin, après un essai à pied : « pas de guidage vocal. Je
       ne sais pas si c'était parce que j'étais à pied ». Ce n'était pas la
       marche : la voix était MUETTE tant qu'on n'avait pas trouvé son bouton.
       `v === true` — donc muette sans préférence enregistrée.
       POURQUOI CE DÉFAUT ÉTAIT DÉFENDABLE, ET POURQUOI IL NE L'EST PLUS. Les
       navigateurs exigent un geste d'usager avant de laisser une page parler,
       et l'on craignait de promettre une voix qui ne sortirait pas. Mais
       « Démarrer le suivi » EST ce geste : au moment où l'on arrive ici, la
       permission est acquise. Le doute ne coûtait donc rien à personne sauf à
       celui qui roulait en silence.
       ON L'ANNONCE UNE FOIS, ET ON L'ÉCRIT. Le premier trajet dit que la voix
       est là et comment la couper — sans quoi le renversement surprendrait
       autant que le silence. La préférence est alors enregistrée : la phrase
       ne revient pas, et un choix de silence est respecté pour toujours. */
    void lirePreference<boolean>(PREF_VOIX)
      .then((v) => {
        this.#reglerVoix(v !== false);
        if (v === undefined) {
          void ecrirePreference(PREF_VOIX, true);
          this.#voix.dire('Guidage vocal activé.'
            + ' Appuyez sur l’icône de voix pour le couper.');
        }
      })
      .catch(() => {
        /* LE STOCKAGE EN PANNE NE DOIT PAS RENDRE MUET : mieux vaut une voix
           qu'on coupe qu'un silence qu'on ne s'explique pas. */
        this.#reglerVoix(true);
      });
    (this.querySelector('.bg-recentrer') as HTMLElement).hidden = true;
    void this.#prendreVerrou();
    document.addEventListener('visibilitychange', this.#surVisibilite);
    return true;
  }

  /* ---- l'arrivée (ARRIVEE-2, 31/08) ---- */

  /** Vrai une fois le constat prononcé : il ne se répète pas. */
  #arriveDit = false;

  /* LE BILAN S'ACCUMULE PENDANT LE TRAJET (STATS-1) : chaque fixe y entre,
     aucun ne repart ailleurs. */
  #bilan: EtatBilan = nouveauBilan();

  /* LES RELEVÉS RÉGULIERS (STATS-2) : ce qui se MESURE en roulant, sans un
     appel de plus. Trente secondes — 360 points pour trois heures, ~32 Ko.
     Ils ne partent nulle part tant qu'on n'a pas pressé « Enregistrer ». */
  #releves: ReleveTrajet[] = [];

  #departMs: number | null = null;

  #dernierReleveMs: number | null = null;

  #marqueurArrivee: HTMLElement | null = null;

  /**
   * Le constat d'arrivée — au bon moment, du bon côté, avec son animation.
   *
   * VINGT MÈTRES, PAS CINQUANTE : « ça m'indiquait que j'étais arrivé 40 m
   * avant ». Les paliers vocaux PRÉPARENT (« vous arrivez à destination ») ;
   * le constat attend d'être vrai.
   */
  #majArrivee(e: EtatGuidage): void {
    if (this.#arriveDit || e.horsRoute || e.restantM > SEUIL_ARRIVE_M) return;
    this.#arriveDit = true;

    const options = this.#options;
    const dest = options?.destination ?? null;
    const cote = coteDestination(options?.trace ?? [], dest);

    /* LA VOIX — la phrase demandée mot pour mot, une seule fois. Elle passe
       par le même robinet que le reste : coupée, elle se tait. */
    this.#voix.dire(phraseArrivee(cote));

    /* LE CARTOUCHE le dit aussi, côté compris : tout le monde ne roule pas
       avec le son. */
    const instruction = this.querySelector('.bg-cartouche .bg-instruction') as HTMLElement | null;
    if (instruction) {
      instruction.textContent = cote === null
        ? 'Vous êtes arrivé'
        : `Vous êtes arrivé — destination sur votre ${cote}`;
    }
    const distance = this.querySelector('.bg-cartouche .bg-distance') as HTMLElement | null;
    if (distance) distance.textContent = '';

    /* L'ANIMATION (« faire une animation pour illustrer qu'on est arrivé ») :
       un anneau qui pulse sur la destination — sobre, et immobile pour qui
       préfère l'immobile (prefers-reduced-motion, en CSS). */
    const carte = this.#carte;
    const point = dest ?? (() => {
      const fin = options?.trace[options.trace.length - 1];
      return fin ? { lon: fin[0], lat: fin[1] } : null;
    })();
    if (carte && point && this.#marqueurArrivee === null) {
      const boite = document.createElement('div');
      boite.className = 'bg-arrivee-pulse';
      boite.setAttribute('aria-hidden', 'true');
      boite.innerHTML = '<span></span><span></span><b></b>';
      new Marker({ element: boite }).setLngLat([point.lon, point.lat]).addTo(carte);
      this.#marqueurArrivee = boite;
    }

    this.#montrerBilan();
  }

  /* LE BILAN, À L'ARRIVÉE (STATS-1, 01/09).

     CE QU'ON MESURE, ON LE DIT ; CE QU'ON NE MESURE PAS, ON SE TAIT. La
     moyenne manque quand le récepteur n'a jamais donné de vitesse : écrire
     zéro serait un chiffre faux là où l'absence est vraie. Le TEMPS DE
     CHARGE demandé n'y figure pas encore : il ne se mesure pas aux fixes, il
     vient du plan de recharge — le déduire d'un arrêt prendrait une pause
     déjeuner pour une borne. */
  /**
   * Enregistre le trajet qu'on vient de faire — SUR DEMANDE.
   *
   * Rien ne quitte le navigateur : IndexedDB, comme les favoris. Le bouton se
   * désarme après coup pour qu'un double appui ne fasse pas deux entrées.
   */
  async #garderLeTrajet(): Promise<void> {
    const r = resumerBilan(this.#bilan);
    const dit = this.querySelector<HTMLElement>('.bg-bilan-garde');
    const bouton = this.querySelector<HTMLButtonElement>('.bg-bilan-garder');
    if (r === null || this.#departMs === null) return;
    const o = this.#options;
    const premier = this.#releves[0];
    try {
      const liste = await lireHistorique();
      await ecrireHistorique(ajouterTrajet(liste, {
        /* L'IDENTIFIANT EST L'INSTANT DU DÉPART : deux trajets ne partent pas
           à la même milliseconde, et cela évite de dépendre d'un générateur
           d'aléa que les tests devraient alors piloter. */
        id: `t${this.#departMs}`,
        departMs: this.#departMs,
        /* LE TITRE VIENT DE LA DESTINATION QUAND ELLE EST NOMMÉE : c'est le
           seul libellé que le suivi connaît. Le départ, lui, n'est qu'un point
           GPS — l'inventer donnerait un titre faux. */
        titre: titreParDefaut('', o?.destination?.libelle ?? ''),
        resume: r,
        releves: [...this.#releves],
        /* LES DEUX EXTRÉMITÉS, pour pouvoir relancer (HIST-2, 02/09).
           L'ARRIVÉE VIENT DE LA CONSIGNE, avec son nom : c'est elle qu'on
           relancera. LE DÉPART VIENT DU PREMIER RELEVÉ et n'a pas de nom —
           le suivi ne l'a jamais su ; lui en inventer un serait mentir. Il ne
           sert pas au relancement, il sert au tracé qu'on partage. */
        ...(o?.destination
          ? {
            arrivee: {
              lon: o.destination.lon,
              lat: o.destination.lat,
              ...(o.destination.libelle ? { libelle: o.destination.libelle } : {}),
            },
          }
          : {}),
        ...(premier?.lon !== undefined && premier.lat !== undefined
          ? { depart: { lon: premier.lon, lat: premier.lat } }
          : {}),
      }));
      if (dit) {
        dit.textContent = 'Parcours enregistré — retrouvez-le dans « Historique ».';
        dit.hidden = false;
      }
      if (bouton) bouton.disabled = true;
      /* LE RELIEF ET LA TEMPÉRATURE ARRIVENT APRÈS (HIST-3, 02/09), et c'est
         l'ordre qui compte. Les chercher AVANT d'écrire aurait fait attendre
         jusqu'à dix-sept secondes — deux appels réseau, huit secondes de
         délai et une reprise chacun — entre l'appui et la moindre réponse à
         l'écran, avec le risque de tout perdre si l'onglet se ferme
         entre-temps. Le parcours est donc GARDÉ D'ABORD, puis enrichi.
         `void` assumé : l'enrichissement ne doit rien bloquer, et son échec
         laisse un parcours complet de tout le reste. */
      void this.#enrichirLeTrajet(
        `t${this.#departMs}`, [...this.#releves], o?.destination ?? null,
      );
    } catch {
      /* UNE ÉCRITURE QUI ÉCHOUE SE DIT : perdre en silence un parcours que
         l'usager vient de demander à garder serait le pire des deux. */
      if (dit) {
        dit.textContent = 'Impossible d’enregistrer ce parcours sur cet appareil.';
        dit.hidden = false;
      }
    }
  }

  /**
   * Ajoute le relief et la température à un parcours DÉJÀ enregistré (HIST-3).
   *
   * IL TOURNE APRÈS COUP, ET SANS RIEN BLOQUER. Les deux relevés partent sur
   * le réseau ; les attendre avant d'écrire aurait fait patienter jusqu'à
   * dix-sept secondes devant un écran muet, et perdu le parcours si l'onglet
   * s'était fermé.
   *
   * IL RELIT L'HISTORIQUE AVANT D'ÉCRIRE, plutôt que de garder la liste en
   * mémoire : entre l'enregistrement et le retour du réseau, l'usager a pu
   * ouvrir « Historique » et en oublier un. Écraser avec une liste périmée
   * ressusciterait ce qu'il vient de supprimer.
   *
   * ET SI LE PARCOURS N'EST PLUS LÀ, ON NE LE RECRÉE PAS : il a été effacé
   * pendant l'attente, et c'était un geste.
   */
  async #enrichirLeTrajet(
    id: string, releves: readonly ReleveTrajet[],
    destination: PointGeo | null,
  ): Promise<void> {
    /* LES RELEVÉS ET LA DESTINATION SONT PASSÉS, PAS RELUS DANS L'INSTANCE.
       Un nouveau trajet — ou une simple remise à zéro — vide `#releves` et
       `#options` ; le faire au milieu de l'attente réseau aurait fait rendre
       « rien à ajouter » en silence, sur un parcours qu'on venait pourtant de
       mesurer. */
    const [relief, temperatureC] = await Promise.all([
      this.#relierLeTrajet(releves), this.#temperatureALArrivee(destination),
    ]);
    if (relief === null && temperatureC === null) return;
    try {
      const liste = await lireHistorique();
      const i = liste.findIndex((x) => x.id === id);
      if (i < 0) return;
      liste[i] = {
        ...liste[i]!,
        ...(relief ? { relief } : {}),
        ...(temperatureC !== null ? { temperatureC } : {}),
      };
      await ecrireHistorique(liste);
    } catch {
      /* Le parcours reste enregistré sans ces deux champs, et l'historique
         dira « non mesuré » : c'est exactement ce que ces mots servent à
         dire. */
    }
  }

  #montrerBilan(): void {
    /* LE BOUTON REPART ARMÉ À CHAQUE ARRIVÉE, et le mot de confirmation
       s'efface : c'est un nouveau trajet. */
    const bouton = this.querySelector<HTMLButtonElement>('.bg-bilan-garder');
    if (bouton) bouton.disabled = false;
    const dit = this.querySelector<HTMLElement>('.bg-bilan-garde');
    if (dit) { dit.hidden = true; dit.textContent = ''; }
    const boite = this.querySelector<HTMLElement>('.bg-bilan');
    const liste = this.querySelector<HTMLElement>('.bg-bilan-liste');
    if (!boite || !liste) return;
    const r = resumerBilan(this.#bilan);
    if (r === null) return;

    const lignes: [string, string][] = [
      ['Durée du trajet', dureeEnMots(r.dureeMs)],
      ['Vitesse maximale', `${r.vitesseMaxKmh} km/h`],
    ];
    if (r.vitesseMoyenneKmh !== null) {
      lignes.push(['Vitesse moyenne', `${r.vitesseMoyenneKmh} km/h`]);
    }
    lignes.push(['Arrêts', r.arrets === 0
      ? 'aucun'
      : `${r.arrets} (${dureeEnMots(r.arretMs)} à l'arrêt)`]);

    liste.replaceChildren();
    for (const [titre, valeur] of lignes) {
      const dt = document.createElement('dt');
      dt.textContent = titre;
      const dd = document.createElement('dd');
      dd.textContent = valeur;
      liste.append(dt, dd);
    }
    boite.hidden = false;
    this.#publierHauteur?.();
  }

  #retirerMarqueurArrivee(): void {
    this.#marqueurArrivee?.parentElement?.remove();
    this.#marqueurArrivee?.remove();
    this.#marqueurArrivee = null;
  }

  /* ---- la suggestion de parking (PARK-1, 31/08) ---- */

  /** Vrai une fois « Se garer » pressé : la suggestion ne revient pas. */
  #parkingRegle = false;

  #parkings: Parking[] | null = null;

  /* LES PLACES LIBRES DE LA VILLE (PARK-4), gardées comme les parkings : un
     appel par arrivée, pas un par fixe. */
  #placesLibres: ParkingLive[] | null = null;

  /* LA LISTE S'OUVRE D'ELLE-MÊME, UNE FOIS (PARK-2, 01/09). Armelin : « il
     faudrait que les places de parking s'affichent toutes seules à proximité
     de la destination avant même que je clique sur le rond parking. »
     UNE FOIS, ET PAS DAVANTAGE : refermée, la feuille reste fermée — la
     rouvrir à chaque fixe serait un harcèlement, et c'est le bouton qui la
     rappelle. Le drapeau garde aussi l'appel Overpass unique. */
  #parkingsOfferts = false;

  /** Le libellé de la destination d'origine, pour « Finir à pied ». */
  #finApied: string | null = null;

  /** La proposition « Finir à pied » s'arme quand le planificateur le dit. */
  set finApied(libelle: string | null) { this.#finApied = libelle; }

  /**
   * Montre ou cache le bouton P — à l'approche, avec hystérésis.
   *
   * MILLE DEUX CENTS MÈTRES : assez tôt pour choisir un parking avant d'être
   * dessus, assez tard pour ne pas encombrer tout le trajet. L'hystérésis
   * évite le clignotement quand on serpente autour du seuil.
   */
  #majParking(e: EtatGuidage): void {
    const bouton = this.querySelector<HTMLElement>('.bg-parking-p');
    if (!bouton) return;
    if (this.#parkingRegle || e.horsRoute) { bouton.hidden = true; }
    else if (e.restantM < 1_200) {
      bouton.hidden = false;
      /* ET LA LISTE SE MONTRE SANS QU'ON LA DEMANDE, à la première approche.
         L'APPEL RESTE UNIQUE : c'est exactement celui que le clic aurait fait,
         et `#parkings` le garde en mémoire pour le reste du trajet — Overpass
         est tenu par des bénévoles. */
      if (!this.#parkingsOfferts) {
        this.#parkingsOfferts = true;
        void this.#ouvrirParkings();
      }
    } else if (e.restantM > 1_500) {
      bouton.hidden = true;
      this.#fermerParkings();
      /* AU-DELÀ DE 1,5 km ON REPART À ZÉRO : un détour qui éloigne puis
         rapproche mérite une nouvelle proposition — c'est une arrivée
         différente. */
      this.#parkingsOfferts = false;
    }

    /* FINIR À PIED (point 9) : le trajet vers le parking touche à sa fin —
       on PROPOSE de basculer piéton vers la destination d'origine. On
       propose seulement : certains repartent, d'autres attendent. */
    const aPied = this.querySelector<HTMLElement>('.bg-a-pied');
    if (aPied && this.#finApied !== null
      && e.restantM < 90 && aPied.hidden && !e.horsRoute) {
      aPied.textContent = this.#finApied === ''
        ? 'Finir à pied vers votre destination'
        : `Finir à pied vers ${this.#finApied}`;
      aPied.hidden = false;
    }
  }

  /**
   * Avertit d'un passage trop limité pour le véhicule (PONT-1, 02/09).
   *
   * Armelin : « ma VF8 pèse 2 520 kg et peut être dangereuse sur certains
   * ponts de France […] cela permettrait au GPS d'éviter de faire passer par
   * des voies interdites au véhicule configuré dans le profil. »
   *
   * ON AVERTIT, ON N'ÉVITE PAS — et la nuance est honnête : le service public
   * d'itinéraire n'accepte aucun paramètre de poids, on ne peut donc pas lui
   * demander de contourner. Ce qu'on peut faire, c'est le DIRE assez tôt pour
   * qu'un conducteur décide lui-même.
   *
   * MILLE MÈTRES : de quoi s'arrêter ou tourner avant l'ouvrage. Plus tôt, on
   * annoncerait un pont qu'on ne prendra peut-être jamais ; plus tard, on
   * annoncerait devant le panneau.
   *
   * UNE FOIS PAR PASSAGE : `#tonnagesDits` retient ceux qu'on a nommés. Une
   * alerte répétée à chaque fixe cesse d'alerter.
   */
  #majTonnage(e: EtatGuidage): void {
    if (this.#masseKg === null || e.horsRoute) return;
    const interdits = tonnagesInterdits(this.#tonnages, this.#masseKg);
    for (const l of interdits) {
      const devant = l.debutM - e.avancementM;
      if (devant < 0 || devant > 1_000) continue;
      if (this.#tonnagesDits.has(l.debutM)) continue;
      this.#tonnagesDits.add(l.debutM);
      const phrase = phraseTonnage(l, this.#masseKg);
      this.#alerte(phrase);
      /* ET ON LE DIT À VOIX HAUTE : c'est une information de sécurité, pas un
         agrément — celui qui roule ne lit pas l'écran. */
      if (this.#parle) this.#voix.dire(phrase);
      return;
    }
  }

  /**
   * Annonce l'entrée sur une section où l'interfile est permise (MOTO-1).
   *
   * ELLE NE SE DIT QU'À QUI ROULE EN DEUX-ROUES, et une seule fois par
   * section : `#interfilesDites` retient celles qu'on a nommées. Une alerte
   * répétée à chaque fixe cesse d'alerter — c'est la leçon des tonnages.
   *
   * TROIS CENTS MÈTRES AVANT, et non mille comme un pont : un pont se
   * contourne et demande une décision anticipée ; une section d'interfile se
   * prend ou non sur place, et l'annoncer un kilomètre trop tôt la ferait
   * oublier avant d'y être.
   *
   * ELLE NE SE DIT PAS À VOIX HAUTE. C'est une information de contexte, pas
   * de sécurité — contrairement à un pont limité à deux tonnes sous un
   * véhicule qui en pèse deux et demie. Une voix qui parle d'interfile
   * pendant qu'on remonte les files ferait exactement ce qu'il ne faut pas :
   * détourner l'attention au pire moment.
   */
  #majInterfile(e: EtatGuidage): void {
    if (!this.#moto || e.horsRoute) return;
    for (const s of this.#interfiles) {
      const devant = s.debutM - e.avancementM;
      if (devant < 0 || devant > 300) continue;
      if (this.#interfilesDites.has(s.debutM)) continue;
      this.#interfilesDites.add(s.debutM);
      this.#alerte(phraseInterfile(s));
      return;
    }
  }

  /**
   * Le dénivelé du parcours qu'on vient de faire (HIST-3, 02/09).
   *
   * DEUX SOURCES, ET LA GRATUITE D'ABORD. Quand le récepteur a donné des
   * altitudes sur au moins la moitié des relevés, on les lit : zéro appel, et
   * ce sont les altitudes RÉELLEMENT parcourues. Sinon — c'est le cas sur
   * beaucoup de téléphones, et c'est pour cela qu'Armelin notait le manque —
   * on demande le profil au service d'altimétrie de la Géoplateforme, UNE
   * fois, sur le tracé relevé.
   *
   * UN SEUL APPEL, ET AU MOMENT OÙ L'USAGER LE DEMANDE. Pas pendant la
   * conduite : interroger un service toutes les trente secondes en roulant
   * est exactement ce que la frugalité du projet refuse, et ce que le
   * commentaire de `PAS_RELEVE_MS` disait déjà.
   *
   * L'ÉCHEC EST MUET ET BÉNIN : le champ reste absent, l'historique dit « non
   * mesuré », et le parcours s'enregistre quand même.
   */
  async #relierLeTrajet(
    releves: readonly ReleveTrajet[],
  ): Promise<ReliefTrajet | null> {
    const duGps = reliefDesReleves(releves);
    if (duGps !== null) return duGps;
    const trace = releves
      .filter((r) => typeof r.lon === 'number' && typeof r.lat === 'number')
      .map((r) => [r.lon!, r.lat!] as [number, number]);
    if (trace.length < 2) return null;
    try {
      const profil = await profilItineraire({ type: 'LineString', coordinates: trace });
      const d = denivele(profil);
      return {
        monteeM: Math.round(d.montee), descenteM: Math.round(d.descente), source: 'ign',
      };
    } catch {
      return null;
    }
  }

  /**
   * La température à l'arrivée (HIST-3, 02/09).
   *
   * POURQUOI ELLE COMPTE, ET POURQUOI ELLE EST DEMANDÉE ICI. C'est elle qui
   * explique l'écart entre deux passages sur le même trajet : une
   * consommation qui monte de 20 % un matin de janvier n'a rien d'un mystère
   * quand l'historique dit −3 °C. Sans elle, la comparaison montrait des
   * écarts sans jamais en donner la cause.
   *
   * UN APPEL, À L'ENREGISTREMENT — pas un relevé par demi-minute pendant la
   * route. Le point interrogé est l'arrivée, celle que le copilote
   * interrogeait déjà pendant le trajet : aucune coordonnée nouvelle ne part.
   *
   * L'ÉCHEC EST MUET : le champ reste absent, et l'historique dit « non
   * relevée ».
   */
  async #temperatureALArrivee(d: PointGeo | null): Promise<number | null> {
    if (!d) return null;
    try {
      const m = await meteoA(d.lon, d.lat, new Date());
      return Number.isFinite(m.temperature) ? m.temperature : null;
    } catch {
      return null;
    }
  }

  /** Ouvre la feuille des parkings — UNE requête Overpass, au clic. */
  async #ouvrirParkings(): Promise<void> {
    const feuille = this.querySelector<HTMLElement>('.bg-parkings');
    const liste = this.querySelector<HTMLElement>('.bg-parkings-liste');
    const etat = this.querySelector<HTMLElement>('.bg-parkings-etat');
    if (!feuille || !liste || !etat) return;
    if (!feuille.hidden) { this.#fermerParkings(); return; }
    feuille.hidden = false;

    /* AUTOUR DE LA DESTINATION DEMANDÉE, pas de la fin du tracé : le tracé
       s'arrête sur la route, la destination est l'adresse. Sans destination
       transmise, la fin du tracé reste un pis-aller honnête. */
    const options = this.#options;
    const fin = options?.trace[options.trace.length - 1];
    const dest = options?.destination
      ?? (fin ? { lon: fin[0], lat: fin[1] } : null);
    if (!dest) { etat.textContent = 'Destination inconnue.'; return; }

    if (this.#parkings === null) {
      etat.textContent = 'Recherche des parkings publics…';
      try {
        this.#parkings = await chargerParkings(dest);
      } catch (err) {
        etat.textContent = err instanceof ErreurParkings
          ? err.message : 'La recherche de parkings est indisponible.';
        return;
      }
    }
    /* LES PLACES LIBRES, QUAND LA VILLE LES PUBLIE (PARK-4, 02/09).
       Armelin : « ce serait bien d'intégrer la disponibilité des parkings en
       codant les API libres et sans clé […] pour qu'il ne galère pas à
       stationner ».
       UN APPEL DE PLUS, ET SEULEMENT SI UNE SOURCE COUVRE L'ARRIVÉE :
       `sourcePour` répond non pour l'immense majorité des destinations, et
       l'on ne dérange alors personne. Il part EN MÊME TEMPS que rien du tout —
       la liste cartographiée est déjà là. */
    if (this.#placesLibres === null && sourcePour(dest) !== null) {
      try {
        this.#placesLibres = await chercherPlacesLibres(dest);
      } catch {
        /* UNE VILLE QUI NE RÉPOND PAS N'EFFACE PAS LES PARKINGS CONNUS : on
           retombe sur la liste cartographiée, qui vaut sans elle. */
        this.#placesLibres = [];
      }
    }
    const parkings = this.#parkings;
    liste.replaceChildren();
    if (parkings.length === 0) {
      etat.textContent = 'Aucun parking public cartographié à moins de 600 m'
        + ' de la destination (source OpenStreetMap).';
      return;
    }
    /* « PLACES », JAMAIS « PLACES LIBRES » : la capacité est cartographiée,
       la disponibilité ne l'est pas — aucune source nationale gratuite et
       sans clé ne l'expose. Un mot juste vaut mieux qu'une promesse
       fausse. */
    const live = this.#placesLibres ?? [];
    /* LA PHRASE CHANGE QUAND ON SAIT VRAIMENT (PARK-4) : dire « pas les places
       libres » alors qu'on vient de les afficher serait faux dans l'autre
       sens. Elle nomme la collectivité — on cite toujours qui publie. */
    etat.textContent = live.length > 0
      ? `Du plus près au plus loin de votre destination — la fin se fera à`
        + ` pied. Places libres publiées par ${live[0]!.source}.`
      : 'Du plus près au plus loin de votre destination — la'
        + ' fin se fera à pied. Capacité OpenStreetMap, pas les places libres.';

    /* LES PARKINGS AVEC PLACES LIBRES PASSENT DEVANT : c'est l'information
       qu'on cherche en arrivant, et elle vaut mieux qu'une capacité. */
    for (const p of live) {
      const item = document.createElement('li');
      item.className = 'bg-parking-live';
      const infos = document.createElement('span');
      infos.className = 'bg-parking-infos';
      const nom = document.createElement('strong');
      nom.textContent = p.nom;
      const detail = document.createElement('span');
      const age = Math.max(0, Math.round((Date.now() - p.instant) / 60_000));
      detail.textContent = `${libellePlaces(p)} · relevé il y a ${age} min`;
      /* COMPLET SE VOIT : c'est la seule ligne qui doit décourager d'y aller,
         et elle se lit sans la couleur — le mot « complet » y est écrit. */
      if (p.libres <= 0) item.dataset['complet'] = 'oui';
      infos.append(nom, detail);
      const garer = document.createElement('button');
      garer.type = 'button';
      garer.className = 'bg-parking-garer';
      garer.textContent = 'Se garer';
      garer.setAttribute('aria-label', `Se garer à ${p.nom}`);
      garer.addEventListener('click', () => {
        this.#parkingRegle = true;
        this.#fermerParkings();
        const b = this.querySelector<HTMLElement>('.bg-parking-p');
        if (b) b.hidden = true;
        const ici = this.#derniersCoords;
        document.dispatchEvent(new CustomEvent('se-garer', {
          detail: {
            lon: p.lon, lat: p.lat, nom: p.nom,
            position: ici ? { lon: ici.longitude, lat: ici.latitude } : null,
          },
        }));
      });
      item.append(infos, garer);
      liste.append(item);
    }

    for (const p of parkings) {
      const item = document.createElement('li');
      const infos = document.createElement('span');
      infos.className = 'bg-parking-infos';
      const nom = document.createElement('strong');
      nom.textContent = p.nom ?? 'Parking';
      const detail = document.createElement('span');
      const morceaux = [`à ${formaterDistance(p.distanceM)}`];
      if (p.places !== null) morceaux.push(`${p.places} places`);
      if (p.payant === true) morceaux.push('payant');
      if (p.payant === false) morceaux.push('gratuit');
      detail.textContent = morceaux.join(' · ');
      infos.append(nom, detail);
      const garer = document.createElement('button');
      garer.type = 'button';
      garer.className = 'bg-parking-garer';
      garer.textContent = 'Se garer';
      garer.setAttribute('aria-label', `Se garer à ${p.nom ?? 'ce parking'}`);
      garer.addEventListener('click', () => {
        this.#parkingRegle = true;
        this.#fermerParkings();
        const b = this.querySelector<HTMLElement>('.bg-parking-p');
        if (b) b.hidden = true;
        /* LA POSITION VOYAGE AVEC LA DEMANDE, comme pour le bis : le
           planificateur recalcule DEPUIS ICI, pas depuis le départ
           d'origine. */
        const ici = this.#derniersCoords;
        document.dispatchEvent(new CustomEvent('se-garer', {
          detail: {
            lon: p.lon, lat: p.lat, nom: p.nom ?? 'Parking',
            position: ici ? { lon: ici.longitude, lat: ici.latitude } : null,
          },
        }));
      });
      item.append(infos, garer);
      liste.append(item);
    }
    this.#poserParkingsSurCarte(parkings);
  }

  #fermerParkings(): void {
    const feuille = this.querySelector<HTMLElement>('.bg-parkings');
    if (feuille) feuille.hidden = true;
    this.#retirerParkingsDeCarte();
  }

  /**
   * Les grands P sur la carte — « un logo P assez grand à proximité de la
   * destination pour visualiser les parkings disponibles aux alentours ».
   * La pastille est CELLE des lieux : un seul langage de dessin.
   */
  #poserParkingsSurCarte(parkings: readonly Parking[]): void {
    const carte = this.#carte;
    if (!carte) return;
    try {
      const cle = cleImage('parking', '#2272C4');
      if (!carte.hasImage(cle)) {
        const image = imagePastille('parking', '#2272C4');
        if (image) carte.addImage(cle, image, { pixelRatio: RAPPORT_PASTILLE });
      }
      const donnees = {
        type: 'FeatureCollection' as const,
        features: parkings.map((p) => ({
          type: 'Feature' as const,
          properties: { nom: p.nom ?? 'Parking' },
          geometry: { type: 'Point' as const, coordinates: [p.lon, p.lat] },
        })),
      };
      const source = carte.getSource('bg-parkings') as GeoJSONSource | undefined;
      if (source) { source.setData(donnees); return; }
      carte.addSource('bg-parkings', { type: 'geojson', data: donnees });
      carte.addLayer({
        id: 'bg-parkings', type: 'symbol', source: 'bg-parkings',
        layout: {
          'icon-image': cle,
          /* « Assez grand » : plus gros que les pastilles de lieux — une
             suggestion active, pas un point d'inventaire. */
          'icon-size': 1.05,
          'icon-allow-overlap': true,
        },
      });
    } catch { /* style en chargement : la liste reste, la carte suivra */ }
  }

  #retirerParkingsDeCarte(): void {
    const carte = this.#carte;
    if (!carte) return;
    try {
      if (carte.getLayer('bg-parkings')) carte.removeLayer('bg-parkings');
      if (carte.getSource('bg-parkings')) carte.removeSource('bg-parkings');
    } catch { /* déjà retirés */ }
  }

  arreter(): void {
    this.#arriveDit = false;
    /* LE BILAN NE SURVIT PAS AU SUIVI : gardé, il mêlerait le trajet suivant
       au précédent. Il reste À L'ÉCRAN si l'arrivée vient de l'afficher —
       c'est `demarrer` qui le referme, pas `arreter`. */
    this.#bilan = nouveauBilan();
    this.#releves = [];
    this.#departMs = null;
    this.#dernierReleveMs = null;
    this.#retirerMarqueurArrivee();
    this.#parkings = null;
    this.#placesLibres = null;
    this.#tonnages = [];
    this.#tonnagesDits.clear();
    this.#interfiles = [];
    this.#interfilesDites.clear();
    this.#parkingRegle = false;
    this.#parkingsOfferts = false;
    this.#fermerParkings();
    const boutonP = this.querySelector<HTMLElement>('.bg-parking-p');
    if (boutonP) boutonP.hidden = true;
    const aPied = this.querySelector<HTMLElement>('.bg-a-pied');
    if (aPied) aPied.hidden = true;
    this.#fermerBoussole();
    /* ON SE TAIT AVANT TOUT LE RESTE : une phrase qui continue après l'arrêt
       du suivi annoncerait un virage qu'on ne prend plus. */
    this.#voix.taire();
    this.#annonces.vider();
    this.#curseur.retirer();
    if (this.#veille !== null) {
      navigator.geolocation.clearWatch(this.#veille);
      this.#veille = null;
    }
    this.#options = null;
    this.hidden = true;
    this.#publierHauteur?.();
    clearTimeout(this.#reprise);
    (this.querySelector('.bg-recentrer') as HTMLElement | null)?.setAttribute('hidden', '');
    (this.querySelector('.bg-vitesse') as HTMLElement | null)?.setAttribute('hidden', '');
    (this.querySelector('.bg-limite-vitesse') as HTMLElement | null)?.setAttribute('hidden', '');
    /* LE NORD REVIENT EN HAUT : la carte orientée au cap n'a de sens qu'en
       suivi — la laisser tournée après l'arrêt désoriente la consultation. */
    /* …ET LA CARTE SE REDRESSE : l'inclinaison n'a de sens qu'en suivi. */
    const pitch = this.#carte?.getPitch() ?? 0;
    if (this.#veilleAvaitTourne || pitch > 0) {
      this.#carte?.easeTo({ bearing: 0, pitch: 0, duration: 500 });
      this.#veilleAvaitTourne = false;
    }
    document.removeEventListener('visibilitychange', this.#surVisibilite);
    /* LE VERROU D'ÉCRAN SE REND À L'ARRÊT : le garder viderait la batterie de
       celui qui est arrivé — le même devoir que le clearWatch ci-dessus. */
    void this.#verrouEcran?.release().catch(() => { /* déjà tombé : rien à faire */ });
    this.#verrouEcran = null;
    document.body.classList.remove('en-guidage');
    this.dispatchEvent(new CustomEvent('guidage-arrete', { bubbles: true }));
  }

  /* ---- la caméra appartient à l'usager ---- */

  #suspendreCamera(): void {
    this.#camera = false;
    (this.querySelector('.bg-recentrer') as HTMLElement).hidden = false;
    /* CHAQUE GESTE REPOUSSE LA REPRISE : tant qu'on explore la carte, elle
       reste à nous ; vingt secondes d'immobilité, et le suivi la reprend. */
    clearTimeout(this.#reprise);
    this.#reprise = setTimeout(() => { this.#recentrer(); }, REPRISE_CAMERA_MS);
  }

  #recentrer(): void {
    clearTimeout(this.#reprise);
    this.#camera = true;
    (this.querySelector('.bg-recentrer') as HTMLElement).hidden = true;
    const p = this.#dernierePosition;
    if (p && this.#carte) {
      this.#carte.easeTo({
        center: p,
        zoom: Math.max(this.#carte.getZoom(), ZOOM_SUIVI),
        /* LE CAP FAIT PARTIE DU CADRAGE, ET IL SE NOMME DANS LES DEUX
           MODES. `easeTo` tient ce qu'il ne nomme pas : ne rien dire du cap
           revenait à FIGER la rotation en cours. En mode nord, cela laissait
           la carte de travers ; en mode cap, cela annulait le retour au sens
           de la voiture qu'on venait de demander — le second défaut du
           « ça ne fonctionne pas » d'Armelin, trouvé en mesurant le cap
           après deux clics sans nouveau fixe GPS. */
        bearing: this.#modeOrientation === 'nord'
          ? 0 : (this.#capLisse ?? this.#dernierCapConnu ?? this.#carte?.getBearing() ?? 0),
        duration: 600,
      });
    }
  }

  async #prendreVerrou(): Promise<void> {
    if (!this.actif || document.visibilityState !== 'visible') return;
    const n = navigator as Navigator & {
      wakeLock?: { request(type: 'screen'): Promise<VerrouEcran> };
    };
    if (!n.wakeLock) return;
    try {
      this.#verrouEcran = await n.wakeLock.request('screen');
    } catch {
      /* Refusé (économie d'énergie, batterie faible) : bénin — l'écran suit
         alors le réglage du téléphone, exactement comme avant ce verrou. */
    }
  }

  /* CE QUE LE BIS RÉPOND, ET COMBIEN DE TEMPS. Neuf secondes : le temps de
     lire une phrase au volant sans que la barre reste encombrée d'un message
     périmé. Un message vide range la ligne tout de suite. */
  #minuteurBis: ReturnType<typeof setTimeout> | undefined;

  #direBis(message: string): void {
    const p = this.querySelector('.bg-bis-mot') as HTMLElement | null;
    if (!p) return;
    p.textContent = message;
    p.hidden = message === '';
    clearTimeout(this.#minuteurBis);
    if (message !== '') {
      this.#minuteurBis = setTimeout(() => { this.#direBis(''); }, 9_000);
    }
  }

  /**
   * La chaussée et le côté où se placer (VOIE-1, 30/08).
   *
   * QUATRE CONDITIONS, ET AUCUNE N'EST DÉCORATIVE : on est sur la route, la
   * manœuvre a un côté (tout droit n'en a pas), elle est ASSEZ PROCHE pour
   * qu'un changement de file ait du sens, et la chaussée porte au moins deux
   * voies. Il en manque une, la chaussée disparaît — elle ne reste pas à
   * l'écran à conseiller un placement pour une sortie déjà passée.
   */
  #majVoies(e: EtatGuidage): void {
    const boite = this.querySelector('.bg-chaussee') as HTMLElement | null;
    if (!boite) return;
    const manoeuvre = e.manoeuvre?.manoeuvre ?? 'straight';
    const trop = e.horsRoute || e.jusquALaManoeuvreM > SEUIL_VOIES_M;

    /* D'ABORD CE QU'ON SAIT, ENSUITE CE QU'ON DÉDUIT (AFFECT-1, 30/08).
       L'affectation par voie dit ce que CHAQUE voie autorise — c'est le vrai
       panneau. Elle ne couvre que 29 % des manœuvres (mesuré le 30/08) :
       ailleurs, on retombe sur le conseil de placement, qui déduit un côté
       de la manœuvre. Deux niveaux d'information, jamais mélangés. */
    const affectation = trop ? null : affectationA(this.#affectations, e.avancementM);
    const retenues = affectation ? voiesPour(affectation, manoeuvre) : [];
    if (affectation && retenues.length > 0) {
      this.#poserFiles(boite, affectation, retenues);
      return;
    }

    /* PLUS DE REPLI EN BARRES MUETTES (TERRAIN-1, 30/08). Armelin, au
       volant : « j'ai eu des panneaux blancs avec des petits rectangles gris
       et noirs. Je n'ai pas du tout compris à quoi ils servaient. Si
       l'information n'est pas compréhensible du premier coup, elle devient
       inutile à afficher. » Il a raison, et c'est la conclusion honnête : un
       rectangle un peu plus clair que ses voisins ne dit pas « mettez-vous à
       droite ». Le CONSEIL de placement reste — il se dit à voix haute et se
       lit dans l'arbre d'accessibilité — mais il ne se DESSINE plus. On ne
       montre que la chaussée fléchée, qui se lit sans mode d'emploi. */
    const cote = trop ? null : cotePlacement(manoeuvre);
    const voies = trop ? null : voiesA(this.#voies, e.avancementM);
    const conseillee = voies === null ? null : voieConseillee(voies, cote);
    boite.hidden = true;
    boite.replaceChildren();
    delete boite.dataset['etat'];
    if (voies !== null && conseillee !== null) {
      /* Il reste DIT, pour qui écoute la page : la voix et le lecteur
         d'écran gardent l'information que l'œil ne savait pas lire. */
      boite.setAttribute('aria-label', libellePlacement(voies, conseillee));
    }
  }

  /**
   * Les files avec leurs flèches — le vrai panneau d'affectation (AFFECT-1).
   *
   * CHAQUE VOIE PORTE CE QU'ELLE AUTORISE, et celles qui servent la manœuvre
   * restent en clair pendant que les autres s'éteignent. C'est ce que
   * montrent les GPS du commerce, et cette fois la donnée le permet : elle
   * vient de `turn:lanes`, le marquage relevé par OpenStreetMap — pas d'une
   * déduction.
   */
  #poserFiles(boite: HTMLElement, voies: Affectation, retenues: readonly number[]): void {
    const signature = `affecte-${voies.map((v) => v.join('+')).join('|')}-${retenues.join(',')}`;
    if (boite.dataset['etat'] === signature) return;
    boite.dataset['etat'] = signature;
    boite.hidden = false;
    boite.setAttribute('aria-label', libelleAffectation(voies, retenues));
    boite.replaceChildren(...voies.map((mouvements, i) => {
      const file = document.createElement('span');
      file.className = 'bg-file bg-file-fleches';
      file.setAttribute('aria-hidden', 'true');
      if (retenues.includes(i + 1)) file.dataset['conseillee'] = 'oui';
      /* UNE VOIE NON PEINTE RESTE UNE VOIE : on dessine alors la flèche
         droite, qui est ce qu'elle autorise en pratique — la règle du
         marquage français veut qu'une voie qui tourne soit fléchée. */
      const dessins = mouvements.length === 0 ? ['through'] : mouvements;
      file.innerHTML = dessins.map(flecheDeVoie).join('');
      return file;
    }));
  }

  /**
   * Le cartouche vert européen (EURO-1, 30/08).
   *
   * IL SE LIT LÀ OÙ L'ON VA, comme l'écusson national qu'il accompagne : le
   * panneau annonce la route qu'on PREND, pas celle qu'on quitte. On lit
   * donc les relevés cinquante mètres après la manœuvre — de quoi être sur
   * le tronçon suivant sans dépasser le premier.
   *
   * DEUX AU PLUS, et c'est une contrainte de place : le panneau fait trois
   * cents pixels de large et porte déjà une instruction, une distance et un
   * cartouche national. Les tronçons à trois routes européennes existent,
   * mais les afficher réduirait l'instruction — qui, elle, est vitale.
   */
  #majEurope(e: EtatGuidage): void {
    const boite = this.querySelector('.bg-europe') as HTMLElement | null;
    if (!boite) return;
    const routes = e.horsRoute ? []
      : europeA(this.#europe, e.avancementM + e.jusquALaManoeuvreM + 50).slice(0, 2);
    if (routes.length === 0) {
      boite.hidden = true;
      boite.replaceChildren();
      delete boite.dataset['etat'];
      return;
    }
    const signature = routes.join('/');
    if (boite.dataset['etat'] === signature) return;
    boite.dataset['etat'] = signature;
    boite.hidden = false;
    boite.replaceChildren(...routes.map((r) => {
      const chip = document.createElement('b');
      chip.className = 'bg-ecusson-europe';
      chip.textContent = r;
      /* IL SE DIT EN TOUTES LETTRES : « E15 » lu caractère par caractère ne
         s'entend pas comme une route. */
      chip.setAttribute('aria-label', `route européenne ${r}`);
      return chip;
    }));
  }

  /**
   * Le numéro de sortie et les villes desservies (SORTIE-1, 30/08).
   *
   * LES DEUX SE LISENT AU POINT DE MANŒUVRE, chacun à sa façon : le nœud de
   * divergence est POSÉ dessus (fenêtre symétrique), la bretelle COMMENCE
   * dessus (fenêtre vers l'avant). Ce sont deux objets d'OpenStreetMap, pas
   * deux vues du même.
   *
   * ILS NE PARAISSENT QU'À L'APPROCHE, comme la chaussée : un numéro de
   * sortie affiché trente kilomètres avant n'aide personne et occupe la
   * place de ce qui est vital.
   */
  #majSortie(e: EtatGuidage): void {
    const chip = this.querySelector('.bg-sortie') as HTMLElement | null;
    const ligne = this.querySelector('.bg-destination') as HTMLElement | null;
    if (!chip || !ligne) return;
    const proche = !e.horsRoute && e.jusquALaManoeuvreM <= SEUIL_VOIES_M;
    const point = e.avancementM + e.jusquALaManoeuvreM;

    const sortie = proche ? sortieA(this.#sorties, point) : null;
    const numero = sortie?.numero ?? null;
    if (numero === null) {
      chip.hidden = true;
      chip.textContent = '';
    } else if (chip.textContent !== `Sortie ${numero}`) {
      chip.hidden = false;
      chip.textContent = `Sortie ${numero}`;
      chip.setAttribute('aria-label', `sortie numéro ${numero}`);
    }

    /* LES VILLES VIENNENT DE LA BRETELLE ; à défaut, le NOM de la sortie
       fait l'affaire — « Châtillon-la-Borde » dit où l'on va, même sans
       liste de villes. Mieux vaut le nom que le vide. */
    const bretelle = proche ? destinationA(this.#destinations, point) : null;
    /* LE NOM DE LA RUE OÙ L'ON TOURNE (TERRAIN-1, 30/08). Armelin : « dans
       les panneaux d'indication de rue, ce serait bien d'indiquer également
       le nom de la rue dans laquelle il faut tourner ». Il est là depuis le
       début — le service le rend dans `nom_1_gauche` — mais il ne servait
       qu'à nommer la rue COURANTE, en bas. Il manquait là où il compte.
       ON NE LE MET PAS QUAND C'EST UN NUMÉRO : « A6 » est déjà dans son
       cartouche rouge, le répéter en toutes lettres serait du bruit. */
    const rueVisee = !e.horsRoute && e.manoeuvre?.voie && numeroRoute(e.manoeuvre.voie) === ''
      ? [e.manoeuvre.voie] : [];
    const villes = bretelle?.villes ?? (sortie?.nom ? [sortie.nom] : rueVisee);
    const texte = villes.join(' · ');
    if (texte === '') {
      ligne.hidden = true;
      ligne.textContent = '';
      return;
    }
    if (ligne.textContent === texte) return;
    ligne.hidden = false;
    ligne.textContent = texte;
    /* LU AUTREMENT QUE VU : le point médian se lit « Lyon Évry » à voix
       haute, ce qui n'est pas une phrase. On dit « vers ». */
    ligne.setAttribute('aria-label', `vers ${villes.join(', ')}`);
  }

  /**
   * Le schéma de rond-point (ROND-1, 30/08).
   *
   * IL EST DESSINÉ, PAS CHOISI DANS UNE BIBLIOTHÈQUE D'IMAGES : chaque
   * branche est tracée à SON angle, celui qu'OpenStreetMap donne, et notre
   * sortie au sien. Un schéma générique « troisième sortie » mentirait sur
   * la forme du carrefour, qui est justement ce qu'on cherche à reconnaître
   * en arrivant dessus.
   *
   * L'ENTRÉE EST EN BAS, toujours : c'est la convention de tous les schémas
   * de navigation, et elle correspond à ce qu'on voit par le pare-brise.
   */
  #majGiratoire(e: EtatGuidage): void {
    const boite = this.querySelector('.bg-giratoire') as HTMLElement | null;
    if (!boite) return;
    const g = e.horsRoute ? null : giratoireA(this.#giratoires, e.avancementM);
    if (!g) {
      boite.hidden = true;
      boite.replaceChildren();
      delete boite.dataset['etat'];
      return;
    }
    /* CE QUI SUIT SE REFAIT À CHAQUE FIXE, ET C'EST NÉCESSAIRE : l'affichage
       de la manœuvre est réécrit une seconde sur deux par le code qui
       précède, avec ce que dit le moteur. Le mémo plus bas n'épargne que le
       DESSIN — le mettre ici laisserait « tournez à droite » revenir
       par-dessus le schéma au fixe suivant. Vu à l'écran, pas déduit. */
    const instruction = this.querySelector('.bg-cartouche .bg-instruction') as HTMLElement | null;
    /* « Tournez à droite » au milieu d'un giratoire n'est pas faux, c'est
       inutilisable : on dit le rang. */
    if (instruction) instruction.textContent = libelleRangCourt(g.rang);
    /* LA FLÈCHE DE MANŒUVRE CÈDE LA PLACE : le moteur, qui ignore le
       rond-point, y annonce une flèche de virage — elle contredirait le
       schéma sous les yeux de l'usager. Un seul dessin par manœuvre. */
    const fleche = this.querySelector('.bg-cartouche .bg-fleche') as HTMLElement | null;
    if (fleche) fleche.hidden = true;

    const signature = `${Math.round(g.entreeM)}-${g.rang ?? '?'}`;
    if (boite.dataset['etat'] === signature) return;
    boite.dataset['etat'] = signature;
    boite.hidden = false;
    boite.setAttribute('aria-label', libelleRang(g.rang));
    boite.innerHTML = schemaGiratoire(g);
  }

  /** Allume ou éteint la voix, et le dit au bouton. */
  #reglerVoix(actif: boolean): void {
    this.#parle = actif;
    if (!actif) this.#voix.taire();
    const b = this.querySelector<HTMLButtonElement>('.bg-voix');
    if (!b) return;
    b.setAttribute('aria-pressed', String(actif));
    b.setAttribute('aria-label', actif ? 'Couper le guidage vocal' : 'Activer le guidage vocal');
    b.innerHTML = pictoMenu(actif ? 'voix' : 'voix-muette');
  }

  /**
   * Ce qu'il faut dire, s'il faut le dire (VOIX-1, 30/08).
   *
   * LA DÉCISION EST AILLEURS (lib/annonces.ts) : ici on ne fait que réunir ce
   * que le panneau sait déjà — le rang du giratoire, le numéro de sortie, les
   * villes — et le passer à qui formule. Le même contexte nourrit l'écran et
   * la voix : ils ne peuvent donc pas se contredire.
   */
  #annoncer(e: EtatGuidage): void {
    if (!this.#parle || e.horsRoute) return;
    /* SANS FEUILLE DE ROUTE, IL RESTE DES CHOSES À DIRE. Le premier jet
       sortait ici dès qu'aucune manœuvre n'était connue — et le trafic comme
       les arrêts de recharge se taisaient avec elle, alors qu'ils n'en
       dépendent pas. Or la feuille manque plus souvent qu'on ne croit : un
       service d'instructions en panne, un itinéraire rejoué depuis un lien.
       Trouvé par le parcours de VOIX-2, pas au volant. */
    if (!e.manoeuvre) {
      if (!this.#annoncerRecharge(e, Infinity)) this.#annoncerTrafic(e, Infinity);
      return;
    }
    const palier = palierA(e.jusquALaManoeuvreM, e.manoeuvre.distance);
    /* LE TRAFIC PARLE DANS LES BLANCS (TRAFIC-1, 30/08) : quand aucune
       manœuvre n'est à annoncer, et seulement si la prochaine est assez
       loin. La règle vit dans lib/annonces.ts — on n'interrompt pas, on
       attend. */
    /* DANS LES BLANCS DE LA NAVIGATION, DEUX CHOSES À DIRE, DANS CET ORDRE :
       l'arrêt de recharge d'abord — il demande une DÉCISION, et c'est ce qui
       manque le plus en électrique — puis le trafic, qui informe. */
    if (palier === null) {
      if (!this.#annoncerRecharge(e, e.jusquALaManoeuvreM)) {
        this.#annoncerTrafic(e, e.jusquALaManoeuvreM);
      }
      return;
    }
    const point = e.avancementM + e.jusquALaManoeuvreM;
    if (!this.#annonces.aDire(point, palier)) return;

    const giratoire = giratoireA(this.#giratoires, e.avancementM);
    const sortie = sortieA(this.#sorties, point);
    const bretelle = destinationA(this.#destinations, point);
    const contexte: ContexteAnnonce = {
      manoeuvre: e.manoeuvre.manoeuvre,
      ...(giratoire ? { rangGiratoire: giratoire.rang } : {}),
      ...(sortie?.numero ? { sortie: sortie.numero } : {}),
      ...(bretelle ? { villes: bretelle.villes } : {}),
      ...(e.manoeuvre.voie ? { voie: e.manoeuvre.voie } : {}),
    };
    const phrase = phraseAnnonce(palier, e.jusquALaManoeuvreM, contexte);
    /* ON NOTE MÊME CE QU'ON NE DIT PAS : sans cela, une manœuvre muette
       (« tout droit ») ferait recalculer la phrase à chaque fixe GPS
       jusqu'au carrefour suivant. */
    this.#annonces.noter(point, palier);
    if (phrase === '') return;
    this.#voix.dire(phrase);
    this.#aParle = true;
  }

  /** L'arrêt de recharge à venir, dit une fois par palier. Vrai s'il a parlé. */
  #annoncerRecharge(e: EtatGuidage, jusquALaManoeuvreM: number): boolean {
    const r = rechargeADire(this.#options?.arrets ?? [], e.avancementM, jusquALaManoeuvreM);
    if (!r) return false;
    const motif = `recharge-${r.palier}` as const;
    if (!this.#annonces.aDire(r.avancementM, motif)) return false;
    this.#annonces.noter(r.avancementM, motif);
    this.#voix.dire(phraseRecharge(r));
    this.#aParle = true;
    return true;
  }

  /** L'événement de trafic, dit une fois, dans un blanc de la navigation. */
  #annoncerTrafic(e: EtatGuidage, jusquALaManoeuvreM: number): void {
    const evt = traficADire(this.#evenements, e.avancementM, jusquALaManoeuvreM);
    if (!evt || !this.#annonces.aDire(evt.avancementM, 'trafic')) return;
    this.#annonces.noter(evt.avancementM, 'trafic');
    const phrase = phraseTrafic(evt.libelle, evt.distanceM);
    if (phrase === '') return;
    this.#voix.dire(phrase);
    this.#aParle = true;
  }

  /**
   * La réserve de cadrage — où poser la voiture dans l'écran (TERRAIN-1).
   *
   * ELLE TIENT COMPTE DE LA BARRE DU BAS, et c'est la seconde moitié de la
   * demande : « la voiture ne doit pas toucher non plus la barre de
   * navigation en bas de l'écran ». Sans cette réserve, la caler aux deux
   * tiers la poserait DERRIÈRE la barre quand celle-ci est dépliée.
   */
  #reserveCamera(carte: CarteMapLibre): {
    top: number; bottom: number; left: number; right: number;
  } {
    const hauteur = carte.getContainer().clientHeight;
    const barre = Math.min(this.offsetHeight, hauteur * 0.4);
    const visible = Math.max(hauteur - barre, 1);
    /* SOIXANTE-DIX-HUIT POUR CENT, ET NON DEUX TIERS. Premier jet : deux
       tiers de la carte VISIBLE — ce qui, avec une barre de deux cents
       pixels, retombe pile au milieu de l'ÉCRAN. Armelin l'a vu tout de
       suite : « la vue du véhicule est toujours centrée au milieu de
       l'écran ». Le calcul était juste, la cible était mauvaise.
       À 78 %, la voiture se pose à environ cent quarante pixels au-dessus de
       la barre sur un téléphone : basse, sans la toucher. */
    const cible = 0.78;
    const haut = (2 * cible - 1) * visible;
    /* JAMAIS AU-DELÀ DE LA MOITIÉ DE L'ÉCRAN de réserve : sur un écran très
       court, la caméra se renverserait. */
    return { top: Math.max(0, Math.min(haut, hauteur / 2)), bottom: barre, left: 0, right: 0 };
  }

  #alerte(message: string): void {
    const p = this.querySelector('.bg-alerte') as HTMLElement;
    p.textContent = message;
    p.hidden = message === '';
  }

  #majPosition(coords: {
    longitude: number; latitude: number;
    speed?: number | null; heading?: number | null;
  }): void {
    const o = this.#options;
    if (!o) return;
    this.#derniersCoords = coords;
    const lon = coords.longitude;
    const lat = coords.latitude;
    const e = etatGuidage(o, { lon, lat });

    /* LE CURSEUR AVANT TOUT LE RESTE : c'est la seule chose qui dise « vous
       êtes ici ». Son cap vient du GPS quand il en donne un, du déplacement
       depuis le fixe précédent sinon — deux fixes valent une direction là
       où `heading` reste nul (à l'arrêt, sur un ordinateur, à la sortie
       d'un tunnel). Le curseur ne dépend d'AUCUN service : il paraît même
       si la feuille de route, la météo et le relief sont tombés. */
    const capMesure = typeof coords.heading === 'number' && Number.isFinite(coords.heading)
      && typeof coords.speed === 'number' && (coords.speed ?? 0) > 2
      ? coords.heading
      : (this.#dernierePosition ? capEntre(this.#dernierePosition, [lon, lat]) : null);
    /* L'AIMANT AU TRACÉ (GUIDE-1, 01/09) : sur la route, on DESSINE la
       route — point projeté, cap du tracé. La flèche ne recule plus (le
       heading est du bruit à basse vitesse), et le curseur ne roule plus
       « sur les toits des bâtiments parisiens ». La mesure BRUTE continue de
       nourrir la logique : avancement, hors-route et recalcul n'en perdent
       rien. Voir lib/guidage.ts pour la règle et le seuil. */
    const aimant = !e.horsRoute && e.ecartM <= SEUIL_AIMANT_M
      ? pointDuTrace(o.trace, e.avancementM) : null;
    const dessine: [number, number] = aimant ? aimant.point : [lon, lat];
    /* LE CAP DU TRACÉ NE REMPLACE LE CAP GPS QUE QUAND CELUI-CI EST DU
       BRUIT : sous 2 m/s ou absent — le cas exact de la flèche à reculons,
       vue à 4 km/h. En roulant, le heading GPS est fiable et déjà lissé ;
       l'écraser ferait tourner la carte au cap du tracé pendant qu'on en
       DÉVIE volontairement (un dépassement, une présélection). Deux parcours
       du lissage l'ont rappelé avant l'usager. */
    const capFiable = typeof coords.heading === 'number' && Number.isFinite(coords.heading)
      && typeof coords.speed === 'number' && (coords.speed ?? 0) > 2;
    /* LA FLÈCHE MONTRE OÙ L'ON REGARDE (GUIDE-4, 01/09). Armelin : « la
       flèche suit le trajet mais pas la direction dans laquelle je regarde ».
       GUIDE-1 lui avait donné le cap du TRACÉ pour qu'elle cesse de reculer à
       4 km/h ; GUIDE-2 avait ensuite mis la boussole sur la CARTE. Les deux
       corrigeaient le mauvais élément : c'est le CURSEUR qui représente
       l'usager, donc lui qui doit suivre le téléphone.
       L'ORDRE : le cap GPS quand il est fiable (en roulant, il DIT le sens de
       la marche et ne tremble pas), sinon la boussole (à l'arrêt, c'est le
       téléphone qu'on tourne dans les mains), sinon le tracé — qui reste le
       dernier recours contre la flèche à reculons. */
    const capDessine = capFiable
      ? capMesure
      : (this.#capBoussole ?? (aimant ? aimant.cap : capMesure));
    if (this.#carte) {
      this.#curseur.poser(this.#carte, dessine[0], dessine[1], capDessine);
    }

    this.#dernierePosition = [lon, lat];

    /* LA VITESSE GPS, EN TOUTES LETTRES — « un petit cercle indiquant la
       vitesse GPS en temps réel » (Armelin, 27/08/2026). `speed` vient en
       m/s, et il est NULL quand le récepteur ne sait pas : la pastille
       disparaît alors, plutôt que de figer un chiffre périmé. Ce n'est PAS
       la vitesse limite (l'ISA) : elle attend l'étude maxspeed OSM. */
    const vitesse = this.querySelector('.bg-vitesse') as HTMLElement;
    if (typeof coords.speed === 'number' && Number.isFinite(coords.speed)
      && coords.speed >= 0) {
      (vitesse.querySelector('.bg-vitesse-nombre') as HTMLElement).textContent =
        String(Math.round(coords.speed * 3.6));
      vitesse.hidden = false;
    } else {
      vitesse.hidden = true;
    }

    /* LA LIMITE CARTOGRAPHIÉE DU KILOMÈTRE COURANT — lecture locale, le
       relevé a été fait une fois au démarrage. Hors tronçon connu ou hors
       route : le panneau disparaît, il ne mentira pas. */
    const panneauLimite = this.querySelector('.bg-limite-vitesse') as HTMLElement;
    const kmh = e.horsRoute ? null : limiteA(this.#limites, e.avancementM);
    if (kmh !== null) {
      (panneauLimite.querySelector('.bg-limite-nombre') as HTMLElement).textContent = String(kmh);
      panneauLimite.hidden = false;
    } else {
      panneauLimite.hidden = true;
    }

    /* LA CARTE SUIT LA VOITURE — SAUF quand l'usager vient de la prendre :
       son geste suspend la caméra, le bouton « Recentrer » (ou vingt
       secondes d'immobilité) la rend. `easeTo` et non `jumpTo` : un saut à
       chaque fixe GPS — environ une fois par seconde — rendrait la carte
       illisible. */
    if (this.#camera) {
      /* LE CAP GPS ORIENTE LA CARTE : la direction du déplacement en haut,
         comme toute navigation. `heading` n'a de sens QU'EN MOUVEMENT — à
         l'arrêt, c'est du bruit qui ferait tournoyer la carte au feu rouge :
         en dessous de 2 m/s (7 km/h), on garde l'orientation acquise.
         DeviceOrientation (la boussole à l'arrêt) attend son propre chantier :
         elle exige une permission sur iOS, le cap GPS n'exige rien. */
      const capGps = typeof coords.heading === 'number' && Number.isFinite(coords.heading)
        && typeof coords.speed === 'number' && (coords.speed ?? 0) > 2
        ? coords.heading : null;
      /* À L'ARRÊT, LA BOUSSOLE PREND LE RELAIS — si le geste l'a ouverte
         (NAV-1). En mouvement, le cap GPS garde la main : il mesure la
         route, la boussole mesure le téléphone. */
      /* L'ORDRE EST UNE RÉGRESSION PAYÉE (GUIDE-2, 01/09). GUIDE-1 avait
         glissé le cap du TRACÉ devant la boussole : la carte se verrouillait
         alors au cap de la route, et Armelin l'a vu tout de suite — « quand
         je lance un itinéraire, la boussole ne tourne plus, le téléphone ne
         sait pas dans quel sens je suis ». C'était tuer le relais annoncé
         deux lignes plus haut.
         LA BOUSSOLE MESURE LE TÉLÉPHONE, LE TRACÉ MESURE LA ROUTE : à
         l'arrêt, c'est le téléphone qu'on tourne dans les mains, et c'est
         donc lui qui doit orienter la carte. Le cap du tracé ne sert plus
         que de DERNIER recours, quand l'appareil n'a pas de boussole —
         et il continue, lui, d'orienter le CURSEUR, qui est ce que
         GUIDE-1 corrigeait vraiment. */
      /* LA CARTE SUIT LA ROUTE, PAS LE TÉLÉPHONE (GUIDE-4, 01/09). Armelin :
         « la boussole tourne mais quand je clique dessus pour garder la
         voiture dans le sens de la marche il ne se passe rien et la carte
         continue de tourner avec la boussole ». GUIDE-2 avait mis la boussole
         devant : la carte pivotait donc à chaque mouvement du téléphone, et
         le bouton semblait ne rien faire puisque le mode « cap » rendait la
         même chose que ce qu'il voulait quitter.
         DEUX OBJETS, DEUX SENS : la carte montre la ROUTE (cap GPS, sinon le
         cap du tracé), le curseur montre L'USAGER (boussole). La boussole ne
         reste ici qu'en tout dernier recours — hors trajet, à l'arrêt, quand
         rien d'autre ne dit où l'on va. */
      const brut = capGps
        ?? (aimant ? aimant.cap : null)
        ?? (this.#modeOrientation === 'cap' ? this.#capBoussole : null);
      if (brut !== null) {
        this.#capLisse = lisserCap(this.#capLisse, brut);
        this.#dernierCapConnu = this.#capLisse;
      }
      const cap = this.#modeOrientation === 'cap' ? this.#capLisse : null;
      if (cap !== null) this.#veilleAvaitTourne = true;
      /* L'INCLINAISON VOYAGE AVEC CHAQUE FIXE : un easeTo interrompt le
         précédent et FIGE ce qu'il ne nomme pas — le premier fixe arrivait
         pendant l'animation d'inclinaison du démarrage et la gelait à 2°.
         Mesuré par le parcours E2E avant d'être compris. */
      /* ON SE RAPPROCHE À L'INTERSECTION, ET L'ON REVIENT APRÈS (ZOOM-1,
         demande d'Armelin du 30/08). La décision est pure et à deux seuils
         (voir `approcheManoeuvre`) ; ce qui vit ici, c'est la MÉMOIRE du
         zoom d'avant — on le rend tel qu'on l'a trouvé, plutôt que
         d'imposer une valeur par défaut qui effacerait le réglage de
         l'usager. */
      /* LA CARTE EST LIÉE ICI, ET ON NE SORT PAS SANS ELLE : un `return`
         sauterait tout ce qui suit — instruction, chiffres, barre du trajet
         — alors que rien de cela ne dépend d'elle. */
      const carte = this.#carte;
      const dedans = this.#zoomAvantApproche !== null;
      const approche = !e.horsRoute
        && approcheManoeuvre(e.jusquALaManoeuvreM, e.manoeuvre?.manoeuvre ?? null, dedans);
      if (approche && !dedans && carte) this.#zoomAvantApproche = carte.getZoom();
      const zoomRendu = this.#zoomAvantApproche;
      if (!approche && dedans) this.#zoomAvantApproche = null;

      carte?.easeTo({
        center: dessine,
        /* LA VOITURE SE POSE AUX DEUX TIERS DE L'ÉCRAN, pas au milieu
           (TERRAIN-1, 30/08). Armelin, au volant : « la voiture est
           représentée au milieu de l'écran quand tous les GPS du marché la
           positionnent vers le bas, afin d'afficher plus d'éléments au loin
           jusqu'en haut de l'écran ». C'est juste : au volant, ce qu'on
           regarde est DEVANT.
           Le calcul n'est pas un réglage à l'œil : avec une réserve `top`,
           MapLibre place le centre à (H + top - bas) / 2. On veut ce centre
           aux deux tiers de la carte VISIBLE — celle qui n'est pas couverte
           par la barre du bas —, d'où top = (4/3) × (H - barre) / 2. */
        padding: this.#reserveCamera(carte),
        zoom: approche
          ? Math.max(carte?.getZoom() ?? 0, ZOOM_APPROCHE)
          : (zoomRendu ?? Math.max(carte?.getZoom() ?? 0, ZOOM_SUIVI)),
        pitch: this.#en3D ? PITCH_SUIVI : 0,
        /* Nord : cap zéro tenu. Cap : le cap lissé. Libre : on ne nomme PAS
           bearing — easeTo fige ce qu'il ne nomme pas, et c'est ici une
           vertu : la rotation posée du doigt reste. */
        ...(this.#modeOrientation === 'nord' ? { bearing: 0 }
          : cap !== null ? { bearing: cap } : {}),
        duration: 800,
      });
    }

    const instruction = this.querySelector('.bg-instruction') as HTMLElement;
    const distance = this.querySelector('.bg-distance') as HTMLElement;

    /* LA FLÈCHE SUIT L'ÉTAPE — et disparaît hors route ou sans feuille :
       une flèche qui pointe au hasard est pire qu'aucune. */
    const fleche = this.querySelector('.bg-fleche') as HTMLElement;
    if (!e.horsRoute && e.manoeuvre) {
      fleche.innerHTML = flecheManoeuvre(e.manoeuvre.manoeuvre);
      fleche.hidden = false;
    } else {
      fleche.hidden = true;
    }

    /* LE CARTOUCHE PREND LA COULEUR DE LA ROUTE (GUID-2). Il ne paraît que
       s'il a quelque chose à dire : sans étape — feuille de route en panne,
       ou trajet terminé — il s'efface au lieu de flotter à vide. */
    const cartouche = this.querySelector('.bg-cartouche') as HTMLElement;
    const ecusson = this.querySelector('.bg-ecusson') as HTMLElement;
    /* DEUX VOIES, ET ELLES NE SONT PAS LA MÊME : le cartouche annonce celle
       où l'on VA (la voie de la manœuvre à venir), la barre du bas nomme
       celle où l'on EST. Les confondre, c'est afficher le nom de la rue
       qu'on quitte au-dessus de la flèche qui en sort. */
    const voieCourante = e.horsRoute ? '' : (e.etape?.voie ?? '');
    const voieVisee = e.horsRoute ? '' : (e.manoeuvre?.voie ?? voieCourante);
    const classe = classeRoute(voieVisee);
    cartouche.hidden = !e.manoeuvre && !e.horsRoute;
    cartouche.dataset['classe'] = classe;
    /* LE PANNEAU SUIT LA RÈGLE, PAS UN GOÛT (PAN-1, 30/08). Le fond et
       l'encre viennent de lib/panneau.ts, qui code l'IISR : fond bleu ou
       vert, inscriptions et listels blancs ; fond blanc, tout en noir. La
       feuille de style ne fait que peindre ce que la règle a décidé. */
    const fond = fondPanneau(classe);
    cartouche.dataset['fond'] = fond;
    cartouche.dataset['encre'] = encreSur(fond);
    const numero = numeroRoute(voieVisee);
    ecusson.textContent = numero;
    ecusson.hidden = numero === '';
    /* LE CARTOUCHE DE NUMÉROTATION A SA PROPRE COULEUR, et ce n'est pas
       celle du panneau : rouge sur autoroute ET nationale (type E42), jaune
       sur départementale (E43). C'est ce qu'on lit sur la route. */
    const numeroteur = cartoucheNumero(classe);
    if (numeroteur) ecusson.dataset['cartouche'] = numeroteur;
    else delete ecusson.dataset['cartouche'];

    this.#majSortie(e);
    this.#majEurope(e);
    this.#majVoies(e);
    /* L'écusson est un signe : il se DIT en toutes lettres à qui écoute la
       page, sans quoi « D606 » resterait une suite de caractères. */
    if (numero !== '') ecusson.setAttribute('aria-label', `${libelleClasse(classe)} ${numero}`);

    /* LA VOIE COURANTE, EN BAS ET SEULE — ce qu'Armelin voulait y garder.
       Le numéro y suffit quand la voie en porte un ; sinon, son nom. */
    (this.querySelector('.bg-voie') as HTMLElement).textContent = voieCourante;

    /* L'HISTORIQUE COURT DES ÉCARTS : on ne garde que ce qu'il faut pour
       trancher, et il repart à zéro dès qu'on est de nouveau sur la route. */
    const capTrace = pointDuTrace(o.trace, e.avancementM)?.cap ?? null;
    if (capTrace !== null && this.#numeroFixe !== this.#fixeNote) {
      this.#fixeNote = this.#numeroFixe;
      this.#derniersEcarts.push({ ecartM: e.ecartM, cap: capMesure, capTrace });
      if (this.#derniersEcarts.length > FIXES_CONCORDANTS) this.#derniersEcarts.shift();
    }
    /* DEUX SIGNAUX QUI S'ACCORDENT VALENT MIEUX QU'UN SEUIL PLUS BAS : on
       conclut à quarante mètres — la moitié — quand l'écart CROÎT et que le
       cap DIVERGE de la route. Descendre le seuil sec aurait annoncé « vous
       avez quitté l'itinéraire » à quelqu'un qui roule droit dans une rue
       encaissée. */
    const partiTot = !e.horsRoute && quitteLeTrace(this.#derniersEcarts);
    if (e.horsRoute || partiTot) {
      /* ON LE DIT, ON NE DEVINE PAS. Continuer d'annoncer une manœuvre pour
         une route qu'on ne suit plus est bien pire que de se taire : l'usager
         tournerait sur la foi d'une instruction périmée. */
      instruction.textContent = 'Vous avez quitté l’itinéraire.';
      distance.textContent = `À ${formaterDistance(e.ecartM)} du trajet`;
      this.#alerte('Nouvel itinéraire depuis votre position dans un instant…');
      /* PLUS VITE QU'AVANT (29/08) : quatre secondes de constat au lieu de
         huit, et quinze secondes entre deux recalculs au lieu de trente.
         Le premier chiffre décidait du temps perdu à rouler sur une route
         qu'on ne suit plus ; le second n'a jamais servi qu'à ne pas
         marteler le service, et quinze secondes y suffisent. */
      const maintenant = performance.now();
      if (this.#horsRouteDepuis === null) this.#horsRouteDepuis = maintenant;
      /* LE CONSTAT S'ABRÈGE QUAND LES DEUX SIGNAUX SE SONT DÉJÀ ACCORDÉS :
         `quitteLeTrace` a exigé trois fixes croissants ET un cap divergent —
         c'est un constat, pas un soupçon. Attendre encore quatre secondes
         referait perdre les mètres qu'on vient de gagner. */
      else if (maintenant - this.#horsRouteDepuis > (partiTot ? 1_000 : 4_000)
        && maintenant - this.#dernierRecalculMs > 15_000) {
        this.#dernierRecalculMs = maintenant;
        this.#avancementMax = 0;
        document.dispatchEvent(new CustomEvent('recalcul-hors-route', {
          detail: { lon, lat },
        }));
      }
    } else {
      this.#horsRouteDepuis = null;
      /* ON N'OUBLIE QUE LORSQU'ON EST FRANCHEMENT REVENU. Vider l'historique
         à CHAQUE fixe sur la route — ce que faisait le premier jet — le
         remettait à un seul élément avant qu'il n'ait pu montrer une
         croissance : le détecteur ne concluait jamais, et un parcours est
         resté muet le temps de le comprendre. */
      if (e.ecartM < ECART_DOUTE_M / 2) this.#derniersEcarts = [];
      /* SUR LE TRACÉ, MAIS DANS QUEL SENS ? Un tour de rond-point ramène à
         deux mètres du tracé, en marche arrière : l'écart ne voit rien,
         l'avancement, lui, recule. On le constate, et on refait le trajet
         depuis ici — c'est le cas qu'Armelin a filmé le 29/08. */
      if (partiAContresens(e.avancementM, this.#avancementMax)) {
        const maintenant = performance.now();
        if (maintenant - this.#dernierRecalculMs > 15_000) {
          this.#dernierRecalculMs = maintenant;
          this.#avancementMax = e.avancementM;
          this.#alerte('Vous repartez en arrière — nouvel itinéraire depuis votre position…');
          document.dispatchEvent(new CustomEvent('recalcul-hors-route', {
            detail: { lon, lat },
          }));
          return;
        }
      }
      /* LA BANDE AVEUGLE 30–50 m (FERMEE-1, 04/09). Armelin longeait l'A4
         fermée par la rue parallèle : localisé juste (l'aimant lâche à
         30 m), jamais recalculé (le hors-route commence à 50 m). Sa capture
         est le cas d'école, MESURÉ : la parallèle vit pile dans la bande.
         TRENTE SECONDES au-delà de l'aimant : un virage large ou un
         échangeur ne durent pas trente secondes — une parallèle, si. */
      if (e.ecartM > SEUIL_AIMANT_M) {
        const tenuDepuis = this.#ecartTenuDepuis ?? performance.now();
        this.#ecartTenuDepuis = tenuDepuis;
        if (performance.now() - tenuDepuis > 30_000
          && performance.now() - this.#dernierRecalculMs > 15_000) {
          this.#dernierRecalculMs = performance.now();
          this.#ecartTenuDepuis = null;
          this.#avancementMax = 0;
          this.#alerte('Vous longez l’itinéraire sans être dessus — nouvel itinéraire depuis votre position…');
          document.dispatchEvent(new CustomEvent('recalcul-hors-route', {
            detail: { lon, lat },
          }));
          return;
        }
      } else this.#ecartTenuDepuis = null;
      this.#avancementMax = Math.max(this.#avancementMax, e.avancementM);
      this.#alerte('');
      /* LA VOIE NE SE REDIT PLUS ICI : elle porte l'écusson du cartouche et
         le bas du bandeau. « Tournez à droite — D606 » sur trois lignes
         dans un cartouche large de deux cent quatre-vingts pixels était la
         même information écrite trois fois. */
      /* ON ANNONCE CE QUI ARRIVE, PAS CE QU'ON VIENT DE FAIRE. Voir
         `manoeuvre` dans lib/guidage : le service donne l'instruction du
         DÉBUT d'étape et la longueur qui suit — afficher l'étape courante
         revenait à nommer la manœuvre déjà exécutée, avec la distance de
         la prochaine. « Le GPS confond sa gauche et sa droite » (Armelin,
         29/08) : il ne les confondait pas, il avait un tour de retard. */
      instruction.textContent = e.manoeuvre ? e.manoeuvre.texte : 'Suivez l’itinéraire';
      distance.textContent = e.manoeuvre ? distanceEnMots(e.jusquALaManoeuvreM) : '';
    }

    this.#annoncer(e);

    /* LE ROND-POINT PARLE EN DERNIER, ET C'EST L'ORDRE QUI COMPTE : il
       REMPLACE l'instruction du moteur, qui ignore les giratoires et y dit
       « tournez à droite ». Appelé plus haut, il était réécrit une seconde
       plus tard par la ligne ci-dessus — vu à l'écran, pas déduit. */
    this.#majGiratoire(e);
    this.#majParking(e);
    this.#majTonnage(e);
    this.#majInterfile(e);
    this.#majArrivee(e);

    /* L'ARRIVÉE RÉELLE (décision d'Armelin du 29/08) : l'heure affichée
       comptait la ROUTE seule — avec deux arrêts de trente minutes devant,
       elle mentait d'une heure. Les charges restantes entrent, et on le
       DIT. */
    const chargeRestanteS = o.arrets
      .filter((a) => a.avancementM > e.avancementM)
      .reduce((t, a) => t + a.dureeMin * 60, 0);
    const arrivee = heureArriveeEstimee(e.restantS + chargeRestanteS, new Date());
    /* TROIS CHIFFRES, CHACUN DANS SA CASE ET EN GRAND (NAV-3). La ligne
       d'avant les cousait ensemble en treize pixels : « les informations
       les plus indispensables sont écrites en trop petit », et c'est vrai —
       ce sont les seules qu'on lit vraiment en roulant. */
    const heure = arrivee
      ? arrivee.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
      : '—';
    (this.querySelector('.bg-km') as HTMLElement).textContent = formaterDistance(e.restantM);
    (this.querySelector('.bg-temps') as HTMLElement).textContent =
      e.restantS > 0 ? formaterDuree(Math.round(e.restantS + chargeRestanteS)) : '—';
    (this.querySelector('.bg-eta') as HTMLElement).textContent = heure;
    /* « Charges comprises » n'entre pas dans un chiffre : le mot vit sous
       l'heure, en petit, et seulement quand il est vrai. */
    const mentionEta = this.querySelector('.bg-eta')?.nextElementSibling;
    if (mentionEta) {
      /* « CHARGES COMPRISES » TIENT EN UN MOT SOUS L'HEURE : la phrase
         entière poussait la colonne à s'enrouler sur deux lignes, et c'est
         l'heure d'arrivée elle-même qui disparaissait de la vue. Le détail
         complet reste dans la phrase lue par les lecteurs d'écran. */
      /* « ARRIVÉE », TOUJOURS (30/08). Armelin : « il y a écrit un horaire
         avec la mention "avec charges". Je ne sais pas s'il s'agit du temps
         restant à rouler avec les charges incluses ou l'heure d'arrivée. Ce
         n'est pas clair. Il faudrait tout simplement écrire "Arrivée". »
         Il a raison : un libellé qui qualifie le CALCUL laisse douter de ce
         que le nombre EST. Que les charges soient comptées se lit dans la
         phrase complète, sous l'heure, et dans le copilote. */
      mentionEta.textContent = 'arrivée';
    }
    /* La ligne d'origine reste, MASQUÉE : elle porte encore la phrase
       complète pour les lecteurs d'écran et les parcours qui la lisent. */
    (this.querySelector('.bg-restant') as HTMLElement).textContent = [
      `${formaterDistance(e.restantM)} restants`,
      e.restantS > 0 ? formaterDuree(Math.round(e.restantS + chargeRestanteS)) : null,
      arrivee ? `arrivée vers ${heure}`
        + (chargeRestanteS > 0 ? ', charges comprises' : '') : null,
    ].filter(Boolean).join(' · ');

    /* LE PROCHAIN ÉVÉNEMENT TRAFIC DEVANT SOI — « Travaux dans 12 km ».
       Bison Futé ne connaît que des événements ponctuels : on annonce, on ne
       colorie pas une fluidité qui n'existe pas dans la donnée. Au-delà de
       50 km, silence : l'événement de l'arrivée ne concerne pas le volant. */
    const trafic = this.querySelector('.bg-trafic') as HTMLElement;
    /* DIX KILOMÈTRES, PAS CINQUANTE (30/08). Armelin : « la ligne pour
       indiquer les travaux ne devrait s'afficher automatiquement que 10 km
       avant d'arriver à la zone de travaux. Idem pour la prochaine arrivée
       à la borne de recharge ». Une barre qui annonce à cinquante
       kilomètres occupe l'écran une demi-heure pour rien ; à dix, elle
       prévient au moment où l'on peut encore décider. Au-delà, tout reste
       lisible EN DÉPLIANT — rien n'est perdu, seulement rangé. */
    const portee = this.classList.contains('bg-tout-voir') ? 50_000 : ANNONCE_M;
    const prochainEvt = e.horsRoute ? undefined
      : this.#evenements.find((v) => v.avancementM > e.avancementM
        && v.avancementM - e.avancementM < portee);
    (trafic.querySelector('.bg-trafic-mot') as HTMLElement).textContent = prochainEvt
      ? `${prochainEvt.libelle} ${distanceEnMots(prochainEvt.avancementM - e.avancementM)}`
        + ' (Bison Futé)'
      : '';
    /* LE CONTOURNEMENT SE PROPOSE QUAND L'ÉVÉNEMENT BLOQUE (FERMEE-1,
       04/09). Armelin, capture A4 : « le GPS m'affiche le message mais me
       force quand même à entrer sur l'autoroute fermée ». Le moteur public
       ne connaît pas les fermetures — on ne peut pas les lui faire éviter ;
       on peut OFFRIR le geste, et c'est exactement le bis : une route qui
       s'écarte d'ici, mesurée. Coupures et obstacles seulement : proposer
       de contourner un bouchon de 2 km ferait plus de détour que d'attente. */
    const eviter = trafic.querySelector<HTMLButtonElement>('.bg-trafic-eviter');
    if (eviter) {
      eviter.hidden = !prochainEvt
        || !['COUPURE', 'OBSTACLE'].includes(prochainEvt.type);
    }

    /* LE PROCHAIN ARRÊT DE RECHARGE — ce qui manque le plus en électrique, et
       qu'aucune application de navigation généraliste ne porte. */
    /* MÊME RÈGLE POUR L'ARRÊT DE RECHARGE : il paraît à dix kilomètres, et
       se lit avant cela en dépliant la barre. */
    const tousDevant = o.arrets.filter((a) => a.avancementM > e.avancementM);
    const prochainLoin = tousDevant[0];
    const prochain = prochainLoin
      && prochainLoin.avancementM - e.avancementM < portee ? prochainLoin : undefined;
    /* LE TEMPS AUTANT QUE LES KILOMÈTRES (30/08). Armelin : « je veux voir
       […] l'information du temps restant et des kilomètres restants avant la
       prochaine borne de recharge ». Le temps se déduit de la vitesse
       moyenne du trajet — la même règle que l'heure d'arrivée, et elle est
       dite : ce n'est pas une prédiction à la minute. */
    const versArret = prochain ? prochain.avancementM - e.avancementM : 0;
    const minutesVersArret = e.restantM > 0 && e.restantS > 0
      ? Math.round((versArret / e.restantM) * e.restantS / 60) : 0;
    (this.querySelector('.bg-arret') as HTMLElement).textContent = prochain
      ? `Recharge : ${prochain.nom}`
        + `${prochain.reseau ? ` (${prochain.reseau})` : ''}`
        + ` ${distanceEnMots(versArret)}`
        + `${minutesVersArret > 0 ? ` · ${minutesVersArret} min de route` : ''}`
        + `${prochain.dureeMin > 0 ? ` · ${Math.round(prochain.dureeMin)} min sur place` : ''}`
      : '';

    this.#majFrise(e.avancementM, e.restantM);
    this.#etat = { avancementM: e.avancementM, restantM: e.restantM, restantS: e.restantS };
    if (this.#copiloteOuvert) this.#majCopilote();
  }

  /**
   * Reconstruit le panneau du copilote sur le dernier fixe.
   *
   * TOUT EST LOCAL : les arrêts et événements sont déjà en mémoire, la
   * distance se soustrait. Les seuls appels réseau — commodités d'un arrêt,
   * météo à l'arrivée — sont des BOUTONS, et leurs réponses SURVIVENT à la
   * reconstruction : elles se raccrochent par clé, sans quoi le fixe suivant
   * effacerait ce qu'on vient de demander.
   */
  #majCopilote(): void {
    const corps = this.querySelector<HTMLElement>('.bg-copilote-corps');
    const o = this.#options;
    const e = this.#etat;
    if (!corps || !o || !e) return;

    /* LES RÉPONSES DÉJÀ OBTENUES (commodités par arrêt, météo) se relèvent
       AVANT le replaceChildren, et se reposent après. */
    const memoire = new Map<string, HTMLElement>();
    for (const el of corps.querySelectorAll<HTMLElement>('[data-memoire]')) {
      memoire.set(el.dataset['memoire']!, el);
    }
    corps.replaceChildren();

    const section = (titre: string): void => {
      const t = document.createElement('p');
      t.className = 'bg-copilote-section';
      t.textContent = titre;
      corps.append(t);
    };

    /* — La batterie (SOC-EDIT, 04/09). Armelin : « afficher dans Copilot
       le taux de batterie estimé à l'instant T et pouvoir renseigner à côté
       la valeur réelle pour que le planificateur voie s'il surestime ».
       L'ESTIMATION SE DIT COMME TELLE ; la correction s'écrit dans le
       profil du véhicule (une seule vérité) et REPLANIFIE depuis la
       position ; l'écart S'AFFICHE — rien ne s'apprend en silence, la
       prudence reste celle de MARGE-1. — */
    if (typeof o.socDepartTrajet === 'number' && typeof o.socFinal === 'number') {
      section('Batterie');
      const estime = socEstimeA(
        e.avancementM, o.socDepartTrajet, o.arrets, o.socFinal, o.distanceTotaleM,
      );
      const ligneSoc = document.createElement('p');
      ligneSoc.className = 'bg-copilote-soc';
      ligneSoc.textContent = `Estimée maintenant : ~${Math.round(estime)} %`
        + ' — une estimation, pas un relevé.';
      corps.append(ligneSoc);
      const cleSoc = 'soc-correction';
      const dejaSoc = memoire.get(cleSoc);
      if (dejaSoc) corps.append(dejaSoc);
      else {
        const boite = document.createElement('div');
        boite.className = 'bg-copilote-soc-correction';
        boite.dataset['memoire'] = cleSoc;
        const champ = document.createElement('input');
        champ.type = 'number';
        champ.min = '1';
        champ.max = '100';
        champ.inputMode = 'numeric';
        champ.className = 'bg-copilote-soc-champ';
        champ.placeholder = '% affiché par le véhicule';
        champ.setAttribute('aria-label',
          'Pourcentage réel de batterie affiché par le véhicule');
        const corriger = document.createElement('button');
        corriger.type = 'button';
        corriger.className = 'bg-copilote-soc-corriger';
        corriger.textContent = 'Corriger le plan';
        const etatSoc = document.createElement('p');
        etatSoc.className = 'bg-copilote-soc-etat';
        etatSoc.setAttribute('role', 'status');
        corriger.addEventListener('click', () => {
          const v = Number(champ.value);
          if (!(v >= 1 && v <= 100)) {
            etatSoc.textContent = 'Un pourcentage entre 1 et 100.';
            return;
          }
          const c = this.#derniersCoords;
          const en = this.#etat;
          const opts = this.#options;
          if (!c || !en || !opts
            || typeof opts.socDepartTrajet !== 'number'
            || typeof opts.socFinal !== 'number') {
            etatSoc.textContent = 'Position inconnue : la correction attend un point GPS.';
            return;
          }
          const estimeIci = socEstimeA(
            en.avancementM, opts.socDepartTrajet, opts.arrets, opts.socFinal,
            opts.distanceTotaleM,
          );
          const ecart = Math.round(v - estimeIci);
          /* L'ÉCART SE MONTRE — c'est toute la demande : « pour que le
             planificateur voie s'il surestime ». */
          etatSoc.textContent = `Plan recalculé depuis ${Math.round(v)} % —`
            + ` l'estimation disait ~${Math.round(estimeIci)} %`
            + ` (écart ${ecart >= 0 ? '+' : ''}${ecart}`
            + ` point${Math.abs(ecart) > 1 ? 's' : ''}).`;
          document.dispatchEvent(new CustomEvent('soc-corrige', {
            detail: { pourcent: v, lon: c.longitude, lat: c.latitude },
          }));
        });
        boite.append(champ, corriger, etatSoc);
        corps.append(boite);
      }
    }

    // — Les recharges à venir —
    const restants = o.arrets.filter((a) => a.avancementM > e.avancementM);
    if (restants.length > 0) {
      section('Recharges à venir');
      for (const a of restants) {
        const carte = document.createElement('div');
        carte.className = 'bg-copilote-arret';
        const nom = document.createElement('p');
        nom.className = 'bg-copilote-arret-nom';
        nom.textContent = a.nom + (a.reseau ? ` (${a.reseau})` : '');
        const detail = document.createElement('p');
        detail.className = 'bg-copilote-arret-detail';
        detail.textContent = `dans ${formaterDistance(a.avancementM - e.avancementM)}`
          + ` · prévu : arrivée ${Math.round(a.socArrivee)} % → départ ${Math.round(a.socDepart)} %`
          + (a.dureeMin > 0 ? ` · ${Math.round(a.dureeMin)} min` : ' · sans recharge');
        carte.append(nom, detail);

        const cle = `commodites-${a.lon.toFixed(5)},${a.lat.toFixed(5)}`;
        const deja = memoire.get(cle);
        if (deja) {
          carte.append(deja);
        } else {
          const voir = document.createElement('button');
          voir.type = 'button';
          voir.className = 'bg-copilote-commodites';
          voir.textContent = 'Commodités sur place';
          voir.addEventListener('click', () => {
            voir.disabled = true;
            voir.textContent = 'Recherche…';
            chargerCommodites(a.lon, a.lat).then(
              (trouvees) => {
                /* STRUCTURÉ, COMME DANS LA FICHE DE BORNE (COPILOTE-1,
                   30/08). Armelin : « les informations sont affichées sous
                   forme de texte, alors que sur une borne elles sont
                   structurées, ligne par ligne, avec la distance et un logo.
                   Ce serait bien de faire le même principe dans Copilote. »
                   On appelle la MÊME fonction que la fiche : deux écritures
                   du même affichage se seraient séparées à la première
                   retouche. */
                const sortie = document.createElement('div');
                sortie.className = 'bg-copilote-sortie';
                sortie.dataset['memoire'] = cle;
                if (trouvees.length === 0) {
                  sortie.textContent = 'Rien de recensé à moins de 400 m.';
                } else {
                  sortie.append(listeCommodites(trouvees, { lon: a.lon, lat: a.lat }));
                }
                voir.replaceWith(sortie);
              },
              (err: unknown) => {
                voir.disabled = false;
                voir.textContent = err instanceof ErreurCommodites
                  ? err.message : 'Commodités indisponibles — réessayer';
              },
            );
          });
          carte.append(voir);
        }
        corps.append(carte);
      }
    }

    // — Les événements de la route, TOUS ceux qui restent devant —
    const evenements = this.#evenements.filter((v) => v.avancementM > e.avancementM);
    if (evenements.length > 0) {
      section('Sur la route (Bison Futé)');
      const liste = document.createElement('ul');
      liste.className = 'bg-copilote-evenements';
      for (const v of evenements) {
        const item = document.createElement('li');
        item.textContent = `${v.libelle} — dans ${formaterDistance(v.avancementM - e.avancementM)}`;
        liste.append(item);
      }
      corps.append(liste);
    }

    /* — Le relief, SUR DEMANDE — l'ancienne page « Profil altimétrique »
       vit ici depuis le 29/08 (retour d'Armelin : le menu du planificateur
       s'allège, le copilote consulte). Un appel, la réponse survit. */
    section('Le relief du trajet');
    const cleAlti = 'profil-altimetrique';
    const dejaAlti = memoire.get(cleAlti);
    if (dejaAlti) {
      corps.append(dejaAlti);
      /* LE ROND SUIT LA VOITURE À CHAQUE FIXE : le bloc est mémorisé, donc
         reposé tel quel — il faut le déplacer explicitement, sinon il resterait
         là où il a été dessiné. */
      this.#majPointProfil(dejaAlti, e.avancementM);
    } else {
      /* IL SE CHARGE SEUL (COPILOTE-1, 30/08). Armelin : « ce serait bien
         d'afficher le profil altimétrique et la météo à l'arrivée directement
         dans Copilote, sans avoir à cliquer sur un bouton ». Le panneau est
         DÉJÀ un geste : ouvrir le copilote, c'est demander ce qu'il porte.
         Un second clic pour chaque section était un péage. L'appel reste
         unique par trajet — la réponse survit aux fixes suivants. */
      const alti = document.createElement('p');
      alti.className = 'bg-copilote-alti';
      alti.textContent = 'Calcul du profil…';
      {
        profilItineraire({ type: 'LineString', coordinates: o.trace }).then(
          (points) => {
            const t = versTraceSVG(points, 280, 64);
            const d = denivele(points);
            const sortie = document.createElement('div');
            sortie.className = 'bg-copilote-sortie';
            sortie.dataset['memoire'] = cleAlti;
            // Uniquement des nombres formatés par nos soins : ce innerHTML ne
            // porte aucune donnée externe (la règle textContent vaut pour les
            // libellés).
            sortie.innerHTML = `
              <svg viewBox="0 0 280 64" preserveAspectRatio="none" role="img"
                aria-label="Profil altimétrique, de ${Math.round(t.zMin)} à ${Math.round(t.zMax)} mètres d’altitude">
                <polygon class="alti-aire" points="${t.aire}"></polygon>
                <polyline class="alti-ligne" points="${t.ligne}"></polyline>
                <circle class="alti-vehicule" r="4.5" cx="-10" cy="-10"></circle>
              </svg>
              <p class="alti-bilan">D+ ${Math.round(d.montee)} m · D− ${Math.round(d.descente)} m ·
                de ${Math.round(t.zMin)} à ${Math.round(t.zMax)} m</p>`;
            /* LES POINTS SONT GARDÉS : le rond du véhicule s'y replace à
               chaque fixe, sans redemander le profil au service. */
            this.#profil = points;
            alti.replaceWith(sortie);
            this.#majPointProfil(sortie, this.#etat?.avancementM ?? 0);
          },
          (err: unknown) => {
            alti.textContent = err instanceof ErreurAltimetrie
              ? err.message : 'Profil indisponible.';
          },
        );
      }
      corps.append(alti);
    }

    // — L'arrivée —
    section('À l’arrivée');
    const arrivee = document.createElement('p');
    arrivee.className = 'bg-copilote-arrivee';
    const chargeDevantS = o.arrets
      .filter((a) => a.avancementM > e.avancementM)
      .reduce((t, a) => t + a.dureeMin * 60, 0);
    const heure = heureArriveeEstimee(e.restantS + chargeDevantS, new Date());
    arrivee.textContent = `${formaterDistance(e.restantM)} restants`
      + (e.restantS > 0 ? ` · ${formaterDuree(Math.round(e.restantS + chargeDevantS))}` : '')
      + (heure ? ` · vers ${heure.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
        + (chargeDevantS > 0 ? ' (charges comprises)' : '') : '');
    corps.append(arrivee);

    const cleMeteo = 'meteo-arrivee';
    const dejaMeteo = memoire.get(cleMeteo);
    if (dejaMeteo) {
      corps.append(dejaMeteo);
    } else {
      const meteo = document.createElement('p');
      meteo.className = 'bg-copilote-meteo';
      meteo.textContent = 'Prévision…';
      {
        const destination = o.trace[o.trace.length - 1];
        if (destination) {
        const vise = new Date(Date.now() + (this.#etat?.restantS ?? 0) * 1000);
        meteoA(destination[0], destination[1], vise).then(
          (m) => {
            const sortie = document.createElement('p');
            sortie.className = 'bg-copilote-sortie';
            sortie.dataset['memoire'] = cleMeteo;
            /* AU-DELÀ DE L'HORIZON DE PRÉVISION, ON LE DIT — la même règle
               que la page météo (revue du 22/08). */
            sortie.textContent = m.ecartMinutes > ECART_MAX_MINUTES
              ? 'La prévision ne couvre pas encore l’heure d’arrivée.'
              : `${phraseMeteo(m)} (Open-Meteo)`;
            meteo.replaceWith(sortie);
          },
          (err: unknown) => {
            meteo.textContent = err instanceof ErreurMeteo
              ? err.message : 'Météo indisponible.';
          },
        );
        }
      }
      corps.append(meteo);
    }
  }

  /**
   * Replace le rond du véhicule sur le profil (COPILOTE-1, 30/08).
   *
   * IL SE DÉPLACE, IL NE SE REDESSINE PAS : le bloc du profil est mémorisé
   * d'un fixe à l'autre — seules deux coordonnées changent. Le calcul vit
   * dans lib/altimetrie.ts, avec les mêmes marges que la courbe : un rond
   * calculé autrement flotterait à côté d'elle.
   */
  #majPointProfil(bloc: HTMLElement, avancementM: number): void {
    const rond = bloc.querySelector<SVGCircleElement>('.alti-vehicule');
    if (!rond || this.#profil.length < 2) return;
    const p = pointSurTrace(this.#profil, avancementM, 280, 64);
    if (!p) return;
    rond.setAttribute('cx', p.x.toFixed(1));
    rond.setAttribute('cy', p.y.toFixed(1));
  }

  /* LA PHRASE DES COMMODITÉS A ÉTÉ RETIRÉE (COPILOTE-1, 30/08) : « les
     informations sont affichées sous forme de texte alors que sur une borne
     elles sont structurées ». Le copilote appelle désormais `listeCommodites`,
     la même fonction que la fiche de borne. */

  /**
   * La frise verticale du trajet : départ en bas, arrivée en haut, et entre
   * les deux ce que le trajet RÉSERVE — les arrêts de recharge en pastilles
   * numérotées (les mêmes numéros que la carte et la liste), les événements
   * Bison Futé en losanges. Le curseur est la voiture.
   *
   * RECONSTRUITE À CHAQUE FIXE, et c'est un choix : quelques dizaines de
   * spans une fois par seconde ne coûtent rien, et la frise reste juste sans
   * invalidation à gérer — les événements se rafraîchissent toutes les cinq
   * minutes pendant le suivi.
   */
  #majFrise(avancementM: number, restantM: number): void {
    const frise = this.querySelector<HTMLElement>('.bg-frise');
    if (!frise) return;
    const total = avancementM + restantM;
    if (!(total > 0)) { frise.hidden = true; return; }
    frise.hidden = false;

    const pct = (m: number): string =>
      `${Math.min(Math.max((m / total) * 100, 0), 100).toFixed(2)}%`;

    frise.replaceChildren();

    /* LA PISTE PORTE LE TRAFIC (FRISE-2, 29/08). Chaque segment est peint à
       sa place : vert = AUCUN INCIDENT SIGNALÉ (jamais « ça roule » : Bison
       Futé publie des événements, pas un débit), orange = ralentissement
       annoncé, rouge = bouchon, accident ou route coupée. */
    for (const s of segmentsFrise(total, this.#evenements)) {
      const segment = document.createElement('span');
      segment.className = `bg-frise-segment bg-frise-${s.niveau}`;
      segment.style.bottom = pct(s.deM);
      segment.style.height = pct(s.aM - s.deM);
      frise.append(segment);
    }

    /* LE DRAPEAU À DAMIER AU SOMMET : « pour indiquer visuellement que ça
       correspond à l'arrivée » (Armelin). Sans lui, le haut de la barre
       était un bout de trait qui ne disait rien. */
    const arrivee = document.createElement('span');
    arrivee.className = 'bg-frise-arrivee';
    arrivee.setAttribute('aria-hidden', 'true');
    frise.append(arrivee);

    /* SEULS LES ARRÊTS PLANIFIÉS PORTENT UNE PASTILLE — Armelin, le 29/08 :
       « on ne devrait afficher sur cette barre que les éléments planifiés
       comme les arrêts aux bornes de recharge ». Les événements Bison Futé
       ne sont plus des losanges posés dessus : ils SONT la couleur de la
       piste, ce qui les explique au lieu de les juxtaposer. */
    for (const [i, a] of (this.#options?.arrets ?? []).entries()) {
      const point = document.createElement('span');
      point.className = 'bg-frise-arret';
      point.style.bottom = pct(a.avancementM);
      point.textContent = String(i + 1);
      frise.append(point);
    }

    const curseur = document.createElement('span');
    curseur.className = 'bg-frise-curseur';
    curseur.style.bottom = pct(avancementM);
    frise.append(curseur);
  }
}

customElements.define('bandeau-guidage', BandeauGuidage);
