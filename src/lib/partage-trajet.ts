// CONTRIBUER UN PARCOURS À INFONOVICE — et voir d'abord ce qu'on donne.
//
// LA DEMANDE, mot pour mot (Armelin, 01/09) : « il faut que ce soit un bouton
// dédié pour améliorer l'algorithme en indiquant aux gens qu'on floute les
// adresses de départ et d'arrivée. D'exposer le fichier à l'utilisateur qui
// pourra vérifier le contenu avant de nous l'envoyer. »
//
// CE QUE J'AI TROUVÉ EN OUVRANT LES DONNÉES, et qui rend la promesse facile à
// tenir : un trajet enregistré NE CONTIENT AUCUNE COORDONNÉE. Les relevés
// portent un temps depuis le départ, une vitesse et une altitude — jamais un
// point. Deux champs seulement peuvent désigner quelqu'un :
//
//   - le TITRE, fabriqué à partir des libellés de départ et d'arrivée
//     (« Le Plessis-Trévise → Paris ») ;
//   - l'INSTANT du départ à la milliseconde, qui suit une personne mieux
//     qu'une adresse quand on en recoupe plusieurs.
//
// Le premier disparaît, le second est arrondi à l'heure. Le reste — durée,
// vitesses, arrêts, profil — est ce qui sert à comparer des itinéraires, et
// ne dit rien de qui a roulé.
//
// RIEN NE PART TOUT SEUL. Cette brique ne fait qu'un fichier ; c'est l'usager
// qui le lit, puis qui l'envoie s'il le veut. Une application qui poste
// d'elle-même n'aurait pas à demander la permission — et c'est justement ce
// qu'on lui reproche ailleurs.

import type { TrajetEnregistre } from './historique-trajets';
import type { ResumeBilan } from './bilan-trajet';
import type { ReleveTrajet } from './historique-trajets';

/** Le format du fichier envoyé — versionné, pour qu'il reste lisible plus tard. */
export interface TrajetPartage {
  version: 1;
  /** Le départ ARRONDI À L'HEURE, en UTC. Jamais la milliseconde. */
  departHeure: string;
  resume: ResumeBilan;
  releves: ReleveTrajet[];
}

/** L'adresse à qui l'envoyer. Écrite ici pour n'exister qu'à un seul endroit. */
export const CONTACT = 'contact@infonovice.fr';

/* CE QU'ON RETIRE ET CE QU'ON GARDE, EN TOUTES LETTRES. Ces deux listes sont
   affichées à l'usager AVANT qu'il n'envoie quoi que ce soit : une promesse de
   floutage qu'on ne peut pas vérifier ne vaut rien, et celle-ci se vérifie en
   lisant le fichier juste en dessous. */
export const CE_QUI_PART: readonly string[] = [
  'la durée du parcours, ses arrêts et leur durée totale',
  'les vitesses moyenne et maximale',
  'un relevé toutes les trente secondes : vitesse et altitude',
  'la date et l’HEURE du départ, arrondie à l’heure pleine',
];

export const CE_QUI_RESTE: readonly string[] = [
  'les adresses de départ et d’arrivée — elles sont RETIRÉES du fichier',
  'le nom que vous avez donné au parcours',
  'l’heure exacte du départ, à la minute près',
  'tout point GPS : un parcours enregistré n’en contient aucun',
];

/**
 * Retire d'un trajet ce qui désigne quelqu'un — PURE.
 *
 * L'ARRONDI EST À L'HEURE INFÉRIEURE, et c'est un choix : à la minute près,
 * deux fichiers d'une même personne se recollent ; à l'heure, ils ne disent
 * plus qu'« un matin ». La date reste, elle : sans elle, on ne pourrait plus
 * comparer un trajet d'août à un trajet de décembre, ce qui est précisément
 * ce à quoi ces relevés servent.
 */
export function flouterTrajet(t: TrajetEnregistre): TrajetPartage {
  const heure = Math.floor(t.departMs / 3600_000) * 3600_000;
  return {
    version: 1,
    departHeure: new Date(heure).toISOString().slice(0, 13) + ':00Z',
    resume: t.resume,
    releves: t.releves,
  };
}

/**
 * Le fichier tel qu'il partira — PURE.
 *
 * INDENTÉ, PARCE QU'IL EST FAIT POUR ÊTRE LU. Un JSON compacté tiendrait sur
 * une ligne illisible, et « exposer le fichier à l'utilisateur » deviendrait
 * une formalité vide.
 */
export function texteDuPartage(trajets: readonly TrajetEnregistre[]): string {
  return `${JSON.stringify({
    /* CE QUE C'EST, ÉCRIT DANS LE FICHIER LUI-MÊME : il peut être relu dans
       six mois, par quelqu'un qui n'a pas cette conversation sous les yeux. */
    quoi: 'Contribution volontaire de parcours — Infonovice Maps',
    adressesRetirees: true,
    trajets: trajets.map(flouterTrajet),
  }, null, 2)}\n`;
}

/** Le nom du fichier proposé au téléchargement — PURE. */
export function nomDuFichier(trajets: readonly TrajetEnregistre[]): string {
  const n = trajets.length;
  return `infonovice-parcours-${n}.json`;
}
