// Encodeur QR minimal, écrit à la main — AUCUNE dépendance, dans l'esprit de
// png.mjs (le dépôt encode déjà ses PNG à la main ; un QR n'est pas plus
// exotique). `script-src 'none'` sur les pages vitrines interdit de le
// calculer dans le navigateur : il est donc généré HORS LIGNE, ici, et posé
// en <svg> inline dans salon.html — voir docs/infonovice-maps/spec-accueil-salon.md §6.
//
// FIGÉ SUR LA VERSION 2 (25×25 modules), niveau de correction M, mode OCTET.
// « https://maps.infonovice.fr » fait 26 octets ; la version 2 niveau M porte
// 28 octets de charge utile — exactement assez pour 26 octets de donnée + les
// 12 bits d'en-tête (mode + compteur) + une terminaison de 4 bits, sans reste.
// Si l'URL s'allonge un jour, `encoderCodesMots` lève une erreur explicite
// plutôt que de produire un QR tronqué : passer en version 3 (29×29) est le
// geste attendu, pas un correctif silencieux.
//
// L'algorithme suit la norme ISO/IEC 18004 (mêmes constantes que toutes les
// bibliothèques ouvertes : polynôme générateur GF(256) 0x11D, générateur des
// bits de format 0x537, masque de format 0x5412 — aucune de ces valeurs n'est
// inventée ici, ce sont celles de la norme).

import { writeFileSync, mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const TAILLE = 25; // version 2 : 21 + 4×(version-1) = 25
const ZONE_SILENCE = 4; // modules de marge blanche, chaque côté

/* ————————————————————————— GF(256) et Reed-Solomon ————————————————————— */

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(function initGF() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d; // polynôme primitif de la norme
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
})();

const gfMul = (a, b) => (a === 0 || b === 0 ? 0 : GF_EXP[GF_LOG[a] + GF_LOG[b]]);

/** Produit de deux polynômes (tableaux de coefficients, degré fort en tête). */
function polyMul(p, q) {
  const r = new Array(p.length + q.length - 1).fill(0);
  for (let i = 0; i < p.length; i++) {
    for (let j = 0; j < q.length; j++) r[i + j] ^= gfMul(p[i], q[j]);
  }
  return r;
}

/** Polynôme générateur à `degre` racines : (x-α⁰)(x-α¹)…(x-α^(degre-1)). */
function polynomeGenerateur(degre) {
  let g = [1];
  for (let i = 0; i < degre; i++) g = polyMul(g, [1, GF_EXP[i]]);
  return g;
}

/** Les `degre` octets de correction Reed-Solomon d'un bloc de données. */
function correctionReedSolomon(donnees, degre) {
  const gen = polynomeGenerateur(degre);
  const reste = [...donnees, ...new Array(degre).fill(0)];
  for (let i = 0; i < donnees.length; i++) {
    const coef = reste[i];
    if (coef !== 0) {
      for (let j = 0; j < gen.length; j++) reste[i + j] ^= gfMul(gen[j], coef);
    }
  }
  return reste.slice(donnees.length);
}

/* ——————————————————————— Encodage des données (mode octet) ——————————————— */

const CAPACITE_DONNEES = 28; // version 2, niveau M : 28 octets de charge utile
const CAPACITE_EC = 16; // … et 16 octets de correction (44 au total)

/** Les 44 mots-code (28 données + 16 correction) pour l'URL donnée. */
export function encoderCodesMots(texte) {
  const octets = Array.from(Buffer.from(texte, 'utf8'));
  const bits = [];
  const pousser = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >> i) & 1); };

  pousser(0b0100, 4); // indicateur de mode : octet
  pousser(octets.length, 8); // compteur de caractères (8 bits, versions 1-9)
  for (const o of octets) pousser(o, 8);

  const capaciteBits = CAPACITE_DONNEES * 8;
  const restant = capaciteBits - bits.length;
  if (restant < 0) {
    throw new Error(
      `generer-qr : ${octets.length} octets ne tiennent plus dans la version 2 `
      + `niveau M (28 octets de charge utile) — passer à la version 3.`,
    );
  }
  pousser(0, Math.min(4, restant)); // terminateur, borné par la place restante
  while (bits.length % 8 !== 0) bits.push(0);

  const donnees = [];
  for (let i = 0; i < bits.length; i += 8) {
    let o = 0;
    for (let j = 0; j < 8; j++) o = (o << 1) | (bits[i + j] ?? 0);
    donnees.push(o);
  }
  // Octets de bourrage alternés (0xEC, 0x11), norme oblige, si de la place
  // reste après la terminaison — n'arrive pas avec l'URL actuelle (0 reste).
  const bourrage = [0xec, 0x11];
  for (let i = 0; donnees.length < CAPACITE_DONNEES; i++) donnees.push(bourrage[i % 2]);

  const ec = correctionReedSolomon(donnees, CAPACITE_EC);
  return Uint8Array.from([...donnees, ...ec]);
}

