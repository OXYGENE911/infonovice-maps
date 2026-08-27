/* LES ÉCLAIRS DE PUISSANCE — icônes DESSINÉES PAR LE CODE, jamais committées.
 *
 * Le style de la carte n'embarque ni glyphes ni sprites (choix de la PR #2 :
 * rien à héberger, donc rien à maintenir). Une couche `symbol` a pourtant
 * besoin d'images. On les fabrique donc au démarrage, sur un canevas, et on
 * les enregistre auprès de MapLibre.
 *
 * C'EST LE PRÉCÉDENT DE LA PR #21, appliqué à la carte : l'image de partage y
 * est « GÉNÉRÉE par script (aucun binaire opaque au dépôt) ». Un fichier PNG
 * d'éclairs déposé dans le dépôt serait invérifiable et non diffable ; ce
 * fichier-ci se relit, se corrige, et se voit dans une revue.
 */
import type { Map as CarteMapLibre } from 'maplibre-gl';
import { PALIERS, type Palier } from '../lib/puissance';

/** Le nom d'image attendu par la couche, pour un palier donné. */
export const nomIcone = (palier: Palier | null): string =>
  (palier === null ? 'borne-inconnue' : `borne-${palier}`);

const TAILLE = 34;          // en points CSS
const RATIO = 2;            // rendu 2× : net sur écran dense

/* Un éclair normalisé dans un carré [0,1] × [0,1]. Décrit une fois, tracé
   autant de fois qu'il y a de paliers. */
const ECLAIR: [number, number][] = [
  [0.58, 0.02], [0.18, 0.54], [0.44, 0.54], [0.36, 0.98], [0.80, 0.42],
  [0.52, 0.42],
];

function tracerEclair(
  ctx: CanvasRenderingContext2D, x: number, y: number, largeur: number, hauteur: number,
): void {
  ctx.beginPath();
  ECLAIR.forEach(([ex, ey], i) => {
    const px = x + ex * largeur;
    const py = y + ey * hauteur;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  });
  ctx.closePath();
  ctx.fill();
}

/** Dessine une pastille : disque coloré, liseré blanc, N éclairs au centre. */
function dessiner(nombreEclairs: number, couleur: string): ImageData | null {
  const canevas = document.createElement('canvas');
  canevas.width = TAILLE * RATIO;
  canevas.height = TAILLE * RATIO;
  const ctx = canevas.getContext('2d');
  if (!ctx) return null;
  ctx.scale(RATIO, RATIO);

  const centre = TAILLE / 2;
  ctx.beginPath();
  ctx.arc(centre, centre, centre - 2, 0, Math.PI * 2);
  ctx.fillStyle = couleur;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#FFFFFF';
  ctx.stroke();

  if (nombreEclairs > 0) {
    /* LA LARGEUR DES ÉCLAIRS S'ADAPTE À LEUR NOMBRE : trois éclairs à la
       taille d'un seul déborderaient de la pastille. On garde une hauteur
       constante — c'est elle qui les rend reconnaissables. */
    const hauteur = 15;
    const largeur = nombreEclairs === 1 ? 11 : nombreEclairs === 2 ? 8 : 6.5;
    const espace = 1;
    const total = nombreEclairs * largeur + (nombreEclairs - 1) * espace;
    let x = centre - total / 2;
    ctx.fillStyle = '#FFFFFF';
    for (let i = 0; i < nombreEclairs; i++) {
      tracerEclair(ctx, x, centre - hauteur / 2, largeur, hauteur);
      x += largeur + espace;
    }
  } else {
    // Puissance inconnue : un point creux, qui ne prétend à aucun palier.
    ctx.beginPath();
    ctx.arc(centre, centre, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
  }

  return ctx.getImageData(0, 0, canevas.width, canevas.height);
}

/**
 * Les mêmes éclairs, en SVG pour le DOM — légende et fiche de borne.
 *
 * LA CARTE DESSINE DES ÉCLAIRS BLANCS ; la légende et la fiche affichaient
 * l'émoji ⚡, rendu JAUNE par la police système. Armelin, le 27/08/2026 :
 * « il faudrait harmoniser ». Le tracé est LE MÊME polygone que le canevas
 * ci-dessus : une seule silhouette, deux supports. Markup engendré par le
 * code à partir de constantes — aucune donnée externe n'y entre.
 */
export function eclairsSVG(nombre: number): string {
  const centre = TAILLE / 2;
  const formes: string[] = [];
  if (nombre > 0) {
    const hauteur = 15;
    const largeur = nombre === 1 ? 11 : nombre === 2 ? 8 : 6.5;
    const espace = 1;
    const total = nombre * largeur + (nombre - 1) * espace;
    let x = centre - total / 2;
    for (let i = 0; i < nombre; i += 1) {
      const points = ECLAIR.map(([ex, ey]) =>
        `${(x + ex * largeur).toFixed(2)},${(centre - hauteur / 2 + ey * hauteur).toFixed(2)}`).join(' ');
      formes.push(`<polygon points="${points}" fill="#FFFFFF"/>`);
      x += largeur + espace;
    }
  } else {
    // Puissance inconnue : le même point creux que la carte.
    formes.push(`<circle cx="${centre}" cy="${centre}" r="4" fill="#FFFFFF"/>`);
  }
  return `<svg viewBox="0 0 ${TAILLE} ${TAILLE}" aria-hidden="true" focusable="false">`
    + `${formes.join('')}</svg>`;
}

/**
 * Enregistre les quatre pastilles auprès de la carte. Idempotent : `setStyle`
 * détruit les images comme il détruit les sources, et cette fonction est
 * rappelée à chaque `style.load`.
 */
export function poserIconesPuissance(carte: CarteMapLibre): void {
  const aPoser: { nom: string; eclairs: number; couleur: string }[] = [
    ...PALIERS.map((p) => ({ nom: nomIcone(p.palier), eclairs: p.palier, couleur: p.couleur })),
    { nom: nomIcone(null), eclairs: 0, couleur: '#7A8794' },
  ];

  for (const { nom, eclairs, couleur } of aPoser) {
    if (carte.hasImage(nom)) continue;
    const donnees = dessiner(eclairs, couleur);
    // Un canevas indisponible (contexte 2D refusé) ne doit pas casser la
    // carte : la couche retombera sur son image manquante, pas sur une erreur.
    if (donnees) carte.addImage(nom, donnees, { pixelRatio: RATIO });
  }
}
