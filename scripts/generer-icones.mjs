// Génère les icônes PWA par le code — aucun outil graphique, reproductible à
// l'identique sur n'importe quel poste. Dessin : épingle de position blanche
// à cœur ambre sur le bleu profond Infonovice, pleine surface (maskable).
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const t = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
};

function png(taille, peindre) {
  const octetsLigne = taille * 4 + 1;
  const brut = Buffer.alloc(octetsLigne * taille);
  for (let y = 0; y < taille; y++) {
    brut[y * octetsLigne] = 0; // filtre « aucun »
    for (let x = 0; x < taille; x++) {
      const [r, g, b, a] = peindre(x, y, taille);
      const o = y * octetsLigne + 1 + x * 4;
      brut[o] = r; brut[o + 1] = g; brut[o + 2] = b; brut[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(taille, 0); ihdr.writeUInt32BE(taille, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8 bits, RVBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(brut, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

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
for (const t of [192, 512]) writeFileSync(`public/icones/icone-${t}.png`, png(t, peindre));
writeFileSync('public/icones/icone-512-maskable.png', png(512, peindre));
console.log('icônes générées : 192, 512, 512-maskable');
