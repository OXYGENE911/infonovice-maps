/* LE SIGNAL GPS, EN CLAIR (OUTILS-2, 06/09/2026) — le calcul PUR.
 *
 * Armelin : « une icône en forme de satellite pour un menu affichant tous les
 * satellites captés par son appareil, pour vérifier si on capte bien — Petal
 * Maps ou Baidu Maps le proposent ». CE QU'UN NAVIGATEUR SAIT : la position,
 * sa précision (rayon en mètres), l'altitude, la vitesse, le cap, l'heure du
 * relevé. CE QU'IL NE SAIT PAS : la liste des satellites, leurs
 * constellations, leur rapport signal/bruit — l'API Geolocation ne les expose
 * pas, et aucune ruse ne les obtient. La page le dit ; la liste des satellites
 * est réservée à l'application Android native (GnssStatus, phase 2).
 *
 * On montre donc ce qui répond vraiment à « est-ce que je capte bien ? » : la
 * précision, qualifiée, et l'âge du relevé. */

export interface Fixe {
  latitude: number;
  longitude: number;
  accuracy: number;
  altitude: number | null;
  altitudeAccuracy: number | null;
  heading: number | null;
  speed: number | null;
}

export type Qualite = 'excellente' | 'bonne' | 'moyenne' | 'faible';

/** Seuils du terrain : un GPS de téléphone à ciel ouvert tient 3 à 8 m ; en
 *  ville, 10 à 30 ; sous un toit ou par réseau seul, au-delà de 50. */
export function qualitePrecision(precisionM: number): Qualite {
  if (!Number.isFinite(precisionM) || precisionM < 0) return 'faible';
  if (precisionM <= 8) return 'excellente';
  if (precisionM <= 20) return 'bonne';
  if (precisionM <= 50) return 'moyenne';
  return 'faible';
}

export const PHRASES_QUALITE: Record<Qualite, string> = {
  excellente: 'Excellente réception : le ciel est dégagé pour votre appareil.',
  bonne: 'Bonne réception : la position est fiable pour la conduite.',
  moyenne: 'Réception moyenne : bâtiments ou arbres gênent probablement.',
  faible: 'Réception faible : sous un toit, en tunnel, ou position par réseau seulement.',
};

export interface LigneFixe { libelle: string; valeur: string }

const nombre = (v: number, d = 0): string => v.toFixed(d).replace('.', ',');

/** Les lignes du tableau — PURE. `ageMs` : depuis le relevé ; `nb` : relevés reçus. */
export function lignesFixe(f: Fixe, ageMs: number, nb: number): LigneFixe[] {
  const lignes: LigneFixe[] = [
    { libelle: 'Précision', valeur: `± ${nombre(f.accuracy)} m` },
    { libelle: 'Qualité', valeur: qualitePrecision(f.accuracy) },
    { libelle: 'Position', valeur: `${nombre(f.latitude, 5)}, ${nombre(f.longitude, 5)}` },
  ];
  if (f.altitude !== null && Number.isFinite(f.altitude)) {
    lignes.push({
      libelle: 'Altitude',
      valeur: `${nombre(f.altitude)} m`
        + (f.altitudeAccuracy !== null && Number.isFinite(f.altitudeAccuracy)
          ? ` (± ${nombre(f.altitudeAccuracy)} m)` : ''),
    });
  } else {
    lignes.push({ libelle: 'Altitude', valeur: 'non donnée' });
  }
  lignes.push({
    libelle: 'Vitesse',
    valeur: f.speed !== null && Number.isFinite(f.speed) ? `${nombre(f.speed * 3.6)} km/h` : 'non donnée',
  });
  lignes.push({
    libelle: 'Cap',
    valeur: f.heading !== null && Number.isFinite(f.heading) ? `${nombre(f.heading)}°` : 'non donné',
  });
  const s = Math.max(0, Math.round(ageMs / 1000));
  lignes.push({ libelle: 'Âge du relevé', valeur: s < 2 ? 'à l’instant' : `il y a ${s} s` });
  lignes.push({ libelle: 'Relevés reçus', valeur: String(nb) });
  return lignes;
}
