/* LES FAVORIS SUR LA CARTE, AVEC L'ÉMOJI DE LEUR LISTE (MES-POI-1, 04/09).
 *
 * LA DEMANDE. Armelin : « lorsqu'on utilise la liste des favoris et qu'on
 * enregistre des POI avec un émoji, ce serait bien de voir apparaître les
 * émojis en question sur la carte. Il faudrait ajouter un filtre "Mes POIs"
 * pour afficher ou masquer ses propres POI. »
 *
 * VISIBLES D'EMBLÉE : sa remarque EST que les émojis n'apparaissent pas.
 * Livrer la couche éteinte referait une fonction cachée — la règle du
 * projet dit ce qu'elle vaudrait. Le filtre sert à les RANGER, pas à les
 * découvrir.
 *
 * RIEN NE SORT DU NAVIGATEUR : les favoris restent en IndexedDB, la couche
 * les dessine sur place. Aucune requête, aucun service — c'est la seule
 * couche de la carte qui ne coûte rien à personne.
 */
import type { Map as CarteMapLibre, GeoJSONSource } from 'maplibre-gl';
import { Popup } from 'maplibre-gl';
import { listerFavoris, listerListes, type Favori } from '../lib/favoris';
import type { ListeFavoris } from '../lib/listes-favoris';
import { traitsFavoris, cleImageListe } from '../lib/mes-poi-traits';
import { lirePreference, ecrirePreference } from '../lib/stockage';
import { libelleDestination } from '../lib/adresse-lieu';
import type { PorteItineraire } from './fiche-borne';
import { AJOUT_FAVORI } from './choix-liste';

/* LE CHANGEMENT SE CRIE UNE FOIS, ET TOUT LE MONDE L'ENTEND : le panneau des
   favoris le lance à chaque rafraîchissement (retrait, rangement, import) —
   sans quoi la carte montrerait un favori supprimé, c'est-à-dire mentirait. */
export const CHANGEMENT_FAVORIS = 'favoris-changes';

export const PREF_MES_POI = 'mes-poi-visibles';

const SOURCE = 'mes-poi';
const COUCHE = 'mes-poi-points';

/* L'ÉMOJI SE DESSINE, IL NE S'ÉCRIT PAS : les étiquettes texte de MapLibre
   passent par des glyphes monochromes — un émoji y devient une silhouette
   grise. On le peint donc sur une toile, dans un disque blanc cerclé de la
   couleur de sa liste : le même langage que les pastilles de familles. */
const TAILLE_EMOJI = 64;

