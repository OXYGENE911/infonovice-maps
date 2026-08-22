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
    tuiles: 400,
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
];
