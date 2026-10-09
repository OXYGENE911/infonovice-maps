// LES PAQUETS DE LA RECHERCHE DES LIEUX CONNUS (lot 145, 09/10/2026).
//
// PUR : des sources lues en JSON → le sommaire et les paquets, en texte. Les
// fichiers s'écrivent (et se vérifient) par `tests/index-recherche.test.ts` :
//
//   INDEX_RECHERCHE_ECRIRE=1 npx vitest run tests/index-recherche.test.ts
//
// Sans la variable, le même essai VÉRIFIE que `public/donnees/recherche/` est
// exactement ce que ces sources engendrent : un paquet oublié ou retouché à la
// main fait rougir la suite.
//
// LES SOURCES : `public/donnees/monuments.json` (Mérimée, aussi lu par « les
// lieux d'exception près du trajet »), `scripts/index-recherche/sources/
// musees.json` (Muséofile) et `…/lieux-wikidata.json` (extrait Wikidata,
// régénéré par `scripts/lieux-wikidata/`). Le POURQUOI des paquets est écrit
// en tête de `src/lib/lieux-connus.ts`.
import { clesDuLieu, lireLigne } from '../../src/lib/lieux-connus';

/** Une ligne de paquet : monument, musée (1) ou lieu Wikidata (2). */
export type Ligne =
  | [number, number, string, string]
  | [number, number, string, string, 1]
  | [number, number, string, string, 2, string, number];

/** Combien de lieux, au plus, dans un paquet — sauf une clé qui en porte plus à elle seule. */
export const LIEUX_PAR_PAQUET = 300;

const texte = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/**
 * Les lignes, dans L'ORDRE DE L'INDEX ENTIER (monuments, musées, Wikidata) —
 * PURE. Une ligne que `lireLigne` refuserait n'entre pas.
 */
export function lignesDesSources(monuments: unknown, musees: unknown, wikidata: unknown): Ligne[] {
  const lignes: Ligne[] = [];
  const garder = (l: Ligne): void => { if (lireLigne(l) !== null) lignes.push(l); };
  for (const m of Array.isArray(monuments) ? monuments : []) {
    if (Array.isArray(m)) garder([m[0] as number, m[1] as number, texte(m[2]), texte(m[3])]);
  }
  for (const m of ((musees as { lieux?: unknown } | null)?.lieux as unknown[] | undefined) ?? []) {
    if (Array.isArray(m)) garder([m[0] as number, m[1] as number, texte(m[2]), texte(m[3]), 1]);
  }
  for (const m of ((wikidata as { lieux?: unknown } | null)?.lieux as unknown[] | undefined) ?? []) {
    if (!Array.isArray(m)) continue;
    const articles = typeof m[5] === 'number' && Number.isFinite(m[5]) ? Math.max(0, Math.round(m[5])) : 0;
    garder([m[0] as number, m[1] as number, texte(m[2]), texte(m[3]), 2, texte(m[4]) || 'Lieu', articles]);
  }
  return lignes;
}

export interface IndexConstruit {
  /** Le texte de `sommaire.json`. */
  sommaire: string;
  /** Le texte de chaque paquet, `p000.json`, `p001.json`… */
  paquets: string[];
}

/**
 * Le sommaire et les paquets — PURE, déterministe.
 *
 * Les clés sont prises dans l'ordre alphabétique et versées dans le paquet
 * courant tant qu'il ne dépasse pas `LIEUX_PAR_PAQUET` lieux distincts ; un
 * lieu rangé sous plusieurs clés d'un même paquet n'y figure qu'une fois, et
 * chaque paquet garde l'ordre de l'index entier.
 */
export function construireIndex(lignes: readonly Ligne[], source: string): IndexConstruit {
  const parCle = new Map<string, number[]>();
  lignes.forEach((l, i) => {
    for (const k of clesDuLieu(l[2], l[3])) {
      const ids = parCle.get(k);
      if (ids) ids.push(i); else parCle.set(k, [i]);
    }
  });
  const paquets: number[][] = [];
  const cles: Record<string, [number, number]> = {};
  let courant = new Set<number>();
  for (const k of [...parCle.keys()].sort()) {
    const ids = parCle.get(k) ?? [];
    const union = new Set([...courant, ...ids]);
    if (courant.size > 0 && union.size > LIEUX_PAR_PAQUET) {
      paquets.push([...courant].sort((x, y) => x - y));
      courant = new Set(ids);
    } else courant = union;
    cles[k] = [paquets.length, ids.length];
  }
  if (courant.size > 0) paquets.push([...courant].sort((x, y) => x - y));
  return {
    sommaire: `${JSON.stringify({ v: 1, source, lieux: lignes.length, paquets: paquets.length, cles })}\n`,
    paquets: paquets.map((ids) => `${JSON.stringify({ v: 1, lieux: ids.map((i) => lignes[i]) })}\n`),
  };
}