export function imageEmoji(emoji: string, couleur: string): ImageData | null {
  const toile = document.createElement('canvas');
  toile.width = TAILLE_EMOJI;
  toile.height = TAILLE_EMOJI;
  const c = toile.getContext('2d');
  if (!c) return null;
  const centre = TAILLE_EMOJI / 2;
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.35)';
  c.shadowBlur = 4;
  c.shadowOffsetY = 1;
  c.beginPath();
  c.arc(centre, centre, centre - 5, 0, Math.PI * 2);
  c.fillStyle = '#FFFFFF';
  c.fill();
  c.restore();
  c.beginPath();
  c.arc(centre, centre, centre - 6, 0, Math.PI * 2);
  c.lineWidth = 4;
  c.strokeStyle = couleur;
  c.stroke();
  c.font = `34px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  /* +2 : les émojis penchent vers le haut de leur boîte typographique. */
  c.fillText(emoji, centre, centre + 2);
  try {
    return c.getImageData(0, 0, TAILLE_EMOJI, TAILLE_EMOJI);
  } catch {
    return null;
  }
}

export class MesPoi {
  #carte: CarteMapLibre | null = null;
  #porte: PorteItineraire | null = null;
  #favoris: Favori[] = [];
  #visible = true;
  #images = new Set<string>();

  /** Prévient l'entonnoir quand la visibilité change — la puce suit. */
  surVisibilite: ((visible: boolean) => void) | null = null;

  poser(carte: CarteMapLibre, porte: PorteItineraire | null): void {
    this.#carte = carte;
    this.#porte = porte;
    document.addEventListener(AJOUT_FAVORI, () => { void this.rafraichir(); });
    document.addEventListener(CHANGEMENT_FAVORIS, () => { void this.rafraichir(); });
    const demarrer = (): void => {
      /* LE RÉGLAGE REVIENT AVANT LES POINTS : poser puis cacher ferait
         clignoter les favoris de qui les a rangés. */
      void lirePreference<boolean>(PREF_MES_POI).then((memo) => {
        if (memo === false) {
          this.#visible = false;
          this.surVisibilite?.(false);
        }
      }).finally(() => { void this.rafraichir(); });
    };
    if (carte.isStyleLoaded()) demarrer();
    else carte.once('load', demarrer);
  }

  visible(): boolean { return this.#visible; }

  /** Montre ou range les favoris — et s'en souvient. */
  basculer(visible: boolean): void {
    this.#visible = visible;
    void ecrirePreference(PREF_MES_POI, visible);
    const carte = this.#carte;
    if (carte?.getLayer(COUCHE)) {
      carte.setLayoutProperty(COUCHE, 'visibility', visible ? 'visible' : 'none');
    }
    this.surVisibilite?.(visible);
  }

  #assurerImage(liste: ListeFavoris): void {
    const carte = this.#carte;
    const cle = cleImageListe(liste.id);
    if (!carte || this.#images.has(cle)) return;
    if (!carte.hasImage(cle)) {
      const image = imageEmoji(liste.emoji, liste.couleur);
      if (image) carte.addImage(cle, image, { pixelRatio: 2 });
    }
    this.#images.add(cle);
  }

  /** Relit les favoris et repose la couche. */
  async rafraichir(): Promise<void> {
    const carte = this.#carte;
    if (!carte) return;
    const [favoris, listes] = await Promise.all([listerFavoris(), listerListes()]);
    this.#favoris = favoris;
    const { traits, listesUtiles } = traitsFavoris(favoris, listes);
    for (const l of listesUtiles) this.#assurerImage(l);
    const donnees = { type: 'FeatureCollection' as const, features: traits };
    try {
      const existante = carte.getSource(SOURCE) as GeoJSONSource | undefined;
      if (existante) {
        existante.setData(donnees);
        /* LA VISIBILITÉ EST RÉAFFIRMÉE ICI, pas seulement au basculement :
           le panneau des favoris peut faire naître la couche AVANT que la
           préférence ne soit lue — le réglage arriverait alors sur une
           couche déjà posée, et resterait lettre morte. Attrapé par le
           parcours du rechargement. */
        if (carte.getLayer(COUCHE)) {
          carte.setLayoutProperty(COUCHE, 'visibility', this.#visible ? 'visible' : 'none');
        }
        return;
      }
      carte.addSource(SOURCE, { type: 'geojson', data: donnees });
      carte.addLayer({
        id: COUCHE, type: 'symbol', source: SOURCE,
        layout: {
          'icon-image': ['get', 'image'],
          /* PLUS TÔT VISIBLES QUE LES LIEUX OVERPASS : une poignée de
             favoris ne charge pas la carte comme cent commerces, et l'on
             cherche « Maison de Mamie » depuis la vue d'une région. */
          'icon-size': ['interpolate', ['linear'], ['zoom'], 6, 0.5, 13, 0.75, 17, 1],
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          visibility: this.#visible ? 'visible' : 'none',
        },
      });
      carte.on('click', COUCHE, (e) => {
        const rang = Number((e.features?.[0]?.properties as { rang?: unknown })?.rang);
        const favori = Number.isFinite(rang) ? this.#favoris[rang] : undefined;
        if (favori) this.#fiche(favori);
      });
      carte.on('mouseenter', COUCHE, () => { carte.getCanvas().style.cursor = 'pointer'; });
      carte.on('mouseleave', COUCHE, () => { carte.getCanvas().style.cursor = ''; });
    } catch (e) {
      if (e instanceof Error && /style is not done loading/i.test(e.message)) return;
      throw e;
    }
  }

  /* LA FICHE DU FAVORI : son nom, son adresse d'origine, « Y aller » — le
     même vocabulaire que les fiches de lieux, jamais un second langage. */
  #fiche(favori: Favori): void {
    const carte = this.#carte;
    if (!carte) return;
    const boite = document.createElement('div');
    boite.className = 'fb-fiche poi-fiche';
    const titre = document.createElement('p');
    titre.className = 'poi-fiche-nom';
    titre.textContent = favori.nom;
    boite.append(titre);
    if (favori.adresse) {
      const adresse = document.createElement('p');
      adresse.className = 'poi-fiche-adresse';
      adresse.textContent = favori.adresse;
      boite.append(adresse);
    }
    if (this.#porte) {
      const boutons = document.createElement('div');
      boutons.className = 'poi-fiche-boutons';
      const aller = document.createElement('button');
      aller.type = 'button';
      aller.className = 'poi-fiche-aller';
      aller.textContent = 'Y aller';
      aller.setAttribute('aria-label', `Itinéraire vers ${favori.nom}`);
      aller.addEventListener('click', () => {
        this.#porte?.allerVers(
          { lon: favori.lon, lat: favori.lat },
          libelleDestination(favori.nom, favori.adresse ?? null),
        );
      });
      boutons.append(aller);
      boite.append(boutons);
    }
    new Popup({ closeButton: true, closeOnClick: true, maxWidth: '300px' })
      .setLngLat([favori.lon, favori.lat])
      .setDOMContent(boite)
      .addTo(carte);
    carte.easeTo({ center: [favori.lon, favori.lat], offset: [0, 120], duration: 350 });
  }
}
