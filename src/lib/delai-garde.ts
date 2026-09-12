/* DÉLAI DE GARDE SUR UN SERVICE PUBLIC LENT (ALTI-GARDE-1, 12/09/2026).
 *
 * LE CONSTAT DE LA CONTRE-MESURE DU 12/09 : après l'optimisation du C3, ce
 * qui fait dépasser 5 s au calcul Paris→Lyon n'est plus notre code — c'est
 * l'altimétrie de la Géoplateforme, mesurée entre 902 ms et environ 7 s,
 * attendue dans un `Promise.all` SANS délai de garde ni repli. Un service
 * public lent bloquait le plan aussi longtemps qu'il voulait.
 *
 * LA RÈGLE : on n'attend jamais un service tiers au-delà d'un délai fixé —
 * le plan se calcule SANS la donnée plutôt que d'attendre, et l'usager en
 * est informé (jamais un silence — voir `#pourquoiCePlan` et la note de
 * réserve dans panneau-itineraire.ts).
 *
 * CE QUE CE MODULE NE FAIT PAS : il n'annule PAS la promesse sous-jacente et
 * ne relance AUCUN appel — le mandat est explicite (« aucun appel
 * supplémentaire, aucune relance automatique »). La requête réseau déjà
 * partie continue de vivre sa vie ; on arrête seulement de l'ATTENDRE. Si
 * elle aboutit après coup, sa valeur est jetée — le plan déjà affiché ne
 * change pas rétroactivement sous l'usager.
 */

/**
 * Course entre `promesse` et un délai de `ms` millisecondes.
 *
 * Rend la valeur de `promesse` si elle aboutit la première ; `undefined` si
 * le délai gagne OU si `promesse` échoue (guichet unique pour l'appelant :
 * « pas de donnée », qu'elle soit lente ou en erreur, se traite pareil).
 * Ne rejette JAMAIS — un rejet tardif de `promesse`, après que le délai a
 * déjà tranché, ne doit pas devenir une exception non gérée ailleurs dans
 * l'application.
 */
export function avecDelaiDeGarde<T>(promesse: Promise<T>, ms: number): Promise<T | undefined> {
  return new Promise((resolve) => {
    const minuteur = setTimeout(() => resolve(undefined), ms);
    promesse.then(
      (valeur) => { clearTimeout(minuteur); resolve(valeur); },
      () => { clearTimeout(minuteur); resolve(undefined); },
    );
  });
}
