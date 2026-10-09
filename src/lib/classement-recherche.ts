// LE CLASSEMENT DE MAPS PRO, DANS LE CLIENT LIBRE (lot 144, 09/10/2026).
//
// POURQUOI. Mesuré le 08/10 sur 36 saisies publiques du banc du lot 141 : la
// première réponse du client libre était juste 17 fois, celle de Maps Pro 32.
// Deux causes sur trois tenaient au classement : la bonne réponse était là,
// mais en 2e ou 3e position — derrière une SCI, une homonyme à 600 km, une rue
// qui porte le nom du lieu. Maps Pro avait réglé cela dans `requete.ts`
// (port de `Requete.kt`, lots 140 à 142) : ON CLASSE TOUT ENSEMBLE — adresses,
// lieux, monuments — d'après CE QUE LA SAISIE DEMANDE, au lieu de mettre une
// famille de résultats devant l'autre par principe.
//
// CE FICHIER EN EST LA RECOPIE PAR SON AUTEUR (Armelin, décision du 08/10/2026),
// publiée sous AGPL-3.0 : les règles pures et leurs nombres, rien qui appelle un
// serveur, aucune IA, aucune fonction de Maps Pro. Les nombres sont ceux de Pro
// (mesurés là-bas sur 112 saisies) ; deux adaptations au client libre sont
// dites là où elles sont faites.
import { correspond, estType, transportDe, type Transport } from './types-lieu';
import { ecart } from './recherche-multi';

/** Ce que la saisie demande : un lieu quelconque, un transport, un aéroport. */
export type Intention = 'AUCUNE' | 'TRANSPORT' | 'AEROPORT';

export interface Analyse {
  /** Le texte à envoyer à l'index des lieux filtré : sans « RER », « métro », « aéroport »… */
  texteLieu: string;
  intention: Intention;
  natures: ReadonlySet<Transport>;
  /** Les mots qui doivent se retrouver dans un nom (sans accents, sans mots vides ni mots de transport). */
  mots: string[];
  /** La saisie commence par un numéro : c'est une adresse. */
  numero: boolean;
  /** La saisie contient un mot de voie (« rue », « avenue »…) : c'est une adresse. */
  voie: boolean;
}

export const MOTS_VIDES: ReadonlySet<string> = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'l', 'd', 'a', 'au', 'aux', 'et', 'en']);
/** Ce qui fait d'une saisie une ADRESSE, même si elle contient « gare » (« rue de la Gare »). */
export const MOTS_VOIE: ReadonlySet<string> = new Set(['rue', 'avenue', 'av', 'boulevard', 'bd', 'bld', 'chemin', 'allee', 'impasse',
  'place', 'route', 'quai', 'cours', 'square', 'passage', 'voie', 'sentier', 'rond', 'villa', 'cite', 'residence', 'lotissement', 'faubourg',
  'parvis']);
const MOTS_AIR = new Set(['aeroport', 'aeroports', 'aerogare', 'aerodrome']);
const MOTS_FER = new Set(['rer', 'transilien', 'ter', 'tgv', 'sncf', 'train', 'trains', 'halte']);
const MOTS_GARE = new Set(['gare', 'gares']);
const MOTS_METRO = new Set(['metro', 'metros']);
const MOTS_TRAM = new Set(['tram', 'trams', 'tramway', 'tramways']);
const MOTS_BUS = new Set(['bus', 'autocar', 'autocars', 'routiere']);
const MOTS_GENERIQUES = new Set(['station', 'stations', 'arret', 'arrets', 'ligne', 'lignes']);

