// LES LIEUX CONNUS, CHERCHÉS PAR LEUR NOM DANS LE NAVIGATEUR (lot 144, 09/10/2026).
//
// TROIS INDEX EMBARQUÉS, servis par ce site même, chargés à la PREMIÈRE
// recherche et gardés pour la session — jamais précachés, hors du budget du
// bundle. Rien de l'usager ne part : on télécharge des fichiers statiques, on
// cherche ici.
//
//   · les monuments historiques CLASSÉS (base Mérimée, ministère de la Culture,
//     Licence Ouverte) — le même fichier que les « lieux d'exception près du
//     trajet » (`monuments.ts`), qui n'était pas branché sur la recherche ;
//   · les Musées de France (base Muséofile, même ministère, même licence) ;
//   · un EXTRAIT DE WIKIDATA (CC0) : les lieux notables de France, avec leur
//     nombre d'articles Wikipédia, qui dit la notoriété.
//
// WIKIDATA EST UNE DÉROGATION, ÉCRITE DANS CLAUDE.md ET SUR LA PAGE « À PROPOS »
// (accordée par Armelin le 09/10/2026) : Wikimedia Foundation, États-Unis ;
// données sous CC0 ; pour la recherche de lieux seulement, et de préférence en
// extrait embarqué — c'est ce fichier-ci : AUCUNE requête ne part vers
// Wikidata depuis le navigateur.
//
// LA RÈGLE DU NOM vient de Maps Pro (`LieuxNotoires.kt`, `lieux-notoires.ts`,
// lot 142), recopiée par son auteur : chaque mot de la saisie (sauf les mots
// vides et les mots de type) dans le nom ou la commune, un au moins dans le
// nom ; les mots de trop coûtent ; le type dit, la notoriété et la proximité
// comptent.
import { chargerMonuments } from './monuments';
import { MOTS_VIDES, mots, ecartM, type Analyse, type Candidat, type Repere } from './classement-recherche';
import { correspond, estType, transportDe } from './types-lieu';

export const MONUMENT = 'Monument historique';
export const MUSEE = 'Musée de France';
export const URL_MUSEES = '/donnees/musees.json';
export const URL_WIKIDATA = '/donnees/lieux-wikidata.json';
/** Trois lieux connus au plus par saisie : les autres sources ont droit à leur place. */
export const LIMITE_CONNUS = 3;
/** Les notes de départ (Maps Pro) : un monument au-dessus de l'annuaire (0,6), Wikidata comme la carte (0,55). */
export const SCORE_NOTOIRE = 0.7;
export const SCORE_WIKIDATA = 0.55;

export interface LieuConnu {
  nom: string;
  commune: string;
  lon: number;
  lat: number;
  /** « Monument historique », « Musée de France », ou le type Wikidata (« basilique », « col »). */
  type: string;
  source: 'notoire' | 'wikidata';
  /** Articles Wikipédia (Wikidata) ; 0 pour Mérimée et Muséofile. */
  notoriete: number;
  motsNom: string[];
  motsCommune: string[];
}

const nombre = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const texte = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

function lieu(lon: unknown, lat: unknown, nom: unknown, commune: unknown, type: string,
  source: LieuConnu['source'], notoriete: number): LieuConnu | null {
  if (!nombre(lon) || !nombre(lat) || Math.abs(lon) > 180 || Math.abs(lat) > 90) return null;
  const n = texte(nom);
  if (n === '') return null;
  const c = texte(commune);
  return { nom: n, commune: c, lon, lat, type, source, notoriete, motsNom: mots(n), motsCommune: mots(c) };
}

/** Le fichier des musées → l'index — PUR, défensif. `[[lon, lat, nom, commune], …]`. */
export function lireMusees(brut: unknown): LieuConnu[] {
  const lignes = (brut as { lieux?: unknown } | null)?.lieux;
  if (!Array.isArray(lignes)) return [];
  return lignes.flatMap((l) => {
    if (!Array.isArray(l)) return [];
    const r = lieu(l[0], l[1], l[2], l[3], MUSEE, 'notoire', 0);
    return r ? [r] : [];
  });
}

