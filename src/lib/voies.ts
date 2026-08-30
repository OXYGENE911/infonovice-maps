/* LE NOMBRE DE VOIES, ET OÙ SE PLACER — ce que deux itinéraires permettent.
 *
 * LA DEMANDE. Armelin, le 29/08/2026 : « des flèches pour préciser où se
 * placer sur la chaussée pour tourner à une intersection ou pour indiquer où
 * se situer pour sortir d'une autoroute ou d'un échangeur » ; puis, le
 * 30/08, après la mesure : « fais les flèches de voies avec les deux
 * itinéraires ».
 *
 * POURQUOI DEUX ITINÉRAIRES. Le service public rend les manœuvres sur la
 * ressource `bdtopo-osrm` (« tournez à droite ») et les ATTRIBUTS de route
 * sur `bdtopo-pgr` (`nombre_de_voies`) — jamais les deux ensemble : mesuré le
 * 30/08, la ressource riche rend zéro instruction sur 203 tronçons. On
 * demande donc les deux, et l'on RECOUD.
 *
 * CE QUI REND LA COUTURE HONNÊTE, ET C'EST UNE MESURE (30/08, Paris → Lyon) :
 * les deux moteurs rendent LE MÊME TRAJET — 466 km de part et d'autre, écart
 * médian NUL entre les tronçons pgr et le tracé osrm, 98,1 % des points sous
 * 60 m. Recoudre par projection est donc fondé. Les 1,9 % restants (jusqu'à
 * 301 m : deux chaussées séparées, un échangeur pris autrement) sont
 * ÉCARTÉS plutôt qu'approchés — un nombre de voies pris sur la chaussée
 * d'en face serait un mensonge.
 *
 * CE QU'ON NE SAIT PAS, ET QU'ON NE DESSINERA PAS. La donnée dit COMBIEN de
 * voies porte la chaussée. Elle ne dit RIEN de ce que chaque voie autorise —
 * il n'existe pas de `turn:lanes` ici. On ne peut donc pas dessiner le
 * panneau d'affectation par voie des GPS du commerce (une flèche par voie,
 * les bonnes en clair). Ce qu'on affiche est autre chose, et le dit : le
 * nombre de voies, et de quel CÔTÉ se placer — déduit de la manœuvre à
 * venir, pas d'un marquage au sol.
 */
import { situerSurLeTrace } from './le-long-du-trajet';
import { routesEuropeennes } from './panneau';
import type { Manoeuvre } from './feuille-de-route';

/** Un tronçon de la ressource riche, réduit à ce qui sert ici. */
export interface TronconVoies {
  /** Premier point du tronçon, en WGS 84. */
  point: [number, number];
  /** `nombre_de_voies` tel que le service le rend — 0 quand il ne sait pas. */
  voies: number;
  /* LE NUMÉRO EUROPÉEN VOYAGE AVEC (EURO-1, 30/08) : c'est la MÊME requête
     qui le porte, et une seconde requête pour un seul champ serait deux fois
     seize secondes prises au service public. Brut, tel que rendu —
     « E15/E50 », « E54 », ou vide (mesuré le 30/08). */
  europe?: string;
}

/** Un relevé recousu sur le tracé suivi. */
export interface ReleveVoies {
  /** Avancement le long du tracé osrm, en mètres. */
  avancementM: number;
  voies: number;
}

/* AU-DELÀ, CE N'EST PLUS LA MÊME CHAUSSÉE. Soixante mètres : c'est le seuil
   déjà retenu pour dire qu'on a quitté sa route (lib/bis.ts), et la mesure
   du 30/08 montre que 98,1 % des tronçons y entrent — les autres décrivent
   autre chose que la route qu'on suit. */
const ECART_MAX_M = 60;

/* JUSQU'OÙ UN RELEVÉ VAUT ENCORE. Les tronçons de la BD TOPO font quelques
   centaines de mètres ; à 1,5 km du dernier relevé, on se tait plutôt que de
   prolonger indéfiniment un chiffre qui a pu changer deux fois. */
export const PORTEE_RELEVE_M = 1_500;

