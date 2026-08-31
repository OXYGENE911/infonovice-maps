/* LES PICTOGRAMMES DU TRAFIC — dessinés par le code, jamais committés.
 *
 * LA DEMANDE (TRAFIC-2, 31/08). Armelin : « les accidents Bison Futé sont
 * représentés sous forme de rond rouge, ce qui n'est pas visuellement
 * parlant. Ce serait mieux d'avoir un logo dédié pour les accidents, comme un
 * logo de voiture avec une explosion. Idem pour le véhicule en panne […] une
 * dépanneuse avec un panneau d'exclamation. Les travaux […] un panneau de
 * travaux rouge et jaune. Il faut que ça parle de suite visuellement, avec
 * des logos un peu plus grands. »
 *
 * IL A RAISON SUR LE FOND : une couleur se DÉCODE (il faut la légende), un
 * dessin se RECONNAÎT. C'est le même argument que les pastilles de lieux — et
 * la même grammaire : un carré 24×24, un motif blanc sur le disque de la
 * couleur du type, dessiné au `Path2D`.
 *
 * L'EXCEPTION EST LE PANNEAU DE TRAVAUX, et elle est demandée telle quelle :
 * un TRIANGLE jaune bordé de rouge — la silhouette du panneau AK5 que tout
 * conducteur français reconnaît — et non un disque de plus. Un code de formes
 * s'apprend ; une silhouette de la route est déjà apprise.
 *
 * CE QUE CES PICTOS NE SONT PAS : les pictogrammes officiels de la
 * signalisation, qui sont des œuvres réglementaires précises. Ce sont des
 * évocations lisibles à trente-six pixels — l'exactitude réglementaire d'un
 * AK5 ne survivrait pas à cette taille.
 */
import type { Map as CarteMapLibre } from 'maplibre-gl';
import { couleurType } from '../lib/trafic';

interface Dessin {
  traits?: readonly string[];
  pleins?: readonly string[];
  lettre?: string;
}

/* CHAQUE MOTIF VIT DANS UN CARRÉ 24×24 — même grammaire que les lieux et les
   commodités, pour que tous les dessins de l'application se lisent comme une
   seule famille. */
