// Géocodage — API Adresse (Base Adresse Nationale), api-adresse.data.gouv.fr.
// Licence Ouverte, quota 50 req/s/IP : le débounce vit chez l'appelant, la
// résilience vit ici (timeout, une reprise à délai croissant, erreurs en
// français). Voir docs/apis.md.
import type { PointGeo } from './coordonnees';

const BAN = 'https://api-adresse.data.gouv.fr';
const DELAI_MS = 5000;

export interface ResultatAdresse extends PointGeo {
  libelle: string;
  /** Précision BAN : housenumber, street, locality, municipality. */
  type: string;
  /** « Code postal, ville (contexte départemental) » pour lever les homonymes. */
  contexte: string;
  /** Le numéro tel que la BAN l'écrit (« 12bis ») — absent hors housenumber. */
  numero?: string | undefined;
  /* LA CONFIANCE DE LA BAN, de 0 à 1 (RECHERCHE-3). Elle décide s'il faut
     chercher plus loin : 0,965 pour une vraie adresse, 0,378 pour
     « Tour Eiffel Paris » où elle rend l'avenue Gustave Eiffel faute de
     mieux. Absente quand le service ne la donne pas. */
  score?: number | undefined;
  /* L'AVEU D'APPROXIMATION (ADRESSE-2). Renseigné quand le numéro demandé
     n'existe PAS dans la base et qu'on montre le numéro de base à sa place :
     la phrase dit lequel manque et ce qu'on propose. Jamais un repli muet —
     poser quelqu'un au 23 en lui laissant croire qu'il est au 23 bis serait
     un mensonge de plus que le silence. */
  approche?: string | undefined;
  /* LA FAMILLE, QUAND ON LA CONNAÎT DÉJÀ (RAIL-POI-1, 04/09). Les lieux du
     rail arrivent avec leurs étiquettes OSM : deviner la famille sur le nom
     (« Chez Momo » → rien) alors qu'elle est sue serait perdre la pastille
     sur la moitié des lignes. */
  famille?: string | undefined;
  /* L'AVEU D'ABSENCE (DEST-2, 04/09) : les lieux du rail sans étiquettes
     addr:* portent leur famille en guise de contexte — pas une adresse. Le
     dire permet à la fiche d'aller la demander à la BAN au lieu d'afficher
     « Restaurants » comme si c'était une rue. */
  adresseInconnue?: boolean | undefined;
}

/* ==========================================================================
   LES ADRESSES BIS, TER, QUATER (ADRESSE-2, 01/09).

   LE TERRAIN. Armelin : « j'habite au 23 BIS Avenue du prophète et je suis
   obligé de taper 25 pour trouver mon adresse ». MESURÉ sur la BAN le
   31/08/2026, et le constat est double :

   1. LA GRAPHIE COMPTE. La base écrit ses numéros COLLÉS (« 12bis »).
      Demander « 12 bis avenue du prophète » rend bien le bon point, mais
      avec un score de 0,818 ; « 12bis avenue du prophète » le rend à 0,965.
      Sous autocomplétion et cinq résultats, ces 15 points de score suffisent
      à faire sortir la bonne adresse de la liste au profit de rues
      homonymes — c'est exactement le symptôme décrit.

   2. LE 23 BIS D'ARMELIN N'EXISTE PAS DANS LA BASE. Relevé sur la voie
      elle-même (lookup 94059_0650) : la BAN connaît 12bis, 14bis, 20bis et
      33bis — pas de 23bis. Aucune tournure de requête ne le trouvera, et
      prétendre le contraire serait promettre ce qu'on ne peut pas tenir. On
      REPLIE donc sur le numéro de base, en le DISANT.

   SUR LES QUOTAS : la seconde requête ne part que dans ce cas précis — un
   suffixe RECONNU dans la saisie, et aucun numéro trouvé au premier appel.
   Frapper « 23 b » ou « 23 bi » ne déclenche rien : le dictionnaire est
   fermé. Deux appels au plus, derrière le débounce de 300 ms de la barre.
   ========================================================================== */

/* LE DICTIONNAIRE EST FERMÉ, et c'est délibéré. Les lettres seules (« 2 B »)
   en sont exclues : elles désignent aussi bien un bâtiment ou un appartement
   qu'un suffixe de voirie, et un repli déclenché à tort déplacerait
   silencieusement une adresse juste. */
const SUFFIXES = ['bis', 'ter', 'quater', 'quinquies'] as const;

export interface NumeroDecompose {
  /** Le numéro seul : « 23 ». */
  numero: string;
  /** Le suffixe reconnu, en minuscules : « bis ». */
  suffixe: string;
  /** Le reste de la saisie : « avenue du prophète ». */
  reste: string;
}

