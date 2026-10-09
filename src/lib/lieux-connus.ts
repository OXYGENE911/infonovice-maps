// LES LIEUX CONNUS, CHERCHÉS PAR LEUR NOM DANS LE NAVIGATEUR (lot 144, 09/10/2026).
//
// TROIS INDEX EMBARQUÉS, servis par ce site même, lus PAR PAQUETS à la
// demande et gardés pour la session — jamais précachés, hors du budget du
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
//
// LA PREMIÈRE RECHERCHE ÉTAIT LOURDE (lot 145, 09/10/2026) : les trois fichiers
// entiers, ≈ 545 Ko gzip, dont 404 Ko de monuments (mesuré). Ils sont désormais
// rangés en PAQUETS (`public/donnees/recherche/`, engendrés par
// `tests/index-recherche.test.ts`) : chaque lieu, réduit à son point, son nom,
// sa commune et son type, se range sous les TROIS PREMIÈRES LETTRES de chaque
// mot de son nom et de sa commune. Une saisie lit le petit SOMMAIRE (≈ 9 Ko
// gzip), puis le seul paquet du mot cherché LE PLUS RARE (≈ 8 Ko gzip en
// médiane sur le banc) : la règle du nom demande que CHAQUE mot cherché soit
// dans le nom ou la commune, donc tout lieu qui peut répondre est dans ce
// paquet-là. Les paquets gardent l'ordre de l'index entier : le classement
// rend exactement ce que rendait l'index entier (essai d'équivalence).
// SEULE LIMITE, écrite et mesurée : une faute de frappe dans les trois
// premières lettres d'un mot long (« Mnotmartre ») ne retrouve plus le lieu
// par la tolérance d'une faute.
import { MOTS_VIDES, mots, ecartM, type Analyse, type Candidat, type Repere } from './classement-recherche';
import { correspond, estType, transportDe } from './types-lieu';

export const MONUMENT = 'Monument historique';
export const MUSEE = 'Musée de France';
/** Le sommaire des paquets : clé de trois lettres → [numéro du paquet, nombre de lieux]. */
export const URL_SOMMAIRE = '/donnees/recherche/sommaire.json';
/** L'adresse d'un paquet — PURE. */
export function urlPaquet(n: number): string {
  return `/donnees/recherche/p${String(n).padStart(3, '0')}.json`;
}
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

/** Le fichier des monuments (`monuments.json`, Mérimée) → l'index — PUR, défensif. `[[lon, lat, titre, commune, …], …]`. */
export function lireMonuments(brut: unknown): LieuConnu[] {
  if (!Array.isArray(brut)) return [];
  return brut.flatMap((m) => {
    if (!Array.isArray(m)) return [];
    const r = lieu(m[0], m[1], m[2], m[3], MONUMENT, 'notoire', 0);
    return r ? [r] : [];
  });
}

/**
 * Une ligne de paquet → un lieu — PURE, défensive. Trois formes :
 * `[lon, lat, nom, commune]` (monument), `[lon, lat, nom, commune, 1]` (musée),
 * `[lon, lat, nom, commune, 2, type, articles]` (Wikidata).
 */
export function lireLigne(l: unknown): LieuConnu | null {
  if (!Array.isArray(l)) return null;
  if (l[4] === 2) {
    const articles = nombre(l[6]) ? Math.max(0, Math.round(l[6])) : 0;
    return lieu(l[0], l[1], l[2], l[3], texte(l[5]) || 'Lieu', 'wikidata', articles);
  }
  return lieu(l[0], l[1], l[2], l[3], l[4] === 1 ? MUSEE : MONUMENT, 'notoire', 0);
}

/** La clé d'un mot : ses trois premières lettres, le mot entier s'il est plus court — PURE. */
export function cleDuMot(m: string): string {
  return m.slice(0, 3);
}

/**
 * Les clés sous lesquelles un lieu se range — PURE : chaque mot de son nom ET
 * de sa commune, sauf les mots vides (qu'aucune saisie ne cherche).
 */
export function clesDuLieu(nom: string, commune: string): string[] {
  return [...new Set([...mots(nom), ...mots(commune)].filter((m) => !MOTS_VIDES.has(m)).map(cleDuMot))];
}

/** Le sommaire lu : clé → [numéro du paquet, nombre de lieux rangés sous la clé]. */
export type Sommaire = ReadonlyMap<string, readonly [number, number]>;

/** Le fichier du sommaire → le sommaire — PUR, défensif ; null s'il est illisible. */
export function lireSommaire(brut: unknown): Sommaire | null {
  const cles = (brut as { cles?: unknown } | null)?.cles;
  if (cles === null || typeof cles !== 'object' || Array.isArray(cles)) return null;
  const s = new Map<string, readonly [number, number]>();
  for (const [k, v] of Object.entries(cles as Record<string, unknown>)) {
    if (Array.isArray(v) && Number.isInteger(v[0]) && Number.isInteger(v[1])) s.set(k, [v[0] as number, v[1] as number]);
  }
  return s;
}

