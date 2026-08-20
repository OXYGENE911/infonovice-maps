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

export function styleIGNPlan(): StyleSpecification {
  return {
    version: 8,
    name: 'Plan IGN v2',
    sources: {
      'plan-ign': {
        type: 'raster',
        tiles: [urlTuiles('GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2', 'image/png')],
        tileSize: 256,
        // Le WMTS PM s'arrête à 19 pour Plan IGN v2 ; au-delà MapLibre
        // sur-échantillonne proprement.
        maxzoom: 19,
        attribution: ATTRIBUTION_IGN,
      },
    },
    layers: [
      { id: 'fond-plan-ign', type: 'raster', source: 'plan-ign' },
    ],
  };
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
