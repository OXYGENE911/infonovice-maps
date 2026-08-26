// Création de la carte : plein écran, fond Plan IGN, contrôles localisés.
// Tout ce qui est TESTABLE hors navigateur vit dans style-ign.ts ; ce module
// ne fait que l'assemblage MapLibre.
import { Map as CarteMapLibre, NavigationControl, GeolocateControl, ScaleControl, Marker, Popup, setWorkerUrl } from 'maplibre-gl';
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
import { styleCarte, LOCALE_FR, type OptionsStyle } from './style-ign';
import { SelecteurFonds } from './selecteur-fonds';
import { installerPanneaux } from './panneaux';
import { RechercheAdresse } from './recherche';
import { PanneauItineraire } from './panneau-itineraire';
import { PanneauPoi } from './panneau-poi';
import { PanneauFavoris } from './panneau-favoris';
import { PanneauTrafic } from './panneau-trafic';
import { PanneauTransports } from './panneau-transports';
import { PanneauVehicule } from './panneau-vehicule';
import { MenuReglages } from './menu-reglages';
import { ajouterFavori } from '../lib/favoris';
import { ecrireRepere, REPERES, type CleRepere } from '../lib/reperes';
import { VisionneusePhoto } from './visionneuse-photo';
import { FicheBorne } from './fiche-borne';
import { chercherPhotos, plusProche, ErreurPhotos } from '../lib/panoramax';
import { adresseInverse } from '../lib/adresse';
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
    attributionControl: { compact: true },
  });

  /* LES COMMANDES DE VUE VONT EN BAS À DROITE, le menu reste SEUL en haut.
     Mêler « où je regarde » et « ce que j'affiche » dans une même colonne
     obligeait l'œil à trier ; les cartes grand public séparent les deux. */
  carte.addControl(new NavigationControl({ visualizePitch: true }), 'bottom-right');

  /* LE MODE SOMBRE DU FOND PLAN est un filtre CSS sur le canevas — le
     vectoriel ferait mieux, mais il exigerait glyphes et sprites hébergés ;
     le filtre inversé bien réglé rend le Plan IGN parfaitement lisible de
     nuit, et le satellite reste intouché (inverser une photo n'a pas de
     sens). Décision documentée : on repassera au vectoriel si le besoin
     dépasse ce rendu. */
  const sombre = window.matchMedia('(prefers-color-scheme: dark)');
  const appliquerSombre = (o: OptionsStyle) => {
    conteneur.classList.toggle('fond-sombre', sombre.matches && o.fond === 'plan');
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
  selecteur.surChangement = (o) => { carte.setStyle(styleCarte(o)); appliquerSombre(o); };
  menu.ajouter('Affichage', selecteur);

  /* LES COUCHES D'INFORMATION — points d'intérêt, trafic, transports. Elles
     répondent à « que voir sur la carte », pas à « où vais-je » : leur place
     est dans le menu. */
  const poi = new PanneauPoi();
  poi.carte = carte;
  menu.ajouter('Couches', poi);

  const trafic = new PanneauTrafic();
  trafic.carte = carte;
  menu.ajouter('', trafic);

  const transports = new PanneauTransports();
  transports.carte = carte;
  menu.ajouter('', transports);

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

  /* LE VÉHICULE ÉLECTRIQUE — profil et rayon d'action. Tout reste local :
     batterie, santé, charge, relevés d'autonomie ne sortent jamais du
     navigateur, et aucun compte n'est demandé. */
  const vehicule = new PanneauVehicule();
  vehicule.carte = carte;
  const porteVehicule = document.createElement('div');
  porteVehicule.className = 'maplibregl-ctrl porte-vehicule';
  porteVehicule.appendChild(vehicule);
  carte.addControl(
    { onAdd: () => porteVehicule, onRemove: () => porteVehicule.remove() }, 'top-left',
  );

  /* LES LIEUX ENREGISTRÉS — favoris, domicile, travail, et l'export RGPD. */
  const favoris = new PanneauFavoris();
  favoris.carte = carte;
  menu.ajouter('Mes lieux', favoris);

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
  /* LA POSITION GPS EST DIFFUSÉE AUX PANNEAUX QUI EN ONT BESOIN. Les anneaux
     d'autonomie suivaient jusqu'ici le CENTRE DE LA CARTE : dès qu'on faisait
     glisser la carte, le rayon d'action se déplaçait avec elle, ce qui n'a
     aucun sens — il entoure la voiture, pas le regard. Signalé par Armelin
     capture à l'appui. */
  const geoloc = new GeolocateControl({
    positionOptions: { enableHighAccuracy: true },
    trackUserLocation: true,
  });
  geoloc.on('geolocate', (e: unknown) => {
    const p = (e as { coords?: { longitude?: number; latitude?: number } }).coords;
    if (typeof p?.longitude === 'number' && typeof p?.latitude === 'number') {
      vehicule.position = { lon: p.longitude, lat: p.latitude };
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
     carte) ; la sélection pose un marqueur et y vole. */
  const recherche = new RechercheAdresse();
  document.querySelector('.entete')?.appendChild(recherche);
  let marqueur: Marker | null = null;
  recherche.surSelection = (r) => {
    marqueur?.remove();
    marqueur = new Marker({ color: '#2272C4' }).setLngLat([r.lon, r.lat]).addTo(carte);
    carte.flyTo({ center: [r.lon, r.lat], zoom: r.type === 'municipality' ? 13 : 17 });
  };

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

    bouton.addEventListener('click', () => {
      bouton.disabled = true;
      ajouterFavori(nomFavori, point).then(
        () => { bouton.textContent = 'Ajouté aux favoris ✓'; void favoris.rafraichir(); },
        () => { bouton.textContent = 'Ajout impossible (stockage local indisponible)'; },
      );
    });
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

  return carte;
}
