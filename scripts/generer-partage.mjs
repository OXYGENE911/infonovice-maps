// Image de partage social (Open Graph / cartes de réseaux), 1200 × 630 —
// générée par le code comme les icônes : aucun outil graphique, aucun fichier
// binaire opaque dans le dépôt, régénérable à l'identique.
//
// PAS DE TEXTE dans l'image : dessiner des lettres sans police embarquée
// donnerait un rendu approximatif, et les plateformes affichent DÉJÀ le titre
// et la description à côté de la vignette. Le visuel porte donc l'identité —
// bleu profond Infonovice, épingle blanche à cœur ambre, méridiens discrets —
// et le texte reste du texte, là où il est lisible et traduisible.
import { writeFileSync, mkdirSync } from 'node:fs';
import { png } from './png.mjs';

const FOND_HAUT = [18, 33, 55], FOND_BAS = [10, 20, 34];
const BLANC = [255, 255, 255], AMBRE = [250, 199, 117], BLEU = [34, 114, 196];
const melanger = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

function peindre(x, y, largeur, hauteur) {
  const u = x / largeur, v = y / hauteur;
  // Repère isotrope centré sur l'épingle, pour que le dessin ne s'étire pas.
  const cx = 0.5, cy = 0.46;
  const px = (u - cx) * (largeur / hauteur), py = v - cy;
  const aa = 2 / hauteur;
  const lisser = (d) => Math.max(0, Math.min(1, 0.5 - d / (2 * aa)));

  // Fond : dégradé vertical.
  let c = melanger(FOND_HAUT, FOND_BAS, v);

  // Méridiens et parallèles très discrets — l'idée d'une carte, sans le bruit.
  const grille = Math.min(
    Math.abs(((u * 12) % 1) - 0.5),
    Math.abs(((v * 7) % 1) - 0.5),
  );
  if (grille > 0.485) c = melanger(c, BLEU, 0.16);

  // Halo bleu derrière l'épingle.
  const dHalo = Math.hypot(px, py + 0.02) - 0.30;
  if (dHalo < 0) c = melanger(c, BLEU, 0.13 * (1 - Math.hypot(px, py + 0.02) / 0.30));

  // L'épingle, même géométrie que les icônes (tête, pointe, cœur).
  const dTete = Math.hypot(px, py + 0.06) - 0.155;
  const dansPointe = py > -0.06 && py < 0.24
    && Math.abs(px) < 0.155 * (1 - (py + 0.06) / 0.30);
  const dPin = Math.min(dTete, dansPointe ? -aa : aa);
  c = melanger(c, BLANC, lisser(dPin));
  c = melanger(c, AMBRE, lisser(Math.hypot(px, py + 0.06) - 0.065));

  // Liseré ambre en pied : la signature de la maison.
  if (v > 0.972) c = melanger(c, AMBRE, 1);

  return [...c, 255];
}

mkdirSync('public', { recursive: true });
writeFileSync('public/partage-social.png', png(1200, 630, peindre));
console.log('image de partage générée : public/partage-social.png (1200 × 630)');
