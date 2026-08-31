// Favoris — des lieux nommés, en IndexedDB, JAMAIS ailleurs : « vos données
// ne quittent jamais ce navigateur » est le contrat du projet. L'export JSON
// est la portabilité RGPD faite bouton : tout ce que l'application sait de
// vous tient dans un fichier que VOUS téléchargez ; l'import le restaure —
// sur cette machine ou une autre. La validation d'import est PURE et
// défensive : un fichier forgé rend une erreur française, jamais une surprise.
import type { PointGeo } from './coordonnees';
import {
  MAGASIN_FAVORIS, MAGASIN_PREFERENCES,
  entreesMagasin, ecrireDans, supprimerDans, remplacerMagasins,
  lirePreference, ecrirePreference,
} from './stockage';
import {
  versListes, listesAEcrire, normaliserListe, LISTE_PAR_DEFAUT,
  type ListeFavoris,
} from './listes-favoris';

/* LA CLÉ DES LISTES DANS LES PRÉFÉRENCES. Une liste est un RÉGLAGE : un
   magasin de plus imposerait une migration de schéma à tous les usagers pour
   trois objets. */
export const PREF_LISTES = 'listes-favoris';

export class ErreurFavoris extends Error {}
/** L'écriture locale a échoué (quota, navigation privée) — le fichier, lui,
    était bon : l'usager doit lire la bonne cause. */
export class ErreurStockage extends Error {}

export interface Favori extends PointGeo {
  id: string;
  nom: string;
  /** L'adresse d'origine, gardée en sous-titre quand l'usager renomme :
      « Maison de Mamie » n'aide que si l'on peut encore vérifier où c'est. */
  adresse?: string;
  /** Date d'ajout, ISO 8601. */
  cree: string;
  /* LA LISTE À LAQUELLE IL APPARTIENT (FAVORIS-2, 31/08). Absente sur les
     favoris d'avant : ils rejoignent « Lieux favoris » à la lecture, sans
     migration ni réécriture — une base qu'on réécrit est une base qu'on peut
     perdre. */
  liste?: string;
}

export async function listerFavoris(): Promise<Favori[]> {
  const entrees = await entreesMagasin(MAGASIN_FAVORIS);
  return entrees
    .map(([, v]) => v as Favori)
    .filter((f) => f && typeof f.id === 'string')
    .sort((a, b) => (a.cree < b.cree ? 1 : -1));
}

export async function ajouterFavori(
  nom: string, point: PointGeo, liste?: string,
): Promise<Favori> {
  const favori: Favori = {
    id: crypto.randomUUID(),
    nom: nom.trim() || 'Lieu sans nom',
    lon: point.lon,
    lat: point.lat,
    cree: new Date().toISOString(),
    liste: liste ?? LISTE_PAR_DEFAUT,
  };
  await ecrireDans(MAGASIN_FAVORIS, favori.id, favori);
  return favori;
}

export async function retirerFavori(id: string): Promise<void> {
  await supprimerDans(MAGASIN_FAVORIS, id);
}

/**
 * Renomme un favori — la demande d'Armelin du 27/08/2026 : « quand on met un
 * lieu en favoris, c'est son adresse qui s'affiche. Ce serait bien de pouvoir
 * leur donner un displayname plus facile à visualiser. »
 *
 * L'ADRESSE D'ORIGINE NE SE PERD PAS : au premier renommage, l'ancien nom —
 * qui est l'adresse BAN de l'ajout — descend en sous-titre. « Maison de
 * Mamie » sans adresse redeviendrait un point qu'il faut ouvrir pour situer.
 */
export async function renommerFavori(id: string, nom: string): Promise<Favori> {
  const propre = nom.trim();
  if (!propre) throw new ErreurFavoris('Un favori doit garder un nom.');
  const favori = (await listerFavoris()).find((f) => f.id === id);
  if (!favori) throw new ErreurFavoris('Ce favori n’existe plus.');
  const adresse = favori.adresse ?? (favori.nom === propre ? undefined : favori.nom);
  const nouveau: Favori = {
    ...favori, nom: propre, ...(adresse !== undefined ? { adresse } : {}),
  };
  await ecrireDans(MAGASIN_FAVORIS, id, nouveau);
  return nouveau;
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
      // L'adresse d'origine (renommage) voyage avec l'export : la perdre à
      // l'import ferait d'une restauration une dégradation.
      ...(typeof c.adresse === 'string' && c.adresse ? { adresse: c.adresse } : {}),
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
  try {
    // UNE transaction pour les deux magasins : tout ou rien.
    await remplacerMagasins({
      [MAGASIN_FAVORIS]: favoris.map((f) => [f.id, f]),
      [MAGASIN_PREFERENCES]: Object.entries(preferences),
    });
  } catch (e) {
    throw new ErreurStockage(
      'Le fichier est valide, mais l’enregistrement local a échoué (espace insuffisant ou navigation privée).',
      { cause: e },
    );
  }
  return favoris.length;
}

/**
 * Les listes de favoris, livrées comprises.
 *
 * DÉFENSIVE JUSQU'AU BOUT : un stockage vide, abîmé ou venu d'une version
 * future rend quand même les trois listes livrées — un panneau vide au
 * premier lancement ne dit pas ce que l'application sait faire.
 */
export async function listerListes(): Promise<ListeFavoris[]> {
  try {
    return versListes(await lirePreference<unknown>(PREF_LISTES));
  } catch {
    return versListes(undefined);
  }
}

/**
 * Crée une liste, ou rend celle qui porte déjà ce nom.
 *
 * ON NE CRÉE PAS DE DOUBLON SILENCIEUX : deux listes « Bars » côte à côte ne
 * se distingueraient pas, et l'usager ne saurait plus où il range.
 */
export async function creerListe(brut: {
  nom: string; emoji?: string; couleur?: string;
}): Promise<ListeFavoris> {
  const voulue = normaliserListe(brut);
  if (!voulue) throw new ErreurFavoris('Une liste a besoin d’un nom.');
  const toutes = await listerListes();
  const deja = toutes.find((l) => l.id === voulue.id);
  if (deja) return deja;
  await ecrirePreference(PREF_LISTES, listesAEcrire([...toutes, voulue]));
  return voulue;
}

/**
 * Efface une liste, et REND SES LIEUX à la liste par défaut.
 *
 * PERDRE SES FAVORIS PARCE QU'ON A SUPPRIMÉ UNE CATÉGORIE serait une
 * trahison du contrat : ranger n'est pas jeter. Les listes livrées ne
 * s'effacent pas — elles sont le fond du meuble.
 */
export async function effacerListe(id: string): Promise<void> {
  const toutes = await listerListes();
  const cible = toutes.find((l) => l.id === id);
  if (!cible || cible.livree === true) {
    throw new ErreurFavoris('Cette liste ne peut pas être supprimée.');
  }
  for (const f of await listerFavoris()) {
    if (f.liste === id) await ecrireDans(MAGASIN_FAVORIS, f.id, { ...f, liste: LISTE_PAR_DEFAUT });
  }
  await ecrirePreference(PREF_LISTES, listesAEcrire(toutes.filter((l) => l.id !== id)));
}

/** Range un favori dans une liste. */
export async function rangerFavori(id: string, liste: string): Promise<Favori> {
  const favori = (await listerFavoris()).find((f) => f.id === id);
  if (!favori) throw new ErreurFavoris('Ce favori n’existe plus.');
  const range: Favori = { ...favori, liste };
  await ecrireDans(MAGASIN_FAVORIS, id, range);
  return range;
}
