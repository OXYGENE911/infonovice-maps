/* LE SECOURS DE LA MISE À JOUR — PURE, dépendances injectées (MAJ-2, 04/09).
 *
 * LE TERRAIN. Armelin : « quand je clique sur "Mise à jour", il ne se passe
 * absolument rien et je dois cliquer sur "Plus tard" pour fermer cette
 * fenêtre. » Sa capture montre le bouton en « Mise à jour… » : le geste
 * PART, mais rien ne recharge.
 *
 * LA CAUSE. « Mettre à jour » envoie SKIP_WAITING au worker EN ATTENTE puis
 * attend `controllerchange` pour recharger. Or entre l'annonce et le clic,
 * un NOUVEAU déploiement a pu remplacer ce worker : l'attente est vide, un
 * remplaçant s'installe — le message part dans le vide et le rechargement
 * n'arrive jamais. Les jours de livraisons rapprochées (huit en une journée
 * le 04/09), c'est le cas COURANT, pas l'exception.
 *
 * LE REMÈDE. Le clic reste le geste du greffon PWA ; un garde-fou regarde
 * ensuite l'état RÉEL de l'inscription :
 *  — un worker attend encore → on lui redit SKIP_WAITING ;
 *  — un worker s'installe → on attend qu'il soit prêt, puis SKIP_WAITING ;
 *  — plus rien nulle part → la version s'est déjà activée (clientsClaim) :
 *    recharger suffit.
 * Et un DERNIER RECOURS inconditionnel recharge la page : au pire elle
 * revient au même état — ce qui vaut toujours mieux qu'un bouton mort.
 */

/** Ce qu'on lit d'une inscription de service worker — structurel, testable. */
export interface InscriptionMaj {
  waiting: { postMessage(m: unknown): void } | null;
  installing: {
    state: string;
    addEventListener(type: 'statechange', f: () => void): void;
  } | null;
}

export interface DepsSecours {
  /** Le geste du greffon : SKIP_WAITING + rechargement sur controllerchange. */
  demarrer(): void;
  /** L'inscription courante — relue au moment du secours, jamais figée. */
  inscription(): Promise<InscriptionMaj | undefined>;
  recharger(): void;
  /** Prévient quand le nouveau worker prend la main (controllerchange). */
  surPriseDeControle(f: () => void): void;
  /** Après ce délai sans prise de contrôle, on inspecte l'état réel. */
  delaiSecoursMs?: number;
  /** Après ce délai, on recharge quoi qu'il arrive. */
  delaiDernierRecoursMs?: number;
}

export const DELAI_SECOURS_MS = 2_500;
export const DELAI_DERNIER_RECOURS_MS = 8_000;

/**
 * Prépare le geste « Mettre à jour ». Rend la fonction à brancher au bouton.
 */
export function preparerMaj(deps: DepsSecours): () => void {
  const delaiSecours = deps.delaiSecoursMs ?? DELAI_SECOURS_MS;
  const delaiDernier = deps.delaiDernierRecoursMs ?? DELAI_DERNIER_RECOURS_MS;
  let enCours = false;

  return () => {
    if (enCours) return; // deux clics ne font pas deux mises à jour
    enCours = true;

    let repris = false;
    const minuteurs: ReturnType<typeof setTimeout>[] = [];
    deps.surPriseDeControle(() => {
      repris = true;
      /* Le greffon recharge : nos minuteurs n'ont plus d'objet — un
         rechargement de plus par-dessus ferait clignoter la page. */
      for (const m of minuteurs) clearTimeout(m);
    });

    deps.demarrer();

    minuteurs.push(setTimeout(() => {
      void (async () => {
        if (repris) return;
        const ins = await deps.inscription();
        const attente = ins?.waiting ?? null;
        if (attente) {
          /* Le worker attend toujours : le premier message s'est perdu
             (course avec un remplacement) — on le redit. */
          attente.postMessage({ type: 'SKIP_WAITING' });
          return;
        }
        const installation = ins?.installing ?? null;
        if (installation) {
          /* Un remplaçant s'installe : on le laisse finir, puis on lui dit
             de prendre la main — c'est LA course qui laissait le bouton
             mort. */
          installation.addEventListener('statechange', () => {
            if (installation.state === 'installed') {
              ins?.waiting?.postMessage({ type: 'SKIP_WAITING' });
            }
          });
          return;
        }
        /* Ni attente ni installation : la nouvelle version est déjà active
           — il ne manque que le rechargement. */
        deps.recharger();
      })();
    }, delaiSecours));

    minuteurs.push(setTimeout(() => {
      /* Le dernier recours ne suppose rien : au pire, la page revient au
         même état — ce qui vaut mieux qu'un bouton figé sur « Mise à
         jour… ». */
      if (!repris) deps.recharger();
    }, delaiDernier));
  };
}