/**
 * Recoud les tronçons de la ressource riche sur le tracé suivi — PURE.
 *
 * TROIS REFUS, ET CHACUN A SA RAISON : un tronçon trop loin du tracé décrit
 * une autre chaussée ; un `nombre_de_voies` nul ou absurde est un « je ne
 * sais pas » du producteur, pas une chaussée sans voie ; et deux relevés
 * consécutifs identiques n'apportent rien — on garde le premier, ce qui
 * divise par cinq la liste à parcourir à chaque fixe GPS.
 */
export function recoudreVoies(
  troncons: readonly TronconVoies[], trace: readonly [number, number][],
): ReleveVoies[] {
  if (trace.length < 2) return [];
  const bruts: ReleveVoies[] = [];
  for (const t of troncons) {
    if (!Number.isFinite(t.voies) || t.voies < 1 || t.voies > 12) continue;
    const { ecart, avancement } = situerSurLeTrace(
      { lon: t.point[0], lat: t.point[1] }, trace as [number, number][],
    );
    if (ecart > ECART_MAX_M) continue;
    bruts.push({ avancementM: avancement, voies: t.voies });
  }
  bruts.sort((a, b) => a.avancementM - b.avancementM);
  const rendu: ReleveVoies[] = [];
  for (const r of bruts) {
    if (rendu[rendu.length - 1]?.voies !== r.voies) rendu.push(r);
  }
  return rendu;
}

/** Un numéro de route européenne recousu sur le tracé suivi. */
export interface ReleveEurope {
  avancementM: number;
  /** Une ou plusieurs routes : « E15/E50 » en porte DEUX. */
  routes: string[];
}

/**
 * Recoud les numéros européens sur le tracé suivi — PURE.
 *
 * MÊME COUTURE QUE LES VOIES, MÊME REFUS : trop loin du tracé, c'est une
 * autre chaussée. Et le même repli : deux relevés consécutifs qui portent
 * les mêmes routes n'en font qu'un — sur un Paris-Lyon, l'E15 court sur des
 * centaines de tronçons.
 */
export function recoudreEurope(
  troncons: readonly TronconVoies[], trace: readonly [number, number][],
): ReleveEurope[] {
  if (trace.length < 2) return [];
  const bruts: ReleveEurope[] = [];
  for (const t of troncons) {
    const routes = routesEuropeennes(t.europe ?? '');
    if (routes.length === 0) continue;
    const { ecart, avancement } = situerSurLeTrace(
      { lon: t.point[0], lat: t.point[1] }, trace as [number, number][],
    );
    if (ecart > ECART_MAX_M) continue;
    bruts.push({ avancementM: avancement, routes });
  }
  bruts.sort((a, b) => a.avancementM - b.avancementM);
  const rendu: ReleveEurope[] = [];
  for (const r of bruts) {
    const avant = rendu[rendu.length - 1];
    if (!avant || avant.routes.join('/') !== r.routes.join('/')) rendu.push(r);
  }
  return rendu;
}

/**
 * Les routes européennes à un avancement donné — PURE.
 *
 * MÊME LECTURE QUE LES VOIES, ET MÊME SILENCE hors portée : une route garde
 * son numéro européen jusqu'à ce qu'un tronçon dise le contraire, mais un
 * relevé vieux d'un kilomètre et demi ne prouve plus rien.
 */
export function europeA(
  releves: readonly ReleveEurope[], avancementM: number,
  porteeM: number = PORTEE_RELEVE_M,
): string[] {
  let retenu: ReleveEurope | null = null;
  for (const r of releves) {
    if (r.avancementM > avancementM) break; // triés
    retenu = r;
  }
  if (!retenu) return [];
  return avancementM - retenu.avancementM > porteeM ? [] : retenu.routes;
}

/**
 * Le nombre de voies à un avancement donné — PURE.
 *
 * Le DERNIER relevé au plus tard à cet endroit : une chaussée garde ses voies
 * jusqu'à ce qu'un tronçon dise le contraire. Passé `PORTEE_RELEVE_M` sans
 * rien, on rend `null` — se taire est toujours permis.
 */
