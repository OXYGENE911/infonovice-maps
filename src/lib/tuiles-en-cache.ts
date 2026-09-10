// LE CACHE DES TUILES IGN — UNE RÉSERVE PAR COUCHE.
//
// Cette table est lue par vite.config.ts, qui en tire les routes du service
// worker. Elle vit ici, dans src/, pour une raison précise : les tests
// unitaires vérifient que chaque motif reconnaît VRAIMENT l'URL que
// `urlTuiles()` fabrique pour sa couche, et elle seule. Sans ce garde-fou, un
// changement du gabarit WMTS désactiverait le cache en silence — le service
// worker s'installerait, aucune tuile n'entrerait, et le mode hors ligne
// montrerait une carte vide sans qu'aucune erreur ne remonte nulle part.
//
// POURQUOI PAS UN SEUL CACHE POUR TOUT /wmts. C'est ce que faisait la
// première écriture de la PR #17 : un plafond unique de 800 tuiles, commun
// aux quatre couches, avec éviction du plus ancien. Mesuré : après un passage
// en satellite puis un coup d'œil au cadastre, il ne restait PLUS UNE SEULE
// tuile du plan — alors que le bandeau hors ligne promet justement que « la
// carte déjà consultée » reste accessible. Chaque couche a donc sa réserve,
// et ce qu'on a regardé en plan ne se fait plus chasser par autre chose.
//
// LES BORNES SONT CELLES QUE LE SERVEUR ANNONCE : `Cache-Control: private,
// max-age=1814400`, soit 21 jours (relevé le 22/08/2026 sur data.geopf.fr).
// On s'arrête à 14 jours pour rester en deçà. Le cache est « privé » au sens
// propre : il vit dans le navigateur de l'usager, jamais sur un serveur.

/** Combien de jours une tuile reste en cache — en deçà des 21 jours d'IGN. */
export const JOURS_EN_CACHE = 14;

export interface ReserveTuiles {
  /** La couche WMTS, telle qu'elle apparaît dans l'URL. */
  readonly couche: string;
  /** Le nom du cache (Cache Storage) qui lui est réservé. */
  readonly cache: string;
  /** Le type MIME que le serveur renvoie — vérifié avant toute mise en cache. */
  readonly format: 'image/png' | 'image/jpeg';
  /** Plafond de tuiles gardées ; au-delà, les plus anciennes s'effacent. */
  readonly tuiles: number;
  /** Le motif que le service worker applique à l'URL entière. */
  readonly motif: RegExp;
  /* LE POIDS D'UNE TUILE DE CETTE COUCHE, quand il a été MESURÉ pour elle.
     Absent, on retombe sur `OCTETS_PAR_TUILE` — les 58 Ko relevés sur seize
     tuiles de Plan par le couloir hors ligne (COULOIR-1). Ce défaut est
     conservateur pour les autres couches : un relevé du 10/09 sur Paris au
     zoom 15 donne 38 Ko pour le Plan, 15 pour le satellite, 16 pour les
     routes et 13 pour le cadastre. On ne les baisse PAS sur un seul
     échantillon — un plafond se taille sur le pire cas, pas sur un cas. */
  readonly octets?: number;
}

/* Le motif est ancré sur l'origine : workbox exige qu'une expression
   régulière appliquée à une requête d'un AUTRE domaine corresponde depuis le
   premier caractère, sans quoi il l'ignore silencieusement. */
function motifDeCouche(couche: string): RegExp {
  const echappee = couche.replace(/\./g, '\\.');
  return new RegExp(
    `^https://data\\.geopf\\.fr/wmts\\?(?:[^#]*&)?LAYER=${echappee}(?:&|$)`,
  );
}

/* Les plafonds : ~47 Ko par tuile (mesuré), ~15 tuiles pour un écran de
   bureau. Le plan est le fond par défaut et celui que le hors ligne sert le
   plus — il a la plus grosse réserve. Total au pire : ~950 tuiles, de l'ordre
   de 45 Mo, chiffre repris tel quel dans la page « Vie privée ». */
