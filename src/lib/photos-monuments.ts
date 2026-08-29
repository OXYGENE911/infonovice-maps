/* LES PHOTOS DES LIEUX D'EXCEPTION — ce que la fiche montrait en creux.
 *
 * LA DEMANDE, ET LA DÉCISION. Armelin, le 29/08/2026 : « quand on clique sur
 * un lieu, on a juste le nom du lieu et ses caractéristiques. Mais ne
 * serait-ce pas possible d'y afficher une ou plusieurs photos du lieu ?
 * Comment pourrions-nous récupérer des photos des lieux automatiquement et
 * sur quelle base de données se positionner ? » L'étude a été faite le jour
 * même (docs/apis.md) : sur 24 monuments classés tirés de l'index, Wikimedia
 * Commons via Wikidata en couvre 23 (96 %) avec de vraies photos cadrées,
 * là où Panoramax (souverain, déjà approuvé) n'offre que des vues de rue à
 * 75 %, et où l'API du ministère ne répond pas — ses photos étant en outre
 * sous droits. Armelin a tranché le 29/08 : « OK pour Wikimedia ».
 *
 * C'EST UN ÉCART DE SOUVERAINETÉ, LE DEUXIÈME DU PROJET, et il suit la même
 * règle que le premier (Open-Meteo, 22/08) : une décision explicite ET une
 * mention publique. Elle est écrite sur la page « À propos » et sous chaque
 * photo.
 *
 * LE CHEMIN, MESURÉ LE 29/08 (les deux services répondent avec CORS `*`,
 * sans clé) :
 *   1. Wikidata SPARQL : la référence Mérimée (propriété P380) donne
 *      l'élément, dont l'image (P18).
 *   2. Commons : `imageinfo` rend d'un coup la vignette à la largeur voulue
 *      ET son attribution (auteur, licence) — obligatoire, ces photos sont
 *      libres mais pas anonymes.
 * Deux appels, et SEULEMENT quand une fiche s'ouvre : jamais en lot pour une
 * liste de trente monuments qu'on ne regardera pas.
 */

/** Ce qu'une photo doit porter pour avoir le droit d'être affichée. */
export interface PhotoLieu {
  /** L'URL de la vignette, servie par Wikimedia. */
  vignette: string;
  /** L'auteur, en texte nu — jamais le HTML rendu par l'API. */
  auteur: string;
  /** « CC BY-SA 4.0 », « Public domain »… */
  licence: string;
  /** La page de description du fichier, pour vérifier et créditer. */
  page: string;
}

export class ErreurPhotos extends Error {}

const SPARQL = 'https://query.wikidata.org/sparql';
const COMMONS = 'https://commons.wikimedia.org/w/api.php';

/* Le motif des références Mérimée, REPRIS DE `monuments.ts` : la référence
   entre dans une requête SPARQL — une valeur non contrôlée y écrirait ce
   qu'elle veut. Deux lettres, des chiffres, rien d'autre. */
const REFERENCE = /^[A-Z]{2}[0-9A-Z]{6,10}$/;

/** Le nom de fichier porté par une URL `Special:FilePath` — ou `''`. */
export function fichierDepuisFilePath(url: string): string {
  const m = /Special:FilePath\/(.+)$/.exec(url);
  if (!m?.[1]) return '';
  try {
    return decodeURIComponent(m[1]).replace(/_/g, ' ').trim();
  } catch {
    // Une URL mal encodée n'est pas une raison de casser la fiche.
    return '';
  }
}

/* Les entités qu'on rencontre réellement dans les crédits de Commons. */
const ENTITES: Record<string, string> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"',
  '&#39;': "'", '&apos;': "'", '&nbsp;': ' ',
};

/**
 * Le texte nu d'un fragment HTML rendu par l'API — PURE.
 *
 * L'API DE COMMONS REND DU HTML pour l'auteur (« <a href=…>Benh LIEU
 * SONG</a> », mesuré le 29/08). On n'en garde que le texte, pour qu'un
 * crédit reste lisible.
 *
 * CE N'EST PAS CE QUI PROTÈGE LA PAGE, et il faut le dire clairement : la
 * sûreté vient du point d'insertion, où la valeur passe par `textContent`
 * et jamais par `innerHTML` — une chaîne tierce n'écrit pas notre balisage.
 * Ce nettoyage-ci est une affaire de lisibilité. (Écrit sans `DOMParser`
 * pour rester testable hors navigateur : les tests unitaires du projet
 * tournent en Node, sans DOM simulé.)
 */
