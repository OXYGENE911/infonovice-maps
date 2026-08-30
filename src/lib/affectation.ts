/* L'AFFECTATION PAR VOIE — ce que chaque voie autorise, et laquelle prendre.
 *
 * LA DEMANDE. Armelin, le 30/08/2026 : « fais l'affectation par voie ».
 *
 * TROISIÈME NOTE PRISE EN DÉFAUT LE MÊME JOUR, ET LA MÊME ERREUR. Il était
 * écrit — ici même, dans lib/voies.ts — qu'« il n'existe pas de `turn:lanes`
 * ici ». C'était vrai du service d'itinéraire, et faux d'OpenStreetMap :
 * `turn:lanes` EST l'étiquette standard de l'affectation par voie, et la France en
 * porte. Relevé le 30/08 : 503 chemins dans Paris intra-muros, et 30 le long
 * d'un trajet de 16,5 km à travers la ville.
 *
 * CE QUE ÇA COUVRE, ET IL FAUT LE DIRE : cinq manœuvres sur dix-sept (29 %)
 * de ce trajet ont une affectation à moins de soixante mètres. C'est PEU, et
 * c'est la règle de la maison qui tranche — on montre quand on sait, on
 * retombe sur le conseil de placement (lib/voies.ts) quand on ne sait pas.
 *
 * LE FORMAT, TEL QU'IL EST : `left|through|through;right` — une barre par
 * voie, de GAUCHE à droite, et un point-virgule quand une voie autorise
 * plusieurs mouvements. Une case VIDE veut dire « pas de flèche peinte au
 * sol » : sur le périphérique, `|||slight_right|slight_right` se lit « trois
 * voies qui continuent, deux qui sortent ». C'est la règle du marquage
 * français — une voie qui tourne est fléchée, une voie qui continue ne l'est
 * pas toujours — et c'est pourquoi une case vide vaut « tout droit » ICI, et
 * nulle part ailleurs.
 */
import { situerSurLeTrace, distanceM } from './le-long-du-trajet';
import type { Manoeuvre } from './feuille-de-route';

/** Les mouvements d'une voie, dans le vocabulaire d'OpenStreetMap. */
export type Mouvement = string;

/** Ce qu'autorise chaque voie, de gauche à droite. Une case vide : non peinte. */
export type Affectation = Mouvement[][];

/** Une affectation posée sur le trajet. */
export interface AffectationTrajet {
  debutM: number;
  finM: number;
  voies: Affectation;
}

/* LE RAYON DE LA COUTURE : le même que les limites de vitesse (25 m). On
   cherche LA chaussée qu'on suit, pas la contre-allée. */
const ECART_MAX_M = 25;

/**
 * Découpe la valeur d'un `turn:lanes` — PURE.
 *
 * `'left|through;right|'` devient `[['left'], ['through', 'right'], []]`.
 * La casse et les espaces des contributeurs sont absorbés ; `none`, que
 * certains écrivent au lieu de laisser vide, revient au même.
 */
export function parserAffectation(brut: string): Affectation {
  if (brut.trim() === '') return [];
  return brut.split('|').map((voie) => voie
    .split(';')
    .map((m) => m.trim().toLowerCase())
    .filter((m) => m !== '' && m !== 'none'));
}

/* LES MOUVEMENTS D'UN CÔTÉ. On regroupe par CÔTÉ plutôt que par mot exact :
   le moteur annonce « tournez à droite » là où OpenStreetMap peint
   `slight_right` (relevé sur le périphérique). Exiger le mot exact ferait
   taire l'affichage précisément là où il servirait. */
const FAMILLES: Record<string, readonly Mouvement[]> = {
  droite: ['right', 'slight_right', 'sharp_right', 'merge_to_right'],
  gauche: ['left', 'slight_left', 'sharp_left', 'merge_to_left'],
  tout_droit: ['through'],
  demi_tour: ['reverse'],
};

/** La famille de mouvements que sert une manœuvre — PURE. */
export function familleDe(manoeuvre: Manoeuvre): keyof typeof FAMILLES | null {
  switch (manoeuvre) {
    case 'right': case 'slight right': case 'sharp right': return 'droite';
    case 'left': case 'slight left': case 'sharp left': return 'gauche';
    case 'straight': return 'tout_droit';
    case 'uturn': return 'demi_tour';
    default: return null;
  }
}

/**
 * Les voies qui servent cette manœuvre, comptées depuis la gauche à
 * partir de 1 — PURE.
 *
 * DEUX LECTURES, DANS CET ORDRE. D'abord les voies qui l'autorisent
 * EXPLICITEMENT. À défaut, et SEULEMENT pour « tout droit », les voies non
 * peintes : c'est la règle du marquage français — une voie qui tourne est
 * fléchée, une voie qui continue ne l'est pas toujours. Pour un virage, une
 * case vide ne veut rien dire : on préfère ne rien montrer.
 */
export function voiesPour(voies: Affectation, manoeuvre: Manoeuvre): number[] {
  const famille = familleDe(manoeuvre);
  if (famille === null || voies.length === 0) return [];
  const attendus = FAMILLES[famille]!;
  const explicites = voies
    .map((v, i) => (v.some((m) => attendus.includes(m)) ? i + 1 : 0))
    .filter((i) => i > 0);
  if (explicites.length > 0) return explicites;
  if (famille !== 'tout_droit') return [];
  return voies
    .map((v, i) => (v.length === 0 ? i + 1 : 0))
    .filter((i) => i > 0);
}

