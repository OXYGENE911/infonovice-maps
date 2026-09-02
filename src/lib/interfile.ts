// LA REMONTÉE D'INTERFILE — OÙ ELLE EST PERMISE, ET À QUELLES CONDITIONS
// (MOTO-1, 02/09).
//
// LA DEMANDE. Armelin : « ajouter un mode Moto avec l'interfile ». En
// Île-de-France et ailleurs, un deux-roues qui remonte entre les files ne fait
// pas le même trajet qu'une voiture, et un GPS qui l'ignore ne lui dit rien
// de ce qui l'attend.
//
// CE QUE J'AI VÉRIFIÉ AVANT D'ÉCRIRE LA MOINDRE LIGNE (02/09), parce qu'une
// application qui parle d'une manœuvre routière doit savoir de quoi elle
// parle. L'interfile n'est plus une expérimentation : le **décret n° 2025-33
// du 9 janvier 2025** l'a GÉNÉRALISÉE à toute la France depuis le 11 janvier
// 2025, en créant l'article R. 412-11-3 du code de la route. Les conditions
// ci-dessous sont celles de cet article, relues sur Légifrance — pas un
// résumé de forum, et pas ma mémoire.
//
// CE QUE LE DÉCRET EXIGE, ET QUI DÉCIDE DE TOUT ICI :
//   - la voie : « autoroutes et routes à deux chaussées séparées par un
//     terre-plein central et dotées d'au moins deux voies chacune » ;
//   - la vitesse maximale autorisée y est « supérieure ou égale à 70 km/h » ;
//   - le trafic : la circulation doit s'y être « établie en files
//     ininterrompues sur toutes les voies » — donc EMBOUTEILLÉE ;
//   - le véhicule : catégorie L3e ou L5e, largeur d'un mètre au maximum ;
//   - la place : entre les DEUX FILES LES PLUS À GAUCHE, jamais ailleurs ;
//   - l'allure : 50 km/h au plus, et 30 km/h si l'une des files est à l'arrêt.
//
// CE QU'ON FAIT, DONC, ET CE QU'ON NE FAIT PAS.
//
// ON NE PROMET AUCUN GAIN DE TEMPS. Ce qu'un motard gagne dépend de son allure
// entre les files, c'est-à-dire d'un choix qui lui appartient et qui engage sa
// sécurité. Une application qui annoncerait « vingt minutes de moins »
// fixerait un objectif à tenir, et une estimation optimiste deviendrait une
// pression. L'heure d'arrivée ne bouge pas.
//
// ON DIT OÙ C'EST PERMIS, ET ON RAPPELLE LES CONDITIONS. C'est l'information
// qu'un motard n'a pas en roulant : quelles sections de son trajet s'y
// prêtent, et les deux plafonds d'allure qu'on oublie.
//
// ET ON SE TAIT PARTOUT OÙ L'ON N'EST PAS SÛR. OpenStreetMap dit toujours
// qu'une autoroute est une autoroute ; il ne dit PAS toujours qu'une nationale
// à quatre voies porte un terre-plein central. Une section non reconnue n'est
// pas une section interdite — c'est une section sur laquelle nous n'avons rien
// à dire. Se taire à tort coûte une information ; parler à tort envoie
// quelqu'un entre deux files qui se croisent.
//
// ZÉRO REQUÊTE DE PLUS. Le corridor interroge déjà Overpass le long du tracé
// pour les limites de vitesse, les giratoires et les tonnages, et il demande
// `out geom tags` : `highway`, `lanes` et `oneway` sont DÉJÀ dans la réponse.
// On ne les lisait pas, voilà tout.

import { situerSurLeTrace } from './le-long-du-trajet';
import { kmhDe, RAYON_LIMITE_M } from './limites';

/** Une section du trajet où l'interfile est permise. */
export interface SectionInterfile {
  /** Où elle commence, le long du trajet, en mètres. */
  debutM: number;
  /** Où elle finit. */
  finM: number;
  /** Le numéro ou le nom de la voie, quand OSM en donne un — « A86 ». */
  nom: string | null;
  /** La vitesse maximale autorisée sur la section, en km/h. */
  kmh: number;
}

/* LE SEUIL DU DÉCRET, ÉCRIT UNE SEULE FOIS. « La vitesse maximale autorisée
   est supérieure ou égale à 70 km/h » — R. 412-11-3, I. */
export const VITESSE_VOIE_MIN_KMH = 70;

/** L'allure maximale du deux-roues en interfile — R. 412-11-3, I, 4°. */
export const ALLURE_MAX_KMH = 50;

/** Et quand une file est à l'arrêt — même article. */
export const ALLURE_FILE_ARRETEE_KMH = 30;

/* CENT MÈTRES D'ÉTALEMENT ET DEUX NŒUDS, la même règle que les limites de
   vitesse : une route qui CROISE le tracé n'a qu'un nœud près de lui, celle
   qu'on SUIT en a plusieurs, étalés. C'est ce qui écarte le pont qui passe
   au-dessus de l'autoroute. */
const ETALEMENT_MIN_M = 100;

/* LE JEU ENTRE DEUX TRONÇONS QUI SE SUIVENT. Ils se touchent au nœud près,
   mais l'avancement se mesure par projection et laisse un cheveu d'écart. */
const JEU_FUSION_M = 100;

