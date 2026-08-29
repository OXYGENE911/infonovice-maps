// <panneau-poi> — les couches de points d'intérêt : carburants (avec prix),
// bornes de recharge, parkings. Trois cases ; chaque couche active se charge
// pour la VUE COURANTE et se recharge au déplacement — débounce 500 ms,
// appel précédent annulé, et SEUIL de changement de vue : le suivi GPS ou la
// molette ne rechargent pas une vue quasi identique. Jamais sous le zoom 12 :
// la France entière serait demandée pour rien, et les quotas publics sont un
// bien commun. Le choix des couches est persisté en IndexedDB, comme le fond.
//
// Les popups sont construites en textContent EXCLUSIVEMENT : adresses, noms
// de stations et communes viennent de services externes (règle du projet).
// Leurs données voyagent DANS les propriétés des features — jamais par indice
// vers un tableau vivant, qu'un rechargement rendrait périmé (revue du 22/08).
import type { Map as CarteMapLibre, GeoJSONSource, MapGeoJSONFeature } from 'maplibre-gl';
import { Popup } from 'maplibre-gl';
import { lirePreference, ecrirePreference } from '../lib/stockage';
import { palierDe, libellePalier, PALIERS } from '../lib/puissance';
import { poserIconesPuissance, nomIcone, eclairsSVG } from './icone-puissance';
import {
  chargerCarburants, chargerBornes, chargerParkings, vueAChange,
  PRISES, type ClePrise, type FiltresBornes,
  type Bbox,
} from '../lib/poi';
import {
  indexNational, stationsDans, filtrerStations, reseauxNationaux,
  chercherReseaux, ErreurIndex, ETENDUES, etendue,
  type StationRapide, type ReseauNational, type CleEtendue,
} from '../lib/index-bornes';
import type { FicheBorne } from './fiche-borne';
import {
  CATEGORIES, chercherCategorie, ErreurCategories,
  type Categorie, type LieuCategorie,
} from '../lib/categories';

export const PREF_POI = 'poi';
/** Les filtres de bornes vivent à part : ils survivent au décochage de la couche. */
export const PREF_FILTRES = 'poi-filtres-bornes';
/** L'étendue du réseau national chargé — un choix, donc une préférence. */
export const PREF_ETENDUE = 'poi-etendue-bornes';
/* SOUS CE ZOOM, LES SERVICES PAR EMPRISE NE SONT PLUS INTERROGEABLES : les
   portails Opendatasoft plafonnent à 100 enregistrements, et demander la
   France entière rendrait cent points au hasard — un affichage qui ment sans
   le dire. Carburants et parkings s'y arrêtent donc.

   LES BORNES, ELLES, NE S'Y ARRÊTENT PLUS. Armelin, le 25/08 : « les points de
   charge ne s'affichent qu'entre 0 et 1 km de zoom ». En dessous du seuil,
   elles viennent désormais de l'INDEX NATIONAL (lib/index-bornes.ts) : les
   14 133 stations de 50 kW et plus, chargées une fois et gardées hors ligne,
   groupées en amas. C'est l'unique couche à franchir cette frontière, parce
   qu'elle est l'unique à disposer d'un index. */
const ZOOM_MIN = 12;

/** Au-delà, MapLibre défait les amas : une punaise par station. */
const ZOOM_AMAS_MAX = ZOOM_MIN - 1;

type Couche = 'carburants' | 'bornes' | 'parkings';
const COUCHES: Record<Couche, string> = {
  carburants: 'Carburants', bornes: 'Bornes électriques', parkings: 'Parkings',
};
const COULEURS: Record<Couche, string> = {
  carburants: '#E89C2C', bornes: '#3FA877', parkings: '#2272C4',
};

export class PanneauPoi extends HTMLElement {
  #carte: CarteMapLibre | null = null;
  #actives = new Set<Couche>();
  #filtres: FiltresBornes = {};
  /* LA RESTAURATION NE DOIT JAMAIS ÉCRASER UN CHOIX DÉJÀ FAIT. La lecture
     IndexedDB est asynchrone : un usager rapide — ou un test — peut régler un
     filtre AVANT qu'elle se résolve, et sans ce drapeau son réglage était
     silencieusement remplacé par la valeur mémorisée. Attrapé par un parcours
     E2E qui lisait l'URL émise, jamais par l'œil. */
  #filtresTouches = false;
  #controleurs: Partial<Record<Couche, AbortController>> = {};
  /** La bbox pour laquelle chaque couche a été chargée — le seuil de vue. */
  #chargee: Partial<Record<Couche, Bbox>> = {};
  #erreurs: Partial<Record<Couche, true>> = {};
  #carburants: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
  #bornes: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
  #parkings: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
  #montres: Partial<Record<Couche, number>> = {};
  #totaux: Partial<Record<Couche, number>> = {};
  #minuteur: ReturnType<typeof setTimeout> | undefined;
  #popup: Popup | null = null;

  /* LA RECHERCHE PAR CATÉGORIES (mandat UX 28/08, POI-1) — à la demande,
     dans la vue, UNE catégorie à la fois. Rien ne se recharge au
     déplacement : la frugalité est le contrat. */
  #categorieActive: Categorie | null = null;

  #annulationCategorie: AbortController | null = null;

  /** Les lieux posés, gardés pour reposer la couche après un setStyle. */
  #lieuxPoses: LieuCategorie[] = [];
  #popupDe: Couche | null = null;
  /** L'index national, une fois chargé. Vide tant qu'il ne l'est pas. */
  #index: StationRapide[] = [];
  /* LES ÉCRITURES RÉELLES DE CHAQUE ENSEIGNE, par libellé affiché. Le fichier
     IRVE écrit un même réseau de plusieurs façons — « LIDL » et « Lidl
     France », 446 et 434 stations. La liste les fond sous un libellé unique ;
     cette table garde de quoi les redéployer quand la requête part au portail,
     qui compare, lui, des chaînes exactes. */
  #variantes = new Map<string, string[]>();
  /** Les réseaux calculés, gardés pour que la recherche filtre sans recalculer. */
  #reseaux: ReseauNational[] = [];
  /** L'étendue demandée : « rapide » par défaut, « toutes » sur demande. */
  #etendue: CleEtendue = 'rapide';
  /* LE CARTOUCHE DE DÉTAIL, partagé avec le planificateur (voir carte.ts).
     Tant qu'il n'est pas posé, le clic sur une borne retombe sur la bulle
     d'autrefois : le panneau doit rester utilisable seul, notamment en test. */
  #fiche: FicheBorne | null = null;