const DESSINS: Record<string, Dessin> = {
  /* LA VOITURE ET L'ÉCLAT DE COLLISION — « un logo de voiture avec une
     explosion ». La voiture au trait, l'éclat plein : deux poids, l'œil va
     d'abord à l'éclat. */
  ACCIDENT: {
    traits: [
      'M2.5 16.5v-2a2 2 0 0 1 1.2-1.8l1.6-.7 1.7-3a1.6 1.6 0 0 1 1.4-.8h3.8'
      + 'a1.6 1.6 0 0 1 1.4.8l1 1.8',
      'M2.5 16.5h11',
      'M6.3 16.5a1.7 1.7 0 1 0 0 .01M12.7 16.5a1.7 1.7 0 1 0 0 .01',
    ],
    pleins: [
      'M18.3 2l.9 1.9 2-.7-.7 2 1.9.9-1.9.9.7 2-2-.7-.9 1.9-.9-1.9-2 .7.7-2'
      + '-1.9-.9 1.9-.9-.7-2 2 .7Z',
    ],
  },
  /* LA DÉPANNEUSE, FLÈCHE DE GRUE LEVÉE, ET SON POINT D'EXCLAMATION —
     « un logo de dépanneuse avec un panneau d'exclamation ». */
  OBSTACLE: {
    traits: [
      'M2.5 16h19',
      'M3 16v-4.5h9v4.5',
      'M12 11.5h3.4l2.8 2.3a2 2 0 0 1 .8 1.6v.6',
      'M5 11.5V6l4.6 3.4',
      'M9.6 9.4v1.3a1.1 1.1 0 0 1-2.2 0',
    ],
    pleins: [
      'M6.4 15.2a1.8 1.8 0 1 1 0 3.6 1.8 1.8 0 0 1 0-3.6Z',
      'M16.4 15.2a1.8 1.8 0 1 1 0 3.6 1.8 1.8 0 0 1 0-3.6Z',
      'M18.9 2.5h1.9l-.4 5h-1.1Z',
      'M19.85 8.9a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z',
    ],
  },
  /* LA FILE — trois voitures vues du ciel, ENTRE les bords de la voie : sans
     la route, trois rectangles empilés se lisaient comme un point
     d'exclamation (vu sur capture, pas supposé). */
  BOUCHON: {
    traits: ['M5 1.5v21M19 1.5v21'],
    pleins: [
      'M9.8 2.5h4.4a1.8 1.8 0 0 1 1.8 1.8v1.9a1.8 1.8 0 0 1-1.8 1.8H9.8'
      + 'A1.8 1.8 0 0 1 8 6.2V4.3a1.8 1.8 0 0 1 1.8-1.8Z',
      'M9.8 9.5h4.4a1.8 1.8 0 0 1 1.8 1.8v1.9a1.8 1.8 0 0 1-1.8 1.8H9.8'
      + 'A1.8 1.8 0 0 1 8 13.2v-1.9a1.8 1.8 0 0 1 1.8-1.8Z',
      'M9.8 16.5h4.4a1.8 1.8 0 0 1 1.8 1.8v1.9a1.8 1.8 0 0 1-1.8 1.8H9.8'
      + 'A1.8 1.8 0 0 1 8 20.2v-1.9a1.8 1.8 0 0 1 1.8-1.8Z',
    ],
  },
  /* LA BARRIÈRE — deux pieds, une lisse hachurée. */
  COUPURE: {
    traits: [
      'M5.5 20v-7.5M18.5 20v-7.5',
      'M3 8.5h18v4H3Z',
      'M7.2 12.5l3-4M12 12.5l3-4M16.8 12.5l3-4',
    ],
  },
  /* LE NUAGE ET SES TRAITS DE PLUIE. */
  INTEMPERIES: {
    pleins: [
      'M6.6 13a3.6 3.6 0 0 1 .3-7.1A4.8 4.8 0 0 1 16.2 5a3.9 3.9 0 0 1 1 7.7'
      + 'a1 1 0 0 1-.3.05H6.9A1.4 1.4 0 0 1 6.6 13Z',
    ],
    traits: ['M8.2 15.5l-1.3 3M12.2 15.5l-1.3 3M16.2 15.5l-1.3 3'],
  },
  /* L'ANNEAU BARRÉ — l'interdit générique. */
  RESTRICTION: {
    traits: [
      'M12 4.2a7.8 7.8 0 1 1 0 15.6 7.8 7.8 0 0 1 0-15.6Z',
      'M6.6 17.4 17.4 6.6',
    ],
  },
  /* LE CAMION DANS L'ANNEAU. */
  INTERDICTION_PL: {
    traits: ['M12 3.4a8.6 8.6 0 1 1 0 17.2 8.6 8.6 0 0 1 0-17.2Z'],
    pleins: [
      'M6.5 14.5V10h6.5v4.5Z',
      'M13.8 11.4h2.4l1.5 1.7v1.4h-3.9Z',
      'M8.6 14.2a1.3 1.3 0 1 1 0 2.6 1.3 1.3 0 0 1 0-2.6Z',
      'M14.8 14.2a1.3 1.3 0 1 1 0 2.6 1.3 1.3 0 0 1 0-2.6Z',
    ],
  },
  /* LE FEU TRICOLORE — la gestion du trafic, c'est lui. */
  MESURE_GESTION_TRAFIC: {
    traits: ['M9 2.8h6a1.4 1.4 0 0 1 1.4 1.4v13.6A1.4 1.4 0 0 1 15 19.2H9'
      + 'a1.4 1.4 0 0 1-1.4-1.4V4.2A1.4 1.4 0 0 1 9 2.8Z', 'M12 19.2v2.4'],
    pleins: [
      'M12 4.6a1.7 1.7 0 1 1 0 3.4 1.7 1.7 0 0 1 0-3.4Z',
      'M12 9.3a1.7 1.7 0 1 1 0 3.4 1.7 1.7 0 0 1 0-3.4Z',
      'M12 14a1.7 1.7 0 1 1 0 3.4 1.7 1.7 0 0 1 0-3.4Z',
    ],
  },
  INFORMATION: { lettre: 'i' },
};

/* LE PANNEAU DE CHANTIER — l'exception triangulaire, aux couleurs demandées :
   « un panneau de travaux rouge et jaune ». L'ouvrier à la pelle, en noir,
   comme sur l'AK5. */
const TRAVAUX = {
  fond: '#F4C623',
  bord: '#C0392B',
  noirs: {
    pleins: [
      'M10.2 8.1a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Z',
      'M16.6 12.4l1.9 2.2a1.7 1.7 0 0 1-2.5.5Z',
    ],
    traits: [
      'M10.6 11.6l2.7 2.3',
      'M13 8.2l4.3 5.1',
      'M6.4 17.6c1.9-1.5 4.6-1.5 6.5 0',
    ],
  },
};

