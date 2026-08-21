// Favoris — des lieux nommés, en IndexedDB, JAMAIS ailleurs : « vos données
// ne quittent jamais ce navigateur » est le contrat du projet. L'export JSON
// est la portabilité RGPD faite bouton : tout ce que l'application sait de
// vous tient dans un fichier que VOUS téléchargez ; l'import le restaure —
// sur cette machine ou une autre. La validation d'import est PURE et
// défensive : un fichier forgé rend une erreur française, jamais une surprise.
import type { PointGeo } from './coordonnees';
import {
  MAGASIN_FAVORIS, MAGASIN_PREFERENCES,
  entreesMagasin, ecrireDans, supprimerDans, remplacerMagasin,
} from './stockage';

export class ErreurFavoris extends Error {}

export interface Favori extends PointGeo {
  id: string;
  nom: string;
  /** Date d'ajout, ISO 8601. */
  cree: string;
}

export async function listerFavoris(): Promise<Favori[]> {
  const entrees = await entreesMagasin(MAGASIN_FAVORIS);
  return entrees
    .map(([, v]) => v as Favori)
    .filter((f) => f && typeof f.id === 'string')
    .sort((a, b) => (a.cree < b.cree ? 1 : -1));
}

export async function ajouterFavori(nom: string, point: PointGeo): Promise<Favori> {
  const favori: Favori = {
    id: crypto.randomUUID(),
    nom: nom.trim() || 'Lieu sans nom',
    lon: point.lon,
    lat: point.lat,
    cree: new Date().toISOString(),
  };
  await ecrireDans(MAGASIN_FAVORIS, favori.id, favori);
  return favori;
}

export async function retirerFavori(id: string): Promise<void> {
  await supprimerDans(MAGASIN_FAVORIS, id);
}

/* ---- export / import ---- */

interface Sauvegarde {
  application: 'infonovice-maps';
  version: 1;
  exporte: string;
  preferences: Record<string, unknown>;
  favoris: Favori[];
}

export async function exporterDonnees(): Promise<string> {
  const preferences: Record<string, unknown> = {};
  for (const [cle, valeur] of await entreesMagasin(MAGASIN_PREFERENCES)) {
    preferences[String(cle)] = valeur;
  }
  const sauvegarde: Sauvegarde = {
    application: 'infonovice-maps',
    version: 1,
    exporte: new Date().toISOString(),
    preferences,
    favoris: await listerFavoris(),
  };
  return JSON.stringify(sauvegarde, null, 2);
}

/** Analyse défensive d'une sauvegarde — PURE, testée à sec. */
export function validerSauvegarde(brut: unknown): { preferences: Record<string, unknown>; favoris: Favori[] } {
  const s = brut as Partial<Sauvegarde> | null;
  if (s?.application !== 'infonovice-maps' || s.version !== 1) {
    throw new ErreurFavoris('Ce fichier n’est pas une sauvegarde Infonovice Maps.');
  }
  const favoris: Favori[] = [];
  for (const f of Array.isArray(s.favoris) ? s.favoris : []) {
    const c = f as Partial<Favori> | null;
    if (typeof c?.id !== 'string' || !c.id || typeof c.nom !== 'string') continue;
    if (typeof c.lon !== 'number' || typeof c.lat !== 'number'
      || Math.abs(c.lon) > 180 || Math.abs(c.lat) > 90) continue;
    favoris.push({
      id: c.id, nom: c.nom, lon: c.lon, lat: c.lat,
      cree: typeof c.cree === 'string' ? c.cree : new Date(0).toISOString(),
    });
  }
  const preferences = s.preferences && typeof s.preferences === 'object' && !Array.isArray(s.preferences)
    ? s.preferences as Record<string, unknown> : {};
  return { preferences, favoris };
}

/** Importe une sauvegarde : REMPLACE favoris et préférences (le fichier fait
    foi — c'est une restauration, pas une fusion). Rend le nombre de favoris. */
export async function importerDonnees(json: string): Promise<number> {
  let brut: unknown;
  try {
    brut = JSON.parse(json);
  } catch {
    throw new ErreurFavoris('Ce fichier n’est pas un JSON lisible.');
  }
  const { preferences, favoris } = validerSauvegarde(brut);
  await remplacerMagasin(MAGASIN_FAVORIS, favoris.map((f) => [f.id, f]));
  await remplacerMagasin(MAGASIN_PREFERENCES, Object.entries(preferences));
  return favoris.length;
}
