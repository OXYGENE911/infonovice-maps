// LA RECHERCHE DE LA BARRE, SANS LE DOM (lot 144, 09/10/2026).
//
// CE QUI VIVAIT DANS `carte/recherche.ts` (#chercher) VIT ICI, pour une raison
// simple : le banc de mesure (`tests/banc-recherche.test.ts`) doit jouer LE
// MÊME CHEMIN que la barre — une copie dériverait.
//
// CE QUI CHANGE (niveau de recherche de Maps Pro, décision d'Armelin du 08/10) :
//
// 1. LA FIN DE LA « PORTE ». Quand la BAN rendait une rue qui contient les mots
//    tapés, on ne cherchait plus aucun lieu : « Stade de France » donnait
//    l'avenue, « Sorbonne » la rue (mesuré le 08/10). Désormais, une saisie qui
//    ressemble à un nom interroge TOUJOURS l'index des lieux de la Géoplateforme
//    et les lieux connus embarqués — un appel de plus, au même service, et
//    seulement quand la BAN « avait répondu ». La porte reste fermée pour une
//    adresse (un numéro en tête, un mot de voie) et pour une commune tapée
//    telle quelle.
// 2. LE CLASSEMENT COMMUN (`classement-recherche.ts`) : adresses, lieux,
//    monuments, ensemble, d'après ce que la saisie demande.
// 3. LES HOMONYMES LOINTAINES RÉTROGRADÉES : « Saint-Denis » vu de Paris rend
//    Saint-Denis (93) avant Saint-Denis de La Réunion ; « 6 parvis Notre-Dame
//    Paris » rend Paris avant Mayenne.
// 4. LES COORDONNÉES DANS LA BARRE : « 48.8584, 2.2945 » se lit, sans appel.
// 5. LES LIEUX CONNUS EMBARQUÉS : Mérimée, Muséofile, extrait Wikidata.
import {
  chercherAdresses, communeNommee, repondALaSaisie, type ResultatAdresse,
} from './adresse';
import { analyserCoordonnees, formaterCoordonnees } from './coordonnees';
import { dansEmprise, type Emprise } from './couverture';
import { LONGUEUR_MIN_NOM } from './recherche-lieux';
import { chercherPartout, type Resultat as ResultatMulti, type Trouvaille } from './recherche-multi';
import { chercherPoiIgn, type LieuIgn } from './recherche-poi-ign';
import {
  analyser, classerCandidats, normaliser, type Candidat, type Repere,
} from './classement-recherche';
import { chargerLieuxConnus, chercherLieuxConnus, lieuxConnusCharges, type LieuConnu } from './lieux-connus';
import { CATEGORIES_AIR, CATEGORIES_TRANSPORT } from './types-lieu';

/** Où la carte regarde, et jusqu'où. */
export interface VueRecherche {
  lon: number;
  lat: number;
  emprise: Emprise;
}

export interface ReponseRecherche {
  resultats: ResultatAdresse[];
  /** Ce qui se dit sous la barre : rien trouvé, ou une source tombée ; null sinon. */
  note: string | null;
  /** Le chemin pris — pour les essais et le banc. */
  chemin: 'coordonnees' | 'adresses' | 'leger' | 'complet';
}

export interface OptionsRecherche {
  vue: VueRecherche | null;
  signal?: AbortSignal;
  /** Appelé à chaque étape : la liste, déjà classée, à montrer tout de suite. */
  auFil?: (resultats: ResultatAdresse[]) => void;
  /** Les lieux connus : le chargeur du site par défaut ; le banc donne le sien. */
  lieuxConnus?: () => Promise<LieuConnu[]>;
}

/* LE RAYON DE PLAUSIBILITÉ d'une réponse de la BAN : voir `carte/recherche.ts`
   (RECHERCHE-5) — inchangé. */
const SEUIL_LOIN_KM = 50;

function distanceKm(a: Repere, b: Repere): number {
  const dLat = (a.lat - b.lat) * 111.32;
  const dLon = (a.lon - b.lon) * 111.32 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dLat, dLon);
}

/** Ce qui ressemble à une adresse ne va pas chercher un nom : un numéro en tête — PURE. */
export function ressembleAUnNom(texte: string): boolean {
  return !/^\s*\d/.test(texte);
}

