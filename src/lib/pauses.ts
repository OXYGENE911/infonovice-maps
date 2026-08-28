/* LES PROFILS DE PAUSES HUMAINES — la décision d'Armelin du 28/08.
 *
 * Un trajet électrique s'arrête de toute façon : autant que l'arrêt serve
 * AUSSI les humains à bord. Trois profils, chacun HONORÉ PAR UNE MESURE
 * (corridor Paris-Lyon, 28/08/2026, à 600 m du tracé) : les aires de jeux
 * (≥ 293 — leisure=playground), les espaces verts (≥ 220 — leisure=park ou
 * dog_park), la restauration (≥ 1 400 — restaurant|fast_food). Un profil
 * sans données serait une étiquette vide — la règle du projet.
 *
 * LA FORME DE LA REQUÊTE EST UNE MESURE AUSSI : une recherche « le long du
 * corridor » (around-polyligne, rayon 600 m) SATURE le miroir Overpass
 * (timeouts relevés le 28/08). Une UNION de petits disques autour des seules
 * bornes candidates répond en ~7 s sans épuisement — c'est elle qu'on
 * envoie : UN appel par plan et par profil, jamais au réglage.
 *
 * LE PROFIL EST UNE PRÉFÉRENCE, PAS UN FILTRE : une borne sans aire de jeux
 * reste utilisable — en écarter ferait échouer des trajets faisables. Le
 * choix de borne reçoit un BONUS, et la liste DIT ce qui a été trouvé.
 */
import { cleBorne, type BorneCandidate } from './arrets';

export interface ProfilPause {
  cle: string;
  /** Le libellé du réglage. */
  libelle: string;
  /** Ce qu'on annonce sur l'arrêt : « aire de jeux à 250 m ». */
  agrement: string;
  /** Le filtre Overpass — clés OSM les mieux renseignées, mesurées. */
  filtre: string;
}

export const PROFILS_PAUSE: readonly ProfilPause[] = [
  { cle: 'famille', libelle: 'Famille (aire de jeux)', agrement: 'aire de jeux',
    filtre: '["leisure"="playground"]' },
  { cle: 'animal', libelle: 'Animal (espace vert)', agrement: 'espace vert',
    filtre: '["leisure"~"^(park|dog_park)$"]' },
  { cle: 'repas', libelle: 'Repas (restauration)', agrement: 'restauration',
    filtre: '["amenity"~"^(restaurant|fast_food)$"]' },
];

/** Le rayon d'un disque : au-delà, on ne traverse pas un échangeur à pied. */
export const RAYON_AGREMENT_M = 500;

/* Au-delà, la requête grossit sans que le plan y gagne : les bornes du
   corridor au-delà de la soixantième n'ont presque jamais leur chance. */
const MAX_DISQUES = 60;

/** Le corps de la requête Overpass (à envoyer en POST) — PUR, testé à sec. */
export function corpsRequeteAgrements(
  profil: ProfilPause, bornes: readonly Pick<BorneCandidate, 'lon' | 'lat'>[],
): string {
  const disques = bornes.slice(0, MAX_DISQUES)
    .map((b) => `nwr${profil.filtre}(around:${RAYON_AGREMENT_M},${b.lat.toFixed(5)},${b.lon.toFixed(5)});`)
    .join('');
  return `[out:json][timeout:30];(${disques});out center 800;`;
}

/** Un point d'agrément décodé — position seule : c'est tout ce qui sert. */
export interface PointAgrement { lon: number; lat: number }

/** Décode une réponse Overpass. Défensive : la réponse vient du dehors. */
export function versPointsAgrement(brut: unknown): PointAgrement[] {
  const elements = (brut as { elements?: unknown })?.elements;
  if (!Array.isArray(elements)) return [];
  const rendu: PointAgrement[] = [];
  for (const e of elements) {
    if (typeof e !== 'object' || e === null) continue;
    const el = e as Record<string, unknown>;
    const centre = (el['center'] ?? {}) as Record<string, unknown>;
    const lat = typeof el['lat'] === 'number' ? el['lat']
      : (typeof centre['lat'] === 'number' ? centre['lat'] : null);
    const lon = typeof el['lon'] === 'number' ? el['lon']
      : (typeof centre['lon'] === 'number' ? centre['lon'] : null);
    if (lat === null || lon === null) continue;
    rendu.push({ lon, lat });
  }
  return rendu;
}

/** Distance approchée en mètres — l'équirectangulaire suffit à 500 m. */
function distanceM(a: PointAgrement, b: Pick<BorneCandidate, 'lon' | 'lat'>): number {
  const dx = (a.lon - b.lon) * 111_320 * Math.cos((b.lat * Math.PI) / 180);
  const dy = (a.lat - b.lat) * 110_540;
  return Math.hypot(dx, dy);
}

/**
 * Pour chaque borne : la distance du PLUS PROCHE agrément, dans le rayon.
 * Rendu par clé de borne — la même que le planificateur, aucune ambiguïté.
 */
export function agrementsParBorne(
  bornes: readonly BorneCandidate[], points: readonly PointAgrement[],
): Map<string, number> {
  const rendu = new Map<string, number>();
  for (const b of bornes) {
    let plusProche = Infinity;
    for (const p of points) {
      const d = distanceM(p, b);
      if (d < plusProche) plusProche = d;
    }
    if (plusProche <= RAYON_AGREMENT_M) rendu.set(cleBorne(b), Math.round(plusProche));
  }
  return rendu;
}

export class ErreurPauses extends Error {}

/**
 * Cherche les agréments d'un profil autour des bornes candidates.
 *
 * UN appel POST (la requête dépasse ce qu'une URL accepte), borné à quinze
 * secondes, même défense que les commodités contre les réponses HTML d'un
 * miroir saturé. Son échec est BÉNIN : le plan sort sans bonus, et le dit.
 */
export async function chercherAgrements(
  profil: ProfilPause, bornes: readonly BorneCandidate[], signal?: AbortSignal,
): Promise<Map<string, number>> {
  if (bornes.length === 0) return new Map();
  const horloge = new AbortController();
  const minuteur = setTimeout(() => { horloge.abort(); }, 15_000);
  const relais = (): void => { horloge.abort(); };
  signal?.addEventListener('abort', relais);
  try {
    const r = await fetch('https://overpass.openstreetmap.fr/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(corpsRequeteAgrements(profil, bornes))}`,
      signal: horloge.signal,
    });
    if (!r.ok) throw new ErreurPauses('La recherche des environs est indisponible pour le moment.');
    const texte = await r.text();
    try {
      return agrementsParBorne(bornes, versPointsAgrement(JSON.parse(texte)));
    } catch {
      throw new ErreurPauses('Le service des environs est saturé. Réessayez dans un instant.');
    }
  } catch (e) {
    if (e instanceof ErreurPauses) throw e;
    if (signal?.aborted) throw e;
    throw new ErreurPauses('La recherche des environs est indisponible pour le moment.');
  } finally {
    clearTimeout(minuteur);
    signal?.removeEventListener('abort', relais);
  }
}
