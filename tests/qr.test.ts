// Le QR du stand (SALON-1) — voir docs/infonovice-maps/spec-accueil-salon.md §6.
//
// « Un QR qu'aucun test ne sait décoder mais qu'un test compare à lui-même
// ne prouve rien tout seul » (spec, §6). Ce fichier fait donc TROIS choses,
// pas une : il vérifie que le fichier committé est bien celui que régénère
// le script (archive = source de vérité), que les trois motifs de détection
// sont aux trois coins, ET il DÉCODE la matrice — mode, compteur, octets de
// message ET correction Reed-Solomon relus depuis zéro par `decoderMatrice`,
// qui rejoue l'algorithme dans l'autre sens (voir generer-qr.mjs). Un seul
// bit posé au mauvais endroit fait échouer ce dernier test, pas seulement
// une comparaison de texte.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { construireMatrice, decoderMatrice, genererSvg, TAILLE } from '../scripts/generer-qr.mjs';

const RACINE = fileURLToPath(new URL('..', import.meta.url));
const URL_MAPS = 'https://maps.infonovice.fr';
const FICHIER = RACINE + 'public/salon/qr-maps.svg';

describe('le fichier committé EST ce que régénère le script', () => {
  test('octet pour octet, identique', () => {
    const committe = readFileSync(FICHIER, 'utf8');
    expect(committe).toBe(genererSvg(URL_MAPS));
  });

  // Relevé par la revue Codex : un test qui ne compare le SVG qu'au fichier
  // n'attraperait pas une dérive de la copie INLINE dans salon.html (celle
  // que le navigateur affiche vraiment). On extrait les mêmes <rect>/<path>
  // et on les compare aux deux autres sources de vérité.
  test('le QR inline de salon.html porte les MÊMES modules que le fichier', () => {
    const html = readFileSync(RACINE + 'salon.html', 'utf8');
    const bloc = /<svg class="salon-qr-code"[^>]*>([\s\S]*?)<\/svg>/.exec(html);
    expect(bloc, 'aucun <svg class="salon-qr-code"> trouvé dans salon.html').not.toBeNull();
    const interieurFichier = readFileSync(FICHIER, 'utf8')
      .replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
    expect(bloc![1]).toBe(interieurFichier);
  });
});

describe('la géométrie du QR', () => {
  const { matrice } = construireMatrice(URL_MAPS);

  // Le motif de détection standard, 7×7 (ISO/IEC 18004 §6.3.3).
  const MOTIF = [
    [1, 1, 1, 1, 1, 1, 1],
    [1, 0, 0, 0, 0, 0, 1],
    [1, 0, 1, 1, 1, 0, 1],
    [1, 0, 1, 1, 1, 0, 1],
    [1, 0, 1, 1, 1, 0, 1],
    [1, 0, 0, 0, 0, 0, 1],
    [1, 1, 1, 1, 1, 1, 1],
  ];
  const coinPorteLeMotif = (r0: number, c0: number) => {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        if (matrice[r0 + r]![c0 + c] !== (MOTIF[r]![c] === 1)) return false;
      }
    }
    return true;
  };

  test('les trois motifs de détection sont aux trois coins', () => {
    expect(coinPorteLeMotif(0, 0), 'coin haut-gauche').toBe(true);
    expect(coinPorteLeMotif(0, TAILLE - 7), 'coin haut-droite').toBe(true);
    expect(coinPorteLeMotif(TAILLE - 7, 0), 'coin bas-gauche').toBe(true);
  });

  test('la zone de silence fait 4 modules — le SVG en témoigne', () => {
    const svg = genererSvg(URL_MAPS);
    expect(svg).toContain('viewBox="0 0 33 33"'); // 25 modules + 4×2 de marge
    // Aucun rectangle sombre ne commence ou ne finit dans les 4 premiers ou
    // 4 derniers points de coordonnée, sur les deux axes.
    const coords = [...svg.matchAll(/M(\d+),(\d+)h(\d+)/g)]
      .map((m) => ({ x: Number(m[1]), y: Number(m[2]), largeur: Number(m[3]) }));
    expect(coords.length, 'aucun module sombre dans le SVG ?').toBeGreaterThan(0);
    for (const { x, y, largeur } of coords) {
      expect(x, 'un module déborde dans la zone de silence gauche').toBeGreaterThanOrEqual(4);
      expect(x + largeur, 'un module déborde dans la zone de silence droite').toBeLessThanOrEqual(29);
      expect(y, 'un module déborde dans la zone de silence haute').toBeGreaterThanOrEqual(4);
      expect(y, 'un module déborde dans la zone de silence basse').toBeLessThanOrEqual(28);
    }
  });
});

// Reconstruit la matrice 25×25 à partir du tracé SVG (les commandes
// `M{x},{y}h{largeur}` posées par `genererSvg` — voir generer-qr.mjs). Sert
// à décoder ce que le NAVIGATEUR affiche vraiment, pas ce que le générateur
// garde en mémoire — la distinction que la revue Codex du 11/09 a demandée.
function matriceDepuisTraceSvg(svg: string): boolean[][] {
  const matrice = Array.from({ length: TAILLE }, () => new Array<boolean>(TAILLE).fill(false));
  for (const m of svg.matchAll(/M(\d+),(\d+)h(\d+)/g)) {
    const x = Number(m[1]) - 4; const y = Number(m[2]) - 4; const largeur = Number(m[3]);
    for (let i = 0; i < largeur; i++) matrice[y]![x + i] = true;
  }
  return matrice;
}

describe('le QR SE DÉCODE — pas seulement « se compare à lui-même »', () => {
  test('mode octet, compteur, message et correction Reed-Solomon concordent', () => {
    const { matrice } = construireMatrice(URL_MAPS);
    const { texte, ecBits } = decoderMatrice(matrice);
    expect(texte).toBe(URL_MAPS);
    expect(ecBits, 'niveau de correction M').toBe(0b00);
  });

  test('le QR INLINE de salon.html — celui que le navigateur affiche — se décode aussi', () => {
    const html = readFileSync(RACINE + 'salon.html', 'utf8');
    const bloc = /<svg class="salon-qr-code"[^>]*>([\s\S]*?)<\/svg>/.exec(html);
    expect(bloc, 'aucun <svg class="salon-qr-code"> trouvé dans salon.html').not.toBeNull();
    const matrice = matriceDepuisTraceSvg(bloc![1]!);
    const { texte } = decoderMatrice(matrice);
    expect(texte, 'le QR affiché sur la page ne mène pas à la bonne adresse').toBe(URL_MAPS);
  });

  test('un bit de donnée corrompu casse la correction Reed-Solomon (le décodeur n’est pas complaisant)', () => {
    const { matrice } = construireMatrice(URL_MAPS);
    const corrompue = matrice.map((ligne) => [...ligne]);
    corrompue[12]![12] = !corrompue[12]![12];
    expect(() => decoderMatrice(corrompue)).toThrow();
  });
});

/* VÉRIFICATION HUMAINE, PAS AUTOMATISABLE ICI : ce test prouve que le QR
 * encode le bon texte selon l'algorithme standard (ISO/IEC 18004) et qu'un
 * décodeur indépendant (jsqr) le lit correctement — vérifié hors dépôt
 * pendant le développement, voir la description de la PR. Il reste à
 * scanner l'affichage réel avec deux téléphones : deux caméras, deux
 * firmwares, la distance et la lumière du stand ne sont pas ce qu'un test
 * unitaire peut simuler. */
