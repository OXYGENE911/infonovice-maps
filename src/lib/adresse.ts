// Géocodage — API Adresse (Base Adresse Nationale), api-adresse.data.gouv.fr.
// Licence Ouverte, quota 50 req/s/IP : le débounce vit chez l'appelant, la
// résilience vit ici (timeout, une reprise à délai croissant, erreurs en
// français). Voir docs/apis.md.
import type { PointGeo } from './coordonnees';

const BAN = 'https://api-adresse.data.gouv.fr';
const DELAI_MS = 5000;

export interface ResultatAdresse extends PointGeo {
  libelle: string;
  /** Précision BAN : housenumber, street, locality, municipality. */
  type: string;
  /** « Code postal, ville (contexte départemental) » pour lever les homonymes. */
  contexte: string;
}

export class ErreurAdresse extends Error {}

async function appelResilient(url: string, signal?: AbortSignal): Promise<unknown> {
  let derniere: unknown;
  for (let essai = 0; essai < 2; essai += 1) {
    try {
      const r = await fetch(url, {
        signal: signal ?? AbortSignal.timeout(DELAI_MS),
        headers: { Accept: 'application/json' },
      });
      if (!r.ok) throw new ErreurAdresse(`BAN a répondu ${r.status}`);
      return await r.json();
    } catch (e) {
      derniere = e;
      // Une annulation volontaire (frappe suivante) ne se rejoue pas.
      if (e instanceof DOMException && e.name === 'AbortError') throw e;
      if (essai === 0) await new Promise((s) => setTimeout(s, 400 * (essai + 1)));
    }
  }
  throw new ErreurAdresse(
    'La recherche d’adresse est momentanément indisponible. Réessayez dans un instant.',
    { cause: derniere },
  );
}

interface ProprietesBAN {
  label?: string; type?: string; context?: string; postcode?: string; city?: string;
}
interface EntiteBAN {
  geometry?: { coordinates?: [number, number] };
  properties?: ProprietesBAN;
}

/** Transforme la réponse BAN en résultats propres — PURE, donc testée à sec. */
export function versResultats(brut: unknown): ResultatAdresse[] {
  const feats = (brut as { features?: EntiteBAN[] })?.features;
  if (!Array.isArray(feats)) return [];
  const resultats: ResultatAdresse[] = [];
  for (const f of feats) {
    const coords = f.geometry?.coordinates;
    const p = f.properties;
    if (!coords || !p?.label) continue;
    const [lon, lat] = coords;
    if (typeof lon !== 'number' || typeof lat !== 'number') continue;
    resultats.push({
      lon, lat,
      libelle: p.label,
      type: p.type ?? 'inconnu',
      contexte: [p.postcode, p.city].filter(Boolean).join(' ') || (p.context ?? ''),
    });
  }
  return resultats;
}

export async function chercherAdresses(texte: string, signal?: AbortSignal): Promise<ResultatAdresse[]> {
  const q = texte.trim();
  // La BAN refuse les requêtes de moins de 3 caractères : on n'envoie rien.
  if (q.length < 3) return [];
  const url = `${BAN}/search/?q=${encodeURIComponent(q)}&limit=5&autocomplete=1`;
  return versResultats(await appelResilient(url, signal));
}

export async function adresseInverse(p: PointGeo): Promise<ResultatAdresse | null> {
  const url = `${BAN}/reverse/?lon=${p.lon}&lat=${p.lat}`;
  const r = versResultats(await appelResilient(url));
  return r[0] ?? null;
}