  set fiche(f: FicheBorne) { this.#fiche = f; }

  /* LE MODE TRAJET DU PLANIFICATEUR EFFACE LES BORNES NATIONALES : quand un
     plan de recharge est à l'écran, seules comptent les bornes du corridor —
     « cela permettra d'assainir visuellement la carte » (Armelin, 27/08/2026).
     Le drapeau fait DEUX choses : il cache les couches posées, et il coupe les
     chargements de la couche bornes — afficher pour rien serait du gâchis,
     interroger pour rien en serait un plus grave. */
  #bornesMasquees = false;

  masquerBornesNationales(masquees: boolean): void {
    if (this.#bornesMasquees === masquees) return;
    this.#bornesMasquees = masquees;
    this.#appliquerMasquage();
    this.#etat();
    // Au retour, la couche se remet au niveau de la vue courante.
    if (!masquees && this.#actives.has('bornes')) void this.#charger('bornes', true);
  }

  /** Applique la visibilité du moment aux couches de bornes posées. */
  #appliquerMasquage(): void {
    const carte = this.#carte;
    if (!carte) return;
    const visibilite = this.#bornesMasquees ? 'none' : 'visible';
    for (const id of ['poi-bornes', 'poi-bornes-amas', 'poi-bornes-amas-nombre']) {
      if (carte.getLayer(id)) carte.setLayoutProperty(id, 'visibility', visibilite);
    }
  }

  /* Posé UNE fois à l'assemblage, pour la vie de l'application : le panneau
     n'est jamais détruit, on ne s'encombre pas d'un désabonnement (décision
     tracée — revue du 22/08). */
  set carte(c: CarteMapLibre) {
    if (this.#carte) return;
    this.#carte = c;
    c.on('moveend', () => {
      /* LE SEUIL SE DIT AVANT LE CLIC, PAS APRÈS (30/08). Armelin : « les
         boutons Pharmacie, restaurants… ne fonctionnent pas », et « quand
         je tape McDonald, il ne se passe rien ». Ils fonctionnaient — mais
         sous le zoom 12 ils n'ont rien à chercher, et rien ne le disait
         TANT QU'ON N'AVAIT PAS CLIQUÉ. Un bouton qui a l'air actif et ne
         fait rien est un mensonge d'interface ; désactivé avec sa raison,
         il informe. Le zoom d'un trajet planifié tourne autour de 6. */
      this.#majSeuilVue();
      if (this.#actives.size === 0) return;
      clearTimeout(this.#minuteur);
      this.#minuteur = setTimeout(() => { this.#rechargerActives(); }, 500);
    });
    this.#majSeuilVue();
    // setStyle détruit les sources : on repose données ET couches (le même
    // contrat que le tracé d'itinéraire).
    c.on('style.load', () => { this.#poserTout(); });
    /* Un clic peut toucher PLUSIEURS couches superposées (un cercle posé sur
       un polygone de parking) : le premier gestionnaire REVENDIQUE l'événement,
       les suivants s'effacent — et les points, enregistrés d'abord, gagnent
       sur les surfaces. */
    for (const couche of ['carburants', 'bornes'] as const) {
      c.on('click', `poi-${couche}`, (e) => {
        // Marque posée sur l'ÉVÉNEMENT NATIF (et non dans un champ privé) :
        // les autres couches — trafic compris — la voient aussi, alors qu'un
        // champ d'instance ne protégeait que de soi-même (revue du 22/08).
        const natif = e.originalEvent as Event & { __clicPris?: boolean };
        if (natif.__clicPris) return;
        natif.__clicPris = true;
        this.#ouvrirPopup(couche, e.features ?? []);
      });
      c.on('mouseenter', `poi-${couche}`, () => { c.getCanvas().style.cursor = 'pointer'; });
      c.on('mouseleave', `poi-${couche}`, () => { c.getCanvas().style.cursor = ''; });
    }
    /* UN AMAS SE DÉPLIE AU CLIC. Sans cela, un nombre au milieu de la carte
       serait un cul-de-sac : on voit qu'il y a 240 stations et on n'a aucun
       moyen d'y accéder. Deux niveaux de zoom suffisent à défaire un amas
       sans dérouter — un saut direct au zoom 12 perdrait le contexte. */
    c.on('click', 'poi-bornes-amas', (e) => {
      const natif = e.originalEvent as Event & { __clicPris?: boolean };
      if (natif.__clicPris) return;
      natif.__clicPris = true;
      c.easeTo({ center: e.lngLat, zoom: Math.min(c.getZoom() + 2, ZOOM_MIN + 1) });
    });
    c.on('mouseenter', 'poi-bornes-amas', () => { c.getCanvas().style.cursor = 'pointer'; });
    c.on('mouseleave', 'poi-bornes-amas', () => { c.getCanvas().style.cursor = ''; });

    c.on('click', 'poi-parkings-fond', (e) => {
      const natif = e.originalEvent as Event & { __clicPris?: boolean };
      if (natif.__clicPris) return;
      natif.__clicPris = true;
      this.#popupParking(e.lngLat, e.features ?? []);
    });
  }

  connectedCallback(): void {
    if (this.firstElementChild) return;
    this.innerHTML = `
      <!-- La classe « surface-de-travail » : ce volet se consulte EN
           MANIPULANT la carte —
           on coche une couche, on inspecte un point, on en coche une autre. Un
           clic sur la carte ne le referme donc pas ; son propre résumé, la
           touche Échap ou l'ouverture d'un autre volet du rail, si. -->
      <details class="poi surface-de-travail" open>
        <!-- L'INTITULÉ DIT CE QU'ON Y CHERCHE. « Autour » était une position,
             pas une intention : on n'ouvre pas ce volet pour regarder autour,
             on l'ouvre pour trouver où recharger ou faire le plein. Et
             l'étiquette accessible CONTIENT le texte visible, MOT POUR MOT.
             Une première version écrivait « Recharge & services » à l'écran et
             « Recharge et services… » dans l'étiquette : Lighthouse l'a relevé
             aussitôt (label-content-name-mismatch, critère WCAG 2.5.3). Une
             esperluette n'est pas le mot « et » pour un moteur de commande
             vocale, et l'écart suffit à faire échouer « cliquer sur Recharge
             et services ». -->
        <summary aria-label="Recharge et services : bornes, carburants, parkings">Recharge et services</summary>
        <fieldset>
          <legend>Points d’intérêt</legend>
          ${(Object.keys(COUCHES) as Couche[]).map((c) => `
            <label><input type="checkbox" value="${c}"> ${COUCHES[c]}</label>`).join('')}
        </fieldset>

        <!-- LA RECHERCHE PAR CATÉGORIES — « dans la vue, à la demande »
             (mandat UX 28/08, POI-1). PAS une couche : une couche suit la
             carte et rappelle le service à chaque glissement ; ici UN clic
             fait UN appel, et la liste ne bouge plus — Overpass est un
             commun bénévole. -->
        <fieldset class="poi-categories">
          <legend>Dans la vue, à la demande</legend>
          <div class="poi-categories-boutons" role="group"
            aria-label="Chercher une catégorie de lieux dans la vue">
            ${CATEGORIES.map((c) => `
              <button type="button" class="poi-categorie" data-cle="${c.cle}"
                aria-pressed="false">${c.libelle}</button>`).join('')}
          </div>
          <p class="poi-seuil-vue poi-filtre-note" role="status" hidden></p>
          <p class="poi-categorie-etat" role="status"></p>
        </fieldset>

        <!-- LES FILTRES DE BORNES NE PARAISSENT QUE COUCHE ACTIVE. Montrer des
             réglages qui ne s'appliquent à rien encombre sans informer. -->
        <fieldset class="poi-filtres" hidden>
          <legend>Filtrer les bornes</legend>
          <label class="poi-filtre-ligne">Puissance minimale
            <select class="poi-puissance" aria-label="Puissance minimale des bornes">
              <option value="0">toutes</option>
              <option value="22">22 kW et plus</option>
              <option value="50">50 kW et plus</option>
              <option value="150">150 kW et plus</option>
              <option value="300">300 kW et plus</option>
            </select>
          </label>
          <!-- LE NOM DE STATION CONTIENT… — « IZIVIA FAST a fait un
               partenariat avec McDonald pour mettre des bornes dans leur
               McDo. Ce serait bien de distinguer ces deux types de
               stations » (Armelin, 27/08/2026). Mesuré : les stations en
               restaurant portent le nom dans nom_station, en graphies
               inconstantes — d'où une recherche par sous-chaîne, envoyée AU
               SERVICE au-delà du zoom 12 et appliquée à l'index en deçà. -->
          <label class="poi-filtre-ligne">Nom de station contient
            <input type="search" class="poi-nom-station"
              placeholder="McDonald, Aire de Beaune…"
              aria-label="Nom de station contient">
          </label>
          <p class="poi-filtre-titre">Connecteurs acceptés</p>
          ${PRISES.map((p) => `
            <label><input type="checkbox" class="poi-prise" value="${p.cle}"> ${p.libelle}</label>`).join('')}
          <p class="poi-filtre-note">Sans connecteur coché, toutes les bornes sont montrées.</p>
          <p class="poi-filtre-titre">Réseaux — France entière</p>
          <!-- UN CHAMP DE RECHERCHE PLUTÔT QU'UNE LISTE PLUS LONGUE. Le filtre
               montrait les douze premiers réseaux ; Armelin, le 26/08 :
               « plusieurs réseaux que j'ai l'habitude d'utiliser n'y figurent
               pas ». IZIVIA FAST était treizième, Atlante dix-huitième, ALLEGO
               vingt-deuxième. Cent quarante entrées dépliées seraient
               illisibles ; cherchables, elles sont complètes. -->
          <input type="search" class="poi-reseau-recherche"
            placeholder="Chercher un réseau (Fastned, Izivia…)"
            aria-label="Chercher un réseau de recharge">
          <div class="poi-reseaux" role="group" aria-label="Filtrer par réseau"></div>
          <p class="poi-filtre-note">Le compte est national : un réseau coché
            peut n’avoir aucune borne dans la vue courante. Les réseaux sont
            groupés par EXPLOITANT — c’est lui qui porte une identité stable,
            là où l’enseigne écrit souvent le nom du site.</p>

          <!-- « TÉLÉCHARGER ET GARDER HORS LIGNE », PAS « CHARGER ». Armelin,
               le 27/08/2026 : « je ne comprends pas la liste déroulante
               "charger" ni à quoi elle sert […] pourquoi un tel filtre quand
               plus haut on a la puissance nominale ». Parce que ce n'en est
               pas un : ce réglage décide de ce qu'on TÉLÉCHARGE une fois et
               qu'on garde hors ligne — le filtre de puissance, lui, trie ce
               qui s'AFFICHE. Deux verbes différents pour deux gestes
               différents, et l'ancien libellé employait le même. -->
          <p class="poi-filtre-titre">Réseau national gardé hors ligne</p>
          <label class="poi-filtre-ligne">Télécharger
            <select class="poi-etendue" aria-label="Étendue du réseau national chargé">
              ${ETENDUES.map((e) => `
                <option value="${e.cle}">${e.libelle}</option>`).join('')}
            </select>
          </label>
          <p class="poi-filtre-note poi-etendue-note"></p>
          <p class="poi-filtre-note">Ce choix décide de ce qui est téléchargé
            puis relu localement — pas de ce qui s’affiche : pour trier
            l’affichage, la puissance minimale est plus haut.</p>

          <p class="poi-filtre-titre">Lecture de la carte</p>
          <!-- LES ÉCLAIRS DE LA LÉGENDE SONT CEUX DE LA CARTE : même tracé,
               même blanc (eclairsSVG). L'émoji ⚡ d'avant était rendu JAUNE
               par la police, et la légende décrivait des pastilles qui
               n'existaient nulle part (Armelin, 27/08/2026). -->
          <ul class="poi-legende">
            ${PALIERS.map((p) => `
              <li><span class="poi-legende-pastille" style="background:${p.couleur}"
                aria-hidden="true">${eclairsSVG(p.palier)}</span>
                ${p.libelle} — ${p.borne}</li>`).join('')}
            <li><span class="poi-legende-pastille poi-legende-inconnue"
              aria-hidden="true">${eclairsSVG(0)}</span> Puissance non déclarée</li>
          </ul>
          <p class="poi-filtre-note">Sous le zoom 12, la carte montre le réseau
            national ci-dessus, groupé en amas : il est chargé une fois, puis
            relu localement — il fonctionne hors ligne et n’interroge plus aucun
            service. Au-delà du zoom 12, la carte interroge le fichier national
            en direct et montre TOUTES les bornes de la vue, quelle que soit
            l’étendue choisie ici.</p>
        </fieldset>
        <p class="poi-etat" role="status"></p>
      </details>`;
    for (const bouton of this.querySelectorAll<HTMLButtonElement>('.poi-categorie')) {
      bouton.addEventListener('click', () => {
        const categorie = CATEGORIES.find((c) => c.cle === bouton.dataset['cle']);
        if (categorie) void this.#surCategorie(categorie);
      });
    }
    /* LES FILTRES REPARTENT AU SERVICE, ils ne trient pas l'existant. Le
       portail plafonne à 100 enregistrements : filtrer ce qui est déjà chargé
       montrerait trois bornes CCS là où la zone en compte cinquante. */
    const surFiltre = (): void => {
      this.#filtresTouches = true;
      void ecrirePreference(PREF_FILTRES, this.#filtres);
      // `force` : le seuil de vue ne doit pas avaler un changement de filtre.
      if (this.#actives.has('bornes')) void this.#charger('bornes', true);
    };
    this.querySelector<HTMLSelectElement>('.poi-puissance')?.addEventListener('change', (e) => {
      const v = Number((e.target as HTMLSelectElement).value);
      this.#filtres = { ...this.#filtres, puissanceMin: Number.isFinite(v) && v > 0 ? v : undefined };
      surFiltre();
    });
    /* LE NOM SE TAPE, DONC IL SE DÉBOUNCE — 400 ms, comme l'autocomplétion :
       chaque frappe au-delà du zoom 12 partirait sinon en requête au portail,
       et les quotas publics sont un bien commun. */
    let minuteurNom: ReturnType<typeof setTimeout> | undefined;
    this.querySelector<HTMLInputElement>('.poi-nom-station')?.addEventListener('input', (e) => {
      const brut = (e.target as HTMLInputElement).value.trim();
      clearTimeout(minuteurNom);
      minuteurNom = setTimeout(() => {
        this.#filtres = { ...this.#filtres, nom: brut === '' ? undefined : brut };
        surFiltre();
      }, 400);
    });
    /* LA RECHERCHE NE TOUCHE NI AUX FILTRES NI À LA CARTE : elle ne fait que
       réduire ce que la liste montre. Un réseau DÉJÀ COCHÉ reste affiché même
       s'il ne correspond pas à la recherche — sinon un filtre actif
       deviendrait invisible, donc impossible à retirer. */
    this.querySelector('.poi-reseau-recherche')?.addEventListener('input', () => {
      this.#rendreReseaux(this.#reseaux);
    });

    this.querySelector<HTMLSelectElement>('.poi-etendue')?.addEventListener('change', (e) => {
      const choix = (e.target as HTMLSelectElement).value as CleEtendue;
      this.#etendue = etendue(choix).cle;
      this.#index = [];        // l'index d'avant décrit une autre étendue
      this.#majNoteEtendue();
      void ecrirePreference(PREF_ETENDUE, this.#etendue);
      if (this.#actives.has('bornes')) void this.#charger('bornes', true);
    });
    this.#majNoteEtendue();
    void lirePreference<unknown>(PREF_ETENDUE).then((memo) => {
      if (typeof memo !== 'string') return;
      const connue = ETENDUES.find((x) => x.cle === memo);
      if (!connue) return;
      this.#etendue = connue.cle;
      const select = this.querySelector<HTMLSelectElement>('.poi-etendue');
      if (select) select.value = connue.cle;
      this.#majNoteEtendue();
    });

    this.querySelectorAll<HTMLInputElement>('.poi-prise').forEach((case_) => {
      case_.addEventListener('change', () => {
        const prises = [...this.querySelectorAll<HTMLInputElement>('.poi-prise:checked')]
          .map((c) => c.value as ClePrise);
        this.#filtres = { ...this.#filtres, prises };
        surFiltre();
      });
    });

    this.querySelectorAll('fieldset:not(.poi-filtres) input').forEach((case_) => {
      case_.addEventListener('change', () => {
        const couche = (case_ as HTMLInputElement).value as Couche;
        const coche = (case_ as HTMLInputElement).checked;
        if (coche) this.#actives.add(couche); else this.#actives.delete(couche);
        void ecrirePreference(PREF_POI, [...this.#actives]);
        this.#majVisibiliteFiltres();
        if (coche) void this.#charger(couche);
        else { this.#vider(couche); this.#etat(); }
      });
    });
    void lirePreference<unknown>(PREF_POI).then((memo) => {
      // Frontière système : la valeur relue se VALIDE (hasOwn, pas `in` — la
      // chaîne de prototypes laissait passer « constructor », revue du 22/08).
      const couches = Array.isArray(memo) ? memo : [];
      for (const couche of couches) {
        if (typeof couche !== 'string' || !Object.hasOwn(COUCHES, couche)) continue;
        this.#actives.add(couche as Couche);
        const case_ = this.querySelector(`input[value="${couche}"]`);
        if (case_) (case_ as HTMLInputElement).checked = true;
        void this.#charger(couche as Couche);
      }
      this.#majVisibiliteFiltres();
    });

    /* LES FILTRES SE RÉTABLISSENT AUSSI. Un réglage oublié entre deux visites
       est un réglage qu'on ne prend pas la peine de poser. La valeur relue se
       VALIDE : c'est une frontière système, comme les couches ci-dessus. */
    void lirePreference<unknown>(PREF_FILTRES).then((memo) => {
      if (this.#filtresTouches) return;
      const m = (memo ?? {}) as Record<string, unknown>;
      const puissance = Number(m['puissanceMin']);
      const prisesLues = Array.isArray(m['prises']) ? m['prises'] : [];
      const prises = prisesLues.filter(
        (v): v is ClePrise => typeof v === 'string' && PRISES.some((p) => p.cle === v));
      const reseauxLus = Array.isArray(m['reseaux']) ? m['reseaux'] : [];
      const nomLu = typeof m['nom'] === 'string' && m['nom'].trim() !== ''
        ? m['nom'].trim() : undefined;
      this.#filtres = {
        puissanceMin: Number.isFinite(puissance) && puissance > 0 ? puissance : undefined,
        prises,
        reseaux: reseauxLus.filter((v): v is string => typeof v === 'string' && v.trim() !== ''),
        nom: nomLu,
      };
      const select = this.querySelector<HTMLSelectElement>('.poi-puissance');
      if (select) select.value = String(this.#filtres.puissanceMin ?? 0);
      const champNom = this.querySelector<HTMLInputElement>('.poi-nom-station');
      if (champNom && nomLu) champNom.value = nomLu;
      for (const cle of prises) {
        const c = this.querySelector<HTMLInputElement>(`.poi-prise[value="${cle}"]`);
        if (c) c.checked = true;
      }
    });
  }

  /* LES RÉSEAUX PRÉSENTS DANS LA VUE, du plus fourni au moins fourni.
     Plafonnés à douze : au-delà, la liste devient un annuaire où l'on ne
     trouve plus rien, et le jeu IRVE compte des centaines d'enseignes dont
     beaucoup sont un hôtel isolé. Les réseaux DÉJÀ COCHÉS restent affichés
     même s'ils sortent du plafond — sinon un filtre actif deviendrait
     invisible, donc impossible à retirer. */
  #rendreReseaux(reseaux: ReseauNational[]): void {
    const boite = this.querySelector('.poi-reseaux');
    if (!boite) return;
    boite.replaceChildren();
    this.#reseaux = reseaux;
    this.#variantes = new Map(reseaux.map((r) => [r.nom, r.variantes]));

    const coches = new Set(this.#filtres.reseaux ?? []);
    const recherche = this.querySelector<HTMLInputElement>('.poi-reseau-recherche')?.value ?? '';
    const trouves = chercherReseaux(reseaux, recherche);
    /* SANS RECHERCHE, LES DOUZE PREMIERS : cent quarante entrées dépliées
       d'office noieraient les réglages voisins. Dès qu'on tape, la liste
       s'ouvre à TOUT ce qui correspond — c'est là que se trouvent Fastned,
       Izivia ou Allego, treizième et au-delà.
       LES RÉSEAUX COCHÉS RESTENT AFFICHÉS quoi qu'il arrive : un filtre actif
       mais invisible serait impossible à retirer. */
    const limite = recherche.trim() === '' ? 12 : 40;
    const montres = [
      ...trouves.slice(0, limite),
      ...trouves.slice(limite).filter((r) => coches.has(r.nom)),
      ...reseaux.filter((r) => coches.has(r.nom) && !trouves.includes(r)),
    ];

    if (montres.length === 0) {
      const vide = document.createElement('p');
      vide.className = 'poi-filtre-note';
      vide.textContent = recherche.trim() === ''
        ? 'Aucun réseau identifié.'
        : `Aucun réseau ne correspond à « ${recherche.trim()} ».`;
      boite.appendChild(vide);
      return;
    }

    /* ON DIT COMBIEN ON MONTRE SUR COMBIEN. Sans ce compte, une liste tronquée
       à douze passe pour une liste complète — c'est exactement ce qui a fait
       croire que Fastned ou Allego n'existaient pas. */
    if (montres.length < reseaux.length) {
      const compte = document.createElement('p');
      compte.className = 'poi-filtre-note';
      compte.textContent = `${montres.length} réseaux sur ${reseaux.length}`
        + ' — cherchez par leur nom pour trouver les autres.';
      boite.appendChild(compte);
    }

    for (const r of montres) {
      const etiquette = document.createElement('label');
      const case_ = document.createElement('input');
      case_.type = 'checkbox';
      case_.className = 'poi-reseau';
      case_.value = r.nom;
      case_.checked = coches.has(r.nom);
      const texte = document.createElement('span');
      texte.textContent = ` ${r.nom} (${r.nombre})`;
      case_.addEventListener('change', () => {
        const choisis = [...this.querySelectorAll<HTMLInputElement>('.poi-reseau:checked')]
          .map((c) => c.value);
        this.#filtres = { ...this.#filtres, reseaux: choisis };
        this.#filtresTouches = true;
        void ecrirePreference(PREF_FILTRES, this.#filtres);
        void this.#charger('bornes', true);
      });
      etiquette.append(case_, texte);
      boite.appendChild(etiquette);
    }
  }

  /**
   * Les filtres tels qu'ils partent AU PORTAIL — enseignes redéployées.
   *
   * Le portail compare `nom_enseigne` à une chaîne EXACTE. Cocher « LIDL » et
   * n'envoyer que ce libellé rendrait 446 stations et en perdrait 434, écrites
   * « Lidl France » : le défaut serait simplement déplacé du calcul local vers
   * la requête distante. On envoie donc toutes les écritures du groupe.
   */
  #filtresService(): FiltresBornes {
    const choisis = this.#filtres.reseaux ?? [];
    if (choisis.length === 0) return this.#filtres;
    const deployes = choisis.flatMap((nom) => this.#variantes.get(nom) ?? [nom]);
    return { ...this.#filtres, reseaux: [...new Set(deployes)] };
  }

  /** Dit ce que l'étendue choisie contient, ET ce qu'elle coûte. */
  #majNoteEtendue(): void {
    const note = this.querySelector<HTMLElement>('.poi-etendue-note');
    if (!note) return;
    const e = etendue(this.#etendue);
    const fr = (n: number): string => n.toLocaleString('fr-FR');
    /* LE POINT DE COMPARAISON EST DONNÉ, parce qu'il sera fait de toute façon.
       L'Avere annonce 200 045 POINTS DE RECHARGE ouverts au public ; nous
       comptons des STATIONS. Sans le dire, l'écart passe pour un trou. */
    note.textContent = `${fr(e.stations)} stations, soit environ`
      + ` ${fr(e.points)} points de charge (${e.poids}, chargé une fois puis`
      + ' gardé hors ligne). Repère : l’Avere-France recensait 200 045 points'
      + ' de recharge ouverts au public au 31 juillet 2026 — une station en'
      + ' compte plusieurs.';
  }

  /* Les filtres ne s'affichent qu'avec la couche qu'ils règlent. */
  #majVisibiliteFiltres(): void {
    const bloc = this.querySelector<HTMLElement>('.poi-filtres');
    if (bloc) bloc.hidden = !this.#actives.has('bornes');
  }

  #rechargerActives(): void {
    for (const couche of this.#actives) void this.#charger(couche);
  }

  /** Bbox de la vue, longitudes RAMENÉES dans [-180, 180] : MapLibre les rend
      « déroulées » sur les copies du monde. */
  #bbox(): Bbox {
    const b = this.#carte!.getBounds();
    const enrouler = (l: number): number => ((l + 180) % 360 + 360) % 360 - 180;
    const ouest = enrouler(b.getWest());
    const est = enrouler(b.getEast());
    // Vue à cheval sur l'antiméridien (rarissime à zoom ≥ 12) : on dégrade
    // en monde entier plutôt que d'envoyer une bbox inversée aux services.
    if (ouest > est) return { ouest: -180, sud: b.getSouth(), est: 180, nord: b.getNorth() };
    return { ouest, sud: b.getSouth(), est, nord: b.getNorth() };
  }

  /* ---- sous le zoom 12 : l'index national ---- */

  /**
   * Charge l'index UNIQUEMENT pour peupler la liste des réseaux, sans toucher
   * à la carte. Appelée depuis le chemin par emprise, en tâche de fond.
   *
   * SON ÉCHEC EST MUET, ET C'EST VOULU : la liste des réseaux est un confort
   * de filtrage. La faire remonter effacerait des bornes correctement
   * affichées pour signaler qu'un filtre facultatif manque — le remède serait
   * pire que le mal.
   */
  async #assurerReseauxNationaux(): Promise<void> {
    if (this.#index.length > 0) return;
    try {
      const { stations } = await indexNational(undefined, this.#etendue);
      this.#index = stations;
      this.#rendreReseaux(reseauxNationaux(stations));
    } catch { /* confort de filtrage : son absence ne casse rien */ }
  }

  /**
   * Les bornes vues de haut, depuis l'index local.
   *
   * AUCUN APPEL PAR DÉPLACEMENT. Le découpage, le filtrage et le comptage par
   * réseau se font en mémoire : dézoomer sur la France entière ne coûte donc
   * rien aux quotas publics, là où la couche par emprise émet une requête à
   * chaque `moveend`. Le seul appel réseau possible est le tout premier
   * téléchargement de l'index, et il ne se produit qu'une fois par mois.
   */
  async #chargerDepuisIndex(): Promise<void> {
    const carte = this.#carte;
    if (!carte) return;
    this.#controleurs.bornes?.abort();
    const controleur = new AbortController();
    this.#controleurs.bornes = controleur;

    /* DÉJÀ EN MÉMOIRE : on repose sans repasser par le stockage. Sans cette
       porte, chaque `moveend` relisait quatorze mille stations depuis
       IndexedDB pour un découpage qui, lui, prend une milliseconde. */
    if (this.#index.length > 0) {
      this.#poserIndex();
      delete this.#erreurs.bornes;
      this.#etat();
      return;
    }
    /* ON ANNONCE L'ATTENTE, PAS SEULEMENT LE POIDS. « Toutes les bornes » a
       demandé 26 secondes à la mesure du 26/08/2026 — 2,5 Mo à recevoir, puis
       84 299 lignes à fondre en 56 781 stations. Un « chargement… » muet
       pendant une demi-minute se lit comme une panne, et l'on recharge la page
       au pire moment. La relecture, elle, prend 190 ms : l'attente ne se paie
       qu'une fois par mois, et cela aussi mérite d'être dit. */
    const quoi = etendue(this.#etendue);
    this.#etat(`Chargement du réseau national (${quoi.poids})`
      + `${quoi.cle === 'toutes' ? ' — comptez une demi-minute' : ''} :`
      + ' une seule fois, puis gardé hors ligne…');
    try {
      const { stations } = await indexNational(controleur.signal, this.#etendue);
      if (controleur !== this.#controleurs.bornes) return;
      this.#index = stations;
      this.#rendreReseaux(reseauxNationaux(stations));
      this.#poserIndex();
      delete this.#erreurs.bornes;
      this.#etat();
    } catch (e) {
      if (controleur.signal.aborted) return;
      this.#purger('bornes');
      this.#erreurs.bornes = true;
      this.#poserTout();
      this.#etat(e instanceof ErreurIndex ? e.message : undefined);
    }
  }

  /** Découpe l'index sur la vue et le pose. Purement local, donc rejouable. */
  #poserIndex(): void {
    const carte = this.#carte;
    if (!carte || this.#index.length === 0) return;
    const visibles = filtrerStations(
      stationsDans(this.#index, this.#bbox()), this.#filtres,
    );
    this.#bornes = {
      type: 'FeatureCollection',
      features: visibles.map((s) => ({
        type: 'Feature',
        properties: this.#proprietesStation(s),
        geometry: { type: 'Point', coordinates: [s.lon, s.lat] },
      })),
    };
    this.#montres.bornes = visibles.length;
    this.#totaux.bornes = visibles.length;
    /* PAS DE « 100 SUR N » ICI, et ce n'est pas un oubli : l'index n'est pas
       tronqué. Ce que la carte montre EST ce que l'index contient pour cette
       vue — le compteur peut donc être une simple égalité. */
    this.#chargee.bornes = this.#bbox();
    this.#poserTout();
  }

  /** Les propriétés portées par une punaise venue de l'index. */
  #proprietesStation(s: StationRapide): Record<string, unknown> {
    return {
      nom: s.nom,
      puissance: s.puissance,
      pdc: s.pdc,
      gratuit: null,
      reseau: s.reseau,
      prises: s.prises.join(','),
      ouvert: s.ouvert,
      id: s.id,
      icone: nomIcone(palierDe(s.puissance)),
      palierLibelle: libellePalier(s.puissance),
    };
  }

  async #charger(couche: Couche, force = false): Promise<void> {
    const carte = this.#carte;
    if (!carte || !this.#actives.has(couche)) return;
    /* MASQUÉES PAR LE MODE TRAJET : ni affichage, ni CHARGEMENT. Interroger le
       portail pour des punaises invisibles gaspillerait un quota public. */
    if (couche === 'bornes' && this.#bornesMasquees) return;

    /* LES BORNES ONT LEUR PROPRE ROUTE SOUS LE SEUIL : l'index national.
       Les deux autres couches n'ont pas d'index et s'arrêtent là — mieux vaut
       le dire que rendre cent points au hasard. */
    if (carte.getZoom() < ZOOM_MIN) {
      if (couche === 'bornes') { await this.#chargerDepuisIndex(); return; }
      this.#vider(couche);
      this.#etat();
      return;
    }
    const bbox = this.#bbox();
    /* LE SEUIL : une vue quasi identique ne se recharge pas — frugalité due
       aux API publiques. MAIS IL NE DOIT PAS BLOQUER CE QUI NE VIENT PAS DE LA
       VUE : changer un filtre ne déplace pas la carte, et sans cette porte
       l'usager cochait « CCS Combo » pour voir… exactement la même chose.
       Mesuré par un parcours E2E qui lit l'URL émise, pas par l'œil. */
    const deja = this.#chargee[couche];
    if (!force && deja && !vueAChange(deja, bbox)) return;
    this.#controleurs[couche]?.abort();
    const controleur = new AbortController();
    this.#controleurs[couche] = controleur;
    try {
      if (couche === 'carburants') {
        const c = await chargerCarburants(bbox, controleur.signal);
        if (controleur !== this.#controleurs[couche]) return;
        this.#carburants = {
          type: 'FeatureCollection',
          features: c.elements.map((p) => ({
            type: 'Feature',
            properties: { adresse: p.adresse, ville: p.ville, prix: JSON.stringify(p.prix) },
            geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
          })),
        };
        this.#montres.carburants = c.elements.length; this.#totaux.carburants = c.total;
      } else if (couche === 'bornes') {
        /* LA LISTE DES RÉSEAUX EST NATIONALE, et se charge en tâche de fond.
           Elle venait de la FACETTE bornée à l'emprise : elle ne proposait
           donc que ce que la vue montrait déjà, et son contenu changeait à
           chaque déplacement — « le filtre réseau devrait fonctionner quel que
           soit le niveau de zoom » (Armelin, 25/08). Son échec ne doit PAS
           emporter les bornes : elle n'est qu'un confort de filtrage, d'où le
           `void` et le `catch` muet. */
        void this.#assurerReseauxNationaux();
        const c = await chargerBornes(bbox, controleur.signal, this.#filtresService());
        if (controleur !== this.#controleurs[couche]) return;
        this.#bornes = {
          type: 'FeatureCollection',
          features: c.elements.map((p) => ({
            type: 'Feature',
            properties: {
              nom: p.nom, puissance: p.puissance, pdc: p.pdc, gratuit: p.gratuit,
              reseau: p.reseau, prises: p.prises.join(','),
              /* L'ACCÈS N'EST PAS CONNU PAR CETTE ROUTE : la requête par
                 emprise ne demande pas `condition_acces`. `null` le dit — et
                 le cartouche de détail, lui, ira le chercher. */
              ouvert: null,
              id: p.id,
              // Le palier est calculé UNE FOIS, ici : une expression MapLibre
              // le recalculerait à chaque image, et il serait invisible aux
              // tests. La décision vit dans lib/puissance.ts, testée à sec.
              icone: nomIcone(palierDe(p.puissance)),
              palierLibelle: libellePalier(p.puissance),
            },
            geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
          })),
        };
        this.#montres.bornes = c.elements.length; this.#totaux.bornes = c.total;
      } else {
        const c = await chargerParkings(bbox, controleur.signal);
        if (controleur !== this.#controleurs[couche]) return;
        this.#parkings = c.collection;
        this.#montres.parkings = c.collection.features.length; this.#totaux.parkings = c.total;
      }
      delete this.#erreurs[couche];
      this.#chargee[couche] = bbox;
      this.#poserTout();
      this.#etat();
    } catch {
      if (controleur.signal.aborted) return;
      // Pas de données périmées sous un message de panne : la couche en échec
      // se PURGE, et l'état PAR COUCHE la dit indisponible — durablement, sans
      // écraser les compteurs des couches qui vont bien (revue du 22/08).
      this.#purger(couche);
      this.#erreurs[couche] = true;
      this.#poserTout();
      this.#etat();
    }
  }

  #purger(couche: Couche): void {
    const vide: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
    if (couche === 'carburants') this.#carburants = vide;
    else if (couche === 'bornes') this.#bornes = vide;
    else this.#parkings = vide;
    delete this.#totaux[couche];
    delete this.#montres[couche];
    delete this.#chargee[couche];
  }

  #vider(couche: Couche): void {
    this.#controleurs[couche]?.abort();
    this.#purger(couche);
    delete this.#erreurs[couche];
    if (this.#popupDe === couche) { this.#popup?.remove(); this.#popup = null; this.#popupDe = null; }
    // Décocher « Bornes » doit aussi refermer le détail : un cartouche qui
    // survit à la couche qu'il décrit décrit un point qui n'est plus là.
    if (couche === 'bornes') this.#fiche?.fermer();
    this.#poserTout();
  }

  /** L'état, honnête : « 100 sur 11 950 » quand le plafond du portail mord,
      « indisponibles » tant qu'une couche est en panne, et le rappel du seuil
      quand une couche sans index a cessé de répondre au dézoom. */
  #etat(message?: string): void {
    const p = this.querySelector('.poi-etat') as HTMLElement;
    if (message) { p.textContent = message; return; }
    const fr = (n: number): string => n.toLocaleString('fr-FR');
    const bouts: string[] = [];
    /* PENDANT LE MODE TRAJET, LE DIRE : une couche cochée mais invisible sans
       explication se lit comme une panne. */
    if (this.#bornesMasquees && this.#actives.has('bornes')) {
      bouts.push('Bornes : la carte ne montre que celles du trajet planifié'
        + ' — effacez ou recalculez le trajet pour revoir le réseau entier');
    }
    /* SOUS LE SEUIL, DIRE CE QU'ON MONTRE — et ce qu'on ne montre pas. Une
       carte qui affiche les stations rapides sans annoncer son seuil laisse
       croire qu'il n'existe rien d'autre. */
    const sousLeSeuil = (this.#carte?.getZoom() ?? ZOOM_MIN) < ZOOM_MIN;
    if (!this.#bornesMasquees
      && sousLeSeuil && this.#actives.has('bornes') && !this.#erreurs.bornes) {
      const n = this.#montres.bornes;
      const quoi = etendue(this.#etendue);
      const domaine = quoi.seuilKw > 0
        ? `${quoi.seuilKw} kW et plus` : 'toutes puissances';
      bouts.push(n === undefined
        ? `Réseau national (${domaine})`
        : `${fr(n)} station${n > 1 ? 's' : ''} dans la vue (${domaine})`);
    }
    for (const couche of this.#actives) {
      // Déjà dit ci-dessus — par le mode trajet, ou dans les termes de l'index.
      if (couche === 'bornes' && this.#bornesMasquees) continue;
      if (couche === 'bornes' && sousLeSeuil && !this.#erreurs.bornes) continue;
      if (couche !== 'bornes' && sousLeSeuil) {
        bouts.push(`${COUCHES[couche]} : zoomez pour les afficher`);
        continue;
      }
      if (this.#erreurs[couche]) { bouts.push(`${COUCHES[couche]} : indisponibles`); continue; }
      const total = this.#totaux[couche];
      const montres = this.#montres[couche];
      if (total === undefined || montres === undefined) continue;
      bouts.push(`${COUCHES[couche]} : ${montres < total ? `${fr(montres)} sur ${fr(total)}` : fr(montres)}`);
    }
    p.textContent = bouts.join(' · ');
  }

  /* ---- pose sur la carte (survit au changement de fond) ---- */

  #poserTout(): void {
    const carte = this.#carte;
    if (!carte) return;
    try {
      // Les surfaces d'abord, les points ensuite : les cercles restent
      // cliquables au-dessus des polygones, quel que soit l'ordre d'activation.
      this.#poserSource('poi-parkings', this.#parkings);
      this.#poserSource('poi-carburants', this.#carburants);
      this.#poserSource('poi-bornes', this.#bornes);
      // Les lieux d'une catégorie cherchée survivent aussi au changement de
      // fond — même contrat que le tracé d'itinéraire.
      if (this.#categorieActive && this.#lieuxPoses.length > 0) {
        this.#poserLieux(this.#lieuxPoses);
      }
      // Un changement de style vient de reposer les couches : le masquage du
      // mode trajet, lui, n'a pas changé — on le réapplique.
      this.#appliquerMasquage();
    } catch (e) {
      // Style en cours de chargement : style.load (branché dans `set carte`)
      // reposera tout — même contrat que le tracé d'itinéraire.
      if (e instanceof Error && /style is not done loading/i.test(e.message)) return;
      throw e;
    }
  }

  #poserSource(id: string, donnees: GeoJSON.FeatureCollection): void {
    const carte = this.#carte!;
    const source = carte.getSource(id) as GeoJSONSource | undefined;
    if (source) { source.setData(donnees); return; }
    /* LES BORNES SE GROUPENT EN AMAS SOUS LE ZOOM 12, et elles seules.
       Quatorze mille punaises sur une carte de France ne se lisent pas : elles
       forment une tache. `clusterMaxZoom` est réglé JUSTE SOUS le seuil des
       requêtes par emprise, si bien que les deux régimes se relaient sans
       trou — au-dessus, une punaise par station ; en dessous, un nombre.
       Le groupement se décide À LA CRÉATION de la source et ne se change plus
       ensuite : c'est pourquoi il est posé ici, une fois pour toutes. */
    carte.addSource(id, id === 'poi-bornes'
      ? {
        type: 'geojson', data: donnees,
        cluster: true, clusterMaxZoom: ZOOM_AMAS_MAX, clusterRadius: 48,
      }
      : { type: 'geojson', data: donnees });
    if (id === 'poi-parkings') {
      carte.addLayer({
        id: 'poi-parkings-fond', type: 'fill', source: id,
        paint: { 'fill-color': COULEURS.parkings, 'fill-opacity': 0.22 },
      });
      carte.addLayer({
        id: 'poi-parkings-bord', type: 'line', source: id,
        paint: { 'line-color': COULEURS.parkings, 'line-width': 1.5 },
      });
      return;
    }
    if (id === 'poi-bornes') {
      /* LES BORNES PORTENT LEUR PUISSANCE, pas leur enseigne. Un usager
         cherche « puis-je recharger vite ici » ; un logo de réseau l'oblige à
         savoir ce que ce réseau déploie. Un à trois éclairs répondent d'un
         coup d'œil — et se dessinent sans republier aucune marque déposée. */
      poserIconesPuissance(carte);
      /* LES AMAS D'ABORD, LES PUNAISES ENSUITE : posées dans cet ordre, une
         station isolée reste cliquable au-dessus d'un amas voisin. */
      carte.addLayer({
        id: 'poi-bornes-amas', type: 'circle', source: id,
        filter: ['has', 'point_count'],
        paint: {
          // Le disque grandit avec le nombre, par paliers lisibles.
          'circle-radius': ['step', ['get', 'point_count'], 14, 20, 19, 100, 25],
          'circle-color': COULEURS.bornes,
          'circle-opacity': 0.85,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#FFFFFF',
        },
      });
      carte.addLayer({
        id: 'poi-bornes-amas-nombre', type: 'symbol', source: id,
        filter: ['has', 'point_count'],
        layout: {
          'text-field': ['get', 'point_count_abbreviated'],
          'text-size': 12,
          'text-allow-overlap': true,
          'text-ignore-placement': true,
        },
        paint: { 'text-color': '#FFFFFF' },
      });
      carte.addLayer({
        id, type: 'symbol', source: id,
        // Sans ce filtre, chaque amas porterait AUSSI une punaise : le nombre
        // se lirait par-dessus une icône, et le clic tomberait sur l'une ou
        // l'autre selon l'ordre de rendu.
        filter: ['!', ['has', 'point_count']],
        layout: {
          'icon-image': ['get', 'icone'],
          'icon-size': 0.62,
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
        },
      });
      return;
    }
    carte.addLayer({
      id, type: 'circle', source: id,
      paint: {
        'circle-radius': 7, 'circle-color': COULEURS.carburants,
        'circle-stroke-width': 2, 'circle-stroke-color': '#FFFFFF',
      },
    });
  }

  /* ---- popups, en textContent : les libellés viennent de l'extérieur ---- */

  /**
   * Un clic sur une catégorie : cherche, ou efface si elle était active.
   *
   * SOUS LE ZOOM 12, ON REFUSE ET ON DIT POURQUOI : l'emprise couvrirait des
   * départements entiers, et le plafond de résultats rendrait cent lieux au
   * hasard — un affichage qui ment. Même seuil que les autres couches.
   */
  async #surCategorie(categorie: Categorie): Promise<void> {
    const etat = this.querySelector('.poi-categorie-etat') as HTMLElement;
    if (this.#categorieActive?.cle === categorie.cle) {
      this.#effacerCategorie();
      etat.textContent = '';
      return;
    }
    const carte = this.#carte;
    if (!carte) return;
    if (carte.getZoom() < ZOOM_MIN) {
      etat.textContent = 'Rapprochez-vous (zoom 12 au moins) : chercher sur une'
        + ' emprise trop large rendrait cent lieux au hasard.';
      return;
    }

    this.#effacerCategorie();
    this.#categorieActive = categorie;
    this.#majBoutonsCategories();
    this.#annulationCategorie = new AbortController();
    etat.textContent = `Recherche des ${categorie.libelle.toLowerCase()}…`;
    const limites = carte.getBounds();
    try {
      const lieux = await chercherCategorie(categorie, {
        ouest: limites.getWest(), sud: limites.getSouth(),
        est: limites.getEast(), nord: limites.getNorth(),
      }, this.#annulationCategorie.signal);
      if (this.#categorieActive?.cle !== categorie.cle) return;
      this.#lieuxPoses = lieux;
      this.#poserLieux(lieux);
      /* LE COMPTE, ET LE CONTRAT : la liste ne suit pas la carte. Le dire
         évite qu'un déplacement fasse croire à des pharmacies disparues. */
      etat.textContent = lieux.length === 0
        ? `Aucun lieu « ${categorie.libelle} » dans cette vue (source OpenStreetMap).`
        : `${lieux.length} dans la vue`
          + (lieux.length >= 100 ? ' (les 100 premiers)' : '')
          + ' — la liste ne suit pas la carte : recliquez après un déplacement.';
    } catch (e) {
      if (this.#categorieActive?.cle !== categorie.cle) return;
      this.#effacerCategorie();
      etat.textContent = e instanceof ErreurCategories
        ? e.message : 'La recherche de lieux est indisponible pour le moment.';
    }
  }

  /**
   * Dit, EN PERMANENCE, si la vue permet ces recherches.
   *
   * Les catégories et le filtre par nom travaillent sur l'EMPRISE VISIBLE :
   * sous le zoom 12, il n'y a rien à interroger — chercher les pharmacies
   * de la moitié de la France rendrait cent lieux au hasard, et le service
   * est un commun bénévole. La règle ne change pas ; ce qui change, c'est
   * qu'elle se voit.
   */
  #majSeuilVue(): void {
    const zoom = this.#carte?.getZoom() ?? 0;
    const trop = zoom < ZOOM_MIN;
    const raison = 'Rapprochez-vous pour chercher dans la vue (zoom 12 au'
      + ' moins) — au zoom d’un trajet entier, il n’y a rien à interroger.';
    for (const b of this.querySelectorAll<HTMLButtonElement>('.poi-categorie')) {
      b.disabled = trop;
      if (trop) b.setAttribute('title', raison); else b.removeAttribute('title');
    }
    const note = this.querySelector<HTMLElement>('.poi-seuil-vue');
    if (note) { note.textContent = trop ? raison : ''; note.hidden = !trop; }
    const champNom = this.querySelector<HTMLInputElement>('.poi-nom-station');
    if (champNom) {
      champNom.disabled = trop;
      champNom.placeholder = trop
        ? 'Rapprochez-vous pour filtrer par nom' : 'McDonald, Aire de Beaune…';
    }
  }

  #majBoutonsCategories(): void {
    for (const b of this.querySelectorAll<HTMLButtonElement>('.poi-categorie')) {
      b.setAttribute('aria-pressed',
        String(b.dataset['cle'] === this.#categorieActive?.cle));
    }
  }

  #poserLieux(lieux: LieuCategorie[]): void {
    const carte = this.#carte;
    if (!carte) return;
    const donnees: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: lieux.map((l) => ({
        type: 'Feature',
        properties: { nom: l.nom },
        geometry: { type: 'Point', coordinates: [l.lon, l.lat] },
      })),
    };
    const source = carte.getSource('poi-categorie') as GeoJSONSource | undefined;
    if (source) { source.setData(donnees); return; }
    carte.addSource('poi-categorie', { type: 'geojson', data: donnees });
    carte.addLayer({
      id: 'poi-categorie-points', type: 'circle', source: 'poi-categorie',
      paint: {
        'circle-radius': 7,
        'circle-color': '#7C3AED',
        'circle-stroke-width': 2,
        'circle-stroke-color': '#FFFFFF',
      },
    });
    carte.on('click', 'poi-categorie-points', (e) => {
      const natif = e.originalEvent as Event & { __clicPris?: boolean };
      if (natif.__clicPris) return;
      natif.__clicPris = true;
      const f = (e.features ?? [])[0];
      if (!f) return;
      const bloc = document.createElement('div');
      bloc.className = 'popup-adresse';
      const titre = document.createElement('p');
      titre.className = 'pa-libelle';
      // textContent : le nom vient d'OpenStreetMap, jamais interprété en HTML.
      const nom = (f.properties as { nom?: string | null })?.nom;
      titre.textContent = nom ?? this.#categorieActive?.libelle.replace(/s$/, '') ?? 'Lieu';
      const source_ = document.createElement('p');
      source_.className = 'pa-coords';
      source_.textContent = 'Source OpenStreetMap';
      bloc.append(titre, source_);
      this.#popup?.remove();
      this.#popup = new Popup({ closeButton: true, maxWidth: '260px' })
        .setLngLat(e.lngLat).setDOMContent(bloc).addTo(carte);
    });
    carte.on('mouseenter', 'poi-categorie-points', () => { carte.getCanvas().style.cursor = 'pointer'; });
    carte.on('mouseleave', 'poi-categorie-points', () => { carte.getCanvas().style.cursor = ''; });
  }

  #effacerCategorie(): void {
    this.#annulationCategorie?.abort();
    this.#annulationCategorie = null;
    this.#categorieActive = null;
    this.#lieuxPoses = [];
    this.#majBoutonsCategories();
    const carte = this.#carte;
    if (carte?.getLayer('poi-categorie-points')) carte.removeLayer('poi-categorie-points');
    if (carte?.getSource('poi-categorie')) carte.removeSource('poi-categorie');
  }

  #monterPopup(couche: Couche, lngLat: { lng: number; lat: number }, contenu: HTMLElement): void {
    this.#popup?.remove();
    this.#popupDe = couche;
    this.#popup = new Popup({ closeButton: true, maxWidth: '260px' })
      .setLngLat(lngLat).setDOMContent(contenu).addTo(this.#carte!);
  }

  #ouvrirPopup(couche: 'carburants' | 'bornes', features: MapGeoJSONFeature[]): void {
    const f = features[0];
    if (!f || f.geometry.type !== 'Point') return;
    const p = f.properties ?? {};
    const [lng, lat] = f.geometry.coordinates as [number, number];

    /* UNE BORNE OUVRE LE CARTOUCHE, PAS UNE BULLE. Le détail fait six
       rubriques — accès, points de charge, horaires, paiement, commodités,
       provenance — et ne tient pas dans les deux cent soixante pixels d'une
       popup ancrée à la punaise. La bulle reste le repli quand le cartouche
       n'est pas posé (panneau utilisé seul). */
    if (couche === 'bornes' && this.#fiche) {
      this.#popup?.remove();
      this.#popup = null;
      this.#popupDe = null;
      this.#fiche.ouvrir({
        id: typeof p['id'] === 'string' && p['id'] ? p['id'] : null,
        lon: lng,
        lat,
        nom: typeof p['nom'] === 'string' && p['nom'] ? p['nom'] : 'Station de recharge',
      });
      return;
    }
    const bloc = document.createElement('div');
    bloc.className = 'poi-popup';
    const titre = document.createElement('strong');
    if (couche === 'carburants') {
      titre.textContent = [p['adresse'], p['ville']].filter((v) => typeof v === 'string' && v).join(', ')
        || 'Station-service';
      bloc.append(titre);
      const liste = document.createElement('dl');
      let prix: unknown = [];
      try { prix = JSON.parse(String(p['prix'] ?? '[]')); } catch { /* propriété forgée : liste vide */ }
      for (const ligne of Array.isArray(prix) ? prix : []) {
        const [libelle, valeur] = ligne as [unknown, unknown];
        if (typeof libelle !== 'string' || typeof valeur !== 'number') continue;
        const dt = document.createElement('dt'); dt.textContent = libelle;
        const dd = document.createElement('dd');
        dd.textContent = `${valeur.toFixed(2).replace('.', ',')} €/L`;
        liste.append(dt, dd);
      }
      bloc.append(liste);
    } else {
      titre.textContent = typeof p['nom'] === 'string' && p['nom'] ? p['nom'] : 'Borne de recharge';
      bloc.append(titre);
      const detail = document.createElement('p');
      const puissance = Number(p['puissance']);
      const pdc = Number(p['pdc']);
      detail.textContent = [
        Number.isFinite(puissance) && puissance > 0 ? `${puissance} kW` : null,
        Number.isFinite(pdc) && pdc > 0 ? `${pdc} point${pdc > 1 ? 's' : ''} de charge` : null,
        p['gratuit'] === true ? 'gratuit' : null,
        typeof p['reseau'] === 'string' && p['reseau'] ? p['reseau'] : null,
      ].filter(Boolean).join(' · ');
      bloc.append(detail);

      /* LE PALIER EN TOUTES LETTRES. Les éclairs se voient sur la carte ; un
         lecteur d'écran, lui, ne voit rien — et « 22 kW » ne dit pas à tout le
         monde si c'est rapide. */
      const palier = document.createElement('p');
      palier.className = 'poi-palier';
      palier.textContent = typeof p['palierLibelle'] === 'string'
        ? p['palierLibelle'] : '';
      if (palier.textContent) bloc.append(palier);

      const prises = typeof p['prises'] === 'string' && p['prises']
        ? p['prises'].split(',') : [];
      if (prises.length > 0) {
        const ligne = document.createElement('p');
        ligne.className = 'poi-prises';
        ligne.textContent = 'Connecteurs : ' + prises
          .map((c) => PRISES.find((x) => x.cle === c)?.libelle ?? c).join(', ');
        bloc.append(ligne);
      }
    }
    this.#monterPopup(couche, { lng, lat }, bloc);
  }

  #popupParking(lngLat: { lng: number; lat: number }, features: MapGeoJSONFeature[]): void {
    const f = features[0];
    if (!f) return;
    const p = f.properties ?? {};
    const bloc = document.createElement('div');
    bloc.className = 'poi-popup';
    const titre = document.createElement('strong');
    titre.textContent = 'Parking';
    const detail = document.createElement('p');
    const surf = Number(p['surfm2']);
    detail.textContent = [
      Number.isFinite(surf) && surf > 0 ? `${Math.round(surf)} m²` : null,
      typeof p['nomcom'] === 'string' ? p['nomcom'] : null,
    ].filter(Boolean).join(' · ');
    bloc.append(titre, detail);
    // La popup s'ouvre là où l'usager a cliqué : un polygone n'a pas de
    // centre évident.
    this.#monterPopup('parkings', lngLat, bloc);
  }
}

customElements.define('panneau-poi', PanneauPoi);