/** Sans accents, en minuscules, la ponctuation en espaces — PUR. */
export function normaliser(s: string): string {
  return s.replace(/œ|Œ/g, 'oe').replace(/æ|Æ/g, 'ae').normalize('NFD').replace(/\p{Mn}+/gu, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Les mots d'un texte, normalisés — PUR. */
export function mots(s: string): string[] {
  return normaliser(s).split(' ').filter((m) => m.length > 0);
}

/** L'analyse d'une saisie — PURE (Maps Pro, `analyser`, sans les lignes ni les codes d'aéroport). */
export function analyser(texte: string): Analyse {
  const brut = texte.trim();
  const n = mots(brut);
  const numero = /^\d/.test(n[0] ?? '');
  const voie = n.some((m) => MOTS_VOIE.has(m));
  const air = n.some((m) => MOTS_AIR.has(m));
  const fer = n.some((m) => MOTS_FER.has(m));
  const metro = n.some((m) => MOTS_METRO.has(m));
  const tram = n.some((m) => MOTS_TRAM.has(m));
  const bus = n.some((m) => MOTS_BUS.has(m));
  const gare = n.some((m) => MOTS_GARE.has(m));
  const generique = n.some((m) => MOTS_GENERIQUES.has(m));
  const intention: Intention = numero || voie ? 'AUCUNE'
    : air ? 'AEROPORT'
      : fer || metro || tram || bus || gare || generique ? 'TRANSPORT' : 'AUCUNE';
  const natures = new Set<Transport>();
  if (fer || gare) natures.add('GARE');
  if (metro) natures.add('METRO');
  if (tram) natures.add('TRAM');
  if (bus) natures.add('BUS');
  if (intention === 'AEROPORT') { natures.add('AEROPORT'); natures.add('TERMINAL'); }
  let texteLieu = brut;
  if (intention !== 'AUCUNE') {
    const retires = new Set([...MOTS_AIR, ...MOTS_FER, ...MOTS_METRO, ...MOTS_TRAM, ...MOTS_BUS, ...MOTS_GENERIQUES]);
    const gardes = brut.split(/\s+/).filter((orig) => {
      const parts = mots(orig);
      return parts.length > 0 && !parts.every((p) => retires.has(p));
    });
    while (gardes.length > 0 && (() => { const m = mots(gardes[0] ?? ''); return m.length === 1 && MOTS_VIDES.has(m[0] ?? ''); })()) gardes.shift();
    if (gardes.length > 0) gardes[0] = (gardes[0] ?? '').replace(/^[dDlL]['’]/, '');
    texteLieu = gardes.join(' ').trim() || brut;
  }
  /* Un chiffre seul compte (Pro, lot 141) : « Vélizy 2 » n'est pas Vélizy. */
  const motsNom = mots(texteLieu).filter((m) => !MOTS_VIDES.has(m) && !MOTS_GARE.has(m) && !MOTS_AIR.has(m)
    && (m.length >= 2 || /^\d/.test(m)));
  return { texteLieu, intention, natures, mots: motsNom, numero, voie };
}

/** Un chiffre tapé vaut le mot : « Les 4 Temps » est le « Centre Commercial les Quatre Temps ». */
const CHIFFRES: Readonly<Record<string, string>> = { 1: 'un', 2: 'deux', 3: 'trois', 4: 'quatre', 5: 'cinq', 6: 'six', 7: 'sept', 8: 'huit', 9: 'neuf', 10: 'dix' };

/** Le mot est-il dans le nom ? Entier, ou le début d'un mot (quatre lettres) ; un chiffre vaut son mot — PUR. */
export function contient(nom: readonly string[], mot: string): boolean {
  const chiffre = CHIFFRES[mot];
  return nom.some((m) => m === mot || (mot.length >= 4 && m.startsWith(mot))) || (chiffre !== undefined && nom.includes(chiffre));
}

/**
 * Le mot, son singulier (« invalides » → « invalide »), ou le même mot à deux
 * lettres près, est-il dans le nom ? — PUR.
 *
 * LA FAUTE DE FRAPPE EST UNE RÈGLE DU CLIENT LIBRE, PAS DE PRO (RECHERCHE-8) :
 * Armelin, le 03/09 — « Tour Effeil » doit valoir « Tour Eiffel ». `motRepond`
 * la porte depuis ; le classement commun la garde, sans quoi la société
 * « TOUR EFFEIL FM » repassait devant la tour (mesuré sur le banc le 09/10).
 */
function porte(nom: readonly string[], m: string): boolean {
  return contient(nom, m) || (m.length >= 5 && m.endsWith('s') && contient(nom, m.slice(0, -1)))
    || (m.length >= 5 && nom.some((w) => w.length >= 5 && ecart(m, w) <= 2));
}

/** D'où vient une suggestion : savoir cela, c'est pouvoir la contester. */
export type Source = 'ban' | 'ign' | 'entreprise' | 'osm' | 'ecole' | 'administration' | 'notoire' | 'wikidata';

/** Une suggestion, quelle qu'en soit la source, ramenée à ce que le classement lit. */
export interface Candidat {
  lon: number;
  lat: number;
  libelle: string;
  /** « catégorie · commune » pour un lieu ; le code postal et la commune pour une adresse. */
  detail: string;
  genre: 'adresse' | 'lieu';
  source: Source;
  /** La catégorie de la Géoplateforme, le type Wikidata, « Monument historique »… ; '' sinon. */
  categorie: string;
  /** La note de départ : celle du géocodeur, ou celle de la source (Pro : 0,7 monument, 0,6 annuaire, 0,55 carte). */
  score: number;
  /** Le nombre d'articles Wikipédia (Wikidata) : la notoriété. */
  notoriete?: number;
  /** Le type BAN d'une adresse (« municipality », « street »…). */
  typeBan?: string;
  /** Le rang que la fusion des sources réseau lui a donné (0 = premier) — l'ordre mesuré du client libre. */
  rangFusion?: number;
  /** Une clé laissée par l'appelante pour retrouver ce qu'elle a donné (le classement la garde). */
  cle?: number;
}

/** Ce que vaut la notoriété (Pro, `WikidataLieux.bonusNotoriete`) — PUR. */
export function bonusNotoriete(liens: number): number {
  return liens >= 100 ? 0.45 : liens >= 50 ? 0.4 : liens >= 20 ? 0.25 : liens >= 5 ? 0.1 : 0;
}

/** Les sources dont le libellé est un nom d'organisme plutôt qu'un lieu (Pro : la famille « annuaire »). */
const ANNUAIRES: ReadonlySet<Source> = new Set(['entreprise', 'ecole', 'administration']);

const LIAISONS_NOM = new Set(['sur', 'sous', 'les', 'lez', 'en', 'pres', 'devant', 'derriere']);
const EQUIPEMENTS_TRANSPORT = new Set(['parking', 'gare', 'station', 'arret', 'aeroport', 'aerogare', 'port', 'nord', 'sud', 'est', 'ouest']);

/** La commune d'un détail « catégorie · commune » — PUR. */
function communeDu(detail: string): string[] {
  const i = detail.indexOf(' · ');
  return mots(i >= 0 ? detail.slice(i + 3) : detail);
}

/**
 * LA PRIME DU NOM ENTIER — PURE (Pro, `primeNomEntier`, huit points). Un LIEU
 * dont le NOM porte toute la saisie passe devant : 0,3, plus 0,15 / 0,1 / 0,05
 * selon les mots de trop. Une adresse n'y a droit que si son libellé EST la
 * saisie.
 *
 * ADAPTATION AU CLIENT LIBRE : une COMMUNE de la BAN y a droit aussi quand son
 * nom porte toute la saisie (« Vitry » → Vitry-sur-Seine) — chez Pro, l'index
 * des adresses de l'IGN rend la commune sans code postal dans son libellé.
 */
export function primeNomEntier(r: Candidat, a: Analyse): number {
  if (a.mots.length === 0) return 0;
  if (r.genre === 'adresse') {
    if (r.typeBan === 'municipality') {
      const nom = mots(r.libelle).filter((m) => !/^\d{5}$/.test(m));
      return a.mots.every((m) => porte(nom, m)) ? 0.3 : 0;
    }
    const m = mots(r.libelle);
    return m.length === a.mots.length && m.every((x, i) => x === a.mots[i]) ? 0.3 : 0;
  }
  if (ANNUAIRES.has(r.source)) return 0;
  const nom = mots(r.libelle);
  const commune = communeDu(r.detail);
  const attendus = a.mots.filter((m) => !(commune.includes(m) && !porte(nom, m)));
  if (attendus.length === 0 || !attendus.every((m) => porte(nom, m))) return 0;
  if (!attendus.some((m) => !estType(m) && porte(nom, m))) {
    /* La saisie ne dit qu'un type (« pharmacie », « hôpital ») : c'est la catégorie du lieu qui doit répondre. */
    return a.mots.every(estType) && primeType(r, a) > 0 ? 0.3 : 0;
  }
  const surplus = nom.reduce((t, w) => t + (
    w.length < 3 || MOTS_VIDES.has(w) || LIAISONS_NOM.has(w) || a.mots.some((m) => w.startsWith(m) || m.startsWith(w) || CHIFFRES[m] === w) ? 0
      : EQUIPEMENTS_TRANSPORT.has(w) ? 1 : estType(w) ? 0.5 : 1), 0);
  return 0.3 + (surplus === 0 ? 0.15 : surplus <= 0.5 ? 0.1 : surplus <= 1 ? 0.05 : 0);
}

/** LA PRIME DU TYPE — PURE (Pro, `primeType`) : la saisie dit un type, et le lieu est de ce type. */
export function primeType(r: Candidat, a: Analyse): number {
  if (r.genre === 'adresse' || ANNUAIRES.has(r.source)) return 0;
  const categorie = r.categorie || r.detail.split(' · ')[0] || '';
  return a.mots.some((m) => estType(m) && correspond(m, categorie)) ? 0.2 : 0;
}

/** Les repères de la proximité : le centre de la vue, et les communes que la saisie nomme. */
export interface Repere { lon: number; lat: number }

/** La distance entre deux points, en mètres, à plat — PURE (Pro, `ecartM`). */
export function ecartM(a: Repere, b: Repere): number {
  const kx = 111_320 * Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180);
  const dx = (a.lon - b.lon) * kx;
  const dy = (a.lat - b.lat) * 110_540;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Un bonus pour ce qui est près d'un repère — PUR (Pro, `proximite`). */
export function proximite(r: Repere, reperes: readonly Repere[]): number {
  if (reperes.length === 0) return 0;
  const d = Math.min(...reperes.map((p) => ecartM(r, p)));
  return d < 5_000 ? 0.15 : d < 30_000 ? 0.08 : d < 100_000 ? 0.03 : 0;
}

/** La note d'une suggestion pour cette saisie — PURE (Pro, `note`, et la proximité). */
export function note(r: Candidat, a: Analyse, reperes: readonly Repere[] = []): number {
  let s = r.score;
  const nom = r.genre === 'lieu' && r.source !== 'ign' ? mots(`${r.libelle} ${r.detail}`) : mots(r.libelle);
  if (a.mots.length > 0) {
    const presents = a.mots.filter((m) => porte(nom, m)).length;
    s += (0.3 * presents) / a.mots.length;
    if (presents === a.mots.length) s += 0.1;
    s += primeNomEntier(r, a);
    s += primeType(r, a);
  }
  /* LA NOTORIÉTÉ : celle de Wikidata, ou celle qu'un doublon de Wikidata a
     prêtée au même lieu vu par une autre source (`classerCandidats`). */
  s += bonusNotoriete(r.notoriete ?? 0);
  const t = r.genre === 'lieu' ? transportDe(r.categorie) : null;
  /* Une station qui porte le nom d'un lieu : sans mot de transport, c'est le lieu qu'on cherche. */
  if (a.intention === 'AUCUNE' && t) s -= 0.08;
  if (a.intention === 'TRANSPORT') {
    if (t && t !== 'AEROPORT' && t !== 'TERMINAL') {
      s += 0.35;
      if (a.natures.size === 0 || a.natures.has(t)) s += 0.1;
    }
  } else if (a.intention === 'AEROPORT') {
    if (t === 'AEROPORT') s += 0.5;
    else if (t === 'TERMINAL') s += 0.3;
  } else if (a.numero && r.genre === 'adresse') s += 0.3;
  /* ADAPTATION AU CLIENT LIBRE : l'ordre que la fusion des sources réseau a
     mesuré (communes nommées, mots retrouvés jusque dans l'adresse, bruit du
     nom) départage ce que les primes laissent à égalité — 0,06 au premier,
     rien au-delà du dixième. */
  if (r.rangFusion !== undefined) s += Math.max(0, 0.06 - 0.006 * r.rangFusion);
  return s + proximite(r, reperes);
}

/** Deux suggestions désignent-elles le même lieu ? Même nom à 300 m près, ou le même monument vu par deux index. */
function memeLieu(g: Candidat, r: Candidat): boolean {
  if (g.genre === 'adresse' && r.genre === 'adresse') return normaliser(g.libelle) === normaliser(r.libelle);
  const ng = normaliser(g.libelle);
  const nr = normaliser(r.libelle);
  if (ng === nr) return ecartM(g, r) < 300;
  /* « Cathédrale Notre-Dame » (Mérimée) et « cathédrale Notre-Dame de Paris » (Wikidata) : l'un contient l'autre, au même endroit. */
  const connus = (c: Candidat) => c.source === 'notoire' || c.source === 'wikidata' || c.source === 'ign';
  return connus(g) && connus(r) && (ng.includes(nr) || nr.includes(ng)) && ecartM(g, r) < 250;
}

/**
 * TOUTES LES SUGGESTIONS ENSEMBLE, DANS L'ORDRE DE CE QUI EST DEMANDÉ — PURE
 * (Pro, `classer`). Les doublons tombent : on garde le mieux noté, et il prend
 * la commune de l'autre quand il n'en avait pas (« Pont du Gard — Lieu de la
 * carte » d'OpenStreetMap, « Pont du Gard » de Mérimée à Vers-Pont-du-Gard).
 */
export function classerCandidats(
  candidats: readonly Candidat[], a: Analyse, reperes: readonly Repere[] = [], limite = 12,
): Candidat[] {
  /* LA NOTORIÉTÉ SE PRÊTE AU MÊME LIEU (adaptation au client libre) : la
     Géoplateforme connaît « Fourvière » à Lyon ET deux lieux-dits du
     Beaujolais, tous notés 0,855 ; Wikidata sait que celui de Lyon a treize
     articles. Le lieu de l'IGN qui est le même (même nom, à 2 km : un parc,
     un quartier n'ont pas un seul point) les reçoit. */
  const wikidata = candidats.filter((c) => c.source === 'wikidata' && (c.notoriete ?? 0) > 0);
  const prets = candidats.map((c) => {
    if (c.source === 'wikidata' || c.genre !== 'lieu' || wikidata.length === 0) return c;
    const n = normaliser(c.libelle);
    const w = wikidata.find((x) => normaliser(x.libelle) === n && ecartM(x, c) < 2_000);
    return w ? { ...c, notoriete: w.notoriete ?? 0 } : c;
  });
  const notes = prets.map((r) => ({ r, n: note(r, a, reperes) })).sort((x, y) => y.n - x.n);
  const gardes: Candidat[] = [];
  for (const { r } of notes) {
    const i = gardes.findIndex((g) => memeLieu(g, r));
    if (i < 0) { gardes.push(r); continue; }
    const g = gardes[i] as Candidat;
    /* Le gardé sans commune prend celle du doublon : « Lieu de la carte » ne dit rien. */
    if (g.source === 'osm' && /lieu de la carte/i.test(g.detail) && r.detail !== '') gardes[i] = { ...g, detail: r.detail };
  }
  return gardes.slice(0, limite);
}
