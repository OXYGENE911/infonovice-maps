// Lambert-93 (EPSG:2154) → WGS84, à la main.
//
// POURQUOI PAS UNE BIBLIOTHÈQUE : proj4js pèse ~40 Ko gzippés pour une seule
// projection, alors que la formule inverse de la conique conforme de Lambert
// tient en quinze lignes et se vérifie sur des points de contrôle publiés.
// Le budget bundle du projet (< 300 Ko hors MapLibre) n'a pas à payer ça.
//
// Les données de Bison Futé arrivent en Lambert-93 — la projection légale
// française — quand la carte, elle, parle WGS84. Sans cette conversion, les
// événements routiers se poseraient au large de l'Afrique.
//
// Constantes officielles du Lambert-93 (IGN, NT/G 71) ; validées par deux
// contrôles dans les tests : l'origine conventionnelle, et un aller-retour.

const N = 0.7256077650532670;          // exposant de la projection
const C = 11754255.426096;             // constante de projection (m)
const XS = 700000.0;                   // coordonnées du pôle projeté (m)
const YS = 12655612.049876;
const E = 0.08181919106;               // première excentricité (GRS80)
const LON0 = (3 * Math.PI) / 180;      // méridien d'origine : 3° Est

/** Un point projeté en Lambert-93, en mètres. */
export interface PointL93 { x: number; y: number; }

/** Convertit un point Lambert-93 en longitude/latitude WGS84 — PURE.
    Rend null si l'entrée n'est pas un couple de nombres finis : les services
    publics livrent parfois des coordonnées vides, et un NaN silencieux
    poserait un marqueur au milieu de l'océan. */
export function versWGS84(p: PointL93): { lon: number; lat: number } | null {
  if (!Number.isFinite(p?.x) || !Number.isFinite(p?.y)) return null;
  const dx = p.x - XS;
  const dy = p.y - YS;
  const r = Math.hypot(dx, dy);
  if (r === 0) return null;
  const gamma = Math.atan2(dx, -dy);
  const lon = LON0 + gamma / N;
  const l = -Math.log(Math.abs(r / C)) / N;

  // Latitude par itérations successives : la formule est implicite. Douze
  // tours suffisent très largement (la convergence est atteinte vers le
  // sixième), et la boucle est bornée — pas de « tant que » qui pourrait
  // tourner sur une entrée pathologique.
  let phi = 2 * Math.atan(Math.exp(l)) - Math.PI / 2;
  for (let i = 0; i < 12; i += 1) {
    const s = E * Math.sin(phi);
    phi = 2 * Math.atan(((1 + s) / (1 - s)) ** (E / 2) * Math.exp(l)) - Math.PI / 2;
  }
  const degres = 180 / Math.PI;
  const resultat = { lon: lon * degres, lat: phi * degres };
  if (!Number.isFinite(resultat.lon) || !Number.isFinite(resultat.lat)) return null;
  return resultat;
}

/** Le point tombe-t-il dans l'emprise du Lambert-93 (France métropolitaine) ?
    Un point hors emprise trahit une donnée douteuse plutôt qu'un lieu réel. */
export function dansEmpriseFrance(lon: number, lat: number): boolean {
  return lon >= -6 && lon <= 10 && lat >= 41 && lat <= 52;
}
