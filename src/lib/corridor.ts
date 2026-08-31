/* LE CORRIDOR : UNE SEULE REQUÊTE OVERPASS POUR TOUT CE QU'ON Y RELÈVE.
 *
 * POURQUOI CE MODULE EXISTE. Le suivi a besoin de trois choses qui vivent
 * toutes dans OpenStreetMap le long du même tracé : les limites de vitesse
 * (lib/limites.ts), les numéros de sortie et les destinations des bretelles
 * (lib/sorties.ts). Les demander séparément ferait DEUX requêtes de vingt
 * secondes au démarrage de chaque suivi.
 *
 * Overpass est tenu par des bénévoles, et le CLAUDE.md du projet en fait une
 * règle : « ne JAMAIS marteler les API publiques […] ces quotas sont un bien
 * commun ». Une union, un aller-retour, un seul temps d'attente — et les
 * réponses se trient à l'arrivée, ce qui ne coûte rien à personne.
 *
 * CE QU'IL NE FAIT PAS : décider. Il transporte et il trie. Les seuils, les
 * refus et les coutures restent dans les deux modules, qui se testent à sec.
 */
import type { LineString } from 'geojson';
import { versLimites, RAYON_LIMITE_M, ErreurLimites, type LimiteTrajet,
} from './limites';
import {
  fragmentSorties, versSorties, versDestinations,
  type Sortie, type DestinationBretelle,
} from './sorties';
import { versGiratoires, type Giratoire } from './giratoire';
import { simplifier, paqueter } from './simplifier';
import {
  aRenonce, delaiClientMs, respirer, ECHECS_AVANT_ABANDON,
} from './troncons';
import { versAffectations, type AffectationTrajet } from './affectation';

export interface Corridor {
  limites: LimiteTrajet[];
  sorties: Sortie[];
  destinations: DestinationBretelle[];
  giratoires: Giratoire[];
  affectations: AffectationTrajet[];
}

/* L'ÉCART TOLÉRÉ EN SIMPLIFIANT LE TRACÉ, en mètres. Huit : bien SOUS le plus
   petit rayon cherché (25 m pour les limites), de sorte que la route reste
   dans le couloir même en plein virage. C'est la garantie qui manquait.

   LE DÉFAUT CORRIGÉ (CORRIDOR-1, 31/08). Le tracé était décimé à un point
   tous les 300 m. `around` mesure la distance à la POLYLIGNE : à ce pas, la
   corde coupe les virages et s'écarte de la vraie route de bien plus que
   vingt-cinq mètres. MESURÉ sur une rue de banlieue de 820 m : 4 points,
   ZÉRO anneau et ZÉRO limite — tout le corridor disparaissait, en silence.
   Avec la simplification garantie : 6 points, CINQ anneaux et UNE limite.
   Sur autoroute la route est droite et la décimation ne coûtait rien : le
   défaut ne se voyait qu'en ville, là où la conduite est la plus exigeante. */
export const ECART_TRACE_M = 8;

/* COMBIEN DE POINTS PAR REQUÊTE. Cent vingt : mesuré le 31/08, une requête
   de corridor porte cinq sous-requêtes, et au-delà de quelques centaines de
   points elle épuise le budget d'Overpass — qui rend alors un tableau vide
   qu'on prendrait pour « rien ici ». On découpe, et l'on interroge à la
   file. */
export const POINTS_PAR_PAQUET = 120;

/* LE BUDGET LAISSÉ AU SERVEUR. Le client, lui, attend PLUS (voir
   `delaiClientMs`) : couper à l'heure exacte du serveur, c'est perdre une
   course qu'on a soi-même créée — le défaut payé sur les feux et les péages
   le même jour. */
export const BUDGET_CORRIDOR_S = 45;

/** Le corps de la requête, pour UN paquet de points déjà choisis — PURE. */
export function requeteCorridor(paquet: readonly [number, number][]): string {
  const points = paquet
    .map(([lon, lat]) => `${lat.toFixed(5)},${lon.toFixed(5)}`)
    .join(',');
  return `[out:json][timeout:${BUDGET_CORRIDOR_S}];(`
    + 'way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified'
    + '|residential|motorway_link|trunk_link|primary_link)$"]["maxspeed"]'
    + `(around:${RAYON_LIMITE_M},${points});`
    + fragmentSorties(points)
    /* L'ANNEAU DES GIRATOIRES entre dans la même union, et ses BRANCHES
       suivent par un second `out` — Overpass en accepte plusieurs dans une
       requête, ce qui garde un seul aller-retour (mesuré le 30/08 : 0,45 s,
       18 Ko). Sans les branches, on saurait dessiner l'anneau mais pas
       compter les sorties. */
    + `way(around:40,${points})[junction=roundabout]->.anneaux;`
    /* L'AFFECTATION PAR VOIE, dans la même union : `turn:lanes` et ses deux
       variantes de sens. Vingt-cinq mètres comme les limites — on cherche LA
       chaussée qu'on suit, pas la contre-allée. */
    + `way(around:25,${points})["turn:lanes"];`
    + `way(around:25,${points})["turn:lanes:forward"];`
    + `way(around:25,${points})["turn:lanes:backward"];`
    + ');out geom tags;'
    + 'node(w.anneaux)->.bords;way(bn.bords)[highway];out geom tags;';
}

