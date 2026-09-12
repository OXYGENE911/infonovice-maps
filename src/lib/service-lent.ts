/* SIGNALER LA LENTEUR D'UN APPEL OBLIGATOIRE (ITI-LENT-1, 12/09/2026).
 *
 * LE CONSTAT DE LA CONTRE-MESURE DU 12/09 : le délai de garde posé au C4
 * (`delai-garde.ts`, ALTI-GARDE-1) ne couvre que l'altimétrie — une donnée
 * FACULTATIVE, que le plan peut perdre sans cesser d'exister. L'itinéraire
 * n'a pas cette chance : sans lui il n'y a pas de trajet à afficher.
 *
 * `avecDelaiDeGarde` NE CONVIENT DONC PAS ICI, et ce n'est pas un oubli —
 * c'est écrit dans son propre commentaire : passé le délai, elle rend
 * `undefined` et JETTE la valeur si le service répond après coup. Appliquée
 * à l'itinéraire, elle ferait disparaître le trajet calculé une seconde
 * trop tard, précisément quand l'usager en a le plus besoin. Le mandat du
 * 12/09 le dit autrement : « l'usager doit savoir, jamais attendre en
 * silence » — ce n'est pas un repli silencieux qu'il faut, c'est le dire.
 *
 * LE MÉCANISME ICI EST DONC DIFFÉRENT, terme à terme :
 *   - la promesse d'origine n'est JAMAIS abandonnée, ni annulée, ni
 *     remplacée : sa résolution (ou son échec) reste exactement ce que
 *     l'appelant reçoit, sans changement — ce module ne fait que REGARDER ;
 *   - au lieu d'un unique délai qui tranche, DEUX seuils qui préviennent :
 *     au premier (« lent »), un message dit que le service répond
 *     lentement et que le calcul continue ; au second (« abandon »),
 *     l'écran arrête de tourner en silence et propose un geste explicite
 *     (« Réessayer ») — mais si la promesse d'origine aboutit après coup,
 *     sans qu'on l'ait relancée, sa valeur sert normalement à l'appelant
 *     (voir panneau-itineraire.ts#calculer, qui vérifie le jeton de
 *     séquence avant d'en faire quoi que ce soit).
 * AUCUN appel réseau ne part d'ici : ce module pose puis annule des
 * minuteurs, rien de plus — la règle « ne jamais marteler les API
 * publiques » (CLAUDE.md) tient donc même quand elles sont lentes.
 */

export interface SeuilsLenteur {
  /** Millisecondes avant le premier signal (« ça répond lentement »). */
  lent: number;
  /** Millisecondes avant le second signal (« on arrête d'attendre »). */
  abandon: number;
}

export interface ActionsLenteur {
  /** Appelé au plus une fois, au seuil `lent`, si rien n'a encore tranché. */
  surLenteur: () => void;
  /** Appelé au plus une fois, au seuil `abandon`, si rien n'a encore tranché. */
  surAbandon: () => void;
}

/**
 * Observe `promesse` et déclenche `actions` aux deux seuils si elle n'a pas
 * encore abouti — sans jamais toucher à sa résolution. Rend LA MÊME
 * PROMESSE que celle reçue : succès, échec, valeur, tout est inchangé pour
 * l'appelant. Si `promesse` tranche avant un seuil, l'action correspondante
 * ne part jamais (minuteur annulé) : jamais de message affiché après coup
 * sur un calcul déjà terminé.
 */
export function signalerLenteur<T>(
  promesse: Promise<T>,
  seuils: SeuilsLenteur,
  actions: ActionsLenteur,
): Promise<T> {
  const minuteurLent = setTimeout(actions.surLenteur, seuils.lent);
  const minuteurAbandon = setTimeout(actions.surAbandon, seuils.abandon);
  const arreterLesMinuteurs = (): void => {
    clearTimeout(minuteurLent);
    clearTimeout(minuteurAbandon);
  };
  promesse.then(arreterLesMinuteurs, arreterLesMinuteurs);
  return promesse;
}