/**
 * Décompose « 23 bis avenue du prophète » — PURE. `null` si pas de suffixe.
 *
 * Accepte la graphie espacée comme la collée (« 23bis »), et n'accepte le
 * suffixe qu'en TÊTE de saisie, collé à un numéro : « rue du Bis » n'est pas
 * une adresse suffixée.
 */
export function decomposerNumero(texte: string): NumeroDecompose | null {
  const m = /^\s*(\d{1,4})\s*([a-zA-Zé]+)\b\s*(.*)$/.exec(texte);
  if (!m) return null;
  const suffixe = (m[2] ?? '').toLowerCase();
  if (!SUFFIXES.includes(suffixe as (typeof SUFFIXES)[number])) return null;
  return { numero: m[1] ?? '', suffixe, reste: (m[3] ?? '').trim() };
}

/**
 * La requête à envoyer d'abord — PURE.
 *
 * Colle le suffixe au numéro quand il y en a un : c'est l'écriture de la
 * base, et elle vaut 15 points de score (mesuré). Sinon, la saisie telle
 * quelle : on ne réécrit pas ce qu'on n'a pas reconnu.
 */
export function requeteNormalisee(texte: string): string {
  const d = decomposerNumero(texte);
  if (!d) return texte.trim();
  return `${d.numero}${d.suffixe} ${d.reste}`.trim();
}

export class ErreurAdresse extends Error {}

async function appelResilient(url: string, signal?: AbortSignal): Promise<unknown> {
  let derniere: unknown;
  for (let essai = 0; essai < 2; essai += 1) {
    try {
      const r = await fetch(url, {
        signal: signal ?? AbortSignal.timeout(DELAI_MS),
        headers: { Accept: 'application/json' },
      });
      if (!r.ok) throw new ErreurAdresse(`BAN a répondu ${r.status}`);
      return await r.json();
    } catch (e) {
      derniere = e;
      // Une annulation volontaire (frappe suivante) ne se rejoue pas.
      if (e instanceof DOMException && e.name === 'AbortError') throw e;
      if (essai === 0) await new Promise((s) => setTimeout(s, 400 * (essai + 1)));
    }
  }
  throw new ErreurAdresse(
    'La recherche d’adresse est momentanément indisponible. Réessayez dans un instant.',
    { cause: derniere },
  );
}

interface ProprietesBAN {
  label?: string; type?: string; context?: string; postcode?: string; city?: string;
  housenumber?: string; score?: number;
}
interface EntiteBAN {
  geometry?: { coordinates?: [number, number] };
  properties?: ProprietesBAN;
}

/** Transforme la réponse BAN en résultats propres — PURE, donc testée à sec. */
export function versResultats(brut: unknown): ResultatAdresse[] {
  const feats = (brut as { features?: EntiteBAN[] })?.features;
  if (!Array.isArray(feats)) return [];
  const resultats: ResultatAdresse[] = [];
  for (const f of feats) {
    const coords = f.geometry?.coordinates;
    const p = f.properties;
    if (!coords || !p?.label) continue;
    const [lon, lat] = coords;
    if (typeof lon !== 'number' || typeof lat !== 'number') continue;
    resultats.push({
      lon, lat,
      libelle: p.label,
      type: p.type ?? 'inconnu',
      contexte: [p.postcode, p.city].filter(Boolean).join(' ') || (p.context ?? ''),
      ...(typeof p.housenumber === 'string' ? { numero: p.housenumber } : {}),
      ...(typeof p.score === 'number' && Number.isFinite(p.score) ? { score: p.score } : {}),
    });
  }
  return resultats;
}

const urlRecherche = (q: string): string =>
  `${BAN}/search/?q=${encodeURIComponent(q)}&limit=5&autocomplete=1`;

/** Un résultat porte-t-il le numéro demandé, suffixe compris ? — PURE. */
function porteLeNumero(r: ResultatAdresse, d: NumeroDecompose): boolean {
  if (r.type !== 'housenumber') return false;
  const attendu = `${d.numero}${d.suffixe}`;
  return (r.numero ?? '').toLowerCase().replace(/\s+/g, '') === attendu;
}

