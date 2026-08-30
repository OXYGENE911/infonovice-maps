/* LE COÛT DES PÉAGES — ce que la donnée publique permet d'en dire.
 *
 * LA DEMANDE. Armelin, le 30/08/2026 : « est-ce possible d'afficher une
 * estimation du coût en péage sur chaque tronçon avant de choisir d'éviter
 * les autoroutes et les péages ? »
 *
 * CE QUE LA MESURE A TROUVÉ (30/08, sept recherches sur data.gouv.fr) :
 * seuls APRR et AREA publient une grille tarifaire. Celle d'APRR est
 * CORROMPUE À LA SOURCE et a dû être écartée — le détail, la tentative de
 * décodage et la raison de son rejet sont dans
 * `scripts/generer-tarifs-peage.mjs`. Reste AREA : 480 paires, 52 gares,
 * Licence Ouverte. Vinci (ASF, Cofiroute, Escota), Sanef, SAPN et ATMB ne
 * publient RIEN. La couverture est donc ÉTROITE — l'A41, l'A43, l'A48,
 * l'A49 et l'A51 nord — et c'est pour cela que ce module dit toujours ce
 * qu'il n'a pas su chiffrer.
 *
 * D'OÙ LA RÈGLE DE CE MODULE : il ne rend un prix QUE pour les paires qu'il
 * connaît, et il DIT ce qu'il ne sait pas. Une estimation partielle présentée
 * comme un total serait pire que pas d'estimation du tout — c'est sur elle
 * qu'on déciderait d'éviter l'autoroute.
 *
 * L'APPARIEMENT EST LE POINT DÉLICAT. Les gares viennent d'OpenStreetMap
 * (`barrier=toll_booth`, relevé par lib/peages.ts) et portent des noms
 * libres : « Péage de Beaune-Sud », « Beaune Sud », « BEAUNE SUD ». La
 * grille, elle, écrit « BEAUNE SUD ». On normalise donc des deux côtés — et
 * l'on n'invente aucune correspondance approximative : deux noms qui ne se
 * réduisent pas au même texte sont deux gares différentes. Mieux vaut ne pas
 * chiffrer un tronçon que le chiffrer avec le tarif du voisin.
 */

/** Un tronçon payant reconnu entre deux gares consécutives. */
export interface TronconPeage {
  entree: string;
  sortie: string;
  /** Prix en euros, classe 1 (voiture particulière). */
  prixEuros: number;
}

export interface EstimationPeages {
  /** Les tronçons chiffrés, dans l'ordre du trajet. */
  troncons: TronconPeage[];
  /** Somme des tronçons chiffrés, en euros. */
  totalEuros: number;
  /** Les couples de gares consécutives qu'on n'a PAS su chiffrer. */
  inconnus: { entree: string; sortie: string }[];
}

export class ErreurTarifsPeage extends Error {}

/**
 * Réduit un nom de gare à sa forme comparable — PURE.
 *
 * TROIS TRAITEMENTS, ET CHACUN A SA RAISON : les accents tombent (la grille
 * est en majuscules non accentuées), « S/ » devient « SUR » (la grille
 * abrège « BELLEVILLE S/SAONE », OSM écrit « Belleville-sur-Saône »), et
 * tout ce qui n'est ni lettre ni chiffre devient une espace — tirets,
 * apostrophes et points ne distinguent pas deux gares.
 */
export function normaliserGare(nom: string): string {
  return nom
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\bS\/\b/g, 'SUR ')
    /* « PÉAGE DE … », « BARRIÈRE DE … » : OSM préfixe souvent, la grille
       jamais. Le mot n'appartient pas au nom de la gare. */
    .replace(/^\s*(PEAGE|BARRIERE|GARE)\s+(DE\s+|D\s+|DU\s+)?/i, '')
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

/** La clé d'une paire, indépendante du sens de parcours. */
export function clePaire(a: string, b: string): string {
  const x = normaliserGare(a);
  const y = normaliserGare(b);
  return x < y ? `${x}~${y}` : `${y}~${x}`;
}

/**
 * Chiffre les tronçons entre gares consécutives — PURE.
 *
 * ON NE CHIFFRE QUE LES PAIRES CONSÉCUTIVES, et c'est le modèle du réseau :
 * on prend un ticket à une gare, on le rend à la suivante. Une gare inconnue
 * de la grille ne fait pas tomber le reste — elle ouvre un trou, qui est
 * NOMMÉ dans `inconnus`.
 */
export function estimerPeages(
  gares: readonly { nom: string | null }[],
  grille: Readonly<Record<string, number>>,
): EstimationPeages {
  const nommees = gares
    .map((g) => (g.nom ?? '').trim())
    .filter((n) => n !== '');
  const troncons: TronconPeage[] = [];
  const inconnus: { entree: string; sortie: string }[] = [];

  for (let i = 0; i < nommees.length - 1; i += 1) {
    const entree = nommees[i]!;
    const sortie = nommees[i + 1]!;
    const prix = grille[clePaire(entree, sortie)];
    if (typeof prix === 'number' && Number.isFinite(prix) && prix > 0) {
      troncons.push({ entree, sortie, prixEuros: prix });
    } else {
      inconnus.push({ entree, sortie });
    }
  }

  /* ON ADDITIONNE EN CENTIMES, et ce n'est pas de la coquetterie : 12,40 +
     9,10 vaut 21,500000000000004 en virgule flottante, et arrondir APRÈS
     la somme rate le demi-centime (1,005 × 100 vaut 100,49999… donc
     s'arrondit à 1,00). La plus petite unité est la seule où l'addition
     d'une monnaie soit exacte. */
  const centimes = troncons.reduce((s, t) => s + Math.round(t.prixEuros * 100), 0);
  return { troncons, totalEuros: centimes / 100, inconnus };
}

/** La grille relue depuis l'index engendré. Défensive : elle est externe. */
export function versGrille(brut: unknown): Record<string, number> {
  if (!brut || typeof brut !== 'object') return {};
  const paires = (brut as { paires?: unknown }).paires;
  if (!paires || typeof paires !== 'object') return {};
  const rendu: Record<string, number> = {};
  for (const [cle, valeur] of Object.entries(paires as Record<string, unknown>)) {
    if (typeof valeur !== 'number' || !Number.isFinite(valeur) || valeur <= 0) continue;
    if (!/^[A-Z0-9 ]+~[A-Z0-9 ]+$/.test(cle)) continue;
    rendu[cle] = valeur;
  }
  return rendu;
}

let enMemoire: Record<string, number> | null = null;

/**
 * Charge la grille — UNE FOIS par visite, à la demande.
 *
 * 16 Ko seulement, mais la règle reste celle des autres index : jamais
 * précaché, jamais chargé tant que personne ne demande une estimation.
 */
export async function chargerGrille(signal?: AbortSignal): Promise<Record<string, number>> {
  if (enMemoire) return enMemoire;
  let reponse: Response;
  try {
    reponse = await fetch('/donnees/tarifs-peage.json', signal ? { signal } : {});
  } catch {
    throw new ErreurTarifsPeage('La grille des tarifs n’a pas pu être lue.');
  }
  if (!reponse.ok) {
    throw new ErreurTarifsPeage(`La grille des tarifs est indisponible (${reponse.status}).`);
  }
  enMemoire = versGrille(await reponse.json());
  return enMemoire;
}
