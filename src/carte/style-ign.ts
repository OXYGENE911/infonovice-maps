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
  CALQUE_BATI_3D,
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
  /* LES BÂTIMENTS EN RELIEF (FOND-5, 02/09) — la réponse à « existe-t-il des
     cartes 3D gouvernementales ? ». Oui, et c'est la même tuile : voir
     etiquettes-ign.ts pour la mesure de couverture. */
  relief3d?: boolean;
  /* LES COURBES DE NIVEAU (COURBES-1, 10/09) — voir la source plus bas. */
  courbes?: boolean;
}

/* LES BORNES DE LA COUCHE DE COURBES, MESURÉES le 10/09 sur le service et non
   lues dans une documentation : une tuile de Chamonix revient en 200 aux zooms
   6 (28,7 Ko), 13 (44,7 Ko) et 18 (3,8 Ko), et le service répond 404 au zoom
   19. Les déclarer évite à la carte de demander des tuiles qui n'existent pas
   — et « ces quotas sont un bien commun ». */
export const COURBES_ZOOM_MIN = 6;
export const COURBES_ZOOM_MAX = 18;

/* L'INCLINAISON QUI VA AVEC LE RELIEF. À plat, une extrusion ne se voit PAS —
   on regarde les toits par-dessus. Cocher la case sans incliner la caméra
   donnerait une option qui ne fait rien, ce qui est le défaut qu'Armelin
   signale depuis une semaine : « un menu caché est un menu que l'utilisateur
   peut ne pas trouver ». Une option sans effet visible est pire encore. */
export const INCLINAISON_RELIEF = 50;

export function styleCarte(
  { fond, cadastre = false, courbes = false }: OptionsStyle,
): StyleSpecification {
  const sources: StyleSpecification['sources'] = {};
  const layers: StyleSpecification['layers'] = [];
  /* LE FOND EST RASTER : ses étiquettes sont PEINTES DANS L'IMAGE. Le
     satellite n'en a donc aucune, et les numéros de route s'arrêtent au zoom
     où la planche cesse de les dessiner. On les rétablit par une surcouche
     vectorielle — voir etiquettes-ign.ts pour la mesure et la provenance.
     ELLES NE SONT PLUS DANS LE STYLE INITIAL (FOND-2, 01/09), et c'est une
     mesure qui l'a exigé : déclarées à la construction de la carte, elles ne
     se dessinaient pas en production — la source restait vide, sans une
     erreur pour le dire, alors que la même carte les affichait dès qu'on
     réappliquait le MÊME style (`setStyle(getStyle())` : 66 numéros d'un
     coup, A86, A4, N104…). Le style était donc juste ; c'est le MOMENT de la
     création de la source qui ne l'était pas.
     On suit désormais la convention du reste de l'application : les couches
     se posent sur `style.load`, comme le tracé, les bornes et les POI. */
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

  /*
   * LES COURBES DE NIVEAU (COURBES-1, 10/09/2026).
   *
   * Troisième des quatre emprunts à CoMaps et OsmAnd listés le 05/09 : « un
   * calque WMTS de la Géoplateforme, pas un nouveau moteur ». C'était le seul
   * des quatre qui restât à faire — une entrée de la roadmap les disait tous
   * livrés, à tort.
   *
   * CE QUE LA COUCHE REND VRAIMENT, vérifié le 10/09 sur une tuile de
   * Chamonix : des courbes brunes cotées sur fond TRANSPARENT (PNG RVBA), ce
   * qui en fait une vraie surcouche — elle se pose sur le Plan comme sur le
   * satellite, sans cacher ni l'un ni l'autre.
   *
   * ELLE RESTE FRANCHE, à 0,85 : plus pâle, les cotes deviennent illisibles ;
   * opaque, elle mangerait les noms de rue du fond. Le cadastre, lui, est à
   * 0,75 — il couvre des surfaces, quand celles-ci ne sont que des traits.
   */
  if (courbes) {
    sources['courbes'] = {
      type: 'raster',
      tiles: [urlTuiles('ELEVATION.CONTOUR.LINE', 'image/png')],
      tileSize: 256,
      minzoom: COURBES_ZOOM_MIN,
      maxzoom: COURBES_ZOOM_MAX,
      attribution: ATTRIBUTION_IGN,
    };
    layers.push({
      id: 'surcouche-courbes', type: 'raster', source: 'courbes',
      paint: { 'raster-opacity': 0.85 },
    });
  }

  /* LES ÉTIQUETTES PASSENT EN DERNIER, cadastre compris : un texte lu sous
     une surcouche opaque ne se lit pas. */

  return {
    version: 8,
    name: `Fond ${fond}${cadastre ? ' + cadastre' : ''}${courbes ? ' + courbes' : ''}`,
    /* LES GLYPHES RESTENT DANS LE STYLE, eux : un calque de symboles ajouté
       plus tard a besoin d'une police DÉJÀ déclarée, faute de quoi MapLibre
       le refuse. C'est la seule part de la surcouche qui doit naître avec le
       style. */
    ...(etiquettes.length > 0 ? { glyphs: GLYPHES_IGN } : {}),
    sources,
    layers,
  };
}

/** La source vectorielle des étiquettes — posée APRÈS le style (FOND-2). */
export const SOURCE_ETIQUETTES = 'etiquettes-ign';

/** Sa définition, pour que l'appelant n'ait pas à connaître l'URL. */
export function sourceEtiquettes(): { type: 'vector'; tiles: string[];
  maxzoom: number; attribution: string } {
  return {
    type: 'vector', tiles: [TUILES_ETIQUETTES], maxzoom: 18,
    attribution: ATTRIBUTION_IGN,
  };
}

