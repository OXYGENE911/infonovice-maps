// <panneau-itineraire> — le planificateur A→B. Deux champs d'adresse (le
// composant de recherche est RÉUTILISÉ, pas dupliqué), deux profils, le
// résultat en distance/durée, et le tracé sur la carte.
//
// LE TRACÉ SURVIT AU CHANGEMENT DE FOND : `setStyle` (sélecteur de fonds)
// détruit toutes les sources ajoutées. Le panneau garde donc le dernier
// itinéraire et le repose à chaque `style.load` — sans cela, basculer en
// satellite effacerait silencieusement le trajet qu'on vient de calculer.
import type { Map as CarteMapLibre, GeoJSONSource } from 'maplibre-gl';
import { Marker } from 'maplibre-gl';
import { RechercheAdresse } from './recherche';
import { EtapesItineraire } from './etapes-itineraire';
import { calculerItineraire, formaterDistance, formaterDuree, PROFILS, EVITEMENTS, OPTIMISATIONS, ErreurItineraire, MAX_ETAPES, type Profil, type Itineraire, type Eviter, type Optimisation } from '../lib/itineraire';
import { formaterCoordonnees, type PointGeo } from '../lib/coordonnees';
import { lireRepere, REPERES, type CleRepere } from '../lib/reperes';
import { listerFavoris } from '../lib/favoris';
import { adresseInverse, type ResultatAdresse } from '../lib/adresse';
import { versGPX, versKML, telecharger } from '../lib/trace';
import { versFragment, depuisFragment } from '../lib/partage-url';
import { installerFeuilleBasse } from './feuille-basse';
import { pictoMenu } from './icone-menu';
import type { ConditionsTrajet, ProfilConditions } from '../lib/conditions';
import { PROFILS_PAUSE, chercherAgrements, ErreurPauses } from '../lib/pauses';
import { PREF_FILTRES } from './panneau-poi';
import { apprendreTrajet, lireHabitudes, suggerer } from '../lib/routines';
import { profilItineraire, denivele } from '../lib/altimetrie';
import { chargerGrille, estimerPeages } from '../lib/peages-tarifs';
import { pointLateral, choisirBis, traceDevant } from '../lib/bis';
import { capEntre } from './curseur-vehicule';
import { etapesItineraire, ErreurFeuille, type EtapeRoute } from '../lib/feuille-de-route';
import { stationsDuTrajet, distanceM, situerSurLeTrace, type SurLeTrajet } from '../lib/le-long-du-trajet';
import {
  planifierArrets, cleBorne, type PlanRecharge, type BorneCandidate,
} from '../lib/arrets';
import {
  indexNational, reseauxNationaux, chercherReseaux, cleReseau,
  ErreurIndex, SEUIL_RAPIDE, POIDS_ANNONCE,
  type StationRapide, type ReseauNational,
} from '../lib/index-bornes';
import { chargerCommodites, TYPES_COMMODITE, ErreurCommodites } from '../lib/commodites';
import { lirePreference, ecrirePreference } from '../lib/stockage';
import { PREF_VEHICULE } from './panneau-vehicule';
import { ErreurPoi } from '../lib/poi';
import { poserIconesPuissance, nomIcone } from './icone-puissance';
import { palierDe } from '../lib/puissance';
import { chargerPeages, ErreurPeages } from '../lib/peages';
import { chargerLimites } from '../lib/limites';
import { chargerTrafic, evenementsDuTrajet } from '../lib/trafic';
import {
  chargerMonuments, monumentsDuTrajet, ErreurMonuments, KM_PAR_MINUTE,
  type Monument,
} from '../lib/monuments';
import { svgCommodite } from './icone-commodite';
import { meteoA } from '../lib/meteo';
import type { FicheBorne } from './fiche-borne';
import type { FicheLieu } from './fiche-lieu';
import type { BandeauGuidage } from './bandeau-guidage';

const SOURCE = 'itineraire';
/* LES VARIANTES A/B/C — une seule source pour les trois : elles se
   distinguent par une propriété, pas par un calque de plus. */
const SOURCE_VARIANTES = 'itineraire-variantes';
/* Les lieux d'exception, en CALQUE (30/08) : voir `#poserLieuxSurCarte`. */
const SOURCE_LIEUX = 'itineraire-lieux';

/* LES TROIS VARIANTES, ET CE QU'ELLES SONT VRAIMENT (ITI-3, demande
   d'Armelin du 30/08 : « je souhaite avoir un itinéraire A, B et C pour
   voir les routes alternatives empruntées »).
   CE NE SONT PAS TROIS SORTIES D'UN MÊME OPTIMISEUR : le service public ne
   publie aucun paramètre « alternatives » (mesuré en PR #6, reconfirmé le
   29/08). Ce sont TROIS ITINÉRAIRES RÉELS, calculés séparément avec trois
   consignes différentes — ce qui est plus honnête qu'un classement inventé,
   et souvent plus utile : on voit ce que chaque consigne coûte. */
export const VARIANTES = [
  { cle: 'A', libelle: 'Le plus rapide', optimisation: 'fastest' as Optimisation,
    sansAutoroute: false },
  { cle: 'B', libelle: 'Le plus court', optimisation: 'shortest' as Optimisation,
    sansAutoroute: false },
  { cle: 'C', libelle: 'Sans autoroute', optimisation: 'fastest' as Optimisation,
    sansAutoroute: true },
] as const;
/* LES BORNES DU MODE TRAJET — deux sources : le corridor (toutes les bornes à
   portée du tracé, cliquables) et les arrêts du plan (pastilles numérotées).
   Elles remplacent l'affichage national pendant qu'un plan est à l'écran :
   « que toutes les autres bornes de France disparaissent de la carte afin de
   n'afficher que les bornes suggérées, ainsi que toutes les autres bornes
   présentes sur le trajet » (Armelin, 27/08/2026). */
const SOURCE_CORRIDOR = 'iti-bornes-trajet';
const SOURCE_ARRETS = 'iti-arrets';
/** La couleur des arrêts retenus — celle des bornes, mais pleine et cerclée. */
/* BLEU MARQUE, PAS LE VERT DU PALIER : « les étapes de recharge ne
   devraient pas afficher un rond vert, pour les différencier des bornes
   ultra rapides » (Armelin, 29/08) — le vert #1E9E5A était EXACTEMENT la
   couleur du palier « charge très rapide ». */
const COULEUR_ARRET = '#0C447C';

/** Ce que le planificateur sait demander à la couche des bornes nationales. */
export interface PorteCouchesBornes {
  masquerBornesNationales(masquees: boolean): void;
}

/** Les pages du planificateur, et leur titre. */
/* LES PAGES QUI COMMANDENT LA CARTE — voir #allerA. Elles gardent la
   colonne : leur effet se lit SUR la carte, pas dans la page. */
const PAGES_COLONNE = new Set<string>(['couches', 'recharge']);

/* LES RÉGLAGES QUI DÉCRIVENT UNE MANIÈRE DE ROULER, et qui se gardent donc
   d'un trajet à l'autre. La clé leur est commune : un seul enregistrement,
   une seule relecture, et rien à oublier quand la liste s'allonge. */
export const PREF_REGLAGES = 'reglages-recharge';
const REGLAGES_MEMORISES = ['.recharge-cible', '.recharge-reserve', '.recharge-plafond',
  '.recharge-pause-min', '.recharge-pause-intervalle', '.recharge-pause-profil',
  '.monuments-detour'] as const;

const VUES = {
  accueil: 'Où allez-vous ?',
  vehicule: 'Mon véhicule',
  couches: 'Recharge et services',
  options: 'Options du trajet',
  recharge: 'Arrêts de recharge',
  feuille: 'Feuille de route',
  trajet: 'Sur le trajet',
  meteo: 'Météo à l’arrivée',
  alti: 'Profil altimétrique',
  monuments: 'Lieux d’exception',
  partage: 'Partager ou exporter',
} as const;

type CleVue = keyof typeof VUES;


export class PanneauItineraire extends HTMLElement {
  #carte: CarteMapLibre | null = null;
  #depart: PointGeo | null = null;
  #arrivee: PointGeo | null = null;
  /* LES LIBELLÉS DES DEUX POINTS, suivis pour l'INVERSION : échanger les
     coordonnées sans échanger les textes mentirait dans les champs. */
  #libelleDepart = '';
  #libelleArrivee = '';
  #profil: Profil = 'car';
  #eviter = new Set<Eviter>();

