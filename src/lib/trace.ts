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

/** Un point du tracé RÉELLEMENT PARCOURU, tel que l'historique le garde. */
export interface PointReleve {
  lon: number;
  lat: number;
  /** Altitude en mètres, quand le récepteur l'a donnée. */
  altitudeM?: number | null;
  /** Millisecondes depuis le départ — pas une heure absolue. */
  tMs?: number;
}

/**
 * GPX 1.1 du tracé ENREGISTRÉ — PURE (HIST-4, 08/09/2026).
 *
 * CE N'EST PAS LE MÊME FICHIER QUE `versGPX`, et la différence est tout
 * l'intérêt. Celui-là exporte l'itinéraire CALCULÉ : une suite de points, rien
 * d'autre. Celui-ci exporte ce que le GPS a vu — avec l'ALTITUDE et l'HEURE de
 * chaque point. C'est ce qui fait la différence entre une ligne sur une carte
 * et une trace qu'un autre outil sait relire : Garmin, OsmAnd, Strava
 * calculent le dénivelé et la vitesse à partir de `ele` et `time`, et un GPX
 * qui n'en a pas leur paraît vide.
 *
 * L'HEURE EST ABSOLUE dans le fichier, relative dans notre stockage : le GPX
 * demande un instant ISO 8601, l'historique garde des millisecondes depuis le
 * départ (moins lourd, et sans fuseau à trancher). On additionne ici.
 *
 * Les points sans position sont écartés en amont ; ceux sans altitude ni heure
 * s'écrivent quand même — un `trkpt` nu reste valide, et vaut mieux qu'un trou.
 */
export function versGPXTrace(
  points: readonly PointReleve[], nom: string, departMs?: number,
): string {
  const lignes = points.map((p) => {
    const dedans: string[] = [];
    if (typeof p.altitudeM === 'number' && Number.isFinite(p.altitudeM)) {
      dedans.push(`<ele>${p.altitudeM.toFixed(1)}</ele>`);
    }
    if (typeof departMs === 'number' && typeof p.tMs === 'number') {
      dedans.push(`<time>${new Date(departMs + p.tMs).toISOString()}</time>`);
    }
    return dedans.length === 0
      ? `      <trkpt lat="${p.lat}" lon="${p.lon}"/>`
      : `      <trkpt lat="${p.lat}" lon="${p.lon}">${dedans.join('')}</trkpt>`;
  }).join('\n');
  const quand = typeof departMs === 'number'
    ? `<time>${new Date(departMs).toISOString()}</time>` : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Infonovice Maps" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>${escXML(nom)}</name>${quand}</metadata>
  <trk>
    <name>${escXML(nom)}</name>
    <trkseg>
${lignes}
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