export function texteNu(html: string): string {
  if (!html) return '';
  const sansBalise = html.replace(/<[^>]*>/g, ' ');
  const decode = sansBalise.replace(/&[a-z#0-9]+;/gi, (e) => ENTITES[e.toLowerCase()] ?? ' ');
  return decode.replace(/\s+/g, ' ').trim();
}

async function json(url: string, signal?: AbortSignal): Promise<unknown> {
  const reponse = await fetch(url, {
    ...(signal ? { signal } : {}),
    headers: { Accept: 'application/json' },
  });
  if (!reponse.ok) throw new ErreurPhotos(`Réponse ${reponse.status}`);
  return reponse.json();
}

/** Le nom du fichier illustrant une référence Mérimée — ou `''`. */
export async function fichierDeLaReference(
  reference: string, signal?: AbortSignal,
): Promise<string> {
  if (!REFERENCE.test(reference)) return '';
  const requete = `SELECT ?img WHERE { ?m wdt:P380 "${reference}". ?m wdt:P18 ?img. } LIMIT 1`;
  const brut = await json(`${SPARQL}?format=json&query=${encodeURIComponent(requete)}`, signal);
  const lignes = (brut as { results?: { bindings?: { img?: { value?: unknown } }[] } })
    .results?.bindings ?? [];
  const url = lignes[0]?.img?.value;
  return typeof url === 'string' ? fichierDepuisFilePath(url) : '';
}

/**
 * La vignette et son attribution — ou `null` si Commons ne sait rien.
 *
 * `largeur` est une VIGNETTE, pas l'original : les photos de Commons pèsent
 * couramment plusieurs mégaoctets, et une fiche n'a besoin que de sa largeur.
 */
export async function vignetteEtCredit(
  fichier: string, largeur = 480, signal?: AbortSignal,
): Promise<PhotoLieu | null> {
  if (!fichier) return null;
  const url = `${COMMONS}?action=query&format=json&origin=*`
    + '&prop=imageinfo&iiprop=extmetadata%7Curl&iiurlwidth=' + String(largeur)
    + '&titles=' + encodeURIComponent(`File:${fichier}`);
  const brut = await json(url, signal) as {
    query?: { pages?: Record<string, {
      imageinfo?: { thumburl?: unknown; descriptionurl?: unknown;
        extmetadata?: Record<string, { value?: unknown }> }[];
    }> };
  };
  const pages = Object.values(brut.query?.pages ?? {});
  const info = pages[0]?.imageinfo?.[0];
  const vignette = info?.thumburl;
  if (typeof vignette !== 'string' || vignette === '') return null;
  const meta = info?.extmetadata ?? {};
  const champ = (cle: string): string => {
    const v = meta[cle]?.value;
    return typeof v === 'string' ? texteNu(v) : '';
  };
  return {
    vignette,
    /* SANS AUTEUR CONNU, ON LE DIT — « Auteur inconnu » est une information ;
       un crédit vide serait une photo prise sans dire à qui. */
    auteur: champ('Artist') || 'Auteur non précisé',
    licence: champ('LicenseShortName') || 'licence non précisée',
    page: typeof info?.descriptionurl === 'string' ? info.descriptionurl : '',
  };
}

/**
 * La photo d'un monument, de sa référence Mérimée à sa vignette créditée.
 *
 * Rend `null` — jamais une exception — quand il n'y en a pas : une fiche
 * sans photo reste une fiche, et 4 % des classés n'en ont aucune.
 */
export async function photoDuMonument(
  reference: string, largeur = 480, signal?: AbortSignal,
): Promise<PhotoLieu | null> {
  const fichier = await fichierDeLaReference(reference, signal);
  if (!fichier) return null;
  return vignetteEtCredit(fichier, largeur, signal);
}