/**
 * Cette voie porte-t-elle une interfile légale ? — PURE.
 *
 * DEUX CAS SEULEMENT, ET C'EST VOULU :
 *   1. `highway=motorway` — l'autoroute est nommée par le décret, et OSM ne
 *      se trompe pas sur ce tag en France ;
 *   2. une route `oneway=yes` d'au moins deux voies : à sens unique ET
 *      multi-voies, c'est UNE chaussée d'une route à chaussées séparées. Le
 *      terre-plein lui-même n'est pas dans OSM, mais le sens unique en est le
 *      signe le plus fiable — une chaussée séparée est toujours à sens unique.
 *
 * LES BRETELLES SONT ÉCARTÉES (`motorway_link` n'est pas `motorway`) : on n'y
 * remonte pas les files, on s'y insère.
 *
 * TOUT LE RESTE REND `false`, y compris des routes où l'interfile est
 * peut-être permise — voir l'en-tête sur le silence.
 */
export function voieEligible(tags: Record<string, unknown>): boolean {
  const kmh = kmhDe(tags['maxspeed']);
  if (kmh === null || kmh < VITESSE_VOIE_MIN_KMH) return false;
  if (tags['highway'] === 'motorway') return true;
  if (tags['oneway'] !== 'yes') return false;
  /* AU MOINS DEUX VOIES : « dotées d'au moins deux voies chacune ». Sans le
     tag `lanes`, on ne sait pas — donc on se tait. */
  const voies = Number(tags['lanes']);
  return Number.isFinite(voies) && voies >= 2;
}

/**
 * Les sections d'interfile le long du tracé — PURE.
 *
 * Elle lit la MÊME réponse Overpass que les limites et les tonnages : le
 * corridor ne part qu'une fois.
 */
export function versInterfiles(
  brut: unknown, trace: [number, number][],
): SectionInterfile[] {
  const elements = (brut as { elements?: unknown } | null)?.elements;
  if (!Array.isArray(elements)) return [];

  const sections: SectionInterfile[] = [];
  for (const e of elements) {
    if (typeof e !== 'object' || e === null) continue;
    const el = e as Record<string, unknown>;
    const tags = (el['tags'] ?? {}) as Record<string, unknown>;
    if (!voieEligible(tags)) continue;
    const geometrie = el['geometry'];
    if (!Array.isArray(geometrie)) continue;

    const proches: number[] = [];
    for (const p of geometrie) {
      const lat = (p as Record<string, unknown>)['lat'];
      const lon = (p as Record<string, unknown>)['lon'];
      if (typeof lat !== 'number' || typeof lon !== 'number') continue;
      const { ecart, avancement } = situerSurLeTrace({ lon, lat }, trace);
      if (ecart <= RAYON_LIMITE_M) proches.push(avancement);
    }
    if (proches.length < 2) continue;
    const debutM = Math.min(...proches);
    const finM = Math.max(...proches);
    if (finM - debutM < ETALEMENT_MIN_M) continue;

    const nom = typeof tags['ref'] === 'string' ? tags['ref']
      : (typeof tags['name'] === 'string' ? tags['name'] : null);
    sections.push({ debutM, finM, nom, kmh: kmhDe(tags['maxspeed'])! });
  }
  return fusionner([...sections].sort((a, b) => a.debutM - b.debutM));
}

/**
 * Recolle les tronçons qui se suivent — PURE.
 *
 * UNE AUTOROUTE EST DÉCOUPÉE EN DIZAINES DE CHEMINS dans OSM, à chaque
 * échangeur et à chaque changement de tag. Annoncer « interfile permise »
 * quarante fois sur trente kilomètres ne serait pas une information, ce serait
 * un bruit — et le motard cesserait de lire.
 */
function fusionner(tries: readonly SectionInterfile[]): SectionInterfile[] {
  const sortie: SectionInterfile[] = [];
  for (const s of tries) {
    const precedent = sortie[sortie.length - 1];
    if (precedent && s.debutM <= precedent.finM + JEU_FUSION_M) {
      precedent.finM = Math.max(precedent.finM, s.finM);
      /* LE NOM DU PREMIER TRONÇON GAGNE : c'est celui qu'on lit sur le
         panneau en entrant sur la section. */
      if (precedent.nom === null) precedent.nom = s.nom;
      /* ET LA VITESSE LA PLUS BASSE : sur une section recollée, c'est la
         plus contraignante qui vaut. */
      precedent.kmh = Math.min(precedent.kmh, s.kmh);
      continue;
    }
    sortie.push({ ...s });
  }
  return sortie;
}

/**
 * La phrase annoncée à l'approche d'une section — PURE.
 *
 * ELLE DIT LES DEUX PLAFONDS, parce que ce sont eux qu'on oublie : 50 km/h,
 * et 30 quand une file est à l'arrêt. Elle NE PROMET AUCUN GAIN DE TEMPS, et
 * elle rappelle la condition sans laquelle rien n'est permis — que le trafic
 * soit bloqué sur TOUTES les voies.
 */
export function phraseInterfile(section: SectionInterfile): string {
  const ou = section.nom === null ? 'Cette section' : section.nom;
  const km = Math.round((section.finM - section.debutM) / 100) / 10;
  return `${ou} : interfile permise sur ${km} km, si le trafic est bloqué sur`
    + ` toutes les voies. ${ALLURE_MAX_KMH} km/h au plus,`
    + ` ${ALLURE_FILE_ARRETEE_KMH} si une file est arrêtée.`;
}