/**
 * Trie une réponse d'Overpass en ses trois relevés — PURE.
 *
 * CHAQUE LECTEUR PREND CE QU'IL RECONNAÎT et ignore le reste : les limites
 * ne voient que les chemins portant `maxspeed`, les sorties que les nœuds de
 * divergence, les destinations que les bretelles qui en annoncent. Rien ne
 * se dispute, rien ne se perd.
 */
export function versCorridor(brut: unknown, trace: readonly [number, number][]): Corridor {
  const elements = (brut as { elements?: unknown })?.elements;
  const liste = Array.isArray(elements) ? elements : [];
  return {
    limites: versLimites(brut, trace as [number, number][]),
    sorties: versSorties(liste, trace),
    destinations: versDestinations(liste, trace),
    giratoires: versGiratoires(liste, trace),
    affectations: versAffectations(liste, trace),
  };
}

/** Vide — ce que rend un corridor dont on n'a rien pu relever. */
export const CORRIDOR_VIDE: Corridor = {
  limites: [], sorties: [], destinations: [], giratoires: [], affectations: [],
};

/**
 * Relève le corridor — UN appel POST, au démarrage du suivi.
 *
 * L'ÉCHEC EST BÉNIN et il est global : sans corridor, ni panneau de limite,
 * ni numéro de sortie, ni destination — et le suivi vaut toujours. C'était
 * déjà le contrat des limites seules.
 */
export async function chargerCorridor(
  geometrie: LineString, signal?: AbortSignal,
): Promise<Corridor> {
  const trace = geometrie.coordinates as [number, number][];
  if (trace.length < 2) return CORRIDOR_VIDE;

  /* LE TRACÉ EST SIMPLIFIÉ AVEC UNE GARANTIE D'ÉCART, puis découpé. Les deux
     vont ensemble : sans la garantie, la route sort du couloir ; sans le
     découpage, la requête expire et rend un vide qu'on prendrait pour « rien
     ici ». Les deux défauts se cachaient l'un l'autre. */
  const paquets = paqueter(simplifier(trace, ECART_TRACE_M), POINTS_PAR_PAQUET);
  const elements: unknown[] = [];
  let unSucces = false;
  let dAffilee = 0;

  for (let i = 0; i < paquets.length; i += 1) {
    /* ON RENONCE APRÈS DEUX ÉCHECS DE SUITE. Quand le service ne répond pas,
       le paquet suivant ne répondra pas davantage : sans ce garde-fou, un
       long trajet passait dix fois le délai d'attente à échouer — dix
       minutes pour apprendre ce qu'on savait au bout de deux. */
    if (dAffilee >= ECHECS_AVANT_ABANDON) break;
    /* ON RESPIRE ENTRE DEUX PAQUETS : des requêtes lourdes enchaînées sans
       pause se font limiter par le service — mesuré le 31/08. */
    if (i > 0) await respirer();
    if (signal?.aborted) throw new ErreurLimites('Relevé interrompu.');
    const horloge = new AbortController();
    const minuteur = setTimeout(
      () => { horloge.abort(); }, delaiClientMs(BUDGET_CORRIDOR_S),
    );
    const relais = (): void => { horloge.abort(); };
    signal?.addEventListener('abort', relais);
    try {
      /* EN POST : la polyligne serrée dépasse ce qu'une URL accepte. */
      const r = await fetch('https://overpass.openstreetmap.fr/api/interpreter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(requeteCorridor(paquets[i]!))}`,
        signal: horloge.signal,
      });
      if (!r.ok) { dAffilee += 1; continue; }
      /* Overpass rend du HTML quand il est saturé : le décodage échoue, et
         c'est ce paquet-là qui manque, pas tout le relevé. */
      const brut: unknown = JSON.parse(await r.text());
      /* L'AVEU DU SERVICE SE LIT. Une expiration rend un tableau VIDE avec un
         `remark` : sans cette lecture, « le service a renoncé » se lisait
         « il n'y a rien le long de cette route ». */
      if (aRenonce(brut)) { dAffilee += 1; continue; }
      const lus = (brut as { elements?: unknown }).elements;
      if (Array.isArray(lus)) elements.push(...lus);
      unSucces = true;
      dAffilee = 0;
    } catch {
      /* ce paquet manque ; les autres valent toujours — jusqu'à deux */
      dAffilee += 1;
    } finally {
      clearTimeout(minuteur);
      signal?.removeEventListener('abort', relais);
    }
  }

  /* RIEN N'A ABOUTI : c'est une panne, et rendre un corridor vide la ferait
     passer pour une route sans limites, sans sorties et sans giratoires. */
  if (!unSucces) throw new ErreurLimites('Le relevé du corridor est indisponible.');
  /* LES DÉCODEURS TRAVAILLENT SUR LE TRACÉ COMPLET, pas sur les paquets : le
     rattachement au trajet (avancement, écart) doit se faire une seule fois,
     sur la géométrie réelle. */
  return versCorridor({ elements }, trace);
}
