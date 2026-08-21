// Photos de rue — Panoramax, le commun français de l'imagerie de rue (IGN +
// OpenStreetMap France) : le pendant souverain de Street View, alimenté par
// des contributeurs et publié sous licence libre.
//
// Vérifié par appels réels le 22/08/2026 (docs/apis.md) : API STAC sur
// api.panoramax.xyz, recherche par `bbox`, CORS ouvert. Les IMAGES sont
// servies par un autre hôte (panoramax.openstreetmap.fr) — deux origines à
// déclarer dans la CSP, décision tracée en PR.
//
// L'ATTRIBUTION EST UNE OBLIGATION, PAS UN ORNEMENT : les photos sont sous
// CC-BY-SA ; la visionneuse affiche producteur, licence et date, faute de
// quoi nous serions hors des clous de la licence que nous invoquons.
export class ErreurPhotos extends Error {}

const RECHERCHE = 'https://api.panoramax.xyz/api/search';
const DELAI_MS = 8000;

export interface PhotoRue {
  id: string;
  lon: number;
  lat: number;
  /** Image de taille moyenne — suffisante à l'écran, légère au réseau. */
  image: string;
  vignette: string | null;
  /** Date de prise de vue, ISO 8601, ou null si le service ne la donne pas. */
  prise: string | null;
  producteur: string | null;
  licence: string | null;
}

/** URL de recherche pour une petite boîte autour d'un point — PURE. */
export function urlPhotos(lon: number, lat: number, rayonDeg = 0.0016, limite = 12): string {
  const bbox = [lon - rayonDeg, lat - rayonDeg, lon + rayonDeg, lat + rayonDeg]
    .map((v) => v.toFixed(6)).join(',');
  return `${RECHERCHE}?bbox=${bbox}&limit=${limite}`;
}

const texte = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);

/** Réponse STAC → photos exploitables — PURE et défensive, testée à sec. */
export function versPhotos(brut: unknown): PhotoRue[] {
  const f = (brut as { features?: unknown[] })?.features;
  if (!Array.isArray(f)) {
    throw new ErreurPhotos('Le service de photos n’a pas rendu de données exploitables.');
  }
  const photos: PhotoRue[] = [];
  for (const entree of f) {
    const e = entree as {
      id?: unknown;
      geometry?: { type?: string; coordinates?: unknown };
      properties?: Record<string, unknown>;
      assets?: Record<string, { href?: unknown; type?: unknown }>;
    };
    const coords = e?.geometry?.coordinates;
    if (e?.geometry?.type !== 'Point' || !Array.isArray(coords)) continue;
    const [lon, lat] = coords as [unknown, unknown];
    if (typeof lon !== 'number' || typeof lat !== 'number') continue;
    if (Math.abs(lon) > 180 || Math.abs(lat) > 90) continue;
    // Une photo sans image n'est pas une photo.
    const image = texte(e.assets?.['sd']?.href) ?? texte(e.assets?.['hd']?.href);
    const id = texte(e.id);
    if (!image || !id) continue;
    // Les images doivent venir des hôtes Panoramax déclarés dans la CSP :
    // une URL d'ailleurs serait bloquée à l'affichage — autant l'écarter ici,
    // plutôt que de montrer un cadre vide.
    if (!/^https:\/\/[a-z0-9.-]*panoramax\.(openstreetmap\.fr|xyz)\//i.test(image)) continue;
    const p = e.properties ?? {};
    photos.push({
      id,
      lon,
      lat,
      image,
      vignette: texte(e.assets?.['thumb']?.href),
      prise: texte(p['datetime']),
      producteur: texte(p['geovisio:producer']),
      licence: texte(p['license']),
    });
  }
  return photos;
}

/** La photo la plus proche du point demandé — PURE (plan local suffisant). */
export function plusProche(photos: PhotoRue[], lon: number, lat: number): PhotoRue | null {
  let meilleure: PhotoRue | null = null;
  let meilleurCarre = Infinity;
  const kLon = Math.cos((lat * Math.PI) / 180);
  for (const p of photos) {
    const dx = (p.lon - lon) * kLon;
    const dy = p.lat - lat;
    const carre = dx * dx + dy * dy;
    if (carre < meilleurCarre) { meilleurCarre = carre; meilleure = p; }
  }
  return meilleure;
}

/** Date lisible en français, ou null — PURE. */
export function formaterPrise(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('fr-FR', { year: 'numeric', month: 'long' });
}

export async function chercherPhotos(
  lon: number, lat: number, signal?: AbortSignal,
): Promise<PhotoRue[]> {
  let derniere: unknown;
  for (let essai = 0; essai < 2; essai += 1) {
    try {
      const r = await fetch(urlPhotos(lon, lat), {
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(DELAI_MS)])
          : AbortSignal.timeout(DELAI_MS),
        headers: { Accept: 'application/json' },
      });
      if (r.ok) return versPhotos(await r.json());
      // Même politique que les autres services : seuls les 5xx se rejouent.
      if (r.status >= 500) throw new Error(`service ${r.status}`);
      throw new ErreurPhotos(`Les photos de rue sont indisponibles (réponse ${r.status}).`);
    } catch (e) {
      if (signal?.aborted) throw e;
      if (e instanceof ErreurPhotos) throw e;
      derniere = e;
      if (essai === 0) await new Promise((s) => setTimeout(s, 500));
    }
  }
  throw new ErreurPhotos(
    'Les photos de rue sont momentanément indisponibles. Réessayez dans un instant.',
    { cause: derniere },
  );
}
