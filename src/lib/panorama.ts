/* VISUALISEUR 360 — la navigation, en calcul pur.
 *
 * La ROADMAP portait cette limite depuis la PR #12 : « les photos Panoramax
 * sont souvent des panoramas 360° équirectangulaires ; la visionneuse les
 * affiche À PLAT, donc très larges et déformées. Un vrai visualiseur 360
 * demanderait une bibliothèque supplémentaire — à peser contre le budget
 * bundle. »
 *
 * La bibliothèque n'est pas nécessaire. Ce fichier plus une centaine de lignes
 * de WebGL pèsent quelques kilo-octets, là où un visualiseur du commerce en
 * coûte deux cents. C'est le même arbitrage que le décodeur protobuf de la
 * PR #16 : 2 Ko écrits à la main contre 120 Ko importés.
 *
 * TOUT CE QUI SE DÉCIDE EST ICI, et se teste à sec. Le rendu n'est qu'une
 * coquille qui applique ces nombres.
 */

/** Où regarde l'usager, en degrés. */
export interface Vue {
  /** Rotation horizontale, dans [-180, 180]. */
  lacet: number;
  /** Élévation, bornée à ±85° — voir `bornerTangage`. */
  tangage: number;
}

export const VUE_INITIALE: Vue = { lacet: 0, tangage: 0 };

/** Au-delà, l'image se retourne et l'usager perd le haut et le bas. */
const TANGAGE_MAX = 85;

/** Degrés parcourus pour un glissement traversant tout l'écran. */
const TOUR_PAR_ECRAN = 180;

/**
 * Une image équirectangulaire fait exactement deux fois plus large que haute.
 *
 * LA TOLÉRANCE N'EST PAS DU CONFORT : les producteurs recadrent d'un ou deux
 * pixels, et un rapport de 4096×2047 est un panorama. Elle reste assez serrée
 * pour qu'un 16:9 — tentant, à 1,78 — n'y entre pas.
 */
export function estEquirectangulaire(largeur: number, hauteur: number): boolean {
  if (!Number.isFinite(largeur) || !Number.isFinite(hauteur)) return false;
  if (largeur <= 0 || hauteur <= 0) return false;
  return Math.abs(largeur / hauteur - 2) < 0.02;
}

/** Replie un angle horizontal dans [-180, 180] : la vue fait le tour. */
export function normaliserLacet(degres: number): number {
  if (!Number.isFinite(degres)) return 0;
  const replie = ((degres + 180) % 360 + 360) % 360 - 180;
  // -180 et 180 désignent le même point ; on garde la borne haute, plus lisible.
  return replie === -180 ? 180 : replie;
}

/** Borne l'élévation. Le tangage NE fait PAS le tour, contrairement au lacet. */
export function bornerTangage(degres: number): number {
  if (!Number.isFinite(degres)) return 0;
  return Math.min(Math.max(degres, -TANGAGE_MAX), TANGAGE_MAX);
}

/**
 * Applique un glissement de `dx`/`dy` pixels à la vue.
 *
 * LA SENSIBILITÉ SUIT LA LARGEUR DE L'ÉCRAN, pas une constante : le même geste
 * doit parcourir la même portion d'image sur un téléphone et sur un moniteur.
 * Une constante ferait filer le panorama sur petit écran.
 *
 * Le sens est celui du globe qu'on fait tourner du doigt : glisser vers la
 * droite amène à gauche ce qui était à droite.
 */
export function deplacer(vue: Vue, dx: number, dy: number, largeurEcran: number): Vue {
  const largeur = Number.isFinite(largeurEcran) && largeurEcran > 0 ? largeurEcran : 1;
  const parPixel = TOUR_PAR_ECRAN / largeur;
  return {
    lacet: normaliserLacet(vue.lacet - dx * parPixel),
    tangage: bornerTangage(vue.tangage + dy * parPixel),
  };
}

export interface Maillage {
  positions: Float32Array;
  uvs: Float32Array;
  indices: Uint16Array;
}

/**
 * Une sphère unité, texturée de l'intérieur.
 *
 * LA COUTURE EST RÉPÉTÉE — d'où `longitudes + 1` colonnes de sommets. Sans
 * elle, le dernier quadrilatère interpolerait la texture de u=0,97 vers u=0,
 * et une bande de l'image entière défilerait sur quelques pixels : une
 * cicatrice verticale bien visible.
 */
export function sphere(longitudes = 48, latitudes = 24): Maillage {
  const nx = Math.min(Math.max(Math.round(longitudes), 3), 128);
  const ny = Math.min(Math.max(Math.round(latitudes), 2), 128);

  const positions: number[] = [];
  const uvs: number[] = [];
  for (let y = 0; y <= ny; y += 1) {
    const v = y / ny;
    const phi = v * Math.PI;            // 0 au pôle nord, π au pôle sud
    for (let x = 0; x <= nx; x += 1) {
      const u = x / nx;
      const theta = u * 2 * Math.PI;
      positions.push(
        Math.sin(phi) * Math.cos(theta),
        Math.cos(phi),
        Math.sin(phi) * Math.sin(theta),
      );
      uvs.push(u, v);
    }
  }

  const indices: number[] = [];
  for (let y = 0; y < ny; y += 1) {
    for (let x = 0; x < nx; x += 1) {
      const a = y * (nx + 1) + x;
      const b = a + nx + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }

  return {
    positions: new Float32Array(positions),
    uvs: new Float32Array(uvs),
    indices: new Uint16Array(indices),
  };
}
