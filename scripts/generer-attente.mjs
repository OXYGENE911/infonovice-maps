// Image d'attente du bloc vidéo salon — PLACEHOLDER NEUTRE, PAS Bélia.
//
// docs/infonovice-maps/spec-accueil-salon.md §5 : « Belia (le chien) en
// scène : au volant, la carte à l'écran derrière lui » est la tâche de la
// PR B, cadencée par Visuels (GPT puis Nano Banana) — CE N'EST PAS UNE
// TÂCHE D'INGÉNIERIE, et personne ici ne dessine Bélia. Ce script produit
// UNIQUEMENT un aplat géométrique de secours, au format exact (960×540),
// dans le même esprit que generer-partage.mjs : dégradé de marque, aucune
// photographie, aucun personnage, remplacé au premier commit de la PR B.
import { writeFileSync, mkdirSync } from 'node:fs';
import { png } from './png.mjs';

const FOND_HAUT = [18, 33, 55], FOND_BAS = [10, 20, 34];
const BLANC = [255, 255, 255], AMBRE = [250, 199, 117];
const melanger = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

function peindre(x, y, largeur, hauteur) {
  const u = x / largeur, v = y / hauteur;
  let c = melanger(FOND_HAUT, FOND_BAS, v);

  // Méridiens très discrets — l'idée d'une carte, comme sur l'image de
  // partage, pour rester dans la même famille visuelle.
  const grille = Math.min(
    Math.abs(((u * 14) % 1) - 0.5),
    Math.abs(((v * 8) % 1) - 0.5),
  );
  if (grille > 0.486) c = melanger(c, [34, 114, 196], 0.14);

  // Le disque de lecture, centré : SEUL indice que ceci est une vidéo à
  // venir — un triangle « lecture », pas une scène.
  const cx = 0.5, cy = 0.5, rayon = 0.115;
  const px = (u - cx) * (largeur / hauteur), py = v - cy;
  const d = Math.hypot(px, py);
  const aa = 2 / hauteur;
  const lisser = (dist) => Math.max(0, Math.min(1, 0.5 - dist / (2 * aa)));

  c = melanger(c, BLANC, lisser(d - rayon) * 0.16); // halo doux
  const disque = lisser(d - rayon * 0.74);
  c = melanger(c, [8, 14, 24], disque * 0.55);

  // Triangle de lecture, décalé d'un dixième de rayon pour paraître centré
  // à l'œil (un triangle plein « tire » visuellement vers sa pointe).
  const tpx = px - rayon * 0.06, tpy = py;
  const cote = rayon * 0.62;
  const dansTriangle = tpx > -cote * 0.35 && tpx < cote * 0.62
    && Math.abs(tpy) < (cote * 0.62 - tpx) * 0.72;
  if (dansTriangle) c = melanger(c, AMBRE, 1);

  return [...c, 255];
}

mkdirSync('public/salon', { recursive: true });
writeFileSync('public/salon/attente.png', png(960, 540, peindre));
console.log('image d’attente générée (placeholder neutre) : public/salon/attente.png (960 × 540)');
