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
import { calculerItineraire, formaterDistance, formaterDuree, PROFILS, EVITEMENTS, ErreurItineraire, type Profil, type Itineraire, type Eviter } from '../lib/itineraire';
import type { PointGeo } from '../lib/coordonnees';
import { lireRepere, REPERES, type CleRepere } from '../lib/reperes';
import { listerFavoris } from '../lib/favoris';
import { adresseInverse, type ResultatAdresse } from '../lib/adresse';
import { versGPX, versKML, telecharger } from '../lib/trace';
import { versFragment, depuisFragment } from '../lib/partage-url';
import { profilItineraire, versTraceSVG, denivele, ErreurAltimetrie } from '../lib/altimetrie';
import { etapesItineraire, ErreurFeuille, type EtapeRoute } from '../lib/feuille-de-route';
import {
  chercherLeLongDuTrajet, stationsDuTrajet,
  type Categorie, type SurLeTrajet,
} from '../lib/le-long-du-trajet';
import {
  planifierArrets, cleBorne, type PlanRecharge, type BorneCandidate,
} from '../lib/arrets';
import {
  indexNational, reseauxNationaux, chercherReseaux, cleReseau,
  ErreurIndex, SEUIL_RAPIDE, POIDS_ANNONCE,
  type StationRapide, type ReseauNational,
} from '../lib/index-bornes';
import { chargerCommodites, TYPES_COMMODITE, ErreurCommodites } from '../lib/commodites';
import { lirePreference } from '../lib/stockage';
import { PREF_VEHICULE } from './panneau-vehicule';
import { ErreurPoi, type PoiCarburant, type PoiBorne } from '../lib/poi';
import { poserIconesPuissance, nomIcone } from './icone-puissance';
import { palierDe } from '../lib/puissance';
import { chargerPeages, ErreurPeages } from '../lib/peages';
import { meteoA, phraseMeteo, symboleTemps, heureArrivee, formaterHeure, ECART_MAX_MINUTES, ErreurMeteo } from '../lib/meteo';
import type { FicheBorne } from './fiche-borne';
import type { BandeauGuidage } from './bandeau-guidage';

const SOURCE = 'itineraire';
/* LES BORNES DU MODE TRAJET — deux sources : le corridor (toutes les bornes à
   portée du tracé, cliquables) et les arrêts du plan (pastilles numérotées).
   Elles remplacent l'affichage national pendant qu'un plan est à l'écran :
   « que toutes les autres bornes de France disparaissent de la carte afin de
   n'afficher que les bornes suggérées, ainsi que toutes les autres bornes
   présentes sur le trajet » (Armelin, 27/08/2026). */
const SOURCE_CORRIDOR = 'iti-bornes-trajet';
const SOURCE_ARRETS = 'iti-arrets';
/** La couleur des arrêts retenus — celle des bornes, mais pleine et cerclée. */
const COULEUR_ARRET = '#1E9E5A';

/** Ce que le planificateur sait demander à la couche des bornes nationales. */
export interface PorteCouchesBornes {
  masquerBornesNationales(masquees: boolean): void;
}

/** Les pages du planificateur, et leur titre. */
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
  partage: 'Partager ou exporter',
} as const;

type CleVue = keyof typeof VUES;


