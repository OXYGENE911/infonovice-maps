// Les étiquettes qui manquent au fond raster — EXTRAITES DU STYLE OFFICIEL.
//
// LE TERRAIN (Armelin, 01/09), deux défauts d'un coup :
//  1. « Quand je configure la carte avec un fond Carte Satellite, les noms de
//     ville et village ne s'affichent pas. »
//  2. « Gros défaut pour une application de cartographie : quand on zoome, il
//     n'y a pas les numéros de nationale, départementale et autoroute qui
//     s'affichent sur la carte. Par contre, dans la feuille de route, ces
//     indications apparaissent. »
//
// LE FOND EST RASTER, ET C'EST LA CAUSE. Les tuiles Plan IGN portent leurs
// étiquettes DANS L'IMAGE : le satellite n'en a donc aucune, et les numéros de
// route disparaissent au-delà du zoom où la planche raster les dessine. On ne
// peut pas « rallumer » ce qui est peint dans un JPEG.
//
// CE QUI EST FAIT : une SURCOUCHE VECTORIELLE, posée par-dessus le raster.
// Mesuré le 01/09, sans clé : les tuiles `data.geopf.fr/tms/1.0.0/PLAN.IGN`
// répondent 200 (58 Ko pour une tuile de zoom 12), le style officiel aussi
// (288 Ko), et les glyphes « Source Sans Pro Regular » également (67 Ko).
//
// LES CALQUES CI-DESSOUS SONT CEUX D'IGN, pas les miens : ils sont extraits du
// style officiel PLAN.IGN et retargetés sur notre source. Écrire nos propres
// règles aurait produit un rendu qui ressemble à l'IGN sans en être — mêmes
// seuils de zoom, mêmes tailles, même hiérarchie de communes, gratuitement.
// Ce qui dépend du SPRITE a été retiré (nous ne l'hébergeons pas) : il ne
// servait qu'à poser un cartouche derrière le texte, que le halo remplace.
//
// C'EST UN INSTANTANÉ, PAS UN APPEL. Le style ne se retélécharge pas à chaque
// démarrage : 288 Ko à chaque ouverture pour quarante calques serait payer
// cher une donnée qui bouge une fois l'an.
import type { LayerSpecification } from 'maplibre-gl';

/** Les tuiles vectorielles IGN, servies sans clé (vérifié le 01/09). */
export const TUILES_ETIQUETTES =
  'https://data.geopf.fr/tms/1.0.0/PLAN.IGN/{z}/{x}/{y}.pbf';

/** Les polices du même service — sans elles, aucun texte ne se dessine. */
export const GLYPHES_IGN =
  'https://data.geopf.fr/annexes/ressources/vectorTiles/fonts/{fontstack}/{range}.pbf';

/* LE RELIEF DES BÂTIMENTS (FOND-5, 02/09).
 *
 * LA QUESTION D'ARMELIN, mot pour mot : « existe-t-il des cartes 3D
 * gouvernementales pour une navigation en 3D avec les bâtiments en relief ? »
 *
 * LA RÉPONSE EST OUI, ET ELLE ÉTAIT DÉJÀ DANS NOS TUILES. Les mêmes tuiles
 * vectorielles PLAN.IGN qui portent les noms de rue portent une couche
 * `bati_surf`, et cette couche porte un attribut `hauteur` en mètres. Aucune
 * source de plus, aucune clé, aucun octet de plus sur le réseau : la tuile est
 * déjà téléchargée pour les étiquettes.
 *
 * CE QUE J'AI MESURÉ AVANT D'ÉCRIRE (02/09), en décodant cinq tuiles réelles :
 *   - Paris 4e (z16)        : 710 bâtiments, 583 avec hauteur (82 %),
 *                             médiane 8,8 m, max 35,7 m ;
 *   - Lyon (z15)            : 2 222 bâtiments, 1 806 avec hauteur (81 %) ;
 *   - Le Plessis-Trévise    : 256 bâtiments, 175 avec hauteur (68 %),
 *                             médiane 5,1 m — du pavillonnaire, et ça se voit ;
 *   - Marseille, un village de Charente : 100 %.
 * Les valeurs sont plausibles, en mètres, et la couverture tient entre 68 et
 * 100 %. C'est utilisable.
 *
 * LES 18 À 32 % SANS HAUTEUR RESTENT PLATS, et c'est délibéré : leur donner
 * une hauteur par défaut ferait une ville inventée. Le fond raster continue de
 * les dessiner en deux dimensions — ils ne disparaissent pas, ils ne mentent
 * pas.
 *
 * PAS DE `alti_sol` EN BASE. L'attribut existe mais c'est l'altitude
 * ABSOLUE du sol (des dizaines à des centaines de mètres) : le passer en
 * `fill-extrusion-base` ferait flotter Paris à trente-cinq mètres au-dessus
 * de sa propre carte. La base est le sol, donc zéro.
 */