/* ———————————————————— Géométrie partagée (encodage ET décodage) ————————— */

/** Les cases « fonction » (motifs de détection, alignement, synchronisation,
 *  module toujours sombre, bits de format) ET leur valeur pour celles qui
 *  ne dépendent pas du masque choisi — partagée par `construireMatrice`
 *  (qui y ajoute les données) et `decoderMatrice` (qui doit savoir quelles
 *  cases ignorer en lisant une matrice déjà posée). */
function calculerCasesFonction() {
  const module = Array.from({ length: TAILLE }, () => new Array(TAILLE).fill(false));
  const fonction = Array.from({ length: TAILLE }, () => new Array(TAILLE).fill(false));

  const poser = (r, c, sombre, estFonction = true) => {
    if (r < 0 || r >= TAILLE || c < 0 || c >= TAILLE) return;
    module[r][c] = sombre;
    if (estFonction) fonction[r][c] = true;
  };

  // Les trois motifs de détection (7×7 + séparateur blanc d'1 module), aux
  // trois coins qui ne portent pas l'alignement.
  const motifDetection = (cr, cc) => {
    for (let dr = -4; dr <= 4; dr++) {
      for (let dc = -4; dc <= 4; dc++) {
        const dist = Math.max(Math.abs(dr), Math.abs(dc));
        poser(cr + dr, cc + dc, dist !== 2 && dist !== 4);
      }
    }
  };
  motifDetection(3, 3);
  motifDetection(3, TAILLE - 4);
  motifDetection(TAILLE - 4, 3);

  // Version 2 : UN SEUL motif d'alignement (5×5), au centre (18,18) — les
  // trois autres positions candidates chevauchent les motifs de détection.
  for (let dr = -2; dr <= 2; dr++) {
    for (let dc = -2; dc <= 2; dc++) {
      poser(18 + dr, 18 + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
    }
  }

  // Motifs de synchronisation : ligne 6 et colonne 6, alternance à partir
  // de la case sombre.
  for (let i = 8; i < TAILLE - 8; i++) {
    poser(6, i, i % 2 === 0);
    poser(i, 6, i % 2 === 0);
  }

  // Le module toujours sombre, à (4×version+9, 8) = (17,8) en version 2.
  poser(17, 8, true);

  // Les deux copies des bits de format sont RÉSERVÉES ici (valeur provisoire
  // à blanc) : elles ne sont écrites qu'après le choix du masque, plus bas —
  // exactement l'ordre que suit la référence (Nayuki, QR Code generator).
  const reserverFormat = () => {
    for (let i = 0; i <= 5; i++) poser(i, 8, false);
    poser(7, 8, false); poser(8, 8, false); poser(8, 7, false);
    for (let i = 0; i <= 5; i++) poser(8, i, false);
    for (let i = 0; i < 8; i++) poser(8, TAILLE - 1 - i, false);
    // SEULEMENT lignes 18-24 : la ligne 17 est le module toujours sombre
    // (déjà posé plus haut), les lignes 9-16 sont des cases DE DONNÉES —
    // un `i = 8` ici les aurait effacées à tort (bogue trouvé en rejouant
    // le décodage : 8 cases de charge utile disparaissaient, dernier octet
    // faux d'un bit).
    for (let i = 18; i < TAILLE; i++) poser(i, 8, false);
  };
  reserverFormat();

  return { module, fonction };
}

// Les huit formules de masque de la norme — appliquées UNIQUEMENT aux cases
// hors « fonction », partagées par l'encodage et le décodage.
const MASQUES = [
  (r, c) => (r + c) % 2 === 0,
  (r, c) => r % 2 === 0,
  (r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

/* ————————————————————————————— La matrice ————————————————————————————— */

/** Construit la matrice 25×25 (booléens : true = module sombre). */
export function construireMatrice(texte) {
  const codesMots = encoderCodesMots(texte);
  const { module, fonction } = calculerCasesFonction();

  // Place les 352 bits de charge utile en zigzag, colonnes de 2, en
  // contournant la colonne de synchronisation et toute case « fonction ».
  const placerDonnees = (grille) => {
    let i = 0;
    const totalBits = codesMots.length * 8;
    for (let droite = TAILLE - 1; droite >= 1; droite -= 2) {
      if (droite === 6) droite -= 1; // la colonne 6 porte la synchronisation
      for (let vert = 0; vert < TAILLE; vert++) {
        for (let j = 0; j < 2; j++) {
          const c = droite - j;
          const versLeHaut = ((droite + 1) & 2) === 0;
          const r = versLeHaut ? TAILLE - 1 - vert : vert;
          if (!fonction[r][c] && i < totalBits) {
            const octet = codesMots[i >> 3];
            grille[r][c] = ((octet >> (7 - (i & 7))) & 1) === 1;
            i++;
          }
        }
      }
    }
  };
  placerDonnees(module);

  const appliquerMasque = (grille, m) => grille.map((ligne, r) => ligne.map((v, c) => (
    fonction[r][c] ? v : v !== MASQUES[m](r, c)
  )));

  // Pénalité ISO §8.8.2 (règles 1, 2 et 4 au complet ; règle 3 dans sa forme
  // usuelle en fenêtre de 11 bits — suffisant pour départager les 8 masques,
  // la conformité du QR ne dépend PAS du masque choisi, seulement sa lisibilité).
  const penalite = (g) => {
    let total = 0;
    const motif = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
    const motifInv = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
    const regle1et3 = (ligne) => {
      let p = 0; let run = 1;
      for (let i = 1; i <= ligne.length; i++) {
        if (i < ligne.length && ligne[i] === ligne[i - 1]) { run++; continue; }
        if (run >= 5) p += 3 + (run - 5);
        run = 1;
      }
      for (let i = 0; i + 11 <= ligne.length; i++) {
        const f = ligne.slice(i, i + 11).map(Number);
        if (f.every((v, k) => v === motif[k]) || f.every((v, k) => v === motifInv[k])) p += 40;
      }
      return p;
    };
    for (let r = 0; r < TAILLE; r++) total += regle1et3(g[r]);
    for (let c = 0; c < TAILLE; c++) total += regle1et3(g.map((ligne) => ligne[c]));
    for (let r = 0; r < TAILLE - 1; r++) {
      for (let c = 0; c < TAILLE - 1; c++) {
        const v = g[r][c];
        if (v === g[r][c + 1] && v === g[r + 1][c] && v === g[r + 1][c + 1]) total += 3;
      }
    }
    const sombre = g.flat().filter(Boolean).length;
    const pct = (sombre * 100) / (TAILLE * TAILLE);
    const bas = Math.floor(pct / 5) * 5;
    total += Math.min(Math.abs(bas - 50), Math.abs(bas + 5 - 50)) / 5 * 10;
    return total;
  };

  let meilleur = 0; let meilleureGrille = null; let meilleurePenalite = Infinity;
  for (let m = 0; m < 8; m++) {
    const g = appliquerMasque(module, m);
    const p = penalite(g);
    if (p < meilleurePenalite) { meilleurePenalite = p; meilleur = m; meilleureGrille = g; }
  }

  // Bits de format : 2 bits de niveau EC (M = 00) + 3 bits de masque, puis
  // BCH(15,5) — générateur 0x537, masqué par 0x5412 (constantes de la norme).
  const ecBits = 0b00; // niveau M
  const donneesFormat = (ecBits << 3) | meilleur;
  let reste = donneesFormat;
  for (let i = 0; i < 10; i++) reste = (reste << 1) ^ ((reste >>> 9) * 0x537);
  const bitsFormat = (((donneesFormat << 10) | (reste & 0x3ff)) ^ 0x5412) >>> 0;
  const bit = (i) => ((bitsFormat >> i) & 1) === 1;

  for (let i = 0; i <= 5; i++) meilleureGrille[i][8] = bit(i);
  meilleureGrille[7][8] = bit(6);
  meilleureGrille[8][8] = bit(7);
  meilleureGrille[8][7] = bit(8);
  for (let i = 9; i <= 14; i++) meilleureGrille[8][14 - i] = bit(i);
  for (let i = 0; i < 8; i++) meilleureGrille[8][TAILLE - 1 - i] = bit(i);
  for (let i = 8; i < 15; i++) meilleureGrille[10 + i][8] = bit(i);
  meilleureGrille[17][8] = true; // le module toujours sombre

  return { matrice: meilleureGrille, masque: meilleur };
}

/* ——————————————————————————————— Décodage ——————————————————————————————— */

/** L'inverse de `construireMatrice` : relit une matrice 25×25 déjà posée
 *  (celle qu'on vient de PARSER depuis le SVG committé, par exemple — pas
 *  celle que le générateur garde en mémoire) et rend le texte qu'elle porte,
 *  après avoir vérifié que les octets de correction Reed-Solomon concordent.
 *  Lève une erreur explicite si un bit a bougé quelque part : c'est la
 *  preuve, pas l'affirmation, que le QR EST celui qu'on croit avoir posé. */
export function decoderMatrice(matrice) {
  const { fonction } = calculerCasesFonction();

  // Bits de format : mêmes positions que l'écriture, lues à l'envers.
  let bitsFormatLus = 0;
  const lireBit = (i, r, c) => { if (matrice[r][c]) bitsFormatLus |= (1 << i); };
  for (let i = 0; i <= 5; i++) lireBit(i, i, 8);
  lireBit(6, 7, 8); lireBit(7, 8, 8); lireBit(8, 8, 7);
  for (let i = 9; i <= 14; i++) lireBit(i, 8, 14 - i);

  const donneesFormat = ((bitsFormatLus ^ 0x5412) >>> 10) & 0x1f;
  const ecBits = (donneesFormat >> 3) & 0b11;
  const masqueId = donneesFormat & 0b111;
  if (masqueId < 0 || masqueId > 7) throw new Error('decoder-qr : masque hors bornes, bits de format illisibles');

  // Démasquage + lecture des 352 bits de charge utile, MÊME zigzag qu'à
  // l'écriture (c'est cette symétrie qui rend le test indépendant du
  // générateur : il rejoue l'algorithme dans l'autre sens).
  const bits = [];
  for (let droite = TAILLE - 1; droite >= 1; droite -= 2) {
    if (droite === 6) droite -= 1;
    for (let vert = 0; vert < TAILLE; vert++) {
      for (let j = 0; j < 2; j++) {
        const c = droite - j;
        const versLeHaut = ((droite + 1) & 2) === 0;
        const r = versLeHaut ? TAILLE - 1 - vert : vert;
        if (!fonction[r][c]) bits.push(matrice[r][c] !== MASQUES[masqueId](r, c));
      }
    }
  }

  const codesMots = [];
  for (let i = 0; i < bits.length; i += 8) {
    let o = 0;
    for (let j = 0; j < 8; j++) o = (o << 1) | (bits[i + j] ? 1 : 0);
    codesMots.push(o);
  }

  // La preuve qui compte : les 16 derniers octets DOIVENT être la correction
  // Reed-Solomon des 28 premiers. Un seul bit mal lu quelque part et ce test
  // rougit — c'est précisément ce qu'un test qui se contente de comparer le
  // SVG à lui-même ne peut pas prouver.
  const donnees = codesMots.slice(0, CAPACITE_DONNEES);
  const ecLus = codesMots.slice(CAPACITE_DONNEES);
  const ecAttendus = correctionReedSolomon(donnees, CAPACITE_EC);
  if (!ecAttendus.every((v, i) => v === ecLus[i])) {
    throw new Error('decoder-qr : correction Reed-Solomon incohérente — le QR ne se décode pas proprement');
  }

  // L'en-tête (mode octet + compteur), puis le message lui-même.
  const donneesBits = donnees.flatMap((o) => [7, 6, 5, 4, 3, 2, 1, 0].map((k) => (o >> k) & 1));
  const lire = (n, dep) => donneesBits.slice(dep, dep + n).reduce((a, b) => (a << 1) | b, 0);
  const mode = lire(4, 0);
  if (mode !== 0b0100) throw new Error(`decoder-qr : mode inattendu (${mode.toString(2)}), pas « octet »`);
  const longueur = lire(8, 4);
  const octetsMessage = [];
  for (let i = 0; i < longueur; i++) octetsMessage.push(lire(8, 12 + i * 8));

  return { texte: Buffer.from(octetsMessage).toString('utf8'), masque: masqueId, ecBits };
}

/* ————————————————————————————— Rendu SVG ——————————————————————————————— */

/** Un <svg> autoportant : fond blanc (lisible quel que soit le thème de la
 *  page qui l'embarque) + un <path> de rectangles fusionnés PAR LIGNE — des
 *  attributs de présentation uniquement (`fill`), jamais de `style`
 *  (`style-src 'self'` l'interdirait de toute façon sur un inline). */
export function genererSvg(texte) {
  const { matrice } = construireMatrice(texte);
  const taillePage = TAILLE + ZONE_SILENCE * 2;
  let d = '';
  for (let r = 0; r < TAILLE; r++) {
    let c = 0;
    while (c < TAILLE) {
      if (!matrice[r][c]) { c++; continue; }
      const debut = c;
      while (c < TAILLE && matrice[r][c]) c++;
      const largeur = c - debut;
      const x = ZONE_SILENCE + debut; const y = ZONE_SILENCE + r;
      d += `M${x},${y}h${largeur}v1h-${largeur}z`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${taillePage} ${taillePage}">`
    + `<rect width="${taillePage}" height="${taillePage}" fill="#fff"/>`
    + `<path fill="#000" d="${d}"/></svg>`;
}

/* ————————————————————————————————— CLI ————————————————————————————————— */

const URL_MAPS = 'https://maps.infonovice.fr';

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const svg = genererSvg(URL_MAPS);
  mkdirSync('public/salon', { recursive: true });
  writeFileSync('public/salon/qr-maps.svg', svg);
  console.log(`QR généré : public/salon/qr-maps.svg (${svg.length} octets) → ${URL_MAPS}`);
}