export class PanneauItineraire extends HTMLElement {
  #carte: CarteMapLibre | null = null;
  #depart: PointGeo | null = null;
  #arrivee: PointGeo | null = null;
  #profil: Profil = 'car';
  #eviter = new Set<Eviter>();
  /** Jeton anti-réponses-hors-d'ordre de #calculer (voir le commentaire là-bas). */
  #sequence = 0;
  #dernier: Itineraire | null = null;
  /** Le cliché complet qui a produit #dernier — il vieillit AVEC lui : un
      recalcul raté laisse les deux cohérents entre eux. Feuille de route,
      lien partagé et marqueurs se lisent ICI, jamais dans l'état vivant. */
  #calculPour: {
    depart: PointGeo; arrivee: PointGeo; profil: Profil;
    etapes: PointGeo[]; eviter: Eviter[];
  } | null = null;
  /** Itinéraire dont le profil altimétrique est chargé (ou en cours). */
  #profilPour: Itineraire | null = null;
  /** Itinéraire dont la feuille de route est chargée (ou en cours). */
  #feuillePour: Itineraire | null = null;
  /** Itinéraire dont la recherche « sur le trajet » est faite (ou en cours). */
  #trajetPour: Itineraire | null = null;
  #rechargePour: Itineraire | null = null;
  #annulationRecharge: AbortController | null = null;
  /** Itinéraire dont la météo d'arrivée est chargée (ou en cours), et QUAND :
      un bulletin d'arrivée périme avec l'horloge, pas avec l'itinéraire. */
  #meteoPour: Itineraire | null = null;
  #meteoLe: Date | null = null;
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
  #socDepart = 100;

  set fiche(f: FicheBorne) { this.#fiche = f; }

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
        <summary aria-label="Ouvrir le planificateur d’itinéraire">Itinéraire</summary>
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
            <label class="iti-champ-principal">Départ
              <span class="iti-porte" data-role="depart"></span>
            </label>
            <div class="iti-raccourcis" data-pour="depart"
              role="group" aria-label="Choisir un départ enregistré"></div>

            <span class="iti-inter"></span>

            <label class="iti-champ-principal">Destination
              <span class="iti-porte" data-role="arrivee"></span>
            </label>
            <div class="iti-raccourcis" data-pour="arrivee"
              role="group" aria-label="Choisir une arrivée enregistrée"></div>

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
                <span>Mon véhicule</span><span aria-hidden="true">›</span></button>
              <button type="button" class="iti-vers" data-vers="couches">
                <span>Recharge et services</span><span aria-hidden="true">›</span></button>
              <button type="button" class="iti-vers" data-vers="options">
                <span>Options du trajet</span><span aria-hidden="true">›</span></button>
            </nav>

            <nav class="iti-menu" aria-label="Détails du trajet" hidden>
              <button type="button" class="iti-vers" data-vers="recharge">
                <span>Arrêts de recharge</span><span aria-hidden="true">›</span></button>
              <button type="button" class="iti-vers" data-vers="feuille">
                <span>Feuille de route</span><span aria-hidden="true">›</span></button>
              <button type="button" class="iti-vers" data-vers="trajet">
                <span>Sur le trajet</span><span aria-hidden="true">›</span></button>
              <button type="button" class="iti-vers" data-vers="meteo">
                <span>Météo à l’arrivée</span><span aria-hidden="true">›</span></button>
              <button type="button" class="iti-vers" data-vers="alti">
                <span>Profil altimétrique</span><span aria-hidden="true">›</span></button>
              <button type="button" class="iti-vers iti-vers-partage" data-vers="partage">
                <span>Partager ou exporter</span><span aria-hidden="true">›</span></button>
            </nav>

            <button type="button" class="iti-effacer">Effacer le trajet</button>
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
                  ${p === this.#profil ? 'checked' : ''}><span>${PROFILS[p]}</span></label>`).join('')}
            </div>
            <fieldset class="iti-eviter">
              <legend>Éviter</legend>
              ${(Object.keys(EVITEMENTS) as Eviter[]).map((v) => `
                <label class="iti-evite"><input type="checkbox" value="${v}"><span>${EVITEMENTS[v]}</span></label>`).join('')}
            </fieldset>
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
                <select class="recharge-plafond" aria-label="Plafond de charge aux bornes">
                  <option value="80">80 %</option>
                  <option value="90">90 %</option>
                  <option value="100" selected>au besoin</option>
                </select>
              </label>
            </div>
            <div class="iti-recharge-corps" role="status"></div>
          </section>

          <!-- ======================= FEUILLE DE ROUTE ======================= -->
          <section class="vue" data-vue="feuille" hidden>
            <div class="iti-feuille-corps" role="status"></div>
          </section>

          <!-- ======================= SUR LE TRAJET ======================= -->
          <section class="vue" data-vue="trajet" hidden>
            <div class="iti-trajet-reglages">
              <label>Chercher
                <select class="trajet-quoi">
                  <option value="carburants">Stations-service</option>
                  <option value="bornes">Bornes de recharge</option>
                </select>
              </label>
              <label>à moins de
                <select class="trajet-rayon">
                  <option value="1000">1 km</option>
                  <option value="3000" selected>3 km</option>
                  <option value="10000">10 km</option>
                </select>
                du trajet
              </label>
            </div>
            <div class="iti-trajet-corps" role="status"></div>
          </section>

          <!-- ======================= MÉTÉO ======================= -->
          <section class="vue" data-vue="meteo" hidden>
            <div class="iti-meteo-corps" role="status"></div>
          </section>

          <!-- ======================= ALTIMÉTRIE ======================= -->
          <section class="vue" data-vue="alti" hidden>
            <div class="iti-alti-corps" role="status"></div>
          </section>

          <!-- ======================= PARTAGE ======================= -->
          <!-- UN SEUL BOUTON EN FAÇADE, TROIS CHOIX DERRIÈRE. Armelin, le
               26/08 : « les boutons GPX et KML nuisent à l'ergonomie en
               affichant des boutons que peu de gens comprendront ». GPX et
               KML sont des mots de métier ; « partager » est un geste. -->
          <section class="vue" data-vue="partage" hidden>
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
        if (role === 'depart') this.#depart = r; else this.#arrivee = r;
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
    this.querySelector('.iti-gpx')?.addEventListener('click', () => {
      if (this.#dernier) telecharger(versGPX(this.#dernier, this.#nomTrajet()),
        'itineraire-infonovice.gpx', 'application/gpx+xml');
    });
    this.querySelector('.iti-kml')?.addEventListener('click', () => {
      if (this.#dernier) telecharger(versKML(this.#dernier, this.#nomTrajet()),
        'itineraire-infonovice.kml', 'application/vnd.google-earth.kml+xml');
    });
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
    this.querySelector('.vue-retour')?.addEventListener('click', () => {
      this.#allerA('accueil');
    });

    /* LES PÉAGES DU TRAJET — un appel Overpass, au clic seulement. Le bouton
       vit dans une page toujours accessible : sans trajet, il répond au lieu
       de se taire. */
    this.querySelector('.iti-peages-chercher')?.addEventListener('click', () => {
      void this.#releverPeages();
    });

    /* CHANGER LA MARGE REFAIT LE PLAN — mais seulement si la section est
       ouverte : un réglage invisible ne consomme rien. Le `#rechargePour` est
       remis à zéro, sans quoi le garde-fou anti-recalcul avalerait le
       changement, exactement comme le seuil de vue l'avait fait pour les
       filtres de bornes. */
    for (const cls of ['.recharge-cible', '.recharge-reserve', '.recharge-plafond']) {
      this.querySelector(cls)?.addEventListener('change', () => {
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
    // Changer de catégorie ou de rayon relance la recherche — mais seulement
    // si la section est ouverte : un réglage invisible ne consomme rien.
    for (const cls of ['.trajet-quoi', '.trajet-rayon']) {
      this.querySelector(cls)?.addEventListener('change', () => {
        this.#trajetPour = null;
        void this.#chercherSurLeTrajet();
      });
    }

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
      this.querySelector('details')?.setAttribute('open', '');
      // La carte n'est branchée qu'après la construction : on attend le tour
      // de boucle où `carte` est posée.
      queueMicrotask(() => { void this.#calculer(); });
    }
  }

  #nomTrajet(): string {
    return `Itinéraire Infonovice Maps (${PROFILS[this.#profil]})`;
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
    this.#trajetPour = null;
    this.#annulationTrajet?.abort();
    this.#rechargePour = null;
    this.#annulationRecharge?.abort();
    /* LE MODE TRAJET S'ÉTEINT AVEC SON TRAJET : les bornes du corridor
       appartiennent à l'itinéraire qui les a produites, et la couche
       nationale reprend sa place. */
    this.#retirerBornesTrajet();
    this.#meteoPour = null; this.#meteoLe = null;
    for (const cls of
      ['iti-alti', 'iti-feuille', 'iti-trajet', 'iti-meteo', 'iti-recharge',
        'iti-peages'] as const) {
      const corps = this.querySelector(`.${cls}-corps`);
      if (corps) corps.textContent = '';
    }
    // Le relevé des péages appartenait au trajet d'avant : le bouton revit.
    const boutonPeages = this.querySelector<HTMLButtonElement>('.iti-peages-chercher');
    if (boutonPeages) boutonPeages.disabled = false;
    this.#profilPour = null;
    this.#feuillePour = null;
    const menu = this.querySelector('.iti-menu:not(.iti-menu-toujours)') as HTMLElement | null;
    if (menu) menu.hidden = cachees;
    /* ON REVIENT À L'ACCUEIL. Rester sur une page dont le contenu vient d'être
       vidé montrerait un cadre blanc sans dire pourquoi. */
    if (cachees) this.#allerA('accueil');
  }

  /** La météo À L'HEURE D'ARRIVÉE estimée (départ maintenant + durée) : le
      temps qu'il fait là-bas en ce moment n'intéresse pas qui arrive dans
      cinq heures. À la demande, un seul appel par itinéraire. */
  async #chargerMeteo(): Promise<void> {
    const corps = this.querySelector('.iti-meteo-corps') as HTMLElement;
    const iti = this.#dernier;
    const cliche = this.#calculPour;
    if (this.#vue !== 'meteo' || !iti || !cliche) return;
    /* LE BULLETIN NE SE FIGE PAS : il décrit « maintenant + durée », donc il
       PÉRIME avec l'horloge. Se contenter de « déjà calculé pour cet
       itinéraire » affichait, deux heures plus tard, une arrivée déjà passée
       (revue du 22/08). On rejoue passé un quart d'heure. */
    const maintenant = new Date();
    if (this.#meteoPour === iti
      && this.#meteoLe && maintenant.getTime() - this.#meteoLe.getTime() < 15 * 60_000) return;
    this.#meteoPour = iti;
    this.#meteoLe = maintenant;
    corps.textContent = 'Prévision en cours…';
    try {
      const arrivee = heureArrivee(iti.duree, maintenant);
      const m = await meteoA(cliche.arrivee.lon, cliche.arrivee.lat, arrivee);
      if (this.#dernier !== iti) return;
      corps.replaceChildren();
      // AU-DELÀ DE L'HORIZON, ON SE TAIT. Le service ne prévoit que trois
      // jours ; un trajet à pied de plusieurs jours retombait sur la dernière
      // heure connue, présentée comme la prévision d'arrivée (revue du 22/08).
      if (m.ecartMinutes > ECART_MAX_MINUTES) {
        corps.textContent = 'Arrivée trop lointaine : aucune prévision fiable à cette échéance.';
        return;
      }
      const ligne = document.createElement('p');
      ligne.className = 'meteo-ligne';
      const symbole = document.createElement('span');
      symbole.className = 'meteo-symbole';
      symbole.setAttribute('aria-hidden', 'true');
      symbole.textContent = symboleTemps(m.code);
      const texte = document.createElement('span');
      texte.textContent = `Arrivée vers ${formaterHeure(arrivee, m.decalageLieu, maintenant)}`
        + ` (heure locale) — ${phraseMeteo(m)}`;
      ligne.append(symbole, texte);
      const source = document.createElement('p');
      source.className = 'meteo-source';
      // L'écart de souveraineté se dit À L'ENDROIT où il se produit, pas
      // seulement dans une page « À propos » que personne n'ouvre.
      source.textContent = 'Prévision Open-Meteo (service européen) — voir « À propos ».';
      corps.append(ligne, source);
    } catch (e) {
      if (this.#dernier !== iti) return;
      this.#meteoPour = null; this.#meteoLe = null; // réessayable tout de suite
      corps.textContent = e instanceof ErreurMeteo
        ? e.message : 'Météo indisponible pour le moment.';
    }
  }

  /** « Sur le trajet » — à la demande, au plus six appels par couche, et le
      résultat vaut pour l'itinéraire TRACÉ (le cliché), pas pour les champs. */
  async #chercherSurLeTrajet(): Promise<void> {
    const corps = this.querySelector('.iti-trajet-corps') as HTMLElement;
    const iti = this.#dernier;
    if (this.#vue !== 'trajet' || !iti || this.#trajetPour === iti) return;
    this.#trajetPour = iti;
    const quoi = (this.querySelector('.trajet-quoi') as HTMLSelectElement).value as Categorie;
    const rayon = Number((this.querySelector('.trajet-rayon') as HTMLSelectElement).value);
    corps.textContent = 'Recherche le long du trajet…';
    this.#annulationTrajet?.abort();
    const annulation = new AbortController();
    this.#annulationTrajet = annulation;
    try {
      const trouves = await chercherLeLongDuTrajet(iti.geometrie, quoi, rayon, annulation.signal);
      if (this.#dernier !== iti || annulation.signal.aborted) return;
      this.#afficherSurLeTrajet(trouves, quoi);
    } catch (e) {
      if (annulation.signal.aborted) return;
      this.#trajetPour = null; // réessayable
      corps.textContent = e instanceof ErreurPoi
        ? e.message : 'Recherche le long du trajet indisponible pour le moment.';
    }
  }

  /* LES ARRÊTS DE RECHARGE — À LA DEMANDE, comme tout le reste de ce panneau.
     Le calcul est LOCAL (lib/arrets.ts) ; le seul appel réseau cherche les
     bornes le long du tracé, et il est plafonné à six tronçons depuis la
     PR #11. Le profil du véhicule vient d'IndexedDB : il n'a jamais quitté le
     navigateur et ne le quitte pas ici non plus. */
  async #planifierRecharge(): Promise<void> {
    const corps = this.querySelector('.iti-recharge-corps') as HTMLElement;
    const iti = this.#dernier;
    if (this.#vue !== 'recharge' || !iti || this.#rechargePour === iti) return;
    this.#rechargePour = iti;

    const memo = await lirePreference<unknown>(PREF_VEHICULE);
    const m = (memo ?? {}) as Record<string, unknown>;
    const brut = (m['vehicule'] ?? {}) as Record<string, unknown>;
    const nombre = (x: unknown): number =>
      (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? x : 0);
    const capacite = nombre(brut['capaciteNominale']) * (nombre(brut['soce']) || 100) / 100;
    const conso = ((brut['consommations'] ?? {}) as Record<string, unknown>)['autoroute'];

    if (!(capacite > 0) || !(nombre(conso) > 0)) {
      corps.textContent = 'Renseignez d’abord votre véhicule (panneau « Véhicule ») :'
        + ' batterie, santé et autonomie constatée.';
      this.#rechargePour = null;   // réessayable une fois le profil rempli
      return;
    }

    corps.textContent = `Chargement du réseau national de recharge (${POIDS_ANNONCE},`
      + ' une seule fois, gardé hors ligne)…';
    this.#annulationRecharge?.abort();
    const annulation = new AbortController();
    this.#annulationRecharge = annulation;

    this.#vehiculeCourant = {
      capaciteKwh: capacite,
      consommationKwh100: nombre(conso),
      // 150 kW par défaut : une valeur courante, et l'interface le dit.
      puissanceMaxKw: nombre(brut['puissanceMaxKw']) || 150,
    };
    this.#socDepart = nombre(brut['soc']) || 100;

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
      const { stations } = await indexNational(annulation.signal);
      if (this.#dernier !== iti || annulation.signal.aborted) return;
      this.#bornesTrajet = stationsDuTrajet(
        stations, iti.geometrie.coordinates as [number, number][], 10_000,
      );
      this.#refairePlan();
    } catch (e) {
      if (annulation.signal.aborted) return;
      this.#rechargePour = null;
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
      imposees: [...this.#imposees],
      ecartees: [...this.#ecartees],
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
        properties: { id: a.borne.id ?? null, nom: a.borne.nom, rang: String(i + 1) },
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
            'circle-radius': 15,
            'circle-color': COULEUR_ARRET,
            'circle-stroke-width': 3,
            'circle-stroke-color': '#FFFFFF',
          },
        });
        carte.addLayer({
          id: 'iti-arrets-rang', type: 'symbol', source: SOURCE_ARRETS,
          layout: {
            'text-field': ['get', 'rang'],
            'text-size': 15,
            'text-allow-overlap': true,
            'text-ignore-placement': true,
          },
          paint: { 'text-color': '#FFFFFF' },
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
      for (const id of ['iti-arrets-rang', 'iti-arrets-pastille', 'iti-corridor']) {
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

  /** Impose ou écarte une borne du plan, et le refait — tout est local. */
  basculerArret(cle: string, action: 'imposer' | 'ecarter'): void {
    if (action === 'imposer') {
      this.#imposees.add(cle);
      this.#ecartees.delete(cle);
    } else {
      this.#ecartees.add(cle);
      this.#imposees.delete(cle);
    }
    this.#refairePlan();
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
      corps.textContent =
        `${gares.length} gare${gares.length > 1 ? 's' : ''} de péage sur ce tracé : `
        + `${liste}. Source OpenStreetMap — le tarif n’y figure pas, et une gare`
        + ' absente de la carte n’est pas relevée.';
    } catch (e) {
      // Overpass tombe souvent : le bouton reste réessayable.
      bouton.disabled = false;
      corps.textContent = e instanceof ErreurPeages
        ? e.message : 'Les péages ne sont pas disponibles pour le moment.';
    }
  }

  /* UNE PHRASE, PAS UNE LISTE : sur une aire, trois lignes de plus dans un
     volet déjà dense n'aident personne. On groupe par type et on nomme les
     enseignes connues — un quart des commodités n'en portent aucune, et pour
     celles-là le TYPE est déjà l'information utile. */
  #phraseCommodites(trouvees: import('../lib/commodites').Commodite[]): string {
    if (trouvees.length === 0) {
      return 'Rien de cartographié autour de cet arrêt — ce qui ne veut pas'
        + ' dire qu’il n’y a rien.';
    }
    const bouts: string[] = [];
    for (const { cle, libelle } of TYPES_COMMODITE) {
      const duType = trouvees.filter((c) => c.type === cle);
      if (duType.length === 0) continue;
      const noms = [...new Set(duType.map((c) => c.nom).filter((n): n is string => !!n))];
      bouts.push(noms.length > 0 ? `${libelle} (${noms.join(', ')})` : libelle);
    }
    return `${bouts.join(' · ')}. Source OpenStreetMap.`;
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

    const base = `${formaterDistance(iti.distance)} — ${formaterDuree(iti.duree)}`;
    const plan = this.#planCourant;
    if (!plan || !plan.faisable) {
      resultat.textContent = this.#profil === 'car'
        ? `${base} de route, hors recharge`
        : base;
      return;
    }
    if (plan.arrets.length === 0) {
      resultat.textContent = `${base} — aucun arrêt de recharge nécessaire`;
      return;
    }
    const charge = Math.round(plan.dureeRechargeMin);
    const total = iti.duree + charge * 60;
    resultat.textContent = `${formaterDistance(iti.distance)} —`
      + ` ${formaterDuree(total)} au total`
      + ` (${formaterDuree(iti.duree)} de route + ${formaterDuree(charge * 60)} de charge)`;
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
    /* LE CORPS REMONTE EN HAUT à chaque changement de page. Sans cela, on
       arrivait sur la météo au milieu de son texte, parce que la feuille de
       route d'avant avait fait défiler le conteneur. */
    (this.querySelector('.iti-corps') as HTMLElement).scrollTop = 0;

    // Chaque page charge ce qu'elle montre — jamais avant qu'on la demande.
    if (vue === 'recharge') void this.#planifierRecharge();
    if (vue === 'feuille') void this.#chargerFeuille();
    if (vue === 'trajet') void this.#chercherSurLeTrajet();
    if (vue === 'meteo') void this.#chargerMeteo();
    if (vue === 'alti') void this.#chargerProfil();
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
  async #demarrerSuivi(): Promise<void> {
    const bandeau = this.#guidage;
    const iti = this.#dernier;
    if (!bandeau || !iti) return;
    if (bandeau.actif) { bandeau.arreter(); this.#majBoutonDemarrer(); return; }

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
          { etapes: cliche.etapes, eviter: cliche.eviter },
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
        }))
        : [],
    });
    this.#majBoutonDemarrer();
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
    if (role === 'depart') this.#depart = point; else this.#arrivee = point;
    const champ = this.querySelector<RechercheAdresse>(
      `[data-role="${role}"] recherche-adresse`,
    );
    if (champ) champ.libelle = libelle;
    void this.#calculer();
  }

  /* LES RACCOURCIS SE CONSTRUISENT À L'OUVERTURE ET À CHAQUE CHANGEMENT :
     domicile et travail se définissent depuis un autre panneau, les favoris
     s'ajoutent depuis la carte. Une liste figée au démarrage aurait ignoré
     tout ce que l'usager fait ensuite. */
  async #majRaccourcis(): Promise<void> {
    const entrees: { libelle: string; point: PointGeo; titre: string }[] = [];
    for (const { cle, libelle } of REPERES) {
      const r = await lireRepere(cle as CleRepere);
      if (r) entrees.push({ libelle, point: r, titre: r.libelle });
    }
    for (const f of (await listerFavoris()).slice(0, 6)) {
      entrees.push({ libelle: f.nom, point: f, titre: f.nom });
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
      boite.hidden = boite.childElementCount === 0;
    }
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

  #afficherRecharge(plan: PlanRecharge): void {
    const corps = this.querySelector('.iti-recharge-corps') as HTMLElement;
    corps.replaceChildren();
    // Le résumé du haut apprend le temps de charge : voir `#majResume`.
    this.#planCourant = plan;
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
    corps.append(resume);

    if (plan.arrets.length > 0) {
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
          + (a.borne.puissanceKw ? ` · ${a.borne.puissanceKw} kW` : '');
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
            (trouvees) => { sortie.textContent = this.#phraseCommodites(trouvees); },
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
    reserve.className = 'recharge-reserve';
    reserve.textContent = 'Estimation à plat, à consommation constante :'
      + ' ni le relief, ni le vent, ni le trafic, ni la vraie courbe de charge'
      + ' de votre véhicule ne sont pris en compte.'
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
      plus.addEventListener('click', () => {
        if (impose) this.#imposees.delete(cle);
        else { this.#imposees.add(cle); this.#ecartees.delete(cle); }
        this.#refairePlan();
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

  /** Construit la liste EN textContent : les libellés viennent des services. */
  #afficherSurLeTrajet(trouves: SurLeTrajet<PoiCarburant | PoiBorne>[], quoi: Categorie): void {
    const corps = this.querySelector('.iti-trajet-corps') as HTMLElement;
    corps.replaceChildren();
    this.#marqueursTrajet.forEach((m) => m.remove());
    this.#marqueursTrajet = [];
    if (trouves.length === 0) {
      corps.textContent = 'Rien trouvé dans ce rayon le long du trajet.';
      return;
    }
    const resume = document.createElement('p');
    resume.className = 'trajet-resume';
    resume.textContent = `${trouves.length} ${quoi === 'carburants' ? 'station' : 'borne'}${trouves.length > 1 ? 's' : ''} sur le trajet`;
    const liste = document.createElement('ol');
    liste.className = 'trajet-liste';
    for (const t of trouves.slice(0, 30)) {
      const item = document.createElement('li');
      const aller = document.createElement('button');
      aller.type = 'button';
      aller.className = 'trajet-aller';
      const p = t.poi as Partial<PoiCarburant> & Partial<PoiBorne>;
      const titre = quoi === 'carburants'
        ? [p.adresse, p.ville].filter(Boolean).join(', ') || 'Station-service'
        : p.nom ?? 'Borne de recharge';
      aller.textContent = titre;
      aller.setAttribute('aria-label', `Voir ${titre} sur la carte`);
      aller.addEventListener('click', () => {
        this.#carte?.flyTo({ center: [t.poi.lon, t.poi.lat], zoom: 15 });
      });
      const detail = document.createElement('span');
      detail.className = 'trajet-detail';
      const bouts = [
        `km ${Math.round(t.avancement / 1000)}`,
        t.ecart < 100 ? 'sur la route' : `${formaterDistance(t.ecart)} du trajet`,
      ];
      if (quoi === 'carburants' && p.prix?.length) {
        const [libelle, valeur] = p.prix[0]!;
        bouts.push(`${libelle} ${valeur.toFixed(2).replace('.', ',')} €`);
      }
      if (quoi === 'bornes' && p.puissance) bouts.push(`${p.puissance} kW`);
      detail.textContent = bouts.join(' · ');
      item.append(aller, detail);
      liste.append(item);
      // Un marqueur discret par point trouvé, dans la couleur de sa catégorie.
      if (this.#carte) {
        this.#marqueursTrajet.push(
          new Marker({ color: quoi === 'carburants' ? '#E89C2C' : '#3FA877', scale: 0.6 })
            .setLngLat([t.poi.lon, t.poi.lat]).addTo(this.#carte),
        );
      }
    }
    corps.append(resume, liste);
    if (trouves.length > 30) {
      const note = document.createElement('p');
      note.className = 'trajet-note';
      note.textContent = `Les 30 premières sont listées, sur ${trouves.length} trouvées.`;
      corps.append(note);
    }
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
        { etapes: cliche.etapes, eviter: cliche.eviter });
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

  async #chargerProfil(): Promise<void> {
    const corps = this.querySelector('.iti-alti-corps') as HTMLElement;
    const iti = this.#dernier;
    if (this.#vue !== 'alti' || !iti || this.#profilPour === iti) return;
    this.#profilPour = iti;
    corps.textContent = 'Calcul du profil…';
    try {
      const points = await profilItineraire(iti.geometrie);
      // Un nouvel itinéraire a pu arriver pendant l'appel : ce profil ne le
      // concerne pas, on ne touche à rien.
      if (this.#dernier !== iti) return;
      const t = versTraceSVG(points, 280, 72);
      const d = denivele(points);
      // Uniquement des nombres formatés par nos soins : ce innerHTML ne porte
      // aucune donnée externe (la règle textContent vaut pour les libellés).
      corps.innerHTML = `
        <svg viewBox="0 0 280 72" preserveAspectRatio="none" role="img"
          aria-label="Profil altimétrique, de ${Math.round(t.zMin)} à ${Math.round(t.zMax)} mètres d’altitude">
          <polygon class="alti-aire" points="${t.aire}"></polygon>
          <polyline class="alti-ligne" points="${t.ligne}"></polyline>
        </svg>
        <p class="alti-bilan">D+ ${Math.round(d.montee)} m · D− ${Math.round(d.descente)} m ·
          de ${Math.round(t.zMin)} à ${Math.round(t.zMax)} m</p>`;
    } catch (e) {
      if (this.#dernier !== iti) return;
      this.#profilPour = null; // réessayable à la prochaine ouverture
      corps.textContent = e instanceof ErreurAltimetrie
        ? e.message : 'Profil indisponible pour le moment.';
    }
  }

  async #calculer(): Promise<void> {
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
      const iti = await calculerItineraire(depart, arrivee, profil, { etapes: inter, eviter });
      if (jeton !== this.#sequence) return;
      this.#dernier = iti;
      this.#calculPour = { depart, arrivee, profil, etapes: inter, eviter };
      // Le résumé AVANT la pose : distance et durée ne dépendent pas de la
      // carte, et la pose peut légitimement attendre (style en cours de
      // chargement) — l'utilisateur ne doit pas payer cette attente.
      /* LE PLAN D'AVANT NE VAUT PLUS POUR CE TRAJET — ni ses consignes. Garder
         « imposer Beaune » sur un Lille-Brest désignerait une borne qui n'est
         plus sur la route, et le planificateur refuserait un trajet
         parfaitement faisable sans que l'usager comprenne pourquoi. */
      this.#planCourant = null;
      this.#bornesTrajet = [];
      this.#imposees.clear();
      this.#ecartees.clear();
      this.#reseauxPreferes.clear();
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
    this.querySelectorAll('.iti-eviter input').forEach((c) => { (c as HTMLInputElement).checked = false; });
    this.querySelectorAll('input[type="search"]').forEach((c) => { (c as HTMLInputElement).value = ''; });
  }
}

customElements.define('panneau-itineraire', PanneauItineraire);
