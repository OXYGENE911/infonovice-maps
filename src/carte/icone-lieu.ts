/* LES PASTILLES DES LIEUX — dessinées par le code, jamais committées.
 *
 * LA DEMANDE. Armelin, le 31/08 : « un rond de couleur un peu plus gros, mais
 * avec un motif clairement identifiable ».
 *
 * POURQUOI UNE IMAGE, ET NON UN MARQUEUR HTML. Une vue de centre-ville porte
 * des centaines de lieux ; autant d'éléments du document feraient ramer la
 * carte au premier déplacement. MapLibre sait dessiner des milliers de
 * symboles s'ils partagent quelques images — on en fabrique donc une par
 * couple (motif, couleur), une seule fois, et la carte s'en sert autant
 * qu'elle veut.
 *
 * POURQUOI `Path2D` PLUTÔT QU'UNE IMAGE SVG. Charger un SVG en `Image` est
 * asynchrone : la couche se serait posée avant ses icônes, et l'on aurait vu
 * des trous. `Path2D` dessine sur la toile TOUT DE SUITE, à partir des mêmes
 * chaînes de chemin — même grammaire que les pictos de commodités, sans
 * l'attente.
 *
 * CE QUE CES MOTIFS NE SONT PAS : des logos d'enseignes. Les marques sont
 * déposées et le mandat interdit tout binaire au dépôt. Le motif porte le
 * TYPE ; le nom de l'enseigne s'écrit à côté, dans la fiche.
 */
import type { CleMotif } from '../lib/pictos-lieux';

/* CHAQUE MOTIF VIT DANS UN CARRÉ 24×24, comme les pictos de commodités : la
   même grammaire pour qu'ils se lisent comme une famille. `traits` est peint
   au trait, `pleins` est rempli. */
interface Dessin {
  traits?: readonly string[];
  pleins?: readonly string[];
  /** Un texte centré, quand une lettre dit mieux qu'un dessin (P, WC). */
  lettre?: string;
}

