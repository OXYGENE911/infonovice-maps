// Les métriques d'un banc de recherche — Top-1, Top-5, MRR. Module PUR.
//
// POURQUOI CES TROIS-LÀ, ET POURQUOI DANS CET ORDRE.
//
//   TOP-1 est ce que vit l'usager pressé. Sur un téléphone, au volant, on
//   appuie sur la première ligne. Une réponse juste en deuxième position est
//   une réponse qu'on ne verra pas.
//
//   TOP-5 dit si la réponse est ATTEIGNABLE. La liste en montre cinq : au-delà,
//   elle n'existe pas pour l'usager. L'écart entre Top-1 et Top-5 mesure ce
//   qu'un meilleur classement rapporterait, sans changer une seule source.
//
//   LE MRR (rang réciproque moyen) pèse les rangs au lieu de les compter.
//   Passer de la 5e à la 2e place ne bouge ni le Top-1 ni le Top-5 ; le MRR le
//   voit. C'est la seule des trois qui progresse quand on améliore un tri sans
//   rien trouver de neuf.
//
// LA LEÇON QUI A IMPOSÉ CE FICHIER (RECHERCHE-10, 04/09/2026) : le banc des
// douze requêtes passait 12/12 — et les RANGS disaient « SCI 43 CLER TOUR
// EFFEIL » devant la Tour Eiffel, trois restaurants devant le Stade de France.
// Compter les trouvailles sans lire les rangs, c'est se donner un bon chiffre
// pour un mauvais service.

/** Le rang d'une réponse juste : 1 pour la première, 0 quand elle est absente. */
export type Rang = number;

/**
 * Le rang de la bonne réponse dans une liste — PURE.
 *
 * `estLaBonne` est fourni par l'appelant : selon la famille de requête, la
 * bonne réponse se reconnaît à ses coordonnées, à son identifiant, ou à son
 * libellé. Le banc ne tranche pas cela ici — il compte des rangs.
 */
export function rangDe<T>(
  resultats: readonly T[], estLaBonne: (r: T, i: number) => boolean,
): Rang {
  const i = resultats.findIndex(estLaBonne);
  return i < 0 ? 0 : i + 1;
}

export interface Bilan {
  /** Combien de requêtes ont été jugées. */
  total: number;
  /** Part des requêtes dont la bonne réponse est en tête, entre 0 et 1. */
  top1: number;
  /** Part des requêtes dont la bonne réponse est dans les cinq premières. */
  top5: number;
  /** Rang réciproque moyen : 1 si tout est premier, 0 si rien n'est trouvé. */
  mrr: number;
  /** Combien de requêtes ne rendent la bonne réponse NULLE PART. */
  absentes: number;
}

/* CINQ, PARCE QUE LA LISTE EN MONTRE CINQ. Ce n'est pas un chiffre d'usage :
   c'est la hauteur réelle de la liste de suggestions (limit=5 partout dans
   l'application). Au-delà, la bonne réponse existe pour la mesure et pas pour
   l'usager — la confondre avec une réussite serait se mentir. */
export const PROFONDEUR_VUE = 5;

/**
 * Le bilan d'une série de rangs — PURE.
 *
 * UN RANG AU-DELÀ DE CINQ N'EST PAS UNE RÉUSSITE, mais il n'est pas non plus
 * un échec complet : il compte dans le MRR, faiblement, parce qu'un
 * classement qui remonte de la douzième à la sixième place va dans le bon
 * sens même si l'usager n'en voit encore rien. Les deux lectures se
 * complètent, et c'est pour cela qu'on rend les trois.
 */
export function bilanDesRangs(rangs: readonly Rang[]): Bilan {
  const total = rangs.length;
  if (total === 0) return { total: 0, top1: 0, top5: 0, mrr: 0, absentes: 0 };
  let top1 = 0; let top5 = 0; let mrr = 0; let absentes = 0;
  for (const r of rangs) {
    if (r <= 0) { absentes += 1; continue; }
    if (r === 1) top1 += 1;
    if (r <= PROFONDEUR_VUE) top5 += 1;
    mrr += 1 / r;
  }
  return {
    total,
    top1: top1 / total,
    top5: top5 / total,
    mrr: mrr / total,
    absentes,
  };
}

/** Un pourcentage lisible, à la française. */
export function enPourcent(part: number): string {
  return `${(part * 100).toFixed(1).replace('.', ',')} %`;
}

/**
 * Deux bilans se comparent-ils honnêtement ? — PURE.
 *
 * SUR UN ÉCHANTILLON DE DEUX CENTS REQUÊTES, un écart de deux points de Top-1
 * vaut quatre requêtes : c'est du bruit, pas un progrès. Cette fonction rend
 * l'écart ET le nombre de requêtes qu'il représente, pour qu'on ne célèbre
 * jamais une décimale.
 */
export function ecartLisible(avant: Bilan, apres: Bilan, cle: 'top1' | 'top5' | 'mrr'): string {
  const d = apres[cle] - avant[cle];
  const requetes = Math.round(d * apres.total);
  const signe = d >= 0 ? '+' : '−';
  return `${signe}${Math.abs(d * 100).toFixed(1).replace('.', ',')} point(s)`
    + ` — soit ${Math.abs(requetes)} requête(s) sur ${apres.total}`;
}
