// CE QU'ON FAIT DE LA PHRASE TAPÉE (RECHERCHE-8, 03/09).
//
// LE TERRAIN. Armelin : « je ne veux pas avoir à écrire les mots exacts dans
// la barre de recherche mais avoir plus de souplesse même si les mots sont
// incomplets ». Douze requêtes en jeu d'essai, et deux d'entre elles ne
// tiennent qu'à la façon dont on découpe la phrase :
//
//   « FnacDarty Siège Ivry sur Seine » — collé, rend ZÉRO partout. Séparé en
//   « Fnac Darty », l'annuaire des entreprises rend le siège, 9 rue des
//   Bateaux-Lavoirs à Ivry (mesuré le 03/09).
//
//   « Castorama Ormesson » — le magasin est déclaré au CENTRE COMMERCIAL
//   PINCEVENT, 94430 Chennevières-sur-Marne. Le mot « Ormesson » n'est nulle
//   part dans sa fiche : AUCUNE recherche textuelle ne peut le trouver. Il
//   faut reconnaître « Ormesson » comme une COMMUNE, puis chercher
//   « Castorama » AUTOUR d'elle. C'est une recherche géographique déguisée en
//   recherche de texte, et c'est ainsi qu'on parle : « le Castorama
//   d'Ormesson » veut dire « le Castorama, du côté d'Ormesson ».

import type { PointGeo } from './coordonnees';

/**
 * Sépare les mots collés en casse chameau — PURE.
 *
 * « FnacDarty » → « Fnac Darty ». On ne touche QU'aux minuscules suivies
 * d'une majuscule : « SNCF » et « INRAE » doivent rester entiers, et
 * « McDonald » ne doit pas devenir « Mc Donald ».
 */
export function separerMotsColles(texte: string): string {
  return texte.replace(/([a-zà-öø-ÿ])([A-ZÀ-ÖØ-Þ])/g, '$1 $2');
}

/* LES ENSEIGNES QU'ON SAIT DÉCOLLER (RECHERCHE-9, 04/09). Armelin :
   « "FNACDARTY" renvoie aucun résultat alors que "FNAC DARTY" répond des
   adresses ». `separerMotsColles` sépare la casse chameau — « FnacDarty » —
   mais un TOUT-MAJUSCULES collé n'a aucun point de coupe lexical. On coupe
   donc au DICTIONNAIRE : si le mot commence par une enseigne connue et qu'il
   reste au moins deux lettres, la coupe est presque sûrement la bonne. La
   liste reprend celle des familles devinées (famille-devinee) — un seul
   endroit à enrichir. */
const ENSEIGNES_COLLABLES: readonly string[] = [
  'fnac', 'darty', 'carrefour', 'leclerc', 'auchan', 'intermarche', 'lidl',
  'monoprix', 'casino', 'castorama', 'leroymerlin', 'leroy', 'bricodepot',
  'ikea', 'decathlon', 'boulanger', 'chargemap', 'plugsurfing',
];

/**
 * Les graphies à essayer pour un mot peut-être collé — PURE.
 *
 * Rend au plus UNE variante : la première coupe au dictionnaire. En essayer
 * plus multiplierait les requêtes pour des chimères.
 */
export function variantesDecollees(texte: string): string[] {
  const mots = texte.trim().split(/\s+/);
  for (let i = 0; i < mots.length; i += 1) {
    const bas = nu(mots[i] ?? '');
    for (const e of ENSEIGNES_COLLABLES) {
      if (bas.length >= e.length + 2 && bas.startsWith(e)) {
        const coupe = [...mots.slice(0, i),
          (mots[i] as string).slice(0, e.length), (mots[i] as string).slice(e.length),
          ...mots.slice(i + 1)].join(' ');
        return [coupe];
      }
    }
  }
  return [];
}

