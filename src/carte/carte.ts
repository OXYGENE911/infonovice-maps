// Création de la carte : plein écran, fond Plan IGN, contrôles localisés.
// Tout ce qui est TESTABLE hors navigateur vit dans style-ign.ts ; ce module
// ne fait que l'assemblage MapLibre.
import { Map as CarteMapLibre, NavigationControl, GeolocateControl, ScaleControl, Marker, Popup, setWorkerUrl } from 'maplibre-gl';
import { PanneauHistorique } from './panneau-historique';
import { estSombre, themeCourant, garderTheme, LIBELLES_THEME, THEMES } from '../lib/theme';
import { CARTOUCHES, imageCartouche, zonesEtirables } from './cartouche-route';
import { refermerPanneaux } from './panneaux';
import { VERSION, libelleVersion, forcerMiseAJour } from '../lib/version';
import { pictoMenu } from './icone-menu';
import 'maplibre-gl/dist/maplibre-gl.css';
// LE WORKER DE MAPLIBRE DOIT ÊTRE ÉMIS PAR LE BUILD. MapLibre 6 le charge en
// module séparé, résolu PAR DÉFAUT relativement à son propre fichier — dans
// notre bundle, cela donnait /assets/maplibre-gl-worker.mjs… jamais émis :
// 404 silencieux, et AUCUNE couche GeoJSON (tracé d'itinéraire compris) n'a
// été rendue de v0.5.0 à v0.9.0, en production aussi. Marqueurs DOM et résumé
// masquaient l'absence, et aucun test ne vérifiait les PIXELS (corrigé : le
// parcours E2E interroge désormais queryRenderedFeatures). `?worker&url`
// demande à Vite d'empaqueter le worker AVEC ses imports et d'en émettre
// l'URL ; setWorkerUrl est l'API MapLibre prévue pour la lui donner.
import lienWorkerMaplibre from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

setWorkerUrl(lienWorkerMaplibre);
import {
  styleCarte, LOCALE_FR, SOURCE_ETIQUETTES, sourceEtiquettes, calquesEtiquettes,
  INCLINAISON_RELIEF,
  type OptionsStyle, type Fond,
} from './style-ign';
import { SelecteurFonds } from './selecteur-fonds';
import { installerPanneaux } from './panneaux';
import { RechercheAdresse, poserEmpriseCourante, poserPositionConnue } from './recherche';
import { PanneauItineraire } from './panneau-itineraire';
import { PanneauPoi } from './panneau-poi';
import { FiltrePoi } from './filtre-poi';
import { brancherTempsTrajet } from './temps-trajet';

/** Ce que la fiche destination doit savoir d'un lieu choisi. */
interface DestinationChoisie {
  libelle: string; contexte: string; lon: number; lat: number;
  type?: string | undefined; adresseInconnue?: boolean | undefined;
}
import { MesPoi } from './mes-poi';
import { PanneauFavoris } from './panneau-favoris';
import { PanneauTrafic } from './panneau-trafic';
import { OutilMesure } from './outil-mesure';
import { OutilMeteo } from './outil-meteo';
import { OutilsMenu } from './outils-menu';
import { PageOutil } from './page-outil';
import { OutilSignal } from './outil-signal';
import { OutilPartage } from './outil-partage';
import { PanneauVehicule } from './panneau-vehicule';
import { MenuReglages } from './menu-reglages';
import { brancherAjoutFavori } from './choix-liste';
import { depuisFragmentLieu } from '../lib/partage-favoris';
import { ecrireRepere, REPERES, type CleRepere } from '../lib/reperes';
import { VisionneusePhoto } from './visionneuse-photo';
import { FicheBorne } from './fiche-borne';
import { FicheLieu } from './fiche-lieu';
import { BandeauGuidage } from './bandeau-guidage';
import { chercherPhotos, plusProche, ErreurPhotos } from '../lib/panoramax';
import { adresseInverse } from '../lib/adresse';
import { libelleDestination } from '../lib/adresse-lieu';
import { formaterCoordonnees } from '../lib/coordonnees';
import { coder, ErreurAdresseMots } from '../lib/adresse-mots';
import { communeDuPoint } from '../lib/commune';

// La métropole entière au premier regard : centre sur la France, zoom qui
// montre le pays sans le noyer. La géolocalisation est un GESTE de
// l'utilisateur (bouton), jamais une demande à l'arrivée — RGPD by design.
const CENTRE_FRANCE: [number, number] = [2.4, 46.6];

