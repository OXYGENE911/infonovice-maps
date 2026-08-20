// Le style MapLibre du fond Plan IGN — une FONCTION PURE, pour être testée
// sans navigateur. Les tuiles viennent du WMTS Géoplateforme, couche
// « essentielle » servie sans clé (vérifié par appel réel, voir docs/apis.md).
//
// LE PROJET NE PART PAS EN VECTORIEL TOUT DE SUITE, et c'est un choix : le
// raster Plan IGN v2 est le rendu officiel, lisible immédiatement, sans
// glyphes ni sprites à héberger. Les tuiles vectorielles IGN viendront quand
// le mode sombre l'exigera vraiment (PR #3 en décidera).
import type { StyleSpecification } from 'maplibre-gl';

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

  if (fond === 'plan') {
    sources['plan-ign'] = {
      type: 'raster',
      tiles: [urlTuiles('GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2', 'image/png')],
      tileSize: 256,
      maxzoom: 19,
      attribution: ATTRIBUTION_IGN,
    };
    layers.push({ id: 'fond-plan-ign', type: 'raster', source: 'plan-ign' });
  } else {
    sources['ortho'] = {
      type: 'raster',
      tiles: [urlTuiles('ORTHOIMAGERY.ORTHOPHOTOS', 'image/jpeg')],
      tileSize: 256,
      maxzoom: 19,
      attribution: ATTRIBUTION_IGN,
    };
    layers.push({ id: 'fond-ortho', type: 'raster', source: 'ortho' });
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

  return { version: 8, name: `Fond ${fond}${cadastre ? ' + cadastre' : ''}`, sources, layers };
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