export function voiesA(
  releves: readonly ReleveVoies[], avancementM: number,
  porteeM: number = PORTEE_RELEVE_M,
): number | null {
  let retenu: ReleveVoies | null = null;
  for (const r of releves) {
    if (r.avancementM > avancementM) break; // triés
    retenu = r;
  }
  if (!retenu) return null;
  return avancementM - retenu.avancementM > porteeM ? null : retenu.voies;
}

/**
 * De quel côté se placer pour une manœuvre — PURE.
 *
 * CE N'EST PAS UNE LECTURE DU MARQUAGE, C'EST UNE DÉDUCTION, et l'interface
 * doit le dire. Elle est vraie de la règle de circulation française : on
 * sort et l'on tourne à droite par la droite, on tourne à gauche par la
 * gauche. Elle se tait sur tout le reste — tout droit, demi-tour,
 * rond-point, arrivée — parce qu'aucun côté ne s'impose alors, et qu'une
 * consigne inutile use la confiance qu'on aura besoin d'avoir plus loin.
 */
export function cotePlacement(manoeuvre: Manoeuvre): 'gauche' | 'droite' | null {
  switch (manoeuvre) {
    case 'right': case 'sharp right': case 'slight right': return 'droite';
    case 'left': case 'sharp left': case 'slight left': return 'gauche';
    default: return null;
  }
}

/**
 * La voie conseillée, comptée depuis la gauche à partir de 1 — PURE.
 *
 * UNE SEULE VOIE, LA PLUS EXTÉRIEURE — pas deux, pas « les deux de droite ».
 * Sans affectation par voie, c'est la seule chose que la règle de
 * circulation permette d'affirmer : pour sortir à droite, on est à droite.
 * En dire plus serait dessiner ce qu'on ne sait pas.
 */
export function voieConseillee(
  voies: number, cote: 'gauche' | 'droite' | null,
): number | null {
  if (cote === null || !Number.isFinite(voies) || voies < 1) return null;
  /* SUR UNE CHAUSSÉE À UNE VOIE, IL N'Y A RIEN À CONSEILLER : « serrez à
     droite » quand il n'existe qu'une voie est du bruit, et du bruit qui
     inquiète. */
  if (voies < 2) return null;
  return cote === 'droite' ? voies : 1;
}

/** Le conseil en toutes lettres — pour qui écoute la page. */
export function libellePlacement(voies: number, voie: number | null): string {
  if (voie === null) return `${voies} voies`;
  const rang = voie === 1 ? 'la voie de gauche' : 'la voie de droite';
  return `${voies} voies, placez-vous sur ${rang}`;
}

/* ==========================================================================
   L'APPEL — la seconde requête, celle qui porte les attributs
   ========================================================================== */

const SERVICE = 'https://data.geopf.fr/navigation/itineraire';
/* MESURÉ LE 30/08 : 16,7 s et 658 Ko pour un Paris-Lyon (466 km, 1 028
   tronçons). C'est lent, et c'est pour cela que cet appel part APRÈS le
   démarrage du suivi, jamais devant lui — même règle que les limites
   cartographiées, qui prennent vingt secondes sur Overpass. Trente secondes
   de patience, puis on abandonne : sans voies, le suivi vaut toujours. */
const DELAI_MS = 30_000;

export class ErreurVoies extends Error {}

/** L'URL de la seconde requête — PURE, testée à sec. */
export function urlVoies(
  depart: { lon: number; lat: number }, arrivee: { lon: number; lat: number },
  etapes: readonly { lon: number; lat: number }[] = [],
): string {
  /* LA RESSOURCE EST AUTRE, ET C'EST TOUT LE POINT : `bdtopo-pgr` porte les
     attributs de route mais AUCUNE instruction de manœuvre, quand
     `bdtopo-osrm` fait l'inverse (mesuré le 30/08, docs/apis.md). */
  let url = `${SERVICE}?resource=bdtopo-pgr&profile=car&optimization=fastest`
    + `&start=${depart.lon},${depart.lat}&end=${arrivee.lon},${arrivee.lat}`
    + '&geometryFormat=geojson&distanceUnit=meter&timeUnit=second'
    /* DEUX ATTRIBUTS EN UN APPEL : le service en accepte dix, et chaque
       requête coûte seize secondes. */
    + '&getSteps=true&waysAttributes=nombre_de_voies%7Ccpx_numero_route_europeenne';
  if (etapes.length) {
    url += `&intermediates=${etapes.map((p) => `${p.lon},${p.lat}`).join('|')}`;
  }
  return url;
}

