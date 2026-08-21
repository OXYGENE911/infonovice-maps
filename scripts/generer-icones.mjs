// Génère les icônes PWA par le code — aucun outil graphique, reproductible à
// l'identique sur n'importe quel poste. Dessin : épingle de position blanche
// à cœur ambre sur le bleu profond Infonovice, pleine surface (maskable).
import { writeFileSync, mkdirSync } from 'node:fs';
import { png } from './png.mjs';

// L'épingle : disque centré en (0.5, 0.42), rayon 0.24 ; pointe triangulaire
// jusqu'à (0.5, 0.80) ; cœur ambre rayon 0.10. Anti-aliasing par distance.
const FOND = [15, 27, 45], BLANC = [255, 255, 255], AMBRE = [250, 199, 117];
const melanger = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

function peindre(x, y, taille) {
  const u = (x + 0.5) / taille, v = (y + 0.5) / taille;
  const aa = 1.5 / taille;
  const lisser = (d) => Math.max(0, Math.min(1, 0.5 - d / (2 * aa)));

  // Distance au disque de la tête
  const dTete = Math.hypot(u - 0.5, v - 0.42) - 0.24;
  // Distance (approchée) au triangle de la pointe : demi-plans
  const dansPointe = v > 0.42 && v < 0.80 && Math.abs(u - 0.5) < 0.24 * (1 - (v - 0.42) / 0.38);
  const dPointe = dansPointe ? -aa : aa;
  const dPin = Math.min(dTete, dPointe);
  const dCoeur = Math.hypot(u - 0.5, v - 0.42) - 0.10;

  let c = FOND;
  c = melanger(c, BLANC, lisser(dPin));
  c = melanger(c, AMBRE, lisser(dCoeur));
  return [...c, 255];
}

mkdirSync('public/icones', { recursive: true });
for (const t of [192, 512]) writeFileSync(`public/icones/icone-${t}.png`, png(t, t, peindre));
writeFileSync('public/icones/icone-512-maskable.png', png(512, 512, peindre));
console.log('icônes générées : 192, 512, 512-maskable');
