/* CE QUE LA SONDE MESURE, ET COMMENT ELLE REFUSE DE PUBLIER UN CHIFFRE FAUX.
 *
 * Écrit le 13/09/2026 après la contre-mesure, qui a établi deux fautes du même
 * genre dans `sonde-porte-sortie.mjs` — un instrument qui rendait un nombre
 * juste d'apparence et faux de sens :
 *
 *   1. `--campagne` relevait `performance.now()` juste après le chargement de
 *      la page et l'appelait `chargementMs`. **Ce n'est pas la durée du calcul
 *      d'itinéraire.** La sonde aurait produit six chiffres, et ces six
 *      chiffres n'auraient rien dit du critère des 5 s.
 *   2. La « durée de vie » du bouton valait `(fermee ?? dernierRegard) - ouverte`.
 *      Si la porte NE SE REFERME PAS — c'est-à-dire si le correctif marche —
 *      ce nombre est la durée de NOTRE OBSERVATION. Plus on regarde longtemps,
 *      plus le chiffre est beau.
 *
 * LA RÈGLE QUI EN SORT, et qui tient ce fichier entier :
 * **une valeur bornée par la fenêtre d'observation ne sort JAMAIS sous le nom
 * d'une mesure.** Quand la sonde ne peut pas mesurer, elle rend `null` et dit
 * pourquoi. Un `null` qui s'explique se lit ; un nombre qui ment se croit.
 *
 * POURQUOI LES VERDICTS SONT DES FONCTIONS PURES, séparées de l'observation :
 * c'est la seule façon de les éprouver dans les deux sens — porte refermée et
 * porte jamais refermée, plan arrivé et plan jamais arrivé — sans dépendre de
 * l'état d'une machine ni d'un navigateur. La garde de charge refuse de
 * mesurer sur ce poste (voir `garde-processus.mjs`) ; si toute la logique
 * vivait dans le navigateur, RIEN de ce fichier ne serait éprouvé.
 */

/** Le nombre arrondi, ou `null` — jamais `NaN`, jamais `undefined`. */
const ms = (x) => (typeof x === 'number' && Number.isFinite(x) ? Math.round(x) : null);

/* ─── L'OBSERVATEUR, CÔTÉ PAGE ──────────────────────────────────────────────
   Écrit comme une VRAIE FONCTION plutôt qu'une chaîne de caractères : elle est
   relue, colorée et vérifiable, et `SCRIPT_OBSERVATEUR` n'en est que la
   sérialisation. Une version antérieure de cette sonde portait son code de
   page dans un littéral ; la première coquille d'échappement y aurait été
   invisible jusqu'au premier relevé. */