/**
 * Ce qu'il faut poser sur la carte une fois le style chargé — PURE.
 *
 * Sur le PLAN, seulement les numéros de route : la planche raster dessine
 * déjà les noms, et deux textes superposés décalés d'un pixel se lisent plus
 * mal qu'un. Sur le SATELLITE, les deux — la photographie ne porte rien.
 */
/* SUR DE LA PHOTO, ON ÉCRIT EN BLANC CERNÉ DE NOIR (FOND-3, 02/09).
   LE TERRAIN. Armelin : « en cartographie satellite, la police d'écriture des
   villes n'est pas belle du tout. Un halo blanc en fond pour faire ressortir
   les lettres noires du nom des villes vient faire tache avec un rendu qui
   bave un peu. »
   IL A RAISON, ET LA CAUSE EST DANS LE STYLE D'ORIGINE : les toponymes du
   PLAN IGN sont NOIRS cernés d'un halo BLANC À MOITIÉ TRANSPARENT
   (`rgba(255,255,255,0.5)`) de 2 à 3 pixels. Sur un fond clair et uni, ce
   halo ne se voit pas. Sur une photo aérienne — des tuiles, des arbres, des
   toits — il devient une tache laiteuse qui ne masque rien franchement : le
   texte noir se pose sur des zones sombres, et le halo translucide n'a pas
   assez de corps pour l'en détacher. D'où l'impression de bavure.
   LA CONVENTION CARTOGRAPHIQUE SUR IMAGERIE EST L'INVERSE : texte BLANC,
   halo NOIR OPAQUE et SERRÉ. Le blanc tient sur presque tous les sols, et un
   cerne franc de 1,6 px découpe la lettre au lieu de l'auréoler.
   ON NE TOUCHE QUE L'IMAGERIE : sur le fond Plan, le style d'origine est
   juste, et le corriger serait corriger l'IGN chez lui. */
export function pourImagerie(
  calques: StyleSpecification['layers'],
): StyleSpecification['layers'] {
  return calques.map((calque) => {
    if (calque.type !== 'symbol') return calque;
    return {
      ...calque,
      paint: {
        ...calque.paint,
        'text-color': '#FFFFFF',
        'text-halo-color': 'rgba(0, 0, 0, 0.85)',
        /* SERRÉ, ET C'EST LE POINT : un halo large auréole la lettre au lieu
           de la détacher — c'est la « bavure » signalée. */
        'text-halo-width': 1.6,
        'text-halo-blur': 0,
      },
    };
  });
}

export function calquesEtiquettes(
  fond: Fond, relief3d = false,
): StyleSpecification['layers'] {
  const textes = fond === 'plan'
    ? [...CALQUES_NUMEROS_ROUTE]
    : pourImagerie([...CALQUES_TOPONYMES, ...CALQUES_NUMEROS_ROUTE]);
  /* LE RELIEF PASSE AVANT LES TEXTES : un nom de rue caché derrière un
     immeuble ne se lit pas, et c'est le nom qu'on cherche en conduisant. */
  return relief3d ? [CALQUE_BATI_3D, ...textes] : textes;
}

/** Le style historique de la PR #2, conservé comme raccourci. */
export function styleIGNPlan(): StyleSpecification {
  return styleCarte({ fond: 'plan' });
}

/* LES LIBELLÉS FRANÇAIS DES CONTRÔLES MapLibre. La bibliothèque parle anglais
   par défaut, et une carte française qui dit « Zoom in » à un lecteur d'écran
   rate sa première promesse.
   LA TABLE EST RECOPIÉE DE LA BIBLIOTHÈQUE, PAS DEVINÉE (LOCALE-FR-2,
   07/09/2026). Trois clés d'ici — `ScrollZoomBlocker.*`, `TouchPanBlocker.*` —
   ne correspondaient à RIEN dans MapLibre 6 : elles nommaient une API
   disparue, et leurs traductions n'avaient jamais servi. Un libellé mal nommé
   ne se plaint pas ; il se contente de rester anglais. Deux l'étaient encore,
   trouvés en tabulant l'application au clavier : le canevas se présentait
   comme « Map », et la croix des fiches comme « Close popup ».
   Les clés sont celles de `maplibre-gl` 6.6 ; les unités de l'échelle (km)
   n'ont pas à être traduites. */
export const LOCALE_FR: Record<string, string> = {
  'Map.Title': 'Carte',
  'Marker.Title': 'Repère sur la carte',
  'Popup.Close': 'Fermer la fiche',
  'NavigationControl.ZoomIn': 'Zoomer',
  'NavigationControl.ZoomOut': 'Dézoomer',
  'NavigationControl.ResetBearing': 'Remettre le nord en haut',
  'GeolocateControl.FindMyLocation': 'Me localiser',
  'GeolocateControl.LocationNotAvailable': 'Position indisponible',
  'CooperativeGesturesHandler.WindowsHelpText': 'Ctrl + molette pour zoomer la carte',
  'CooperativeGesturesHandler.MacHelpText': '⌘ + molette pour zoomer la carte',
  'CooperativeGesturesHandler.MobileHelpText': 'Deux doigts pour déplacer la carte',
  'AttributionControl.ToggleAttribution': 'Afficher les attributions',
  'AttributionControl.MapFeedback': 'Signaler un problème sur la carte',
  'LogoControl.Title': 'Logo MapLibre',
  'FullscreenControl.Enter': 'Plein écran',
  'FullscreenControl.Exit': 'Quitter le plein écran',
  'GlobeControl.Enable': 'Passer en globe',
  'GlobeControl.Disable': 'Quitter le globe',
  'TerrainControl.Enable': 'Afficher le relief',
  'TerrainControl.Disable': 'Masquer le relief',
};
