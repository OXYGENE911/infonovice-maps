/* LA BARRE DU TRAJET — ce qui reste devant soi, d'un coup d'œil.
 *
 * LA DEMANDE. Armelin, le 29/08/2026 : « la barre verticale devrait […]
 * s'étaler encore plus sur la longueur et le trait vertical devrait être
 * plus épais afin d'afficher des couleurs indiquant visuellement l'état du
 * trafic sur le parcours. Exemple vert pour un trafic fluide, orange pour un
 * trafic modéré et rouge pour un trafic en embouteillages. » Et : « on ne
 * devrait afficher sur cette barre que les éléments planifiés comme les
 * arrêts aux bornes de recharge ».
 *
 * CE QUE LA DONNÉE PERMET DE DIRE, ET CE QU'ELLE NE PERMET PAS. Bison Futé
 * publie des ÉVÉNEMENTS PONCTUELS (un accident ici, des travaux là), pas un
 * débit par tronçon : l'étude du 27/08 avait écarté pour cette raison une
 * « barre de fluidité » qui aurait prétendu mesurer ce que personne ne
 * publie. Les trois couleurs restent donc possibles à UNE condition — que
 * le vert ne dise pas « ça roule », mais « AUCUN INCIDENT SIGNALÉ ». C'est
 * exactement ce que la légende affiche, et c'est vrai.
 *
 * L'ÉTENDUE D'UN POINT. Un événement est posé sur un axe à une position ;
 * il ne porte ni longueur ni durée exploitables. On peint donc une bande
 * FIXE autour de lui — un kilomètre de part et d'autre — et on le dit :
 * c'est un repère, pas un métrage.
 */

/** Ce qu'une couleur de la barre a le droit d'affirmer. */
export type NiveauTrafic = 'libre' | 'ralenti' | 'bloque';

export interface SegmentFrise {
  /** Début du segment, en mètres d'avancement. */
  deM: number;
  /** Fin du segment, en mètres d'avancement. */
  aM: number;
  niveau: NiveauTrafic;
}

/* Ce qui BLOQUE (rouge) et ce qui RALENTIT (orange). Le reste des types
   Bison Futé — restrictions, interdictions poids lourds, informations — ne
   dit rien du temps de parcours d'une voiture : il ne colore rien. */
const BLOQUE = new Set(['ACCIDENT', 'COUPURE', 'BOUCHON']);
const RALENTI = new Set(['TRAVAUX', 'INTEMPERIES', 'OBSTACLE']);

/** Le niveau porté par un type d'événement — `null` s'il ne colore rien. */
export function niveauDeType(type: string): NiveauTrafic | null {
  if (BLOQUE.has(type)) return 'bloque';
  if (RALENTI.has(type)) return 'ralenti';
  return null;
}

/** La bande peinte autour d'un événement ponctuel, de part et d'autre. */
export const PORTEE_M = 1_000;

/**
 * Découpe le trajet en segments colorés — PURE, testée à sec.
 *
 * LE PIRE L'EMPORTE quand deux bandes se chevauchent : un bouchon dans une
 * zone de travaux reste un bouchon. Les segments rendus sont contigus,
 * couvrent [0, totalM] exactement, et ne se chevauchent jamais — la barre
 * se peint sans trou ni recouvrement.
 */
export function segmentsFrise(
  totalM: number,
  evenements: readonly { avancementM: number; type: string }[],
  porteeM = PORTEE_M,
): SegmentFrise[] {
  if (!(totalM > 0)) return [];
  /* On raisonne sur des BORNES, pas sur des intervalles : chaque bande pose
     deux frontières, on trie, et l'on juge chaque tranche par le pire
     événement qui la couvre. C'est ce qui rend le résultat contigu par
     construction, sans arithmétique de fusion à la main. */
  const bandes: { de: number; a: number; niveau: NiveauTrafic }[] = [];
  for (const e of evenements) {
    const niveau = niveauDeType(e.type);
    if (niveau === null) continue;
    const de = Math.max(0, e.avancementM - porteeM);
    const a = Math.min(totalM, e.avancementM + porteeM);
    if (a > de) bandes.push({ de, a, niveau });
  }
  if (bandes.length === 0) return [{ deM: 0, aM: totalM, niveau: 'libre' }];

  const frontieres = new Set<number>([0, totalM]);
  for (const b of bandes) { frontieres.add(b.de); frontieres.add(b.a); }
  const bornes = [...frontieres].sort((x, y) => x - y);

  const pire = (de: number, a: number): NiveauTrafic => {
    let vu: NiveauTrafic = 'libre';
    for (const b of bandes) {
      if (b.a <= de || b.de >= a) continue;
      if (b.niveau === 'bloque') return 'bloque';
      vu = 'ralenti';
    }
    return vu;
  };

  const bruts: SegmentFrise[] = [];
  for (let i = 0; i < bornes.length - 1; i += 1) {
    const de = bornes[i]!;
    const a = bornes[i + 1]!;
    if (a <= de) continue;
    bruts.push({ deM: de, aM: a, niveau: pire(de, a) });
  }
  // Deux tranches voisines de même niveau n'en font qu'une : moins de nœuds
  // dans le DOM, et une barre qui ne montre pas des coutures inventées.
  const rendu: SegmentFrise[] = [];
  for (const s of bruts) {
    const dernier = rendu[rendu.length - 1];
    if (dernier && dernier.niveau === s.niveau) dernier.aM = s.aM;
    else rendu.push({ ...s });
  }
  return rendu;
}