/** La suggestion d'un point tapé en coordonnées — PURE ; null si ce n'en est pas. */
export function suggestionCoordonnees(texte: string): ResultatAdresse | null {
  const p = analyserCoordonnees(texte);
  if (p === null) return null;
  return { lon: p.lon, lat: p.lat, libelle: formaterCoordonnees(p), contexte: 'Coordonnées GPS', type: 'coordonnees' };
}

/** Le libellé d'une adresse sans sa commune finale (« Saint-Denis », « Rue X ») — PUR. */
function nomSansCommune(r: ResultatAdresse): string {
  const l = normaliser(r.libelle);
  const c = normaliser(r.contexte);
  return c !== '' && l.endsWith(` ${c}`) ? l.slice(0, -c.length - 1) : l;
}

/**
 * LES HOMONYMES LOINTAINES RÉTROGRADÉES — PURE (lot 144).
 *
 * 1. Une commune que la saisie NOMME passe devant celles qu'elle ne nomme pas :
 *    « 6 parvis Notre-Dame Paris » rendait Mayenne avant Paris (mesuré le 08/10).
 * 2. Entre résultats du même nom, le plus proche de la vue d'abord :
 *    « Saint-Denis », vu de Paris, rendait La Réunion avant la Seine-Saint-Denis.
 * Le reste garde l'ordre de la BAN : elle a mesuré son classement sur bien
 * plus de cas que nous.
 */
export function ordonnerAdresses(
  texte: string, adresses: readonly ResultatAdresse[], vue: Repere | null,
): ResultatAdresse[] {
  const liste = adresses.map((r, i) => ({ r, i, nomme: communeNommee(texte, r.contexte), cle: nomSansCommune(r) }));
  const unNomme = liste.some((x) => x.nomme) && liste.some((x) => !x.nomme)
    && texte.trim().split(/\s+/).length > 1;
  const premier = new Map<string, number>();
  for (const x of liste) if (!premier.has(x.cle)) premier.set(x.cle, x.i);
  const d = (r: ResultatAdresse): number => (vue === null ? 0 : distanceKm(r, vue));
  return [...liste].sort((a, b) => {
    if (unNomme && a.nomme !== b.nomme) return a.nomme ? -1 : 1;
    const ga = premier.get(a.cle) ?? a.i;
    const gb = premier.get(b.cle) ?? b.i;
    if (ga !== gb) return ga - gb;
    return d(a.r) - d(b.r) || a.i - b.i;
  }).map((x) => x.r);
}

/** La commune tapée telle quelle : la BAN a répondu, et rien d'autre n'est demandé — PURE. */
function communeExacte(texte: string, r: ResultatAdresse | undefined): boolean {
  return r !== undefined && r.type === 'municipality' && normaliser(r.libelle) === normaliser(texte);
}

interface Paire { c: Candidat; rendu: ResultatAdresse }

/**
 * La note de départ d'un lieu trouvé sur le réseau — PURE.
 *
 * ADAPTATION AU CLIENT LIBRE. Chez Maps Pro, l'index des lieux de la
 * Géoplateforme reçoit la position de la carte : sa note mêle le texte et la
 * distance, et un lieu-dit homonyme à 400 km y descend tout seul. Le client
 * libre n'envoie pas cette position (contrainte 4 : rien de l'usager ne part
 * sans geste) ; la note de l'IGN ne dit donc que le texte — 0,855 pour TOUS
 * les « Sacré-Cœur » de France. On la ramène entre 0,45 et 0,65 : la
 * proximité et la notoriété, comptées ici, départagent. L'annuaire garde le
 * 0,6 de Pro, la carte (OpenStreetMap) son 0,55.
 */
export function noteDeDepart(source: Trouvaille['source'], scoreGeocodeur: number | undefined): number {
  if (source === 'ign') return 0.45 + 0.2 * (scoreGeocodeur ?? 0.75);
  return source === 'osm' ? 0.55 : 0.6;
}

const deBan = (r: ResultatAdresse): Paire => ({
  c: {
    lon: r.lon, lat: r.lat, libelle: r.libelle, detail: r.contexte, genre: 'adresse', source: 'ban',
    categorie: '', score: r.score ?? 0.5, typeBan: r.type,
  },
  rendu: r,
});

