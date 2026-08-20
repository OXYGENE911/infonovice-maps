// Préférences et données locales — IndexedDB, comme le contrat du projet
// l'exige (« aucune donnée utilisateur ne quitte le navigateur »). localStorage
// aurait suffi pour une préférence ; IndexedDB est choisi UNE fois, ici, parce
// que les favoris (PR #10) et les listes de POI y vivront aussi : un seul
// mécanisme, exportable en JSON d'un bloc.
const BASE = 'infonovice-maps';
const MAGASIN = 'preferences';

function ouvrir(): Promise<IDBDatabase> {
  return new Promise((resoudre, rejeter) => {
    const demande = indexedDB.open(BASE, 1);
    demande.onupgradeneeded = () => {
      if (!demande.result.objectStoreNames.contains(MAGASIN)) {
        demande.result.createObjectStore(MAGASIN);
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
      const d = db.transaction(MAGASIN, 'readonly').objectStore(MAGASIN).get(cle);
      d.onsuccess = () => resoudre(d.result as T | undefined);
      d.onerror = () => rejeter(d.error);
    });
  } catch {
    // Navigation privée stricte, quota, vieux navigateur : une préférence qui
    // ne se relit pas n'est pas une panne — on repart des valeurs par défaut.
    return undefined;
  }
}

export async function ecrirePreference(cle: string, valeur: unknown): Promise<void> {
  try {
    const db = await ouvrir();
    await new Promise<void>((resoudre, rejeter) => {
      const t = db.transaction(MAGASIN, 'readwrite');
      t.objectStore(MAGASIN).put(valeur, cle);
      t.oncomplete = () => resoudre();
      t.onerror = () => rejeter(t.error);
    });
  } catch { /* même philosophie : l'échec d'écriture ne casse pas l'usage */ }
}
