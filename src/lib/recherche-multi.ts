// TOUTES LES SOURCES, EN MÊME TEMPS (RECHERCHE-8, 03/09).
//
// LE MANDAT. Armelin, la nuit du 03/09 : « ton objectif pour cette nuit est de
// faire fonctionner la recherche. Parcours toutes les API libres du
// gouvernement s'il le faut ». Douze requêtes en jeu d'essai, avec fautes et
// mots collés.
//
// CE QUE LA MESURE A DIT (03/09, les douze requêtes contre six sources — voir
// `scripts/mesure-recherche.mjs`, qui se rejoue). AUCUNE source ne les résout
// toutes, et c'est le fait central :
//
//   · l'index `poi` de la Géoplateforme TOLÈRE LES FAUTES et porte les
//     monuments, gares et équipements — « Tour Effeil » → Tour Eiffel — mais
//     ignore les commerces ;
//   · l'annuaire des entreprises porte TOUS les établissements de France avec
//     leur adresse postale — Leroy Merlin Lognes, INRAE Beaucouzé, Fnac Darty
//     Ivry — mais ne tolère pas la faute et ne connaît que le texte ;
//   · OpenStreetMap ne répond qu'à l'ÉGALITÉ, et seulement autour d'un point ;
//   · l'annuaire de l'Éducation nationale accepte un nom partiel d'école ;
//   · la BAN ne connaît que des adresses.
//
// ON LES INTERROGE DONC TOUTES, EN PARALLÈLE, ET L'ON FUSIONNE. Le temps
// d'attente est celui de la plus lente, pas la somme — et une source en panne
// n'emporte pas les autres.
//
// LA CINQUIÈME PISTE N'EST PAS UNE SOURCE, C'EST UNE LECTURE DE LA PHRASE.
// « Castorama Ormesson » ne se résout NULLE PART par le texte : le magasin est
// déclaré au centre commercial Pincevent, 94430 Chennevières-sur-Marne, et le
// mot « Ormesson » n'est nulle part dans sa fiche. Il faut reconnaître
// « Ormesson » comme une COMMUNE, puis chercher « Castorama » AUTOUR d'elle.

import type { PointGeo } from './coordonnees';
import { chercherPoiIgn, type LieuIgn } from './recherche-poi-ign';
import { chercherEntreprises, type Etablissement } from './recherche-entreprises';
import {
  chercherCommune, communeCorrespond, communeLaPlusProche, decoupagesNomCommune,
  nu, separerMotsColles, variantesDecollees, type CommuneReconnue,
} from './saisie-recherche';
import { chercherParNom } from './recherche-lieux';
import type { LieuCategorie } from './categories';
import {
  chercherEtablissements, type Etablissement as Ecole,
} from './annuaire-education';
import { chercherAdministrations, type Administration } from './annuaire-administration';
import { adresseDesTags } from './adresse-lieu';

/** Ce qu'une source rend, une fois ramené à la forme de la liste. */
export interface Trouvaille extends PointGeo {
  libelle: string;
  /** Ce qui s'écrit en petit sous le libellé : la source, le lieu, l'adresse. */
  contexte: string;
  /** L'adresse postale, quand la source la donne — sinon vide. */
  adresse: string;
  /** D'où vient la réponse : savoir cela, c'est pouvoir la contester. */
  source: 'ign' | 'entreprise' | 'osm' | 'ecole' | 'administration';
}

/* L'ORDRE DES SOURCES DANS LA LISTE, et il n'est pas arbitraire.
   L'index de la Géoplateforme passe devant parce qu'il est le seul à tolérer
   la faute de frappe : quand il répond, c'est qu'il a reconnu un lieu NOMMÉ,
   ce qui est très exactement ce qu'on cherchait. Les entreprises suivent —
   elles portent l'adresse. OSM et les écoles ferment la marche : ils ne
   répondent qu'à l'égalité et n'ajoutent qu'au cas par cas. */