export function creerCarte(conteneur: HTMLElement): CarteMapLibre {
  const carte = new CarteMapLibre({
    container: conteneur,
    style: styleCarte({ fond: 'plan' }),
    center: CENTRE_FRANCE,
    zoom: 5.4,
    minZoom: 4,
    maxZoom: 19,
    locale: LOCALE_FR,
    /* LES LIENS LÉGAUX VIVENT DANS L'ATTRIBUTION (30/08). Armelin : « le
       cartouche À propos / Professionnels / Vie privée / Mentions légales
       est affiché un peu haut dans la fenêtre au lieu d'être tout en bas.
       Ce serait bien de le cacher dans le bouton "i" afin que cela ne
       s'affiche que lorsqu'on clique dessus. » C'est exactement la place de
       ces liens : la même bulle que la source des données, derrière le même
       « i ». Le pied de page autonome reste dans le HTML pour qui n'a pas
       JavaScript — il s'efface dès que la carte est là. */
    attributionControl: {
      compact: true,
      customAttribution: [
        '<a href="/a-propos.html">À propos</a>',
        '<a href="/offre-flottes.html">Professionnels</a>',
        '<a href="/vie-privee.html">Vie privée</a>',
        '<a href="/mentions-legales.html">Mentions légales</a>',
      ],
    },
  });

  /* LES COMMANDES DE VUE VONT EN BAS À DROITE, le menu reste SEUL en haut.
     Mêler « où je regarde » et « ce que j'affiche » dans une même colonne
     obligeait l'œil à trier ; les cartes grand public séparent les deux. */
  /* LES BOUTONS + ET − N'EXISTENT PLUS SUR ÉCRAN TACTILE. Armelin, le
     29/08 : « les boutons + et − n'ont pas leur place sur un écran tactile
     où tout le monde est habitué à zoomer avec les doigts. Je pense qu'on
     peut faire disparaître ces deux boutons. » Il a raison — et ils
     coûtaient deux fois : de la place, et le chevauchement avec la barre du
     trajet. La BOUSSOLE reste : elle ne se remplace par aucun geste, et
     c'est elle qui redresse une carte tournée par erreur. */
  carte.addControl(new NavigationControl({
    visualizePitch: true, showZoom: false, showCompass: true,
  }), 'bottom-right');

  /* QUAND LE SYSTÈME REPREND LA CARTE : la perte de contexte WebGL (CARTE-1,
     01/09).
     LE TERRAIN. Armelin, après un essai à pied : « quand un trajet est
     terminé, la cartographie affiche une page noire et plus aucune carte ne
     s'affiche ». Les boutons, l'échelle et la boussole restaient là — ils
     vivent DANS le conteneur de la carte — mais le canevas ne dessinait plus
     rien.
     LA CAUSE EST DANS MAPLIBRE, et elle est documentée : à la perte du
     contexte WebGL, `_contextLost` DÉTRUIT le style (`this.style = null`) et
     attend `webglcontextrestored` pour le reconstruire. Un téléphone qui
     reprend sa mémoire graphique après une longue navigation — écran allumé,
     GPU occupé — provoque exactement cela. Mesuré du côté de l'application :
     `isStyleLoaded()` faux, zéro calque, canevas noir.
     CE QU'ON PEUT FAIRE, ET CE QU'ON NE PEUT PAS. On ne rend pas un contexte
     que le système a repris ; c'est lui qui le rend, quand il le veut. Mais
     un rectangle noir SANS UN MOT est le pire des deux : il fait croire à une
     application cassée là où il s'agit d'une reprise de mémoire. On le dit
     donc, et on offre la seule issue sûre — recharger. L'itinéraire vit dans
     l'adresse (`#iti=…`) : le rechargement ne le perd pas. */
  const perdue = document.createElement('div');
  perdue.className = 'carte-perdue';
  perdue.hidden = true;
  perdue.setAttribute('role', 'alert');
  const motPerdue = document.createElement('p');
  motPerdue.textContent = 'Le système a repris la mémoire graphique : la carte'
    + ' ne peut plus se dessiner. Votre itinéraire est conservé.';
  const boutonPerdue = document.createElement('button');
  boutonPerdue.type = 'button';
  boutonPerdue.className = 'carte-perdue-recharger';
  boutonPerdue.textContent = 'Recharger la carte';
  /* ON VIDE LE CACHE AU PASSAGE (VERSION-1) : un simple `reload()` peut
     revenir sur le même paquet servi par le service worker. Si le noir venait
     d'un paquet périmé plutôt que de la mémoire graphique, ce bouton doit
     aussi en sortir. */
  boutonPerdue.addEventListener('click', () => {
    void forcerMiseAJour().finally(() => { window.location.reload(); });
  });
  const versionPerdue = document.createElement('p');
  versionPerdue.className = 'carte-perdue-version';
  versionPerdue.textContent = libelleVersion(VERSION);
  perdue.append(motPerdue, boutonPerdue, versionPerdue);
  /* SUR LE BODY, PAS DANS LE CONTENEUR (BLANC-1, 04/09) : #carte crée son
     propre contexte d'empilement — un z-index de 1000 À L'INTÉRIEUR reste
     sous l'en-tête, frère à 20. C'est ainsi que l'alerte s'est retrouvée
     enterrée sous l'interface de guidage, et l'écran de fin de trajet est
     resté blanc sans porte de sortie. */
  document.body.appendChild(perdue);

  /* CLIQUER DANS LE VIDE REFERME (ERGO-4, 02/09). Un collègue d'Armelin :
     « ce n'est pas pratique de cliquer sur le même bouton pour fermer le menu
     ouvert. Il préconise que ce soit aussi possible de fermer une fenêtre
     ouverte en cliquant dans le vide sur la carte. Ce qui laisserait deux
     moyens d'accès pour fermer un menu. » Armelin le reprend à son compte.
     DANS LE VIDE, ET PAS SUR UN POINT : c'est sa formulation, et elle protège
     un usage réel — cocher une couche, inspecter un point, en cocher une
     autre. Fermer le panneau au premier POI cliqué casserait ce va-et-vient.
     On ne referme donc que si le clic ne touche AUCUNE de nos couches.
     LES ÉTIQUETTES IGN NE COMPTENT PAS : ce sont des noms de villes et des
     numéros de route, dessinés par le fond ; cliquer dessus, c'est cliquer
     dans le vide. */
  /* ON ÉNUMÈRE LE FOND, PAS NOS COUCHES, et c'est la leçon d'un premier jet
     raté. La liste « poi-, iti-, trafic-, bg- » oubliait `filtre-poi-points`,
     `itineraire-trait` et `variantes-trait` — un parcours l'a montré en
     refermant le menu sur un clic de POI. Une liste de CE QU'ON POSSÈDE se
     périme au prochain calque ajouté ; une liste du FOND, elle, ne bouge que
     si l'on change de fond. Tout ce qui n'est pas le fond est à nous. */
  const FOND = /^(num-route-|toponyme-)/;
  carte.on('click', (e) => {
    const surQuelqueChose = carte.queryRenderedFeatures(e.point)
      .some((f) => !FOND.test(f.layer.id));
    if (surQuelqueChose) return;
    refermerPanneaux(document);
  });

  carte.on('webglcontextlost', () => { perdue.hidden = false; });
  /* ET S'IL LA REND, ON SE TAIT : MapLibre réapplique alors le style, ce qui
     rejoue `style.load` — les étiquettes, le tracé, les bornes et les POI se
     reposent d'eux-mêmes, chacun ayant déjà ce contrat pour le changement de
     fond. Rien de plus à faire ici que d'effacer le message. */
  carte.on('webglcontextrestored', () => { perdue.hidden = true; });

  /* LA CARTE QUI SE TAIT SANS PRÉVENIR (RETOUR-0409). Armelin, capture à
     l'appui : « à la fin d'un trajet, j'ai une page blanche qui s'affiche.
     Impossible de faire revenir la carte, il faut rafraîchir la fenêtre ».
     BLANC-1 ne couvrait que la perte de contexte WebGL — canevas NOIR,
     événement `webglcontextlost`, voile ci-dessus. Ici le canevas est BLANC,
     l'interface vit, aucune exception (le filet de main.ts n'a rien vu),
     aucun événement — et rien ne le disait. LA CAUSE N'EST PAS REPRODUITE ;
     ce qu'on peut faire sans elle, c'est REGARDER : toutes les cinq secondes,
     le style est-il encore là ? les tuiles arrivent-elles encore ? Un style
     disparu se dit tout de suite ; des tuiles qui n'arrivent plus depuis
     quarante-cinq secondes EN LIGNE se disent aussi — en bandeau refermable,
     pas en voile : un réseau lent n'est pas une casse, et c'est l'usager qui
     tranche. La porte de sortie est celle de partout : recharger,
     l'itinéraire vivant dans l'adresse. */
  const muette = document.createElement('div');
  muette.className = 'carte-muette';
  muette.hidden = true;
  muette.setAttribute('role', 'alert');
  const motMuette = document.createElement('p');
  const boutonMuette = document.createElement('button');
  boutonMuette.type = 'button';
  boutonMuette.className = 'carte-muette-recharger';
  boutonMuette.textContent = 'Recharger la carte';
  boutonMuette.addEventListener('click', () => {
    boutonMuette.disabled = true;
    void forcerMiseAJour().finally(() => { window.location.reload(); });
  });
  const fermerMuette = document.createElement('button');
  fermerMuette.type = 'button';
  fermerMuette.className = 'carte-muette-fermer';
  fermerMuette.textContent = '✕';
  fermerMuette.setAttribute('aria-label', 'Fermer cet avertissement');
  fermerMuette.addEventListener('click', () => { muette.hidden = true; });
  muette.append(motMuette, boutonMuette, fermerMuette);
  document.body.appendChild(muette);
  let tuilesMuettesDepuis: number | null = null;
  const surveiller = (): void => {
    if (!muette.hidden) return;
    let style: unknown;
    try { style = carte.getStyle(); } catch { style = undefined; }
    /* UN STYLE SANS AUCUN CALQUE VAUT UN STYLE PERDU (RETOUR-0409b) : c'est
       l'état qu'une reprise de contexte WebGL ratée laisse derrière elle —
       MapLibre repose le style, et si ce qui suit casse, il ne reste rien à
       dessiner, sans un événement pour le dire. */
    const calques = (style as { layers?: unknown[] } | undefined)?.layers;
    if (style === undefined || (Array.isArray(calques) && calques.length === 0)) {
      motMuette.textContent = 'La carte a perdu son style et ne se dessine plus.'
        + ' Votre itinéraire est conservé.';
      muette.hidden = false;
      return;
    }
    if (navigator.onLine && !carte.areTilesLoaded()) {
      tuilesMuettesDepuis ??= Date.now();
      if (Date.now() - tuilesMuettesDepuis >= 45_000) {
        motMuette.textContent = 'La carte ne reçoit plus ses tuiles depuis 45 secondes.'
          + ' Si elle reste blanche, rechargez : votre itinéraire est conservé.';
        muette.hidden = false;
      }
    } else {
      tuilesMuettesDepuis = null;
    }
  };
  window.setInterval(surveiller, 5_000);

  /* LE MODE SOMBRE DU FOND PLAN est un filtre CSS sur le canevas — le
     vectoriel ferait mieux, mais il exigerait glyphes et sprites hébergés ;
     le filtre inversé bien réglé rend le Plan IGN parfaitement lisible de
     nuit, et le satellite reste intouché (inverser une photo n'a pas de
     sens). Décision documentée : on repassera au vectoriel si le besoin
     dépasse ce rendu. */
  const sombre = window.matchMedia('(prefers-color-scheme: dark)');
  /* LE FILTRE DU CANEVAS PREND LA MÊME DÉCISION QUE LE CSS (THEME-1, 03/09) :
     le choix de l'usager d'abord, le système ensuite. Deux décisions séparées
     finiraient par diverger — carte claire sous interface sombre, l'écart
     qu'on met des semaines à revoir. */
  const appliquerSombre = (o: OptionsStyle) => {
    conteneur.classList.toggle('fond-sombre',
      estSombre(themeCourant(), sombre.matches) && o.fond === 'plan');
  };

  /* LE MENU DES RÉGLAGES — un seul point d'entrée en haut à droite. Les
     couches d'information, les lieux enregistrés et le fond de carte y sont
     RANGÉS plutôt qu'exposés : six pastilles de même poids ne hiérarchisaient
     rien, et le rail débordait de l'écran dès qu'un volet s'ouvrait. À gauche
     ne reste que ce qui concerne le TRAJET. */
  const menu = new MenuReglages();
  const porteMenu = document.createElement('div');
  porteMenu.className = 'maplibregl-ctrl porte-menu';
  porteMenu.appendChild(menu);
  // Le contrôle est POSÉ PLUS BAS (après la géolocalisation) : voir le
  // commentaire à son ajout. L'objet, lui, existe dès maintenant car les
  // panneaux viennent s'y ranger au fil de leur création.

  /* LE PLANIFICATEUR — à gauche : c'est LA fonction d'une carte d'itinéraire. */
  const panneau = new PanneauItineraire();
  panneau.carte = carte;
  const porteIti = document.createElement('div');
  porteIti.className = 'maplibregl-ctrl porte-iti';
  porteIti.appendChild(panneau);
  carte.addControl({ onAdd: () => porteIti, onRemove: () => porteIti.remove() }, 'top-left');

  /* LE FOND DE CARTE est une PRÉFÉRENCE D'AFFICHAGE : il appartient au menu,
     pas au rail des destinations. */
  const selecteur = new SelecteurFonds();
  /* LES ÉTIQUETTES SE POSENT APRÈS LE STYLE (FOND-2, 01/09), comme le tracé,
     les bornes et les POI. Déclarées DANS le style initial, elles restaient
     invisibles en production — la source ne se remplissait pas, sans une
     erreur pour le dire, alors qu'un simple `setStyle(getStyle())` les faisait
     toutes paraître. Le style était juste ; c'est le moment qui ne l'était
     pas. `style.load` se déclenche aussi à chaque changement de fond, ce qui
     les repose sans qu'on y pense. */
  let fondCourant: Fond = 'plan';
  let relief3d = false;
  const poserEtiquettes = (): void => {
    /* LES ÉCUSSONS DE ROUTE D'ABORD (FOND-6, 02/09) : un calque qui réclame
       une image absente se dessine sans elle — le numéro paraîtrait nu, et
       l'on chercherait longtemps pourquoi. Ils se posent AVANT les calques
       qui les nomment, et à chaque `style.load` comme tout le reste : un
       changement de fond vide le registre d'images. */
    for (const style of CARTOUCHES) {
      if (carte.hasImage(style.cle)) continue;
      const image = imageCartouche(style);
      /* SANS CANEVAS 2D, ON N'EN POSE AUCUN et `icon-optional` fait son
         office : le numéro s'écrit nu, comme avant FOND-6. */
      if (image) carte.addImage(style.cle, image, zonesEtirables(2));
    }
    if (carte.getSource(SOURCE_ETIQUETTES) === undefined) {
      carte.addSource(SOURCE_ETIQUETTES, sourceEtiquettes());
    }
    for (const calque of calquesEtiquettes(fondCourant, relief3d)) {
      if (carte.getLayer(calque.id) === undefined) carte.addLayer(calque);
    }
  };
  carte.on('style.load', poserEtiquettes);

  selecteur.surChangement = (o) => {
    fondCourant = o.fond;
    /* LE RELIEF SUIT LE STYLE : `setStyle` efface tout, et `style.load`
       repose la surcouche — c'est déjà le chemin des étiquettes depuis
       FOND-2, et le calque 3D emprunte le même. */
    relief3d = o.relief3d === true;
    carte.setStyle(styleCarte(o));
    appliquerSombre(o);
    /* ET LA CAMÉRA S'INCLINE (FOND-5, 02/09). À plat, une extrusion ne se
       voit pas : on regarde les toits par-dessus, et la case paraîtrait sans
       effet. On ne redresse au nord QUE si l'on vient de décocher — pendant
       un guidage, la caméra a ses propres raisons d'être inclinée, et lui
       imposer le zéro couperait le suivi sous le conducteur. */
    if (relief3d) {
      if (carte.getPitch() < INCLINAISON_RELIEF) {
        carte.easeTo({ pitch: INCLINAISON_RELIEF, duration: 600 });
      }
    } else if (carte.getPitch() >= INCLINAISON_RELIEF) {
      carte.easeTo({ pitch: 0, duration: 600 });
    }
  };
  menu.ajouter('Affichage', selecteur);

  /* LE FOND DE CARTE PENDANT LE SUIVI (FOND-NAV-1, 05/09). Les amis
     d'Armelin : « en mode navigation, il n'y a pas de petite pastille ronde
     permettant de gérer les fonds de carte, car cette option n'est disponible
     que dans le menu, masqué pendant la navigation. Un bouton dédié au-dessus
     de la boussole. » NAV-2 efface le menu en suivi — et avec lui le
     sélecteur. Un bouton rond de la colonne de droite ouvre une feuille où le
     MÊME sélecteur vient se poser (déplacé, pas dupliqué : une seule vérité
     sur le fond, une seule préférence), et le rend au menu en se refermant.
     Le bouton n'existe qu'en suivi (CSS) : hors suivi, le menu suffit. */
  const nidSelecteur = selecteur.parentElement;
  const porteFondsNav = document.createElement('div');
  porteFondsNav.className = 'maplibregl-ctrl porte-fonds-nav';
  const boutonFondsNav = document.createElement('button');
  boutonFondsNav.type = 'button';
  boutonFondsNav.className = 'fonds-nav';
  boutonFondsNav.setAttribute('aria-label', 'Fond de carte');
  boutonFondsNav.setAttribute('aria-expanded', 'false');
  boutonFondsNav.innerHTML = pictoMenu('fonds');
  porteFondsNav.appendChild(boutonFondsNav);
  const feuilleFonds = document.createElement('div');
  feuilleFonds.className = 'fonds-nav-feuille';
  feuilleFonds.hidden = true;
  feuilleFonds.setAttribute('role', 'dialog');
  feuilleFonds.setAttribute('aria-label', 'Fond de carte');
  const fermerFonds = document.createElement('button');
  fermerFonds.type = 'button';
  fermerFonds.className = 'fonds-nav-fermer';
  fermerFonds.textContent = 'Fermer';
  feuilleFonds.appendChild(fermerFonds);
  /* SUR LE BODY : #carte crée son contexte d'empilement (leçon BLANC-1). */
  document.body.appendChild(feuilleFonds);
  const rangerFonds = (): void => {
    if (feuilleFonds.hidden) return;
    feuilleFonds.hidden = true;
    boutonFondsNav.setAttribute('aria-expanded', 'false');
    selecteur.removeAttribute('deplie');
    nidSelecteur?.appendChild(selecteur);
  };
  boutonFondsNav.addEventListener('click', (e) => {
    /* LE CLIC S'ARRÊTE ICI : le « clic extérieur qui referme » (panneaux.ts)
       écoute le document et refermait le volet qu'on venait d'ouvrir —
       mesuré : details.open repassait à faux dans la même frappe. */
    e.stopPropagation();
    if (!feuilleFonds.hidden) { rangerFonds(); return; }
    /* L'ATTRIBUT AVANT LE DÉPLACEMENT : déplacer un composant rejoue son
       connectedCallback, qui RE-REND le volet — replié. Mesuré : `open` posé
       après coup repassait à faux. Le sélecteur lit l'attribut au rendu. */
    selecteur.setAttribute('deplie', '');
    feuilleFonds.insertBefore(selecteur, fermerFonds);
    const volet = selecteur.querySelector<HTMLDetailsElement>('details.fonds');
    if (volet) volet.open = true;
    feuilleFonds.hidden = false;
    boutonFondsNav.setAttribute('aria-expanded', 'true');
  });
  /* Et les clics DANS la feuille ne referment rien non plus. */
  feuilleFonds.addEventListener('click', (e) => { e.stopPropagation(); });
  fermerFonds.addEventListener('click', rangerFonds);
  carte.addControl({ onAdd: () => porteFondsNav, onRemove: () => porteFondsNav.remove() }, 'bottom-right');

  /* LE THÈME JOUR / NUIT (THEME-1, 03/09). Armelin : « par défaut je suis en
     carte mode nuit, mais je n'ai pas la possibilité de changer ce
     paramétrage du navigateur en plein écran de l'application PWA ». Une PWA
     installée n'a AUCUN réglage de navigateur sous la main : le choix doit
     vivre ici. « Auto » reste le défaut — celui qui aime suivre son téléphone
     continue de le suivre. */
  const boiteTheme = document.createElement('div');
  boiteTheme.className = 'reglages-theme';
  boiteTheme.setAttribute('role', 'radiogroup');
  boiteTheme.setAttribute('aria-label', 'Thème de l’application');
  for (const th of THEMES) {
    const l = document.createElement('label');
    l.className = 'reglages-theme-choix';
    const r = document.createElement('input');
    r.type = 'radio'; r.name = 'theme'; r.value = th;
    r.checked = themeCourant() === th;
    r.addEventListener('change', () => { garderTheme(th); });
    const mot = document.createElement('span');
    mot.textContent = LIBELLES_THEME[th];
    l.append(r, mot);
    boiteTheme.append(l);
  }
  /* LA RESTAURATION EST ASYNCHRONE et peut arriver après la construction du
     menu : les coches se recalent à chaque changement, d'où qu'il vienne. */
  document.addEventListener('theme-change', () => {
    boiteTheme.querySelectorAll('input').forEach((r) => {
      r.checked = r.value === themeCourant();
    });
  });
  menu.ajouter('Thème', boiteTheme);


  /* LES BORNES ET LES SERVICES SONT UNE PAGE DU PLANIFICATEUR.
     D'abord passés à gauche le 26/08 — « la recherche de point de charge
     devrait être dans le menu de gauche » — ils y formaient un TROISIÈME
     bouton. Armelin, le lendemain : « un seul bouton est plus efficace à
     comprendre que trois boutons où il faudra se rappeler dans quel menu on
     peut trouver quelle option ». Le rail ne porte donc plus qu'une entrée.

     Ce qui suit reste vrai et explique pourquoi ils ne sont pas dans le menu
     de droite :
     Armelin, le 25/08/2026 : « la recherche de point de charge devrait être
     dans le menu de gauche », et « jongler entre le menu de gauche et celui de
     droite nuit à l'ergonomie ». Il a raison, et la raison est plus profonde
     qu'un déplacement de bouton : chercher une borne n'est PAS régler
     l'affichage de la carte, c'est préparer un trajet. Ranger cette recherche
     avec le fond de carte et les couches de trafic obligeait à traverser
     l'écran entre deux gestes qui appartiennent à la même intention.

     Les stations-service et les parkings suivent : ce sont, comme les bornes,
     des endroits où l'on s'arrête en route. Le menu de droite garde ce qui
     répond vraiment à « que voir sur la carte » — le fond, le trafic, les
     et « mes lieux ». Les transports en commun ONT EXISTÉ ici (PR #16) et
     ont été RETIRÉS le 29/08/2026, sur décision d'Armelin après essai :
     « je ne vois aucun véhicule circuler sur la carte » — une couche qu'on
     ne voit pas vivre alourdit le menu sans informer. Le retrait est
     complet (panneau, GTFS-RT, annuaire des réseaux, tests) : le code
     reste dans l'histoire git si le besoin renaît. */
  const poi = new PanneauPoi();
  poi.carte = carte;
  /* LE MODE TRAJET DU PLANIFICATEUR SAIT EFFACER LES BORNES NATIONALES : quand
     un plan de recharge est à l'écran, seules restent les bornes du corridor. */
  panneau.couchesBornes = poi;
  // BORNES-2 : un filtre d'affichage changé redessine les bornes du trajet.
  poi.surFiltresChanges = () => { panneau.reposerBornesTrajet(); };

  const trafic = new PanneauTrafic();
  trafic.carte = carte;
  menu.ajouter('', trafic);

  /* MESURER UNE DISTANCE (MESURE-1, 05/09). Des amis d'Armelin : « des
     outils dans le menu : mesurer une distance A→B, un parcours dessiné point
     à point ». Un volet du menu, un relevé flottant, des points au doigt :
     tout se calcule ici, rien ne part. Sans étiquette de section : le menu
     est une fenêtre haute comme son contenu, et chaque rangée compte sur un
     téléphone (le garde-fou de feuilles-basses le mesure). */
  /* DES TUILES, ET DES PAGES PLEIN ÉCRAN (OUTILS-2, 06/09). Armelin : « une
     clé à molette […] cliquer sur Outils et afficher uniquement des icônes
     […] cliquer sur une icône lance la page en entier ». La page vit sur le
     body (contexte d'empilement de #carte, leçon BLANC-1) ; chaque outil lui
     confie son contenu. Mesurer reste sur la carte : la carte EST l'outil. */
  const outils = new OutilsMenu();
  menu.ajouter('', outils);
  const pageOutil = new PageOutil();
  document.body.appendChild(pageOutil);
  const mesure = new OutilMesure();
  mesure.carte = carte;
  document.body.appendChild(mesure);
  const meteoVille = new OutilMeteo();
  const signal = new OutilSignal();
  const partage = new OutilPartage();
  outils.ajouter({ cle: 'mesure', libelle: 'Mesurer', picto: 'mesure', action: () => { mesure.demarrer(); } });
  outils.ajouter({ cle: 'meteo', libelle: 'Météo', picto: 'meteo', action: () => {
    pageOutil.ouvrir('Météo d’une ville', meteoVille);
    meteoVille.preparer();
  } });
  outils.ajouter({ cle: 'signal', libelle: 'Signal GPS', picto: 'satellite', action: () => {
    pageOutil.ouvrir('Signal GPS', signal);
    signal.demarrer();
  } });
  outils.ajouter({ cle: 'partage', libelle: 'Ma position', picto: 'partage-position', action: () => {
    pageOutil.ouvrir('Partager ma position', partage);
  } });
  /* Le relevé GPS s'arrête avec la page : rien ne tourne dans le dos. */
  pageOutil.addEventListener('page-fermee', () => { signal.arreter(); });

  /* LE FILTRE DES LIEUX, À MÊME LA CARTE (POI-2, 30/08). Armelin : « ce
     serait bien d'afficher quelque part sur la carte une icône pour afficher
     les POI comme un filtre […] que l'utilisateur puisse configurer
     rapidement un filtre pour choisir les POI qu'il souhaite voir autour de
     lui ». Ce qu'on cherche autour de soi se décide EN REGARDANT la carte :
     il vit donc sur la carte, pas au fond d'un menu. */
  /* IL VIT DANS L'EMPILEMENT « top-left » DE MAPLIBRE, et non posé en absolu
     par-dessus (défaut du 31/08 : « en mode desktop, le bouton de filtre est
     superposé sur le bouton itinéraire »). Le planificateur EST un contrôle
     top-left ; mon `top`/`left` en dur visait donc exactement sa place, et
     tombait dessus dès que la fenêtre changeait de taille. Confié au même
     empilement, il se range dessous tout seul, sur tous les écrans. */
  const filtrePoi = new FiltrePoi();
  const portePoi = document.createElement('div');
  portePoi.className = 'maplibregl-ctrl';
  portePoi.appendChild(filtrePoi);
  carte.addControl({ onAdd: () => portePoi, onRemove: () => portePoi.remove() }, 'top-left');
  filtrePoi.carte = carte;
  /* LES FILTRES DE RECHARGE VIVENT DANS L'ENTONNOIR (ERGO-3, 02/09), et non
     plus dans le planificateur : ce sont des filtres de POI, ils se règlent
     là où se règlent les filtres de POI. Le planificateur y gagne une entrée
     de moins à faire défiler — le but même de la remarque du collègue
     d'Armelin, qu'il a reprise à son compte. */
  filtrePoi.logerRecharge(poi);
  // « Y ALLER » DEPUIS LA FICHE D'UN LIEU (LIEUX-1, 31/08) : la même porte
  // que la fiche de borne, pas un second chemin à maintenir.
  filtrePoi.porteItineraire = panneau;
  /* LES BARRES DE RECHERCHE APPRENNENT OÙ L'ON REGARDE (RECHERCHE-2) : c'est
     ce qui borne la recherche par nom à la vue, et ce qui lui permet de
     REFUSER poliment quand elle est trop large. POSÉ UNE FOIS POUR TOUTES,
     y compris pour les barres d'étapes qui naîtront plus tard. */
  poserEmpriseCourante(() => {
    const centre = carte.getCenter();
    const b = carte.getBounds();
    return {
      lon: centre.lng,
      lat: centre.lat,
      emprise: {
        ouest: b.getWest(), sud: b.getSouth(), est: b.getEast(), nord: b.getNorth(),
      },
    };
  });
  /* LA PUCE « BORNES DE RECHARGE » (BORNES-4) : le volet des services garde
     la couche, la puce n'est qu'un second interrupteur — et chacun tient
     l'autre au courant. */
  filtrePoi.porteBornes = {
    basculer: (actif) => { poi.basculerBornes(actif); },
    active: () => poi.bornesActives,
    toutAfficher: () => { poi.toutAfficher(); },
  };
  /* LES FAVORIS SUR LA CARTE (MES-POI-1, 04/09) : l'émoji de leur liste,
     visibles d'emblée — la puce « Mes POI » de l'entonnoir les range. */
  const mesPoi = new MesPoi();
  mesPoi.poser(carte, panneau);
  filtrePoi.porteMesPoi = {
    basculer: (visible) => { mesPoi.basculer(visible); },
    active: () => mesPoi.visible(),
  };
  mesPoi.surVisibilite = (visible) => { filtrePoi.majMesPoi(visible); };
  poi.surCouchesChangees = (actives) => { filtrePoi.majBornes(actives.has('bornes')); };
  poi.surFiltresBornes = (resume) => { filtrePoi.majFiltresBornes(resume); };
  filtrePoi.majFiltresBornes(poi.resumeFiltres);
  /* UN LIEN « PARTAGE FACILE » REÇU (FICHE-3, 01/09) : la carte s'ouvre sur
     le lieu, fiche dépliée — celui qui reçoit n'a rien à chercher. */
  const lieuRecu = depuisFragmentLieu(location.hash);
  if (lieuRecu) {
    carte.once('load', () => {
      carte.jumpTo({ center: [lieuRecu.lon, lieuRecu.lat], zoom: 16 });
      filtrePoi.montrerLieuPartage(lieuRecu);
    });
  }


  /* LA VISIONNEUSE DE PHOTOS — une seule pour l'application, posée au body :
     une modale doit couvrir la carte, pas vivre dedans. */
  const visionneuse = new VisionneusePhoto();
  document.body.appendChild(visionneuse);

  /* LE CARTOUCHE DE DÉTAIL D'UNE BORNE — UN SEUL pour l'application, posé au
     conteneur de la carte. Deux appelants s'en servent : un clic sur une
     punaise, et un clic sur un arrêt du plan de recharge. Le partager plutôt
     que d'en donner un à chacun garantit qu'il n'y en a jamais deux ouverts,
     et que le second clic remplace le premier au lieu de l'empiler. */
  const fiche = new FicheBorne();
  fiche.carte = carte;
  conteneur.appendChild(fiche);
  poi.fiche = fiche;
  panneau.fiche = fiche;
  /* ET LE CARTOUCHE SAIT DEMANDER UN ITINÉRAIRE. Sans ce lien, la liste des
     commerces alentour se lisait sans qu'on puisse s'y rendre. */
  fiche.itineraire = panneau;

  /* LE CARTOUCHE DES LIEUX D'EXCEPTION — le retour d'Armelin du 27/08 au
     soir : « impossible de cliquer dessus pour avoir le détail à l'identique
     d'une station de recharge ». Même règles que la fiche de borne, et les
     deux se rangent l'un l'autre : un seul cartouche ouvert à la fois. */
  const ficheLieu = new FicheLieu();
  ficheLieu.carte = carte;
  conteneur.appendChild(ficheLieu);
  ficheLieu.itineraire = panneau;
  ficheLieu.detourPar = (lieu) => { panneau.detourParLieu(lieu); };
  ficheLieu.homologue = fiche;
  fiche.homologue = ficheLieu;
  panneau.ficheLieu = ficheLieu;

  /* LE BANDEAU DE SUIVI — un seul, posé au conteneur de la carte. Il occupe le
     bas de l'écran pendant le trajet : c'est la zone qu'on regarde le moins
     longtemps, donc celle qui convient à trois lignes qu'on lit d'un coup. */
  const guidage = new BandeauGuidage();
  guidage.carte = carte;
  guidage.addEventListener('guidage-arrete', rangerFonds);
  conteneur.appendChild(guidage);
  panneau.guidage = guidage;

  /* LE VÉHICULE ÉLECTRIQUE — profil et rayon d'action. Tout reste local :
     batterie, santé, charge, relevés d'autonomie ne sortent jamais du
     navigateur, et aucun compte n'est demandé. */
  const vehicule = new PanneauVehicule();
  vehicule.carte = carte;
  panneau.loger('vehicule', vehicule);

  /* LES LIEUX ENREGISTRÉS — favoris, domicile, travail, et l'export RGPD. */
  const favoris = new PanneauFavoris();
  favoris.carte = carte;
  menu.ajouter('Mes lieux', favoris);

  /* L'HISTORIQUE REJOINT LE MENU (ERGO-4, 02/09), demandé deux fois. On le
     consulte SANS avoir planifié quoi que ce soit — c'est même à cela qu'il
     sert, comparer d'une semaine à l'autre. Le ranger derrière « Itinéraire »
     supposait un trajet en cours ; et son départ y libère la place qu'Armelin
     réclame : « que tout le menu s'affiche en entier à l'écran ». */
  const historique = new PanneauHistorique();
  /* ET IL SAIT RELANCER (HIST-2, 02/09) : « aucun moyen de relancer le même
     trajet depuis l'historique ». Le planificateur lui est passé ici, comme
     aux cartouches de lieux — l'historique ne le cherche pas dans le document,
     il le reçoit. */
  historique.itineraire = panneau;
  menu.ajouter('', historique);

  /* LA VERSION VA TOUT EN BAS (ERGO-4, 02/09). Armelin : « la version est
     affichée en plein milieu des options. Il faudrait que la section Version
     soit affichée tout en bas et laisser les menus Fonds, Trafic et Favoris
     au-dessus. » Il a raison : on ouvre ce menu pour régler l'affichage, pas
     pour lire un numéro de version — celui-ci se consulte une fois, quand on
     doute. Le poser au milieu, c'était le faire lire à tout le monde à chaque
     ouverture. */
  /* LA VERSION SE LIT, ET LA MISE À JOUR SE FORCE (VERSION-1, 02/09).
     Armelin, devant un écran noir : « je ne sais pas si j'ai la bonne version
     en cache ». Il avait raison de douter — une PWA garde son paquet jusqu'à
     ce que le service worker cède la place, et rien ne disait laquelle
     tournait.
     DANS LE MENU, ET NON DANS LA BULLE « i » : c'était mon premier jet, et
     MapLibre RECONSTRUIT sa bulle d'attribution à chaque changement de
     contenu — elle se refermait sous le doigt, mesuré au parcours. Le menu
     est un composant qu'on maîtrise, et il reste tout aussi atteignable quand
     la carte ne se dessine plus : il vit dans l'en-tête, pas dans le canevas. */
  const boiteVersion = document.createElement('div');
  boiteVersion.className = 'reglages-version';
  const motVersion = document.createElement('p');
  motVersion.className = 'reglages-version-mot';
  motVersion.textContent = libelleVersion();
  const majVersion = document.createElement('button');
  majVersion.type = 'button';
  majVersion.className = 'reglages-maj';
  majVersion.textContent = 'Mettre à jour l’application';
  majVersion.addEventListener('click', () => {
    majVersion.disabled = true;
    majVersion.textContent = 'Mise à jour…';
    void forcerMiseAJour().finally(() => { window.location.reload(); });
  });
  const notePlus = document.createElement('p');
  notePlus.className = 'reglages-version-note';
  notePlus.textContent = 'Vide le cache et recharge la dernière version'
    + ' publiée. Vos favoris et votre historique ne sont pas touchés.';
  /* MAPS PRO, UNE LIGNE DANS LA BOÎTE DE LA VERSION (PRO-LIENS-1, 05/09).
     Armelin : « un lieu dans le menu indiquant un bouton Maps Pro qui emmène
     vers la landing page ». Une section à part faisait déborder la fenêtre
     du menu sous les polices de la CI (feuilles-basses : ≤ 62 % de l'écran ;
     puis le sélecteur de fonds passait hors de portée du clic). La ligne vit
     donc dans la boîte qui existe déjà, tout en bas, près de la version —
     un lien, jamais une fenêtre qui s'impose. */
  const lienPro = document.createElement('a');
  lienPro.className = 'reglages-pro-lien';
  lienPro.href = '/pro.html';
  lienPro.title = 'Cercles, véhicule connecté, itinéraires partagés, flottes';
  lienPro.textContent = 'Découvrir Maps Pro';
  /* VERSION ET LIEN PRO SUR LA MÊME RANGÉE (MESURE-1, 05/09) : le menu est
     une fenêtre haute comme son contenu, et le volet « Mesurer » lui a coûté
     une rangée. Mesuré : 160 px pour cette boîte, 524 px pour le menu sur un
     écran de 844 — un pixel au-dessus du garde-fou de feuilles-basses. */
  const teteVersion = document.createElement('div');
  teteVersion.className = 'reglages-version-tete';
  teteVersion.append(motVersion, lienPro);
  boiteVersion.append(teteVersion, majVersion, notePlus);
  menu.ajouter('Version', boiteVersion);


  /* UN SEUL volet ouvert à la fois, Échap et clic extérieur pour refermer.
     Le comportement vit dans panneaux.ts, et il reconnaît les volets de tête
     à leur STRUCTURE — un `<details>` sans `<details>` ancêtre — là où ce
     fichier portait une liste de sélecteurs codée en dur. La liste marchait,
     mais elle oubliait en silence tout panneau ajouté plus tard : le défaut
     n'apparaissait qu'à l'usage, sous la forme de deux volets ouverts
     ensemble. Les volets INTERNES du planificateur restent autonomes. */
  installerPanneaux(document);
  appliquerSombre(selecteur.options);
  sombre.addEventListener('change', () => appliquerSombre(selecteur.options));
  document.addEventListener('theme-change', () => appliquerSombre(selecteur.options));
  /* LA POSITION GPS EST DIFFUSÉE AUX PANNEAUX QUI EN ONT BESOIN. Les anneaux
     d'autonomie suivaient jusqu'ici le CENTRE DE LA CARTE : dès qu'on faisait
     glisser la carte, le rayon d'action se déplaçait avec elle, ce qui n'a
     aucun sens — il entoure la voiture, pas le regard. Signalé par Armelin
     capture à l'appui. */
  const geoloc = new GeolocateControl({
    positionOptions: { enableHighAccuracy: true },
    trackUserLocation: true,
  });
  /* LE VERROU DE CAMÉRA DU SUIVI GPS, SUIVI À LA TRACE (DEST-1, 03/09).
     En mode « verrouillé », chaque relevé GPS RECENTRE la carte — et un
     `flyTo` programmatique ne casse pas ce verrou : MapLibre ne le lève que
     sur un geste de l'usager (drag, molette). C'est la cause exacte du
     retour d'Armelin : « la carte zoome brièvement et dézoome aussitôt en
     restant sur ma position, sans aller sur le lieu sélectionné ». */
  let suiviVerrouille = false;
  geoloc.on('trackuserlocationstart', () => { suiviVerrouille = true; });
  geoloc.on('trackuserlocationend', () => { suiviVerrouille = false; });
  geoloc.on('geolocate', (e: unknown) => {
    const p = (e as { coords?: { longitude?: number; latitude?: number } }).coords;
    if (typeof p?.longitude === 'number' && typeof p?.latitude === 'number') {
      const point = { lon: p.longitude, lat: p.latitude };
      vehicule.position = point;
      /* ET LA RECHERCHE SAIT D'OÙ MESURER (RECHERCHE-7) : les distances des
         suggestions se comptent depuis la position quand on la connaît. Rien
         n'est demandé au GPS pour cela — on se sert de ce qu'on a. */
      poserPositionConnue(point);
      /* LE PLANIFICATEUR AUSSI. Une position deja connue lui sert de depart
         par defaut : on dit ou l'on va, le reste se deduit. Rien n'est
         demande au GPS pour cela — on se sert de ce qu'on a. */
      panneau.position = point;
    }
  });
  carte.addControl(geoloc, 'bottom-right');

  /* LE MENU EST SEUL EN HAUT À DROITE. Les commandes de vue (zoom, boussole,
     géolocalisation) sont descendues en bas de la même colonne : son panneau
     n'a donc plus rien à recouvrir, et le coin haut-droit ne porte qu'une
     seule chose. */
  carte.addControl({ onAdd: () => porteMenu, onRemove: () => porteMenu.remove() }, 'top-right');
  carte.addControl(new ScaleControl({ unit: 'metric' }), 'bottom-left');

  /* LA RECHERCHE vit dans l'en-tête (elle EST la fonction principale d'une
     carte) ; la sélection pose un marqueur, y vole, et OUVRE LA FICHE de la
     destination — mandat UX du 28/08 (PR UX-2) : un marqueur muet obligeait à
     retrouver le lieu dans le planificateur ou par appui long pour en faire
     quelque chose. Quatre gestes, tous DÉJÀ mesurés ailleurs dans
     l'application : y aller, garder, regarder, dicter. */
  const recherche = new RechercheAdresse();
  /* SEULE LA BARRE DU HAUT PREND L'ÉCRAN (RECHERCHE-7, 03/09) : « sur Google
     Maps, cela affiche une page de recherche en plein écran pour bénéficier de
     toute la surface ». Les champs du planificateur, eux, vivent déjà dans une
     feuille qui occupe l'écran — leur en superposer une seconde cacherait le
     trajet qu'on compose. */
  recherche.pleinEcran = true;
  /* LA COQUILLE D'ATTENTE MEURT ICI (PERF-1, 04/09) : elle tenait la place
     de la barre depuis le HTML, pour que le premier grand texte de la page
     paraisse avant le script. Le vrai composant prend SA PLACE DANS L'ORDRE
     — pas la fin de l'en-tête : mesuré au pixel par le parcours E2E, la barre
     ajoutée en dernier tombait sur une autre ligne du flex que la coquille
     (l'état de connexion s'intercale) et faisait 81 px de plus. Jamais deux
     barres, jamais aucune, et la même géométrie. */
  const attente = document.querySelector('.entete .recherche-attente');
  if (attente) attente.replaceWith(recherche);
  else document.querySelector('.entete')?.appendChild(recherche);
  let marqueur: Marker | null = null;
  /* LA DERNIÈRE DESTINATION CHOISIE : c'est elle que le marqueur rouvre.
     Armelin : « on devrait pouvoir réduire la fenêtre au niveau du pointeur
     et la faire réapparaître à la demande en recliquant sur le point ». */
  let derniereDestination: DestinationChoisie | null = null;
  /* RÉDUIRE N'EST PAS FERMER (DEST-2, 04/09). Armelin : « je ne peux pas
     réduire la fenêtre […] et quand je ferme la fenêtre du POI sélectionné,
     un point bleu apparaît à l'emplacement du POI mais ne disparaît pas ».
     DEST-1 avait fait de la croix une réduction — le marqueur restait en
     poignée — mais SANS le dire, et sans offrir l'autre geste. Désormais :
     « Réduire » garde la poignée, la croix efface tout. Le drapeau dit
     lequel des deux vient d'avoir lieu. */
  let reductionEnCours = false;
  function effacerMarqueur(): void {
    marqueur?.remove();
    marqueur = null;
    derniereDestination = null;
  }

  /* UNE SEULE FICHE À LA FOIS SUR LA CARTE (POPUP-1, 03/09).
     Armelin, premier retour de la 1.60 : « si je relance dans la foulée une
     autre requête, une nouvelle fenêtre s'ouvre sur la carte et les anciennes
     fenêtres ne sont jamais fermées. En pleine navigation, je peux croiser
     tous les gros rectangles ouverts correspondant à une fenêtre de recherche
     précédente. » Capture à l'appui : FNAC DARTY et Disney Village empilées.

     LA CAUSE : chaque sélection créait `new Popup(...)` sans rien retenir de
     la précédente. Le MARQUEUR, lui, était bien remplacé (`marqueur?.remove()`)
     — la fiche avait juste été oubliée du même geste.

     LA RÈGLE REJOINT CELLE DES VOLETS (« une seule surface à la fois »,
     lib/panneaux) : poser une fiche ferme celles d'avant, et le départ d'un
     itinéraire les efface toutes — on regarde la route, plus la recherche. */
  const fiches = new Set<Popup>();
  function poserFiche(p: Popup): void {
    for (const autre of fiches) autre.remove();
    fiches.clear();
    fiches.add(p);
    /* LA CROIX RESTE UN GESTE VALABLE : la fiche fermée à la main sort du
       registre, sinon on garderait des fantômes à « fermer » plus tard. */
    p.on('close', () => { fiches.delete(p); });
  }
  document.addEventListener('itineraire-lance', () => {
    for (const p of fiches) p.remove();
    fiches.clear();
    /* LE MARQUEUR DE RECHERCHE S'EFFACE AUSSI : la destination est désormais
       dessinée par le trajet lui-même — deux repères au même endroit se
       liraient comme deux lieux. */
    marqueur?.remove();
    marqueur = null;
  });

  /* LA LOUPE DU SUIVI (RECHERCHE-NAV-1, 05/09). Des amis d'Armelin : « en
     mode navigation, il n'y a pas de bouton rond loupe permettant de chercher
     une adresse, une borne, une station ou un restaurant et de l'ajouter en
     étape ». NAV-2 efface l'en-tête — et la barre avec. Un bouton rond de la
     colonne de droite rouvre la MÊME page de recherche plein écran (le
     composant ne bouge pas : la CSS rend l'en-tête visible le temps de la
     page) ; le lieu choisi devient une ÉTAPE du trajet en cours, et le suivi
     repart sur le nouveau tracé. Le bouton n'existe qu'en suivi (CSS). */
  const porteRechercheNav = document.createElement('div');
  porteRechercheNav.className = 'maplibregl-ctrl porte-recherche-nav';
  const boutonRechercheNav = document.createElement('button');
  boutonRechercheNav.type = 'button';
  boutonRechercheNav.className = 'recherche-nav';
  boutonRechercheNav.setAttribute('aria-label', 'Chercher une étape');
  boutonRechercheNav.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none"'
    + ' stroke="currentColor" stroke-width="2.4" stroke-linecap="round">'
    + '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m20 20-4.8-4.8"/></svg>';
  porteRechercheNav.appendChild(boutonRechercheNav);
  boutonRechercheNav.addEventListener('click', (e) => {
    e.stopPropagation();   // le « clic extérieur » de panneaux.ts n'a rien à refermer ici
    rangerFonds();
    recherche.ouvrirPage();
  });
  carte.addControl({ onAdd: () => porteRechercheNav, onRemove: () => porteRechercheNav.remove() }, 'bottom-right');

  recherche.surSelection = (r) => {
    /* EN SUIVI, LE LIEU CHOISI EST UNE ÉTAPE (RECHERCHE-NAV-1) — pas une
       destination à regarder : on roule, on veut y passer. Le planificateur
       l'ajoute et relance le suivi sur le nouveau tracé, comme « Y aller »
       sur une aire. */
    if (document.body.classList.contains('en-guidage')) {
      document.dispatchEvent(new CustomEvent('lieu-etape', {
        detail: { lon: r.lon, lat: r.lat, nom: r.libelle },
      }));
      return;
    }
    /* ON DÉSARME LE SUIVI AVANT DE VOLER (DEST-1) : verrouillé, chaque relevé
       GPS rabattrait la carte sur la position, et le vol vers la destination
       avorterait sous les yeux de l'usager — son retour exact. `trigger()` en
       état verrouillé COUPE le suivi (le cycle du bouton de MapLibre) : c'est
       ce que font les cartes du commerce quand on choisit une destination, et
       le bouton reste là pour le réarmer d'un geste. */
    if (suiviVerrouille) geoloc.trigger();
    marqueur?.remove();
    /* ROUGE, PAS BLEU (DEST-2). Armelin lit le marqueur comme « un point de
       géolocalisation bleu » : la teinte #2272C4 se confondait avec le point
       de position. Le rouge est le pictogramme universel de la destination —
       et il ne ressemble à rien d'autre sur cette carte. */
    marqueur = new Marker({ color: '#D9534F' }).setLngLat([r.lon, r.lat]).addTo(carte);
    /* LE MARQUEUR EST UNE POIGNÉE : la fiche fermée se rouvre en le cliquant.
       Le marqueur est recréé à chaque sélection — l'écouteur aussi. */
    derniereDestination = r;
    const poignee = marqueur.getElement();
    poignee.style.cursor = 'pointer';
    poignee.setAttribute('role', 'button');
    poignee.setAttribute('aria-label', `Rouvrir la fiche de ${r.libelle}`);
    poignee.addEventListener('click', (e) => {
      e.stopPropagation();
      if (derniereDestination) montrerDestination(derniereDestination);
    });
    carte.flyTo({ center: [r.lon, r.lat], zoom: r.type === 'municipality' ? 13 : 17 });
    montrerDestination(r);
  };

  /** La fiche compacte d'une adresse choisie dans la recherche. */
  function montrerDestination(r: DestinationChoisie): void {
    const point = { lon: r.lon, lat: r.lat };
    const coords = formaterCoordonnees(point);
    /* closeOnClick: false — même leçon que l'appui long (PR #10) : un
       événement de la même gestuelle refermait la popup dans la foulée. */
    const popup = new Popup({ closeButton: true, closeOnClick: false, maxWidth: '320px' })
      .setLngLat([r.lon, r.lat])
      .setHTML('<div class="popup-adresse fiche-destination">'
        + '<p class="pa-libelle"></p><p class="fd-contexte"></p>'
        + '<p class="fd-adresse" hidden></p>'
        + '<div class="fd-actions">'
        + '<button type="button" class="fd-aller">Y aller</button>'
        + '<button type="button" class="fd-reduire">Réduire au marqueur</button>'
        + '<button type="button" class="pa-favori">Ajouter aux favoris</button>'
        + '<button type="button" class="pa-photo">Photos de rue</button>'
        + '<button type="button" class="pa-copier">Copier les coordonnées</button>'
        + '</div><p class="pa-photo-etat" role="status"></p></div>')
      .addTo(carte);
    poserFiche(popup);
    /* LA CROIX EFFACE TOUT, « RÉDUIRE » GARDE LA POIGNÉE (DEST-2). Le même
       événement `close` arrive dans les deux cas — et aussi quand une autre
       fiche remplace celle-ci ou qu'un itinéraire part : seuls la réduction
       ET le remplacement gardent le marqueur, la croix seule l'efface. */
    reductionEnCours = false;
    popup.on('close', () => {
      if (!reductionEnCours && fiches.size === 0) effacerMarqueur();
      reductionEnCours = false;
    });
    const bloc = popup.getElement();
    // textContent, jamais innerHTML : le libellé vient d'un service externe.
    (bloc.querySelector('.pa-libelle') as HTMLElement).textContent = r.libelle;
    (bloc.querySelector('.fd-contexte') as HTMLElement).textContent = r.contexte;
    /* LA MÊME RANGÉE QUE LA FICHE DES LIEUX (RAIL-DISTANCE-ROUTE, 04/09).
       Armelin demandait « la distance en voiture ou à pied suivant le mode »
       dans les listes ; la mesure a rejeté l'estimation au facteur (rapport
       route/vol d'oiseau de 1,21 à 2,33 sur huit paires — les sens uniques
       et les fleuves ruinent toute constante, surtout en courte distance).
       Ici, c'est du MESURÉ : une requête par appui, sur LE lieu qu'on
       regarde. */
    const conteneurFiche = bloc.querySelector('.fiche-destination') as HTMLElement;
    brancherTempsTrajet(conteneurFiche, point);

    bloc.querySelector('.fd-reduire')?.addEventListener('click', () => {
      reductionEnCours = true;
      popup.remove();
    });

    /* L'ADRESSE MANQUANTE SE DEMANDE (DEST-2). Armelin, sur un restaurant du
       rail : « je ne vois aucune adresse apparaître pour ce POI à part le
       bouton Y aller ». Les lieux d'OpenStreetMap sans étiquettes addr:*
       n'avaient que leur famille en contexte. Même recette que les fiches de
       lieux (ADRESSE-POI-1) : la BAN, une fois, à l'ouverture — et l'on dit
       d'où vient l'adresse, car « la plus proche du point » n'est pas
       « l'adresse déclarée ». */
    let adresseConnue: string | null = null;
    if (r.adresseInconnue === true) {
      const ligne = bloc.querySelector('.fd-adresse') as HTMLElement;
      ligne.hidden = false;
      ligne.textContent = 'Recherche de l’adresse…';
      void adresseInverse(point)
        .then((rep) => {
          adresseConnue = rep?.libelle ?? null;
          ligne.textContent = adresseConnue === null
            ? 'Adresse inconnue de la Base Adresse Nationale'
            : `Adresse la plus proche : ${adresseConnue}`;
        })
        .catch(() => { ligne.textContent = 'Adresse indisponible pour le moment'; });
    }

    /* « Y ALLER » : le point d'entrée unique des autres composants — le volet
       s'ouvre, la destination porte son NOM, le départ se déduit de la
       position connue ou se demande en toutes lettres. La fiche se referme :
       elle a rempli son office. */
    bloc.querySelector('.fd-aller')?.addEventListener('click', () => {
      /* Le champ destination porte l'adresse trouvée : « Mona Lisa —
         3 rue X, 94350 Villiers-sur-Marne » se dicte, « Mona Lisa » non.
         Et « Y aller » RÉDUIT (le marqueur reste) : c'est le départ du
         trajet qui l'effacera — pas l'ouverture du planificateur. */
      reductionEnCours = true;
      panneau.allerVers(point, libelleDestination(r.libelle, adresseConnue));
      popup.remove();
    });

    /* LE NOM DU FAVORI EST DÉJÀ TRANCHÉ — c'est le libellé BAN qu'on vient de
       choisir : aucune attente, aucun bouton désactivé, contrairement à
       l'appui long qui doit d'abord résoudre l'adresse. */
    const favori = bloc.querySelector('.pa-favori') as HTMLButtonElement;
    /* LA LISTE SE CHOISIT (FAVORIS-4, 03/09) — ici comme sur les fiches de
       lieu et de borne : le même geste, la même question, au même moment. */
    brancherAjoutFavori(favori, favori.parentElement ?? bloc,
      () => ({ nom: r.libelle, point }));

    bloc.querySelector('.pa-copier')?.addEventListener('click', () => {
      void navigator.clipboard.writeText(coords);
      (bloc.querySelector('.pa-copier') as HTMLElement).textContent = 'Copié !';
    });

    // Les photos ne partent QUE sur demande : un commun associatif se ménage.
    const boutonPhoto = bloc.querySelector('.pa-photo') as HTMLButtonElement;
    const etatPhoto = bloc.querySelector('.pa-photo-etat') as HTMLElement;
    boutonPhoto.addEventListener('click', () => {
      boutonPhoto.disabled = true;
      etatPhoto.textContent = 'Recherche d’une photo…';
      chercherPhotos(point.lon, point.lat).then(
        (photos) => {
          const photo = plusProche(photos, point.lon, point.lat);
          if (!photo) {
            etatPhoto.textContent = 'Aucune photo de rue à cet endroit.';
            boutonPhoto.disabled = false;
            return;
          }
          etatPhoto.textContent = '';
          boutonPhoto.disabled = false;
          visionneuse.ouvrir(photo);
        },
        (e: unknown) => {
          etatPhoto.textContent = e instanceof ErreurPhotos
            ? e.message : 'Photos de rue indisponibles pour le moment.';
          boutonPhoto.disabled = false;
        },
      );
    });
  }

  /* L'APPUI LONG (500 ms, souris comme doigt) répond « où suis-je ? » :
     adresse inverse BAN + coordonnées au format maison, avec un bouton
     copier. Le déplacement annule l'appui — on ne confond pas un pan avec
     une question. */
  let appui: ReturnType<typeof setTimeout> | undefined;
  carte.on('mousedown', (e) => {
    appui = setTimeout(() => { void montrerAdresse(e.lngLat); }, 500);
  });
  carte.on('touchstart', (e) => {
    if (e.points.length === 1) appui = setTimeout(() => { void montrerAdresse(e.lngLat); }, 500);
  });
  for (const fin of ['mouseup', 'touchend', 'move', 'dragstart'] as const) {
    carte.on(fin, () => clearTimeout(appui));
  }

  async function montrerAdresse(ou: { lng: number; lat: number }): Promise<void> {
    const point = { lon: ou.lng, lat: ou.lat };
    const coords = formaterCoordonnees(point);
    // closeOnClick: false — le RELÂCHEMENT de l'appui long produit un click,
    // qui refermait la popup dans la foulée de son ouverture (attrapé par le
    // premier E2E d'appui long, PR #10) ; la croix suffit pour fermer.
    const popup = new Popup({ closeButton: true, closeOnClick: false, maxWidth: '320px' })
      .setLngLat(ou)
      .setHTML('<div class="popup-adresse"><p class="pa-libelle">Recherche de l’adresse…</p>'
        + '<p class="pa-coords"></p><button type="button" class="pa-copier">Copier les coordonnées</button>'
        + '<p class="pa-mots" role="status"></p>'
        + '<button type="button" class="pa-copier-mots" hidden>Copier l’adresse en mots</button>'
        + '<button type="button" class="pa-favori" disabled>Ajouter aux favoris</button>'
        + REPERES.map((r) => `<button type="button" class="pa-repere"`
          + ` data-cle="${r.cle}" disabled>Définir comme ${r.libelle.toLowerCase()}</button>`).join('')
        + '<button type="button" class="pa-photo">Photos de rue</button>'
        + '<p class="pa-photo-etat" role="status"></p></div>')
      .addTo(carte);
    poserFiche(popup);
    const bloc = popup.getElement();
    (bloc.querySelector('.pa-coords') as HTMLElement).textContent = coords;
    bloc.querySelector('.pa-copier')?.addEventListener('click', () => {
      void navigator.clipboard.writeText(coords);
      (bloc.querySelector('.pa-copier') as HTMLElement).textContent = 'Copié !';
    });
    // Le nom du favori : l'adresse si la BAN en connaît une, les coordonnées
    // sinon — jamais un champ vide. Le bouton naît DÉSACTIVÉ et n'ouvre qu'une
    // fois l'adresse tranchée : cliquer pendant le vol figeait le favori sous
    // des coordonnées, sans moyen de le renommer (revue du 22/08).
    const bouton = bloc.querySelector('.pa-favori') as HTMLButtonElement;
    let nomFavori = coords;

    /* LES REPÈRES — domicile et travail. Mêmes règles que le favori : ils
       naissent DÉSACTIVÉS et n'ouvrent qu'une fois l'adresse tranchée, sans
       quoi on figerait « chez moi » sous des coordonnées brutes. */
    const boutonsRepere = [...bloc.querySelectorAll<HTMLButtonElement>('.pa-repere')];
    for (const b of boutonsRepere) {
      b.addEventListener('click', () => {
        const cle = b.dataset['cle'] as CleRepere;
        b.disabled = true;
        ecrireRepere(cle, point, nomFavori).then(
          () => { b.textContent = 'Enregistré ✓'; void favoris.rafraichir(); },
          () => { b.textContent = 'Enregistrement impossible (stockage local indisponible)'; },
        );
      });
    }

    brancherAjoutFavori(bouton, bouton.parentElement ?? bloc,
      () => ({ nom: nomFavori, point }));
    /* L'ADRESSE EN MOTS — « Dijon-21 BAKE 4831 ». Elle se dicte au téléphone
       et s'écrit sur un papier, là où un lien de partage ne le peut pas.

       ELLE NE FAIT ATTENDRE PERSONNE. Ni la BAN, qui nomme la rue et ne la
       concerne pas ; ni surtout les boutons du reste de la fiche. Un `await`
       posé ici retardait le câblage du bouton « Photos de rue » du temps que
       met le répertoire des communes : sur une machine lente, le clic partait
       avant l'écouteur et se perdait (CI rouge le 22/08, avant toute mise en
       ligne). On remplit donc la ligne QUAND la réponse arrive, sans jamais
       suspendre la suite. */
    const ligneMots = bloc.querySelector('.pa-mots') as HTMLElement;
    const copierMots = bloc.querySelector('.pa-copier-mots') as HTMLButtonElement;
    /* `.catch` APRÈS `.then`, jamais le second bras de `.then` : `coder` lève
       quand le point sort de la fenêtre, et cette exception-là naît DANS le
       bras de succès — un `.then(ok, erreur)` la laisserait filer en promesse
       non gérée, sans jamais afficher le refus qu'elle porte. */
    void communeDuPoint(point)
      .then((commune) => {
        if (!commune) {
          ligneMots.textContent = 'Adresse en mots : hors des communes françaises.';
          return;
        }
        const mots = coder(commune, point);
        ligneMots.textContent = mots;
        copierMots.hidden = false;
        copierMots.addEventListener('click', () => {
          void navigator.clipboard.writeText(mots);
          copierMots.textContent = 'Copié !';
        });
      })
      .catch((e: unknown) => {
        ligneMots.textContent = e instanceof ErreurAdresseMots
          ? e.message
          : 'Adresse en mots indisponible pour le moment.';
      });

    try {
      const adresse = await adresseInverse(point);
      if (adresse) nomFavori = adresse.libelle;
      (bloc.querySelector('.pa-libelle') as HTMLElement).textContent =
        adresse ? adresse.libelle : 'Aucune adresse connue à cet endroit.';
    } catch {
      (bloc.querySelector('.pa-libelle') as HTMLElement).textContent =
        'Adresse indisponible pour le moment.';
    }
    // Quel que soit le sort de la BAN, le nom est arrêté : les boutons s'ouvrent.
    bouton.disabled = false;
    for (const b of boutonsRepere) b.disabled = false;

    /* LES PHOTOS DE RUE ne partent QUE sur demande explicite : une photo
       coûte du réseau à un commun associatif, et personne n'en veut à chaque
       appui long. */
    const boutonPhoto = bloc.querySelector('.pa-photo') as HTMLButtonElement;
    const etatPhoto = bloc.querySelector('.pa-photo-etat') as HTMLElement;
    boutonPhoto.addEventListener('click', () => {
      boutonPhoto.disabled = true;
      etatPhoto.textContent = 'Recherche d’une photo…';
      chercherPhotos(point.lon, point.lat).then(
        (photos) => {
          const photo = plusProche(photos, point.lon, point.lat);
          if (!photo) {
            etatPhoto.textContent = 'Aucune photo de rue à cet endroit.';
            boutonPhoto.disabled = false;
            return;
          }
          etatPhoto.textContent = '';
          boutonPhoto.disabled = false;
          visionneuse.ouvrir(photo);
        },
        (e: unknown) => {
          etatPhoto.textContent = e instanceof ErreurPhotos
            ? e.message : 'Photos de rue indisponibles pour le moment.';
          boutonPhoto.disabled = false;
        },
      );
    });
  }

  // Poignée de débogage et d'E2E : lire l'état de la carte depuis la console
  // ou Playwright. Lecture seule par convention — rien du produit n'en dépend.
  (window as unknown as { __carte: CarteMapLibre }).__carte = carte;

  /* SUR TÉLÉPHONE, LA BULLE PART REPLIÉE. MapLibre ouvre son attribution
     compacte par défaut ; sur 390 px de large, nos quatre liens plus la
     source IGN prennent deux lignes en travers de la carte. Repliée, tout
     reste à UN TOUCHER du « i » — la convention de toutes les cartes
     mobiles. SUR GRAND ÉCRAN ON N'Y TOUCHE PAS : la place ne manque pas, et
     l'attribution de la Géoplateforme est la contrepartie de la licence,
     pas un ornement qu'on range parce qu'il gêne. */
  /* CE QUE FAIT VRAIMENT MAPLIBRE, LU DANS SON CODE le 30/08 — parce que le
     DOM seul induit en erreur. L'attribution compacte est un `<details>`,
     mais son état OUVERT n'est PAS l'attribut `open` : c'est la classe
     `maplibregl-compact-show`, et l'attribut `open` est RETIRÉ à
     l'ouverture. Les deux sont donc inversés par rapport à ce qu'un
     `<details>` laisse attendre. Retirer la classe replie : c'est juste, et
     c'était déjà juste. */
  if (window.matchMedia('(max-width: 640px)').matches) {
    const replier = (): void => {
      conteneur.querySelector('.maplibregl-ctrl-attrib.maplibregl-compact')
        ?.classList.remove('maplibregl-compact-show');
    };
    replier();
    carte.once('load', replier);
  }


  /* LE PIED DE PAGE AUTONOME S'EFFACE DÈS QUE LA CARTE EST LÀ : ses liens
     vivent désormais dans l'attribution, derrière le « i ». Il reste dans le
     HTML — et donc à l'écran — pour qui n'a pas JavaScript : les mentions
     légales ne sont pas négociables. */
  document.body.classList.add('carte-prete');

  return carte;
}