/** Le cap d'un segment, en degrés — PURE. */
function cap(a: [number, number], b: [number, number]): number {
  const mLon = 111_320 * Math.cos((a[1] * Math.PI) / 180);
  return (Math.atan2((b[0] - a[0]) * mLon, (b[1] - a[1]) * 111_320) * 180) / Math.PI;
}

/** Vrai si l'on parcourt le chemin dans son sens de numérisation — PURE. */
export function memeSens(
  chemin: readonly [number, number][], trace: readonly [number, number][],
): boolean {
  if (chemin.length < 2 || trace.length < 2) return true;
  const capChemin = cap(chemin[0]!, chemin[chemin.length - 1]!);
  /* ON COMPARE AU BON ENDROIT : le cap du tracé PRÈS du chemin, pas son cap
     général — un trajet de vingt kilomètres change dix fois de direction. */
  let meilleur = { ecart: Infinity, i: 0 };
  for (let i = 0; i < trace.length - 1; i += 1) {
    const d = distanceM(trace[i]!, chemin[0]!);
    if (d < meilleur.ecart) meilleur = { ecart: d, i };
  }
  const capTrace = cap(trace[meilleur.i]!, trace[meilleur.i + 1]!);
  const ecart = Math.abs(((capChemin - capTrace + 540) % 360) - 180);
  return ecart < 90;
}

/**
 * Les affectations posées sur le trajet — PURE.
 *
 * LE SENS COMPTE, ET C'EST LE PIÈGE DE CE MODULE. Sur une route à double
 * sens, `turn:lanes:forward` décrit les voies de CELUI QUI SUIT le sens de
 * numérisation du chemin, et `:backward` celles d'en face. Prendre la
 * mauvaise, c'est afficher les voies du trafic opposé — pire qu'un écran
 * vide. On compare donc notre cap au sien.
 */
export function versAffectations(
  elements: readonly unknown[], trace: readonly [number, number][],
): AffectationTrajet[] {
  if (trace.length < 2) return [];
  const rendu: AffectationTrajet[] = [];
  for (const brut of elements) {
    if (typeof brut !== 'object' || brut === null) continue;
    const e = brut as {
      type?: string; tags?: Record<string, string>;
      geometry?: { lon: number; lat: number }[];
    };
    if (e.type !== 'way' || !Array.isArray(e.geometry) || e.geometry.length < 2) continue;
    const tags = e.tags ?? {};
    const chemin = e.geometry.map((p) => [p.lon, p.lat] as [number, number]);

    let valeur = tags['turn:lanes'] ?? '';
    if (valeur === '') {
      const sens = memeSens(chemin, trace);
      valeur = (sens ? tags['turn:lanes:forward'] : tags['turn:lanes:backward']) ?? '';
    }
    const voies = parserAffectation(valeur);
    if (voies.length === 0) continue;

    const a = situerSurLeTrace(
      { lon: chemin[0]![0], lat: chemin[0]![1] }, trace as [number, number][],
    );
    const b = situerSurLeTrace(
      { lon: chemin[chemin.length - 1]![0], lat: chemin[chemin.length - 1]![1] },
      trace as [number, number][],
    );
    if (a.ecart > ECART_MAX_M || b.ecart > ECART_MAX_M) continue;
    const debutM = Math.min(a.avancement, b.avancement);
    const finM = Math.max(a.avancement, b.avancement);
    /* LE MARQUAGE VAUT JUSQU'AU BOUT DU TRONÇON, ET UN PEU AU-DELÀ : les
       flèches sont peintes AVANT le carrefour, et le tronçon s'arrête à
       l'intersection même. Trente mètres de prolongation évitent que
       l'affichage s'éteigne juste au moment de la manœuvre. */
    rendu.push({ debutM, finM: finM + 30, voies });
  }
  return rendu.sort((x, y) => x.debutM - y.debutM);
}

/** L'affectation qui s'applique ici — PURE. */
export function affectationA(
  liste: readonly AffectationTrajet[], avancementM: number,
): Affectation | null {
  let retenue: AffectationTrajet | null = null;
  for (const a of liste) {
    if (a.debutM > avancementM) break; // triées
    if (avancementM > a.finM) continue;
    /* LA PLUS TARDIVE GAGNE : deux tronçons peuvent se chevaucher de
       quelques mètres, et c'est le marquage le plus proche du carrefour qui
       décrit ce qu'on a sous les roues. */
    if (!retenue || a.debutM >= retenue.debutM) retenue = a;
  }
  return retenue?.voies ?? null;
}

/** Le conseil en toutes lettres — pour qui écoute la page. */
export function libelleAffectation(voies: Affectation, retenues: readonly number[]): string {
  if (retenues.length === 0) return `${voies.length} voies`;
  if (retenues.length === voies.length) return `${voies.length} voies, toutes praticables`;
  const rangs = retenues.map((r) => (r === 1 ? '1re' : `${r}e`)).join(' et ');
  return `${voies.length} voies, prenez la ${rangs} en partant de la gauche`;
}
