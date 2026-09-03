// Favoris — des lieux nommés, en IndexedDB, JAMAIS ailleurs : « vos données
// ne quittent jamais ce navigateur » est le contrat du projet. L'export JSON
// est la portabilité RGPD faite bouton : tout ce que l'application sait de
// vous tient dans un fichier que VOUS téléchargez ; l'import le restaure —
// sur cette machine ou une autre. La validation d'import est PURE et
// défensive : un fichier forgé rend une erreur française, jamais une surprise.
import type { PointGeo } from './coordonnees';
import {
  MAGASIN_FAVORIS, MAGASIN_PREFERENCES,
  entreesMagasin, ecrireDans, supprimerDans, remplacerMagasins,
  lirePreference, ecrirePreference,
} from './stockage';
import {
  versListes, listesAEcrire, normaliserListe, LISTE_PAR_DEFAUT,
  type ListeFavoris,
} from './listes-favoris';

/* LA CLÉ DES LISTES DANS LES PRÉFÉRENCES. Une liste est un RÉGLAGE : un
   magasin de plus imposerait une migration de schéma à tous les usagers pour
   trois objets. */
export const PREF_LISTES = 'listes-favoris';

export class ErreurFavoris extends Error {}
/** L'écriture locale a échoué (quota, navigation privée) — le fichier, lui,
    était bon : l'usager doit lire la bonne cause. */
export class ErreurStockage extends Error {}

export interface Favori extends PointGeo {
  id: string;
  nom: string;
  /** L'adresse d'origine, gardée en sous-titre quand l'usager renomme :
      « Maison de Mamie » n'aide que si l'on peut encore vérifier où c'est. */
  adresse?: string;
  /** Date d'ajout, ISO 8601. */
  cree: string;
  /* LA LISTE À LAQUELLE IL APPARTIENT (FAVORIS-2, 31/08). Absente sur les
     favoris d'avant : ils rejoignent « Lieux favoris » à la lecture, sans
     migration ni réécriture — une base qu'on réécrit est une base qu'on peut
     perdre. */
  liste?: string;
}

export async function listerFavoris(): Promise<Favori[]> {
  const entrees = await entreesMagasin(MAGASIN_FAVORIS);
  return entrees
    .map(([, v]) => v as Favori)
    .filter((f) => f && typeof f.id === 'string')
    .sort((a, b) => (a.cree < b.cree ? 1 : -1));
}

export async function ajouterFavori(
  nom: string, point: PointGeo, liste?: string,
): Promise<Favori> {
  const favori: Favori = {
    id: crypto.randomUUID(),
    nom: nom.trim() || 'Lieu sans nom',
    lon: point.lon,
    lat: point.lat,
    cree: new Date().toISOString(),
    liste: liste ?? LISTE_PAR_DEFAUT,
  };
  await ecrireDans(MAGASIN_FAVORIS, favori.id, favori);
  return favori;
}

export async function retirerFavori(id: string): Promise<void> {
  await supprimerDans(MAGASIN_FAVORIS, id);
}

/**
 * Renomme un favori — la demande d'Armelin du 27/08/2026 : « quand on met un
 * lieu en favoris, c'est son adresse qui s'affiche. Ce serait bien de pouvoir
 * leur donner un displayname plus facile à visualiser. »
 *
 * L'ADRESSE D'ORIGINE NE SE PERD PAS : au premier renommage, l'ancien nom —
 * qui est l'adresse BAN de l'ajout — descend en sous-titre. « Maison de
 * Mamie » sans adresse redeviendrait un point qu'il faut ouvrir pour situer.
 */
export async function renommerFavori(id: string, nom: string): Promise<Favori> {
  const propre = nom.trim();
  if (!propre) throw new ErreurFavoris('Un favori doit garder un nom.');
  const favori = (await listerFavoris()).find((f) => f.id === id);
  if (!favori) throw new ErreurFavoris('Ce favori n’existe plus.');
  const adresse = favori.adresse ?? (favori.nom === propre ? undefined : favori.nom);
  const nouveau: Favori = {
    ...favori, nom: propre, ...(adresse !== undefined ? { adresse } : {}),
  };
  await ecrireDans(MAGASIN_FAVORIS, id, nouveau);
  return nouveau;
}

