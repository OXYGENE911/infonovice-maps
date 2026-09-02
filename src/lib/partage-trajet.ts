// CONTRIBUER UN PARCOURS À INFONOVICE — et voir d'abord ce qu'on donne.
//
// LA DEMANDE, mot pour mot (Armelin, 01/09) : « il faut que ce soit un bouton
// dédié pour améliorer l'algorithme en indiquant aux gens qu'on floute les
// adresses de départ et d'arrivée. D'exposer le fichier à l'utilisateur qui
// pourra vérifier le contenu avant de nous l'envoyer. »
//
// CE QUI PEUT DÉSIGNER QUELQU'UN, ET CE QU'ON EN FAIT :
//
//   - le TITRE, fabriqué à partir des libellés de départ et d'arrivée
//     (« Le Plessis-Trévise → Paris ») — il DISPARAÎT ;
//   - l'INSTANT du départ à la milliseconde, qui suit une personne mieux
//     qu'une adresse quand on en recoupe plusieurs — il est ARRONDI À
//     L'HEURE ;
//   - les EXTRÉMITÉS enregistrées depuis HIST-2 — elles ne partent PAS ;
//   - le TRACÉ, depuis HIST-2 — ses deux BOUTS SONT COUPÉS (voir plus bas).
//
// Le reste — durée, vitesses, arrêts, altitudes — est ce qui sert à comparer
// des itinéraires, et ne dit rien de qui a roulé.
//
// POURQUOI LE TRACÉ PART MAINTENANT, ET AMPUTÉ (HIST-2, 02/09). Armelin :
// « l'historique ne conserve pas le tracé, le dénivelé, la température […]
// donc contribuer à l'algorithme envoie trop peu ». Il a raison sur la
// pauvreté : sans le OÙ, une vitesse ne dit rien — 40 km/h en ville et
// 40 km/h sur une nationale ne racontent pas la même chose.
//
// MAIS UN TRACÉ ENTIER COMMENCE DEVANT UNE PORTE, et cette porte est celle de
// quelqu'un. Le fichier promettait « tout point GPS : un parcours enregistré
// n'en contient aucun » ; garder cette phrase en envoyant le tracé aurait été
// un mensonge écrit noir sur blanc, et ne rien envoyer aurait ignoré une
// demande légitime. On coupe donc les DEUX BOUTS sur 500 mètres : ce qui reste
// est la route, pas le domicile. Un trajet plus court que ces deux amputations
// ne contribue RIEN, et c'est correct — il n'avait rien à apprendre à
// personne.
//
// RIEN NE PART TOUT SEUL. Cette brique ne fait qu'un fichier ; c'est l'usager
// qui le lit, puis qui l'envoie s'il le veut. Une application qui poste
// d'elle-même n'aurait pas à demander la permission — et c'est justement ce
// qu'on lui reproche ailleurs.

import type { TrajetEnregistre } from './historique-trajets';
import type { ResumeBilan } from './bilan-trajet';
import type { ReleveTrajet, ReliefTrajet } from './historique-trajets';
import { distanceM } from './le-long-du-trajet';

/* CINQ CENTS MÈTRES À CHAQUE BOUT. C'est la coupe d'usage pour anonymiser une
   trace GPS, et elle a une raison géométrique : à 500 m d'un point, le nombre
   d'adresses possibles se compte en centaines, même en pavillonnaire. Cent
   mètres n'auraient masqué qu'un numéro de rue. */
export const COUPE_BOUTS_M = 500;

/** Le format du fichier envoyé — versionné, pour qu'il reste lisible plus tard. */
export interface TrajetPartage {
  version: 1;
  /** Le départ ARRONDI À L'HEURE, en UTC. Jamais la milliseconde. */
  departHeure: string;
  resume: ResumeBilan;
  releves: ReleveTrajet[];
  /* LE RELIEF ET LA TEMPÉRATURE (HIST-3, 02/09). NI L'UN NI L'AUTRE NE
     DÉSIGNE QUELQU'UN : un dénivelé décrit une route, et une température à
     l'heure près décrit une journée dans un département. Ce sont, en
     revanche, les deux chiffres qui EXPLIQUENT une consommation — c'est-à-dire
     exactement ce qu'une contribution doit apporter. */
  relief?: ReliefTrajet;
  temperatureC?: number;
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
  'le tracé, PRIVÉ DE SES 500 PREMIERS ET 500 DERNIERS MÈTRES',
  'le dénivelé total du parcours, et d’où il est tiré',
  'la température relevée à l’arrivée',
  'la date et l’HEURE du départ, arrondie à l’heure pleine',
];

export const CE_QUI_RESTE: readonly string[] = [
  'les adresses de départ et d’arrivée — elles sont RETIRÉES du fichier',
  'le nom que vous avez donné au parcours',
  'l’heure exacte du départ, à la minute près',
  'le début et la fin du tracé : les 500 mètres autour de chaque bout sont'
    + ' coupés, pour qu’aucun point ne se trouve devant une porte',
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
    releves: couperLesBouts(t.releves),
    ...(t.relief ? { relief: t.relief } : {}),
    ...(t.temperatureC !== undefined ? { temperatureC: t.temperatureC } : {}),
  };
}

/**
 * Coupe les 500 premiers et 500 derniers mètres du tracé — PURE.
 *
 * LA DISTANCE SE COMPTE LE LONG DU TRACÉ, pas à vol d'oiseau depuis le
 * premier point : un demi-tour au bout de la rue reviendrait sous le seuil et
 * ferait ressortir des points qu'on croyait coupés.
 *
 * LES RELEVÉS SANS POSITION TRAVERSENT INTACTS : ils ne désignent personne, et
 * ce sont eux, seuls, qui composaient les fichiers d'avant HIST-2.
 */
export function couperLesBouts(releves: readonly ReleveTrajet[]): ReleveTrajet[] {
  const situes: number[] = [];
  for (let i = 0; i < releves.length; i += 1) {
    const r = releves[i]!;
    if (typeof r.lon === 'number' && typeof r.lat === 'number') situes.push(i);
  }
  if (situes.length === 0) return [...releves];

  /* L'AVANCEMENT CUMULÉ, INDEX PAR INDEX, une seule fois. */
  const parcouru = new Map<number, number>();
  let total = 0;
  parcouru.set(situes[0]!, 0);
  for (let k = 1; k < situes.length; k += 1) {
    const a = releves[situes[k - 1]!]!;
    const b = releves[situes[k]!]!;
    total += distanceM([a.lon!, a.lat!], [b.lon!, b.lat!]);
    parcouru.set(situes[k]!, total);
  }

  return releves.map((r, i) => {
    const d = parcouru.get(i);
    if (d === undefined) return r;
    /* DANS LES BOUTS : le relevé RESTE — sa vitesse et son altitude
       n'accusent personne — mais il PERD sa position. Le supprimer aurait
       creusé un trou dans la chronologie, et un trou se comble par
       interpolation, donc ne protège rien. */
    if (d < COUPE_BOUTS_M || total - d < COUPE_BOUTS_M) {
      return { tMs: r.tMs, vitesseMs: r.vitesseMs, altitudeM: r.altitudeM };
    }
    return r;
  });
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