export const CALQUE_BATI_3D: LayerSpecification = {
  id: 'bati-relief',
  type: 'fill-extrusion',
  source: 'etiquettes-ign',
  'source-layer': 'bati_surf',
  /* QUINZE, PARCE QUE C'EST LÀ QUE LA COUCHE COMMENCE À ÊTRE PEUPLÉE — et
     parce qu'en dessous, des volumes de cinq mètres sur une ville entière ne
     font qu'un tapis gris. */
  minzoom: 15,
  paint: {
    'fill-extrusion-color': '#cfc8bf',
    'fill-extrusion-base': 0,
    /* SANS HAUTEUR, ZÉRO : le bâtiment reste plat plutôt qu'inventé. */
    'fill-extrusion-height': ['to-number', ['get', 'hauteur'], 0],
    /* UNE APPARITION PROGRESSIVE : surgir d'un coup au zoom 15 ferait sauter
       la carte sous le doigt. */
    'fill-extrusion-opacity': [
      'interpolate', ['linear'], ['zoom'], 15, 0, 16, 0.85,
    ],
  },
};

/* LES NUMÉROS DE ROUTE : autoroute et nationale dès le zoom 7,
   départementale à partir du 11 — les seuils d'IGN, pas les nôtres.

   ET DEPUIS FOND-6 (02/09), CHACUN DANS SON ÉCUSSON. Armelin : « on voit les
   numéros des routes s'afficher seulement au format texte […] sur Google Maps,
   une autoroute apparaît dans un cartouche rouge A86 aux contours blancs. »
   C'est la signalisation française : blanc sur rouge pour l'autoroute et la
   nationale, noir sur jaune pour la départementale.
   L'IMAGE EST DESSINÉE À L'EXÉCUTION (voir cartouche-route.ts) et ÉTIRÉE
   autour du texte par MapLibre — aucun sprite à héberger, aucune requête. Le
   halo disparaît : il servait à détacher un texte nu, l'écusson le fait mieux.
   `icon-optional` GARDE LE NUMÉRO SI L'ÉCUSSON MANQUE : sur un navigateur
   sans canevas 2D, on écrit le numéro nu plutôt que rien. */
export const CALQUES_NUMEROS_ROUTE: LayerSpecification[] = [
    {
      "id": "num-route-toponyme-num-ro-de-route-d-partementale",
      "type": "symbol",
      "source": "etiquettes-ign",
      "source-layer": "toponyme_routier_numero_lin",
      "minzoom": 11,
      "maxzoom": 16,
      "filter": [
        "==",
        "txt_typo",
        "Départementale"
      ],
      "layout": {
        "visibility": "visible",
        "symbol-placement": "line",
        "text-field": "{texte}",
        "text-size": 10.5,
        "text-allow-overlap": false,
        "text-padding": 2,
        "text-anchor": "center",
        "text-font": [
          "Source Sans Pro Semibold"
        ],
        "text-rotation-alignment": "viewport",
        "icon-image": "cartouche-jaune",
        "icon-text-fit": "both",
        "icon-text-fit-padding": [1, 3, 1, 3],
        "icon-rotation-alignment": "viewport",
        "icon-allow-overlap": false,
        "icon-optional": true
      },
      "paint": {
        "text-color": "#1A1A1A",
        "text-halo-width": 0
      }
    },
    {
      "id": "num-route-toponyme-num-ro-de-route-nationale",
      "type": "symbol",
      "source": "etiquettes-ign",
      "source-layer": "toponyme_routier_numero_lin",
      "minzoom": 7,
      "maxzoom": 16,
      "filter": [
        "==",
        "txt_typo",
        "Nationale"
      ],
      "layout": {
        "visibility": "visible",
        "symbol-placement": "line",
        "text-field": "{texte}",
        "text-size": 12,
        "text-allow-overlap": false,
        "text-padding": 0,
        "text-anchor": "center",
        "text-font": [
          "Source Sans Pro Regular"
        ],
        "text-rotation-alignment": "viewport",
        "icon-image": "cartouche-rouge",
        "icon-text-fit": "both",
        "icon-text-fit-padding": [1, 3, 1, 3],
        "icon-rotation-alignment": "viewport",
        "icon-allow-overlap": false,
        "icon-optional": true
      },
      "paint": {
        "text-color": "#FFFFFF",
        "text-halo-width": 0
      }
    },
    {
      "id": "num-route-toponyme-num-ro-de-route-autoroute",
      "type": "symbol",
      "source": "etiquettes-ign",
      "source-layer": "toponyme_routier_numero_lin",
      "minzoom": 7,
      "maxzoom": 16,
      "filter": [
        "==",
        "txt_typo",
        "Autoroute"
      ],
      "layout": {
        "visibility": "visible",
        "symbol-placement": "line",
        "text-field": "{texte}",
        "text-size": 15,
        "text-allow-overlap": false,
        "text-padding": 0,
        "text-anchor": "center",
        "text-font": [
          "Source Sans Pro Regular"
        ],
        "text-rotation-alignment": "viewport",
        "icon-image": "cartouche-rouge",
        "icon-text-fit": "both",
        "icon-text-fit-padding": [1, 3, 1, 3],
        "icon-rotation-alignment": "viewport",
        "icon-allow-overlap": false,
        "icon-optional": true
      },
      "paint": {
        "text-color": "#FFFFFF",
        "text-halo-width": 0
      }
    }
  ] as unknown as LayerSpecification[];