/* ---- export / import ---- */

/* CE QUE CHAQUE CLÉ CONTIENT, EN FRANÇAIS (EXPORT-1, 02/09).
 *
 * LE TERRAIN. Armelin, premier retour utilisateur : « fonction export : ok, ça
 * télécharge un JSON, mais il contient des repères qui ne sont pas les miens
 * et ne font pas partie des recherches que j'ai faites. »
 *
 * CE QUE J'AI TROUVÉ EN OUVRANT LE FICHIER. Il ne contenait rien d'étranger —
 * mais rien ne DISAIT ce qu'il contenait. L'export vidait le magasin des
 * préférences tel quel : treize clés techniques (`routines-trajets`,
 * `poi-filtres-bornes`, `repere-travail`…) et leurs valeurs brutes. Trois de
 * ces clés portent des POINTS GÉOGRAPHIQUES, et l'une d'elles — les trajets
 * habituels — est remplie par l'application SANS GESTE DE L'USAGER : elle
 * apprend chaque destination calculée, y compris celles d'un lien partagé
 * qu'on a simplement ouvert. De son point de vue, ces repères n'étaient donc
 * pas les siens ; du point de vue du code, ils l'étaient. Les deux avaient
 * raison, et c'est le fichier qui manquait à son devoir.
 *
 * ON NE RETIRE RIEN — ce sont ses données, et un export amputé serait pire
 * qu'un export obscur. ON NOMME. Chaque bloc porte son intitulé, ce qu'il
 * contient, et surtout D'OÙ IL VIENT : saisi à la main, ou appris tout seul.
 */
export const LEGENDES: Readonly<Record<string, { quoi: string; origine: string }>> = {
  'routines-trajets': {
    quoi: 'Vos trajets habituels : une destination, son nom et le nombre de'
      + ' fois où vous y êtes allé, par tranche de la journée.',
    origine: 'APPRIS AUTOMATIQUEMENT à chaque itinéraire calculé, sans geste de'
      + ' votre part. Volet « Mes lieux » → « Tout oublier » les efface.',
  },
  'historique-trajets': {
    quoi: 'Les parcours que vous avez choisi de garder, avec leur tracé GPS.',
    origine: 'Enregistrés UN PAR UN, sur votre demande, à la fin d’un trajet'
      + ' suivi. Volet « Historique » → « Oublier ».',
  },
  'listes-favoris': {
    quoi: 'Les listes dans lesquelles vous rangez vos favoris.',
    origine: 'Créées par vous.',
  },
  'repere-domicile': {
    quoi: 'Votre domicile : coordonnées et adresse.',
    origine: 'Défini par vous, par appui long sur la carte ou depuis le volet.',
  },
  'repere-travail': {
    quoi: 'Votre lieu de travail : coordonnées et adresse.',
    origine: 'Défini par vous, par appui long sur la carte ou depuis le volet.',
  },
  vehicule: {
    quoi: 'Le profil de votre véhicule : batterie, consommations, puissance.',
    origine: 'Saisi par vous, ou pré-rempli depuis le catalogue puis modifiable.',
  },
  fonds: { quoi: 'Le fond de carte choisi et ses surcouches.', origine: 'Vos réglages.' },
  poi: { quoi: 'Les familles de lieux affichées sur la carte.', origine: 'Vos réglages.' },
  'familles-poi': { quoi: 'Les familles de lieux cochées dans le filtre.', origine: 'Vos réglages.' },
  'poi-filtres-bornes': {
    quoi: 'Vos filtres de bornes : réseaux, puissance minimale, prises.',
    origine: 'Vos réglages.',
  },
  'poi-etendue-bornes': { quoi: 'L’étendue de recherche des bornes.', origine: 'Vos réglages.' },
  'reglages-recharge': {
    quoi: 'Vos règles de recharge : réserve, plafond de charge, pauses.',
    origine: 'Vos réglages.',
  },
  'guidage-vocal': { quoi: 'Le guidage vocal, allumé ou éteint.', origine: 'Vos réglages.' },
  'curseur-vehicule': { quoi: 'La forme de votre repère pendant la navigation.', origine: 'Vos réglages.' },
  trafic: { quoi: 'L’affichage des événements routiers.', origine: 'Vos réglages.' },
  theme: { quoi: 'Le thème choisi : auto, jour ou nuit.', origine: 'Vos réglages.' },
  'mode-deplacement': {
    quoi: 'Votre façon de partir : voiture, moto, vélo ou à pied.',
    origine: 'Vos réglages.',
  },
};

