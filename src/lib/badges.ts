// La matrice « badge × opérateur » — quelle carte d'abonnement ouvre quelle
// borne. Elle répond à la question que BADGE-1 (04/09) ne pouvait pas
// répondre : le jeu IRVE ne porte AUCUN champ de compatibilité e-MSP, mesuré
// le 03/09. L'itinérance AFIREV en était l'approximation ; elle reste en
// place et répond à une autre question (« raccordé à l'itinérance » n'est pas
// « accepté par CE badge »).
//
// PROVENANCE : table Airtable `Badges`, version 1, relevée les 11 et
// 12/09/2026 sur les pages publiques des opérateurs et des émetteurs, décidée
// par le CEO le 12/09/2026. Les sources datées de chaque « oui » vivent dans
// la colonne `Sources` de cette table — pas ici : une URL recopiée dans du
// code vieillit sans que personne ne le voie.
//
// LACUNAIRE, ET C'EST ASSUMÉ. Deux colonnes entières sont inconnues (Shell
// Recharge, Ulys) et la plupart des autres le sont en grande partie. La v2
// qui les remplira est une tâche à part. En attendant, « inconnu » vaut
// « non » pour le filtre (on échoue fermé) et l'interface DIT combien de
// stations elle cache — sans quoi un filtre qui vide la carte passe pour
// cassé.
//
// CE MODULE N'IMPORTE RIEN, ET C'EST VOULU. La clé de rapprochement des
// opérateurs est `cleReseau`, qui vit dans `index-bornes.ts` — lequel dépend
// de `poi.ts`, qui dépend d'ici pour les libellés. L'importer créerait un
// cycle où `cleReseau` s'exécuterait avant l'initialisation de ses propres
// constantes, selon l'ordre que le bundler choisit : une ReferenceError qui
// n'apparaîtrait qu'en production. La clé est donc REÇUE (`indexerMatrice`),
// jamais importée.

/** Les badges proposés au filtre, dans l'ordre d'affichage. */
export type CleBadge =
  | 'chargemap' | 'mobilize' | 'shell' | 'totalenergies' | 'octopus'
  | 'ionity' | 'izivia' | 'freshmile' | 'ulys';

export interface Badge { cle: CleBadge; libelle: string }

export const BADGES: readonly Badge[] = [
  { cle: 'chargemap', libelle: 'Chargemap' },
  { cle: 'mobilize', libelle: 'Mobilize (Renault)' },
  { cle: 'shell', libelle: 'Shell Recharge' },
  { cle: 'totalenergies', libelle: 'TotalEnergies' },
  { cle: 'octopus', libelle: 'Octopus Electroverse' },
  { cle: 'ionity', libelle: 'Ionity (Power / Passport)' },
  { cle: 'izivia', libelle: 'IZIVIA Pass' },
  { cle: 'freshmile', libelle: 'Freshmile' },
  { cle: 'ulys', libelle: 'Ulys (Vinci)' },
] as const;

/**
 * Trois états, et le troisième n'est PAS le second.
 *
 * `inconnu` dit « la matrice ne sait pas », là où `non` dit « l'opérateur
 * refuse ». Le filtre les traite pareil — il masque — mais l'INTERFACE doit
 * les distinguer : « aucun opérateur n'accepte ce badge » est une réponse,
 * « N stations masquées faute d'information » en est une autre, et confondre
 * les deux ferait passer une lacune de notre relevé pour un refus des
 * opérateurs.
 */
export type VerdictBadge = 'oui' | 'non' | 'inconnu';

export interface LigneMatrice {
  /** La graphie EXACTE du champ `nom_operateur` du fichier IRVE. */
  operateur: string;
  verdicts: Readonly<Record<CleBadge, VerdictBadge>>;
}

export class ErreurMatriceBadges extends Error {}

const ORDRE: readonly CleBadge[] = BADGES.map((b) => b.cle);

const CODES: Readonly<Record<string, VerdictBadge>> = {
  o: 'oui', n: 'non', '?': 'inconnu',
};

/* NEUF CARACTÈRES PAR LIGNE, DANS L'ORDRE DE `BADGES`. Trente lignes de neuf
   propriétés nommées auraient fait deux cent soixante-dix lignes qu'on ne
   relit pas — et cette matrice doit pouvoir se COMPARER À L'ŒIL avec la table
   Airtable dont elle sort. La garde de longueur et de vocabulaire ci-dessous
   transforme une faute de frappe en échec au chargement, pas en verdict
   silencieusement faux. */
function ligne(operateur: string, codes: string): LigneMatrice {
  if (codes.length !== ORDRE.length) {
    throw new ErreurMatriceBadges(
      `Matrice badges : « ${operateur} » porte ${codes.length} verdicts`
      + ` au lieu de ${ORDRE.length}.`);
  }
  const verdicts = {} as Record<CleBadge, VerdictBadge>;
  ORDRE.forEach((cle, i) => {
    const v = CODES[codes[i] ?? ''];
    if (v === undefined) {
      throw new ErreurMatriceBadges(
        `Matrice badges : « ${operateur} », verdict « ${codes[i]} » inconnu`
        + ' (attendu o, n ou ?).');
    }
    verdicts[cle] = v;
  });
  return { operateur, verdicts };
}