/** Une saisie peut-elle appeler un lieu connu ? (les conditions de `chercherLieuxConnus`) — PURE. */
function peutRepondre(a: Analyse): string[] | null {
  if (a.numero) return null;
  const cherches = motsCherches(a);
  if (cherches.length === 0 || cherches.reduce((t, m) => t + m.length, 0) < 4) return null;
  return cherches;
}

/**
 * Le paquet à lire pour une saisie — PURE : celui du mot cherché le plus rare.
 * null : aucun lieu connu ne peut répondre (un mot cherché n'a aucune clé),
 * rien à télécharger.
 */
export function paquetPour(a: Analyse, sommaire: Sommaire): number | null {
  const cherches = peutRepondre(a);
  if (cherches === null) return null;
  let meilleur: readonly [number, number] | null = null;
  for (const m of cherches) {
    const e = sommaire.get(cleDuMot(m));
    if (e === undefined) return null;
    if (meilleur === null || e[1] < meilleur[1]) meilleur = e;
  }
  return meilleur === null ? null : meilleur[0];
}

/** Lit un fichier du site en JSON ; remplaçable dans les essais et le banc. */
export type LecteurJson = (url: string) => Promise<unknown>;

const lireDuSite: LecteurJson = async (url) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} : ${r.status}`);
  return r.json();
};

/* CE QUI EST LU SE GARDE POUR LA SESSION, ce qui échoue ne se grave pas : la
   recherche suivante réessaiera. Les promesses sont partagées : deux frappes
   rapprochées ne téléchargent pas deux fois le même paquet. */
let sommaireEnCours: Promise<Sommaire> | null = null;
let sommaireLu: Sommaire | null = null;
const paquetsEnCours = new Map<number, Promise<LieuConnu[]>>();
const paquetsLus = new Map<number, LieuConnu[]>();

const versLieux = (brut: unknown): LieuConnu[] => {
  const lignes = (brut as { lieux?: unknown } | null)?.lieux;
  if (!Array.isArray(lignes)) throw new Error('paquet illisible');
  return lignes.flatMap((l) => { const r = lireLigne(l); return r ? [r] : []; });
};

function chargerSommaire(lire: LecteurJson): Promise<Sommaire> {
  if (lire !== lireDuSite) {
    return lire(URL_SOMMAIRE).then((b) => { const s = lireSommaire(b); if (!s) throw new Error('sommaire illisible'); return s; });
  }
  sommaireEnCours ??= lire(URL_SOMMAIRE).then((b) => {
    const s = lireSommaire(b);
    if (!s) throw new Error('sommaire illisible');
    sommaireLu = s;
    return s;
  }, (e: unknown) => { sommaireEnCours = null; throw e; });
  return sommaireEnCours;
}

function chargerPaquet(n: number, lire: LecteurJson): Promise<LieuConnu[]> {
  if (lire !== lireDuSite) return lire(urlPaquet(n)).then(versLieux);
  let p = paquetsEnCours.get(n);
  if (!p) {
    p = lire(urlPaquet(n)).then(versLieux).then((lieux) => { paquetsLus.set(n, lieux); return lieux; },
      (e: unknown) => { paquetsEnCours.delete(n); throw e; });
    paquetsEnCours.set(n, p);
  }
  return p;
}

/**
 * Les lieux connus qui PEUVENT répondre à cette saisie : le sommaire, puis un
 * seul paquet — rien du tout si la saisie ne peut appeler aucun lieu connu.
 * Le lecteur par défaut lit ce site et garde ce qu'il a lu ; un autre lecteur
 * (le banc, les essais) lit sans rien garder.
 */
export async function chargerLieuxConnus(a: Analyse, lire: LecteurJson = lireDuSite): Promise<LieuConnu[]> {
  if (peutRepondre(a) === null) return [];
  const n = paquetPour(a, await chargerSommaire(lire));
  return n === null ? [] : chargerPaquet(n, lire);
}

/** Les lieux connus de cette saisie s'ils sont déjà là — sans attendre ni rien télécharger ; null sinon. */
export function lieuxConnusCharges(a: Analyse): LieuConnu[] | null {
  if (peutRepondre(a) === null) return [];
  if (sommaireLu === null) return null;
  const n = paquetPour(a, sommaireLu);
  return n === null ? [] : paquetsLus.get(n) ?? null;
}

/** Pour les essais : oublie ce qui a été lu. */
export function oublierLieuxConnus(): void {
  sommaireEnCours = null;
  sommaireLu = null;
  paquetsEnCours.clear();
  paquetsLus.clear();
}

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