/** Ce qu'on dit d'une clé — et l'aveu franc quand on n'en sait rien — PURE. */
export function legendeDe(cle: string): { quoi: string; origine: string } {
  return LEGENDES[cle] ?? {
    quoi: `Réglage « ${cle} ».`,
    /* UNE CLÉ QUE CE FICHIER NE CONNAÎT PAS est une clé ajoutée depuis, et le
       dire vaut mieux que d'inventer une description. */
    origine: 'Réglage de l’application, gardé sur cet appareil.',
  };
}

interface Sauvegarde {
  application: 'infonovice-maps';
  version: 1;
  exporte: string;
  /* CE QUE CE FICHIER EST, écrit DANS le fichier : il peut être ouvert dans
     six mois, par quelqu'un qui n'a pas cette conversation sous les yeux. */
  quoi: string;
  /** Ce que chaque bloc contient et d'où il vient — voir LEGENDES. */
  legendes: Record<string, { quoi: string; origine: string }>;
  preferences: Record<string, unknown>;
  favoris: Favori[];
}

export async function exporterDonnees(): Promise<string> {
  const preferences: Record<string, unknown> = {};
  for (const [cle, valeur] of await entreesMagasin(MAGASIN_PREFERENCES)) {
    preferences[String(cle)] = valeur;
  }
  /* LES LÉGENDES NE DÉCRIVENT QUE CE QUI EST LÀ : lister les quinze clés
     connues alors que le fichier en porte trois donnerait un sommaire plus
     long que le livre. */
  const legendes: Record<string, { quoi: string; origine: string }> = {};
  for (const cle of Object.keys(preferences)) legendes[cle] = legendeDe(cle);

  const sauvegarde: Sauvegarde = {
    application: 'infonovice-maps',
    version: 1,
    exporte: new Date().toISOString(),
    quoi: 'Sauvegarde Infonovice Maps. Tout ce qui suit vient de CET appareil'
      + ' et n’a jamais été envoyé nulle part. La section « legendes » dit ce'
      + ' que contient chaque bloc et d’où il vient — certains sont saisis par'
      + ' vous, d’autres appris par l’application au fil de vos trajets.',
    legendes,
    preferences,
    favoris: await listerFavoris(),
  };
  return JSON.stringify(sauvegarde, null, 2);
}

/** Analyse défensive d'une sauvegarde — PURE, testée à sec. */
export function validerSauvegarde(brut: unknown): { preferences: Record<string, unknown>; favoris: Favori[] } {
  const s = brut as Partial<Sauvegarde> | null;
  if (s?.application !== 'infonovice-maps' || s.version !== 1) {
    throw new ErreurFavoris('Ce fichier n’est pas une sauvegarde Infonovice Maps.');
  }
  const favoris: Favori[] = [];
  for (const f of Array.isArray(s.favoris) ? s.favoris : []) {
    const c = f as Partial<Favori> | null;
    if (typeof c?.id !== 'string' || !c.id || typeof c.nom !== 'string') continue;
    if (typeof c.lon !== 'number' || typeof c.lat !== 'number'
      || Math.abs(c.lon) > 180 || Math.abs(c.lat) > 90) continue;
    favoris.push({
      id: c.id, nom: c.nom, lon: c.lon, lat: c.lat,
      // L'adresse d'origine (renommage) voyage avec l'export : la perdre à
      // l'import ferait d'une restauration une dégradation.
      ...(typeof c.adresse === 'string' && c.adresse ? { adresse: c.adresse } : {}),
      /* LA LISTE VOYAGE AVEC L'EXPORT (FAVORIS-2, 31/08). Sans cette ligne,
         une restauration remettait tous les lieux en vrac dans la liste par
         défaut : une sauvegarde qui perd le rangement n'est pas une
         sauvegarde. Absente du fichier, elle retombe sur la valeur par
         défaut — les exports d'avant restent lisibles. */
      ...(typeof c.liste === 'string' && c.liste ? { liste: c.liste } : {}),
      cree: typeof c.cree === 'string' ? c.cree : new Date(0).toISOString(),
    });
  }
  const preferences = s.preferences && typeof s.preferences === 'object' && !Array.isArray(s.preferences)
    ? s.preferences as Record<string, unknown> : {};
  return { preferences, favoris };
}

