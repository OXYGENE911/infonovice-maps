// Le style MapLibre du fond Plan IGN — une FONCTION PURE, pour être testée
// sans navigateur. Les tuiles viennent du WMTS Géoplateforme, couche
// « essentielle » servie sans clé (vérifié par appel réel, voir docs/apis.md).
//
// LE PROJET NE PART PAS EN VECTORIEL TOUT DE SUITE, et c'est un choix : le
// raster Plan IGN v2 est le rendu officiel, lisible immédiatement, sans
// glyphes ni sprites à héberger. Les tuiles vectorielles IGN viendront quand
// le mode sombre l'exigera vraiment (PR #3 en décidera).
import type { StyleSpecification } from 'maplibre-gl';
import {
  TUILES_ETIQUETTES, GLYPHES_IGN, CALQUES_NUMEROS_ROUTE, CALQUES_TOPONYMES,
} from './etiquettes-ign';

const WMTS = 'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0'
  + '&STYLE=normal&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}';

/** Attribution exigée par les conditions Géoplateforme. */
export const ATTRIBUTION_IGN = '© <a href="https://www.ign.fr/">IGN</a>-F / Géoplateforme';

export function urlTuiles(couche: string, format: 'image/png' | 'image/jpeg'): string {
  return `${WMTS}&LAYER=${couche}&FORMAT=${format}`;
}

/* Les fonds disponibles. SCAN 25 (Topo) est ABSENT à dessein : vérifié le
   16/08, la couche répond 400 sans clé — elle appartient aux flux soumis à
   inscription Géoplateforme (gratuite, mais c'est une démarche d'Armelin).
   En échange, deux couches libres plus utiles aux produits maison : le
   CADASTRE (Arpentine) et les ROUTES en surcouche du satellite. */
export type Fond = 'plan' | 'ortho' | 'ortho-routes';
export const FONDS: Record<Fond, string> = {
  plan: 'Plan IGN',
  ortho: 'Satellite',
  'ortho-routes': 'Satellite + routes',
};

export interface OptionsStyle {
  fond: Fond;
  cadastre?: boolean;
}

export function styleCarte({ fond, cadastre = false }: OptionsStyle): StyleSpecification {
  const sources: StyleSpecification['sources'] = {};
  const layers: StyleSpecification['layers'] = [];
  /* LE FOND EST RASTER : ses étiquettes sont PEINTES DANS L'IMAGE. Le
     satellite n'en a donc aucune, et les numéros de route s'arrêtent au zoom
     où la planche cesse de les dessiner. On les rétablit par une surcouche
     vectorielle — voir etiquettes-ign.ts pour la mesure et la provenance. */
  const etiquettes: StyleSpecification['layers'] = [];

  if (fond === 'plan') {
    sources['plan-ign'] = {
      type: 'raster',
      tiles: [urlTuiles('GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2', 'image/png')],
      tileSize: 256,
      maxzoom: 19,
      attribution: ATTRIBUTION_IGN,
    };
    layers.push({ id: 'fond-plan-ign', type: 'raster', source: 'plan-ign' });
    /* SUR LE PLAN, SEULEMENT LES NUMÉROS DE ROUTE. Les noms de communes, la
       planche raster les dessine déjà : les redoubler donnerait deux textes
       superposés, décalés d'un pixel. */
    etiquettes.push(...CALQUES_NUMEROS_ROUTE);
  } else {
    sources['ortho'] = {
      type: 'raster',
      tiles: [urlTuiles('ORTHOIMAGERY.ORTHOPHOTOS', 'image/jpeg')],
      tileSize: 256,
      maxzoom: 19,
      attribution: ATTRIBUTION_IGN,
    };
    layers.push({ id: 'fond-ortho', type: 'raster', source: 'ortho' });
    /* SUR LE SATELLITE, LES DEUX : la photographie ne porte aucun texte. */
    etiquettes.push(...CALQUES_TOPONYMES, ...CALQUES_NUMEROS_ROUTE);
    if (fond === 'ortho-routes') {
      sources['routes'] = {
        type: 'raster',
        tiles: [urlTuiles('TRANSPORTNETWORKS.ROADS', 'image/png')],
        tileSize: 256,
        maxzoom: 18,
        attribution: ATTRIBUTION_IGN,
      };
      layers.push({ id: 'surcouche-routes', type: 'raster', source: 'routes' });
    }
  }

  if (cadastre) {
    sources['cadastre'] = {
      type: 'raster',
      tiles: [urlTuiles('CADASTRALPARCELS.PARCELLAIRE_EXPRESS', 'image/png')],
      tileSize: 256,
      maxzoom: 19,
      attribution: ATTRIBUTION_IGN,
    };
    layers.push({
      id: 'surcouche-cadastre', type: 'raster', source: 'cadastre',
      paint: { 'raster-opacity': 0.75 },
    });
  }

  /* LES ÉTIQUETTES PASSENT EN DERNIER, cadastre compris : un texte lu sous
     une surcouche opaque ne se lit pas. */
  if (etiquettes.length > 0) {
    sources['etiquettes-ign'] = {
      type: 'vector', tiles: [TUILES_ETIQUETTES], maxzoom: 18,
      attribution: ATTRIBUTION_IGN,
    };
    layers.push(...etiquettes);
  }

  return {
    version: 8,
    name: `Fond ${fond}${cadastre ? ' + cadastre' : ''}`,
    /* LES GLYPHES NE SE DÉCLARENT QUE S'IL Y A DU TEXTE : un style sans
       symbole n'a pas à annoncer une police qu'il n'ira jamais chercher. */
    ...(etiquettes.length > 0 ? { glyphs: GLYPHES_IGN } : {}),
    sources,
    layers,
  };
}

/** Le style historique de la PR #2, conservé comme raccourci. */
export function styleIGNPlan(): StyleSpecification {
  return styleCarte({ fond: 'plan' });
}

/* Les libellés français des contrôles MapLibre : la bibliothèque parle
   anglais par défaut, et un produit souverain qui dit « Zoom in » à un
   lecteur d'écran français raterait sa première promesse. */
export const LOCALE_FR: Record<string, string> = {
  'NavigationControl.ZoomIn': 'Zoomer',
  'NavigationControl.ZoomOut': 'Dézoomer',
  'NavigationControl.ResetBearing': 'Remettre le nord en haut',
  'GeolocateControl.FindMyLocation': 'Me localiser',
  'GeolocateControl.LocationNotAvailable': 'Position indisponible',
  'ScrollZoomBlocker.CtrlMessage': 'Ctrl + molette pour zoomer la carte',
  'ScrollZoomBlocker.CmdMessage': '⌘ + molette pour zoomer la carte',
  'TouchPanBlocker.Message': 'Deux doigts pour déplacer la carte',
  'AttributionControl.ToggleAttribution': 'Afficher les attributions',
  'FullscreenControl.Enter': 'Plein écran',
  'FullscreenControl.Exit': 'Quitter le plein écran',
};
