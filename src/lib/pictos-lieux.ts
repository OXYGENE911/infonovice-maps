/* QUEL MOTIF POUR QUEL LIEU — la lecture des étiquettes OSM, PURE.
 *
 * LA DEMANDE. Armelin, le 31/08/2026 : « pour chaque catégorie de POI, au lieu
 * de faire un rond de couleur différente, ce serait bien de faire un rond de
 * couleur un peu plus gros, mais avec un motif clairement identifiable. Par
 * exemple : un couteau et une fourchette pour les restaurants, un lit pour les
 * hôtels, une croix verte pour les pharmacies, une tasse de café pour les
 * cafés, un verre à cocktail pour les bars, un P bleu pour les parkings, un
 * caddie pour les supermarchés, des haltères pour les salles de sport, une
 * grande roue pour les parcs d'attractions, une clé à molette ou une voiture
 * pour les garages, un cintre pour les pressings, un avion pour les aéroports,
 * un train pour les gares, une dent pour un dentiste, une patte de chat pour
 * un vétérinaire, etc. »
 *
 * LE PRINCIPE QUI RÉSOUT LA TENSION. Sa liste est plus FINE que les familles
 * du filtre : il veut une tasse pour un café et un verre pour un bar, alors
 * que les deux vivent dans la même famille ; un caddie pour un supermarché,
 * alors qu'il est rangé avec les commerces. Or douze familles, c'est ce qui
 * tient sur un téléphone — le raisonnement de POI-2 n'a pas changé.
 *
 * ON SÉPARE DONC LES DEUX RÔLES :
 *   — LA COULEUR DIT LA FAMILLE : c'est la légende du panneau, et elle reste
 *     grossière parce qu'elle doit se retenir.
 *   — LE MOTIF DIT LE TYPE, aussi précisément que la donnée le permet. Il n'a
 *     rien à retenir : il se reconnaît.
 *
 * Un bar et un café portent ainsi la même couleur et deux dessins différents,
 * ce qui est exactement ce qu'il décrit.
 *
 * ET QUAND LA DONNÉE NE DIT RIEN DE PRÉCIS, le motif retombe sur celui de la
 * famille. Un dessin approximatif serait pire que le motif générique : « si
 * l'information n'est pas forcément compréhensible du premier coup, ça devient
 * une information inutile à afficher » (Armelin, 30/08).
 */

/** Les motifs disponibles — chaque clé est dessinée dans `carte/icone-lieu`. */
export type CleMotif =
  | 'couverts' | 'tasse' | 'cocktail' | 'caddie' | 'boutique' | 'vetement'
  | 'lit' | 'colonnes' | 'roue' | 'bobine' | 'masques'
  | 'croix' | 'dent' | 'patte' | 'billet' | 'parking'
  | 'cle' | 'cintre' | 'ciseaux' | 'train' | 'avion' | 'haltere' | 'wc'
  | 'point';

/* CE QUI CHOISIT LE MOTIF, DANS L'ORDRE. Le premier qui correspond gagne : une
   pharmacie qui vend des cosmétiques garde sa croix, un restaurant d'hôtel
   garde ses couverts. Même discipline que le classement en familles. */
const MOTIFS: readonly { motif: CleMotif; test: (t: Record<string, string>) => boolean }[] = [
  // — Manger et boire —
  { motif: 'couverts', test: (t) => ['restaurant', 'fast_food'].includes(t['amenity'] ?? '') },
  { motif: 'tasse', test: (t) => t['amenity'] === 'cafe' },
  { motif: 'cocktail', test: (t) => ['bar', 'pub'].includes(t['amenity'] ?? '') },
  // — Acheter —
  { motif: 'caddie', test: (t) => ['supermarket', 'convenience'].includes(t['shop'] ?? '') },
  { motif: 'vetement', test: (t) => ['clothes', 'shoes'].includes(t['shop'] ?? '') },
  { motif: 'cintre', test: (t) => ['laundry', 'dry_cleaning'].includes(t['shop'] ?? '') },
  { motif: 'ciseaux', test: (t) => t['shop'] === 'hairdresser' },
  { motif: 'cle', test: (t) => ['car_repair', 'car_parts'].includes(t['shop'] ?? '')
    || t['amenity'] === 'car_wash' },
  // — Dormir —
  { motif: 'lit', test: (t) => ['hotel', 'motel', 'guest_house'].includes(t['tourism'] ?? '') },
  // — Voir —
  { motif: 'roue', test: (t) => t['tourism'] === 'theme_park' || t['leisure'] === 'water_park' },
  { motif: 'colonnes', test: (t) => ['museum', 'attraction', 'viewpoint', 'gallery']
    .includes(t['tourism'] ?? '') },
  { motif: 'bobine', test: (t) => t['amenity'] === 'cinema' },
  { motif: 'masques', test: (t) => t['amenity'] === 'theatre' },
  // — Se soigner —
  { motif: 'dent', test: (t) => t['amenity'] === 'dentist' || t['healthcare'] === 'dentist' },
  { motif: 'patte', test: (t) => t['amenity'] === 'veterinary' },
  { motif: 'croix', test: (t) => ['pharmacy', 'doctors', 'hospital', 'clinic']
    .includes(t['amenity'] ?? '') },
  // — Payer, garer, bouger —
  { motif: 'billet', test: (t) => ['atm', 'bank', 'bureau_de_change'].includes(t['amenity'] ?? '') },
  { motif: 'parking', test: (t) => t['amenity'] === 'parking' },
  { motif: 'train', test: (t) => t['railway'] === 'station' || t['railway'] === 'halt'
    || t['public_transport'] === 'station' },
  { motif: 'avion', test: (t) => t['aeroway'] === 'aerodrome' || t['aeroway'] === 'terminal' },
  // — Bouger son corps —
  { motif: 'haltere', test: (t) => ['fitness_centre', 'sports_centre'].includes(t['leisure'] ?? '') },
  // — Le reste —
  { motif: 'wc', test: (t) => t['amenity'] === 'toilets' },
  /* LE FOURRE-TOUT VIENT EN DERNIER, ET C'EST TOUT L'ORDRE. Placé plus haut,
     il volait son dessin à toute règle précise : une pharmacie qui vend des
     cosmétiques (`shop=chemist`) recevait une devanture au lieu de sa croix.
     Un parcours l'a attrapé avant l'usager.
     ET LA VALEUR DOIT ÊTRE NON VIDE : `t['shop'] !== undefined` est vrai pour
     une chaîne vide, et une étiquette vide n'est pas un commerce. */
  { motif: 'boutique', test: (t) => (t['shop'] ?? '') !== '' },
];

/**
 * Le motif d'un lieu d'après ses étiquettes — PURE.
 *
 * Rend `'point'` quand rien ne correspond : un cercle nu, honnête, plutôt
 * qu'un dessin approchant qui ferait croire à autre chose.
 */
export function motifDe(tags: Record<string, string>): CleMotif {
  return MOTIFS.find((m) => m.test(tags))?.motif ?? 'point';
}
