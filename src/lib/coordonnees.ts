// Première brique de la bibliothèque partagée Infonovice (« /src/lib » est la
// future surface commune aux produits maison — voir CLAUDE.md).
//
// Le format d'affichage des coordonnées est décidé UNE fois, ici : degrés
// décimaux, cinq décimales (~1,1 m à l'équateur — la précision de la BAN),
// latitude avant longitude à l'affichage (convention cartographique
// française), et virgule décimale française.
export interface PointGeo {
  /** Longitude en degrés décimaux (WGS 84). */
  lon: number;
  /** Latitude en degrés décimaux (WGS 84). */
  lat: number;
}

export function formaterCoordonnees(p: PointGeo): string {
  const f = (n: number) => n.toFixed(5).replace('.', ',');
  return `${f(p.lat)}, ${f(p.lon)}`;
}

/** Analyse « lat, lon » saisi à la main. Rend null plutôt que de deviner. */
export function analyserCoordonnees(texte: string): PointGeo | null {
  const m = /^\s*(-?\d{1,2}(?:[.,]\d+)?)\s*[,;]\s*(-?\d{1,3}(?:[.,]\d+)?)\s*$/.exec(texte);
  if (!m || m[1] === undefined || m[2] === undefined) return null;
  const lat = Number(m[1].replace(',', '.'));
  const lon = Number(m[2].replace(',', '.'));
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lon, lat };
}