const DESSINS: Record<CleMotif, Dessin> = {
  couverts: {
    traits: [
      'M7.5 3.5v7M5.5 3.5v4a2 2 0 0 0 4 0v-4', 'M7.5 10.5v10',
      'M16.5 3.5c-1.6 0-2.6 2.2-2.6 5.2 0 1.9.9 2.6 1.8 2.6v9.2',
    ],
  },
  tasse: {
    traits: [
      'M4.5 8.5h10v5.5a4.5 4.5 0 0 1-4.5 4.5h-1a4.5 4.5 0 0 1-4.5-4.5V8.5Z',
      'M14.5 10h1.8a2.2 2.2 0 0 1 0 4.4h-1.8',
      'M6.5 3.2c0 1-.9 1.4-.9 2.4m3.6-2.4c0 1-.9 1.4-.9 2.4',
    ],
  },
  cocktail: {
    traits: ['M4 5h16l-8 8Z', 'M12 13v6', 'M8.5 19.5h7'],
    pleins: ['M4 5h16l-2.2 2.2H6.2Z'],
  },
  caddie: {
    traits: ['M2.5 4h2.6l2.6 10.4h9.6l2.2-7.4H6.4'],
    pleins: [
      'M9.4 18.6a1.7 1.7 0 1 1 0 3.4 1.7 1.7 0 0 1 0-3.4Z',
      'M16.6 18.6a1.7 1.7 0 1 1 0 3.4 1.7 1.7 0 0 1 0-3.4Z',
    ],
  },
  boutique: {
    traits: ['M4 9.5h16V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9.5Z', 'M9 13.5a3 3 0 0 0 6 0'],
    pleins: ['M3 4.5h18l1.4 4.2H1.6Z'],
  },
  vetement: {
    traits: ['M9 3.5 4 7.2l2 2.6 1.6-1.1V20.5h8.8V8.7l1.6 1.1 2-2.6L15 3.5', 'M9 3.5a3 3 0 0 0 6 0'],
  },
  lit: {
    traits: ['M3 19v-9', 'M3 13.5h18V19', 'M21 19v-2'],
    pleins: [
      'M7.4 10.4a2.2 2.2 0 1 1 0 4.4 2.2 2.2 0 0 1 0-4.4Z',
      'M11.5 12.2h9.5v1.6h-9.5Z',
    ],
  },
  colonnes: {
    traits: ['M3.5 20.5h17', 'M6 10v8M10 10v8M14 10v8M18 10v8'],
    pleins: ['M12 2.5 22 8H2Z'],
  },
  roue: {
    traits: ['M12 12 6 20.5M12 12l6 8.5', 'M4 20.5h16'],
    pleins: [
      'M12 1.6a9 9 0 1 1 0 18 9 9 0 0 1 0-18Zm0 2.6a6.4 6.4 0 1 0 0 12.8 6.4 6.4 0 0 0 0-12.8Z',
      'M12 8.6a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z',
    ],
  },
  bobine: {
    traits: ['M2.5 5.5h19v13h-19Z', 'M7 5.5v13M17 5.5v13'],
    pleins: [
      'M3.8 7h2v2.2h-2ZM3.8 11h2v2.2h-2ZM3.8 15h2v2.2h-2Z',
      'M18.2 7h2v2.2h-2ZM18.2 11h2v2.2h-2ZM18.2 15h2v2.2h-2Z',
    ],
  },
  masques: {
    traits: [
      'M3 5.5h8v7a4 4 0 0 1-8 0Z', 'M13 5.5h8v7a4 4 0 0 1-8 0Z',
      'M5.4 15.4a2.6 2.6 0 0 0 3.2 0M15.4 15.4a2.6 2.6 0 0 0 3.2 0',
    ],
  },
  croix: {
    pleins: ['M9.2 2.5h5.6v6.7h6.7v5.6h-6.7v6.7H9.2v-6.7H2.5V9.2h6.7Z'],
  },
  dent: {
    traits: [
      'M6.6 2.8C4 2.8 2.6 5 2.6 8.2c0 3 .9 4.4 1.6 7.2.6 2.4.5 5.8 2.3 5.8'
      + ' 1.9 0 1.6-5.6 3.5-5.6h4c1.9 0 1.6 5.6 3.5 5.6 1.8 0 1.7-3.4 2.3-5.8'
      + ' .7-2.8 1.6-4.2 1.6-7.2 0-3.2-1.4-5.4-4-5.4-2 0-2.8 1.2-5.4 1.2'
      + 'S8.6 2.8 6.6 2.8Z',
    ],
  },
  patte: {
    pleins: [
      'M12 12.4c2.7 0 5 2.3 5 4.6 0 1.9-1.5 3.1-3.3 3.1h-3.4C8.5 20.1 7 18.9 7 17c0-2.3 2.3-4.6 5-4.6Z',
      'M5.6 7.6a2.3 2.6 0 1 1 0 5.2 2.3 2.6 0 0 1 0-5.2Z',
      'M18.4 7.6a2.3 2.6 0 1 1 0 5.2 2.3 2.6 0 0 1 0-5.2Z',
      'M9.6 3.2a2.2 2.7 0 1 1 0 5.4 2.2 2.7 0 0 1 0-5.4Z',
      'M14.4 3.2a2.2 2.7 0 1 1 0 5.4 2.2 2.7 0 0 1 0-5.4Z',
    ],
  },
  billet: {
    traits: ['M2 5.5h20v13H2Z', 'M12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6Z'],
    pleins: ['M4 7.4h2.6v1.8H4ZM17.4 14.8H20v1.8h-2.6Z'],
  },
  parking: { lettre: 'P' },
  cle: {
    traits: [
      'M14.8 3.4a5.4 5.4 0 1 0 4.6 8.2l-3.2-3.2 1.8-1.8 3.2 3.2A5.4 5.4 0 0 0 14.8 3.4Z',
      'M12.6 11.4 3.6 20.4',
    ],
  },
  cintre: {
    traits: [
      'M12 7.4V6a2 2 0 1 1 2 2', 'M12 7.4 2.6 15.2a1 1 0 0 0 .6 1.8h17.6a1 1 0 0 0 .6-1.8L12 7.4Z',
    ],
  },
  ciseaux: {
    traits: [
      'M6.4 3.4 17.6 17.2', 'M17.6 3.4 6.4 17.2',
      'M5.6 17.2a2.8 2.8 0 1 1 0 5.6 2.8 2.8 0 0 1 0-5.6Z',
      'M18.4 17.2a2.8 2.8 0 1 1 0 5.6 2.8 2.8 0 0 1 0-5.6Z',
    ],
  },
  train: {
    traits: ['M5 3.5h14v11a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3Z', 'M5.5 7.6h13', 'M7 21l2.4-3.5M17 21l-2.4-3.5'],
    pleins: ['M8 11.6a1.6 1.6 0 1 1 0 3.2 1.6 1.6 0 0 1 0-3.2Z', 'M16 11.6a1.6 1.6 0 1 1 0 3.2 1.6 1.6 0 0 1 0-3.2Z'],
  },
  avion: {
    pleins: ['M21.4 12.4 13.6 13l-2.2 7.6-1.9.4-1-6.9-4.5.9-1-1.6L7 11l-2.4-6.4 1.7-.7 4.6 5.6 7.8-2.6c.9-.3 1.8.2 2 1.1.2.9-.4 1.8-1.3 2Z'],
  },
  haltere: {
    traits: ['M8 12h8'],
    pleins: [
      'M2 9.4h2.6v5.2H2ZM5.4 7.6H8v8.8H5.4Z',
      'M16 7.6h2.6v8.8H16ZM19.4 9.4H22v5.2h-2.6Z',
    ],
  },
  wc: { lettre: 'WC' },
  point: { pleins: ['M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8Z'] },
};

