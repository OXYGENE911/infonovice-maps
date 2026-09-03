// L'ANNUAIRE DES ENTREPRISES (RECHERCHE-8, 03/09).
//
// LE TERRAIN. Armelin, la nuit du 03/09 : « normalement, le gouvernement a mis
// des API pour tous les commerces de France et leur adresses. Donc on devrait
// tous pouvoir les résoudre. » Il a raison, et c'est celle-ci : l'API
// « Recherche d'entreprises » de la DINUM, bâtie sur SIRENE, qui expose TOUS
// les établissements de France — avec leur adresse postale et leur position.
// Sans clé, sans compte, sept requêtes par seconde.
//
// CE QU'ELLE RÉSOUT ET QUE RIEN D'AUTRE NE RÉSOLVAIT, mesuré le 03/09 :
//
//   « Leroy Merlin Lognes »   →  LEROY MERLIN FRANCE, LOGNES 77185     (181 ms)
//   « INRAE Beaucouzé »       →  INRAE, BEAUCOUZE 49070                (194 ms)
//   « Fnac Darty Ivry… »      →  FNAC DARTY, 9 rue des Bateaux-Lavoirs (150 ms)
//   « Collège Albert Camus… » →  COLLEGE ALBERT CAMUS, 94420           (193 ms)
//
// ELLE PORTE L'ADRESSE POSTALE, et c'est le second retour d'Armelin de cette
// nuit : « il y a trop de POI sur lesquels je clique et il n'y a aucune
// information sur l'adresse du lieu au format texte ». L'annuaire la donne
// écrite, telle qu'on la recopie sur une enveloppe.
//
// CE QU'ELLE NE RÉSOUT PAS, ET POURQUOI. « Castorama Ormesson » rend ZÉRO :
// le magasin est déclaré au CENTRE COMMERCIAL PINCEVENT, 94430
// Chennevières-sur-Marne — la commune voisine. Aucune recherche TEXTUELLE ne
// peut le trouver par le mot « Ormesson », puisque ce mot n'est nulle part
// dans sa fiche. C'est une recherche GÉOGRAPHIQUE qu'il faut : reconnaître la
// commune, puis chercher l'enseigne AUTOUR d'elle. C'est ce que fait
// `recherche-lieux.ts` avec Overpass, et le filtre `codePostal` ci-dessous
// permet de viser une commune quand on la connaît.

import type { PointGeo } from './coordonnees';

/** Un établissement, tel que l'annuaire le connaît. */
export interface Etablissement extends PointGeo {
  /** L'enseigne quand elle est déclarée, la raison sociale sinon. */
  nom: string;
  /** L'adresse postale, écrite — c'est ce qui manquait aux fiches. */
  adresse: string;
  commune: string;
  codePostal: string;
}

export const PLAFOND_ENTREPRISES = 5;

/* SEPT REQUÊTES PAR SECONDE, dit la documentation. On reste TRÈS en deçà :
   l'autocomplétion est déjà débattue à 300 ms, et l'on ne demande qu'une page
   de cinq. « Ces quotas sont un bien commun » — c'est la règle du projet. */
export const PAR_PAGE = 5;

/**
 * L'URL de l'annuaire — PURE.
 *
 * `codePostal` VISE UNE COMMUNE quand on l'a reconnue. Sans lui, la recherche
 * est nationale et « Carrefour » rend les cinq premiers de France, ce qui ne
 * sert personne.
 */
export function urlEntreprises(texte: string, codePostal?: string): string | null {
  const q = texte.trim();
  if (q.length < 3) return null;
  const cp = codePostal !== undefined && /^\d{5}$/.test(codePostal)
    ? `&code_postal=${codePostal}` : '';
  return 'https://recherche-entreprises.api.gouv.fr/search'
    + `?q=${encodeURIComponent(q)}&per_page=${PAR_PAGE}`
    + `&limite_matching_etablissements=3${cp}`;
}

/** Une chaîne, ou rien — l'annuaire laisse des champs à null. */
function texteDe(v: unknown): string {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : '';
}

