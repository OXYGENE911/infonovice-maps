/* LE PANNEAU DE DIRECTION — la règle officielle française, appliquée.
 *
 * LA DEMANDE. Armelin, le 30/08/2026 : « dans les rectangles annonçant les
 * directions, ce serait bien que les cartouches s'affichent sous forme de
 * vrais panneaux d'autoroute. »
 *
 * CE QUI A ÉTÉ RELEVÉ (30/08), et d'où vient chaque couleur — c'est
 * l'Instruction interministérielle sur la signalisation routière (IISR,
 * arrêté du 24 novembre 1967, cinquième partie) :
 *
 *   FONDS. Le BLEU sert sur le réseau autoroutier pour les destinations
 *   desservies par l'autoroute, et sur le réseau ordinaire pour ce qui mène
 *   à une autoroute. Le VERT sert aux « pôles verts » — les agglomérations
 *   listées par le ministère — sur les liaisons qui les relient. Le BLANC
 *   sert dans les autres cas. Le JAUNE est réservé au TEMPORAIRE (chantier,
 *   exploitation) : on ne s'en sert donc pas ici, où rien n'est temporaire.
 *
 *   ENCRE ET LISTEL. Les panneaux à fond bleu ou vert portent des
 *   inscriptions et des listels BLANCS ; les fonds blanc et jaune les
 *   portent NOIRS. C'est une règle, pas un goût : elle se code, et c'est
 *   `encreSur`.
 *
 *   CARTOUCHES DE NUMÉROTATION (types E41 à E47). ROUGE pour les nationales
 *   ET les autoroutes (E42), JAUNE pour le réseau départemental (E43),
 *   VERT pour les routes européennes (E41), BLANC pour le réseau communal
 *   (E44), BLEU pour le réseau métropolitain (E47).
 *
 * CE QU'ON S'AUTORISE À PEINDRE, ET CE QU'ON NE PEINT PAS. Le fond bleu
 * suppose l'autoroute : on le tient du numéro (A…), la seule chose que le
 * service rende (`cpx_numero`). Le VERT, lui, suppose un « pôle vert » —
 * une liste ministérielle que nous n'avons pas. On l'applique donc aux
 * NATIONALES, qui sont les grandes liaisons du réseau ordinaire : c'est
 * l'usage le plus proche de la règle que la donnée permette, et c'est aussi
 * la convention qu'Armelin avait énoncée le 29/08 (« du vert pour les
 * nationales »). Le reste est blanc, comme la règle le veut.
 *
 * CE QUE ÇA CHANGE POUR LES DÉPARTEMENTALES. Armelin avait demandé de
 * l'orange le 29/08. La signalisation réelle ne connaît pas d'orange : une
 * départementale se signale sur fond BLANC, et c'est son CARTOUCHE qui est
 * jaune. Le jaune reste donc à l'écran, là où il est réglementaire.
 */
import type { ClasseRoute } from './classe-route';

/** Les fonds que la règle autorise ici. Le jaune est exclu : il est réservé
    au temporaire, et rien de ce qu'on affiche ne l'est. */
export type FondPanneau = 'bleu' | 'vert' | 'blanc';
/** La couleur du cartouche de numérotation, ou `null` s'il n'y en a pas. */
export type CartoucheNumero = 'rouge' | 'jaune' | 'vert' | null;
/** L'encre — et le listel, qui la suit toujours. */
export type Encre = 'blanche' | 'noire';

/** Le fond du panneau pour une classe de route — PURE. */
export function fondPanneau(classe: ClasseRoute): FondPanneau {
  switch (classe) {
    case 'autoroute': return 'bleu';
    case 'nationale': return 'vert';
    default: return 'blanc';
  }
}

/**
 * L'encre et le listel d'un fond — PURE.
 *
 * LA RÈGLE, TELLE QUELLE : fond bleu ou vert, inscriptions et listels
 * BLANCS ; fond blanc ou jaune, inscriptions et listels NOIRS. Elle vit ici
 * plutôt que dans la feuille de style parce qu'elle vaut pour TOUT ce qui se
 * pose sur le panneau — le texte, la flèche, la distance.
 */
export function encreSur(fond: FondPanneau): Encre {
  return fond === 'blanc' ? 'noire' : 'blanche';
}

/**
 * Le cartouche de numérotation d'une classe — PURE.
 *
 * Le ROUGE couvre autoroutes ET nationales : c'est le même type E42, et
 * c'est ce qu'on lit sur la route. Une voie locale n'a pas de numéro, donc
 * pas de cartouche : `null`, et rien ne se dessine — un cartouche vide
 * serait un faux panneau.
 */
export function cartoucheNumero(classe: ClasseRoute): CartoucheNumero {
  switch (classe) {
    case 'autoroute': case 'nationale': return 'rouge';
    case 'departementale': return 'jaune';
    default: return null;
  }
}

/**
 * Le numéro de route européenne, découpé — PURE.
 *
 * MESURÉ LE 30/08 sur la ressource `bdtopo-pgr` : le champ
 * `cpx_numero_route_europeenne` rend « E15/E50 » — DEUX routes sur un même
 * tronçon, séparées par une barre. Un cartouche par route, comme sur le
 * terrain : « E15 » et « E50 » sont deux panneaux verts, pas un.
 *
 * (La ressource qui porte ce champ ne rend AUCUNE instruction de manœuvre :
 * elle ne peut donc pas alimenter le guidage aujourd'hui. Le découpage vit
 * ici, prêt, et le détail de la mesure est dans docs/apis.md.)
 */
export function routesEuropeennes(brut: string): string[] {
  return brut
    .split('/')
    .map((r) => r.trim().toUpperCase().replace(/\s+/g, ''))
    .filter((r) => /^E\d+$/.test(r));
}