/** Importe une sauvegarde : REMPLACE favoris et préférences (le fichier fait
    foi — c'est une restauration, pas une fusion). Rend le nombre de favoris. */
export async function importerDonnees(json: string): Promise<number> {
  let brut: unknown;
  try {
    brut = JSON.parse(json);
  } catch {
    throw new ErreurFavoris('Ce fichier n’est pas un JSON lisible.');
  }
  const { preferences, favoris } = validerSauvegarde(brut);
  try {
    // UNE transaction pour les deux magasins : tout ou rien.
    await remplacerMagasins({
      [MAGASIN_FAVORIS]: favoris.map((f) => [f.id, f]),
      [MAGASIN_PREFERENCES]: Object.entries(preferences),
    });
  } catch (e) {
    throw new ErreurStockage(
      'Le fichier est valide, mais l’enregistrement local a échoué (espace insuffisant ou navigation privée).',
      { cause: e },
    );
  }
  return favoris.length;
}

/**
 * Les listes de favoris, livrées comprises.
 *
 * DÉFENSIVE JUSQU'AU BOUT : un stockage vide, abîmé ou venu d'une version
 * future rend quand même les trois listes livrées — un panneau vide au
 * premier lancement ne dit pas ce que l'application sait faire.
 */
export async function listerListes(): Promise<ListeFavoris[]> {
  try {
    return versListes(await lirePreference<unknown>(PREF_LISTES));
  } catch {
    return versListes(undefined);
  }
}

/**
 * Crée une liste, ou rend celle qui porte déjà ce nom.
 *
 * ON NE CRÉE PAS DE DOUBLON SILENCIEUX : deux listes « Bars » côte à côte ne
 * se distingueraient pas, et l'usager ne saurait plus où il range.
 */
export async function creerListe(brut: {
  nom: string; emoji?: string; couleur?: string;
}): Promise<ListeFavoris> {
  const voulue = normaliserListe(brut);
  if (!voulue) throw new ErreurFavoris('Une liste a besoin d’un nom.');
  const toutes = await listerListes();
  const deja = toutes.find((l) => l.id === voulue.id);
  if (deja) return deja;
  await ecrirePreference(PREF_LISTES, listesAEcrire([...toutes, voulue]));
  return voulue;
}

/**
 * Efface une liste, et REND SES LIEUX à la liste par défaut.
 *
 * PERDRE SES FAVORIS PARCE QU'ON A SUPPRIMÉ UNE CATÉGORIE serait une
 * trahison du contrat : ranger n'est pas jeter. Les listes livrées ne
 * s'effacent pas — elles sont le fond du meuble.
 */
export async function effacerListe(id: string): Promise<void> {
  const toutes = await listerListes();
  const cible = toutes.find((l) => l.id === id);
  if (!cible || cible.livree === true) {
    throw new ErreurFavoris('Cette liste ne peut pas être supprimée.');
  }
  for (const f of await listerFavoris()) {
    if (f.liste === id) await ecrireDans(MAGASIN_FAVORIS, f.id, { ...f, liste: LISTE_PAR_DEFAUT });
  }
  await ecrirePreference(PREF_LISTES, listesAEcrire(toutes.filter((l) => l.id !== id)));
}

/** Range un favori dans une liste. */
export async function rangerFavori(id: string, liste: string): Promise<Favori> {
  const favori = (await listerFavoris()).find((f) => f.id === id);
  if (!favori) throw new ErreurFavoris('Ce favori n’existe plus.');
  const range: Favori = { ...favori, liste };
  await ecrireDans(MAGASIN_FAVORIS, id, range);
  return range;
}
