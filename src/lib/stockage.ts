// Préférences et données locales — IndexedDB, comme le contrat du projet
// l'exige (« aucune donnée utilisateur ne quitte le navigateur »). localStorage
// aurait suffi pour une préférence ; IndexedDB est choisi UNE fois, ici, parce
// que les favoris (PR #10) y vivent aussi : un seul mécanisme, exportable en
// JSON d'un bloc.
//
// LES ÉCHECS DE LECTURE SONT SILENCIEUX PAR CONTRAT (navigation privée
// stricte, quota, vieux navigateur) : une donnée locale qui ne se relit pas
// n'est pas une panne, on repart des valeurs par défaut. Les ÉCRITURES de
// favoris, elles, REMONTENT : perdre silencieusement un favori que l'usager
// vient d'ajouter serait un mensonge.
const BASE = 'infonovice-maps';
export const MAGASIN_PREFERENCES = 'preferences';
export const MAGASIN_FAVORIS = 'favoris';
// Version 2 : arrivée du magasin des favoris (PR #10).
const VERSION = 2;

function ouvrir(): Promise<IDBDatabase> {
  return new Promise((resoudre, rejeter) => {
    const demande = indexedDB.open(BASE, VERSION);
    demande.onupgradeneeded = () => {
      for (const magasin of [MAGASIN_PREFERENCES, MAGASIN_FAVORIS]) {
        if (!demande.result.objectStoreNames.contains(magasin)) {
          demande.result.createObjectStore(magasin);
        }
      }
    };
    demande.onsuccess = () => resoudre(demande.result);
    demande.onerror = () => rejeter(demande.error);
  });
}

export async function lirePreference<T>(cle: string): Promise<T | undefined> {
  try {
    const db = await ouvrir();
    return await new Promise((resoudre, rejeter) => {
      const d = db.transaction(MAGASIN_PREFERENCES, 'readonly').objectStore(MAGASIN_PREFERENCES).get(cle);
      d.onsuccess = () => resoudre(d.result as T | undefined);
      d.onerror = () => rejeter(d.error);
    });
  } catch {
    return undefined;
  }
}

export async function ecrirePreference(cle: string, valeur: unknown): Promise<void> {
  try {
    const db = await ouvrir();
    await new Promise<void>((resoudre, rejeter) => {
      const t = db.transaction(MAGASIN_PREFERENCES, 'readwrite');
      t.objectStore(MAGASIN_PREFERENCES).put(valeur, cle);
      t.oncomplete = () => resoudre();
      t.onerror = () => rejeter(t.error);
    });
  } catch { /* échec d'écriture de préférence : l'usage continue */ }
}

/** Toutes les entrées [clé, valeur] d'un magasin — pour l'export intégral. */
export async function entreesMagasin(magasin: string): Promise<[IDBValidKey, unknown][]> {
  try {
    const db = await ouvrir();
    return await new Promise((resoudre, rejeter) => {
      const m = db.transaction(magasin, 'readonly').objectStore(magasin);
      const cles = m.getAllKeys();
      const valeurs = m.getAll();
      valeurs.onsuccess = () => resoudre((cles.result ?? []).map((c, i) => [c, valeurs.result[i]]));
      valeurs.onerror = () => rejeter(valeurs.error);
    });
  } catch {
    return [];
  }
}

/** Écrit une entrée — LÈVE en cas d'échec (les favoris ne se perdent pas en silence). */
export async function ecrireDans(magasin: string, cle: IDBValidKey, valeur: unknown): Promise<void> {
  const db = await ouvrir();
  await new Promise<void>((resoudre, rejeter) => {
    const t = db.transaction(magasin, 'readwrite');
    t.objectStore(magasin).put(valeur, cle);
    t.oncomplete = () => resoudre();
    t.onerror = () => rejeter(t.error);
  });
}

export async function supprimerDans(magasin: string, cle: IDBValidKey): Promise<void> {
  const db = await ouvrir();
  await new Promise<void>((resoudre, rejeter) => {
    const t = db.transaction(magasin, 'readwrite');
    t.objectStore(magasin).delete(cle);
    t.oncomplete = () => resoudre();
    t.onerror = () => rejeter(t.error);
  });
}

/** Remplace TOUT le contenu d'un magasin (import) — atomique, une transaction. */
export async function remplacerMagasin(magasin: string, entrees: [IDBValidKey, unknown][]): Promise<void> {
  const db = await ouvrir();
  await new Promise<void>((resoudre, rejeter) => {
    const t = db.transaction(magasin, 'readwrite');
    const m = t.objectStore(magasin);
    m.clear();
    for (const [cle, valeur] of entrees) m.put(valeur, cle);
    t.oncomplete = () => resoudre();
    t.onerror = () => rejeter(t.error);
  });
}
