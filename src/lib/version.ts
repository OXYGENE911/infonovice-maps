// SAVOIR CE QU'ON EXÉCUTE, ET POUVOIR EN CHANGER (VERSION-1, 02/09).
//
// LE TERRAIN. Armelin, après un essai à pied : « je ne sais pas si j'ai la
// bonne version en cache ». Il avait raison de douter — l'application est une
// PWA, son service worker garde le paquet précédent jusqu'à ce qu'il cède la
// place, et RIEN dans l'écran ne disait laquelle tournait. Trois de ses
// retours du jour peuvent s'expliquer par un paquet périmé ; sans numéro
// affiché, ni lui ni moi ne pouvons trancher.
//
// DEUX CHOSES, DONC : le numéro se lit, et la mise à jour se force. La
// seconde est aussi une issue de secours — quand la carte ne se dessine plus,
// la bulle « i » reste, elle, parfaitement cliquable.

/* Injecté à la construction depuis `package.json` (voir vite.config.ts). */
declare const __VERSION__: string;

/**
 * La version du paquet servi.
 *
 * LE REPLI N'EST PAS UN MENSONGE : hors construction Vite — un test unitaire
 * qui importe ce module — la constante n'existe pas. On rend alors « inconnue »
 * plutôt qu'un numéro inventé, qui serait pire que pas de numéro du tout.
 */
export const VERSION: string = typeof __VERSION__ === 'string' ? __VERSION__ : 'inconnue';

/** Le texte affiché dans la bulle d'information — PURE. */
export function libelleVersion(version: string = VERSION): string {
  return version === 'inconnue' ? 'Version inconnue' : `Version ${version}`;
}

/**
 * Vide les caches et réenregistre le service worker, puis recharge.
 *
 * ON DÉSINSCRIT AVANT DE VIDER, et l'ordre compte : un service worker encore
 * actif peut réécrire dans un cache qu'on vient d'effacer, et l'on rechargerait
 * sur le même paquet. Ensuite seulement on recharge.
 *
 * TOUT PEUT ÉCHOUER SANS QUE CE SOIT GRAVE : un navigateur qui refuse
 * `caches` ou `serviceWorker` doit tout de même recharger — c'est la moitié
 * utile du geste. D'où les `catch` qui laissent passer.
 */
export async function forcerMiseAJour(): Promise<void> {
  try {
    const inscrits = await navigator.serviceWorker?.getRegistrations?.() ?? [];
    await Promise.all(inscrits.map((r) => r.unregister().catch(() => false)));
  } catch { /* pas de service worker : rien à désinscrire */ }
  try {
    const cles = await caches.keys();
    await Promise.all(cles.map((k) => caches.delete(k).catch(() => false)));
  } catch { /* pas de cache accessible : on recharge quand même */ }
}