/* LA TAILLE — « des logos un peu plus grands pour la visibilité ». 72 pixels
   pour un rapport de 2 : trente-six affichés, contre dix-huit pour l'ancien
   rond au zoom le plus serré. */
export const TAILLE_TRAFIC = 72;
export const RAPPORT_TRAFIC = 2;

/** L'identifiant d'image d'un type d'événement. */
export function cleImageTrafic(type: string): string {
  return `trafic-${DESSINS[type] !== undefined || type === 'TRAVAUX' ? type : 'INFORMATION'}`;
}

/** Dessine le pictogramme d'un type — `null` si la toile manque. */
export function imageEvenement(type: string): ImageData | null {
  const toile = document.createElement('canvas');
  toile.width = TAILLE_TRAFIC;
  toile.height = TAILLE_TRAFIC;
  const c = toile.getContext('2d');
  if (!c) return null;
  const centre = TAILLE_TRAFIC / 2;

  const peindreMotif = (d: Dessin, encre: string, cote: number): void => {
    c.save();
    c.translate((TAILLE_TRAFIC - cote) / 2, (TAILLE_TRAFIC - cote) / 2);
    c.scale(cote / 24, cote / 24);
    c.strokeStyle = encre;
    c.fillStyle = encre;
    c.lineWidth = 2;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    for (const p of d.pleins ?? []) c.fill(new Path2D(p));
    for (const p of d.traits ?? []) c.stroke(new Path2D(p));
    if (d.lettre !== undefined) {
      c.font = '700 19px system-ui, sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(d.lettre, 12, 12.5);
    }
    c.restore();
  };

  if (type === 'TRAVAUX') {
    /* LE TRIANGLE, ombré comme les disques pour se détacher du fond. */
    const tri = new Path2D();
    tri.moveTo(centre, 7);
    tri.lineTo(TAILLE_TRAFIC - 7, TAILLE_TRAFIC - 10);
    tri.lineTo(7, TAILLE_TRAFIC - 10);
    tri.closePath();
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.35)';
    c.shadowBlur = 5;
    c.shadowOffsetY = 1;
    c.fillStyle = TRAVAUX.fond;
    c.lineJoin = 'round';
    c.fill(tri);
    c.restore();
    c.lineWidth = 5;
    c.lineJoin = 'round';
    c.strokeStyle = TRAVAUX.bord;
    c.stroke(tri);
    peindreMotif(TRAVAUX.noirs, '#1A1A1A', TAILLE_TRAFIC * 0.5);
    return c.getImageData(0, 0, TAILLE_TRAFIC, TAILLE_TRAFIC);
  }

  const dessin = DESSINS[type] ?? DESSINS['INFORMATION']!;
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.35)';
  c.shadowBlur = 5;
  c.shadowOffsetY = 1;
  c.beginPath();
  c.arc(centre, centre, centre - 6, 0, Math.PI * 2);
  c.fillStyle = '#FFFFFF';
  c.fill();
  c.restore();
  c.beginPath();
  c.arc(centre, centre, centre - 8, 0, Math.PI * 2);
  c.fillStyle = couleurType(type);
  c.fill();
  peindreMotif(dessin, '#FFFFFF', TAILLE_TRAFIC * 0.55);
  return c.getImageData(0, 0, TAILLE_TRAFIC, TAILLE_TRAFIC);
}

/** Tous les types connus — pour poser chaque image une fois. */
export const TYPES_TRAFIC: readonly string[] = [
  'ACCIDENT', 'OBSTACLE', 'BOUCHON', 'COUPURE', 'INTEMPERIES', 'RESTRICTION',
  'INTERDICTION_PL', 'MESURE_GESTION_TRAFIC', 'INFORMATION', 'TRAVAUX',
];

/** Pose les images dans la carte — une fois, rejouable après un style.load. */
export function poserImagesTrafic(carte: CarteMapLibre): void {
  for (const type of TYPES_TRAFIC) {
    const cle = cleImageTrafic(type);
    if (carte.hasImage(cle)) continue;
    const image = imageEvenement(type);
    if (image) carte.addImage(cle, image, { pixelRatio: RAPPORT_TRAFIC });
  }
}
