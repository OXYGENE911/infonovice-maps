// LES CARTOUCHES DE ROUTE — les numéros dans leur écusson (FOND-6, 02/09).
//
// LE TERRAIN. Armelin, premier retour utilisateur : « quand on scrolle sur une
// carte, on voit les numéros des routes s'afficher seulement au format texte.
// Ce serait bien que les routes et autoroutes soient affichées dans leur vrai
// cartouche cartographique. Par exemple, l'autoroute A86 apparaît seulement
// sous format texte écrit en blanc au contour noir, alors que sur Google Maps,
// une autoroute apparaît dans un cartouche rouge A86 aux contours blancs. »
// Photo à l'appui : A75 et N89 sur fond ROUGE, D245 sur fond JAUNE.
//
// IL A RAISON, ET C'EST LA SIGNALISATION FRANÇAISE. Sur les panneaux de
// direction, le numéro d'autoroute et de nationale se lit en blanc sur rouge,
// la départementale en noir sur jaune. Un numéro nu, en blanc cerné de noir,
// ne dit pas de quelle sorte de route il s'agit — or c'est précisément ce
// qu'on cherche à savoir d'un coup d'œil.
//
// CE QUE LES TUILES DONNENT, MESURÉ (02/09, trois tuiles décodées) : la couche
// `toponyme_routier_numero_lin` porte un attribut `txt_typo` à TROIS valeurs,
// et trois seulement — « Autoroute » (A13, A14), « Nationale » (N10, N12,
// N13, N184) et « Départementale » (D195, D838, D936, D938). Les routes
// européennes (E11), forestières (F5), rurales (R3) et communales (C5) de la
// photo n'y figurent pas : on ne fabrique donc pas d'écusson pour elles.
//
// AUCUN FICHIER, AUCUNE REQUÊTE. MapLibre sait étirer une image posée à
// l'exécution (`stretchX`/`stretchY`) pour l'ajuster au texte qu'elle
// entoure : on DESSINE les deux écussons sur un canevas au démarrage. Le
// sprite officiel d'IGN aurait demandé de l'héberger — c'est d'ailleurs
// pourquoi FOND-1 avait retiré tout ce qui en dépendait.

/** Un écusson : ses couleurs, et la clé sous laquelle MapLibre le connaît. */
export interface StyleCartouche {
  cle: string;
  /** Le fond de l'écusson. */
  fond: string;
  /** La couleur du numéro écrit dedans. */
  texte: string;
  /** Le liseré, qui détache l'écusson d'un fond quelconque. */
  bord: string;
}

/* LES COULEURS SONT CELLES DES PANNEAUX, pas des goûts : rouge signalisation
   pour l'autoroute et la nationale, jaune pour la départementale. Le liseré
   blanc n'est pas décoratif — sur une photographie aérienne, un écusson sans
   liseré se fond dans les toits. */
export const CARTOUCHE_ROUGE: StyleCartouche = {
  cle: 'cartouche-rouge', fond: '#C8102E', texte: '#FFFFFF', bord: '#FFFFFF',
};
export const CARTOUCHE_JAUNE: StyleCartouche = {
  cle: 'cartouche-jaune', fond: '#F2C300', texte: '#1A1A1A', bord: '#FFFFFF',
};

export const CARTOUCHES: readonly StyleCartouche[] = [CARTOUCHE_ROUGE, CARTOUCHE_JAUNE];

/**
 * L'écusson d'une catégorie de route — PURE.
 *
 * `null` pour une catégorie qu'on ne sait pas habiller : on écrit alors le
 * numéro nu, comme avant, plutôt que de lui inventer une couleur.
 */
export function cartouchePour(txtTypo: string): StyleCartouche | null {
  if (txtTypo === 'Autoroute' || txtTypo === 'Nationale') return CARTOUCHE_ROUGE;
  if (txtTypo === 'Départementale') return CARTOUCHE_JAUNE;
  return null;
}

/* LA GÉOMÉTRIE DE L'ÉCUSSON, en pixels de dessin (avant le rapport d'écran).
   Vingt-huit sur vingt : assez large pour « A13 » sans étirement, et la zone
   étirable reprend le milieu pour « D1054 ». */
export const LARGEUR = 28;
export const HAUTEUR = 20;
/** Rayon des coins — l'écusson français est un rectangle très arrondi. */
export const RAYON = 5;

/**
 * Les zones étirables et la boîte de texte — PURES.
 *
 * MapLibre étire UNIQUEMENT ce qu'on lui désigne : sans ces bornes, un numéro
 * à cinq caractères déformerait les coins arrondis en ovales. On n'étire donc
 * que la bande centrale, coins exclus.
 */
export function zonesEtirables(ratio: number): {
  stretchX: [number, number][];
  stretchY: [number, number][];
  content: [number, number, number, number];
  pixelRatio: number;
} {
  const marge = RAYON * ratio;
  const l = LARGEUR * ratio;
  const h = HAUTEUR * ratio;
  return {
    stretchX: [[marge, l - marge]],
    stretchY: [[marge, h - marge]],
    /* LA BOÎTE DE TEXTE ÉPOUSE L'INTÉRIEUR, liseré compris : sans cette
       marge, un « 1054 » toucherait le bord et se lirait mal. */
    content: [marge * 0.6, marge * 0.4, l - marge * 0.6, h - marge * 0.4],
    pixelRatio: ratio,
  };
}

/** Trace un rectangle à coins arrondis — le contour d'un écusson. */
function cheminArrondi(
  ctx: CanvasRenderingContext2D, x: number, y: number,
  l: number, h: number, r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + l - r, y);
  ctx.quadraticCurveTo(x + l, y, x + l, y + r);
  ctx.lineTo(x + l, y + h - r);
  ctx.quadraticCurveTo(x + l, y + h, x + l - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/**
 * Dessine l'écusson et rend ses pixels, prêts pour `map.addImage`.
 *
 * `null` quand le navigateur ne rend pas de contexte 2D — les numéros
 * s'écrivent alors nus, comme avant. Une carte sans écussons vaut mieux
 * qu'une carte qui refuse de se dessiner.
 */
export function imageCartouche(
  style: StyleCartouche, ratio = 2,
): { width: number; height: number; data: Uint8ClampedArray } | null {
  const l = Math.round(LARGEUR * ratio);
  const h = Math.round(HAUTEUR * ratio);
  const canevas = document.createElement('canvas');
  canevas.width = l;
  canevas.height = h;
  const ctx = canevas.getContext('2d');
  if (!ctx) return null;

  const trait = Math.max(1, Math.round(1.2 * ratio));
  cheminArrondi(ctx, trait / 2, trait / 2, l - trait, h - trait, RAYON * ratio);
  ctx.fillStyle = style.fond;
  ctx.fill();
  ctx.lineWidth = trait;
  ctx.strokeStyle = style.bord;
  ctx.stroke();

  const image = ctx.getImageData(0, 0, l, h);
  return { width: l, height: h, data: image.data };
}