/** L'extrait Wikidata → l'index — PUR, défensif. `[[lon, lat, nom, commune, type, articles], …]`. */
export function lireWikidata(brut: unknown): LieuConnu[] {
  const lignes = (brut as { lieux?: unknown } | null)?.lieux;
  if (!Array.isArray(lignes)) return [];
  return lignes.flatMap((l) => {
    if (!Array.isArray(l)) return [];
    const articles = nombre(l[5]) ? Math.max(0, Math.round(l[5])) : 0;
    const r = lieu(l[0], l[1], l[2], l[3], texte(l[4]) || 'Lieu', 'wikidata', articles);
    return r ? [r] : [];
  });
}

/** Lit un fichier du site en JSON ; remplaçable dans les essais et le banc. */
export type LecteurJson = (url: string) => Promise<unknown>;

const lireDuSite: LecteurJson = async (url) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} : ${r.status}`);
  return r.json();
};

let enMemoire: Promise<LieuConnu[]> | null = null;
let charges: LieuConnu[] | null = null;

/**
 * Charge les trois index, une fois pour la session. UN INDEX EN PANNE N'EMPORTE
 * PAS LES AUTRES ; si TOUS manquent, l'échec ne se grave pas : la recherche
 * suivante réessaiera.
 */
export function chargerLieuxConnus(lire: LecteurJson = lireDuSite): Promise<LieuConnu[]> {
  enMemoire ??= (async () => {
    const [monuments, musees, wikidata] = await Promise.allSettled([
      lire === lireDuSite ? chargerMonuments() : lire('/donnees/monuments.json').then((b) => (Array.isArray(b) ? b : [])),
      lire(URL_MUSEES).then(lireMusees),
      lire(URL_WIKIDATA).then(lireWikidata),
    ]);
    const index: LieuConnu[] = [];
    if (monuments.status === 'fulfilled') {
      for (const m of monuments.value as { lon?: unknown; lat?: unknown; titre?: unknown; commune?: unknown }[] | unknown[][]) {
        const r = Array.isArray(m) ? lieu(m[0], m[1], m[2], m[3], MONUMENT, 'notoire', 0)
          : lieu(m.lon, m.lat, m.titre, m.commune, MONUMENT, 'notoire', 0);
        if (r) index.push(r);
      }
    }
    if (musees.status === 'fulfilled') index.push(...musees.value);
    if (wikidata.status === 'fulfilled') index.push(...wikidata.value);
    if (index.length === 0) { enMemoire = null; return []; }
    charges = index;
    return index;
  })();
  return enMemoire;
}

/** L'index s'il est déjà là — sans attendre ni rien télécharger. */
export function lieuxConnusCharges(): LieuConnu[] | null { return charges; }

/** Pour les essais : oublie l'index chargé. */
export function oublierLieuxConnus(): void { enMemoire = null; charges = null; }

/** Les mots de type qui disent un lieu connu : ils ne coûtent rien de trop (« Basilique » du Sacré-Cœur). */
const NOTOIRES = new Set(['cathedrale', 'basilique', 'palais', 'chateau', 'abbaye', 'domaine', 'arc', 'pantheon', 'opera', 'citadelle', 'remparts', 'cite', 'musee', 'eglise']);

/** La distance d'édition, une transposition comptant pour un — PURE, pour les mots longs seulement. */
function damerau(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i += 1) (d[i] as number[])[0] = i;
  for (let j = 0; j <= b.length; j += 1) (d[0] as number[])[j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    const ligne = d[i] as number[];
    const avant = d[i - 1] as number[];
    for (let j = 1; j <= b.length; j += 1) {
      const cout = a[i - 1] === b[j - 1] ? 0 : 1;
      ligne[j] = Math.min((avant[j] ?? 0) + 1, (ligne[j - 1] ?? 0) + 1, (avant[j - 1] ?? 0) + cout);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        ligne[j] = Math.min(ligne[j] ?? 0, ((d[i - 2] as number[])[j - 2] ?? 0) + 1);
      }
    }
  }
  return (d[a.length] as number[])[b.length] ?? 0;
}

/** Un mot de la saisie est-il dans ces mots ? Entier, en début de mot (six lettres), un pluriel près, une faute près — PUR. */
function porte(liste: readonly string[], m: string): boolean {
  return liste.includes(m) || (m.length >= 6 && liste.some((w) => w.startsWith(m)))
    || (m.length >= 5 && m.endsWith('s') && liste.includes(m.slice(0, -1)))
    || (m.length >= 7 && liste.some((w) => w.length >= 7 && Math.abs(w.length - m.length) <= 1 && damerau(w, m) <= 1));
}

/** Les mots que la saisie demande de retrouver : sans mots vides ni mots de type — PUR. */
export function motsCherches(a: Analyse): string[] {
  return mots(a.texteLieu).filter((x) => !MOTS_VIDES.has(x) && !estType(x) && (x.length >= 2 || /\d/.test(x)));
}

/**
 * Les lieux connus qui répondent à la saisie, les mieux notés d'abord — PURE.
 * Trois au plus : ils rejoignent ensuite le classement commun (`classerCandidats`).
 */
export function chercherLieuxConnus(
  a: Analyse, index: readonly LieuConnu[], reperes: readonly Repere[] = [], limite = LIMITE_CONNUS,
): Candidat[] {
  /* UNE GARE, UN AÉROPORT SE CHERCHENT AUSSI ICI (adaptation au client libre) :
     « gare montparnase » — la faute fait taire l'index de la Géoplateforme,
     l'extrait connaît la gare de Paris-Montparnasse. Les mots de transport
     sont déjà retirés de `texteLieu`, le mot « gare » est un mot de type. */
  if (a.numero || index.length === 0) return [];
  const cherches = motsCherches(a);
  if (cherches.length === 0 || cherches.reduce((t, m) => t + m.length, 0) < 4) return [];
  const types = a.mots.filter(estType);
  const notes: { l: LieuConnu; s: number }[] = [];
  for (const l of index) {
    let dansNom = 0;
    let ok = true;
    for (const m of cherches) {
      if (porte(l.motsNom, m)) dansNom += 1;
      else if (!porte(l.motsCommune, m)) { ok = false; break; }
    }
    if (!ok || dansNom === 0) continue;
    let s = 1 + 0.05 * dansNom;
    const surplus = l.motsNom.filter((w) => w.length >= 3 && !MOTS_VIDES.has(w) && !estType(w)
      && !cherches.some((m) => w.startsWith(m) || m.startsWith(w)) && !NOTOIRES.has(w)).length;
    s -= Math.min(0.3, 0.12 * surplus);
    if (types.some((t) => l.motsNom.includes(t) || correspond(t, l.type))) s += 0.15;
    if (l.motsNom.some((w) => NOTOIRES.has(w))) s += 0.05;
    /* Une saisie de transport cherche la gare, pas le quartier qui en porte le nom. */
    if (a.intention !== 'AUCUNE') s += transportDe(l.type) ? 0.3 : -0.3;
    if (l.source === 'wikidata') s += Math.min(0.4, l.notoriete / 250);
    if (reperes.length > 0) {
      const d = Math.min(...reperes.map((p) => ecartM(p, l)));
      s += d < 10_000 ? 0.35 : d < 30_000 ? 0.25 : d < 100_000 ? 0.12 : d < 300_000 ? 0.03 : 0;
    }
    notes.push({ l, s });
  }
  return notes.sort((x, y) => y.s - x.s).slice(0, limite).map(({ l }) => ({
    lon: l.lon, lat: l.lat, libelle: l.nom,
    detail: [l.type, l.commune].filter((x) => x !== '').join(' · '),
    genre: 'lieu' as const, source: l.source, categorie: l.type,
    score: l.source === 'wikidata' ? SCORE_WIKIDATA : SCORE_NOTOIRE,
    ...(l.source === 'wikidata' ? { notoriete: l.notoriete } : {}),
  }));
}