/**
 * Les trente plus gros opérateurs du fichier IRVE, par nombre de points de
 * charge. Colonnes, dans l'ordre : Chargemap · Mobilize · Shell Recharge ·
 * TotalEnergies · Octopus Electroverse · Ionity · IZIVIA Pass · Freshmile ·
 * Ulys. `o` = oui, `n` = non, `?` = inconnu.
 *
 * LES GRAPHIES SONT CELLES DU FICHIER, doublons compris (« LIDL France » ET
 * « Lidl France », « Electra » ET « ELECTRA ») : elles se rejoignent par
 * `cleReseau` à l'indexation. Les corriger ici ferait perdre la trace de ce
 * qu'on a réellement relevé.
 */
export const MATRICE_BADGES: readonly LigneMatrice[] = [
  ligne('Bouygues Energies & Services', '?????n???'),
  ligne('IZIVIA', 'o???ono??'),
  ligne('Power Dot France', 'o??oon???'),
  ligne('Freshmile | FR*FR1', 'o???onoo?'),
  ligne('TotalEnergies Charging Services', 'o??oono??'),
  ligne('GROUPE INDIGO', '?????no??'),
  ligne('TotalEnergies Marketing France', 'o??oono??'),
  ligne('EASYCHARGE', '????on???'),
  ligne('Allego', 'o??oon???'),
  ligne('LIDL France', 'o???ono??'),
  ligne('Lidl France', 'o???ono??'),
  ligne('Tesla', 'o????n???'),
  ligne('TESLA France SARL', '?????n???'),
  ligne('QOVOLTIS', '????on???'),
  ligne('ENGIE Vianeo', 'o???on???'),
  ligne('Greenflux', '????on???'),
  ligne('DRIVECO', 'o???on???'),
  ligne('SPBR1 | FR*EBN', '?????n???'),
  ligne('Citeos Mobilité Electrique Paris - Cogelum IDF', '?????n???'),
  ligne('DRIVECO Partner Network', '?????n???'),
  ligne('E.Leclerc | FR*LE2', '?????n???'),
  ligne('Load Stations', '????on???'),
  ligne('Electra', 'oo??on???'),
  ligne('Izivia', 'o???ono??'),
  ligne('E-Totem', '????on???'),
  ligne('ELECTRA', 'oo??on???'),
  ligne('E-TOTEM', '????on???'),
  ligne('SPIE CITYNETWORKS', '????on???'),
  ligne('STATIONS-E', '????on???'),
  ligne('SPIE CityNetworks', '????on???'),
];

/**
 * Pourquoi une station est retenue — ou écartée.
 *
 * `non` ne se déduit PAS d'une soustraction entre deux totaux : le panneau
 * doit distinguer « la matrice refuse » de « la matrice ne sait pas », et un
 * écart de compteurs mélangerait ces motifs avec la puissance et les prises.
 */
export type MotifBadges = 'passe' | 'non' | 'inconnu';

export interface MatriceBadges {
  /** Le verdict relevé — `inconnu` si l'opérateur est absent ou sans nom. */
  verdict(nomOperateur: string | null, badge: CleBadge): VerdictBadge;
  /** Le sort d'une station face aux badges cochés. Aucun badge → `passe`. */
  motif(nomOperateur: string | null, badges: readonly CleBadge[]): MotifBadges;
}

/**
 * Indexe la matrice par clé de réseau.
 *
 * `cle` EST REÇUE, pas importée : voir l'en-tête du module. En production
 * c'est `cleReseau` d'`index-bornes.ts`, la même qui sert déjà au filtre par
 * réseau — deux normalisations pour une même question finiraient par diverger.
 */
export function indexerMatrice(
  cle: (nom: string) => string,
  lignes: readonly LigneMatrice[] = MATRICE_BADGES,
): MatriceBadges {
  const parCle = new Map<string, LigneMatrice>();
  for (const l of lignes) {
    const k = cle(l.operateur);
    const deja = parCle.get(k);
    /* LA GARDE DE COLLISION. Cinq paires de graphies s'écrasent aujourd'hui
       sur une même clé en portant le MÊME verdict — vérifié à la rédaction.
       Le jour où la v2 remplira une colonne pour « Electra » sans la remplir
       pour « ELECTRA », le verdict retenu dépendrait de l'ORDRE des lignes.
       Choisir en silence serait le pire des deux : on refuse. */
    if (deja !== undefined) {
      const divergent = ORDRE.filter((b) => deja.verdicts[b] !== l.verdicts[b]);
      if (divergent.length > 0) {
        throw new ErreurMatriceBadges(
          `Matrice badges : « ${deja.operateur} » et « ${l.operateur} » ont la`
          + ` même clé « ${k} » mais divergent sur ${divergent.join(', ')}.`
          + ' Alignez les deux lignes, ou la clé retenue dépendra de leur ordre.');
      }
      continue;
    }
    parCle.set(k, l);
  }

  const verdict = (nom: string | null, badge: CleBadge): VerdictBadge => {
    if (nom === null || nom.trim() === '') return 'inconnu';
    return parCle.get(cle(nom))?.verdicts[badge] ?? 'inconnu';
  };

  return {
    verdict,
    motif(nom, badges) {
      if (badges.length === 0) return 'passe';
      let unInconnu = false;
      for (const b of badges) {
        const v = verdict(nom, b);
        if (v === 'oui') return 'passe';
        if (v === 'inconnu') unInconnu = true;
      }
      /* UN SEUL « INCONNU » SUFFIT À INTERDIRE LA PHRASE « aucun opérateur
         n'accepte ce badge » : l'information manque, elle ne dit pas non. */
      return unInconnu ? 'inconnu' : 'non';
    },
  };
}