/** Sans accents ni casse — la forme sous laquelle on compare. */
export function nu(texte: string): string {
  return texte.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/* CE QU'ON NE PREND JAMAIS POUR UNE COMMUNE. « Paris » en est une, et c'est
   justement le piège : « Tour Effeil Paris » ne doit pas devenir une recherche
   de « Tour Effeil » autour de Paris ALORS QUE l'index des lieux rend déjà la
   Tour Eiffel sur la phrase entière. On n'écarte donc rien ici — on se
   contente de ne PAS écraser les autres sources : la piste « enseigne +
   commune » S'AJOUTE aux autres, elle ne les remplace pas. */

/**
 * Les découpages « nom + commune » à essayer — PURE.
 *
 * La commune est en FIN de phrase dans la langue courante (« Castorama
 * Ormesson », « Leroy Merlin Lognes », « Collège Albert Camus
 * Plessis-Trévise »), et elle tient en un à quatre mots (« Ivry sur Seine »,
 * « Le Plessis-Trévise »). On rend les couples de la commune LA PLUS LONGUE à
 * la plus courte : c'est l'ordre du plus probable au moins probable.
 *
 * IL FAUT QU'IL RESTE UN NOM. Un découpage qui prendrait toute la phrase pour
 * une commune ne laisserait rien à chercher.
 */
export function decoupagesNomCommune(
  texte: string,
): { nom: string; commune: string }[] {
  const mots = separerMotsColles(texte).trim().split(/\s+/).filter((m) => m !== '');
  const sortie: { nom: string; commune: string }[] = [];
  /* LA PLUS LONGUE D'ABORD, ET C'EST UNE CORRECTION (RECHERCHE-8c, 03/09).
     VU EN PRODUCTION : « FnacDarty Siège Ivry sur Seine » faisait reconnaître
     « Seine » comme commune — elle ouvre « Seine-Port » — et l'on partait
     chercher « Fnac Darty Siège Ivry sur » autour de Seine-Port, à 25 km de
     nulle part. La bonne lecture était « Ivry sur Seine », trois mots.
     UN NOM DE COMMUNE PLUS LONG EST UN SIGNAL PLUS FORT : « Ivry sur Seine »
     ne peut guère être un hasard, « Seine » si. On s'arrête au premier
     découpage reconnu, donc essayer du plus long au plus court ne coûte des
     requêtes que là où le court aurait été faux.

     QUATRE MOTS AU PLUS : « Le Plessis-Trévise » en fait deux, « Ivry sur
     Seine » trois, « Saint-Germain en Laye » trois — quatre couvre « La
     Chapelle Saint Mesmin » sans ouvrir la porte à n'importe quoi. */
  for (let n = Math.min(4, mots.length - 1); n >= 1; n -= 1) {
    const commune = mots.slice(mots.length - n).join(' ');
    const nom = mots.slice(0, mots.length - n).join(' ');
    /* UN MOT DE DEUX LETTRES NE NOMME PAS UNE COMMUNE, et « de » ou « la » en
       fin de phrase feraient perdre une requête pour rien. */
    if (commune.length < 3 || nom.length < 3) continue;
    sortie.push({ nom, commune });
  }
  return sortie;
}

/* LES ARTICLES QUI OUVRENT UN NOM DE COMMUNE. « Le Plessis-Trévise » se dit
   « Plessis-Trévise » ; « La Rochelle » se dit « La Rochelle ». On les retire
   pour comparer, jamais pour afficher. */
const ARTICLES = /^(le|la|les|l|du|des)\s+/;

/**
 * Ces mots nomment-ils VRAIMENT cette commune ? — PURE.
 *
 * LE DÉFAUT QUE CETTE FONCTION FERME, mesuré le 03/09 en rejouant le jeu
 * d'essai d'Armelin à travers le vrai code :
 *
 *   « Stade de France »  →  la BAN reconnaissait « Tremblay-en-France »
 *   « Musée du Louvre »  →  … « Chennevières-lès-Louvres »
 *   « Gare Saint Lazare »→  … « Le Lardin-Saint-Lazare »
 *
 * Un simple « le nom de la commune contient le mot cherché » les laissait tous
 * passer, et la recherche partait alors chercher « Musée du » autour d'un
 * village du Val-d'Oise. Une requête gâchée, et des résultats qui n'ont rien à
 * faire là.
 *
 * LA RÈGLE : la commune doit COMMENCER par ce qu'on a écrit, article mis à
 * part. « Ormesson » ouvre « Ormesson-sur-Marne » ✓ ; « France » n'ouvre pas
 * « Tremblay-en-France » ✗. Les traits d'union comptent comme des espaces —
 * on écrit « Ivry sur Seine » pour « Ivry-sur-Seine ».
 */
export function communeCorrespond(recherche: string, nomCommune: string): boolean {
  const aplat = (s: string): string => nu(s).replace(/[-']/g, ' ')
    .replace(/\s+/g, ' ').trim();
  const cherche = aplat(recherche);
  const commune = aplat(nomCommune).replace(ARTICLES, '');
  if (cherche === '' || commune === '') return false;
  if (commune === cherche) return true;
  /* « COMMENCE PAR », AU MOT PRÈS : sans la frontière, « Lo » ouvrirait
     « Lognes » et n'importe quelle amorce vaudrait commune. */
  return commune.startsWith(`${cherche} `);
}

/** Une commune reconnue, avec de quoi situer une recherche autour d'elle. */
export interface CommuneReconnue extends PointGeo {
  nom: string;
  codePostal: string;
}

/**
 * L'URL qui demande à la BAN une COMMUNE, et rien d'autre — PURE.
 *
 * `type=municipality` est ce qui change tout : sans lui, « Ormesson » rend
 * « Rue d'Ormesson, Reims » en tête, et la recherche partirait se centrer à
 * deux cents kilomètres de ce qu'on visait (mesuré le 03/09).
 */
export function urlCommune(nom: string): string | null {
  const q = nom.trim();
  if (q.length < 3) return null;
  return `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(q)}`
    + '&type=municipality&limit=3';
}

/** Lit la réponse de la BAN — PURE, défensive. */
export function versCommunes(brut: unknown): CommuneReconnue[] {
  const d = (brut ?? {}) as { features?: unknown };
  if (!Array.isArray(d.features)) return [];
  const sortie: CommuneReconnue[] = [];
  for (const f of d.features) {
    const t = (f ?? {}) as { properties?: unknown; geometry?: unknown };
    const p = (t.properties ?? {}) as Record<string, unknown>;
    const g = (t.geometry ?? {}) as { coordinates?: unknown };
    const c = g.coordinates;
    if (!Array.isArray(c) || typeof c[0] !== 'number' || typeof c[1] !== 'number') continue;
    const nom = typeof p['city'] === 'string' ? p['city']
      : (typeof p['label'] === 'string' ? p['label'] : '');
    if (nom === '') continue;
    sortie.push({
      lon: c[0], lat: c[1], nom,
      codePostal: typeof p['postcode'] === 'string' ? p['postcode'] : '',
    });
  }
  return sortie;
}

/**
 * Choisit la commune la plus proche d'un point de référence — PURE.
 *
 * « Ormesson » EN DÉSIGNE DEUX : Ormesson (77167) et Ormesson-sur-Marne
 * (94490). La BAN rend la première ; l'usager, lui, pensait à celle qu'il a
 * sous les yeux. On prend donc la plus proche de la vue quand on en a une —
 * et la première réponse sinon, faute de mieux, ce qui vaut toujours mieux que
 * de renoncer.
 */
export function communeLaPlusProche(
  communes: CommuneReconnue[], repere: PointGeo | null,
): CommuneReconnue | null {
  if (communes.length === 0) return null;
  if (repere === null) return communes[0] ?? null;
  let meilleure = communes[0] as CommuneReconnue;
  let court = Number.POSITIVE_INFINITY;
  for (const c of communes) {
    /* UNE DISTANCE EUCLIDIENNE EN DEGRÉS SUFFIT ICI : on compare des communes
       entre elles, pas des kilomètres à un seuil. */
    const d = (c.lon - repere.lon) ** 2 + (c.lat - repere.lat) ** 2;
    if (d < court) { court = d; meilleure = c; }
  }
  return meilleure;
}

/** Demande à la BAN si ces mots nomment une commune — [] plutôt que lever. */
export async function chercherCommune(
  nom: string, signal?: AbortSignal,
): Promise<CommuneReconnue[]> {
  const url = urlCommune(nom);
  if (url === null) return [];
  const rep = await fetch(url, signal ? { signal } : {});
  if (!rep.ok) throw new Error(`La BAN a répondu ${rep.status}`);
  return versCommunes(await rep.json());
}