/** Relit la réponse — DÉFENSIVE : elle vient d'un service. */
export function versTroncons(brut: unknown): TronconVoies[] {
  const portions = (brut as { portions?: unknown })?.portions;
  if (!Array.isArray(portions)) return [];
  const rendu: TronconVoies[] = [];
  for (const p of portions) {
    const etapes = (p as { steps?: unknown })?.steps;
    if (!Array.isArray(etapes)) continue;
    for (const e of etapes) {
      const c = (e as { geometry?: { coordinates?: unknown } })?.geometry?.coordinates;
      if (!Array.isArray(c) || !Array.isArray(c[0])) continue;
      const [lon, lat] = c[0] as [unknown, unknown];
      if (typeof lon !== 'number' || typeof lat !== 'number') continue;
      /* LE SERVICE REND LE NOMBRE EN TEXTE (« 3 »), mesuré le 30/08 — d'où
         la conversion, et le refus de ce qui n'est pas un nombre. */
      const brutVoies = (e as { attributes?: Record<string, unknown> })
        ?.attributes?.['nombre_de_voies'];
      /* UN TRONÇON SANS NOMBRE DE VOIES RESTE UN TRONÇON : il peut porter
         un numéro européen, et le jeter pour un champ absent perdrait
         l'autre. Zéro veut dire « je ne sais pas » — `recoudreVoies` le
         refusera, `recoudreEurope` n'en a pas besoin. */
      const brutNombre = Number(brutVoies);
      const voies = Number.isFinite(brutNombre) ? brutNombre : 0;
      const brutEurope = (e as { attributes?: Record<string, unknown> })
        ?.attributes?.['cpx_numero_route_europeenne'];
      /* LE NUMÉRO EUROPÉEN N'EST PAS UNE CONDITION : un tronçon sans lui
         reste un tronçon dont on connaît les voies. Les deux champs vivent
         dans le même appel, pas dans le même destin. */
      rendu.push(typeof brutEurope === 'string' && brutEurope !== ''
        ? { point: [lon, lat], voies, europe: brutEurope }
        : { point: [lon, lat], voies });
    }
  }
  return rendu;
}

/**
 * Cherche le nombre de voies du trajet — UN appel, après le démarrage.
 *
 * PAS DE SECONDE TENTATIVE : la requête coûte seize secondes et deux tiers
 * de méga-octet au service public. Une panne se solde par l'absence du
 * conseil de placement, ce qui est le comportement de toujours.
 */
export async function chargerVoies(
  depart: { lon: number; lat: number }, arrivee: { lon: number; lat: number },
  etapes: readonly { lon: number; lat: number }[] = [], signal?: AbortSignal,
): Promise<TronconVoies[]> {
  const horloge = new AbortController();
  const minuteur = setTimeout(() => { horloge.abort(); }, DELAI_MS);
  const relais = (): void => { horloge.abort(); };
  signal?.addEventListener('abort', relais);
  try {
    const r = await fetch(urlVoies(depart, arrivee, etapes), {
      signal: horloge.signal,
      headers: { Accept: 'application/json' },
    });
    if (!r.ok) throw new ErreurVoies(`Le service des voies a répondu ${r.status}.`);
    return versTroncons(await r.json());
  } catch (e) {
    if (e instanceof ErreurVoies) throw e;
    throw new ErreurVoies('Le nombre de voies n’a pas pu être relevé.');
  } finally {
    clearTimeout(minuteur);
    signal?.removeEventListener('abort', relais);
  }
}