function nombreDe(v: unknown): number | null {
  /* `Number(null)` VAUT ZÉRO, et ce zéro a coûté cher (RECHERCHE-9, 04/09) :
     l'établissement ADP de Persan porte `latitude: null` dans SIRENE, le
     convertisseur en faisait (0, 0) — l'île Nulle, golfe de Guinée — et
     l'aérodrome s'affichait « à 5442 km » de chez Armelin, en tête de liste.
     Vu sur sa capture d'écran, pas en test. */
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/* LES SIGLES ET FORMES JURIDIQUES QU'ON NE MONTRE PAS. « SCI », « SARL » et
   leurs semblables ne disent rien à qui cherche un magasin, et occupent la
   place d'un vrai résultat. On ne les RETIRE pas de la réponse — l'annuaire
   est ce qu'il est — mais on les repousse au classement. */
const FORMES = /^(SCI|SARL|SAS|SASU|EURL|SNC|SCM|SELARL|GIE|SCP)\b/i;

/** Un établissement mérite-t-il d'être proposé en premier ? — PURE. */
export function estUneEnseigne(e: Etablissement): boolean {
  return !FORMES.test(e.nom);
}

/**
 * Lit la réponse de l'annuaire — PURE, défensive.
 *
 * ON PREND LES ÉTABLISSEMENTS, PAS LES SIÈGES. C'est la différence qui compte
 * pour un usager : « Leroy Merlin Lognes » doit rendre le magasin de Lognes,
 * pas le siège social à Lezennes — et c'est exactement ce que rendait la
 * recherche naïve avant cette distinction (mesuré le 03/09 : « LEROY MERLIN
 * FRANCE | RUE CHANZY 59260 LEZENNES »).
 */
export function versEtablissements(brut: unknown): Etablissement[] {
  const d = (brut ?? {}) as { results?: unknown };
  if (!Array.isArray(d.results)) return [];
  const sortie: Etablissement[] = [];
  const vus = new Set<string>();
  for (const r of d.results) {
    const u = (r ?? {}) as Record<string, unknown>;
    const nomLegal = texteDe(u['nom_complet']) || texteDe(u['nom_raison_sociale']);
    const etabs = Array.isArray(u['matching_etablissements'])
      ? u['matching_etablissements'] : [];
    for (const b of etabs) {
      const e = (b ?? {}) as Record<string, unknown>;
      const lon = nombreDe(e['longitude']);
      const lat = nombreDe(e['latitude']);
      if (lon === null || lat === null) continue;
      /* (0, 0) N'EST PAS UNE ADRESSE FRANÇAISE : c'est la valeur qu'un
         producteur met quand il ne sait pas. La garder enverrait l'usager
         dans le golfe de Guinée. */
      if (lon === 0 && lat === 0) continue;
      const nom = texteDe(e['enseigne']) || texteDe(e['nom_commercial']) || nomLegal;
      if (nom === '') continue;
      const adresse = texteDe(e['adresse']);
      /* DEUX ÉTABLISSEMENTS AU MÊME ENDROIT ET SOUS LE MÊME NOM sont un
         doublon pour qui cherche : l'annuaire en aligne parfois quatre pour un
         seul magasin (siège, participations, filiales). */
      const cle = `${nom.toLowerCase()}|${lon.toFixed(4)},${lat.toFixed(4)}`;
      if (vus.has(cle)) continue;
      vus.add(cle);
      sortie.push({
        lon, lat, nom, adresse,
        commune: texteDe(e['libelle_commune']),
        codePostal: texteDe(e['code_postal']),
      });
    }
  }
  /* LES VRAIES ENSEIGNES D'ABORD : une SCI qui porte le nom d'un lieu n'est
     pas le lieu, et personne ne cherche « SCI 43 CLER TOUR EFFEIL ». */
  return sortie
    .sort((a, b) => Number(estUneEnseigne(b)) - Number(estUneEnseigne(a)))
    .slice(0, PLAFOND_ENTREPRISES);
}

/**
 * Interroge l'annuaire — rend [] plutôt que de lever sur une saisie courte.
 */
export async function chercherEntreprises(
  texte: string, options: { codePostal?: string; signal?: AbortSignal } = {},
): Promise<Etablissement[]> {
  const url = urlEntreprises(texte, options.codePostal);
  if (url === null) return [];
  /* `exactOptionalPropertyTypes` INTERDIT DE PASSER `signal: undefined` : on
     ne pose la clé que si l'on a vraiment un signal. */
  const rep = await fetch(url, options.signal ? { signal: options.signal } : {});
  if (!rep.ok) throw new Error(`L’annuaire des entreprises a répondu ${rep.status}`);
  return versEtablissements(await rep.json());
}