const deTrouvaille = (t: Trouvaille, rang: number): Paire => ({
  c: {
    lon: t.lon, lat: t.lat, libelle: t.libelle, detail: t.contexte, genre: 'lieu', source: t.source,
    categorie: t.categorie ?? '', score: noteDeDepart(t.source, t.score), rangFusion: rang,
  },
  rendu: {
    lon: t.lon, lat: t.lat, libelle: t.libelle, contexte: t.contexte,
    type: t.source === 'entreprise' ? 'etablissement' : 'lieu',
  },
});

const deIgnTransport = (l: LieuIgn): Paire => {
  const contexte = [l.commune, l.codePostal].filter((s) => s !== '').join(' ') || 'Lieu (IGN)';
  return {
    c: {
      lon: l.lon, lat: l.lat, libelle: l.nom, detail: contexte, genre: 'lieu', source: 'ign',
      categorie: l.categorie, score: noteDeDepart('ign', l.score),
    },
    rendu: { lon: l.lon, lat: l.lat, libelle: l.nom, contexte, type: 'lieu' },
  };
};

const deConnu = (c: Candidat): Paire => ({
  c,
  rendu: { lon: c.lon, lat: c.lat, libelle: c.libelle, contexte: c.detail, type: 'lieu' },
});

/**
 * Cherche partout ce qu'il faut, et classe tout ensemble.
 *
 * LES APPELS, ET C'EST LA RÈGLE DU PROJET (« ces quotas sont un bien commun ») :
 *   · des coordonnées : aucun ;
 *   · une adresse ou une commune exacte : la BAN seule, comme avant ;
 *   · un nom auquel la BAN « a répondu » : la BAN, puis l'index des lieux de la
 *     Géoplateforme (un appel de plus) ;
 *   · un nom auquel la BAN n'a pas répondu : les cinq pistes de toujours
 *     (`chercherPartout`) ;
 *   · une saisie de transport (« métro Châtelet ») : en plus, l'index des
 *     lieux filtré sur les gares et stations.
 * Les lieux connus sont des fichiers de ce site : une fois chargés, ils ne
 * coûtent plus rien à personne.
 */