  /* L'OPTIMISATION — le cadrage des « profils de trajet » (mandat 28/08) :
     le moteur ne connaît que fastest et shortest (getcapabilities du 28/08),
     on n'expose que cela. Les évitements couvrent déjà le reste du levier. */
  #optimisation: Optimisation = 'fastest';
  /** Jeton anti-réponses-hors-d'ordre de #calculer (voir le commentaire là-bas). */
  #sequence = 0;
  #dernier: Itineraire | null = null;
  /** Le cliché complet qui a produit #dernier — il vieillit AVEC lui : un
      recalcul raté laisse les deux cohérents entre eux. Feuille de route,
      lien partagé et marqueurs se lisent ICI, jamais dans l'état vivant. */
  #calculPour: {
    depart: PointGeo; arrivee: PointGeo; profil: Profil;
    etapes: PointGeo[]; eviter: Eviter[]; optimisation: Optimisation;
  } | null = null;
  /** Itinéraire dont la feuille de route est chargée (ou en cours). */
  #feuillePour: Itineraire | null = null;
  #rechargePour: Itineraire | null = null;
  #annulationRecharge: AbortController | null = null;
  /** Itinéraire dont les lieux d'exception sont calculés (ou en cours). */
  #monumentsPour: Itineraire | null = null;
  /* LES LIEUX POSÉS SUR LA CARTE, dans l'ordre du calque : le clic rend un
     rang, cette liste rend le lieu. */
  #lieuxPoses: Monument[] = [];
  #annulationTrajet: AbortController | null = null;
  #marqueursTrajet: Marker[] = [];
  #marqueurs: Marker[] = [];
  /* LA COUCHE DES BORNES NATIONALES, pour l'effacer pendant qu'un plan est à
     l'écran. Posée par carte.ts ; le panneau reste utilisable sans elle. */
  #couchesBornes: PorteCouchesBornes | null = null;
  /** Vrai quand les couches du mode trajet sont posées sur la carte. */
  #modeTrajetPose = false;
  /* LE CARTOUCHE DE DÉTAIL, partagé avec le panneau des couches (voir
     carte.ts) : un seul pour l'application, jamais deux ouverts. */
  #fiche: FicheBorne | null = null;
  /** Le cartouche des lieux d'exception, posé par carte.ts. */
  #ficheLieu: FicheLieu | null = null;
  /** Le dernier plan de recharge, pour que le résumé du haut le prenne en
      compte — voir `#majResume`. */
  #planCourant: PlanRecharge | null = null;
  /* TOUTES LES BORNES DU TRAJET, et non les seules retenues : Armelin, le
     25/08, veut « afficher toutes les bornes présentes sur le trajet avec des
     + et des - pour choisir moi-même les arrêts ». Elles sont calculées une
     fois par itinéraire, puis relues à chaque changement de consigne. */
  #bornesTrajet: SurLeTrajet<StationRapide>[] = [];
  /** Les clés que l'usager impose, et celles qu'il refuse. */
  #imposees = new Set<string>();
  /* LES ARRÊTS DE COURTOISIE (30/08) : ajoutés à la main, ils n'entrent PAS
     dans le calcul tant que l'usager ne le demande pas. Voir `basculerArret`. */
  #courtoisie = new Set<string>();
  #ecartees = new Set<string>();
  /** Exploitants retenus pour ce trajet. Vide = tous. */
  #reseauxPreferes = new Set<string>();
  /** Ce qui est tapé dans la recherche de réseau du plan. */
  #rechercheReseau = '';
  /** La page affichée. Une seule à la fois — voir `#allerA`. */
  #vue: CleVue = 'accueil';
  /* L'ÉTAT DÉPLIÉ DES DEUX VOLETS SURVIT À LA RECONSTRUCTION DU PLAN.
     `#afficherRecharge` reconstruit tout son corps ; sans cette mémoire,
     imposer un arrêt refermait la liste d'où l'on venait de le choisir, et il
     fallait la rouvrir pour le suivant. Un réglage qui se referme à chaque
     usage est un réglage qu'on cesse d'utiliser. */
  #voletsOuverts: { reseaux: boolean; toutes: boolean } = { reseaux: false, toutes: false };
  /** Le profil véhicule du dernier plan, pour rejouer sans relire IndexedDB. */
  #vehiculeCourant: { capaciteKwh: number; consommationKwh100: number; puissanceMaxKw: number } | null = null;

  /* LES CONDITIONS DU TRAJET (28/08) — température aux deux bouts, dénivelé,
     vitesse moyenne. Relevées UNE fois par itinéraire quand la page recharge
     s'ouvre, puis relues localement à chaque rejouage de plan : cocher une
     case ne rappelle ni Open-Meteo ni l'altimétrie. */
  #conditions: ConditionsTrajet | null = null;

  #conditionsPour: Itineraire | null = null;

  /** Masse et bridages thermiques du véhicule courant. */
  #profilConditions: ProfilConditions = {};

  /* LES AGRÉMENTS DU PROFIL DE PAUSE — relevés UNE fois par (trajet, profil),
     rejoués localement ensuite. */
  #agrements: Map<string, number> | null = null;

  #agrementsPour: { iti: Itineraire; profil: string } | null = null;

  #annulationAgrements: AbortController | null = null;

  /* LE PLAN SE CALCULE TOUT SEUL (retour d'Armelin du 29/08 : « il faut
     cliquer sur Arrêts de recharge pour que le planificateur se mette à
     calculer, mais ce n'est pas intuitif ») : un trajet calculé avec un
     véhicule renseigné déclenche le plan sans qu'on y pense — débordé d'une
     seconde pour laisser passer les rafales de recalcul. */
  #minuteurPlanAuto: ReturnType<typeof setTimeout> | undefined;

  /** Vrai pendant le calcul automatique — le résumé le dit. */
  #planEnCours = false;

  /** Les réseaux préférés ont-ils été hérités du filtre carte pour CE trajet ? */
  #reseauxHerites = false;

  /** Vrai quand le prochain calcul réussi doit RELANCER le suivi — le
      recalcul automatique hors-route (demande d'Armelin du 29/08). */
  #reprendreSuivi = false;

  /* L'HEURE DE DÉPART (mode « arrivée réelle », 29/08) : vide, on part
     maintenant. Réglée, elle décale l'heure d'arrivée affichée ET les
     relevés météo du plan — partir à 6 h ou à 18 h ne donne pas le même
     plan d'hiver. */
  #departA: Date | null = null;
  #socDepart = 100;

  set fiche(f: FicheBorne) { this.#fiche = f; }

  set ficheLieu(f: FicheLieu) { this.#ficheLieu = f; }

  /* LA POSITION DU VÉHICULE, quand la géolocalisation l'a donnée — la même
     que celle du panneau du véhicule, posée par carte.ts. Elle sert de départ
     PAR DÉFAUT : Armelin, le 26/08/2026, décrivant ABRP, « une fois qu'on a
     mis le champ destination, ça calcule automatiquement par rapport à notre
     position actuelle ».
     ELLE N'EST JAMAIS DEMANDÉE D'OFFICE. On se sert de ce qu'on a déjà —
     parce que l'usager a pressé « Me localiser » ou démarré un suivi — et l'on
     ne provoque rien. C'est la contrainte 4 du projet, et elle ne se négocie
     pas pour un confort. */
  #position: PointGeo | null = null;

  set position(p: PointGeo) {
    this.#position = p;
    this.#majRaccourcis().catch(() => { /* confort : son échec ne casse rien */ });
    // Une destination déjà posée sans départ profite immédiatement du fixe.
    if (this.#arrivee && !this.#depart) this.#partirDeLaPositionConnue();
  }

  /** Utilise la position déjà connue comme départ. Muet s'il n'y en a pas. */
  #partirDeLaPositionConnue(): void {
    const p = this.#position;
    if (!p || this.#depart) return;
    this.#poser('depart', p, 'Ma position');
    const erreur = this.querySelector('.iti-erreur') as HTMLElement;
    erreur.hidden = true;
  }

  /**
   * Pose une destination venue d'ailleurs, et calcule.
   *
   * LE POINT D'ENTRÉE DES AUTRES COMPOSANTS. Armelin, le 26/08/2026 : « les
   * services à proximité sont affichés mais ça ne me donne pas la possibilité
   * de cliquer dessus pour programmer un itinéraire vers ce service ». Une
   * liste qu'on lit sans pouvoir y aller demande de recopier un nom dans un
   * champ de recherche — pour un restaurant qu'on regarde déjà sur la carte.
   *
   * LE VOLET S'OUVRE, parce qu'un itinéraire calculé dans un panneau fermé ne
   * se voit pas, et le champ porte le NOM du lieu : « itinéraire vers 2,4487 ;
   * 48,7913 » ne dit à personne vers quoi il va.
   */
  allerVers(point: PointGeo, libelle: string): void {
    (this.querySelector('details') as HTMLDetailsElement | null)?.setAttribute('open', '');
    this.#poser('arrivee', point, libelle);

    /* SANS DÉPART, LE CALCUL NE PART PAS — ET IL FAUT LE DIRE. Le garde-fou de
       `#calculer` rend la main en silence quand une extrémité manque : le clic
       sur « Itinéraire » depuis un commerce ne produisait alors RIEN, pas même
       un message, et l'on pouvait croire l'application cassée.
       Depuis le 27/08, on ne se contente plus de le dire : on PROPOSE le
       départ le plus probable — la position actuelle — au lieu de renvoyer
       l'usager à un champ vide. */
    /* SI LA POSITION EST DÉJÀ CONNUE, ON PART DE LÀ. C'est le geste d'ABRP :
       on dit où l'on va, le reste se déduit. Rien n'est demandé au GPS ici —
       on se sert seulement de ce qu'on a. */
    this.#partirDeLaPositionConnue();

    if (!this.#depart) {
      const erreur = this.querySelector('.iti-erreur') as HTMLElement;
      erreur.textContent = `Destination posée sur « ${libelle} ».`
        + ' Choisissez votre départ : « Ma position », un lieu enregistré,'
        + ' ou une adresse.';
      erreur.hidden = false;
      this.querySelector<HTMLInputElement>('[data-role="depart"] input')?.focus();
    }
  }

  /* LE BANDEAU DE SUIVI, posé par carte.ts. Le panneau reste utilisable sans
     lui : le bouton « Démarrer » ne paraît alors tout simplement pas, plutôt
     que d'échouer au clic. */
  #guidage: BandeauGuidage | null = null;

  set guidage(b: BandeauGuidage) {
    this.#guidage = b;
    // Le bandeau se referme aussi de lui-même : le bouton doit le savoir.
    b.addEventListener('guidage-arrete', () => { this.#majBoutonDemarrer(); });
    this.#majBoutonDemarrer();
  }

  /**
   * Loge un panneau existant dans une page du planificateur.
   *
   * LEUR LOGIQUE NE BOUGE PAS. Le panneau du véhicule et celui des couches
   * gardent leur `<details>` interne — la feuille de style en masque le
   * `<summary>` et le tient ouvert. Les réécrire pour qu'ils rendent un corps
   * nu aurait touché deux fichiers de plusieurs centaines de lignes pour un
   * gain purement cosmétique, et fait courir un risque là où rien ne le
   * demandait.
   */
  loger(vue: 'vehicule' | 'couches', element: HTMLElement): void {
    this.querySelector(`.vue[data-vue="${vue}"]`)?.appendChild(element);
  }

  set couchesBornes(p: PorteCouchesBornes) { this.#couchesBornes = p; }

  set carte(c: CarteMapLibre) {
    this.#carte = c;
    // Repose le tracé après chaque changement de style (fond).
    c.on('style.load', () => {
      if (this.#dernier) this.#tracer(this.#dernier);
      // Les bornes du mode trajet aussi : setStyle détruit leurs sources.
      this.#modeTrajetPose = false;
      if (this.#bornesTrajet.length > 0) this.#poserBornesTrajet();
    });
    /* LES BORNES DU TRAJET SE CLIQUENT, arrêts du plan comme candidates :
       « sélectionner une borne pour en voir son détail et décider de la
       retirer », « sélectionner une borne non proposée et proposer de
       l'ajouter » (Armelin, 27/08). Les gestionnaires par couche de MapLibre
       s'enregistrent sans que la couche existe encore : ils ne s'activent
       qu'à sa pose. */
    for (const couche of ['iti-arrets-pastille', 'iti-corridor']) {
      c.on('click', couche, (e) => {
        const natif = e.originalEvent as Event & { __clicPris?: boolean };
        if (natif.__clicPris) return;
        natif.__clicPris = true;
        const f = e.features?.[0];
        if (!f || f.geometry.type !== 'Point') return;
        const p = f.properties ?? {};
        const [lon, lat] = f.geometry.coordinates as [number, number];
        this.#fiche?.ouvrir({
          id: typeof p['id'] === 'string' && p['id'] ? p['id'] : null,
          lon: lon!, lat: lat!,
          nom: typeof p['nom'] === 'string' && p['nom'] ? p['nom'] : 'Station de recharge',
        });
      });
      c.on('mouseenter', couche, () => { c.getCanvas().style.cursor = 'pointer'; });
      c.on('mouseleave', couche, () => { c.getCanvas().style.cursor = ''; });
    }
  }

  connectedCallback(): void {
    this.innerHTML = `
      <details class="iti surface-de-travail">
        <summary aria-label="Ouvrir le planificateur d’itinéraire">${pictoMenu('itineraire')}Itinéraire</summary>
        <div class="iti-corps">

          <!-- LA TÊTE DE NAVIGATION. Une seule page à l'écran, un titre qui
               dit laquelle, et une flèche pour revenir. Armelin, le
               26/08/2026 : « au lieu d'afficher la fenêtre en gros plan pour
               configurer les filtres ou les options, le site déroule seulement
               un formulaire en cascade et on doit scroller dans la fenêtre ».
               Il a raison : cinq volets dépliables dans une colonne de trois
               cents pixels forment un couloir, pas une interface. -->
          <div class="vue-tete">
            <button type="button" class="vue-retour" hidden
              aria-label="Revenir au trajet">←</button>
            <h2 class="vue-titre">Où allez-vous ?</h2>
            <!-- UNE FENÊTRE SE FERME (FEN-5, 29/08). Armelin, deux fois :
                 « je n'ai toujours pas de fenêtre flottante ». La flèche
                 REMONTE d'une page ; il manquait le geste qui congédie tout
                 — c'est lui, autant que la position, qui fait lire une
                 fenêtre plutôt qu'un tiroir. -->
            <button type="button" class="vue-fermer" hidden
              aria-label="Fermer la fenêtre">✕</button>
          </div>

          <!-- ======================= ACCUEIL ======================= -->
          <!-- MINIMALISTE, ET DANS L'ORDRE OÙ L'ON PENSE. On sait où l'on veut
               aller ; on part de là où l'on est. La destination vient donc en
               premier, le départ se règle après et seulement si l'on veut. -->
          <section class="vue vue-accueil" data-vue="accueil">
            <!-- LES DEUX EXTRÉMITÉS, ET RIEN D'AUTRE. Un trajet en demande
                 deux : les séparer sur deux pages ferait un aller-retour pour
                 chaque correction. Le DÉPART vient en premier parce que c'est
                 l'ordre du voyage, mais il se remplit tout seul dès que la
                 position est connue — « une fois qu'on a mis le champ
                 destination, ça calcule automatiquement par rapport à notre
                 position actuelle » (Armelin, décrivant ABRP). -->
            <!-- LES ROUTINES (décision d'Armelin du 29/08) : le trajet
                 HABITUEL du moment se propose en un geste — « Au travail »
                 un matin de semaine, « À la maison » le soir, les habitudes
                 apprises LOCALEMENT sinon. Rien ne quitte le navigateur, et
                 le volet Favoris sait tout effacer. -->
            <div class="iti-routines" role="group" aria-label="Trajets habituels" hidden></div>

            <label class="iti-champ-principal">Départ
              <span class="iti-porte" data-role="depart"></span>
            </label>
            <div class="iti-raccourcis" data-pour="depart"
              role="group" aria-label="Choisir un départ enregistré"></div>

            <!-- L'INVERSION — rentrer, c'est le même trajet à l'envers. -->
            <button type="button" class="iti-inverser" hidden
              aria-label="Inverser départ et destination">⇅ Inverser</button>

            <span class="iti-inter"></span>

            <label class="iti-champ-principal">Destination
              <span class="iti-porte" data-role="arrivee"></span>
            </label>
            <div class="iti-raccourcis" data-pour="arrivee"
              role="group" aria-label="Choisir une arrivée enregistrée"></div>

            <!-- L'HEURE DE DÉPART — le mode « arrivée réelle » (29/08).
                 Vide : maintenant. Une heure déjà passée vise DEMAIN. -->
            <label class="iti-depart-heure">Départ à
              <input type="time" class="iti-heure" aria-label="Heure de départ">
              <span class="iti-heure-note">vide : maintenant</span>
            </label>

            <p class="iti-resultat" role="status" hidden></p>
            <p class="iti-erreur" role="alert" hidden></p>

            <div class="iti-actions" hidden>
              <button type="button" class="iti-demarrer" hidden>Démarrer le suivi</button>
            </div>

            <!-- DEUX MENUS, PARCE QU'IL Y A DEUX SORTES DE PAGES.
                 Le véhicule, les couches et les options ne DÉPENDENT PAS d'un
                 trajet : on règle sa voiture avant de savoir où l'on va, et
                 l'on regarde les bornes autour de soi sans rien planifier. Les
                 masquer tant qu'aucun trajet n'existe les rendrait
                 inatteignables au moment précis où l'on en a besoin.
                 Les autres décrivent un trajet, et n'ont donc rien à montrer
                 tant qu'il n'y en a pas : les proposer mènerait à des pages
                 vides. -->
            <nav class="iti-menu iti-menu-toujours" aria-label="Réglages">
              <button type="button" class="iti-vers" data-vers="vehicule">
                ${pictoMenu('vehicule')}<span>Mon véhicule</span><span aria-hidden="true">›</span></button>
              <button type="button" class="iti-vers" data-vers="couches">
                ${pictoMenu('couches')}<span>Recharge et services</span><span aria-hidden="true">›</span></button>
              <button type="button" class="iti-vers" data-vers="options">
                ${pictoMenu('options')}<span>Options du trajet</span><span aria-hidden="true">›</span></button>
            </nav>

            <!-- LE MENU S'EST ALLÉGÉ LE 29/08, sur les retours d'Armelin :
                 « Sur le trajet » retiré (la carte montre déjà toutes les
                 bornes), « Météo à l'arrivée » retiré (elle vit dans le
                 COPILOTE pendant le suivi), « Profil altimétrique » déplacé
                 dans le copilote aussi — et « Lieux d'exception » REMONTE :
                 tout en bas d'un menu à rallonge, « on peut vite l'oublier ». -->
            <nav class="iti-menu" aria-label="Détails du trajet" hidden>
              <button type="button" class="iti-vers" data-vers="recharge">
                ${pictoMenu('recharge')}<span>Arrêts de recharge</span><span aria-hidden="true">›</span></button>
              <button type="button" class="iti-vers" data-vers="monuments">
                ${pictoMenu('monuments')}<span>Lieux d’exception</span><span aria-hidden="true">›</span></button>
              <button type="button" class="iti-vers" data-vers="feuille">
                ${pictoMenu('feuille')}<span>Feuille de route</span><span aria-hidden="true">›</span></button>
              <button type="button" class="iti-vers iti-vers-partage" data-vers="partage">
                ${pictoMenu('partage')}<span>Partager ou exporter</span><span aria-hidden="true">›</span></button>
            </nav>

            <!-- « EFFACER » N'EXISTE QUE S'IL Y A QUELQUE CHOSE À EFFACER —
                 le mandat UX du 28/08 : un bouton d'effacement devant des
                 champs vides est une menace sans objet. -->
            <button type="button" class="iti-effacer" hidden>Effacer le trajet</button>
          </section>

          <!-- ============= VÉHICULE ET COUCHES, EN PAGES ============= -->
          <!-- UN SEUL POINT D'ENTRÉE. Armelin, le 26/08/2026 : « il y a trois
               boutons dans la page d'accueil "Itinéraire", "Recharge et
               services" et "Véhicule", qui pourraient tous être regroupés dans
               un unique bouton "Itinéraire" […] Un seul bouton est plus
               efficace à comprendre que trois boutons où il faudra se rappeler
               dans quel menu on peut trouver quelle option. »
               Les deux panneaux existants viennent s'y loger tels quels : leur
               logique ne bouge pas, seule leur enveloppe disparaît. -->
          <section class="vue vue-hote" data-vue="vehicule" hidden></section>
          <section class="vue vue-hote" data-vue="couches" hidden></section>

          <!-- ======================= OPTIONS ======================= -->
          <section class="vue" data-vue="options" hidden>
            <div class="iti-profils" role="radiogroup" aria-label="Mode de déplacement">
              ${(Object.keys(PROFILS) as Profil[]).map((p) => `
                <label class="iti-profil"><input type="radio" name="profil" value="${p}"
                  ${p === this.#profil ? 'checked' : ''}
                  >${pictoMenu(p === 'car' ? 'vehicule' : 'pieton')}<span>${PROFILS[p]}</span></label>`).join('')}
            </div>
            <!-- L'OPTIMISATION : les deux seules que le moteur CONNAÎT.
                 « Économe » et « Sans péage » sont écartés avec la mesure
                 (aucun modèle de consommation, aucune contrainte de péage
                 côté service — consigné au triage du 28/08). -->
            <div class="iti-optimisations" role="radiogroup" aria-label="Optimiser le trajet">
              ${(Object.keys(OPTIMISATIONS) as Optimisation[]).map((o) => `
                <label class="iti-profil"><input type="radio" name="optimisation" value="${o}"
                  ${o === this.#optimisation ? 'checked' : ''}
                  >${pictoMenu(o === 'fastest' ? 'rapide' : 'court')}<span>${OPTIMISATIONS[o]}</span></label>`).join('')}
            </div>
            <fieldset class="iti-eviter">
              <legend>Éviter</legend>
              ${(Object.keys(EVITEMENTS) as Eviter[]).map((v) => `
                <label class="iti-evite"><input type="checkbox" value="${v}"
                  >${pictoMenu(v)}<span>${EVITEMENTS[v]}</span></label>`).join('')}
            </fieldset>
            <!-- COMPARER AVEC ET SANS AUTOROUTE — le verdict de l'étude
                 « alternatives » du 27/08 : pas de moteur, pas de vrais
                 itinéraires A/B/C ; mais DEUX variantes honnêtes, nommées par
                 ce qu'elles sont, avec le plan de recharge de chacune. Un
                 appel au moteur par comparaison, à la demande. -->
            <div class="iti-comparer">
              <button type="button" class="iti-comparer-lancer">Comparer trois
                itinéraires (A, B, C)</button>
              <div class="iti-comparer-corps" role="status"></div>
            </div>
            <!-- LES PÉAGES SE RELÈVENT, ILS NE S'ÉVITENT PAS — le moteur
                 public n'a pas de clause péage (mesuré PR #6), et l'étude du
                 27/08 (docs/etudes-mandat-27-08.md §2) a tranché : nommer les
                 gares du tracé, pour comparer soi-même avec la variante sans
                 autoroute. À LA DEMANDE : Overpass est un commun bénévole. -->
            <div class="iti-peages">
              <button type="button" class="iti-peages-chercher">Relever les
                péages du trajet</button>
              <p class="iti-peages-corps" role="status"></p>
            </div>
          </section>

          <!-- ======================= RECHARGE ======================= -->
          <section class="vue" data-vue="recharge" hidden>
            <div class="iti-recharge-reglages">
              <label>Arriver avec
                <select class="recharge-cible" aria-label="Charge voulue à l’arrivée">
                  <option value="5">5 %</option>
                  <option value="10" selected>10 %</option>
                  <option value="15">15 %</option>
                  <option value="20">20 %</option>
                  <option value="30">30 %</option>
                </select>
              </label>
              <!-- « ARRIVER AUX BORNES AVEC AU MOINS » : c'est la même réserve
                   qu'avant, mais nommée par ce qu'elle décide. Armelin, le
                   27/08 : « choisir à combien de pourcentage de batterie il
                   souhaite arriver sur une borne de recharge ». Le réglage
                   existait — sous un intitulé qui ne répondait pas à la
                   question posée. -->
              <label>Arriver aux bornes avec au moins
                <select class="recharge-reserve" aria-label="Réserve minimale en route">
                  <option value="5">5 %</option>
                  <option value="10" selected>10 %</option>
                  <option value="15">15 %</option>
                  <option value="20">20 %</option>
                  <option value="30">30 %</option>
                </select>
              </label>
              <!-- LE PLAFOND DE CHARGE — « filtré à 80 % maximum » (Armelin,
                   27/08). « Au besoin » est le défaut : on charge ce qu'il
                   faut, comme avant ce réglage. -->
              <label>Repartir des bornes au plus à
                <!-- ÉLARGI 50-90 (mandat UX 28/08, EV-1) : sous 80 %, la
                     charge reste dans la zone rapide de la courbe — certains
                     préfèrent TROIS arrêts éclair à un plein. Un plafond
                     intenable reste refusé avec son remède. -->
                <select class="recharge-plafond" aria-label="Plafond de charge aux bornes">
                  <option value="50">50 %</option>
                  <option value="60">60 %</option>
                  <option value="70">70 %</option>
                  <option value="80">80 %</option>
                  <option value="90">90 %</option>
                  <option value="100" selected>au besoin</option>
                </select>
              </label>
              <!-- LES PAUSES HUMAINES (décision d'Armelin du 28/08). Un
                   trajet électrique s'arrête de toute façon : autant que
                   l'arrêt serve AUSSI les humains à bord. La pause PAIE la
                   charge ; le profil est une PRÉFÉRENCE honorée par les
                   données OSM (mesure du 28/08), jamais un filtre. -->
              <label>Chaque arrêt dure au moins
                <select class="recharge-pause-min" aria-label="Durée minimale de chaque arrêt">
                  <option value="0" selected>le temps de charge</option>
                  <option value="20">20 min</option>
                  <option value="30">30 min</option>
                  <option value="45">45 min</option>
                </select>
              </label>
              <label>Une pause au moins toutes les
                <select class="recharge-pause-intervalle" aria-label="Temps de route maximal entre deux pauses">
                  <option value="0" selected>— au besoin</option>
                  <option value="120">2 h de route</option>
                  <option value="180">3 h de route</option>
                </select>
              </label>
              <label>Autour des arrêts, privilégier
                <select class="recharge-pause-profil" aria-label="Profil de pause">
                  <option value="" selected>rien de particulier</option>
                  ${PROFILS_PAUSE.map((pr) => `
                    <option value="${pr.cle}">${pr.libelle}</option>`).join('')}
                </select>
              </label>
              <p class="recharge-pause-etat" role="status"></p>
            </div>
            <!-- LE RECALCUL EST UN GESTE, PAS UNE FATALITÉ (30/08). Ajouter
                 un arrêt ne refait plus le plan : il s'insère comme arrêt de
                 courtoisie. Ce bouton rend la main au calcul quand l'usager
                 le veut — « ce qui offre le choix de personnaliser avec un
                 recalcul automatique ou tout gérer en manuel ». -->
            <button type="button" class="recharge-recalculer" hidden>Recalculer
              les arrêts en gardant les miens</button>
            <div class="iti-recharge-corps" role="status"></div>
          </section>

          <!-- ======================= FEUILLE DE ROUTE ======================= -->
          <section class="vue" data-vue="feuille" hidden>
            <div class="iti-feuille-corps" role="status"></div>
          </section>




          <!-- ================== LIEUX D'EXCEPTION ================== -->
          <!-- Les monuments CLASSÉS de la base Mérimée à un détour
               raisonnable du tracé — la demande Nomadio du 27/08/2026 :
               « le détour maximal acceptable en termes de minutes ». -->
          <section class="vue" data-vue="monuments" hidden>
            <div class="iti-monuments-reglages">
              <label>À moins de
                <select class="monuments-detour" aria-label="Détour maximal en minutes">
                  <option value="5">5 min</option>
                  <option value="10" selected>10 min</option>
                  <option value="20">20 min</option>
                  <option value="30">30 min</option>
                </select>
                de détour environ
              </label>
            </div>
            <div class="iti-monuments-corps" role="status"></div>
          </section>

          <!-- ======================= PARTAGE ======================= -->
          <!-- UN SEUL BOUTON EN FAÇADE, TROIS CHOIX DERRIÈRE. Armelin, le
               26/08 : « les boutons GPX et KML nuisent à l'ergonomie en
               affichant des boutons que peu de gens comprendront ». GPX et
               KML sont des mots de métier ; « partager » est un geste. -->
          <section class="vue" data-vue="partage" hidden>
            <!-- LA FEUILLE DE PARTAGE DU SYSTÈME D'ABORD — la demande des
                 amis d'Armelin (29/08) : « le même type de partage que sur
                 mobile Android ». C'est navigator.share, l'API standard :
                 le SYSTÈME propose ses applis (messagerie, courriel, Drive,
                 Bluetooth…) puis Copier / Imprimer / Enregistrer — deux
                 niveaux qu'aucune liste maison n'égalera, et zéro service
                 tiers. Le bouton n'apparaît que là où l'API existe : un
                 bouton qui ne ferait rien serait un mensonge. -->
            <button type="button" class="iti-partager-sys" hidden>Partager…</button>
            <p class="vue-note iti-partager-sys-note" hidden>La feuille de
              partage de votre appareil : messagerie, courriel, enregistrement…
              C’est votre système qui propose, jamais nous.</p>
            <button type="button" class="iti-lien">Copier le lien du trajet</button>
            <p class="vue-note">Le lien contient le trajet, rien d’autre : ni
              compte, ni identifiant, ni trace. Il s’ouvre sur n’importe quel
              appareil.</p>
            <div class="iti-exports">
              <button type="button" class="iti-gpx">Fichier GPX</button>
              <button type="button" class="iti-kml">Fichier KML</button>
            </div>
            <p class="vue-note">GPX pour un GPS de randonnée ou un compteur de
              vélo, KML pour un globe virtuel. Les deux se téléchargent sans
              rien envoyer nulle part.</p>
          </section>
        </div>
      </details>`;

    for (const role of ['depart', 'arrivee'] as const) {
      const champ = new RechercheAdresse();
      champ.surSelection = (r: ResultatAdresse) => {
        if (role === 'depart') { this.#depart = r; this.#libelleDepart = r.libelle; }
        else { this.#arrivee = r; this.#libelleArrivee = r.libelle; }
            /* CHOISIR UNE DESTINATION SUFFIT quand on sait déjà où l'on est :
           « une fois qu'on a mis le champ destination, ça calcule
           automatiquement par rapport à notre position actuelle ». */
        if (role === 'arrivee') this.#partirDeLaPositionConnue();
        void this.#calculer();
      };
      this.querySelector(`[data-role="${role}"]`)?.appendChild(champ);
    }
    const etapes = new EtapesItineraire();
    etapes.addEventListener('etapes-changees', () => { void this.#calculer(); });
    this.querySelector('.iti-inter')?.appendChild(etapes);
    this.querySelectorAll('.iti-optimisations input').forEach((c) => {
      c.addEventListener('change', () => {
        this.#optimisation = (c as HTMLInputElement).value as Optimisation;
        void this.#calculer();
      });
    });
    this.querySelectorAll('.iti-eviter input').forEach((c) => {
      c.addEventListener('change', () => {
        const case_ = c as HTMLInputElement;
        if (case_.checked) this.#eviter.add(case_.value as Eviter);
        else this.#eviter.delete(case_.value as Eviter);
        void this.#calculer();
      });
    });
    this.querySelectorAll('input[name="profil"]').forEach((r) => {
      r.addEventListener('change', () => {
        this.#profil = (r as HTMLInputElement).value as Profil;
        void this.#calculer();
      });
    });
    this.querySelector('.iti-demarrer')?.addEventListener('click', () => {
      void this.#demarrerSuivi();
    });
    /* À CHAQUE OUVERTURE : domicile, travail et favoris se définissent
       ailleurs, et une liste figée au démarrage les aurait ignorés. */
    this.querySelector('details')?.addEventListener('toggle', () => {
      if ((this.querySelector('details') as HTMLDetailsElement).open) {
        void this.#majRaccourcis();
    this.#allerA('accueil');
      }
    });
    void this.#majRaccourcis();
    this.#allerA('accueil');
    this.querySelector('.iti-effacer')?.addEventListener('click', () => this.#effacer());

    /* L'HEURE DE DÉPART change l'arrivée affichée ET les relevés météo :
       les conditions du trajet sont invalidées, le plan se refera. */
    this.querySelector('.iti-heure')?.addEventListener('change', () => {
      const brut = (this.querySelector('.iti-heure') as HTMLInputElement).value;
      if (!brut) {
        this.#departA = null;
      } else {
        const [h, m] = brut.split(':').map(Number);
        const quand = new Date();
        quand.setHours(h ?? 0, m ?? 0, 0, 0);
        // Une heure déjà passée (cinq minutes de grâce) vise DEMAIN.
        if (quand.getTime() < Date.now() - 5 * 60_000) {
          quand.setDate(quand.getDate() + 1);
        }
        this.#departA = quand;
      }
      this.#conditions = null;
      this.#conditionsPour = null;
      this.#rechargePour = null;
      this.#majResume();
      if (this.#dernier) {
        clearTimeout(this.#minuteurPlanAuto);
        this.#minuteurPlanAuto = setTimeout(() => { void this.#planifierRecharge(true); }, 800);
      }
    });

    /* UN VÉHICULE MODIFIÉ INVALIDE LE PLAN (29/08) : capacité, autonomie ou
       bridage changés, le plan décrit une autre voiture. Il se refait tout
       seul, avec le même amorti que le calcul de trajet — la saisie champ à
       champ ne déclenche qu'un recalcul. */
    /* LE RECALCUL AUTOMATIQUE HORS-ROUTE (demande d'Armelin du 29/08 :
       « un mode de recalcul automatique si on s'est trompé de route »). Le
       bandeau constate l'écart qui dure ; ICI on refait l'itinéraire depuis
       la position, on garde les étapes encore DEVANT, et le suivi repart
       tout seul sur le nouveau tracé. */
    document.addEventListener('recalcul-hors-route', (e) => {
      const d = (e as CustomEvent<{ lon: number; lat: number }>).detail;
      void this.#recalculerDepuis({ lon: d.lon, lat: d.lat });
    });
    /* L'ITINÉRAIRE BIS (BIS-1, 30/08) — demandé par la barre, calculé ici. */
    document.addEventListener('itineraire-bis', (e) => {
      const d = (e as CustomEvent<{ lon: number; lat: number; cap: number | null }>).detail;
      void this.#itineraireBis({ lon: d.lon, lat: d.lat }, d.cap);
    });
    document.addEventListener('vehicule-change', () => {
      if (!this.#dernier) return;
      this.#rechargePour = null;
      clearTimeout(this.#minuteurPlanAuto);
      this.#minuteurPlanAuto = setTimeout(() => {
        void this.#planifierRecharge(this.#vue !== 'recharge');
      }, 1200);
    });

    /* SUR TÉLÉPHONE, LE VOLET EST UNE FEUILLE BASSE (décision d'Armelin du
       28/08) : la carte respire au-dessus, la poignée règle la hauteur. */
    installerFeuilleBasse(
      this.querySelector('details.iti') as HTMLDetailsElement,
      this.querySelector('.iti-corps') as HTMLElement,
    );
    this.querySelector('.iti-inverser')?.addEventListener('click', () => { this.#inverser(); });
    this.querySelector('.iti-gpx')?.addEventListener('click', () => {
      if (this.#dernier) void this.#livrerFichier(versGPX(this.#dernier, this.#nomTrajet()),
        'itineraire-infonovice.gpx', 'application/gpx+xml');
    });
    this.querySelector('.iti-kml')?.addEventListener('click', () => {
      if (this.#dernier) void this.#livrerFichier(versKML(this.#dernier, this.#nomTrajet()),
        'itineraire-infonovice.kml', 'application/vnd.google-earth.kml+xml');
    });
    /* Le partage du système ne se montre que là où il existe (téléphones,
       et quelques navigateurs de bureau) — même règle que les favoris
       (panneau-favoris.ts) : l'API d'abord, le repli reste visible. */
    const partagerSys = this.querySelector<HTMLButtonElement>('.iti-partager-sys');
    if (partagerSys && typeof navigator.share === 'function') {
      partagerSys.hidden = false;
      const note = this.querySelector<HTMLElement>('.iti-partager-sys-note');
      if (note) note.hidden = false;
      partagerSys.addEventListener('click', () => { void this.#partagerSysteme(); });
    }
    this.querySelector('.iti-lien')?.addEventListener('click', (e) => {
      // Le lien décrit le trajet CALCULÉ (le cliché), pas l'état des champs :
      // entre les deux, l'usager a pu cocher ou saisir sans que rien n'aboutisse.
      const c = this.#calculPour;
      if (!c) return;
      const url = location.origin + location.pathname + versFragment(c);
      void navigator.clipboard.writeText(url);
      (e.target as HTMLElement).textContent = 'Lien copié !';
      setTimeout(() => { (e.target as HTMLElement).textContent = 'Copier le lien'; }, 1800);
    });
    /* CHAQUE PAGE CHARGE CE QU'ELLE MONTRE, jamais avant qu'on la demande :
       au plus un appel d'altimétrie par itinéraire, et seulement si l'usager
       ouvre la page — les quotas de la Géoplateforme sont un bien commun.
       C'est `#allerA` qui déclenche, depuis un seul endroit. */
    for (const bouton of this.querySelectorAll<HTMLButtonElement>('.iti-vers')) {
      bouton.addEventListener('click', () => {
        this.#allerA((bouton.dataset['vers'] ?? 'accueil') as CleVue);
      });
    }
    void this.#restaurerReglages();
    this.querySelector('.vue-retour')?.addEventListener('click', () => {
      this.#allerA('accueil');
    });
    /* FERMER, C'EST RANGER LA FENÊTRE ET REVENIR À L'ACCUEIL : rouvrir le
       planificateur sur la page des options qu'on venait de quitter serait
       une surprise — la même règle qu'au premier jour des pages. */
    this.querySelector('.vue-fermer')?.addEventListener('click', () => {
      this.#allerA('accueil');
      const volet = this.querySelector('details.iti') as HTMLDetailsElement | null;
      if (volet) volet.open = false;
    });

    /* LES PÉAGES DU TRAJET — un appel Overpass, au clic seulement. Le bouton
       vit dans une page toujours accessible : sans trajet, il répond au lieu
       de se taire. */
    this.querySelector('.iti-peages-chercher')?.addEventListener('click', () => {
      void this.#releverPeages();
    });
    this.querySelector('.iti-comparer-lancer')?.addEventListener('click', () => {
      void this.#comparerVariantes();
    });

    /* CHANGER LA MARGE REFAIT LE PLAN — mais seulement si la section est
       ouverte : un réglage invisible ne consomme rien. Le `#rechargePour` est
       remis à zéro, sans quoi le garde-fou anti-recalcul avalerait le
       changement, exactement comme le seuil de vue l'avait fait pour les
       filtres de bornes. */
    /* LE PROFIL DE PAUSE RELÈVE LES ENVIRONS — un appel, puis le rejouage
       local, comme les conditions. Son échec est BÉNIN et DIT. */
    this.querySelector('.recharge-recalculer')?.addEventListener('click', () => {
      this.#refairePlan();
    });
    this.querySelector('.recharge-pause-profil')?.addEventListener('change', () => {
      void this.#enregistrerReglages();
      void this.#appliquerProfilPause();
    });
    /* CES RÉGLAGES SE GARDENT (30/08). Armelin : « dans la section arrêt de
       recharge, les paramètres de préférence pour arriver ou partir d'une
       borne ne sont pas mémorisés, ce qui m'oblige à devoir les
       reconfigurer à chaque fois ». Ils décrivent une MANIÈRE DE ROULER,
       pas un trajet : ils survivent donc au trajet, comme le véhicule. */
    for (const cls of REGLAGES_MEMORISES) {
      this.querySelector(cls)?.addEventListener('change', () => {
        void this.#enregistrerReglages();
        /* LE PLAN SE REJOUE, IL NE SE RECHERCHE PAS. Les bornes du trajet sont
           déjà en mémoire : remettre `#rechargePour` à zéro relancerait tout
           le chargement de l'index pour un calcul qui prend une milliseconde.
           Tant qu'aucune borne n'a été trouvée, en revanche, il faut bien
           lancer la recherche. */
        if (this.#bornesTrajet.length > 0) { this.#refairePlan(); return; }
        this.#rechargePour = null;
        void this.#planifierRecharge();
      });
    }
    /* Changer le détour maximal rejoue le calcul des lieux — LOCAL : l'index
       est déjà en mémoire, aucune relecture réseau. */
    this.querySelector('.monuments-detour')?.addEventListener('change', () => {
      this.#monumentsPour = null;
      void this.#chargerLieux();
    });

    /* UN LIEN PARTAGÉ S'OUVRE TOUT SEUL : le fragment porte l'itinéraire, on
       le rejoue à l'arrivée. Défensif — un fragment forgé rend null et la
       page s'ouvre normalement. */
    const partage = depuisFragment(location.hash);
    if (partage) {
      this.#depart = partage.depart;
      this.#arrivee = partage.arrivee;
      this.#profil = partage.profil;
      etapes.points = partage.etapes;
      this.#eviter = new Set(partage.eviter);
      for (const v of partage.eviter) {
        const case_ = this.querySelector(`.iti-eviter input[value="${v}"]`);
        if (case_) (case_ as HTMLInputElement).checked = true;
      }
      const radio = this.querySelector(`input[name="profil"][value="${partage.profil}"]`);
      if (radio) (radio as HTMLInputElement).checked = true;
      this.#optimisation = partage.optimisation;
      const opt = this.querySelector(
        `input[name="optimisation"][value="${partage.optimisation}"]`);
      if (opt) (opt as HTMLInputElement).checked = true;
      this.querySelector('details')?.setAttribute('open', '');
      // La carte n'est branchée qu'après la construction : on attend le tour
      // de boucle où `carte` est posée.
      queueMicrotask(() => { void this.#calculer(); });
    }
  }

  #nomTrajet(): string {
    return `Itinéraire Infonovice Maps (${PROFILS[this.#profil]})`;
  }

  /**
   * Le lien du trajet dans la feuille de partage du SYSTÈME. Deux niveaux,
   * fournis par l'appareil lui-même : ses applis (messagerie, courriel,
   * Drive, Bluetooth…), puis Copier / Imprimer / Enregistrer. Rien ne part
   * de chez nous : le système reçoit un lien, et l'usager choisit.
   */
  async #partagerSysteme(): Promise<void> {
    // Le cliché CALCULÉ, comme « Copier le lien » : jamais l'état des champs.
    const c = this.#calculPour;
    if (!c) return;
    const url = location.origin + location.pathname + versFragment(c);
    try {
      await navigator.share({ title: this.#nomTrajet(), url });
    } catch {
      /* Refermer la feuille sans choisir est un CHOIX (AbortError), pas une
         panne — aucun message. Les autres échecs n'ont pas de meilleur
         remède que « Copier le lien », déjà à l'écran. */
    }
  }

  /**
   * Un fichier (GPX, KML) part par la feuille de partage quand l'appareil
   * sait la remplir de fichiers (Web Share niveau 2 — c'est là qu'on
   * l'envoie vers un Drive, un courriel ou « Enregistrer ») ; sinon il se
   * télécharge, comme toujours. Le repli est la règle, jamais l'excuse :
   * aucun appareil ne perd ce qu'il avait.
   */
  async #livrerFichier(contenu: string, nom: string, type: string): Promise<void> {
    const fichier = new File([contenu], nom, { type });
    if (navigator.canShare?.({ files: [fichier] })) {
      try {
        await navigator.share({ files: [fichier], title: nom });
        return;
      } catch (erreur) {
        // La feuille refermée sans choisir : rien à faire, surtout pas un
        // téléchargement que personne n'a demandé.
        if ((erreur as DOMException).name === 'AbortError') return;
      }
    }
    telecharger(contenu, nom, type);
  }

  /** Replie et vide les sections profil/feuille (cachées si `cachees`). */
  /**
   * Oublie tout ce qui décrivait le trajet précédent.
   *
   * `cachees` VAUT VRAI QUAND ON EFFACE : le menu des détails n'a alors plus
   * d'objet, et le proposer mènerait à des pages vides. Sur un simple
   * recalcul, il reste — c'est le même trajet qu'on affine.
   */
  #reinitialiserSections(cachees: boolean): void {
    this.#annulationTrajet?.abort();
    this.#rechargePour = null;
    this.#annulationRecharge?.abort();
    this.#monumentsPour = null;
    this.#effacerLieuxCarte();
    /* LE MODE TRAJET S'ÉTEINT AVEC SON TRAJET : les bornes du corridor
       appartiennent à l'itinéraire qui les a produites, et la couche
       nationale reprend sa place. */
    this.#retirerBornesTrajet();
    for (const cls of
      ['iti-alti', 'iti-feuille', 'iti-trajet', 'iti-meteo', 'iti-recharge',
        'iti-peages', 'iti-monuments', 'iti-comparer'] as const) {
      const corps = this.querySelector(`.${cls}-corps`);
      if (corps) corps.textContent = '';
    }
    // Le relevé des péages et la comparaison appartenaient au trajet
    // d'avant : leurs boutons revivent.
    for (const cls of ['.iti-peages-chercher', '.iti-comparer-lancer']) {
      const bouton = this.querySelector<HTMLButtonElement>(cls);
      if (bouton) bouton.disabled = false;
    }
    this.#feuillePour = null;
    const menu = this.querySelector('.iti-menu:not(.iti-menu-toujours)') as HTMLElement | null;
    if (menu) menu.hidden = cachees;
    /* ON REVIENT À L'ACCUEIL. Rester sur une page dont le contenu vient d'être
       vidé montrerait un cadre blanc sans dire pourquoi. */
    if (cachees) this.#allerA('accueil');
  }



  /* LES ARRÊTS DE RECHARGE — À LA DEMANDE, comme tout le reste de ce panneau.
     Le calcul est LOCAL (lib/arrets.ts) ; le seul appel réseau cherche les
     bornes le long du tracé, et il est plafonné à six tronçons depuis la
     PR #11. Le profil du véhicule vient d'IndexedDB : il n'a jamais quitté le
     navigateur et ne le quitte pas ici non plus. */
  /**
   * Le profil véhicule tel qu'IndexedDB le connaît, prêt pour le
   * planificateur — `null` quand il manque l'essentiel. Partagé entre le
   * plan de recharge et la comparaison de variantes : deux lecteurs, une
   * seule interprétation des champs.
   */
  async #lireVehicule(): Promise<{
    vehicule: { capaciteKwh: number; consommationKwh100: number; puissanceMaxKw: number };
    socDepart: number;
    profilConditions: ProfilConditions;
  } | null> {
    const memo = await lirePreference<unknown>(PREF_VEHICULE);
    const m = (memo ?? {}) as Record<string, unknown>;
    const brut = (m['vehicule'] ?? {}) as Record<string, unknown>;
    const nombre = (x: unknown): number =>
      (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? x : 0);
    const capacite = nombre(brut['capaciteNominale']) * (nombre(brut['soce']) || 100) / 100;
    const conso = ((brut['consommations'] ?? {}) as Record<string, unknown>)['autoroute'];
    if (!(capacite > 0) || !(nombre(conso) > 0)) return null;
    /* Zéro vaut « non déclaré » : le champ correspondant reste absent, et le
       modèle des conditions n'applique alors RIEN — le contrat de
       lib/conditions. */
    const optionnel = (x: unknown): number | undefined =>
      (nombre(x) > 0 ? nombre(x) : undefined);
    return {
      vehicule: {
        capaciteKwh: capacite,
        consommationKwh100: nombre(conso),
        // 150 kW par défaut : une valeur courante, et l'interface le dit.
        puissanceMaxKw: nombre(brut['puissanceMaxKw']) || 150,
      },
      socDepart: nombre(brut['soc']) || 100,
      profilConditions: {
        masseKg: optionnel(brut['masseKg']),
        puissanceFroidKw: optionnel(brut['puissanceFroidKw']),
        puissanceChaudKw: optionnel(brut['puissanceChaudKw']),
      },
    };
  }

  async #planifierRecharge(auto = false): Promise<void> {
    const corps = this.querySelector('.iti-recharge-corps') as HTMLElement;
    const iti = this.#dernier;
    if ((!auto && this.#vue !== 'recharge') || !iti || this.#rechargePour === iti) return;
    this.#rechargePour = iti;

    const profil = await this.#lireVehicule();
    if (!profil) {
      /* En automatique, PAS de véhicule = pas de plan, en silence : le
         message d'invite n'a de sens que quand on OUVRE la page. */
      if (!auto) {
        corps.textContent = 'Renseignez d’abord votre véhicule (panneau « Véhicule ») :'
          + ' batterie, santé et autonomie constatée.';
      }
      this.#rechargePour = null;   // réessayable une fois le profil rempli
      return;
    }
    this.#planEnCours = true;
    this.#majResume();

    /* LES RÉSEAUX PRÉFÉRÉS S'HÉRITENT DU FILTRE CARTE (retour d'Armelin du
       29/08 : « à chaque nouveau trajet, il faut encore recocher les
       réseaux » — le doublon). Cochés dans « Recharge et services », ils
       arrivent COCHÉS ici — et restent modifiables pour CE trajet. */
    if (!this.#reseauxHerites) {
      this.#reseauxHerites = true;
      const memoFiltres = await lirePreference<{ reseaux?: unknown }>(PREF_FILTRES);
      const herites = Array.isArray(memoFiltres?.reseaux)
        ? memoFiltres.reseaux.filter((r): r is string => typeof r === 'string') : [];
      this.#reseauxPreferes = new Set(herites);
    }

    corps.textContent = `Chargement du réseau national de recharge (${POIDS_ANNONCE},`
      + ' une seule fois, gardé hors ligne)…';
    this.#annulationRecharge?.abort();
    const annulation = new AbortController();
    this.#annulationRecharge = annulation;

    this.#vehiculeCourant = profil.vehicule;
    this.#socDepart = profil.socDepart;
    this.#profilConditions = profil.profilConditions;

    try {
      /* LES BORNES DU TRAJET VIENNENT DE L'INDEX NATIONAL, PLUS DU PORTAIL.
         L'ancienne voie découpait le trajet en six tronçons et interrogeait
         chacun — six requêtes plafonnées à CENT résultats. Sur un
         Paris-Marseille le plafond mordait, et le planificateur travaillait
         donc sur un échantillon sans savoir qu'il en était un : il pouvait
         déclarer un trajet infaisable parce que la borne salvatrice était la
         cent-unième de son tronçon. L'index est complet à partir de
         50 kW — exactement le domaine qui intéresse un trajet — et le
         découpage se fait en mémoire, sans le moindre appel.

         DIX KILOMÈTRES, EN MÈTRES : au-delà, le détour coûte plus que la borne
         ne rapporte. Le paramètre s'appelle `rayonM` — passer « 10 » cherchait
         dans un rayon de dix MÈTRES et ne rendait jamais rien, sans la moindre
         erreur. Le parcours E2E l'a vu ; un test à sec ne l'aurait pas vu. */
      /* LES CONDITIONS SE RELÈVENT EN MÊME TEMPS QUE L'INDEX — et chacune
         peut échouer SEULE : une météo en panne ne prive pas le plan du
         relief, et rien ne bloque jamais le calcul. */
      const [{ stations }] = await Promise.all([
        indexNational(annulation.signal),
        this.#chargerConditions(iti, annulation.signal),
      ]);
      if (this.#dernier !== iti || annulation.signal.aborted) return;
      this.#bornesTrajet = stationsDuTrajet(
        stations, iti.geometrie.coordinates as [number, number][], 10_000,
      );
      this.#refairePlan();
    } catch (e) {
      if (annulation.signal.aborted) return;
      this.#rechargePour = null;
      this.#planEnCours = false;
      this.#majResume();
      corps.textContent = e instanceof ErreurIndex || e instanceof ErreurPoi
        ? e.message : 'Recherche des bornes indisponible pour le moment.';
    }
  }

  /** Les bornes du trajet, dans la forme attendue par le planificateur.
      Les réseaux non préférés sont retirés ICI, avant tout calcul : les
      laisser passer pour les écarter ensuite ferait parler les messages
      d'échec de bornes que l'usager s'est interdites. */
  #candidates(): BorneCandidate[] {
    /* LA COMPARAISON SE FAIT SUR LA CLÉ D'EXPLOITANT, jamais sur la chaîne :
       cocher « Allego » doit retenir aussi les stations écrites « Allego -
       Burger King Massy Opéra ». Même règle que le filtre de la carte. */
    const preferes = new Set([...this.#reseauxPreferes].map(cleReseau));
    const retenues = preferes.size === 0
      ? this.#bornesTrajet
      : this.#bornesTrajet.filter((t) => {
        const brut = t.poi.operateur ?? t.poi.reseau;
        return brut !== null && preferes.has(cleReseau(brut));
      });
    return retenues.map((t) => ({
      nom: t.poi.nom,
      lon: t.poi.lon,
      lat: t.poi.lat,
      reseau: t.poi.reseau,
      id: t.poi.id,
      avancementM: t.avancement,
      ecartM: t.ecart,
      puissanceKw: t.poi.puissance,
    }));
  }

  /**
   * Relève les conditions du trajet — UNE fois par itinéraire.
   *
   * Trois sources, chacune facultative et attrapée SEULE : Open-Meteo aux
   * deux bouts (départ maintenant, arrivée à l'heure estimée — la dérogation
   * météo du 22/08 couvre cet usage), l'altimétrie IGN pour le dénivelé
   * (le même service que le profil de la page « alti »), et la vitesse
   * moyenne qui ne coûte RIEN : distance/durée du moteur — c'est le graphe
   * routier qui a déjà compté les limites tronçon par tronçon.
   */
  async #chargerConditions(iti: Itineraire, signal: AbortSignal): Promise<void> {
    if (this.#conditionsPour === iti && this.#conditions) return;
    const conditions: ConditionsTrajet = {
      vitesseMoyenneKmh: iti.duree > 0 ? (iti.distance / iti.duree) * 3.6 : undefined,
    };
    /* L'heure de DÉPART choisie, pas « maintenant » : la météo d'un départ
       à 18 h n'est pas celle de 8 h — c'est tout le mode arrivée réelle. */
    const maintenant = this.#departA ?? new Date();
    const arriveeEstimee = new Date(maintenant.getTime() + iti.duree * 1000);
    const sommets = iti.geometrie.coordinates;
    const [pDep, pArr] = [sommets[0], sommets[sommets.length - 1]];
    await Promise.all([
      pDep
        ? meteoA(pDep[0]!, pDep[1]!, maintenant, signal)
          .then((m) => { conditions.tempDepartC = m.temperature; })
          .catch(() => { /* le plan vivra à 20 °C, et le dira */ })
        : Promise.resolve(),
      pArr
        ? meteoA(pArr[0]!, pArr[1]!, arriveeEstimee, signal)
          .then((m) => { conditions.tempArriveeC = m.temperature; })
          .catch(() => { /* idem */ })
        : Promise.resolve(),
      profilItineraire(iti.geometrie)
        .then((points) => {
          const d = denivele(points);
          conditions.monteeM = d.montee;
          conditions.descenteM = d.descente;
        })
        .catch(() => { /* le plan vivra à plat, et le dira */ }),
    ]);
    if (signal.aborted) return;
    this.#conditions = conditions;
    this.#conditionsPour = iti;
  }

  /**
   * Applique le profil de pause choisi : relève les environs des bornes du
   * trajet — UNE fois par (trajet, profil) — puis rejoue le plan.
   *
   * L'échec du relevé est BÉNIN : le plan sort sans bonus, et l'état le dit
   * en une ligne plutôt que d'inventer des environs.
   */
  /**
   * Garde les réglages de manière de rouler — et les rend au retour.
   *
   * TOUT PASSE PAR LA VALEUR DES `<select>`, jamais par un état parallèle :
   * c'est le formulaire qui fait foi, et le relire évite d'inventer une
   * deuxième vérité qui divergerait de lui.
   */
  async #enregistrerReglages(): Promise<void> {
    const memo: Record<string, string> = {};
    for (const cls of REGLAGES_MEMORISES) {
      const champ = this.querySelector<HTMLSelectElement>(cls);
      if (champ) memo[cls] = champ.value;
    }
    await ecrirePreference(PREF_REGLAGES, memo);
  }

  /** Rend les réglages gardés. Silencieux si la base est vide ou abîmée. */
  async #restaurerReglages(): Promise<void> {
    const memo = await lirePreference<unknown>(PREF_REGLAGES);
    if (!memo || typeof memo !== 'object') return;
    const m = memo as Record<string, unknown>;
    for (const cls of REGLAGES_MEMORISES) {
      const valeur = m[cls];
      if (typeof valeur !== 'string') continue;
      const champ = this.querySelector(cls);
      /* DEUX GARDES, ET LA SECONDE A ÉTÉ PAYÉE : d'abord que l'élément SOIT
         un <select> — une classe partagée par erreur avec un paragraphe
         faisait échouer la boucle entière, silencieusement, et les réglages
         suivants restaient à leur défaut. Ensuite qu'une valeur relue soit
         encore une option : un choix disparu d'une version à l'autre
         laisserait le select vide. */
      if (!(champ instanceof HTMLSelectElement)) continue;
      if ([...champ.options].some((o) => o.value === valeur)) champ.value = valeur;
    }
  }

  async #appliquerProfilPause(): Promise<void> {
    const etat = this.querySelector<HTMLElement>('.recharge-pause-etat');
    const cle = this.querySelector<HTMLSelectElement>('.recharge-pause-profil')?.value ?? '';
    const iti = this.#dernier;
    this.#annulationAgrements?.abort();
    if (etat) etat.textContent = '';
    if (!cle || !iti) {
      this.#agrements = null;
      this.#agrementsPour = null;
      this.#refairePlan();
      return;
    }
    if (this.#agrementsPour && this.#agrementsPour.iti === iti
      && this.#agrementsPour.profil === cle) {
      this.#refairePlan();
      return;
    }
    const profil = PROFILS_PAUSE.find((x) => x.cle === cle);
    if (!profil) return;
    const annulation = new AbortController();
    this.#annulationAgrements = annulation;
    if (etat) etat.textContent = 'Relevé des environs des bornes (OpenStreetMap)…';
    try {
      const agrements = await chercherAgrements(
        profil, this.#candidates(), annulation.signal,
      );
      if (annulation.signal.aborted || this.#dernier !== iti) return;
      this.#agrements = agrements;
      this.#agrementsPour = { iti, profil: cle };
      if (etat) {
        etat.textContent = agrements.size === 0
          ? `Aucune ${profil.agrement} à ${'500'} m d'une borne de ce trajet — le plan reste inchangé.`
          : `${agrements.size} borne${agrements.size > 1 ? 's' : ''} du trajet avec ${profil.agrement} à moins de 500 m.`;
      }
      this.#refairePlan();
    } catch (e) {
      if (annulation.signal.aborted) return;
      this.#agrements = null;
      this.#agrementsPour = null;
      if (etat) {
        etat.textContent = (e instanceof ErreurPauses ? e.message
          : 'Le relevé des environs est indisponible.') + ' Le plan sort sans ce critère.';
      }
      this.#refairePlan();
    }
  }

  /**
   * Rejoue le plan sur les bornes déjà trouvées — SANS RIEN RECHARGER.
   *
   * C'est ce qui rend les « + » et les « − » instantanés : cocher un arrêt ne
   * doit pas relancer une recherche réseau. Tout le calcul est local
   * (lib/arrets.ts), et les bornes sont déjà en mémoire.
   */
  #refairePlan(): void {
    const iti = this.#dernier;
    const v = this.#vehiculeCourant;
    if (!iti || !v) return;
    this.#afficherRecharge(planifierArrets({
      vehicule: v,
      distanceM: iti.distance,
      bornes: this.#candidates(),
      socDepart: this.#socDepart,
      socArrivee: this.#valeurReglage('.recharge-cible', 10),
      reserve: this.#valeurReglage('.recharge-reserve', 10),
      plafondCharge: this.#valeurReglage('.recharge-plafond', 100),
      /* AU RECALCUL, LES ARRÊTS DE COURTOISIE DEVIENNENT DES CONSIGNES :
         c'est le sens du geste — « garde mes arrêts, refais le reste ». */
      imposees: [...this.#imposees, ...this.#courtoisie],
      ecartees: [...this.#ecartees],
      conditions: this.#conditionsPour === iti ? this.#conditions ?? {} : {},
      profilConditions: this.#profilConditions,
      pauseMinimaleMin: this.#valeurReglage('.recharge-pause-min', 0),
      /* « Toutes les 2 h » se convertit en MÈTRES à la vitesse de CE trajet :
         le planificateur ne pense qu'en distance, et c'est la durée du moteur
         qui sait ce que deux heures y valent. */
      intervalleMaxM: (() => {
        const minutes = this.#valeurReglage('.recharge-pause-intervalle', 0);
        if (!(minutes > 0) || !(iti.duree > 0)) return undefined;
        return (minutes / 60) * ((iti.distance / iti.duree) * 3.6) * 1000;
      })(),
      agrements: this.#agrementsPour?.iti === iti ? this.#agrements ?? undefined : undefined,
    }));
  }

  /* ---- le mode trajet sur la carte ---- */

  /**
   * La clé d'une borne du corridor — la même que celle du planificateur.
   */
  #cleDe(t: SurLeTrajet<StationRapide>): string {
    return cleBorne({ id: t.poi.id, lon: t.poi.lon, lat: t.poi.lat });
  }

  /**
   * Pose (ou met à jour) les deux couches du mode trajet, et efface les
   * bornes nationales.
   *
   * LE CORRIDOR N'EST PAS FILTRÉ PAR LES RÉSEAUX PRÉFÉRÉS À L'AFFICHAGE… si :
   * il l'est, parce que c'est la demande exacte — « n'afficher que les bornes
   * du réseau de son choix sur le trajet. Cela permettra d'assainir encore
   * plus la carte. » Les bornes écartées au « − » restent visibles : on peut
   * revenir sur un refus, pas sur une borne invisible.
   */
  #poserBornesTrajet(): void {
    const carte = this.#carte;
    if (!carte) return;
    if (this.#bornesTrajet.length === 0) { this.#retirerBornesTrajet(); return; }

    /* LES ARRÊTS DU PLAN, avec leur rang — la pastille « 2 » sur la carte est
       la même que le « 2. » de la liste. */
    const arrets = this.#planCourant?.faisable ? this.#planCourant.arrets : [];
    const rangs = new Map(arrets.map((a, i) => [cleBorne(a.borne), i + 1]));

    const candidates = this.#candidates();
    const montrees = new Set(candidates.map((c) => cleBorne(c)));

    const corridor: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: this.#bornesTrajet
        .filter((t) => {
          const cle = this.#cleDe(t);
          // Ni les arrêts (l'autre couche les porte), ni ce que le filtre de
          // réseau vient d'écarter — sauf les refus au « − », qu'on garde.
          return !rangs.has(cle) && (montrees.has(cle) || this.#ecartees.has(cle));
        })
        .map((t) => ({
          type: 'Feature',
          properties: {
            id: t.poi.id, nom: t.poi.nom,
            icone: nomIcone(palierDe(t.poi.puissance)),
          },
          geometry: { type: 'Point', coordinates: [t.poi.lon, t.poi.lat] },
        })),
    };
    const pastilles: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: arrets.map((a, i) => ({
        type: 'Feature',
        properties: {
          id: a.borne.id ?? null, nom: a.borne.nom, rang: String(i + 1),
          /* LA DURÉE SOUS LA PASTILLE (mandat UX 28/08, EV-1) : « 2 » dit
             l'ordre, pas le prix — 18 min et 45 min ne se valent pas quand
             on choisit lequel sauter. Un arrêt imposé sans recharge le dit. */
          duree: a.dureeMin > 0 ? `${Math.round(a.dureeMin)} min` : 'sans recharge',
        },
        geometry: { type: 'Point', coordinates: [a.borne.lon, a.borne.lat] },
      })),
    };

    try {
      const srcCorridor = carte.getSource(SOURCE_CORRIDOR) as GeoJSONSource | undefined;
      const srcArrets = carte.getSource(SOURCE_ARRETS) as GeoJSONSource | undefined;
      if (srcCorridor && srcArrets) {
        srcCorridor.setData(corridor);
        srcArrets.setData(pastilles);
      } else {
        poserIconesPuissance(carte);
        carte.addSource(SOURCE_CORRIDOR, { type: 'geojson', data: corridor });
        carte.addSource(SOURCE_ARRETS, { type: 'geojson', data: pastilles });
        /* Le corridor sous les arrêts : une candidate collée à un arrêt ne
           doit pas voler son clic à la pastille numérotée. */
        carte.addLayer({
          id: 'iti-corridor', type: 'symbol', source: SOURCE_CORRIDOR,
          layout: {
            'icon-image': ['get', 'icone'],
            'icon-size': 0.55,
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
          },
        });
        carte.addLayer({
          id: 'iti-arrets-pastille', type: 'circle', source: SOURCE_ARRETS,
          paint: {
            /* 18, pas 15 : « encore trop petits par rapport aux autres
               ronds » (29/08). */
            'circle-radius': 18,
            'circle-color': COULEUR_ARRET,
            'circle-stroke-width': 3,
            'circle-stroke-color': '#FFFFFF',
          },
        });
        carte.addLayer({
          id: 'iti-arrets-rang', type: 'symbol', source: SOURCE_ARRETS,
          layout: {
            'text-field': ['get', 'rang'],
            'text-size': 17,
            'text-allow-overlap': true,
            'text-ignore-placement': true,
          },
          paint: { 'text-color': '#FFFFFF' },
        });
        /* La durée sous la pastille, halo blanc : lisible sur tout fond,
           comme les toponymes du Plan IGN. */
        carte.addLayer({
          id: 'iti-arrets-duree', type: 'symbol', source: SOURCE_ARRETS,
          layout: {
            'text-field': ['get', 'duree'],
            /* À DROITE de la pastille et plus grande, pas en dessous en
               petit : « le texte est trop petit et devrait se situer à
               droite du rond » (29/08). */
            'text-size': 13.5,
            'text-anchor': 'left',
            'text-offset': [1.7, 0],
            'text-allow-overlap': true,
            'text-ignore-placement': true,
          },
          paint: {
            'text-color': '#0C447C',
            'text-halo-color': '#FFFFFF',
            'text-halo-width': 1.6,
          },
        });
      }
    } catch (e) {
      // Style en chargement : style.load (branché dans `set carte`) reposera.
      if (e instanceof Error && /style is not done loading/i.test(e.message)) return;
      throw e;
    }
    this.#modeTrajetPose = true;
    this.#couchesBornes?.masquerBornesNationales(true);
  }

  /** Retire les couches du mode trajet et rend la carte aux bornes nationales. */
  #retirerBornesTrajet(): void {
    const carte = this.#carte;
    if (this.#modeTrajetPose && carte) {
      for (const id of ['iti-arrets-duree', 'iti-arrets-rang', 'iti-arrets-pastille', 'iti-corridor']) {
        if (carte.getLayer(id)) carte.removeLayer(id);
      }
      for (const id of [SOURCE_ARRETS, SOURCE_CORRIDOR]) {
        if (carte.getSource(id)) carte.removeSource(id);
      }
    }
    this.#modeTrajetPose = false;
    this.#couchesBornes?.masquerBornesNationales(false);
  }

  /* ---- ce que la fiche d'une borne sait demander au plan ---- */

  /**
   * L'état d'une borne vis-à-vis du plan courant.
   *
   * `retenu` : elle est un arrêt du plan (choisi ou imposé). `candidat` : elle
   * est sur le corridor du trajet, le plan pourrait la prendre. `null` : aucun
   * plan à l'écran, ou borne hors du corridor — la fiche ne propose alors
   * rien, plutôt qu'un bouton qui échouerait.
   */
  etatDansLePlan(cle: string): 'retenu' | 'candidat' | null {
    if (this.#bornesTrajet.length === 0) return null;
    const arrets = this.#planCourant?.faisable ? this.#planCourant.arrets : [];
    if (arrets.some((a) => cleBorne(a.borne) === cle) || this.#imposees.has(cle)) {
      return 'retenu';
    }
    return this.#bornesTrajet.some((t) => this.#cleDe(t) === cle) ? 'candidat' : null;
  }

  /**
   * Ajoute ou retire un arrêt — SANS refaire le plan quand on en ajoute un.
   *
   * LA DEMANDE (Armelin, 30/08) : « à chaque fois que j'ajoute une borne de
   * recharge entre deux bornes, la borne suivante saute pour être
   * recalculée ailleurs. Je ne veux pas de recalcul automatique si j'ajoute
   * une borne en plus entre deux arrêts par souci de commodité. Il suffit de
   * garder la planification initiale et de considérer l'arrêt comme un arrêt
   * de courtoisie, café ou WC ou déjeuner… sauf si l'utilisateur demande à
   * recalculer, ce qui offre le choix entre automatique et manuel. »
   *
   * DEUX GESTES DIFFÉRENTS, DONC DEUX EFFETS DIFFÉRENTS. AJOUTER est une
   * commodité : le plan calculé reste tel quel, la borne s'y insère à son
   * kilomètre comme arrêt de COURTOISIE — zéro kilowattheure, zéro minute,
   * ce qu'elle est. RETIRER, lui, refait le plan : une borne écartée change
   * ce qui est atteignable, et laisser un plan qui compte sur elle serait un
   * mensonge. Le bouton « Recalculer les arrêts » rend la main au calcul
   * quand l'usager le veut.
   */
  basculerArret(cle: string, action: 'imposer' | 'ecarter'): void {
    if (action === 'imposer') {
      this.#courtoisie.add(cle);
      this.#ecartees.delete(cle);
      this.#insererCourtoisie(cle);
      return;
    }
    this.#ecartees.add(cle);
    this.#imposees.delete(cle);
    this.#courtoisie.delete(cle);
    this.#refairePlan();
  }

  /**
   * Glisse un arrêt de courtoisie dans le plan affiché, à son kilomètre.
   *
   * RIEN N'EST RECALCULÉ : ni les durées, ni les états de charge des autres
   * arrêts. C'est le sens même de la demande — le plan d'avant tient, on y
   * ajoute une pause. Les SOC de l'arrêt inséré sont ceux de son voisin
   * précédent : on n'y charge pas, donc on en repart comme on y est arrivé.
   */
  #insererCourtoisie(cle: string): void {
    const plan = this.#planCourant;
    const trouvee = this.#bornesTrajet.find((t) => this.#cleDe(t) === cle);
    if (!plan?.faisable || !trouvee) { this.#refairePlan(); return; }
    if (plan.arrets.some((a) => cleBorne(a.borne) === cle)) return;

    const precedent = [...plan.arrets]
      .filter((a) => a.borne.avancementM < trouvee.avancement)
      .pop();
    const soc = precedent?.socDepart ?? 0;
    const arret = {
      borne: {
        nom: trouvee.poi.nom, lon: trouvee.poi.lon, lat: trouvee.poi.lat,
        reseau: trouvee.poi.reseau, id: trouvee.poi.id,
        avancementM: trouvee.avancement, ecartM: trouvee.ecart,
        puissanceKw: trouvee.poi.puissance,
      },
      socArrivee: soc, socDepart: soc, dureeMin: 0, energieKwh: 0,
    };
    const arrets = [...plan.arrets, arret]
      .sort((a, b) => a.borne.avancementM - b.borne.avancementM);
    this.#afficherRecharge({ ...plan, arrets });
  }

  /**
   * Relève les gares de péage du tracé — un appel Overpass, au clic.
   *
   * LE RELEVÉ DIT SES LIMITES EN TOUTES LETTRES : la source est OSM (une gare
   * absente de la carte n'est pas relevée), et le TARIF n'y figure pas — le
   * promettre serait inventer.
   */
  async #releverPeages(): Promise<void> {
    const bouton = this.querySelector<HTMLButtonElement>('.iti-peages-chercher');
    const corps = this.querySelector<HTMLElement>('.iti-peages-corps');
    if (!bouton || !corps) return;
    const iti = this.#dernier;
    if (!iti) {
      corps.textContent =
        'Calculez d’abord un itinéraire : les péages se relèvent sur son tracé.';
      return;
    }
    bouton.disabled = true;
    corps.textContent = 'Relevé des péages sur le tracé…';
    try {
      const gares = await chargerPeages(iti.geometrie);
      if (this.#dernier !== iti) return; // le trajet a changé sous l'appel
      bouton.disabled = false;
      if (gares.length === 0) {
        corps.textContent = 'Aucune gare de péage relevée sur ce tracé.'
          + ' Source OpenStreetMap : une gare absente de la carte n’est pas relevée.';
        return;
      }
      const liste = gares
        .map((g) => `${g.nom ?? 'gare de péage'} (km ${Math.round(g.avancementM / 1000)})`)
        .join(' · ');
      corps.replaceChildren();
      const nomsLigne = document.createElement('p');
      nomsLigne.className = 'iti-peages-gares';
      nomsLigne.textContent =
        `${gares.length} gare${gares.length > 1 ? 's' : ''} de péage sur ce tracé : `
        + `${liste}. Source OpenStreetMap — une gare absente de la carte n’est`
        + ' pas relevée.';
      corps.append(nomsLigne);
      /* LE PRIX VIENT APRÈS LES NOMS, et par un second chemin : la grille
         tarifaire est un autre jeu de données, d'une autre source, qui ne
         couvre pas tout. La liste des gares reste utile même sans elle. */
      void this.#chiffrerPeages(gares, corps, iti);
    } catch (e) {
      // Overpass tombe souvent : le bouton reste réessayable.
      bouton.disabled = false;
      corps.textContent = e instanceof ErreurPeages
        ? e.message : 'Les péages ne sont pas disponibles pour le moment.';
    }
  }

  /**
   * Compare le trajet courant avec sa variante avec/sans autoroute.
   *
   * PAS DES « ITINÉRAIRES A/B/C » : le moteur public ne rend pas
   * d'alternatives (mesuré PR #6), et une variante par étape décalée serait
   * un artifice. On calcule LA variante qui a un sens — l'autre choix
   * d'autoroute — et l'on montre pour chacune la route ET la recharge :
   * c'est le total qui décide, une portion gratuite d'autoroute peut battre
   * la nationale une fois la charge comptée.
   *
   * LES PLANS DE RECHARGE SONT CALCULÉS À NEUF, SANS LES CONSIGNES : les
   * arrêts imposés du trajet courant peuvent être hors de la variante — les
   * appliquer condamnerait la comparaison d'avance, et c'est écrit sous le
   * résultat.
   */
  /**
   * Le PRIX des péages relevés — quand la grille publique le connaît.
   *
   * CE QU'ELLE COUVRE, ET CE QU'ELLE NE COUVRE PAS (mesuré le 30/08) : seul
   * le réseau AREA publie une grille exploitable — celle d'APRR est
   * corrompue à la source, Vinci et Sanef n'en publient aucune. On chiffre
   * donc ce qu'on peut et l'on NOMME les
   * tronçons qu'on ne sait pas chiffrer — une estimation partielle
   * présentée comme un total serait pire que pas d'estimation : c'est sur
   * elle qu'on déciderait d'éviter l'autoroute.
   */
  async #chiffrerPeages(
    gares: readonly { nom: string | null }[], corps: HTMLElement, iti: Itineraire,
  ): Promise<void> {
    const attente = this.#attente('Lecture de la grille tarifaire…');
    corps.append(attente);
    let grille: Record<string, number>;
    try {
      grille = await chargerGrille();
    } catch {
      attente.remove();
      const echec = document.createElement('p');
      echec.className = 'iti-peages-note';
      echec.textContent = 'La grille tarifaire n’a pas pu être lue :'
        + ' les gares restent listées, sans prix.';
      corps.append(echec);
      return;
    }
    if (this.#dernier !== iti) return; // le trajet a changé sous l'appel
    attente.remove();

    const e = estimerPeages(gares, grille);
    const total = document.createElement('p');
    total.className = 'iti-peages-total';
    if (e.troncons.length === 0) {
      total.textContent = 'Aucun tronçon chiffrable : la seule grille publique'
        + ' exploitable est celle du réseau AREA (A41, A43, A48, A49, A51).';
      corps.append(total);
      return;
    }
    const euros = (v: number): string => v.toFixed(2).replace('.', ',');
    total.textContent = `Péages estimés : ${euros(e.totalEuros)} €`
      + ` (voiture, classe 1) sur ${e.troncons.length} tronçon`
      + `${e.troncons.length > 1 ? 's' : ''}.`;
    corps.append(total);

    const detail = document.createElement('ul');
    detail.className = 'iti-peages-troncons';
    for (const t of e.troncons) {
      const li = document.createElement('li');
      li.textContent = `${t.entree} → ${t.sortie} : ${euros(t.prixEuros)} €`;
      detail.append(li);
    }
    corps.append(detail);

    /* CE QU'ON N'A PAS SU CHIFFRER SE DIT, gare par gare : c'est la seule
       façon de savoir que le total n'est pas le total. */
    if (e.inconnus.length > 0) {
      const manque = document.createElement('p');
      manque.className = 'iti-peages-note';
      manque.textContent = `${e.inconnus.length} tronçon`
        + `${e.inconnus.length > 1 ? 's' : ''} non chiffré`
        + `${e.inconnus.length > 1 ? 's' : ''} : `
        + e.inconnus.map((i) => `${i.entree} → ${i.sortie}`).join(' · ')
        + '. Seul le réseau AREA publie une grille exploitable ;'
        + ' celle d’APRR est corrompue à la source, et Vinci comme Sanef'
        + ' n’en publient aucune.';
      corps.append(manque);
    }
  }

  /**
   * TROIS ITINÉRAIRES RÉELS, calculés séparément — voir `VARIANTES`.
   *
   * TROIS APPELS, ET C'EST LE PRIX HONNÊTE. Le service ne rend pas
   * d'alternatives ; on lui pose donc trois questions différentes. Elles
   * partent EN PARALLÈLE (l'attente est celle de la plus lente, pas leur
   * somme) et un échec isolé ne perd pas les autres : une variante qui ne
   * se calcule pas est dite, les deux autres restent.
   */
  async #comparerVariantes(): Promise<void> {
    const bouton = this.querySelector<HTMLButtonElement>('.iti-comparer-lancer');
    const corps = this.querySelector<HTMLElement>('.iti-comparer-corps');
    if (!bouton || !corps) return;
    const cliche = this.#calculPour;
    const courant = this.#dernier;
    if (!cliche || !courant) {
      corps.textContent =
        'Calculez d’abord un itinéraire : la comparaison porte sur son tracé.';
      return;
    }
    bouton.disabled = true;
    corps.replaceChildren(this.#attente('Calcul des trois itinéraires…'));

    const sansAutorouteDeBase = cliche.eviter.filter((v) => v !== 'autoroute');
    const resultats = await Promise.all(VARIANTES.map(async (v) => {
      try {
        const iti = await calculerItineraire(
          cliche.depart, cliche.arrivee, cliche.profil,
          {
            etapes: cliche.etapes,
            eviter: v.sansAutoroute
              ? [...sansAutorouteDeBase, 'autoroute' as Eviter]
              : sansAutorouteDeBase,
            optimisation: v.optimisation,
          },
        );
        return { v, iti, erreur: null as string | null };
      } catch (e) {
        return {
          v, iti: null,
          erreur: e instanceof ErreurItineraire ? e.message : 'calcul indisponible',
        };
      }
    }));
    if (this.#dernier !== courant) return; // le trajet a changé sous les appels

    /* LA RECHARGE ENTRE DANS LA COMPARAISON quand un véhicule est
       renseigné : l'index est en cache, le calcul est local. */
    const profil = await this.#lireVehicule();
    let stations: StationRapide[] | null = null;
    if (profil) {
      try {
        stations = (await indexNational()).stations;
      } catch { stations = null; /* les routes se comparent quand même */ }
    }
      const planPour = (iti: Itineraire): PlanRecharge | null => {
        if (!profil || !stations) return null;
        return planifierArrets({
          vehicule: profil.vehicule,
          distanceM: iti.distance,
          bornes: stationsDuTrajet(
            stations, iti.geometrie.coordinates as [number, number][], 10_000,
          ).map((t) => ({
            nom: t.poi.nom, lon: t.poi.lon, lat: t.poi.lat, reseau: t.poi.reseau,
            id: t.poi.id, avancementM: t.avancement, ecartM: t.ecart,
            puissanceKw: t.poi.puissance,
          })),
          socDepart: profil.socDepart,
          socArrivee: this.#valeurReglage('.recharge-cible', 10),
          reserve: this.#valeurReglage('.recharge-reserve', 10),
          plafondCharge: this.#valeurReglage('.recharge-plafond', 100),
          /* LA VARIANTE SE COMPARE SOUS LES MÊMES CONDITIONS — températures
             comprises, et SA vitesse à elle : c'est souvent tout l'écart
             entre « avec » et « sans autoroute ». Le dénivelé, relevé sur
             l'AUTRE tracé, ne se transpose pas : il est omis ici plutôt que
             menti. */
          conditions: {
            tempDepartC: this.#conditions?.tempDepartC,
            tempArriveeC: this.#conditions?.tempArriveeC,
            vitesseMoyenneKmh: iti.duree > 0 ? (iti.distance / iti.duree) * 3.6 : undefined,
          },
          profilConditions: profil.profilConditions,
        });
      };

    this.#afficherVariantes(resultats.map((r) => ({
      cle: r.v.cle, libelle: r.v.libelle, iti: r.iti, erreur: r.erreur,
      plan: r.iti ? planPour(r.iti) : null,
      optimisation: r.v.optimisation, sansAutoroute: r.v.sansAutoroute,
    })), Boolean(profil));
    this.#poserVariantes(resultats.map((r) => r.iti));
    bouton.disabled = false;
  }

  /**
   * Les trois variantes, côte à côte — et ADOPTABLES.
   *
   * VOIR NE SUFFIT PAS : « pour voir les routes alternatives empruntées »
   * suppose de pouvoir en prendre une. Chaque bloc porte donc son bouton,
   * qui applique la consigne (optimisation, autoroute) et relance le
   * calcul — le trajet devient celui-là, plan de recharge compris.
   */
  #afficherVariantes(
    variantes: {
      cle: string; libelle: string; iti: Itineraire | null; erreur: string | null;
      plan: PlanRecharge | null; optimisation: Optimisation; sansAutoroute: boolean;
    }[],
    avecVehicule: boolean,
  ): void {
    const corps = this.querySelector<HTMLElement>('.iti-comparer-corps');
    if (!corps) return;
    corps.replaceChildren();

    /* LA PLUS RAPIDE ET LA PLUS COURTE SE DÉSIGNENT — parmi celles qui ont
       abouti. Un classement se lit plus vite que trois nombres à comparer
       de tête, et il ne dit rien de plus que ce qu'ils portent. */
    const abouties = variantes.filter((v) => v.iti !== null);
    const plusRapide = abouties.reduce<typeof abouties[0] | null>(
      (m, v) => (m && m.iti!.duree <= v.iti!.duree ? m : v), null);
    const plusCourte = abouties.reduce<typeof abouties[0] | null>(
      (m, v) => (m && m.iti!.distance <= v.iti!.distance ? m : v), null);

    for (const v of variantes) {
      const bloc = document.createElement('div');
      bloc.className = 'comparer-variante';
      bloc.dataset['variante'] = v.cle;

      const titre = document.createElement('p');
      titre.className = 'comparer-titre';
      titre.textContent = `${v.cle} — ${v.libelle}`;
      bloc.append(titre);

      if (!v.iti) {
        const raison = document.createElement('p');
        raison.className = 'comparer-erreur';
        // ON DIT LAQUELLE MANQUE, ET POURQUOI : une case vide ne se comprend pas.
        raison.textContent = v.erreur ?? 'Itinéraire indisponible.';
        bloc.append(raison);
        corps.append(bloc);
        continue;
      }

      const chiffres = document.createElement('p');
      chiffres.className = 'comparer-chiffres';
      const bouts = [formaterDistance(v.iti.distance), `${formaterDuree(v.iti.duree)} de route`];
      if (v.plan) {
        bouts.push(v.plan.faisable
          /* LE TOTAL, C'EST LA ROUTE PLUS LES CHARGES — le seul chiffre qui
             se compare vraiment entre deux itinéraires : le plus rapide sur
             la route peut perdre en tout s'il oblige à un arrêt de plus. */
          ? `${v.plan.arrets.length} arrêt${v.plan.arrets.length > 1 ? 's' : ''}`
            + ` · ${formaterDuree(Math.round(v.iti.duree + v.plan.dureeRechargeMin * 60))} au total`
          : 'hors de portée avec ce véhicule');
      }
      chiffres.textContent = bouts.join(' · ');
      bloc.append(chiffres);

      const marques: string[] = [];
      if (plusRapide?.cle === v.cle) marques.push('la plus rapide');
      if (plusCourte?.cle === v.cle) marques.push('la plus courte');
      if (marques.length > 0) {
        const note = document.createElement('p');
        note.className = 'comparer-marque';
        note.textContent = marques.join(' · ');
        bloc.append(note);
      }

      const prendre = document.createElement('button');
      prendre.type = 'button';
      prendre.className = 'comparer-prendre';
      prendre.textContent = 'Prendre cet itinéraire';
      prendre.setAttribute('aria-label', `Prendre l’itinéraire ${v.cle} — ${v.libelle}`);
      prendre.addEventListener('click', () => { this.#adopterVariante(v); });
      bloc.append(prendre);
      corps.append(bloc);
    }

    if (!avecVehicule) {
      const note = document.createElement('p');
      note.className = 'comparer-note';
      note.textContent = 'Renseignez votre véhicule pour comparer aussi les'
        + ' arrêts de recharge de chaque itinéraire.';
      corps.append(note);
    }
  }

  /** Applique la consigne d'une variante : le trajet devient celui-là. */
  #adopterVariante(v: { optimisation: Optimisation; sansAutoroute: boolean }): void {
    this.#optimisation = v.optimisation;
    const bouton = this.querySelector<HTMLInputElement>(
      `.iti-optimisations input[value="${v.optimisation}"]`);
    if (bouton) bouton.checked = true;
    if (v.sansAutoroute) this.#eviter.add('autoroute');
    else this.#eviter.delete('autoroute');
    const caseAuto = this.querySelector<HTMLInputElement>('.iti-eviter input[value="autoroute"]');
    if (caseAuto) caseAuto.checked = v.sansAutoroute;
    this.#effacerVariantes();
    void this.#calculer();
  }

  /**
   * Pose les variantes sur la carte, en trait fin — « pour VOIR les routes
   * alternatives empruntées ». Sous le tracé principal : c'est lui qu'on
   * suit, elles ne sont là que pour être comparées d'un regard.
   */
  #poserVariantes(itineraires: (Itineraire | null)[]): void {
    const carte = this.#carte;
    if (!carte) return;
    const donnees = {
      type: 'FeatureCollection' as const,
      features: itineraires.filter((i): i is Itineraire => i !== null).map((i, n) => ({
        type: 'Feature' as const,
        properties: { variante: VARIANTES[n]?.cle ?? '?' },
        geometry: i.geometrie,
      })),
    };
    try {
      const existante = carte.getSource(SOURCE_VARIANTES) as GeoJSONSource | undefined;
      if (existante) { existante.setData(donnees); return; }
      carte.addSource(SOURCE_VARIANTES, { type: 'geojson', data: donnees });
      carte.addLayer({
        id: 'variantes-trait', type: 'line', source: SOURCE_VARIANTES,
        paint: {
          'line-color': '#7A8794', 'line-width': 3, 'line-opacity': 0.85,
          'line-dasharray': [2, 1.6],
        },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      }, 'itineraire-bord');
    } catch (e) {
      // Même garde que le tracé principal : le style peut n'être pas prêt.
      if (e instanceof Error && /style is not done loading/i.test(e.message)) return;
      throw e;
    }
  }

  /** Retire les variantes de la carte — trajet adopté, ou page quittée. */
  #effacerVariantes(): void {
    const source = this.#carte?.getSource(SOURCE_VARIANTES) as GeoJSONSource | undefined;
    source?.setData({ type: 'FeatureCollection', features: [] });
  }

  async #chargerLieux(): Promise<void> {
    const corps = this.querySelector('.iti-monuments-corps') as HTMLElement;
    const iti = this.#dernier;
    if (this.#vue !== 'monuments' || !iti || this.#monumentsPour === iti) return;
    this.#monumentsPour = iti;
    /* L'ATTENTE SE VOIT, ET C'EST TOUT LE POINT (29/08). Armelin : « quand
       je clique sur lieu d'exception, il y a un recalcul en arrière-plan,
       mais rien affiché à l'écran […] l'utilisateur peut quitter la fenêtre
       avant même que le résultat ne s'affiche ». Le message existait — mais
       il n'avait pas le temps d'être PEINT : au deuxième passage le fichier
       vient du cache, l'attente réseau est nulle, et le calcul des détours
       (14 350 monuments contre la polyligne) bloque le fil principal sans
       qu'un seul rendu ait eu lieu. */
    const attendre = (texte: string): Promise<void> => {
      corps.replaceChildren(this.#attente(texte));
      // DEUX TRAMES : la première programme le rendu, la seconde le suit.
      return new Promise((ok) => {
        requestAnimationFrame(() => requestAnimationFrame(() => { ok(); }));
      });
    };
    await attendre('Lecture du répertoire des monuments classés (890 Ko, une fois par visite)…');
    try {
      const monuments = await chargerMonuments();
      if (this.#dernier !== iti || this.#vue !== 'monuments') return;
      const detourMin = this.#valeurReglage('.monuments-detour', 10);
      /* LE CALCUL EST LONG ET IL BLOQUE : on le dit AVANT de le lancer, et
         l'on rend la main au navigateur pour qu'il puisse l'écrire. */
      await attendre(`Recherche des monuments à moins de ${detourMin} min du trajet…`);
      if (this.#dernier !== iti || this.#vue !== 'monuments') return;
      const trouves = monumentsDuTrajet(
        monuments, iti.geometrie.coordinates as [number, number][], detourMin,
      );
      this.#afficherLieux(trouves, detourMin);
    } catch (e) {
      if (this.#dernier !== iti) return;
      this.#monumentsPour = null; // réessayable
      corps.textContent = e instanceof ErreurMonuments
        ? e.message : 'Les lieux d’exception ne sont pas disponibles pour le moment.';
    }
  }

  /**
   * Fait du lieu une ÉTAPE du trajet et recalcule — le geste commun de la
   * liste des lieux et de leur fiche. Rend `false` quand les six étapes sont
   * prises : l'appelant le dit à sa façon.
   */
  detourParLieu(lieu: Monument): boolean {
    const etapes = this.querySelector('etapes-itineraire') as EtapesItineraire;
    if (etapes.points.length >= MAX_ETAPES) return false;
    etapes.points = [...etapes.points, { lon: lieu.lon, lat: lieu.lat }];
    void this.#calculer();
    this.#allerA('accueil');
    return true;
  }

  /**
   * Le témoin d'attente : une phrase ET un point qui bat.
   *
   * UN TEXTE SEUL NE DIT PAS QUE ÇA TRAVAILLE — il peut aussi bien être un
   * résultat. Le battement, lui, ne laisse aucun doute ; et il s'arrête de
   * lui-même quand le contenu est remplacé.
   */
  #attente(texte: string): HTMLElement {
    const p = document.createElement('p');
    p.className = 'iti-attente';
    p.setAttribute('role', 'status');
    const point = document.createElement('span');
    point.className = 'iti-attente-point';
    point.setAttribute('aria-hidden', 'true');
    p.append(point, texte);
    return p;
  }

  /**
   * Pose les lieux d'exception en CALQUE, sous les arrêts de recharge.
   *
   * Le clic ouvre la fiche, comme le faisait le marqueur : c'est lui qu'on
   * voit sur la carte, et le renvoyer vers la liste serait le chemin inverse
   * du regard. Le calque porte l'index du lieu ; la liste courante fait foi.
   */
  #poserLieuxSurCarte(lieux: SurLeTrajet<Monument>[]): void {
    const carte = this.#carte;
    if (!carte) return;
    this.#lieuxPoses = lieux.map((t) => t.poi);
    const donnees = {
      type: 'FeatureCollection' as const,
      features: lieux.map((t, i) => ({
        type: 'Feature' as const,
        properties: { rang: i, titre: t.poi.titre },
        geometry: { type: 'Point' as const, coordinates: [t.poi.lon, t.poi.lat] },
      })),
    };
    try {
      const existante = carte.getSource(SOURCE_LIEUX) as GeoJSONSource | undefined;
      if (existante) { existante.setData(donnees); return; }
      carte.addSource(SOURCE_LIEUX, { type: 'geojson', data: donnees });
      /* AVANT la pastille des arrêts dans l'ordre de pose = DESSOUS à
         l'écran. C'est toute la correction du 30/08. */
      const dessous = carte.getLayer('iti-arrets-pastille') ? 'iti-arrets-pastille' : undefined;
      carte.addLayer({
        id: 'iti-lieux', type: 'circle', source: SOURCE_LIEUX,
        paint: {
          'circle-radius': 8,
          'circle-color': '#8A5AC2',
          'circle-stroke-width': 2,
          'circle-stroke-color': '#FFFFFF',
        },
      }, dessous);
      carte.on('click', 'iti-lieux', (e) => {
        const rang = e.features?.[0]?.properties?.['rang'];
        const lieu = typeof rang === 'number' ? this.#lieuxPoses[rang] : undefined;
        if (lieu) this.#ficheLieu?.ouvrir(lieu);
      });
      carte.on('mouseenter', 'iti-lieux', () => {
        carte.getCanvas().style.cursor = 'pointer';
      });
      carte.on('mouseleave', 'iti-lieux', () => {
        carte.getCanvas().style.cursor = '';
      });
    } catch (e) {
      if (e instanceof Error && /style is not done loading/i.test(e.message)) return;
      throw e;
    }
  }

  /** Efface les lieux de la carte — page quittée, ou trajet effacé. */
  #effacerLieuxCarte(): void {
    this.#lieuxPoses = [];
    const source = this.#carte?.getSource(SOURCE_LIEUX) as GeoJSONSource | undefined;
    source?.setData({ type: 'FeatureCollection', features: [] });
  }

  #afficherLieux(trouves: SurLeTrajet<Monument>[], detourMin: number): void {
    const corps = this.querySelector('.iti-monuments-corps') as HTMLElement;
    corps.replaceChildren();
    this.#effacerLieuxCarte();

    if (trouves.length === 0) {
      corps.textContent = `Aucun monument classé à moins de ${detourMin} min`
        + ' environ de ce trajet. Élargissez le détour, ou profitez de la route.';
      return;
    }

    const resume = document.createElement('p');
    resume.className = 'monuments-resume';
    resume.textContent = `${trouves.length} monument${trouves.length > 1 ? 's' : ''}`
      + ` classé${trouves.length > 1 ? 's' : ''} à moins de ${detourMin} min environ`;
    corps.append(resume);

    const liste = document.createElement('ol');
    liste.className = 'monuments-liste';
    /* TRENTE AU PLUS : un trajet qui longe la Loire en croise des centaines,
       et la liste redeviendrait un mur. Les plus PROCHES DU TRACÉ d'abord —
       c'est le détour qui décide — puis remis dans l'ordre du chemin. */
    const montres = [...trouves].sort((a, b) => a.ecart - b.ecart).slice(0, 30)
      .sort((a, b) => a.avancement - b.avancement);
    for (const t of montres) {
      const item = document.createElement('li');

      /* LE NOM OUVRE LA FICHE — le retour d'Armelin du 27/08 au soir :
         « impossible de cliquer dessus pour avoir le détail à l'identique
         d'une station de recharge ». Le clic vole AUSSI vers le lieu : un
         détail sans savoir où laisse le travail à moitié fait — la même
         leçon que les arrêts de recharge. */
      const voir = document.createElement('button');
      voir.type = 'button';
      voir.className = 'monuments-voir';
      voir.textContent = t.poi.titre;
      voir.setAttribute('aria-label', `Détail de ${t.poi.titre}`);
      voir.addEventListener('click', () => {
        this.#carte?.flyTo({ center: [t.poi.lon, t.poi.lat], zoom: 15 });
        this.#ficheLieu?.ouvrir(t.poi);
      });

      const detail = document.createElement('span');
      detail.className = 'monuments-detail';
      const minutes = Math.max(1, Math.round(t.ecart / 1000 / KM_PAR_MINUTE));
      detail.textContent = [
        t.poi.commune || null,
        `km ${Math.round(t.avancement / 1000)}`,
        `≈ ${minutes} min de détour`,
      ].filter(Boolean).join(' · ');

      /* « LES AJOUTER À LA PLANIFICATION » — la moitié opérante de la
         demande : le monument devient une ÉTAPE du trajet, et le moteur
         recalcule par là. */
      const detour = document.createElement('button');
      detour.type = 'button';
      detour.className = 'monuments-detour-par';
      detour.textContent = 'Passer par là';
      detour.setAttribute('aria-label', `Faire un détour par ${t.poi.titre}`);
      detour.addEventListener('click', () => {
        if (!this.detourParLieu(t.poi)) {
          detail.textContent = `Le trajet porte déjà ${MAX_ETAPES} étapes —`
            + ' retirez-en une pour ajouter ce détour.';
        }
      });

      item.append(voir, detail, detour);
      liste.append(item);

    }
    /* LES LIEUX PASSENT SOUS LES ARRÊTS (30/08). Armelin : « le rond
       d'indication des lieux d'exception est affiché en premier plan devant
       les ronds d'arrêt de recharge. Il faut toujours afficher les ronds
       d'arrêt prévu en premier plan. » C'ÉTAIT STRUCTUREL, pas un réglage
       oublié : les lieux étaient des marqueurs du DOM, posés au-dessus du
       canevas, quand les arrêts sont peints DANS le canevas — aucun z-index
       ne pouvait les départager. Les lieux deviennent donc un calque de
       carte, inséré SOUS la pastille des arrêts. */
    this.#poserLieuxSurCarte(montres);
    corps.append(liste);

    const note = document.createElement('p');
    note.className = 'monuments-note';
    note.textContent = (trouves.length > montres.length
      ? `Les ${montres.length} plus proches du tracé sont listés, sur ${trouves.length}. ` : '')
      + 'Monuments historiques CLASSÉS, base Mérimée (ministère de la Culture).'
      + ' Le détour est estimé à vol d’oiseau — la route réelle peut faire plus.';
    corps.append(note);
  }

  /* DES PUCES À PICTOGRAMMES, PLUS UNE PHRASE. La phrase était le bon choix
     dans un accordéon dense ; Armelin, le 27/08/2026, montrant
     restautoroute.fr : « affiche des informations claires avec de beaux
     logos toutes les commodités », là où nous rendions « uniquement une
     liste ». Chaque puce porte le TYPE en picto dessiné (jamais un logo de
     marque — déposé), le NOM en toutes lettres, et la DISTANCE : « 60 m »
     décide d'y aller à pied pendant la charge, « 800 m » non. */
  #pucesCommodites(
    trouvees: import('../lib/commodites').Commodite[],
    autour: { lon: number; lat: number },
  ): HTMLElement {
    const boite = document.createElement('div');
    boite.className = 'com-puces';
    if (trouvees.length === 0) {
      boite.textContent = 'Rien de cartographié autour de cet arrêt — ce qui'
        + ' ne veut pas dire qu’il n’y a rien.';
      return boite;
    }
    const avecDistance = trouvees
      .map((c) => ({ c, m: Math.round(distanceM([autour.lon, autour.lat], [c.lon, c.lat])) }))
      .sort((a, b) => a.m - b.m);

    /* DOUZE PUCES AU PLUS, ET LE RESTE COMPTÉ : une grande aire porte trente
       commodités, et trente puces redeviennent le mur qu'on voulait éviter. */
    const montrees = avecDistance.slice(0, 12);
    for (const { c, m } of montrees) {
      const libelleType = TYPES_COMMODITE.find((t) => t.cle === c.type)?.libelle ?? c.type;
      const puce = document.createElement('span');
      puce.className = `com-puce com-${c.type}`;
      puce.title = `${libelleType}${c.nom ? ` — ${c.nom}` : ''} · ${m} m`;

      const picto = document.createElement('span');
      picto.className = 'com-picto';
      picto.setAttribute('aria-hidden', 'true');
      // Markup engendré depuis des constantes : aucune donnée externe n'y entre.
      picto.innerHTML = svgCommodite(c.type);

      const nom = document.createElement('span');
      nom.className = 'com-nom';
      // Un quart des commodités n'ont aucune identité : le type est le nom.
      nom.textContent = c.nom ?? libelleType;

      const dist = document.createElement('span');
      dist.className = 'com-distance';
      dist.textContent = `${m} m`;

      puce.append(picto, nom, dist);
      boite.append(puce);
    }
    const note = document.createElement('span');
    note.className = 'com-note';
    note.textContent = (montrees.length < avecDistance.length
      ? `${avecDistance.length - montrees.length} de plus à proximité. ` : '')
      + 'Source OpenStreetMap.';
    boite.append(note);
    return boite;
  }

  /**
   * Le résumé du haut : distance, temps de ROUTE, et le total quand un plan de
   * recharge existe.
   *
   * LE DÉFAUT QU'IL CORRIGE. Armelin, le 25/08/2026 : « la durée totale ne
   * précise pas si le temps de charge est compris ni le temps de charge à
   * chaque arrêt ». La ligne affichait la durée rendue par le moteur
   * d'itinéraire — c'est-à-dire le temps de conduite SEUL — sans le dire.
   * Pour un trajet électrique long, l'écart se compte en heures : annoncer
   * « 4 h 25 » quand il en faudra 5 h 40 n'est pas une approximation, c'est
   * une erreur de planification que l'usager découvre en route.
   *
   * TANT QU'AUCUN PLAN N'EXISTE, ON LE DIT AUSSI : « hors recharge » vaut
   * mieux qu'un nombre nu dont on ignore ce qu'il contient.
   */
  #majResume(): void {
    const resultat = this.querySelector('.iti-resultat') as HTMLElement;
    const iti = this.#dernier;
    if (!iti) { resultat.hidden = true; return; }
    resultat.hidden = false;

    /* L'HEURE D'ARRIVÉE RÉELLE (29/08) : départ choisi (ou maintenant) +
       route + charges. « demain » est dit quand le jour change. */
    const heureArriveeReelle = (totalS: number): string => {
      const depart = this.#departA ?? new Date();
      const a = new Date(depart.getTime() + totalS * 1000);
      const heure = a.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      const demain = a.getDate() !== new Date().getDate();
      return ` · arrivée vers ${demain ? 'demain ' : ''}${heure}`;
    };

    const base = `${formaterDistance(iti.distance)} — ${formaterDuree(iti.duree)}`;
    const plan = this.#planCourant;
    if (!plan || !plan.faisable) {
      /* PENDANT LE CALCUL AUTOMATIQUE, ON LE DIT (retour du 29/08 : « il
         faut attendre quelques secondes mais il faut le savoir ») : le
         résumé annonce que les arrêts arrivent, au lieu d'un silence qu'on
         prend pour un oubli. */
      resultat.textContent = (this.#profil === 'car'
        ? `${base} de route` + (this.#planEnCours
          ? ' — calcul des arrêts de recharge…' : ', hors recharge')
        : base) + heureArriveeReelle(iti.duree);
      return;
    }
    if (plan.arrets.length === 0) {
      resultat.textContent = `${base} — aucun arrêt de recharge nécessaire`
        + heureArriveeReelle(iti.duree);
      return;
    }
    const charge = Math.round(plan.dureeRechargeMin);
    const total = iti.duree + charge * 60;
    resultat.textContent = `${formaterDistance(iti.distance)} —`
      + ` ${formaterDuree(total)} au total`
      + ` (${formaterDuree(iti.duree)} de route + ${formaterDuree(charge * 60)} de charge)`
      + heureArriveeReelle(total);
  }

  /* ---- navigation entre les pages ---- */

  /**
   * Montre une page, et une seule.
   *
   * POURQUOI DES PAGES ET NON DES VOLETS. Le planificateur empilait cinq
   * `<details>` — profil, feuille de route, sur le trajet, météo, recharge —
   * qui pouvaient s'ouvrir ensemble dans une colonne de trois cents pixels.
   * Armelin, le 26/08/2026 : « chaque appui dans une section n'ouvre pas de
   * nouvelle fenêtre mais oblige encore à scroller indéfiniment ». Une feuille
   * de route de quatre-vingts étapes repoussait alors la météo hors de
   * l'écran, et retrouver le résumé du trajet demandait de remonter à
   * l'aveugle.
   *
   * UNE PAGE À LA FOIS, UN TITRE, UNE FLÈCHE. C'est la mécanique des
   * applications de téléphone, et elle vaut ici pour la même raison : la
   * colonne est étroite.
   */
  #allerA(vue: CleVue): void {
    this.#vue = vue;
    for (const section of this.querySelectorAll<HTMLElement>('.vue')) {
      section.hidden = section.dataset['vue'] !== vue;
    }
    const titre = this.querySelector('.vue-titre') as HTMLElement;
    titre.textContent = VUES[vue];
    const retour = this.querySelector('.vue-retour') as HTMLElement;
    retour.hidden = vue === 'accueil';
    // La croix ne paraît qu'avec la fenêtre : sur l'accueil, le volet se
    // referme par sa pastille, comme il l'a toujours fait.
    (this.querySelector('.vue-fermer') as HTMLElement).hidden = vue === 'accueil';
    /* LA PAGE OUVERTE EST UNE FENÊTRE, PAS UN TIROIR (FEN-2, 29/08 —
       Armelin : « quand je clique sur un pictogramme, je n'ai toujours pas
       de fenêtre flottante pour la configuration »). L'accueil reste la
       feuille basse qu'il avait demandée (BS-1) ; TOUTE AUTRE PAGE se
       détache en fenêtre, et le CSS s'accroche à cet attribut. */
    const volet = this.querySelector('details.iti') as HTMLElement;
    if (vue === 'accueil') delete volet.dataset['page'];
    else volet.dataset['page'] = vue;

    /* DEUX FAMILLES DE PAGES, ET LA MESURE QUI LES A SÉPARÉES (FEN-5).
       Posées AU CENTRE, toutes les pages devenaient des fenêtres franches
       — mais douze parcours E2E se sont mis à échouer, tous pour la même
       raison : ils cliquent la CARTE pendant que la page est ouverte, et
       une fenêtre centrée recouvre exactement l'endroit qu'on vise. Ce
       n'est pas un défaut de test, c'est un usage réel — on coche un
       filtre de bornes POUR regarder la carte changer.
       Une page qui COMMANDE la carte reste donc à côté d'elle ; une page
       qu'on consulte ou qu'on règle hors carte se pose au centre. */
    if (vue === 'accueil') delete volet.dataset['fenetre'];
    else volet.dataset['fenetre'] = PAGES_COLONNE.has(vue) ? 'colonne' : 'centree';
    /* LE CORPS REMONTE EN HAUT à chaque changement de page. Sans cela, on
       arrivait sur la météo au milieu de son texte, parce que la feuille de
       route d'avant avait fait défiler le conteneur. */
    (this.querySelector('.iti-corps') as HTMLElement).scrollTop = 0;

    // Chaque page charge ce qu'elle montre — jamais avant qu'on la demande.
    /* LES VARIANTES NE SURVIVENT PAS À LA PAGE : elles décrivent une
       comparaison qu'on vient de quitter, et trois traits fantômes sur la
       carte se liraient comme des routes proposées. */
    if (vue !== 'options') this.#effacerVariantes();
    if (vue === 'recharge') void this.#planifierRecharge();
    if (vue === 'feuille') void this.#chargerFeuille();
    if (vue === 'monuments') void this.#chargerLieux();
  }


  /** Le bouton ne paraît que s'il a de quoi faire : un trajet ET un bandeau. */
  #majBoutonDemarrer(): void {
    const bouton = this.querySelector<HTMLButtonElement>('.iti-demarrer');
    if (!bouton) return;
    bouton.hidden = !this.#guidage || !this.#dernier;
    bouton.textContent = this.#guidage?.actif ? 'Arrêter le suivi' : 'Démarrer le suivi';
  }

  /**
   * Démarre — ou arrête — le suivi de l'itinéraire.
   *
   * LA FEUILLE DE ROUTE EST CHARGÉE ICI SI ELLE MANQUE. Elle ne se calcule
   * qu'à la demande (quotas publics) ; sans elle, le bandeau afficherait des
   * distances sans jamais dire quand tourner. On l'attend donc — mais son
   * échec n'EMPÊCHE PAS le suivi : rouler en sachant ce qui reste et où
   * recharger vaut mieux que ne rien avoir parce qu'un service tiers est
   * tombé. Le bandeau dit alors « Suivez l'itinéraire », ce qui est vrai.
   */
  /**
   * Refait l'itinéraire depuis la position — le trajet s'est perdu, pas
   * l'intention. L'arrivée et les évitements tiennent ; les étapes DÉJÀ
   * PASSÉES tombent (repasser par elles ferait faire demi-tour) ; le plan
   * de recharge se refera tout seul (PR #84) ; et le suivi REPART sur le
   * nouveau tracé sans un geste.
   */
  async #recalculerDepuis(position: PointGeo): Promise<void> {
    const cliche = this.#calculPour;
    const iti = this.#dernier;
    if (!cliche || !iti || !this.#guidage?.actif) return;

    /* Les étapes encore devant : chacune se projette sur l'ANCIEN tracé, et
       seules celles au-delà de la voiture (500 m de marge : une étape à
       hauteur de calandre est une étape faite) restent au programme. */
    const trace = iti.geometrie.coordinates as [number, number][];
    const ici = situerSurLeTrace({ lon: position.lon, lat: position.lat }, trace);
    const restantes = cliche.etapes.filter((p) =>
      situerSurLeTrace(p, trace).avancement > ici.avancement + 500);
    const etapes = this.querySelector('etapes-itineraire') as EtapesItineraire;
    etapes.points = restantes;

    this.#reprendreSuivi = true;
    this.#poser('depart', position, 'Reprise d’itinéraire');
  }

  /**
   * Chercher une route qui QUITTE celle-ci, tout de suite (BIS-1, 30/08).
   *
   * CE QU'ON NE PEUT PAS FAIRE, ET QU'ON NE PRÉTEND PAS FAIRE. Le service
   * public d'itinéraire n'a aucun paramètre « éviter ce tronçon » (capacités
   * relevées le 21/08, reconfirmées le 28/08). On ne peut donc pas lui dire
   * où est l'obstacle. Ce bouton ne promet pas de l'éviter : il cherche une
   * route qui s'écarte de celle-ci dans les six kilomètres.
   *
   * COMMENT. Quatre calculs RÉELS en parallèle, chacun passant par un point
   * posé de côté — le moteur accroche ce point à la route la plus proche, ce
   * qui force un vrai détour. Deux distances, deux côtés : à 2,5 km on prend
   * la sortie suivante, à 5 km on change de vallée. Puis l'on MESURE lequel
   * quitte le tracé actuel le plus tôt (lib/bis.ts), et l'on adopte
   * celui-là. Si aucun ne s'en écarte, on le DIT — proposer un « bis » qui
   * repasse par l'obstacle serait pire que ne rien proposer.
   */
  async #itineraireBis(position: PointGeo, cap: number | null): Promise<void> {
    const cliche = this.#calculPour;
    const iti = this.#dernier;
    const repondre = (message: string): void => {
      document.dispatchEvent(new CustomEvent('itineraire-bis-resultat', {
        detail: { message },
      }));
    };
    if (!cliche || !iti) { repondre('Aucun itinéraire à dérouter.'); return; }

    const trace = iti.geometrie.coordinates as [number, number][];
    const devant = traceDevant(trace, position);
    /* SANS CAP, PAS DE CÔTÉ : le cap dit où est « devant », donc où sont la
       gauche et la droite. Il vient du récepteur ou de deux fixes successifs
       (bandeau-guidage) ; à l'arrêt il peut manquer. On se rabat alors sur la
       direction du tracé lui-même, qui est ce qu'on suit de toute façon. */
    const capUtile = cap ?? (devant.length > 1
      ? capEntre(devant[0]!, devant[devant.length - 1]!) : null);
    if (capUtile === null) { repondre('Direction inconnue : impossible de chercher un bis.'); return; }

    /* Les étapes encore devant restent au programme — même règle que le
       recalcul hors-route : une étape déjà passée n'est plus une étape. */
    const ici = situerSurLeTrace({ lon: position.lon, lat: position.lat }, trace);
    const restantes = cliche.etapes.filter((p) =>
      situerSurLeTrace(p, trace).avancement > ici.avancement + 500);

    const essais = ([2_500, 5_000] as const).flatMap((d) =>
      (['gauche', 'droite'] as const).map((cote) => ({ d, cote })));
    const candidats = (await Promise.all(essais.map(async ({ d, cote }) => {
      const [lon, lat] = pointLateral([position.lon, position.lat], capUtile, d, cote);
      const via = { lon, lat };
      try {
        const alt = await calculerItineraire(
          position, cliche.arrivee, cliche.profil,
          { etapes: [via, ...restantes], eviter: cliche.eviter,
            optimisation: cliche.optimisation },
        );
        return {
          cle: `${cote}-${d}`, libelle: `${cote} à ${d / 1000} km`,
          trace: alt.geometrie.coordinates as [number, number][],
          distanceM: alt.distance, dureeS: alt.duree, via,
        };
      } catch { return null; }
    }))).filter((c): c is NonNullable<typeof c> => c !== null);

    if (candidats.length === 0) { repondre('Le service n’a rendu aucun itinéraire bis.'); return; }
    const choix = choisirBis(devant, candidats);
    if (!choix) {
      repondre('Aucun bis trouvé : toutes les routes essayées repassent par ici.');
      return;
    }

    /* ON ADOPTE PAR LE CHEMIN ORDINAIRE : le point latéral devient une étape,
       et le calcul reprend depuis la position. Tout ce qui suit — plan de
       recharge, feuille de route, reprise du suivi — se refait tout seul,
       sans second chemin à maintenir. */
    const gagnant = candidats.find((c) => c.cle === choix.candidat.cle);
    if (!gagnant) { repondre('Aucun bis trouvé.'); return; }
    const etapes = this.querySelector('etapes-itineraire') as EtapesItineraire;
    etapes.points = [gagnant.via, ...restantes];
    this.#reprendreSuivi = true;
    this.#poser('depart', position, 'Itinéraire bis');
    repondre(`Itinéraire bis : sortie dans ${formaterDistance(choix.divergenceM)}`
      + `, ${formaterDuree(gagnant.dureeS)} jusqu’à l’arrivée.`);
  }

  async #demarrerSuivi(relance = false): Promise<void> {
    const bandeau = this.#guidage;
    const iti = this.#dernier;
    if (!bandeau || !iti) return;
    /* LE BOUTON EST UNE BASCULE — la RELANCE du recalcul hors-route ne l'est
       pas : appelée pendant un suivi actif, elle doit repartir sur le
       nouveau tracé (demarrer() commence de toute façon par arreter()). */
    if (bandeau.actif && !relance) { bandeau.arreter(); this.#majBoutonDemarrer(); return; }

    const bouton = this.querySelector<HTMLButtonElement>('.iti-demarrer');
    if (bouton) { bouton.disabled = true; bouton.textContent = 'Préparation…'; }
    /* LE CLICHÉ DU CALCUL RÉUSSI, jamais l'état vivant des champs : entre-temps
       l'usager a pu changer d'adresse sans que le recalcul aboutisse, et le
       suivi doit décrire le trajet TRACÉ. Même règle que la feuille de route.
       Si aucune étape n'a pu être obtenue, le bandeau dira simplement
       « Suivez l'itinéraire » — ce qui est vrai. */
    const cliche = this.#calculPour;
    let etapes: EtapeRoute[] = [];
    if (cliche) {
      try {
        etapes = await etapesItineraire(
          cliche.depart, cliche.arrivee, cliche.profil,
          { etapes: cliche.etapes, eviter: cliche.eviter, optimisation: cliche.optimisation },
        );
      } catch { /* le suivi vaut mieux sans instructions que pas de suivi */ }
    }
    if (bouton) bouton.disabled = false;
    // L'usager a pu effacer le trajet pendant le chargement de la feuille.
    if (this.#dernier !== iti) { this.#majBoutonDemarrer(); return; }

    const plan = this.#planCourant;
    bandeau.demarrer({
      trace: iti.geometrie.coordinates as [number, number][],
      distanceTotaleM: iti.distance,
      dureeTotaleS: iti.duree,
      etapes,
      arrets: plan?.faisable
        ? plan.arrets.map((a) => ({
          nom: a.borne.nom,
          reseau: a.borne.reseau ?? null,
          avancementM: a.borne.avancementM,
          dureeMin: a.dureeMin,
          lon: a.borne.lon,
          lat: a.borne.lat,
          socArrivee: a.socArrivee,
          socDepart: a.socDepart,
        }))
        : [],
    });
    this.#majBoutonDemarrer();
    /* LES LIMITES CARTOGRAPHIÉES ARRIVENT APRÈS : « Démarrer » ne doit pas
       attendre les vingt secondes qu'Overpass peut prendre. Un appel, dont
       l'échec est bénin — le panneau de limite n'apparaît pas, et le suivi
       vaut mieux sans lui que pas de suivi. Livrées SEULEMENT si le suivi
       tourne encore sur CE trajet. */
    chargerLimites(iti.geometrie)
      .then((limites) => {
        if (bandeau.actif && this.#dernier === iti) bandeau.limites = limites;
      })
      .catch(() => { /* bénin : voir ci-dessus */ });
    /* LES ÉVÉNEMENTS TRAFIC DU CORRIDOR — livrés puis RAFRAÎCHIS toutes les
       cinq minutes tant que le suivi tourne sur CE trajet : un accident
       arrive pendant qu'on roule. La couche trafic de la carte (PR #14) fait
       trois minutes ; cinq suffisent à une annonce. L'échec est bénin — la
       ligne reste vide. */
    const trace = iti.geometrie.coordinates as [number, number][];
    const rafraichirTrafic = (): void => {
      chargerTrafic()
        .then((evenements) => {
          if (bandeau.actif && this.#dernier === iti) {
            bandeau.evenements = evenementsDuTrajet(evenements, trace);
          }
        })
        .catch(() => { /* bénin : la ligne trafic reste vide */ });
    };
    rafraichirTrafic();
    const minuteurTrafic = setInterval(() => {
      if (!bandeau.actif || this.#dernier !== iti) {
        clearInterval(minuteurTrafic);
        return;
      }
      rafraichirTrafic();
    }, 5 * 60_000);
  }

  /**
   * Pose une extrémité du trajet, et calcule si les deux sont là.
   *
   * UN SEUL CHEMIN pour toutes les façons de désigner un lieu — la saisie
   * d'adresse, un raccourci, le cartouche d'une borne, un commerce voisin.
   * Deux chemins parallèles auraient fini par diverger sur un détail : l'un
   * ouvrirait le volet, l'autre non ; l'un nommerait le lieu, l'autre pas.
   */
  #poser(role: 'depart' | 'arrivee', point: PointGeo, libelle: string): void {
    if (role === 'depart') { this.#depart = point; this.#libelleDepart = libelle; }
    else { this.#arrivee = point; this.#libelleArrivee = libelle; }
    const champ = this.querySelector<RechercheAdresse>(
      `[data-role="${role}"] recherche-adresse`,
    );
    if (champ) champ.libelle = libelle;
    void this.#calculer();
  }

  /**
   * Montre ou range « Effacer » et « Inverser » selon qu'il y a matière.
   *
   * Le mandat UX du 28/08 : « le bouton d'effacement apparaît alors
   * qu'aucun trajet n'existe » — vérifié, il était permanent. Il ne paraît
   * plus que s'il y a un point, une étape ou un trajet à effacer ;
   * l'inversion, dès qu'un point existe.
   */
  #majBoutons(): void {
    const etapes = this.querySelector('etapes-itineraire') as EtapesItineraire | null;
    const matiere = Boolean(this.#depart || this.#arrivee || this.#dernier
      || (etapes && etapes.points.length > 0));
    const effacer = this.querySelector<HTMLElement>('.iti-effacer');
    if (effacer) effacer.hidden = !matiere;
    const inverser = this.querySelector<HTMLElement>('.iti-inverser');
    if (inverser) inverser.hidden = !(this.#depart || this.#arrivee);
  }

  /** Échange départ et destination — points, libellés, champs — et recalcule. */
  #inverser(): void {
    [this.#depart, this.#arrivee] = [this.#arrivee, this.#depart];
    [this.#libelleDepart, this.#libelleArrivee] = [this.#libelleArrivee, this.#libelleDepart];
    for (const role of ['depart', 'arrivee'] as const) {
      const point = role === 'depart' ? this.#depart : this.#arrivee;
      const libelle = role === 'depart' ? this.#libelleDepart : this.#libelleArrivee;
      const champ = this.querySelector<RechercheAdresse>(
        `[data-role="${role}"] recherche-adresse`,
      );
      /* UN POINT SANS LIBELLÉ (trajet rejoué d'un lien partagé) s'affiche en
         coordonnées : un champ vide au-dessus d'un tracé réel mentirait. */
      if (champ) champ.libelle = point ? (libelle || formaterCoordonnees(point)) : '';
    }
    void this.#calculer();
  }

  /* LES RACCOURCIS SE CONSTRUISENT À L'OUVERTURE ET À CHAQUE CHANGEMENT :
     domicile et travail se définissent depuis un autre panneau, les favoris
     s'ajoutent depuis la carte. Une liste figée au démarrage aurait ignoré
     tout ce que l'usager fait ensuite. */
  async #majRaccourcis(): Promise<void> {
    /* SEULS LES REPÈRES RESTENT EN LIGNE — Domicile et Travail sont DEUX
       boutons, les favoris étaient jusqu'à SIX sous CHAQUE champ : la
       capture d'Armelin du 28/08 montre le mur qu'ils formaient. Ils passent
       derrière un bouton « Favoris… » qui ouvre une boîte dédiée, avec
       recherche — le mandat UX le demande en toutes lettres. */
    const entrees: { libelle: string; point: PointGeo; titre: string }[] = [];
    const reperesLus: { domicile?: PointGeo & { libelle: string };
      travail?: PointGeo & { libelle: string } } = {};
    for (const { cle, libelle } of REPERES) {
      const r = await lireRepere(cle as CleRepere);
      if (r) {
        entrees.push({ libelle, point: r, titre: r.libelle });
        if (cle === 'domicile') reperesLus.domicile = { lon: r.lon, lat: r.lat, libelle: r.libelle };
        if (cle === 'travail') reperesLus.travail = { lon: r.lon, lat: r.lat, libelle: r.libelle };
      }
    }
    const nbFavoris = (await listerFavoris()).length;

    /* LES ROUTINES DU MOMENT — en tête de l'accueil, un geste et le trajet
       part (allerVers : destination posée, départ déduit ou demandé). */
    const routines = this.querySelector<HTMLElement>('.iti-routines');
    if (routines) {
      routines.replaceChildren();
      const suggestions = suggerer(await lireHabitudes(), reperesLus, new Date());
      for (const sug of suggestions) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'iti-routine';
        b.textContent = `→ ${sug.nom}`;
        b.title = sug.motif;
        b.setAttribute('aria-label', `${sug.nom} — trajet habituel (${sug.motif})`);
        b.addEventListener('click', () => {
          this.allerVers({ lon: sug.point.lon, lat: sug.point.lat }, sug.nom);
        });
        routines.append(b);
      }
      routines.hidden = suggestions.length === 0;
    }

    for (const boite of this.querySelectorAll<HTMLElement>('.iti-raccourcis')) {
      const role = boite.dataset['pour'] === 'arrivee' ? 'arrivee' : 'depart';
      boite.replaceChildren();

      /* « MA POSITION » N'EST PROPOSÉE QU'AU DÉPART, et c'est délibéré : on
         part d'où l'on est, on ne s'y rend pas. La géolocalisation reste un
         GESTE — le bouton la demande, l'application ne la prend jamais
         d'elle-même (contrainte 4 du projet). */
      if (role === 'depart') {
        const ici = document.createElement('button');
        ici.type = 'button';
        ici.className = 'iti-raccourci iti-raccourci-gps';
        ici.textContent = 'Ma position';
        ici.setAttribute('aria-label', 'Partir de ma position actuelle');
        ici.addEventListener('click', () => { void this.#partirDIci(ici); });
        boite.append(ici);
      }

      for (const e of entrees) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'iti-raccourci';
        b.textContent = e.libelle;
        b.title = e.titre;
        b.setAttribute('aria-label',
          role === 'depart' ? `Partir de ${e.libelle}` : `Aller à ${e.libelle}`);
        b.addEventListener('click', () => {
          this.#poser(role, { lon: e.point.lon, lat: e.point.lat }, e.titre);
        });
        boite.append(b);
      }
      if (nbFavoris > 0) {
        const favoris = document.createElement('button');
        favoris.type = 'button';
        favoris.className = 'iti-raccourci iti-raccourci-favoris';
        favoris.textContent = `Favoris… (${nbFavoris})`;
        favoris.setAttribute('aria-label', role === 'depart'
          ? 'Choisir un favori comme départ' : 'Choisir un favori comme arrivée');
        favoris.addEventListener('click', () => { void this.#ouvrirChoixFavori(role); });
        boite.append(favoris);
      }
      boite.hidden = boite.childElementCount === 0;
    }
  }

  /**
   * La boîte de choix d'un favori — un `<dialog>` NATIF : focus piégé,
   * Échap géré, arrière-plan inerte, sans une ligne de plomberie modale.
   *
   * Reconstruite à chaque ouverture : les favoris bougent (ajout depuis la
   * carte, renommage) et une boîte figée les ignorerait.
   */
  async #ouvrirChoixFavori(role: 'depart' | 'arrivee'): Promise<void> {
    let boite = this.querySelector<HTMLDialogElement>('dialog.choix-favori');
    if (!boite) {
      boite = document.createElement('dialog');
      boite.className = 'choix-favori';
      boite.setAttribute('aria-label', 'Choisir un lieu enregistré');
      this.append(boite);
    }
    const favoris = await listerFavoris();

    boite.replaceChildren();
    const titre = document.createElement('p');
    titre.className = 'choix-favori-titre';
    titre.textContent = role === 'depart' ? 'Partir de…' : 'Aller à…';

    const fermer = document.createElement('button');
    fermer.type = 'button';
    fermer.className = 'choix-favori-fermer';
    fermer.textContent = '✕';
    fermer.setAttribute('aria-label', 'Fermer sans choisir');
    fermer.addEventListener('click', () => { boite.close(); });

    const recherche = document.createElement('input');
    recherche.type = 'search';
    recherche.className = 'choix-favori-recherche';
    recherche.placeholder = 'Chercher un favori…';
    recherche.setAttribute('aria-label', 'Chercher parmi les favoris');

    const liste = document.createElement('ul');
    liste.className = 'choix-favori-liste';
    const rendre = (filtre: string): void => {
      const f = filtre.trim().toLowerCase();
      liste.replaceChildren();
      for (const favori of favoris) {
        if (f && !favori.nom.toLowerCase().includes(f)
          && !(favori.adresse ?? '').toLowerCase().includes(f)) continue;
        const item = document.createElement('li');
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'choix-favori-item';
        const nom = document.createElement('span');
        nom.className = 'choix-favori-nom';
        nom.textContent = favori.nom;
        b.append(nom);
        if (favori.adresse && favori.adresse !== favori.nom) {
          const ou = document.createElement('span');
          ou.className = 'choix-favori-adresse';
          ou.textContent = favori.adresse;
          b.append(ou);
        }
        b.addEventListener('click', () => {
          this.#poser(role, { lon: favori.lon, lat: favori.lat }, favori.nom);
          boite.close();
        });
        item.append(b);
        liste.append(item);
      }
      if (liste.childElementCount === 0) {
        const vide = document.createElement('li');
        vide.className = 'choix-favori-vide';
        vide.textContent = 'Aucun favori ne porte ce nom.';
        liste.append(vide);
      }
    };
    recherche.addEventListener('input', () => { rendre(recherche.value); });
    rendre('');

    boite.append(fermer, titre, recherche, liste);
    boite.showModal();
    recherche.focus();
  }

  /**
   * Demande la position et la pose en départ.
   *
   * L'ÉCHEC SE DIT. Une géolocalisation refusée ou indisponible ne doit pas
   * laisser un bouton qui ne fait rien : c'est le genre de silence qui fait
   * croire l'application cassée.
   */
  async #partirDIci(bouton: HTMLButtonElement): Promise<void> {
    const erreur = this.querySelector('.iti-erreur') as HTMLElement;
    if (!('geolocation' in navigator)) {
      erreur.textContent = 'Ce navigateur ne sait pas donner votre position.';
      erreur.hidden = false;
      return;
    }
    bouton.disabled = true;
    const avant = bouton.textContent;
    bouton.textContent = 'Localisation…';
    try {
      const p = await new Promise<GeolocationPosition>((ok, non) => {
        navigator.geolocation.getCurrentPosition(ok, non,
          { enableHighAccuracy: true, timeout: 15_000, maximumAge: 30_000 });
      });
      const point = { lon: p.coords.longitude, lat: p.coords.latitude };
      /* ON NOMME LE LIEU. « Ma position » suffirait à l'usager, mais une
         adresse lui permet de VÉRIFIER que le GPS ne l'a pas placé ailleurs —
         et l'échec de la BAN ne doit pas perdre la position pour autant. */
      const adresse = await adresseInverse(point).catch(() => null);
      erreur.hidden = true;
      this.#poser('depart', point, adresse?.libelle ?? 'Ma position');
    } catch {
      erreur.textContent = 'Position indisponible. Autorisez la géolocalisation,'
        + ' ou saisissez votre point de départ.';
      erreur.hidden = false;
    } finally {
      bouton.disabled = false;
      bouton.textContent = avant;
    }
  }

  /** Lit un réglage numérique du volet, avec son repli si l'élément manque. */
  #valeurReglage(selecteur: string, repli: number): number {
    const el = this.querySelector<HTMLSelectElement>(selecteur);
    const v = Number(el?.value);
    return Number.isFinite(v) && v >= 0 ? v : repli;
  }

  /**
   * « Pourquoi ce plan ? » — mandat UX du 28/08 (PR UX-4).
   *
   * ON N'EXPLIQUE QU'AVEC CE QU'ON SAIT : les consignes de l'usager
   * (réserve, plafond, cible, réseaux cochés, arrêts imposés ou écartés),
   * la puissance RETENUE à chaque borne — le minimum entre elle et le
   * véhicule —, l'écart au tracé. Et l'aveu du modèle, en toutes lettres :
   * ni relief, ni vent, ni trafic, ni courbe de charge réelle. Jamais
   * d'invention — pas de « plus fiable », pas de « meilleur choix » sans le
   * critère qui l'a décidé.
   */
  #pourquoiCePlan(plan: PlanRecharge): HTMLElement {
    const v = this.#vehiculeCourant;
    const volet = document.createElement('details');
    volet.className = 'recharge-pourquoi';
    const titre = document.createElement('summary');
    titre.textContent = 'Pourquoi ce plan ?';
    volet.append(titre);

    const consignes = document.createElement('p');
    consignes.className = 'pourquoi-consignes';
    const cible = this.#valeurReglage('.recharge-cible', 10);
    const reserve = this.#valeurReglage('.recharge-reserve', 10);
    const plafond = this.#valeurReglage('.recharge-plafond', 100);
    const morceaux = [
      `partir à ${Math.round(this.#socDepart)} %`,
      `arriver à chaque borne avec au moins ${reserve} % (votre réserve)`,
      ...(plafond < 100 ? [`ne jamais charger au-delà de ${plafond} % (votre plafond)`] : []),
      `viser ${cible} % à destination`,
    ];
    consignes.textContent = `Vos consignes : ${morceaux.join(' ; ')}.`;
    volet.append(consignes);

    /* LES CONDITIONS APPLIQUÉES (28/08) — chiffres du CALCUL, jamais
       redérivés ici : le plan les rend avec lui. Et quand rien n'a été
       relevé, on le dit : un plan « à 20 °C, à plat » qui se tairait
       passerait pour une prévision. */
    const cond = plan.conditionsAppliquees;
    if (cond && v) {
      const releve = this.#conditions ?? {};
      const p = document.createElement('p');
      p.className = 'pourquoi-conditions';
      const bouts: string[] = [];
      if (typeof releve.tempDepartC === 'number' || typeof releve.tempArriveeC === 'number') {
        const t = (x: number | undefined): string =>
          (typeof x === 'number' ? `${Math.round(x)} °C` : '?');
        bouts.push(`${t(releve.tempDepartC)} au départ, ${t(releve.tempArriveeC)} à l'arrivée`
          + (cond.facteurTemperature !== 1
            ? ` (consommation ×${cond.facteurTemperature.toFixed(2)})` : ''));
      }
      if (typeof releve.vitesseMoyenneKmh === 'number') {
        bouts.push(`${Math.round(releve.vitesseMoyenneKmh)} km/h de moyenne — les limites`
          + ` du parcours, comptées par le moteur (×${cond.facteurVitesse.toFixed(2)})`);
      }
      if (typeof releve.monteeM === 'number') {
        bouts.push(`D+ ${Math.round(releve.monteeM)} m / D− ${Math.round(releve.descenteM ?? 0)} m`
          + ` (${cond.deniveleKwh >= 0 ? '+' : '−'}${Math.abs(cond.deniveleKwh).toFixed(1)} kWh)`);
      }
      if (cond.plafondThermiqueKw !== null) {
        bouts.push(`charge bridée à ${cond.plafondThermiqueKw} kW — le bridage`
          + ' déclaré de votre véhicule, appliqué sur la température de'
          + ' l’AIR : la batterie n’est pas mesurable d’ici, l’estimation'
          + ' est prudente');
      }
      if (bouts.length === 0) {
        p.textContent = 'Conditions non relevées (météo et relief'
          + ' indisponibles) : plan à 20 °C, à plat.';
      } else {
        p.textContent = `Conditions du jour : ${bouts.join(' ; ')} — soit`
          + ` ${cond.consommationKwh100.toFixed(1)} kWh/100 km retenus`
          + ` (référence ${v.consommationKwh100.toFixed(1)}).`;
      }
      volet.append(p);
    }

    /* CE QUE L'USAGER A DÉJÀ DÉCIDÉ compte dans l'explication : un plan
       taillé par des réseaux cochés ou des refus au « − » n'est pas un choix
       du planificateur, et le dire évite de le lui attribuer. */
    const contraintes: string[] = [];
    if (this.#reseauxPreferes.size > 0) {
      contraintes.push(`seuls vos réseaux cochés sont considérés (${
        [...this.#reseauxPreferes].sort((a, b) => a.localeCompare(b, 'fr')).join(', ')})`);
    }
    if (this.#imposees.size > 0) {
      contraintes.push(`${this.#imposees.size} arrêt${this.#imposees.size > 1 ? 's' : ''} imposé${this.#imposees.size > 1 ? 's' : ''} par vous`);
    }
    if (this.#ecartees.size > 0) {
      contraintes.push(`${this.#ecartees.size} borne${this.#ecartees.size > 1 ? 's' : ''} écartée${this.#ecartees.size > 1 ? 's' : ''} au « − »`);
    }
    const pauseMin = this.#valeurReglage('.recharge-pause-min', 0);
    if (pauseMin > 0) {
      contraintes.push(`chaque arrêt dure au moins ${pauseMin} min — la pause`
        + ' PAIE la charge : on repart plus chargé, jamais au-delà du plafond');
    }
    const intervalleMin = this.#valeurReglage('.recharge-pause-intervalle', 0);
    if (intervalleMin > 0) {
      contraintes.push(`une pause au moins toutes les ${intervalleMin / 60} h de route`);
    }
    const profilPauseChoisi = PROFILS_PAUSE.find((x) =>
      x.cle === (this.querySelector<HTMLSelectElement>('.recharge-pause-profil')?.value ?? ''));
    if (profilPauseChoisi) {
      contraintes.push(`privilégier les bornes avec ${profilPauseChoisi.agrement}`
        + ' à moins de 500 m (environs OpenStreetMap — une préférence,'
        + ' jamais un filtre)');
    }
    if (contraintes.length > 0) {
      const p = document.createElement('p');
      p.className = 'pourquoi-contraintes';
      p.textContent = `Vos choix : ${contraintes.join(' ; ')}.`;
      volet.append(p);
    }

    if (plan.arrets.length === 0) {
      const aucun = document.createElement('p');
      aucun.className = 'pourquoi-arret';
      aucun.textContent = 'Aucun arrêt : la batterie couvre la distance'
        + ' sans entamer votre réserve.';
      volet.append(aucun);
    } else {
      const liste = document.createElement('ul');
      liste.className = 'pourquoi-liste';
      for (const [i, a] of plan.arrets.entries()) {
        const item = document.createElement('li');
        const imposee = this.#imposees.has(cleBorne(a.borne));
        /* La puissance RETENUE compte AUSSI le bridage thermique : écrire
           « 150 kW » quand le BMS a plafonné à 30 mentirait sur la ligne
           même qui explique la durée. */
        const brideKw = plan.conditionsAppliquees?.plafondThermiqueKw ?? null;
        const retenue = v
          ? Math.min(a.borne.puissanceKw ?? 0, v.puissanceMaxKw, brideKw ?? Infinity)
          : null;
        const bouts = [
          imposee
            ? 'imposé par vous'
            /* LE CRITÈRE DU CHOIX, tel que le planificateur le calcule
               vraiment (lib/arrets.ts) : l'avancement gagné, moins le détour,
               moins le temps que coûterait la charge — pas un superlatif. */
            : 'retenu sur le compromis distance gagnée / puissance / détour',
          `vous y arrivez à ${Math.round(a.socArrivee)} %`,
          a.dureeMin > 0
            ? `charge jusqu'à ${Math.round(a.socDepart)} %`
              + (plafond < 100 && Math.round(a.socDepart) >= plafond ? ' (votre plafond)' : '')
            : 'sans recharge',
          ...(a.dureeMin > 0 && retenue && v
            ? [`${Math.round(a.dureeMin)} min à ${retenue} kW retenus`
              + (a.borne.puissanceKw && a.borne.puissanceKw > v.puissanceMaxKw
                ? ` (la borne offre ${a.borne.puissanceKw}, le véhicule accepte ${v.puissanceMaxKw})`
                : '')]
            : []),
          ...(a.borne.ecartM >= 100
            ? [`détour de ${a.borne.ecartM >= 1000
              ? `${(a.borne.ecartM / 1000).toFixed(1)} km` : `${Math.round(a.borne.ecartM)} m`}`]
            : ['au bord du tracé']),
        ];
        item.textContent = `${i + 1}. ${a.borne.nom} — ${bouts.join(' · ')}.`;
        liste.append(item);
      }
      volet.append(liste);
    }

    /* L'AVEU DU MODÈLE clôt l'explication — la règle du projet : ne jamais
       faire dire au calcul ce qu'il ne sait pas. */
    const limites = document.createElement('p');
    limites.className = 'pourquoi-limites';
    /* L'AVEU SUIT LE CALCUL : depuis le 28/08, relief, température et
       vitesse du parcours peuvent être comptés — dire encore « à plat »
       serait faux dans un sens comme dans l'autre. */
    const conditionsComptees = Boolean(plan.conditionsAppliquees)
      && ((this.#conditions?.monteeM !== undefined)
        || (this.#conditions?.tempDepartC !== undefined));
    limites.textContent = conditionsComptees
      ? 'Restent inconnus de ce modèle : le vent, la pluie, le trafic, le'
        + ' style de conduite et la courbe de charge réelle du véhicule — et'
        + ' la température retenue est celle de l’air, pas de la batterie.'
      : 'Ce modèle calcule à plat et à consommation'
        + ' constante : ni relief, ni vent, ni trafic, ni courbe de charge'
        + ' réelle du véhicule.';
    volet.append(limites);
    return volet;
  }

  #afficherRecharge(plan: PlanRecharge): void {
    const corps = this.querySelector('.iti-recharge-corps') as HTMLElement;
    corps.replaceChildren();
    // Le résumé du haut apprend le temps de charge : voir `#majResume`.
    this.#planCourant = plan;
    /* LE BOUTON DE RECALCUL NE PARAÎT QUE S'IL A QUELQUE CHOSE À FAIRE :
       tant qu'aucun arrêt n'a été ajouté à la main, le plan EST celui du
       calcul, et proposer de le refaire n'aurait aucun sens. */
    const recalculer = this.querySelector<HTMLElement>('.recharge-recalculer');
    if (recalculer) recalculer.hidden = this.#courtoisie.size === 0;
    this.#planEnCours = false;
    this.#majResume();
    /* LA CARTE PASSE EN MODE TRAJET : les bornes nationales s'effacent, seules
       restent celles du corridor et les arrêts du plan. Même sur un REFUS —
       c'est précisément là qu'on cherche des yeux une borne de repli. */
    this.#poserBornesTrajet();

    if (!plan.faisable) {
      /* ON DIT NON, TÔT, AVEC LE MOTIF. Un plan bancal qui laisse découvrir le
         trou à 8 % de batterie est pire que l'aveu. */
      const refus = document.createElement('p');
      refus.className = 'recharge-refus';
      refus.textContent = plan.motif ?? 'Trajet impossible avec ce véhicule.';
      corps.append(refus);
      /* MAIS LES COMMANDES RESTENT. Un refus vient souvent d'une consigne trop
         serrée — un réseau préféré qui ne dessert pas la route, une borne
         écartée de trop. Effacer les réglages en même temps qu'on annonce
         l'échec enferme l'usager : il voit le mur, et plus rien pour le
         contourner. Attrapé par un parcours E2E qui cochait « Tesla » sur un
         trajet sans Tesla, puis ne retrouvait plus la case pour la décocher. */
      if (this.#bornesTrajet.length > 0) {
        corps.append(this.#voletReseaux(), this.#voletToutesBornes(plan));
      }
      return;
    }

    const resume = document.createElement('p');
    resume.className = 'recharge-resume';
    resume.textContent = plan.arrets.length === 0
      ? `Aucun arrêt nécessaire — arrivée à ${Math.round(plan.socArrivee)} % de batterie.`
      : `${plan.arrets.length} arrêt${plan.arrets.length > 1 ? 's' : ''}`
        + ` · ${Math.round(plan.dureeRechargeMin)} min de charge`
        + ` · arrivée à ${Math.round(plan.socArrivee)} %`;
    corps.append(resume, this.#pourquoiCePlan(plan));

    if (plan.arrets.length > 0) {
      const profilPause = PROFILS_PAUSE.find((x) =>
        x.cle === (this.querySelector<HTMLSelectElement>('.recharge-pause-profil')?.value ?? ''));
      const liste = document.createElement('ol');
      liste.className = 'recharge-liste';
      for (const a of plan.arrets) {
        const item = document.createElement('li');
        /* LE NOM EST UN BOUTON : une liste d'arrêts qu'on ne peut pas situer
           sur la carte oblige à chercher des yeux ce que l'application sait
           déjà. Un clic y vole. */
        /* LE NOM OUVRE LE CARTOUCHE DE DÉTAIL. Armelin, le 25/08 : « on ne
           peut pas cliquer sur un point de charge suggéré pour avoir son
           détail, ni le nom de l'opérateur du réseau ». Le clic vole aussi la
           carte jusqu'à la borne : voir un détail sans savoir où il se trouve
           laisse le travail à moitié fait. */
        const aller = document.createElement('button');
        aller.type = 'button';
        aller.className = 'recharge-aller';
        aller.textContent = a.borne.nom;
        aller.setAttribute('aria-label', `Détail de ${a.borne.nom}`);
        aller.addEventListener('click', () => {
          this.#carte?.flyTo({ center: [a.borne.lon, a.borne.lat], zoom: 14 });
          this.#fiche?.ouvrir({
            id: a.borne.id ?? null,
            lon: a.borne.lon,
            lat: a.borne.lat,
            nom: a.borne.nom,
          });
        });
        /* LE RÉSEAU EST NOMMÉ ICI, sur sa propre ligne : c'est ce qu'on
           cherche des yeux depuis la route, et ce qui décide de la carte
           d'abonnement qu'on sortira. */
        const reseau = document.createElement('span');
        reseau.className = 'recharge-reseau';
        reseau.textContent = a.borne.reseau ?? 'réseau non déclaré';

        const detail = document.createElement('span');
        detail.className = 'recharge-detail';
        /* LE TEMPS DE CHARGE EST NOMMÉ « de charge », pas laissé en « min »
           nu au milieu d'autres nombres : la demande d'Armelin portait
           précisément sur cette confusion. */
        detail.textContent = `${Math.round(a.borne.avancementM / 1000)} km`
          + ` · arrivée ${Math.round(a.socArrivee)} % → départ ${Math.round(a.socDepart)} %`
          + (a.dureeMin > 0
            ? ` · ${Math.round(a.dureeMin)} min de charge`
            : ' · arrêt imposé, sans recharge')
          + (a.borne.puissanceKw ? ` · ${a.borne.puissanceKw} kW` : '')
          /* LA TROUVAILLE DU PROFIL, SUR L'ARRÊT MÊME : « aire de jeux à
             250 m » se lit là où l'on décide de s'arrêter. */
          + (profilPause && a.agrementM !== undefined
            ? ` · ${profilPause.agrement} à ${a.agrementM} m` : '');
        /* LES COMMODITÉS SONT À LA DEMANDE, un arrêt à la fois. Overpass est
           un service bénévole : on ne l'interroge pas pour les quatre arrêts
           d'un coup au cas où l'usager regarderait. */
        const voir = document.createElement('button');
        voir.type = 'button';
        voir.className = 'recharge-commodites';
        voir.textContent = 'Commodités sur place';
        voir.setAttribute('aria-label', `Voir les commodités à ${a.borne.nom}`);
        const sortie = document.createElement('p');
        sortie.className = 'recharge-commodites-corps';
        sortie.setAttribute('role', 'status');
        voir.addEventListener('click', () => {
          voir.disabled = true;
          sortie.textContent = 'Recherche des commodités…';
          chargerCommodites(a.borne.lon, a.borne.lat).then(
            (trouvees) => {
              sortie.replaceChildren(
                this.#pucesCommodites(trouvees, { lon: a.borne.lon, lat: a.borne.lat }),
              );
            },
            (e: unknown) => {
              voir.disabled = false;   // réessayable : Overpass tombe souvent
              sortie.textContent = e instanceof ErreurCommodites
                ? e.message : 'Les commodités ne sont pas disponibles pour le moment.';
            },
          );
        });
        /* LE « − » RETIRE CET ARRÊT DU PLAN. Sans lui, un usager qui refuse
           une borne — trop chère, mauvaise expérience, réseau qu'il n'a pas —
           n'a aucun recours que de subir la proposition. */
        const retirer = document.createElement('button');
        retirer.type = 'button';
        retirer.className = 'recharge-retirer';
        retirer.textContent = '−';
        retirer.title = 'Ne pas s’arrêter ici';
        retirer.setAttribute('aria-label', `Écarter ${a.borne.nom} du plan`);
        retirer.addEventListener('click', () => {
          const cle = cleBorne(a.borne);
          this.#ecartees.add(cle);
          this.#imposees.delete(cle);
          this.#refairePlan();
        });
        item.append(aller, reseau, detail, retirer, voir, sortie);
        liste.append(item);
        /* Le marqueur de l'arrêt vit désormais dans la couche `iti-arrets`
           (voir #poserBornesTrajet) : pastille numérotée, cliquable. */
      }
      corps.append(liste);
    }

    // Toutes les bornes du trajet, et la main sur le plan.
    if (this.#bornesTrajet.length > 0) {
      corps.append(this.#voletReseaux(), this.#voletToutesBornes(plan));
    }

    const reserve = document.createElement('p');
    /* CETTE CLASSE A ÉTÉ RENOMMÉE (30/08) : elle nommait DEUX choses sans
       rapport — ce paragraphe d'explication et le <select> de réserve du
       formulaire. `querySelector('.recharge-reserve')` rendait donc l'un ou
       l'autre selon l'ordre du DOM, et la relecture des réglages tombait sur
       un <p> sans `.options` : elle s'interrompait là, laissant les réglages
       suivants à leur valeur par défaut. Une classe ne nomme qu'une chose. */
    reserve.className = 'recharge-note-reserve';
    /* LA NOTE SUIT LE CALCUL (28/08) : quand météo et relief sont relevés,
       « à plat, à consommation constante » serait un mensonge — et quand ils
       ne le sont pas, l'ancien aveu reste le bon. */
    const releves = this.#conditionsPour === this.#dernier
      && (this.#conditions?.tempDepartC !== undefined
        || this.#conditions?.monteeM !== undefined);
    reserve.textContent = (releves
      ? 'Température, relief et vitesse du parcours sont comptés (détail dans'
        + ' « Pourquoi ce plan ? ») ; restent inconnus le vent, la pluie, le'
        + ' trafic et la vraie courbe de charge de votre véhicule.'
      : 'Estimation à plat, à consommation constante :'
        + ' ni le relief, ni le vent, ni le trafic, ni la vraie courbe de charge'
        + ' de votre véhicule ne sont pris en compte.')
      + ` Bornes de ${SEUIL_RAPIDE} kW et plus, depuis le fichier national IRVE.`;
    corps.append(reserve);
  }

  /* LES RÉSEAUX PRÉSENTS SUR CE TRAJET — pas ceux de France entière. Proposer
     une case « Ionity » sur un trajet qui n'en croise aucune est une promesse
     creuse ; la liste se calcule sur les bornes déjà trouvées, donc sans le
     moindre appel. */
  #voletReseaux(): HTMLElement {
    const volet = document.createElement('details');
    volet.className = 'recharge-reseaux';
    volet.open = this.#voletsOuverts.reseaux;
    volet.addEventListener('toggle', () => { this.#voletsOuverts.reseaux = volet.open; });
    const titre = document.createElement('summary');

    /* PAR EXPLOITANT, COMME LE FILTRE DE LA CARTE — et ce ne l'était pas.
       Armelin, le 26/08/2026, capture à l'appui : la liste affichait
       « Allego - Burger King Chelles Sud (1) », « Allego - Burger King Massy
       Opéra (1) », « Allego - Burger King Orléans Ingré (1) »… deux cent
       quatorze entrées d'une station chacune, sur un seul trajet. La cause est
       celle que la carte avait déjà connue : certains producteurs écrivent le
       NOM DU SITE dans l'enseigne. J'avais corrigé le panneau des couches et
       oublié celui-ci — deux listes, un seul défaut, un seul remède. */
    const reseaux = reseauxNationaux(this.#bornesTrajet.map((t) => t.poi));

    titre.textContent = this.#reseauxPreferes.size === 0
      ? `Réseaux préférés — tous (${reseaux.length} sur ce trajet)`
      : `Réseaux préférés — ${this.#reseauxPreferes.size} sur ${reseaux.length}`;
    volet.append(titre);

    const boite = document.createElement('div');
    boite.className = 'recharge-reseaux-corps';
    boite.setAttribute('role', 'group');
    boite.setAttribute('aria-label', 'Réseaux retenus pour ce trajet');

    /* ET UNE RECHERCHE, pour la même raison qu'ailleurs : un long trajet croise
       plusieurs dizaines d'exploitants, et faire défiler une liste pour trouver
       le sien est un travail qu'un champ de saisie épargne. */
    const cherche = document.createElement('input');
    cherche.type = 'search';
    cherche.className = 'recharge-reseau-recherche';
    cherche.placeholder = 'Chercher un réseau…';
    cherche.setAttribute('aria-label', 'Chercher un réseau sur ce trajet');
    cherche.value = this.#rechercheReseau;
    cherche.addEventListener('input', () => {
      this.#rechercheReseau = cherche.value;
      this.#majListeReseaux(boite, reseaux);
    });
    if (reseaux.length > 8) boite.append(cherche);

    this.#majListeReseaux(boite, reseaux);
    volet.append(boite);
    return volet;
  }

  /** (Re)construit les cases des réseaux, sans toucher au champ de recherche. */
  #majListeReseaux(boite: HTMLElement, reseaux: ReseauNational[]): void {
    for (const vieux of [...boite.querySelectorAll('label, .recharge-note')]) vieux.remove();

    const trouves = chercherReseaux(reseaux, this.#rechercheReseau);
    const coches = this.#reseauxPreferes;
    /* LES RÉSEAUX COCHÉS RESTENT VISIBLES quoi qu'il arrive : un filtre actif
       mais invisible serait impossible à retirer. */
    const montres = [
      ...trouves.slice(0, 15),
      ...trouves.slice(15).filter((r) => coches.has(r.nom)),
      ...reseaux.filter((r) => coches.has(r.nom) && !trouves.includes(r)),
    ];

    for (const r of montres) {
      const etiquette = document.createElement('label');
      const case_ = document.createElement('input');
      case_.type = 'checkbox';
      case_.checked = coches.has(r.nom);
      case_.addEventListener('change', () => {
        if (case_.checked) coches.add(r.nom); else coches.delete(r.nom);
        this.#refairePlan();
      });
      const texte = document.createElement('span');
      texte.textContent = ` ${r.nom} (${r.nombre})`;
      etiquette.append(case_, texte);
      boite.append(etiquette);
    }

    const note = document.createElement('p');
    note.className = 'recharge-note';
    note.textContent = montres.length < reseaux.length
      ? `${montres.length} réseaux sur ${reseaux.length} — cherchez par leur nom.`
      : 'Sans case cochée, tous les réseaux sont acceptés.';
    boite.append(note);
  }

  /**
   * Toutes les bornes du trajet, avec un « + » et un « − » par borne.
   *
   * POURQUOI UN VOLET REPLIÉ. Un Paris-Marseille en croise plusieurs
   * centaines : les déplier d'office noierait le plan, qui est la réponse
   * qu'on est venu chercher. On les range, on annonce leur nombre, et on
   * laisse la main à qui la veut.
   */
  #voletToutesBornes(plan: PlanRecharge): HTMLElement {
    const retenues = new Set(plan.arrets.map((a) => cleBorne(a.borne)));
    const volet = document.createElement('details');
    volet.className = 'recharge-toutes';
    volet.open = this.#voletsOuverts.toutes;
    volet.addEventListener('toggle', () => { this.#voletsOuverts.toutes = volet.open; });
    const titre = document.createElement('summary');
    titre.textContent = `Toutes les bornes du trajet (${this.#bornesTrajet.length})`;
    volet.append(titre);

    const liste = document.createElement('ol');
    liste.className = 'recharge-toutes-liste';
    for (const t of this.#bornesTrajet) {
      const cle = this.#cleDe(t);
      const item = document.createElement('li');
      const impose = this.#imposees.has(cle);
      const ecarte = this.#ecartees.has(cle);
      /* L'ÉTAT EST AUSSI UNE CLASSE ET UN TEXTE, jamais une couleur seule :
         « retenue », « imposée », « écartée » doivent se lire sans distinguer
         le vert de l'orange (WCAG 1.4.1). */
      item.className = impose ? 'est-imposee' : ecarte ? 'est-ecartee'
        : retenues.has(cle) ? 'est-retenue' : '';

      const nom = document.createElement('button');
      nom.type = 'button';
      nom.className = 'recharge-aller';
      nom.textContent = t.poi.nom;
      nom.setAttribute('aria-label', `Détail de ${t.poi.nom}`);
      nom.addEventListener('click', () => {
        this.#carte?.flyTo({ center: [t.poi.lon, t.poi.lat], zoom: 14 });
        this.#fiche?.ouvrir({
          id: t.poi.id, lon: t.poi.lon, lat: t.poi.lat, nom: t.poi.nom,
        });
      });

      const detail = document.createElement('span');
      detail.className = 'recharge-detail';
      detail.textContent = `${Math.round(t.avancement / 1000)} km`
        + ` · ${t.poi.puissance} kW`
        + ` · ${t.poi.reseau ?? 'réseau non déclaré'}`
        + (t.ecart > 500 ? ` · à ${(t.ecart / 1000).toFixed(1)} km du trajet` : '')
        + (t.poi.ouvert === false ? ' · ACCÈS RÉSERVÉ' : '')
        + (impose ? ' · arrêt imposé' : ecarte ? ' · écartée'
          : retenues.has(cle) ? ' · retenue par le plan' : '');

      const plus = document.createElement('button');
      plus.type = 'button';
      plus.className = 'recharge-plus';
      plus.textContent = '+';
      plus.title = 'S’arrêter ici';
      plus.setAttribute('aria-pressed', String(impose));
      plus.setAttribute('aria-label', `Imposer un arrêt à ${t.poi.nom}`);
      /* LE « + » DE LA LISTE PASSE PAR LE MÊME CHEMIN QUE LA FICHE (30/08) :
         ajouter est une commodité qui n'entraîne AUCUN recalcul, retirer en
         entraîne un. Deux entrées pour un seul geste — les faire diverger
         serait le meilleur moyen de corriger l'une et d'oublier l'autre. */
      plus.addEventListener('click', () => {
        if (impose || this.#courtoisie.has(cle)) {
          this.#imposees.delete(cle);
          this.#courtoisie.delete(cle);
          this.#refairePlan();
          return;
        }
        this.basculerArret(cle, 'imposer');
      });

      const moins = document.createElement('button');
      moins.type = 'button';
      moins.className = 'recharge-retirer';
      moins.textContent = '−';
      moins.title = 'Ne jamais s’arrêter ici';
      moins.setAttribute('aria-pressed', String(ecarte));
      moins.setAttribute('aria-label', `Écarter ${t.poi.nom}`);
      moins.addEventListener('click', () => {
        if (ecarte) this.#ecartees.delete(cle);
        else { this.#ecartees.add(cle); this.#imposees.delete(cle); }
        this.#refairePlan();
      });

      item.append(nom, detail, plus, moins);
      liste.append(item);
    }
    volet.append(liste);
    return volet;
  }


  async #chargerFeuille(): Promise<void> {
    const corps = this.querySelector('.iti-feuille-corps') as HTMLElement;
    // Le CLICHÉ du calcul réussi, jamais l'état vivant : entre-temps l'usager
    // a pu changer de profil ou d'adresse sans que le recalcul aboutisse — la
    // feuille doit décrire le trajet TRACÉ, pas celui des champs (revue 21/08).
    const cliche = this.#calculPour;
    const iti = this.#dernier;
    if (this.#vue !== 'feuille' || !iti || !cliche || this.#feuillePour === iti) return;
    this.#feuillePour = iti;
    corps.textContent = 'Préparation de la feuille de route…';
    try {
      const etapes = await etapesItineraire(cliche.depart, cliche.arrivee, cliche.profil,
        { etapes: cliche.etapes, eviter: cliche.eviter, optimisation: cliche.optimisation });
      if (this.#dernier !== iti) return;
      corps.textContent = '';
      // Titre et résumé FIGÉS avec les étapes : l'impression décrira ce
      // trajet-là, quel que soit l'état du panneau au moment du clic.
      const titre = `Itinéraire Infonovice Maps (${PROFILS[cliche.profil]})`;
      const resume = `${formaterDistance(iti.distance)} — ${formaterDuree(iti.duree)}`;
      const imprimer = document.createElement('button');
      imprimer.type = 'button';
      imprimer.className = 'feuille-imprimer';
      imprimer.textContent = 'Imprimer';
      imprimer.addEventListener('click', () => this.#imprimerFeuille(etapes, titre, resume));
      corps.append(imprimer, this.#listeEtapes(etapes));
    } catch (e) {
      if (this.#dernier !== iti) return;
      this.#feuillePour = null; // réessayable à la prochaine ouverture
      corps.textContent = e instanceof ErreurFeuille
        ? e.message : 'Feuille de route indisponible pour le moment.';
    }
  }

  /** La liste des étapes, construite en textContent : les noms de voies sont
      des données EXTERNES (BD TOPO via le service) — jamais d'innerHTML. */
  #listeEtapes(etapes: EtapeRoute[]): HTMLOListElement {
    const liste = document.createElement('ol');
    liste.className = 'feuille-etapes';
    for (const e of etapes) {
      const item = document.createElement('li');
      const texte = document.createElement('span');
      texte.className = 'etape-texte';
      texte.textContent = e.voie ? `${e.texte} — ${e.voie}` : e.texte;
      item.append(texte);
      if (e.distance >= 10) {
        const dist = document.createElement('span');
        dist.className = 'etape-dist';
        dist.textContent = formaterDistance(e.distance);
        item.append(dist);
      }
      liste.append(item);
    }
    return liste;
  }

  /** Imprime la feuille seule : un clone au niveau du body, que la feuille de
      styles d'impression est seule à laisser paraître — et SEULEMENT quand la
      classe `impression-feuille` est posée sur body : sans elle, un Ctrl+P
      ordinaire imprime la page normalement (la première version masquait tout,
      pages blanches — revue du 21/08). */
  #imprimerFeuille(etapes: EtapeRoute[], titre: string, resume: string): void {
    // Idempotent : si un afterprint ne s'est jamais présenté (WebView, environ-
    // nements sans impression), on repart d'un body propre au lieu d'empiler.
    document.querySelectorAll('.zone-impression').forEach((z) => z.remove());
    const zone = document.createElement('section');
    zone.className = 'zone-impression';
    const h = document.createElement('h1');
    h.textContent = titre;
    const p = document.createElement('p');
    p.textContent = resume;
    zone.append(h, p, this.#listeEtapes(etapes));
    document.body.append(zone);
    document.body.classList.add('impression-feuille');
    window.addEventListener('afterprint', () => {
      zone.remove();
      document.body.classList.remove('impression-feuille');
    }, { once: true });
    window.print();
  }


  async #calculer(): Promise<void> {
    this.#majBoutons();
    if (!this.#carte || !this.#depart || !this.#arrivee) return;
    // JETON DE SÉQUENCE : cases à cocher et boutons ↑/↓ relancent des calculs
    // en rafale, et une reprise (500 ms + nouvel essai) peut faire aboutir la
    // requête la plus VIEILLE en dernier — sans ce jeton, elle écraserait le
    // trajet demandé. Effacer incrémente aussi : une réponse tardive ne
    // ressuscite pas un panneau vidé (revue du 21/08).
    const jeton = (this.#sequence += 1);
    const resultat = this.querySelector('.iti-resultat') as HTMLElement;
    const erreur = this.querySelector('.iti-erreur') as HTMLElement;
    erreur.hidden = true;
    resultat.hidden = false;
    resultat.textContent = 'Calcul de l’itinéraire…';
    try {
      const depart = this.#depart; const arrivee = this.#arrivee; const profil = this.#profil;
      const inter = (this.querySelector('etapes-itineraire') as EtapesItineraire).points;
      const eviter = [...this.#eviter];
      const optimisation = this.#optimisation;
      const iti = await calculerItineraire(depart, arrivee, profil,
        { etapes: inter, eviter, optimisation });
      if (jeton !== this.#sequence) return;
      this.#dernier = iti;
      this.#calculPour = { depart, arrivee, profil, etapes: inter, eviter, optimisation };
      /* ON APPREND la destination (routines, 29/08) — nom et point, rien
         d'autre : ni départ, ni tracé. Un lien rejoué s'apprend AUSSI (c'est
         un trajet voulu) — sans nom, sous ses coordonnées, et le premier
         trajet nommé le renommera. La reprise hors-route, elle, n'apprendra
         rien le jour où elle existera ici : un raté n'est pas un choix. */
      if (this.#libelleDepart !== 'Reprise d’itinéraire') {
        void apprendreTrajet(
          this.#libelleArrivee || formaterCoordonnees(arrivee), arrivee, new Date(),
        );
      }
      // Le résumé AVANT la pose : distance et durée ne dépendent pas de la
      // carte, et la pose peut légitimement attendre (style en cours de
      // chargement) — l'utilisateur ne doit pas payer cette attente.
      /* LE PLAN D'AVANT NE VAUT PLUS POUR CE TRAJET — ni ses consignes. Garder
         « imposer Beaune » sur un Lille-Brest désignerait une borne qui n'est
         plus sur la route, et le planificateur refuserait un trajet
         parfaitement faisable sans que l'usager comprenne pourquoi. */
      if (this.#reprendreSuivi) {
        this.#reprendreSuivi = false;
        /* Le suivi repart SUR LE NOUVEAU TRACÉ — c'est tout le sens du
           recalcul automatique : pas un geste de plus au volant. */
        void this.#demarrerSuivi(true);
      }
      this.#planCourant = null;
      this.#bornesTrajet = [];
      this.#imposees.clear();
      this.#ecartees.clear();
      this.#reseauxPreferes.clear();
      /* Les environs relevés décrivaient les bornes de L'ANCIEN trajet. */
      this.#agrements = null;
      this.#agrementsPour = null;
      this.#reseauxHerites = false;
      /* LE PLAN PART TOUT SEUL, une seconde après le calme : les rafales de
         recalcul (cases cochées, étapes déplacées) ne déclenchent qu'UN
         calcul de plan — et donc UN relevé de conditions. */
      clearTimeout(this.#minuteurPlanAuto);
      this.#minuteurPlanAuto = setTimeout(() => { void this.#planifierRecharge(true); }, 1200);
      const etatPause = this.querySelector<HTMLElement>('.recharge-pause-etat');
      if (etatPause) etatPause.textContent = '';
      this.#rechercheReseau = '';
      this.#voletsOuverts = { reseaux: false, toutes: false };
      this.#majResume();
      (this.querySelector('.iti-actions') as HTMLElement).hidden = false;
      (this.querySelector('.iti-menu:not(.iti-menu-toujours)') as HTMLElement).hidden = false;
      this.#majBoutonDemarrer();
      // Nouveau trajet : profil et feuille de route réapparaissent repliés et
      // vidés — leurs contenus ne valent que pour l'itinéraire qui les a produits.
      this.#reinitialiserSections(false);
      this.#tracer(iti);
    } catch (e) {
      if (jeton !== this.#sequence) return;
      resultat.hidden = true;
      erreur.textContent = e instanceof ErreurItineraire
        ? e.message : 'Calcul impossible pour le moment.';
      erreur.hidden = false;
    }
  }

  #tracer(iti: Itineraire): void {
    const carte = this.#carte;
    if (!carte) return;
    const donnees = {
      type: 'Feature' as const, properties: {}, geometry: iti.geometrie,
    };
    try {
      const existante = carte.getSource(SOURCE) as GeoJSONSource | undefined;
      if (existante) {
        existante.setData(donnees);
      } else {
        carte.addSource(SOURCE, { type: 'geojson', data: donnees });
        // Le liseré clair sous le trait bleu : lisible sur le plan comme sur
        // l'ortho, sans dépendre du fond.
        carte.addLayer({
          id: 'itineraire-bord', type: 'line', source: SOURCE,
          paint: { 'line-color': '#FFFFFF', 'line-width': 9, 'line-opacity': 0.9 },
          layout: { 'line-cap': 'round', 'line-join': 'round' },
        });
        carte.addLayer({
          id: 'itineraire-trait', type: 'line', source: SOURCE,
          paint: { 'line-color': '#2272C4', 'line-width': 5 },
          layout: { 'line-cap': 'round', 'line-join': 'round' },
        });
      }
    } catch (e) {
      // MapLibre refuse toute pose tant que le STYLE n'a pas fini de charger
      // (rejeu d'un lien partagé plus rapide que le style, onglet ouvert en
      // arrière-plan au rendu suspendu). C'est le SEUL cas différé : la pose
      // se rejouera au prochain style.load — branché dans `set carte`, émis
      // au chargement initial comme à chaque changement de fond. On teste le
      // message faute d'erreur typée côté MapLibre. Un garde isStyleLoaded()
      // ne convient PAS : il attend aussi les tuiles et reste faux au moment
      // même où style.load autorise déjà la pose — en CI, le tracé ne se
      // posait plus jamais (run 32350033200 du 20/08).
      if (e instanceof Error && /style is not done loading/i.test(e.message)) return;
      throw e;
    }

    this.#marqueurs.forEach((m) => m.remove());
    this.#marqueurs = [];
    const points = iti.geometrie.coordinates;
    const premier = points[0]; const dernier = points[points.length - 1];
    if (premier && dernier) {
      this.#marqueurs.push(
        new Marker({ color: '#3FA877' }).setLngLat(premier as [number, number]).addTo(carte),
        new Marker({ color: '#E89C2C' }).setLngLat(dernier as [number, number]).addTo(carte),
        // Les étapes intermédiaires du CLICHÉ (les coordonnées demandées) :
        // marqueurs réduits, dans le bleu du tracé.
        ...(this.#calculPour?.etapes ?? []).map((p) => new Marker({ color: '#2272C4', scale: 0.72 })
          .setLngLat([p.lon, p.lat]).addTo(carte)),
      );
      const lons = points.map((c) => c[0] as number); const lats = points.map((c) => c[1] as number);
      carte.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]],
        { padding: 72, duration: 700 });
    }
  }

  #effacer(): void {
    this.#sequence += 1; // tue toute réponse d'itinéraire encore en vol
    this.#dernier = null; this.#calculPour = null; this.#depart = null; this.#arrivee = null;
    this.#libelleDepart = ''; this.#libelleArrivee = '';
    clearTimeout(this.#minuteurPlanAuto);
    this.#planEnCours = false;
    this.#departA = null;
    const heure = this.querySelector<HTMLInputElement>('.iti-heure');
    if (heure) heure.value = '';
    this.#marqueurs.forEach((m) => m.remove()); this.#marqueurs = [];
    this.#marqueursTrajet.forEach((m) => m.remove()); this.#marqueursTrajet = [];
    const carte = this.#carte;
    if (carte?.getSource(SOURCE)) {
      carte.removeLayer('itineraire-trait'); carte.removeLayer('itineraire-bord');
      carte.removeSource(SOURCE);
    }
    (this.querySelector('.iti-resultat') as HTMLElement).hidden = true;
    (this.querySelector('.iti-actions') as HTMLElement).hidden = true;
    (this.querySelector('.iti-menu:not(.iti-menu-toujours)') as HTMLElement).hidden = true;
    /* EFFACER LE TRAJET ARRÊTE LE SUIVI. Un bandeau qui continue de compter
       les kilomètres d'un itinéraire qui n'existe plus consomme le GPS pour
       rien — et ment. */
    this.#guidage?.arreter();
    this.#reinitialiserSections(true);
    (this.querySelector('etapes-itineraire') as EtapesItineraire).points = [];
    this.#eviter.clear();
    this.querySelectorAll('.iti-optimisations input').forEach((c) => {
      c.addEventListener('change', () => {
        this.#optimisation = (c as HTMLInputElement).value as Optimisation;
        void this.#calculer();
      });
    });
    this.querySelectorAll('.iti-eviter input').forEach((c) => { (c as HTMLInputElement).checked = false; });
    this.querySelectorAll('input[type="search"]').forEach((c) => { (c as HTMLInputElement).value = ''; });
    this.#majBoutons();
  }
}

customElements.define('panneau-itineraire', PanneauItineraire);
