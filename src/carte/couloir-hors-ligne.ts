/* EMPORTER LE COULOIR — les requêtes, la jauge, l'arrêt.
 *
 * Le CALCUL des tuiles vit dans src/lib/couloir.ts, pur et testé à sec. Ici
 * commence ce qui touche au réseau, et donc ce qui doit être tenu court.
 *
 * COMMENT LES TUILES SE GARDENT. On ne les écrit pas nous-mêmes dans un
 * cache : on les DEMANDE, et le service worker les garde — c'est sa route
 * `CacheFirst` sur la couche IGN, celle-là même qui rend la carte déjà
 * consultée disponible hors ligne. Écrire dans le cache à la main aurait
 * dédoublé cette logique, et surtout contourné la vérification du type MIME
 * qui protège du portail captif (voir tuiles-en-cache.ts).
 *
 * D'OÙ UNE CONDITION QU'IL FAUT DIRE : sans service worker actif — première
 * visite, navigateur qui les refuse — le téléchargement ne garderait RIEN.
 * On le vérifie avant de commencer, et on le dit, plutôt que de faire tourner
 * une jauge pour rien.
 *
 * QUATRE À LA FOIS. « Ces quotas sont un bien commun » : quatre requêtes
 * simultanées, c'est moins qu'un écran de carte qu'on fait glisser. Le geste
 * est rare — une fois avant de partir — et l'usager le déclenche lui-même.
 */

export interface AvanceCouloir {
  /** Tuiles arrivées, réussies ou non. */
  faites: number;
  total: number;
  /** Celles qui ont échoué : la carte aura des trous, il faut le dire. */
  echouees: number;
}

/** Un service worker tient-il la page ? Sans lui, rien ne serait gardé. */
export function gardienPresent(): boolean {
  return typeof navigator !== 'undefined'
    && typeof navigator.serviceWorker !== 'undefined'
    && navigator.serviceWorker.controller !== null;
}

/**
 * Demande les tuiles, quatre à la fois, en rendant compte à chaque arrivée.
 *
 * L'ARRÊT EST IMMÉDIAT ET PROPRE : le signal coupe les requêtes en vol, et la
 * fonction rend ce qui a été fait — un couloir à moitié emporté vaut mieux que
 * rien, et la moitié qui manque se redemandera au prochain essai puisque les
 * tuiles déjà gardées ne repartent pas sur le réseau.
 */
export async function emporterLesTuiles(
  urls: readonly string[],
  options: { concurrence?: number; signal?: AbortSignal; surAvance?: (a: AvanceCouloir) => void } = {},
): Promise<AvanceCouloir> {
  const concurrence = Math.max(1, options.concurrence ?? 4);
  const etat: AvanceCouloir = { faites: 0, total: urls.length, echouees: 0 };
  let curseur = 0;

  const ouvrier = async (): Promise<void> => {
    for (;;) {
      if (options.signal?.aborted) return;
      const i = curseur;
      curseur += 1;
      const url = urls[i];
      if (url === undefined) return;
      try {
        /* L'objet d'options se construit à part : le projet compile avec
           `exactOptionalPropertyTypes`, et passer `signal: undefined` n'est
           pas la même chose que ne pas le passer. */
        const init: RequestInit = options.signal ? { signal: options.signal } : {};
        const r = await fetch(url, init);
        /* UN 200 NE SUFFIT PAS : un portail captif répond 200 en HTML. Le
           service worker fait déjà ce contrôle avant de garder ; on le refait
           ici pour COMPTER juste, sans quoi la jauge annoncerait un couloir
           complet là où rien n'aurait été gardé. */
        if (!r.ok || !(r.headers.get('content-type') ?? '').startsWith('image/')) {
          etat.echouees += 1;
        }
      } catch {
        if (options.signal?.aborted) return;
        etat.echouees += 1;
      }
      etat.faites += 1;
      options.surAvance?.({ ...etat });
    }
  };

  await Promise.all(Array.from({ length: concurrence }, () => ouvrier()));
  return { ...etat };
}