export async function chercherAdresses(texte: string, signal?: AbortSignal): Promise<ResultatAdresse[]> {
  const q = requeteNormalisee(texte);
  // La BAN refuse les requêtes de moins de 3 caractères : on n'envoie rien.
  if (q.length < 3) return [];
  const premiers = versResultats(await appelResilient(urlRecherche(q), signal));

  /* LE REPLI AVOUÉ (ADRESSE-2) — voir l'en-tête pour la mesure. Il ne part
     QUE si la saisie portait un suffixe reconnu ET qu'aucun résultat ne
     porte ce numéro : le 23 bis d'Armelin n'est pas dans la base, et le
     taire obligeait à « taper 25 ». */
  const d = decomposerNumero(texte);
  if (!d || d.reste === '' || premiers.some((r) => porteLeNumero(r, d))) return premiers;

  const base = `${d.numero} ${d.reste}`;
  const replis = versResultats(await appelResilient(urlRecherche(base), signal));
  const mention = `Le ${d.numero} ${d.suffixe} n’est pas dans la Base Adresse`
    + ` Nationale — voici le ${d.numero}`;
  const avoues = replis
    .filter((r) => r.type === 'housenumber')
    .map((r) => ({ ...r, approche: mention }));
  /* LES PREMIERS RESTENT, DERRIÈRE : ils portent la rue, qui reste une
     réponse honnête — et si la base s'enrichit demain, elle passera devant
     sans qu'on touche à ce code. */
  return [...avoues, ...premiers];
}

export async function adresseInverse(p: PointGeo): Promise<ResultatAdresse | null> {
  const url = `${BAN}/reverse/?lon=${p.lon}&lat=${p.lat}`;
  const r = versResultats(await appelResilient(url));
  return r[0] ?? null;
}

/**
 * La saisie NOMME-T-ELLE la commune du résultat ? — PURE.
 *
 * RECHERCHE-4 (01/09). Deux cas mesurés le même jour, tous deux avec un score
 * BAN faible, et qui appellent des ancres OPPOSÉES :
 *
 *  - « Collège Albert Camus » rend le lieu-dit « Collège Albert Camus 59239
 *    Thumeries » (Nord, 0,48). Armelin habite à deux cents kilomètres de là :
 *    chercher autour de Thumeries ne pouvait rien donner, et c'est ce qui se
 *    passait.
 *  - « Tour Eiffel Paris » rend « Avenue Gustave Eiffel 75007 Paris » (0,378).
 *    Là, Paris est le bon endroit — parce que L'USAGER L'A ÉCRIT.
 *
 * LE SCORE NE LES SÉPARE PAS ; la commune, si. On n'ancre la recherche sur un
 * résultat approximatif que si l'on retrouve sa commune dans la saisie.
 */
function nu(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * LE RÉSULTAT DE LA BAN RÉPOND-IL À CE QU'ON A TAPÉ ? — PURE.
 *
 * RECHERCHE-5 (01/09), et c'est la question que j'aurais dû poser d'emblée.
 * J'ai d'abord cru que le SCORE dirait quand chercher plus loin ; il ne le dit
 * pas — la BAN annonce 0,945 sur un lieu-dit du Nord qui n'a rien à voir. J'ai
 * ensuite cru pouvoir chercher à chaque saisie ; c'est deux appels de plus par
 * recherche sur un service bénévole, et la règle du projet l'interdit.
 *
 * CE QUI SE LIT SANS RIEN DEMANDER À PERSONNE : les mots. Mesuré le jour même,
 *  - « lyon » rend « Lyon » — tous les mots y sont, la BAN a répondu ;
 *  - « Collège Albert Camus » rend « avenue albert camus … » — « collège » a
 *    disparu, elle a rendu autre chose ;
 *  - « Tour Eiffel Paris » rend « Avenue Gustave Eiffel » — « tour » manque.
 *
 * Un mot de la saisie absent du libellé, c'est une question sans réponse : là,
 * et là seulement, on va voir ailleurs.
 */
export function repondALaSaisie(texte: string, libelle: string): boolean {
  const dans = ` ${nu(libelle)} `;
  /* LES MOTS COURTS NE PROUVENT RIEN — « rue », « le », « de » se retrouvent
     partout et diraient oui à tort. Trois lettres, comme pour les communes. */
  const mots = nu(texte).split(' ').filter((m) => m.length >= 3);
  if (mots.length === 0) return false;
  return mots.every((m) => dans.includes(` ${m} `));
}

export function communeNommee(texte: string, contexte: string): boolean {
  const saisie = ` ${nu(texte)} `;
  /* LE CONTEXTE EST « 75007 Paris » : on essaie chaque mot d'au moins trois
     lettres — « Le » ou « sur » ne prouveraient rien. */
  return nu(contexte).split(' ')
    .filter((mot) => mot.length >= 3)
    .some((mot) => saisie.includes(` ${mot} `));
}