/* LES NOMS DE COMMUNES, par importance aux petits zooms et par typographie
   aux grands. Lieux-dits, quartiers, pays et continents sont laissés de côté :
   la demande porte sur « les noms de ville et village ». */
/* LES NOMS DE RUE MANQUAIENT SUR LE SATELLITE (FOND-4, 02/09). Armelin :
   « en mode satellite, quand on zoome au maximum sur une rue, les noms de rue
   ne sont pas affichés alors qu'ils le sont en carte IGN. »
   IL A RAISON, ET LA CAUSE EST DANS MON EXTRACTION : FOND-1 avait pris les
   toponymes de LOCALITÉ — les noms de villes — et les numéros de route, mais
   PAS `toponyme_routier_odonyme_lin`, la couche des ODONYMES. Elle était dans
   les mêmes tuiles depuis le début ; je ne l'avais pas vue.
   DEUX CALQUES, ET C'EST LE STYLE OFFICIEL QUI LE VEUT : la forme abrégée
   (« R. de la Paix ») entre les zooms 15 et 17, la forme entière au-delà.
   Sur imagerie, `pourImagerie` les repeint en blanc cerné de noir comme les
   autres — ils héritent de la règle sans qu'on la répète. */
export const CALQUES_TOPONYMES: LayerSpecification[] = [
    {
      "id": "toponyme-toponyme-localite-importance-5",
      "type": "symbol",
      "source": "etiquettes-ign",
      "source-layer": "toponyme_localite_ponc",
      "minzoom": 9,
      "maxzoom": 13,
      "filter": [
        "in",
        "txt_typo",
        "TYPO_A_5",
        "BAT_COMMUNE_5",
        "BAT_COMMUNE_5_T",
        "BAT_CHEF_LIEU_COM",
        "BAT_CHEF_LIEU_COM_T",
        "BAT_CHEF_LIEU_COM-T",
        "BAT_ANCIENNE_COM",
        "BAT_ANCIENNE_COM_T",
        "BAT_COMMUNE_ASSOCIEE",
        "BAT_COMMUNE_ASSOCIEE_T",
        "Commune très petite"
      ],
      "layout": {
        "visibility": "visible",
        "symbol-placement": "point",
        "text-field": "{texte}",
        "text-size": 11.5,
        "text-allow-overlap": false,
        "text-anchor": "bottom-left",
        "text-offset": [
          0.3,
          0.1
        ],
        "text-padding": 1,
        "text-font": [
          "Source Sans Pro Regular"
        ]
      },
      "paint": {
        "text-color": "#000000",
        "text-halo-color": "rgba(255, 255, 255, 0.5)",
        "text-halo-width": 2
      }
    },
    {
      "id": "toponyme-toponyme-localite-importance-4",
      "type": "symbol",
      "source": "etiquettes-ign",
      "source-layer": "toponyme_localite_ponc",
      "minzoom": 7,
      "maxzoom": 13,
      "filter": [
        "in",
        "txt_typo",
        "TYPO_A_4",
        "BAT_COMMUNE_4",
        "BAT_COMMUNE_4_T"
      ],
      "layout": {
        "visibility": "visible",
        "symbol-placement": "point",
        "text-field": "{texte}",
        "text-size": 13,
        "text-allow-overlap": false,
        "text-anchor": "bottom-left",
        "text-offset": [
          0.3,
          0.1
        ],
        "text-padding": 1,
        "text-font": [
          "Source Sans Pro Regular"
        ]
      },
      "paint": {
        "text-color": "#000000",
        "text-halo-color": "rgba(255, 255, 255, 0.5)",
        "text-halo-width": 2
      }
    },
    {
      "id": "toponyme-toponyme-localite-importance-3",
      "type": "symbol",
      "source": "etiquettes-ign",
      "source-layer": "toponyme_localite_ponc",
      "minzoom": 5,
      "maxzoom": 13,
      "filter": [
        "in",
        "txt_typo",
        "commune 3",
        "TYPO_A_3",
        "BAT_COMMUNE_3",
        "BAT_COMMUNE_3_T"
      ],
      "layout": {
        "visibility": "visible",
        "symbol-placement": "point",
        "text-field": "{texte}",
        "text-size": {
          "stops": [
            [
              5,
              10
            ],
            [
              6,
              15
            ]
          ]
        },
        "text-allow-overlap": false,
        "text-anchor": "bottom-left",
        "text-offset": [
          0.3,
          0.1
        ],
        "text-padding": 1,
        "text-font": [
          "Source Sans Pro Regular"
        ]
      },
      "paint": {
        "text-color": "#000000",
        "text-halo-color": "rgba(255, 255, 255, 0.5)",
        "text-halo-width": 2
      }
    },
    {
      "id": "toponyme-toponyme-localite-importance-2",
      "type": "symbol",
      "source": "etiquettes-ign",
      "source-layer": "toponyme_localite_ponc",
      "minzoom": 4,
      "maxzoom": 13,
      "filter": [
        "in",
        "txt_typo",
        "commune 2",
        "TYPO_A_2",
        "BAT_COMMUNE_2",
        "BAT_COMMUNE-2",
        "BAT_COMMUNE_2_T"
      ],
      "layout": {
        "visibility": "visible",
        "symbol-placement": "point",
        "text-field": "{texte}",
        "text-size": {
          "stops": [
            [
              4,
              10
            ],
            [
              6,
              17
            ]
          ]
        },
        "text-allow-overlap": false,
        "text-anchor": "bottom-left",
        "text-offset": [
          0.3,
          0.2
        ],
        "text-padding": 1,
        "text-transform": "uppercase",
        "text-font": {
          "stops": [
            [
              1,
              [
                "Source Sans Pro Regular"
              ]
            ],
            [
              7,
              [
                "Source Sans Pro Bold"
              ]
            ],
            [
              10,
              [
                "Source Sans Pro Regular"
              ]
            ]
          ]
        }
      },
      "paint": {
        "text-color": "#000000",
        "text-halo-color": "rgba(255, 255, 255, 0.5)",
        "text-halo-width": 3
      }
    },
    {
      "id": "toponyme-toponyme-localite-n0-typoa8-commune",
      "type": "symbol",
      "source": "etiquettes-ign",
      "source-layer": "toponyme_localite_ponc",
      "minzoom": 13,
      "maxzoom": 18,
      "filter": [
        "all",
        [
          "in",
          "symbo",
          "COMMUNE_FUSIONNEE",
          "COMMUNE_CHEF_LIEU"
        ],
        [
          "==",
          "txt_typo",
          "TYPO_A_8"
        ]
      ],
      "layout": {
        "visibility": "visible",
        "symbol-placement": "point",
        "text-field": "{texte}",
        "text-size": {
          "stops": [
            [
              15,
              12
            ],
            [
              17,
              15
            ]
          ]
        },
        "text-allow-overlap": false,
        "text-anchor": "center",
        "text-padding": 1,
        "text-transform": "uppercase",
        "text-font": [
          "Source Sans Pro Regular"
        ]
      },
      "paint": {
        "text-color": "#000000",
        "text-halo-color": "rgba(255, 255, 255, 0.5)",
        "text-halo-width": 2
      }
    },
    {
      "id": "toponyme-toponyme-localite-n0-typoa7-commune",
      "type": "symbol",
      "source": "etiquettes-ign",
      "source-layer": "toponyme_localite_ponc",
      "minzoom": 13,
      "maxzoom": 18,
      "filter": [
        "all",
        [
          "in",
          "symbo",
          "COMMUNE_FUSIONNEE",
          "COMMUNE_CHEF_LIEU"
        ],
        [
          "==",
          "txt_typo",
          "TYPO_A_7"
        ]
      ],
      "layout": {
        "visibility": "visible",
        "symbol-placement": "point",
        "text-field": "{texte}",
        "text-size": {
          "stops": [
            [
              15,
              13
            ],
            [
              17,
              16
            ]
          ]
        },
        "text-allow-overlap": false,
        "text-anchor": "center",
        "text-padding": 1,
        "text-transform": "uppercase",
        "text-font": [
          "Source Sans Pro Regular"
        ]
      },
      "paint": {
        "text-color": "#000000",
        "text-halo-color": "rgba(255, 255, 255, 0.5)",
        "text-halo-width": 2
      }
    },
    {
      "id": "toponyme-toponyme-localite-n0-typoa5eta6-commune",
      "type": "symbol",
      "source": "etiquettes-ign",
      "source-layer": "toponyme_localite_ponc",
      "minzoom": 13,
      "maxzoom": 18,
      "filter": [
        "all",
        [
          "in",
          "symbo",
          "COMMUNE_FUSIONNEE",
          "COMMUNE_CHEF_LIEU"
        ],
        [
          "in",
          "txt_typo",
          "TYPO_A_5",
          "TYPO_A_6"
        ]
      ],
      "layout": {
        "visibility": "visible",
        "symbol-placement": "point",
        "text-field": "{texte}",
        "text-size": {
          "stops": [
            [
              15,
              15
            ],
            [
              17,
              18
            ]
          ]
        },
        "text-allow-overlap": false,
        "text-anchor": "center",
        "text-padding": 1,
        "text-transform": "uppercase",
        "text-font": [
          "Source Sans Pro Regular"
        ]
      },
      "paint": {
        "text-color": "#000000",
        "text-halo-color": "rgba(255, 255, 255, 0.5)",
        "text-halo-width": 2
      }
    },
    {
      "id": "toponyme-toponyme-localite-n0-typoa4-commune",
      "type": "symbol",
      "source": "etiquettes-ign",
      "source-layer": "toponyme_localite_ponc",
      "minzoom": 13,
      "maxzoom": 16,
      "filter": [
        "all",
        [
          "in",
          "symbo",
          "COMMUNE_FUSIONNEE",
          "COMMUNE_CHEF_LIEU"
        ],
        [
          "==",
          "txt_typo",
          "TYPO_A_4"
        ]
      ],
      "layout": {
        "visibility": "visible",
        "symbol-placement": "point",
        "text-field": "{texte}",
        "text-size": 17,
        "text-allow-overlap": false,
        "text-anchor": "center",
        "text-padding": 1,
        "text-transform": "uppercase",
        "text-font": [
          "Source Sans Pro Regular"
        ]
      },
      "paint": {
        "text-color": "#000000",
        "text-halo-color": "rgba(255, 255, 255, 0.5)",
        "text-halo-width": 3
      }
    },
    {
      "id": "toponyme-toponyme-localite-n0-typoa3-commune",
      "type": "symbol",
      "source": "etiquettes-ign",
      "source-layer": "toponyme_localite_ponc",
      "minzoom": 13,
      "maxzoom": 16,
      "filter": [
        "all",
        [
          "in",
          "symbo",
          "COMMUNE_FUSIONNEE",
          "COMMUNE_CHEF_LIEU"
        ],
        [
          "==",
          "txt_typo",
          "TYPO_A_3"
        ]
      ],
      "layout": {
        "visibility": "visible",
        "symbol-placement": "point",
        "text-field": "{texte}",
        "text-size": 19,
        "text-allow-overlap": false,
        "text-anchor": "center",
        "text-padding": 1,
        "text-transform": "uppercase",
        "text-font": [
          "Source Sans Pro Regular"
        ]
      },
      "paint": {
        "text-color": "#000000",
        "text-halo-color": "rgba(255, 255, 255, 0.5)",
        "text-halo-width": 3
      }
    },
    {
      "id": "toponyme-toponyme-localite-n0-typoa2-commune",
      "type": "symbol",
      "source": "etiquettes-ign",
      "source-layer": "toponyme_localite_ponc",
      "minzoom": 13,
      "maxzoom": 16,
      "filter": [
        "all",
        [
          "in",
          "symbo",
          "COMMUNE_FUSIONNEE",
          "COMMUNE_CHEF_LIEU"
        ],
        [
          "==",
          "txt_typo",
          "TYPO_A_2"
        ]
      ],
      "layout": {
        "visibility": "visible",
        "symbol-placement": "point",
        "text-field": "{texte}",
        "text-size": 21,
        "text-allow-overlap": false,
        "text-anchor": "center",
        "text-padding": 1,
        "text-transform": "uppercase",
        "text-font": [
          "Source Sans Pro Regular"
        ]
      },
      "paint": {
        "text-color": "#000000",
        "text-halo-color": "rgba(255, 255, 255, 0.5)",
        "text-halo-width": 4
      }
    },
    {
      "id": "toponyme-toponyme-localite-importance-1",
      "type": "symbol",
      "source": "etiquettes-ign",
      "source-layer": "toponyme_localite_ponc",
      "minzoom": 3,
      "maxzoom": 13,
      "filter": [
        "in",
        "txt_typo",
        "commune 1",
        "TYPO_A_1",
        "BAT_COMMUNE_1",
        "BAT_COMMUNE_1_T"
      ],
      "layout": {
        "visibility": "visible",
        "symbol-placement": "point",
        "text-field": "{texte}",
        "text-size": {
          "stops": [
            [
              3,
              10
            ],
            [
              6,
              20
            ]
          ]
        },
        "text-allow-overlap": false,
        "text-anchor": "bottom-left",
        "text-offset": [
          0.25,
          -0.1
        ],
        "text-padding": 1,
        "text-transform": "uppercase",
        "text-font": {
          "stops": [
            [
              1,
              [
                "Source Sans Pro Regular"
              ]
            ],
            [
              7,
              [
                "Source Sans Pro Bold"
              ]
            ],
            [
              10,
              [
                "Source Sans Pro Regular"
              ]
            ]
          ]
        }
      },
      "paint": {
        "text-color": "#000000",
        "text-halo-color": "rgba(255, 255, 255, 0.5)",
        "text-halo-width": 4
      }
    },
    {
      "id": "toponyme-toponyme-localite-n0-typoa1-commune",
      "type": "symbol",
      "source": "etiquettes-ign",
      "source-layer": "toponyme_localite_ponc",
      "minzoom": 13,
      "maxzoom": 16,
      "filter": [
        "all",
        [
          "in",
          "symbo",
          "COMMUNE_FUSIONNEE",
          "COMMUNE_CHEF_LIEU"
        ],
        [
          "==",
          "txt_typo",
          "TYPO_A_1"
        ]
      ],
      "layout": {
        "visibility": "visible",
        "symbol-placement": "point",
        "text-field": "{texte}",
        "text-size": 23,
        "text-allow-overlap": false,
        "text-anchor": "center",
        "text-padding": 1,
        "text-transform": "uppercase",
        "text-font": [
          "Source Sans Pro Regular"
        ]
      },
      "paint": {
        "text-color": "#000000",
        "text-halo-color": "rgba(255, 255, 255, 0.5)",
        "text-halo-width": 4
      }
    }
    ,
    {
      "id": "odonyme-abrege",
      "type": "symbol",
      "source-layer": "toponyme_routier_odonyme_lin",
      "minzoom": 15,
      "maxzoom": 17,
      "layout": {
        "symbol-placement": "line",
        "text-field": "{nom_gauche}",
        "text-size": 10,
        "text-anchor": "center",
        "text-max-angle": 30,
        "text-font": ["Source Sans Pro Regular"]
      },
      "paint": {
        "text-color": "#000000",
        "text-halo-color": "rgba(255, 255, 255, 1)",
        "text-halo-width": 2
      }
    },
    {
      "id": "odonyme-desabrege",
      "type": "symbol",
      "source-layer": "toponyme_routier_odonyme_lin",
      "minzoom": 17,
      "layout": {
        "symbol-placement": "line",
        "text-field": "{nom_desabrege}",
        "text-size": 11,
        "text-anchor": "center",
        "text-max-angle": 30,
        "text-font": ["Source Sans Pro Regular"]
      },
      "paint": {
        "text-color": "#000000",
        "text-halo-color": "rgba(255, 255, 255, 1)",
        "text-halo-width": 2
      }
    }
  ] as unknown as LayerSpecification[];