/* LA TAILLE DE LA PASTILLE, en pixels de l'image. Soixante-quatre : rendue à
   trente-deux sur la carte avec un rapport de deux, elle reste nette sur les
   écrans denses — un motif flou ne serait plus « clairement identifiable ». */
export const TAILLE_PASTILLE = 64;

/** Le rapport de pixels de l'image : MapLibre la rend à la moitié. */
export const RAPPORT_PASTILLE = 2;

/**
 * Dessine la pastille d'un lieu — un disque de la famille, le motif du type.
 *
 * LE MOTIF EST BLANC SUR LE DISQUE, jamais l'inverse : c'est le contraste le
 * plus sûr quel que soit le fond de carte, et il reste lisible à 32 pixels.
 * Le liseré blanc détache la pastille d'une route ou d'un bâtiment coloré.
 *
 * Rend `null` si la toile n'est pas disponible — l'appelant retombe alors sur
 * un simple cercle, plutôt que de poser une couche vide.
 */
export function imagePastille(motif: CleMotif, couleur: string): ImageData | null {
  const toile = document.createElement('canvas');
  toile.width = TAILLE_PASTILLE;
  toile.height = TAILLE_PASTILLE;
  const c = toile.getContext('2d');
  if (!c) return null;

  const centre = TAILLE_PASTILLE / 2;
  // L'OMBRE PORTÉE DÉTACHE LA PASTILLE d'un fond chargé, sans la cerner d'un
  // trait qui l'alourdirait.
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
  c.arc(centre, centre, centre - 7, 0, Math.PI * 2);
  c.fillStyle = couleur;
  c.fill();

  const dessin = DESSINS[motif];
  c.save();
  /* LE MOTIF EST DESSINÉ DANS SON CARRÉ 24×24, puis mis à l'échelle du disque
     intérieur : un seul jeu de coordonnées sert toutes les tailles. */
  const cote = TAILLE_PASTILLE * 0.52;
  c.translate((TAILLE_PASTILLE - cote) / 2, (TAILLE_PASTILLE - cote) / 2);
  c.scale(cote / 24, cote / 24);
  c.strokeStyle = '#FFFFFF';
  c.fillStyle = '#FFFFFF';
  c.lineWidth = 2.1;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  for (const d of dessin.pleins ?? []) c.fill(new Path2D(d));
  for (const d of dessin.traits ?? []) c.stroke(new Path2D(d));
  if (dessin.lettre !== undefined) {
    c.font = `700 ${dessin.lettre.length > 1 ? 11 : 19}px system-ui, sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(dessin.lettre, 12, 12.5);
  }
  c.restore();

  return c.getImageData(0, 0, TAILLE_PASTILLE, TAILLE_PASTILLE);
}

/**
 * La même pastille, en SVG inline — pour le DOM (chips du filtre, légendes).
 *
 * LES CHEMINS `Path2D` SONT DU CHEMIN SVG : un seul jeu de dessins sert la
 * toile de la carte ET le document. Deux jeux se seraient désaccordés au
 * premier motif retouché — c'est le même argument que pour les couleurs.
 */
export function svgPastille(motif: CleMotif, couleur: string, taille = 22): string {
  const d = DESSINS[motif];
  const morceaux: string[] = [
    `<circle cx="12" cy="12" r="11" fill="${couleur}"/>`,
  ];
  const dedans: string[] = [];
  for (const p of d.pleins ?? []) dedans.push(`<path d="${p}" fill="#FFFFFF"/>`);
  for (const p of d.traits ?? []) {
    dedans.push(`<path d="${p}" fill="none" stroke="#FFFFFF" stroke-width="2.1"`
      + ' stroke-linecap="round" stroke-linejoin="round"/>');
  }
  if (d.lettre !== undefined) {
    dedans.push(`<text x="12" y="12.5" text-anchor="middle" dominant-baseline="central"`
      + ` font-family="system-ui, sans-serif" font-weight="700"`
      + ` font-size="${d.lettre.length > 1 ? 11 : 19}" fill="#FFFFFF">${d.lettre}</text>`);
  }
  /* LE MOTIF OCCUPE LE MÊME DISQUE INTÉRIEUR que sur la carte : 52 % du
     carré, centré — les deux rendus doivent être le même dessin. */
  morceaux.push('<g transform="translate(5.76,5.76) scale(0.52)">'
    + dedans.join('') + '</g>');
  return `<svg viewBox="0 0 24 24" width="${taille}" height="${taille}"`
    + ` aria-hidden="true" focusable="false">${morceaux.join('')}</svg>`;
}

/** L'identifiant d'image d'un couple motif/couleur — une image par couple. */
export function cleImage(motif: CleMotif, couleur: string): string {
  return `poi-${motif}-${couleur.replace('#', '')}`;
}