const RANG: Record<Trouvaille['source'], number> = {
  ign: 0, entreprise: 1, ecole: 2, administration: 3, osm: 4,
};

/* CE QUI NE PORTE PAS DE SENS DANS UNE RECHERCHE. On ne les compte pas dans
   les mots à retrouver : « Musée du Louvre » se joue sur « musee » et
   « louvre », pas sur « du ». */
const VIDES = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'a', 'au', 'aux',
  'et', 'en', 'sur', 'sous', 'l', 'd', 'siege']);

/** Les mots d'une saisie qui doivent se retrouver dans une réponse — PURE. */
export function motsUtiles(texte: string): string[] {
  return nu(separerMotsColles(texte))
    .replace(/[-'’]/g, ' ')
    .split(/\s+/)
    .filter((m) => m.length >= 2 && !VIDES.has(m));
}

/**
 * La distance d'édition entre deux mots — PURE, bornée.
 *
 * On s'arrête à trois : au-delà, ce ne sont plus deux graphies du même mot, et
 * poursuivre le calcul ne changerait pas la décision.
 */
export function ecart(a: string, b: string): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 3) return 4;
  let ligne = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const suivante = [i];
    for (let j = 1; j <= b.length; j += 1) {
      suivante[j] = Math.min(
        (ligne[j] ?? 0) + 1,
        (suivante[j - 1] ?? 0) + 1,
        (ligne[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    ligne = suivante;
  }
  return Math.min(ligne[b.length] ?? 4, 4);
}

/**
 * Ce mot-ci répond-il à ce mot-là ? — PURE.
 *
 * TROIS FAÇONS DE RÉPONDRE, et chacune vient d'une demande d'Armelin :
 *   1. le mot est là, entier ;
 *   2. le mot est un DÉBUT — « je ne veux pas avoir à écrire les mots exacts
 *      […] même si les mots sont incomplets ». « Castor » ouvre
 *      « Castorama », « Disney » ouvre « Disneyland » ;
 *   3. le mot est à une ou deux lettres près — « Tour Effeil » doit valoir
 *      « Tour Eiffel », et c'est la requête qu'il a écrite lui-même.
 *
 * LES SEUILS SONT DES GARDE-FOUS. Un préfixe de trois lettres ferait de « par »
 * une réponse à « Paris », « Parking » et « Parc » ; une distance de deux sur
 * un mot court ferait de « rue » une réponse à « lac ».
 */
export function motRepond(cherche: string, candidat: string): boolean {
  if (candidat === cherche) return true;
  if (cherche.length >= 4 && candidat.startsWith(cherche)) return true;
  if (cherche.length >= 5 && candidat.length >= 5) return ecart(cherche, candidat) <= 2;
  return false;
}

/**
 * Combien des mots cherchés cette réponse porte-t-elle ? — PURE.
 *
 * ON REGARDE AUSSI L'ADRESSE, et c'est ce qui décide pour « Carrefour
 * Pincevent » : l'hypermarché ne s'appelle pas « Carrefour Pincevent », il
 * s'appelle « CARREFOUR HYPERMARCHES » et il est au CENTRE COMMERCIAL
 * PINCEVENT. Le mot que l'usager a écrit est dans l'ADRESSE, pas dans le nom —
 * et c'est pourtant bien ce magasin-là qu'il désigne.
 */
export function motsPortes(t: Trouvaille, mots: string[]): number {
  const foin = nu(`${t.libelle} ${t.contexte} ${t.adresse}`)
    .replace(/[-'’]/g, ' ').split(/\s+/).filter((m) => m !== '');
  return mots.filter((m) => foin.some((f) => motRepond(m, f))).length;
}

/** Une clé qui reconnaît deux fois le même lieu — PURE. */
export function cleTrouvaille(t: Trouvaille): string {
  return `${t.libelle.toLowerCase().replace(/\s+/g, ' ')}`
    + `|${t.lon.toFixed(3)},${t.lat.toFixed(3)}`;
}

/**
 * Deux réponses désignent-elles le MÊME lieu ? — PURE. Même nom, à trois
 * cents mètres près.
 *
 * LA CLÉ ARRONDIE NE SUFFISAIT PAS (RECHERCHE-10, 04/09). `cleTrouvaille`
 * arrondit au millième de degré : deux objets OSM d'un même lieu — le nœud du
 * magasin et son bâtiment, le lycée et son entrée — tombent de part et d'autre
 * de la frontière d'arrondi une fois sur deux, et la liste les montre deux
 * fois. Deux lignes identiques ne proposent rien de plus qu'une ; elles font
 * douter des deux. Trois cents mètres, pas plus : deux tabacs du même nom à
 * cinq cents mètres sont deux tabacs.
 */
export function memeLieu(a: Trouvaille, b: Trouvaille): boolean {
  const nom = (s: string): string => nu(s).replace(/\s+/g, ' ').trim();
  return nom(a.libelle) === nom(b.libelle)
    && Math.abs(a.lon - b.lon) < 0.004 && Math.abs(a.lat - b.lat) < 0.003;
}

/** Les mots d'un texte, nus : sans accent, sans ponctuation, sans les vides — PURE. */
function decouper(texte: string): string[] {
  return nu(texte).replace(/[^\p{L}\p{N}]+/gu, ' ').split(' ')
    .filter((m) => m.length >= 2 && !VIDES.has(m));
}

/**
 * Les mots du LIBELLÉ que l'usager n'a pas écrits — PURE.
 *
 * C'EST CE QUI SÉPARE LE MONUMENT DE LA SOCIÉTÉ QUI PORTE SON NOM
 * (RECHERCHE-10, 04/09). Mesuré sur le banc des douze requêtes en v1.91 :
 * « Tour Effeil » rendait « SCI 43 CLER TOUR EFFEIL » DEVANT la Tour Eiffel,
 * « Gare Saint Lazare » une société d'aménagement devant la gare, « Stade de
 * France » trois « SOC RESTAURANTS DU STADE FRANC » devant le stade. Les deux
 * portent tous les mots cherchés ; seule la distance au repère les
 * départageait — et depuis la vue France, à trois cents kilomètres des deux,
 * c'est un tirage au sort. « Tour Eiffel » ne porte RIEN de plus que ce qu'on
 * a écrit ; « SCI 43 CLER TOUR EFFEIL » porte trois mots de plus. Ce surplus
 * est le bruit.
 */
export function bruit(t: Trouvaille, mots: string[]): number {
  if (mots.length === 0) return 0;
  return decouper(t.libelle).filter((f) => !mots.some((m) => motRepond(m, f))).length;
}

/**
 * La distance en PALIERS, pas au mètre — PURE. Reçoit le carré de la
 * distance en degrés (celui du tri) ; rend 0 en deçà de ~5 km, puis 1, 2, 3,
 * et 4 au-delà de ~500 km.
 *
 * POURQUOI DES PALIERS. Le bruit ne peut pas passer AVANT la distance :
 * depuis Lyon, « gare lyon » doit rendre la Part-Dieu (deux mots de bruit, à
 * 2 km) avant la gare de Lyon de Paris (aucun bruit, à 400 km) — et
 * l'« Aéroport » de Saint-Pierre-et-Miquelon (RECHERCHE-9) ne doit pas
 * revenir devant Orly. Il ne peut pas non plus passer APRÈS : depuis
 * Paris 16e, « Stade de France » rendrait le restaurant du Parc des Princes
 * (1 km) devant le stade (12 km). On ADDITIONNE donc un palier de distance et
 * le bruit : au même ordre de grandeur d'éloignement, le nom exact gagne ; à
 * un ordre de grandeur d'écart, le proche gagne.
 */
export function palierDistance(d2: number): number {
  const d = Math.sqrt(d2);
  return [0.05, 0.3, 1, 5].filter((seuil) => d >= seuil).length;
}

/**
 * Fusionne les réponses des sources — PURE.
 *
 * DEUX SOURCES RENDENT SOUVENT LE MÊME LIEU : la Géoplateforme et l'annuaire
 * connaissent tous deux le collège Albert-Camus du Plessis-Trévise. Une liste
 * qui le montre deux fois fait douter de la seconde ligne.
 */
export function fusionner(
  trouvailles: Trouvaille[], mots: string[] = [], plafond = 10,
  repere: PointGeo | PointGeo[] | null = null,
  /* TOUT CE QUI A ÉTÉ ÉCRIT, commune comprise. Les mots CHERCHÉS excluent la
     commune (elle situe, elle ne nomme pas) ; mais dans le libellé « Mairie -
     Le Plessis-Trévise », « Plessis » et « Trévise » ne sont pas du bruit :
     l'usager les a tapés. Mesuré le 04/09 : sans cette liste, la mairie de
     Chennevières (« Mairie », bruit zéro) passait devant celle du Plessis. */
  ecrits: string[] = mots,
): Trouvaille[] {
  /* À MOTS ÉGAUX, LE PLUS PROCHE D'ABORD (RECHERCHE-9, 04/09). Armelin :
     « quand on tape "aéroport", les premiers lieux affichés sont à plus de
     5000 km de ma position ». Vrai, et vérifié : l'« Aéroport » de
     Saint-Pierre-et-Miquelon (4285 km — la France est grande) sortait avant
     Orly (16 km), parce que le tri ne connaissait que les mots et la source.
     Une distance approchée en degrés suffit : on ORDONNE, on ne mesure pas.

     PLUSIEURS REPÈRES À LA FOIS (RECHERCHE-10) : quand la phrase nomme une
     commune, le proche se mesure DEPUIS ELLE — depuis toutes ses homonymes,
     au plus près — et non depuis la vue. Mesuré en v1.91 : « Castorama
     Ormesson » rendait les Castorama de Vitry et d'Antony devant celui de
     Chennevières, parce que les deux premiers sont plus près du centre de la
     France. L'usager avait écrit « Ormesson » ; la liste l'ignorait. */
  const reperes = repere === null ? [] : [repere].flat();
  const d2 = (t: Trouvaille): number => reperes.length === 0 ? 0
    : Math.min(...reperes.map((r) => (t.lon - r.lon) ** 2 + (t.lat - r.lat) ** 2));
  /* La note de chaque réponse, calculée UNE fois : les mots portés, la peine
     (palier de distance + bruit du nom), le carré de la distance. */
  const notes = new Map<Trouvaille, [number, number, number]>();
  const noter = (t: Trouvaille): [number, number, number] => {
    let n = notes.get(t);
    if (n === undefined) {
      const dd = d2(t);
      /* CE QUI PORTE TOUTE LA PHRASE, commune comprise, passe devant ce qui
         n'en porte qu'une partie. Mesuré le 04/09 : « Mont Saint Michel »
         fait reconnaître « Saint-Michel » comme commune, ne laisse que
         « Mont » à chercher, et un lieu-dit « Mont » des Pyrénées valait
         alors autant que ce qui s'appelle Mont-Saint-Michel. Un point de
         plus, pas davantage : la commune seule (« Ormesson », « Beaucouzé »)
         ne porte pas la phrase entière et reste où elle est. */
      const toute = ecrits.length > mots.length && motsPortes(t, ecrits) === ecrits.length ? 1 : 0;
      n = [motsPortes(t, mots) + toute, palierDistance(dd) + Math.min(bruit(t, ecrits), 3), dd];
      notes.set(t, n);
    }
    return n;
  };
  const gardees: Trouvaille[] = [];
  return [...trouvailles]
    /* CE QU'ON A ÉCRIT PASSE DEVANT CE QU'ON N'A PAS ÉCRIT.
       LE DÉFAUT QUE CE TRI FERME, mesuré le 03/09 : « INRAE BEAUCOUZE » rendait
       l'INRAE en SIXIÈME position, derrière « Beaucouzé », « Beaucouzé » encore
       et « Eglise, Beaucouzé » — l'index des lieux répondait sur la COMMUNE, ce
       qui est juste et ne sert à rien. On classe donc d'abord par le nombre de
       mots CHERCHÉS que la réponse porte ; puis par la peine — le nom exact
       du voisinage avant le nom qui contient les mots (RECHERCHE-10) ; puis
       par la distance fine ; la source ne départageant qu'à égalité. */
    .sort((a, b) => {
      const na = noter(a);
      const nb = noter(b);
      return nb[0] - na[0] || na[1] - nb[1] || na[2] - nb[2]
        || RANG[a.source] - RANG[b.source];
    })
    .filter((t) => {
      if (gardees.some((g) => memeLieu(g, t))) return false;
      gardees.push(t);
      return true;
    })
    .slice(0, plafond);
}

const deIgn = (l: LieuIgn): Trouvaille => ({
  lon: l.lon, lat: l.lat, libelle: l.nom, adresse: '',
  contexte: [l.commune, l.codePostal].filter((s) => s !== '').join(' ') || 'Lieu (IGN)',
  source: 'ign',
});

const deEntreprise = (e: Etablissement): Trouvaille => ({
  lon: e.lon, lat: e.lat, libelle: e.nom, adresse: e.adresse,
  /* L'ADRESSE EST LE CONTEXTE, et c'est le second retour d'Armelin de cette
     nuit : « aucune information sur l'adresse du lieu au format texte ». */
  contexte: e.adresse || [e.commune, e.codePostal].filter((s) => s !== '').join(' '),
  source: 'entreprise',
});

const deEcole = (e: Ecole): Trouvaille => ({
  lon: e.lon, lat: e.lat, libelle: e.nom, adresse: '',
  contexte: [e.type, e.commune].filter(Boolean).join(' · ') || 'Éducation nationale',
  source: 'ecole',
});

/* L'ANNUAIRE DE L'ADMINISTRATION (RECHERCHE-7, 04/09) : mairies,
   préfectures, centres publics — la source qui porte « INRAE Beaucouzé »
   quand aucune autre ne le connaît. */
const deAdministration = (a: Administration): Trouvaille => ({
  lon: a.lon, lat: a.lat, libelle: a.nom, adresse: '',
  contexte: [a.codePostal, a.commune].filter(Boolean).join(' ') || 'Service public',
  source: 'administration',
});

const deOsm = (l: LieuCategorie): Trouvaille => {
  /* L'ADRESSE QUAND OSM LA PORTE (ADRESSE-POI-1, réutilisée en RECHERCHE-10) :
     « Lieu de la carte » ne disait rien, et c'est le retour d'Armelin —
     « aucune information sur l'adresse du lieu ». À défaut d'une adresse
     entière, la commune ; à défaut de tout, l'aveu. */
  const adresse = adresseDesTags(l.tags) ?? '';
  return {
    lon: l.lon, lat: l.lat, libelle: l.nom ?? '', adresse,
    contexte: adresse || l.tags?.['addr:city'] || 'Lieu de la carte', source: 'osm',
  };
};

/** Ce qu'on rend à l'appelante : les lieux, et l'aveu d'une source tombée. */
export interface Resultat {
  lieux: Trouvaille[];
  /** La première panne rencontrée, s'il y en a eu une. */
  panne: Error | null;
  /** La commune reconnue dans la phrase, quand il y en avait une. */
  commune: CommuneReconnue | null;
}

/**
 * Cherche partout à la fois.
 *
 * `centre` SITUE les sources qui ne savent chercher qu'autour d'un point
 * (OpenStreetMap, les écoles). Les deux autres cherchent dans toute la France
 * et n'en ont pas besoin — c'est d'ailleurs pourquoi elles changent tout : on
 * peut enfin chercher un lieu qu'on n'a pas déjà sous les yeux.
 */
export async function chercherPartout(
  texte: string,
  options: {
    centre: PointGeo | null;
    signal?: AbortSignal;
    /** Appelé chaque fois qu'une source répond — voir plus bas. */
    auFil?: (partiel: Resultat) => void;
  },
): Promise<Resultat> {
  const { centre, signal, auFil } = options;
  /* LES MOTS COLLÉS SE SÉPARENT AVANT TOUT : « FnacDarty » ne rend rien nulle
     part, « Fnac Darty » rend le siège d'Ivry. */
  let q = separerMotsColles(texte).trim();
  /* LE DÉCOLLAGE AU DICTIONNAIRE (RECHERCHE-9) : « FNACDARTY » n'a aucun
     point de coupe lexical — tout-majuscules — mais commence par une enseigne
     connue. La variante décollée REMPLACE la saisie pour les sources qui ne
     tolèrent rien : chercher « FNACDARTY » ne rendra jamais rien. */
  const decollee = variantesDecollees(q);
  if (decollee.length > 0) q = decollee[0] as string;

  const paris: Promise<Trouvaille[]>[] = [
    chercherPoiIgn(q, signal).then((r) => r.map(deIgn)),
    chercherEntreprises(q, signal ? { signal } : {})
      .then((r: Etablissement[]) => r.map(deEntreprise)),
  ];
  if (centre !== null) {
    paris.push(chercherEtablissements(q, centre, signal).then((r) => r.map(deEcole)));
  }
  /* L'ANNUAIRE DE L'ADMINISTRATION, EN NATIONAL : « mairie du plessis
     trevise » y vit dans le NOM même de la fiche — mesuré. Le second appel,
     borné à la commune reconnue, part dans la piste « autour » comme celui
     des entreprises. */
  paris.push(chercherAdministrations(q, null, signal).then((r) => r.map(deAdministration)));
  /* LA PISTE « ENSEIGNE + COMMUNE », qui est la seule à résoudre « Castorama
     Ormesson ». Elle rend AUSSI la commune reconnue, et c'est pour cela
     qu'elle est à part : cette réponse-là appartient à CET appel.

     PAS DE VARIABLE DE MODULE POUR LA PORTER. L'autocomplétion est débattue à
     300 ms et les recherches se chevauchent : une commune rangée dans le
     module serait celle d'une autre frappe.

     UN SEUL APPEL À OVERPASS, ET C'EST UNE RÈGLE DU PROJET : « ne JAMAIS
     marteler les API publiques […] ces quotas sont un bien commun ». On
     reconnaît donc la commune AVANT d'interroger Overpass — cent millisecondes
     de plus à la BAN — plutôt que de lancer une recherche autour de la vue ET
     une autre autour de la commune. Attrapé par un parcours qui comptait les
     appels : il en voyait deux là où il n'en attendait qu'un. */
  const autour = chercherAutourDeLaCommune(q, centre, signal);

  /* ON REND AU FIL DE L'EAU, ET C'EST UNE NÉCESSITÉ MESURÉE (03/09).
     Les sources ne vont pas à la même vitesse : l'index de la Géoplateforme
     répond en 30 ms, l'annuaire des entreprises en 150, et la piste
     « enseigne + commune » — qui passe par la BAN puis par Overpass — met
     jusqu'à DIX SECONDES sur « Castorama Ormesson ». Attendre la plus lente
     pour montrer la plus rapide ferait une barre de recherche qui reste vide
     dix secondes : autant dire cassée.
     Chaque source qui répond redonne donc la liste, complétée. */
  const lieux: Trouvaille[] = [];
  let panne: Error | null = null;
  let commune: CommuneReconnue | null = null;
  let communes: CommuneReconnue[] = [];

  const dire = (): void => {
    /* UNE RECHERCHE ABANDONNÉE NE PARLE PLUS : sans ce garde, la frappe
       précédente écraserait la suivante en arrivant après elle. */
    if (auFil === undefined || signal?.aborted === true) return;
    auFil(rendre());
  };
  /* LES REPÈRES DU CLASSEMENT : la commune écrite quand il y en a une (toutes
     ses homonymes) ET la vue (RECHERCHE-10). La vue reste, et c'est un
     garde-fou mesuré : « Mont Saint Michel » fait reconnaître « Saint-Michel »
     (Aisne) comme commune — un repère faux, à 300 km du Mont. Le plus proche
     de l'un OU de l'autre gagne ; un repère faux ne peut pas éloigner ce qui
     est près de l'usager. */
  const rendre = (): Resultat => ({
    lieux: fusionner(
      lieux, motsCherches(q, commune), 10,
      [...communes, ...(centre === null ? [] : [centre])], motsUtiles(q),
    ),
    panne, commune,
  });

  const attentes = paris.map((p) => p.then(
    (r) => { lieux.push(...r); dire(); },
    (e: Error) => { if (panne === null) panne = e; },
  ));
  attentes.push(autour.then(
    (r) => { lieux.push(...r.lieux); commune = r.commune; communes = r.communes; dire(); },
    /* CETTE PANNE-LÀ COMPTE AUTANT QUE LES AUTRES, et je l'avais d'abord
       avalée en silence. C'est par cette piste que passe désormais Overpass,
       et « un service qui expire ne dit pas CE LIEU N'EXISTE PAS » est une
       promesse de ce projet depuis RECHERCHE-3 : la taire ferait conclure à
       l'absence d'un lieu qu'on n'a simplement pas eu le temps de chercher.
       Rattrapé par le parcours qui garde cette promesse. */
    (e: Error) => { if (panne === null) panne = e; },
  ));
  await Promise.all(attentes);
  return rendre();
}

/**
 * Les mots qu'une réponse doit porter — PURE.
 *
 * LA COMMUNE N'EN FAIT PAS PARTIE : qui écrit « INRAE Beaucouzé » cherche
 * l'INRAE, et Beaucouzé n'est que l'indication de lieu. La faire peser dans le
 * classement remonterait la commune elle-même — ce que l'usager a déjà sous
 * les yeux, et qui l'avait relégué en sixième position avant ce tri.
 */
export function motsCherches(q: string, commune: CommuneReconnue | null): string[] {
  const tous = motsUtiles(q);
  if (commune === null) return tous;
  const ceuxDeLaCommune = motsUtiles(commune.nom);
  const restants = tous.filter((m) => !ceuxDeLaCommune.includes(m));
  /* SI LA COMMUNE MANGEAIT TOUTE LA PHRASE, on retombe sur la saisie entière :
     mieux vaut classer sur trop de mots que sur aucun. */
  return restants.length > 0 ? restants : tous;
}

/**
 * La piste « enseigne + commune ».
 *
 * ON N'ESSAIE QUE LE PREMIER DÉCOUPAGE QUI DONNE UNE COMMUNE, et l'on
 * s'arrête là : essayer les quatre ferait quatre requêtes à la BAN pour une
 * frappe, et l'autocomplétion en fait déjà une par saisie. « Ces quotas sont
 * un bien commun. »
 */
async function chercherAutourDeLaCommune(
  q: string, centre: PointGeo | null, signal?: AbortSignal,
): Promise<{ lieux: Trouvaille[]; commune: CommuneReconnue | null; communes: CommuneReconnue[] }> {
  const reconnue = await reconnaitreLaCommune(q, centre, signal);
  /* SANS COMMUNE RECONNUE, OVERPASS CHERCHE AUTOUR DE LA VUE, avec la phrase
     entière — c'est le comportement d'avant RECHERCHE-8, et il vaut toujours
     pour « Castorama » tapé quand on est déjà devant. */
  if (reconnue === null) {
    if (centre === null) return { lieux: [], commune: null, communes: [] };
    const lieux = await chercherParNom(q, centre, signal);
    return {
      lieux: lieux.filter((l) => l.nom !== null).map(deOsm),
      commune: null, communes: [],
    };
  }
  const { nom, trouvee, toutes } = reconnue;
  {
    /* DEUX FAÇONS DE CHERCHER AUTOUR D'ELLE, et les deux servent :
       l'annuaire par CODE POSTAL quand l'établissement y est déclaré, et
       OpenStreetMap par ÉGALITÉ DE MARQUE dans un rayon — c'est lui qui
       rattrape le Castorama déclaré dans la commune d'à côté. */
    const [parCp, parCarte, parAdmin] = await Promise.allSettled([
      chercherEntreprises(nom, signal
        ? { codePostal: trouvee.codePostal, signal }
        : { codePostal: trouvee.codePostal }),
      /* TOUTES LES COMMUNES HOMONYMES, EN UN SEUL APPEL (RECHERCHE-8b).
         « Ormesson » en désigne deux, et depuis la vue France par défaut c'est
         la mauvaise qui gagnait au « plus proche ». Overpass accepte une union
         de clauses `around:` : on cesse de parier. */
      chercherParNom(nom, toutes.map((c) => ({ lon: c.lon, lat: c.lat })), signal),
      /* LA MÊME COMMUNE SERT L'ADMINISTRATION : search(nom) AND
         search(adresse, commune) — c'est la requête qui trouve le centre
         INRAE d'Angers quand on écrit « Beaucouzé » (mesuré le 04/09). */
      chercherAdministrations(nom, trouvee.nom, signal),
    ]);
    const sortie: Trouvaille[] = [];
    if (parCp.status === 'fulfilled') sortie.push(...parCp.value.map(deEntreprise));
    if (parAdmin.status === 'fulfilled') sortie.push(...parAdmin.value.map(deAdministration));
    if (parCarte.status === 'fulfilled') {
      sortie.push(...parCarte.value.filter((l) => l.nom !== null).map(deOsm));
    }
    /* TOUTES LES HOMONYMES REPARTENT AVEC LA RÉPONSE : ce sont elles, et non
       la vue, qui mesurent « le plus proche » dans le classement. */
    return { lieux: sortie, commune: trouvee, communes: toutes };
  }
}

/**
 * Cherche dans la phrase une commune que la BAN reconnaisse vraiment.
 *
 * ON S'ARRÊTE AU PREMIER DÉCOUPAGE QUI DONNE UNE COMMUNE : essayer les quatre
 * ferait quatre requêtes à la BAN pour une frappe, et l'autocomplétion en fait
 * déjà une par saisie.
 */
async function reconnaitreLaCommune(
  q: string, centre: PointGeo | null, signal?: AbortSignal,
): Promise<{ nom: string; trouvee: CommuneReconnue; toutes: CommuneReconnue[] } | null> {
  for (const { nom, commune } of decoupagesNomCommune(q)) {
    const candidates = (await chercherCommune(commune, signal))
      /* LA BAN REND CE QU'ELLE PEUT, y compris « Tremblay-en-France » pour
         « France ». On ne garde que les communes que ces mots-là OUVRENT. */
      .filter((c) => communeCorrespond(commune, c.nom));
    const trouvee = communeLaPlusProche(candidates, centre);
    /* LA PLUS PROCHE SERT ENCORE À DEUX CHOSES : dire à l'usager où l'on a
       cherché, et filtrer l'annuaire des entreprises par code postal — ce
       filtre ne prend qu'une valeur. Mais elle ne décide plus SEULE de la
       recherche géographique. */
    if (trouvee !== null) return { nom, trouvee, toutes: candidates };
  }
  return null;
}