/* eslint-disable */
function observateur() {
  const w = window;
  const d = document;

  /** Visible ET atteignable au clic — pas seulement « présent dans le DOM ».
   *  Un élément recouvert par le voile d'attente n'est pas lisible, et la
   *  leçon « un test qui clique à la souris ne prouve rien » vaut aussi pour
   *  un test qui se contente de lire `hidden`. */
  const atteignable = (el) => {
    if (!el) return false;
    if (el.hidden) return false;
    for (let p = el; p; p = p.parentElement) if (p.hidden) return false;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    const dessus = d.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!dessus && (dessus === el || el.contains(dessus) || dessus.contains(el));
  };

  const texte = (el) => (el && el.textContent ? el.textContent.trim() : '');

  /* DEUX ÉTATS DE LA PORTE, ET NON UN SEUL — mesuré le 13/09 contre le vrai
     produit, et c'est une découverte de cette passe. Le prédicat unique
     confondait « le bouton n'existe pas » et « le bouton est hors du champ
     visible » : `elementFromPoint` rend `null` pour un élément situé SOUS la
     ligne de flottaison, et à 1280 × 720 le bouton « Réessayer » se trouve à
     y = 732. La sonde concluait « la porte ne s'est JAMAIS ouverte » alors
     qu'elle était ouverte, présente et cliquable après un défilement.
     Un instrument qui confond deux faits distincts est exactement ce que cette
     passe corrige : on relève donc les DEUX, et on les nomme. */

  /** Le bouton existe, il est actif, et il occupe une place à l'écran. */
  const portePresente = () => {
    const b = d.querySelector('.iti-abandon-reessayer');
    if (!b || b.disabled || b.hidden) return false;
    for (let p = b; p; p = p.parentElement) if (p.hidden) return false;
    const r = b.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  /** …et il est ATTEIGNABLE au doigt sans rien faire d'autre : dans le champ
   *  visible, et rien par-dessus. Un bouton sous un voile n'est pas une porte ;
   *  un bouton sous la ligne de flottaison n'en est pas tout à fait une non
   *  plus, et ce n'est pas la même chose. */
  const porteAtteignable = () => {
    if (!portePresente()) return false;
    return atteignable(d.querySelector('.iti-abandon-reessayer'));
  };

  /** L'ITINÉRAIRE LUI-MÊME EST-IL RENDU ? (jalon intermédiaire, pas le critère)
   *  ET NON PAS « la ligne de résultat dit quelque chose » : la première
   *  version de ce prédicat se contentait d'un texte non vide, et l'étalonnage
   *  du 13/09 l'a prise en flagrant délit — elle rendait 9 ms, parce que la
   *  ligne affiche « Calcul de l’itinéraire… » tout de suite. Un jalon nommé
   *  « durée de l'itinéraire » qui date l'apparition du mot « Calcul » est la
   *  même faute, en plus petit, que celle qu'on vient de corriger.
   *  On exige donc le RÉSULTAT : une distance en kilomètres. */
  const itiPret = () => {
    const r = d.querySelector('.iti-resultat');
    return !!r && !r.hidden && /[0-9]\s*km/.test(texte(r));
  };

  /** LE PLAN DE RECHARGE EST-IL ÉCRIT, ET L'ATTENTE FINIE ?
   *  C'est la définition de la feuille de relevé mobile (§1) : « quand les
   *  arrêts sont affichés et lisibles — pas quand l'animation d'attente
   *  disparaît ». On exige donc les DEUX : un contenu de plan, et plus de
   *  voile d'attente par-dessus. Un refus motivé compte comme une fin de
   *  calcul (le calcul a abouti, sa réponse est « non »), et il est marqué
   *  comme tel : un refus n'est pas un plan. */
  const planEcrit = () => {
    const corps = d.querySelector('.iti-recharge-corps');
    if (!corps) return null;
    const chien = d.querySelector('attente-chien');
    if (chien && !chien.hidden) return null;
    const resume = corps.querySelector('.recharge-resume');
    if (resume && texte(resume).length > 0) return 'plan';
    const refus = corps.querySelector('.recharge-refus');
    if (refus && texte(refus).length > 0) return 'refus';
    return null;
  };

  const planLisible = () => {
    const corps = d.querySelector('.iti-recharge-corps');
    if (!corps || !planEcrit()) return false;
    const el = corps.querySelector('.recharge-resume') || corps.querySelector('.recharge-refus');
    return atteignable(el);
  };

  w.__sonde = {
    armeA: null,
    departA: null,
    itiPretA: null,
    planPretA: null,
    planLisibleA: null,
    naturePlan: null,
    porteOuverteA: null,
    porteFermeeA: null,
    porteAtteignableA: null,
    dernierRegard: performance.now(),
    debutObservationA: performance.now(),
    attentes: [],

    /** ARMER, PUIS CLIQUER : le chronomètre part au geste qui LANCE le calcul,
     *  comme sur la feuille mobile (« le chronomètre part au moment où le
     *  doigt quitte l'écran sur le bouton qui lance le calcul »). L'écoute est
     *  en phase de CAPTURE, donc l'horodatage est pris avant que le code de
     *  l'application ne s'exécute — et elle est à usage unique. */
    armer() {
      this.armeA = performance.now();
      const surClic = () => {
        if (this.departA === null) this.departA = performance.now();
        d.removeEventListener('click', surClic, true);
      };
      d.addEventListener('click', surClic, true);
    },

    /** Le départ peut aussi être posé à la main, quand le calcul ne part pas
     *  d'un clic (reprise d'URL, relance automatique). */
    marquerDepart() {
      if (this.departA === null) this.departA = performance.now();
    },

    lire() {
      return {
        armeA: this.armeA,
        departA: this.departA,
        itiPretA: this.itiPretA,
        planPretA: this.planPretA,
        planLisibleA: this.planLisibleA,
        naturePlan: this.naturePlan,
        porteOuverteA: this.porteOuverteA,
        porteFermeeA: this.porteFermeeA,
        porteAtteignableA: this.porteAtteignableA,
        dernierRegard: this.dernierRegard,
        debutObservationA: this.debutObservationA,
        attentes: this.attentes.slice(),
      };
    },
  };

  let derniereAttente = '';
  const boucle = () => {
    const t = performance.now();
    const s = w.__sonde;

    /* CE QUE L'USAGER VOIT PENDANT QU'IL ATTEND — relevé pour la feuille
       mobile, et pour la question du délai d'apparition laissée au CEO. */
    const chienVisible = d.querySelector('attente-chien');
    const mot = d.querySelector('.attente-chien-mot');
    /* LES QUATRE SURFACES D'ATTENTE DU PRODUIT, relevées le 13/09 dans
       `panneau-itineraire.ts` — et la quatrième a été ajoutée APRÈS un premier
       relevé qui ne montrait que « Calcul de l’itinéraire… » pendant quinze
       secondes : la ligne de lenteur (`.iti-lenteur-service`) et la porte de
       sortie (`.iti-abandon-texte`) vivent sur LEURS PROPRES lignes, et un
       relevé qui ne les lisait pas décrivait un écran plus muet qu'il ne l'est.
       On les concatène, dans l'ordre où l'œil les rencontre. */
    const lignes = [];
    if (chienVisible && !chienVisible.hidden && mot) lignes.push(texte(mot));
    const resultat = d.querySelector('.iti-resultat');
    if (resultat && !resultat.hidden) lignes.push(texte(resultat));
    const lenteur = d.querySelector('.iti-lenteur-service');
    if (lenteur && !lenteur.hidden) lignes.push(texte(lenteur));
    const abandonTexte = d.querySelector('.iti-abandon-texte');
    const blocAbandon = abandonTexte && abandonTexte.closest('.iti-abandon-service');
    if (abandonTexte && blocAbandon && !blocAbandon.hidden) lignes.push(texte(abandonTexte));
    const vu = lignes.filter(Boolean).join(' | ');
    if (vu !== derniereAttente) {
      derniereAttente = vu;
      s.attentes.push({ a: Math.round(t), texte: vu });
    }

    if (s.itiPretA === null && itiPret()) s.itiPretA = t;
    const nature = planEcrit();
    if (s.planPretA === null && nature) { s.planPretA = t; s.naturePlan = nature; }
    if (s.planLisibleA === null && planLisible()) s.planLisibleA = t;

    const ouverte = portePresente();
    if (ouverte && s.porteOuverteA === null) s.porteOuverteA = t;
    if (!ouverte && s.porteOuverteA !== null && s.porteFermeeA === null) s.porteFermeeA = t;
    if (s.porteAtteignableA === null && porteAtteignable()) s.porteAtteignableA = t;

    s.dernierRegard = t;
    requestAnimationFrame(boucle);
  };
  requestAnimationFrame(boucle);
}
/* eslint-enable */

/** L'observateur, prêt à être passé à `page.evaluate`. */
export const SCRIPT_OBSERVATEUR = `(${observateur.toString()})()`;

/**
 * LE VERDICT SUR LA DURÉE DU CALCUL D'ITINÉRAIRE.
 *
 * Ce que la sonde publie sous le nom `dureeCalculMs` est, et n'est que, le
 * temps écoulé entre le geste qui lance le calcul et le moment où le plan de
 * recharge est écrit, voile d'attente retiré — la définition mot pour mot de
 * `docs/infonovice-maps/mesure-mobile.md` §1, pour que le chiffre du poste et
 * celui du téléphone se comparent.
 *
 * DANS TOUS LES AUTRES CAS, `dureeCalculMs` VAUT `null`. Notamment quand le
 * plan n'est jamais arrivé : la durée serait alors celle de notre fenêtre
 * d'observation, et publier cela sous le nom « durée du calcul » serait
 * exactement la faute que cette sonde vient de corriger.
 */
export function jugerCalcul(brut) {
  const socle = {
    mesure: false,
    dureeCalculMs: null,
    dureeItineraireMs: null,
    dureeAffichageMs: null,
    naturePlan: brut.naturePlan ?? null,
    attentes: brut.attentes ?? [],
  };
  if (!brut || brut.departA === null || brut.departA === undefined) {
    return {
      ...socle,
      motif: 'le chronomètre n’a jamais été déclenché : aucun geste de lancement '
        + 'n’a été observé. Aucune durée n’est publiée — une sonde qui n’a rien '
        + 'déclenché ne mesure pas un produit lent, elle mesure son propre silence.',
    };
  }
  const observeMs = ms((brut.dernierRegard ?? brut.departA) - brut.departA);
  if (brut.planPretA === null || brut.planPretA === undefined) {
    return {
      ...socle,
      observeSansPlanMs: observeMs,
      dureeItineraireMs: ms(brut.itiPretA === null || brut.itiPretA === undefined
        ? null : brut.itiPretA - brut.departA),
      motif: `aucun plan de recharge lisible après ${observeMs} ms observées. `
        + 'AUCUNE durée de calcul n’est publiée : elle serait bornée par la fenêtre '
        + 'd’observation, donc elle dirait la durée de notre regard et non celle du calcul.',
    };
  }
  const duree = ms(brut.planPretA - brut.departA);
  return {
    ...socle,
    mesure: true,
    dureeCalculMs: duree,
    dureeItineraireMs: ms(brut.itiPretA === null || brut.itiPretA === undefined
      ? null : brut.itiPretA - brut.departA),
    dureeAffichageMs: ms(brut.planLisibleA === null || brut.planLisibleA === undefined
      ? null : brut.planLisibleA - brut.departA),
    motif: `calcul mesuré du geste de lancement jusqu’au ${brut.naturePlan === 'refus'
      ? 'refus motivé' : 'plan de recharge'} écrit, voile d’attente retiré : ${duree} ms.`,
  };
}

/**
 * LE VERDICT SUR LA PORTE DE SORTIE.
 *
 * `dureeDeVieMs` n'existe QUE si la porte s'est refermée pendant qu'on
 * regardait. Sinon la sonde dit « toujours ouverte après N ms observées » et
 * ne publie aucune durée de vie — parce qu'une porte qui ne se referme pas
 * n'en a pas, et que le nombre qu'on aurait écrit serait celui de la fenêtre
 * d'observation. C'est le défaut n° 2 de la contre-mesure du 13/09.
 */
export function jugerPorte(brut) {
  /* LE FAIT DÉCOUVERT LE 13/09 : présente n'est pas atteignable. On le sort
     nommé, au lieu de le fondre dans un booléen unique qui ferait dire à la
     sonde « pas de porte » là où il y en a une, plus bas. */
  const atteignableSansDefilement = !!brut
    && brut.porteAtteignableA !== null && brut.porteAtteignableA !== undefined;
  const atteignableApresMs = atteignableSansDefilement && brut.porteOuverteA != null
    ? ms(brut.porteAtteignableA - brut.porteOuverteA) : null;
  if (!brut || brut.porteOuverteA === null || brut.porteOuverteA === undefined) {
    const observe = ms((brut?.dernierRegard ?? 0) - (brut?.debutObservationA ?? 0));
    return {
      ouverte: false,
      refermee: false,
      dureeDeVieMs: null,
      toujoursOuverteApresMs: null,
      observeeMs: observe,
      atteignableSansDefilement,
      atteignableApresMs,
      motif: `la porte de sortie ne s’est JAMAIS ouverte pendant les ${observe} ms `
        + 'observées. Ce n’est pas une durée de vie de zéro : c’est l’absence de porte.',
    };
  }
  if (brut.porteFermeeA === null || brut.porteFermeeA === undefined) {
    const tenue = ms(brut.dernierRegard - brut.porteOuverteA);
    return {
      ouverte: true,
      refermee: false,
      /* LE CHAMP EXISTE ET VAUT `null` : le laisser absent inviterait un
         lecteur pressé à aller chercher ailleurs un nombre qui ressemble. */
      dureeDeVieMs: null,
      toujoursOuverteApresMs: tenue,
      observeeMs: tenue,
      atteignableSansDefilement,
      atteignableApresMs,
      motif: `TOUJOURS OUVERTE après ${tenue} ms observées — la porte ne s’est pas `
        + 'refermée. Aucune « durée de vie » n’est publiée : ce nombre serait celui '
        + 'de notre fenêtre d’observation, pas celui du bouton. Plus on regarde '
        + 'longtemps, plus il serait beau.',
    };
  }
  const duree = ms(brut.porteFermeeA - brut.porteOuverteA);
  return {
    ouverte: true,
    refermee: true,
    dureeDeVieMs: duree,
    toujoursOuverteApresMs: null,
    observeeMs: ms(brut.dernierRegard - brut.porteOuverteA),
    atteignableSansDefilement,
    atteignableApresMs,
    motif: `porte ouverte puis REFERMÉE sous nos yeux : durée de vie réelle ${duree} ms.`,
  };
}

/**
 * L'EMPREINTE DU SERVI CONTRE `dist/` — le troisième piège déjà payé.
 *
 * Fonction pure pour que le cas « divergence » s'éprouve sans navigateur.
 * `inconnus` compte autant qu'une divergence : un fichier servi qui n'a
 * aucune empreinte de référence n'est pas un fichier vérifié.
 */
export function comparerEmpreintes(servi, attendues) {
  const divergences = [];
  const inconnus = [];
  const verifies = [];
  for (const [chemin, emp] of servi) {
    if (!attendues.has(chemin)) { inconnus.push(chemin); continue; }
    if (attendues.get(chemin) !== emp) divergences.push(chemin);
    else verifies.push(chemin);
  }
  return { divergences, inconnus, verifies, conforme: divergences.length === 0 && inconnus.length === 0 };
}

/**
 * UN CONTRÔLE QUI N'A JAMAIS VU LE FICHIER N'EST PAS UN CONTRÔLE.
 *
 * C'est le défaut n° 3 de la contre-mesure : le contrôle tournait après
 * `page.goto(..., {waitUntil:'load'})` mais AVANT le déclenchement du calcul,
 * or le panneau d'itinéraire est en import dynamique — mesuré le 13/09,
 * `panneau-itineraire-*.js` n'est cité ni dans `dist/index.html` ni dans ses
 * `modulepreload`. Le fichier qui compte n'était donc jamais empreinté.
 *
 * Déplacer le contrôle ne suffit pas : il faut EXIGER que les fichiers qui
 * comptent aient bien été servis, sinon un jour où l'import ne partirait plus,
 * le contrôle passerait au vert sans rien avoir regardé.
 */
export function exigerFichiersAttendus(cheminsVus, motifs) {
  const manquants = motifs.filter((m) => !cheminsVus.some((c) => c.includes(m)));
  return {
    ok: manquants.length === 0,
    manquants,
    motif: manquants.length === 0
      ? `les ${motifs.length} fichiers qui comptent ont été servis et empreintés.`
      : `AUCUN fichier servi ne correspond à : ${manquants.join(', ')}. Le contrôle `
        + 'servi/dist n’a donc pas regardé le code qui porte la mesure — un contrôle '
        + 'qui n’a jamais vu le fichier n’est pas un contrôle.',
  };
}
