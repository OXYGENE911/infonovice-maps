// LES LIMITES DE TONNAGE SUR LE TRAJET (PONT-1, 02/09).
//
// LE TERRAIN. Armelin : « ma Vinfast VF8 Plus avec sa batterie de 87,7 kWh
// pèse 2 520 kg et peut être dangereuse sur certains ponts de France. Par
// exemple, le pont de fer situé entre Coudret et Germeville en Charente a fait
// l'objet d'une limitation à 2 tonnes suite à une expertise technique révélant
// des mouvements de structure. Cela permettrait au GPS d'éviter de faire passer
// par des voies interdites au véhicule configuré dans le profil. »
//
// CE QUE J'AI MESURÉ AVANT D'ÉCRIRE (02/09). La donnée est dans OpenStreetMap
// et elle est DENSE : sur une zone de 35 × 30 km en Charente, **184 chemins**
// portent `maxweight` — 122 à 3,5 t, 26 à 10 t, 22 à 19 t, et le reste entre 6
// et 38 t. Ce n'est pas une donnée d'exception, c'est une donnée courante.
//
// ET ELLE NE COÛTE AUCUNE REQUÊTE DE PLUS : le corridor interroge déjà Overpass
// le long du tracé pour les limites de vitesse, les giratoires et les voies.
// `maxweight` entre dans la même union.
//
// CE QU'ON NE PEUT PAS FAIRE, ET QU'ON NE PRÉTEND PAS FAIRE. Le service public
// d'itinéraire n'accepte aucun paramètre de poids (capacités relevées le 21/08,
// reconfirmées depuis) : on ne peut donc PAS lui demander d'éviter ces ponts.
// On AVERTIT — c'est ce que la donnée permet honnêtement.
//
// ET SANS POIDS DÉCLARÉ, ON SE TAIT. Aucune source publique française ne donne
// la masse d'un modèle (même constat qu'en août pour la capacité de batterie).
// Le poids est donc saisi par l'usager. Tant qu'il ne l'est pas, aucun
// avertissement : alerter au hasard vaut moins que se taire.

import { situerSurLeTrace } from './le-long-du-trajet';

/** Un tronçon du trajet dont le tonnage est limité. */
export interface LimiteTonnage {
  /** Où il commence, le long du trajet, en mètres. */
  debutM: number;
  /** La limite déclarée, en tonnes. */
  tonnes: number;
  /** Le nom du chemin, quand OSM en donne un — « Pont de fer ». */
  nom: string | null;
}

/* LE MÊME RAYON QUE LES LIMITES DE VITESSE : on cherche LA route qu'on suit,
   pas la contre-allée ni le chemin voisin. */
export const RAYON_TONNAGE_M = 25;

/**
 * Lit une valeur `maxweight` d'OpenStreetMap, en tonnes — PURE.
 *
 * LES ÉCRITURES RÉELLES, relevées le 02/09 : « 3.5 », « 10 », « 19 ». La
 * spécification autorise aussi une unité explicite (« 3.5 t », « 7500 kg ») et
 * les producteurs s'en servent. On lit donc les trois formes.
 *
 * SANS UNITÉ, C'EST DES TONNES : c'est la valeur par défaut du champ, et la
 * seule que les 184 chemins mesurés utilisent.
 */
export function tonnesDe(valeur: unknown): number | null {
  if (typeof valeur === 'number') return Number.isFinite(valeur) ? valeur : null;
  if (typeof valeur !== 'string') return null;
  const m = /^\s*([\d.,]+)\s*(t|kg|lbs)?\s*$/i.exec(valeur);
  if (!m) return null;
  const n = Number.parseFloat(m[1]!.replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return null;
  const unite = (m[2] ?? 't').toLowerCase();
  if (unite === 'kg') return n / 1000;
  /* LES LIVRES EXISTENT DANS LA SPÉCIFICATION mais pas en France ; on les lit
     plutôt que de les prendre pour des tonnes — 7 500 lbs valent 3,4 t, pas
     7 500 t, et l'erreur serait silencieuse. */
  if (unite === 'lbs') return (n * 0.45359237) / 1000;
  return n;
}

/** Les limites de tonnage rencontrées le long du tracé — PURE. */
export function versTonnages(
  brut: unknown, trace: [number, number][],
): LimiteTonnage[] {
  const elements = (brut as { elements?: unknown } | null)?.elements;
  if (!Array.isArray(elements)) return [];

  const trouves: LimiteTonnage[] = [];
  for (const e of elements) {
    if (typeof e !== 'object' || e === null) continue;
    const el = e as Record<string, unknown>;
    const tags = (el['tags'] ?? {}) as Record<string, unknown>;
    const tonnes = tonnesDe(tags['maxweight']);
    if (tonnes === null) continue;
    const geometrie = el['geometry'];
    if (!Array.isArray(geometrie)) continue;

    const proches: number[] = [];
    for (const p of geometrie) {
      const lat = (p as Record<string, unknown>)['lat'];
      const lon = (p as Record<string, unknown>)['lon'];
      if (typeof lat !== 'number' || typeof lon !== 'number') continue;
      const { ecart, avancement } = situerSurLeTrace({ lon, lat }, trace);
      if (ecart <= RAYON_TONNAGE_M * 2) proches.push(avancement);
    }
    /* UN SEUL POINT PROCHE SUFFIT, et c'est la différence avec les limites de
       vitesse : un pont limité fait parfois trente mètres. Exiger deux points
       et cent mètres de longueur — la règle des vitesses — l'aurait écarté,
       alors que c'est exactement l'ouvrage qu'on veut annoncer. */
    if (proches.length === 0) continue;
    const nom = typeof tags['name'] === 'string' ? tags['name'] : null;
    trouves.push({ debutM: Math.min(...proches), tonnes, nom });
  }
  return trouves.sort((a, b) => a.debutM - b.debutM);
}

/**
 * Les limites que le véhicule ne peut PAS franchir — PURE.
 *
 * ON COMPARE À LA MASSE DÉCLARÉE, pas à une estimation. Sans masse, la liste
 * est vide : c'est le silence, et il est voulu.
 */
export function tonnagesInterdits(
  limites: readonly LimiteTonnage[], masseKg: number | null,
): LimiteTonnage[] {
  if (masseKg === null || !Number.isFinite(masseKg) || masseKg <= 0) return [];
  const tonnes = masseKg / 1000;
  return limites.filter((l) => l.tonnes < tonnes);
}

/**
 * La phrase d'avertissement — PURE.
 *
 * ELLE DIT LE CHIFFRE ET LA MASSE, parce que c'est la comparaison qui décide,
 * et qu'un conducteur doit pouvoir juger lui-même : une limite peut viser les
 * poids lourds, et l'écart de 20 kg n'a pas le même sens que celui d'une tonne.
 */
export function phraseTonnage(limite: LimiteTonnage, masseKg: number): string {
  const ou = limite.nom === null ? 'Un passage' : limite.nom;
  const masse = (masseKg / 1000).toFixed(masseKg % 1000 === 0 ? 0 : 1)
    .replace('.', ',');
  const max = String(limite.tonnes).replace('.', ',');
  return `${ou} sur votre trajet est limité à ${max} t —`
    + ` votre véhicule pèse ${masse} t.`;
}
