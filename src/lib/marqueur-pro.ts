/**
 * LE MARQUEUR « PRO » — savoir se souvenir d'où l'on vient, sans rien demander.
 *
 * Armelin, le 17/09/2026, après avoir payé un abonnement de test : « quand on
 * est sur la cartographie Maps, rien de distinctif à l'écran ne fait penser à
 * ce que cela ait fonctionné. Il faudrait avoir le logo Infonovice Maps en haut
 * à gauche différent quand on est connecté en mode Maps Pro. »
 *
 * CE QUE CE MODULE N'EST PAS, et c'est le point important. Il ne vérifie aucun
 * abonnement et n'interroge aucun service : ce client est le client LIBRE, et
 * la `connect-src` de sa page interdit d'appeler maps-pro.infonovice.fr — c'est
 * la frontière entre le logiciel sous AGPL et l'offre propriétaire, tenue par
 * le navigateur lui-même (voir tests/csp-connect-src.test.ts). Le marqueur dit
 * donc une seule chose, vraie : « cet usager est arrivé ici depuis son compte
 * Maps Pro ». Il n'ouvre AUCUNE fonction. Le falsifier ne donne accès à rien,
 * et c'est pour cela qu'il peut vivre dans le navigateur.
 *
 * IL EXPIRE. Un marqueur éternel finirait par mentir — abonnement résilié,
 * appareil prêté. Trente jours, renouvelés à chaque passage par la page de
 * compte, suffisent pour que la mention suive un abonné réel et s'efface d'un
 * autre.
 */

/** La clé dans le stockage local. Préfixée, comme tout ce que pose ce client. */
export const CLE_PRO = 'maps.pro';

/** Trente jours en millisecondes. */
export const DUREE_MARQUEUR_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Le stockage local s'il est accessible, sinon `null`. Y accéder peut LEVER
 * (navigation privée stricte, cookies tiers coupés, réglage d'entreprise) :
 * un simple `window.localStorage` a déjà suffi à casser des pages entières.
 */
export function stockageLocal(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Ce que le fragment d'URL demande — PURE. `null` = il ne dit rien. */
export function marqueurDuFragment(fragment: string): boolean | null {
  /* LE JETON EST LU EN ENTIER, des deux côtés. Première écriture :
     `/[#&]pro(?:=([^&]*))?/` — sans borne à droite, « #promenade=1 » activait
     la mention, le groupe optionnel se contentant de ne pas correspondre. Le
     test l'a attrapé avant la production. */
  const m = /(?:^|[#&])pro(?:=([^&]*))?(?=&|$)/.exec(fragment);
  if (!m) return null;
  const valeur = m[1];
  // `#pro` sans valeur vaut oui ; `#pro=0` et `#pro=` valent non.
  if (valeur === undefined) return true;
  return valeur !== '0' && valeur !== '' && valeur !== 'false';
}

/**
 * Le fragment débarrassé du seul jeton `pro`, les autres intacts — PURE.
 * Ce client met déjà des trajets et des lieux dans le fragment : on en retire
 * un jeton, on ne le remplace pas.
 */
export function nettoyerFragment(fragment: string): string {
  const corps = fragment.startsWith('#') ? fragment.slice(1) : fragment;
  const restants = corps.split('&').filter((j) => j !== '' && !/^pro(=.*)?$/.test(j));
  return restants.length ? `#${restants.join('&')}` : '';
}

/** Le marqueur gardé est-il encore valable — PURE. */
export function marqueurValable(brut: string | null, maintenant: number): boolean {
  if (!brut) return false;
  const pose = Number(brut);
  if (!Number.isFinite(pose) || pose <= 0) return false;
  // Une date future signale une horloge déréglée ou une valeur bricolée : on
  // ne s'en sert pas plutôt que de faire confiance à un compte à rebours faux.
  if (pose > maintenant) return false;
  return maintenant - pose < DUREE_MARQUEUR_MS;
}

/**
 * Lit le fragment, met à jour le stockage, et rend l'état à afficher.
 * Le fragment est rendu « nettoyé » à l'appelant : à lui de réécrire l'URL, ce
 * module ne touche pas à l'historique.
 */
export function reglerMarqueur(
  fragment: string,
  stockage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null,
  maintenant: number = Date.now(),
): { pro: boolean; fragmentNettoye: string } {
  const demande = marqueurDuFragment(fragment);
  const fragmentNettoye = nettoyerFragment(fragment);

  if (!stockage) return { pro: demande === true, fragmentNettoye };

  try {
    if (demande === true) {
      stockage.setItem(CLE_PRO, String(maintenant));
      return { pro: true, fragmentNettoye };
    }
    if (demande === false) {
      stockage.removeItem(CLE_PRO);
      return { pro: false, fragmentNettoye };
    }
    return { pro: marqueurValable(stockage.getItem(CLE_PRO), maintenant), fragmentNettoye };
  } catch {
    // Navigation privée, stockage refusé : la mention ne survivra pas à
    // l'onglet, et c'est tout ce que l'on perd.
    return { pro: demande === true, fragmentNettoye };
  }
}