export const RESERVES_TUILES: readonly ReserveTuiles[] = [
  {
    couche: 'GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2',
    cache: 'tuiles-plan',
    format: 'image/png',
    /* MILLE TROIS CENTS DEPUIS LE COULOIR HORS LIGNE (COULOIR-1, 08/09). Le
       plafond était de 400, taillé pour ce qu'on regarde en naviguant. Un
       couloir de Paris–Lyon fait 947 tuiles : à 400, il aurait chassé tout ce
       que l'usager avait consulté, PUIS se serait chassé lui-même aux deux
       tiers — une carte à trous, sans que rien ne le dise. À 1 300, le plus
       long couloir tient, et il reste de la place pour ce qu'on a regardé.
       POURQUOI PAS PLUS : le chiffre est borné par la promesse écrite dans
       « Vie privée » — environ 110 Mo pour la réserve entière — et un test
       unitaire le vérifie plutôt que de s'en remettre à la mémoire.
       CE PLAFOND N'EST PAS UNE RÉSERVATION : le cache ne grossit qu'à mesure
       des tuiles qui arrivent. Qui n'emporte jamais de couloir garde la même
       empreinte qu'avant. */
    tuiles: 1300,
    motif: motifDeCouche('GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2'),
  },
  {
    couche: 'ORTHOIMAGERY.ORTHOPHOTOS',
    cache: 'tuiles-ortho',
    format: 'image/jpeg',
    tuiles: 250,
    motif: motifDeCouche('ORTHOIMAGERY.ORTHOPHOTOS'),
  },
  {
    couche: 'TRANSPORTNETWORKS.ROADS',
    cache: 'tuiles-routes',
    format: 'image/png',
    tuiles: 150,
    motif: motifDeCouche('TRANSPORTNETWORKS.ROADS'),
  },
  {
    couche: 'CADASTRALPARCELS.PARCELLAIRE_EXPRESS',
    cache: 'tuiles-cadastre',
    format: 'image/png',
    tuiles: 150,
    motif: motifDeCouche('CADASTRALPARCELS.PARCELLAIRE_EXPRESS'),
  },
  {
    couche: 'ELEVATION.CONTOUR.LINE',
    cache: 'tuiles-courbes',
    format: 'image/png',
    /* SOIXANTE, ET C'EST LA PROMESSE PUBLIQUE QUI L'A FIXÉ (COURBES-1, 10/09).
       Trois écrans de courbes, pas davantage : la réserve entière est bornée
       par les « environ 110 Mo » écrits dans « Vie privée », et les quatre
       couches d'avant en occupent déjà 107. Soixante tuiles de courbes — 45 Ko
       au pire relevé — tiennent dans ce qui reste, et pas une de plus.
       CE N'EST PAS LA BONNE RÉPONSE, C'EST LA RÉPONSE HONNÊTE. Une réserve
       digne de ce nom demanderait soit de relever le chiffre annoncé à
       l'usager — ce qui est une décision d'Armelin, pas la mienne — soit de
       mesurer le poids RÉEL des quatre autres couches, que le garde-fou
       suppose toutes à 58 Ko alors qu'un relevé du 10/09 sur Paris donne 38 Ko
       pour le Plan, 15 pour le satellite, 16 pour les routes et 13 pour le
       cadastre. Le second chemin ferait de la place sans rien promettre de
       plus ; il demande une campagne de mesure à lui seul.
       CE QUE SOIXANTE DONNE QUAND MÊME : le dernier coin regardé garde ses
       courbes hors réseau, ce qui est le cas d'usage — on consulte le relief
       là où l'on va marcher, puis on perd le réseau. */
    tuiles: 60,
    /* QUARANTE-CINQ KILO-OCTETS, le PIRE de quatre relevés du 10/09 : 28,7 Ko
       au zoom 6, 44,7 au zoom 13 (Chamonix, terrain le plus dense qui soit),
       6,8 au zoom 15 sur Paris, 3,8 au zoom 18. Un plafond se taille sur le
       pire cas. */
    octets: 45_000,
    motif: motifDeCouche('ELEVATION.CONTOUR.LINE'),
  },
];
