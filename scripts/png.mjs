// Encodeur PNG minimal (zlib + CRC32 à la main) — AUCUNE dépendance : les
// images du projet se régénèrent à l'identique sur n'importe quel poste, et
// le dépôt ne porte pas d'outil graphique. Partagé par les icônes PWA et
// l'image de partage social.
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

/** `peindre(x, y, largeur, hauteur)` rend [r, v, b, a]. */
export function png(largeur, hauteur, peindre) {
  const octetsLigne = largeur * 4 + 1;
  const brut = Buffer.alloc(octetsLigne * hauteur);
  for (let y = 0; y < hauteur; y++) {
    brut[y * octetsLigne] = 0; // filtre « aucun »
    for (let x = 0; x < largeur; x++) {
      const [r, g, b, a] = peindre(x, y, largeur, hauteur);
      const o = y * octetsLigne + 1 + x * 4;
      brut[o] = r; brut[o + 1] = g; brut[o + 2] = b; brut[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(largeur, 0); ihdr.writeUInt32BE(hauteur, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8 bits, RVBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(brut, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