export async function rechercherTout(texte: string, options: OptionsRecherche): Promise<ReponseRecherche> {
  const { vue, signal, auFil } = options;
  const dire = (l: ResultatAdresse[]): void => { if (auFil && signal?.aborted !== true) auFil(l); };

  const coord = suggestionCoordonnees(texte);
  if (coord !== null) {
    dire([coord]);
    return { resultats: [coord], note: null, chemin: 'coordonnees' };
  }

  const repereVue: Repere | null = vue === null ? null : { lon: vue.lon, lat: vue.lat };
  const adresses = ordonnerAdresses(texte, await chercherAdresses(texte, signal), repereVue);
  dire(adresses);

  const meilleur = adresses[0];
  const plausible = meilleur !== undefined
    && (vue === null || dansEmprise(vue.emprise, meilleur)
      || distanceKm(meilleur, vue) <= SEUIL_LOIN_KM || communeNommee(texte, meilleur.contexte));
  const repondu = meilleur !== undefined && plausible && repondALaSaisie(texte, meilleur.libelle);
  const a = analyser(texte);

  if (!ressembleAUnNom(texte) || texte.trim().length < LONGUEUR_MIN_NOM) {
    return { resultats: adresses, note: null, chemin: 'adresses' };
  }
  if (repondu && (a.voie || communeExacte(texte, meilleur))) {
    return { resultats: adresses, note: null, chemin: 'adresses' };
  }

  const centre: Repere | null = plausible && meilleur
    ? { lon: meilleur.lon, lat: meilleur.lat } : repereVue;
  const lieux: Paire[] = [];
  let connus: Paire[] = [];
  let reperes: Repere[] = repereVue === null ? [] : [repereVue];
  /* L'ÉTAT QUE LES SOURCES ÉCRIVENT EN ARRIVANT, dans un objet : une variable
     assignée dans un rappel échappe à l'analyse de flot de TypeScript. */
  const etat: { panne: Error | null; commune: string | null } = { panne: null, commune: null };

  const banPaires = adresses.map(deBan);
  const classer = (): ResultatAdresse[] => {
    const tous = [...lieux, ...connus, ...banPaires];
    /* L'IDENTITÉ PAR LE RANG : le classement peut rendre une copie enrichie
       (la commune d'un doublon), jamais un objet nouveau sans sa clé. */
    const classes = classerCandidats(tous.map((p, i) => ({ ...p.c, cle: i })), a, reperes, 12);
    return classes.flatMap((c) => {
      const p = tous[c.cle ?? -1];
      if (p === undefined) return [];
      /* Le doublon gardé a pu prendre la commune de l'autre : le contexte suit. */
      return [p.rendu.type === 'lieu' && c.detail !== p.rendu.contexte ? { ...p.rendu, contexte: c.detail } : p.rendu];
    });
  };
  const ajouterConnus = (index: LieuConnu[]): void => {
    connus = chercherLieuxConnus(a, index, reperes).map(deConnu);
  };

  const attentes: Promise<void>[] = [];
  /* LES LIEUX CONNUS : tout de suite s'ils sont là, sinon dès qu'ils arrivent. */
  const deja = options.lieuxConnus ? null : lieuxConnusCharges();
  if (deja) ajouterConnus(deja);
  else {
    attentes.push((options.lieuxConnus ?? (() => chargerLieuxConnus()))().then(
      (index) => { ajouterConnus(index); dire(classer()); },
      () => undefined,
    ));
  }
  /* LE FILTRE DES TRANSPORTS (Maps Pro) : « métro Châtelet », « gare du Nord ». */
  if (a.intention !== 'AUCUNE') {
    const categories = a.intention === 'AEROPORT' ? CATEGORIES_AIR : CATEGORIES_TRANSPORT;
    attentes.push(chercherPoiIgn(a.texteLieu, signal, categories).then(
      (r) => { lieux.push(...r.map(deIgnTransport)); dire(classer()); },
      () => undefined,
    ));
  }

  let chemin: ReponseRecherche['chemin'];
  if (repondu) {
    /* LE CHEMIN LÉGER : la BAN a rendu une voie qui porte les mots — on
       demande seulement à l'index des lieux si un LIEU les porte aussi. */
    chemin = 'leger';
    attentes.push(chercherPoiIgn(texte, signal).then(
      (r) => {
        lieux.push(...r.map((l, i) => deTrouvaille({
          lon: l.lon, lat: l.lat, libelle: l.nom, adresse: '', source: 'ign', categorie: l.categorie,
          ...(l.score !== undefined ? { score: l.score } : {}),
          contexte: [l.commune, l.codePostal].filter((s) => s !== '').join(' ') || 'Lieu (IGN)',
        }, i)));
        dire(classer());
      },
      () => undefined,
    ));
  } else {
    chemin = 'complet';
    const poser = (partiel: ResultatMulti): void => {
      lieux.splice(0, lieux.length, ...lieux.filter((p) => p.c.rangFusion === undefined),
        ...partiel.lieux.map(deTrouvaille));
      if (partiel.commune) {
        etat.commune = partiel.commune.nom;
        reperes = [...(repereVue === null ? [] : [repereVue]), { lon: partiel.commune.lon, lat: partiel.commune.lat }];
      }
      dire(classer());
    };
    attentes.push(chercherPartout(texte, {
      centre, ...(signal ? { signal } : {}), auFil: poser,
    }).then((r) => { etat.panne = r.panne; poser(r); }));
  }
  await Promise.all(attentes);
  const resultats = classer();
  const nommes = lieux.length + connus.length;
  let note: string | null = null;
  /* UNE PANNE N'EST PAS UNE ABSENCE (RECHERCHE-3) : sans lieu trouvé, on la dit. */
  if (etat.panne !== null && nommes === 0) note = etat.panne.message;
  else if (resultats.length === 0) {
    note = etat.commune !== null
      ? `Rien trouvé pour « ${texte.trim()} », y compris autour de ${etat.commune}.`
      : `Aucune adresse ni lieu nommé « ${texte.trim()} ».`;
  }
  return { resultats, note, chemin };
}
