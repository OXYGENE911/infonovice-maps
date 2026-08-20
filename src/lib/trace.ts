// Export du tracé — GPX 1.1 et KML 2.2, fabriqués à la main : les deux
// formats tiennent en vingt lignes chacun, une dépendance serait du luxe.
// PURES, donc testées à sec. L'échappement XML n'est pas optionnel : le nom
// du trajet vient des libellés BAN, un service externe.
import type { Itineraire } from './itineraire';

const escXML = (t: string) => t
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&apos;');

/** GPX 1.1 — trkpt porte lat PUIS lon en attributs : l'ordre inverse du
    GeoJSON, et l'erreur classique des exports cassés. */
export function versGPX(iti: Itineraire, nom: string): string {
  const points = iti.geometrie.coordinates
    .map(([lon, lat]) => `      <trkpt lat="${lat}" lon="${lon}"/>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Infonovice Maps" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>${escXML(nom)}</name></metadata>
  <trk>
    <name>${escXML(nom)}</name>
    <trkseg>
${points}
    </trkseg>
  </trk>
</gpx>
`;
}

/** KML 2.2 — coordonnées lon,lat séparées par des espaces. */
export function versKML(iti: Itineraire, nom: string): string {
  const points = iti.geometrie.coordinates.map(([lon, lat]) => `${lon},${lat}`).join(' ');
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${escXML(nom)}</name>
    <Placemark>
      <name>${escXML(nom)}</name>
      <LineString><tessellate>1</tessellate><coordinates>${points}</coordinates></LineString>
    </Placemark>
  </Document>
</kml>
`;
}

/** Déclenche le téléchargement côté navigateur — rien ne part nulle part. */
export function telecharger(contenu: string, nomFichier: string, type: string): void {
  const url = URL.createObjectURL(new Blob([contenu], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = nomFichier;
  a.click();
  URL.revokeObjectURL(url);
}
