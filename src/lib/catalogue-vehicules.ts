/* CATALOGUE DE VÉHICULES ÉLECTRIQUES — pourquoi il est écrit à la main.
 *
 * LA DEMANDE. Armelin, le 25/08/2026 : « ABRP dispose d'une base de données
 * des véhicules ». Saisir à la main capacité, santé, puissance de charge et
 * autonomie est un péage à l'entrée : beaucoup d'usagers ne le franchiront
 * pas, et ceux qui le franchissent y mettent des chiffres approximatifs.
 *
 * CE QUI A ÉTÉ CHERCHÉ AVANT D'ÉCRIRE CE FICHIER, le 26/08/2026. Aucune
 * source publique française ne donne la CAPACITÉ DE BATTERIE d'un modèle :
 *   - data.gouv.fr : 691 jeux répondent à « véhicules électriques », tous sur
 *     le PARC (immatriculations, points de charge), aucun sur les modèles ;
 *   - l'ADEME publie les consommations réglementaires (car labelling) — la
 *     capacité n'est pas une donnée d'homologation, elle n'y figure pas.
 * Sans capacité, un catalogue est inutile à un planificateur d'autonomie.
 * Il n'y avait donc que deux issues : ce fichier, ou rien.
 *
 * CE QUE CES CHIFFRES SONT, ET NE SONT PAS.
 *   - `capaciteKwh` est la capacité UTILE annoncée par le constructeur, celle
 *     qui sert réellement. Elle est inférieure à la capacité brute souvent
 *     mise en avant dans la publicité.
 *   - `wltpKm` est l'autonomie du cycle d'homologation WLTP. ELLE EST
 *     OPTIMISTE, particulièrement sur autoroute, et l'interface le dit. Elle
 *     ne sert qu'à PRÉ-REMPLIR : dès qu'un usager relève sa propre autonomie,
 *     c'est la sienne qui compte. Le catalogue propose, la mesure dispose.
 *   - `puissanceMaxKw` est la pointe de charge en courant continu. Une borne
 *     plus rapide n'y change rien.
 *
 * ILS SONT INDICATIFS ET RÉVISABLES. Un constructeur change une batterie en
 * cours de série sans changer le nom du modèle ; une finition diffère d'une
 * autre. Chaque champ reste modifiable après application — le catalogue
 * remplit un formulaire, il ne le verrouille pas.
 */
import type { ClePrise } from './poi';

export interface ModeleVehicule {
  /** Identifiant stable, pour la persistance locale du choix. */
  cle: string;
  marque: string;
  modele: string;
  /** Finition ou taille de batterie, quand le modèle en a plusieurs. */
  variante?: string;
  /** Capacité UTILE en kWh — pas la capacité brute de la publicité. */
  capaciteKwh: number;
  /** Pointe de charge en courant continu, en kW. */
  puissanceMaxKw: number;
  /** Autonomie WLTP en km. Optimiste : voir l'en-tête. */
  wltpKm: number;
  /** Standard de charge rapide de ce modèle. */
  prise: ClePrise;
}

/* La liste couvre les modèles les plus répandus sur les routes françaises,
   plus quelques-uns rares mais demandés. Elle n'a pas vocation à
   l'exhaustivité : un catalogue de six cents lignes serait ingérable à la
   main, et illisible dans une liste déroulante. */
export const CATALOGUE: readonly ModeleVehicule[] = [
  // — Citadines et petites polyvalentes —
  { cle: 'dacia-spring', marque: 'Dacia', modele: 'Spring', capaciteKwh: 26.8, puissanceMaxKw: 30, wltpKm: 225, prise: 'combo_ccs' },
  { cle: 'fiat-500e-24', marque: 'Fiat', modele: '500e', variante: '24 kWh', capaciteKwh: 21.3, puissanceMaxKw: 50, wltpKm: 190, prise: 'combo_ccs' },
  { cle: 'fiat-500e-42', marque: 'Fiat', modele: '500e', variante: '42 kWh', capaciteKwh: 37.3, puissanceMaxKw: 85, wltpKm: 320, prise: 'combo_ccs' },
  { cle: 'renault-twingo-e', marque: 'Renault', modele: 'Twingo E-Tech', capaciteKwh: 21.3, puissanceMaxKw: 22, wltpKm: 190, prise: 'type_2' },
  { cle: 'renault-5-40', marque: 'Renault', modele: 'R5 E-Tech', variante: '40 kWh', capaciteKwh: 40, puissanceMaxKw: 80, wltpKm: 312, prise: 'combo_ccs' },
  { cle: 'renault-5-52', marque: 'Renault', modele: 'R5 E-Tech', variante: '52 kWh', capaciteKwh: 52, puissanceMaxKw: 100, wltpKm: 410, prise: 'combo_ccs' },
  { cle: 'renault-zoe-52', marque: 'Renault', modele: 'Zoe', variante: 'R135 52 kWh', capaciteKwh: 52, puissanceMaxKw: 46, wltpKm: 395, prise: 'combo_ccs' },
  { cle: 'peugeot-e208-50', marque: 'Peugeot', modele: 'e-208', variante: '50 kWh', capaciteKwh: 46.3, puissanceMaxKw: 100, wltpKm: 362, prise: 'combo_ccs' },
  { cle: 'peugeot-e208-51', marque: 'Peugeot', modele: 'e-208', variante: '51 kWh', capaciteKwh: 48.1, puissanceMaxKw: 100, wltpKm: 410, prise: 'combo_ccs' },
  { cle: 'opel-corsa-e', marque: 'Opel', modele: 'Corsa Electric', capaciteKwh: 46.3, puissanceMaxKw: 100, wltpKm: 357, prise: 'combo_ccs' },
  { cle: 'citroen-ec3', marque: 'Citroën', modele: 'ë-C3', capaciteKwh: 44, puissanceMaxKw: 100, wltpKm: 320, prise: 'combo_ccs' },
  { cle: 'mg4-51', marque: 'MG', modele: 'MG4', variante: 'Standard 51 kWh', capaciteKwh: 50.8, puissanceMaxKw: 117, wltpKm: 350, prise: 'combo_ccs' },
  { cle: 'mg4-64', marque: 'MG', modele: 'MG4', variante: 'Comfort 64 kWh', capaciteKwh: 61.7, puissanceMaxKw: 140, wltpKm: 435, prise: 'combo_ccs' },
  { cle: 'bmw-i3-42', marque: 'BMW', modele: 'i3', variante: '120 Ah', capaciteKwh: 37.9, puissanceMaxKw: 50, wltpKm: 310, prise: 'combo_ccs' },
  { cle: 'nissan-leaf-40', marque: 'Nissan', modele: 'Leaf', variante: '40 kWh', capaciteKwh: 39, puissanceMaxKw: 46, wltpKm: 270, prise: 'chademo' },
  { cle: 'nissan-leaf-62', marque: 'Nissan', modele: 'Leaf', variante: 'e+ 62 kWh', capaciteKwh: 59, puissanceMaxKw: 100, wltpKm: 385, prise: 'chademo' },

  // — Compactes et berlines —
  { cle: 'vw-id3-58', marque: 'Volkswagen', modele: 'ID.3', variante: 'Pro 58 kWh', capaciteKwh: 58, puissanceMaxKw: 120, wltpKm: 425, prise: 'combo_ccs' },
  { cle: 'vw-id3-77', marque: 'Volkswagen', modele: 'ID.3', variante: 'Pro S 77 kWh', capaciteKwh: 77, puissanceMaxKw: 170, wltpKm: 557, prise: 'combo_ccs' },
  { cle: 'cupra-born-58', marque: 'Cupra', modele: 'Born', variante: '58 kWh', capaciteKwh: 58, puissanceMaxKw: 120, wltpKm: 420, prise: 'combo_ccs' },
  { cle: 'renault-megane-60', marque: 'Renault', modele: 'Mégane E-Tech', variante: 'EV60', capaciteKwh: 60, puissanceMaxKw: 130, wltpKm: 470, prise: 'combo_ccs' },
  { cle: 'peugeot-e308', marque: 'Peugeot', modele: 'e-308', capaciteKwh: 51, puissanceMaxKw: 100, wltpKm: 410, prise: 'combo_ccs' },
  { cle: 'tesla-m3-sr', marque: 'Tesla', modele: 'Model 3', variante: 'Propulsion', capaciteKwh: 57.5, puissanceMaxKw: 170, wltpKm: 513, prise: 'combo_ccs' },
  { cle: 'tesla-m3-lr', marque: 'Tesla', modele: 'Model 3', variante: 'Grande Autonomie', capaciteKwh: 75, puissanceMaxKw: 250, wltpKm: 629, prise: 'combo_ccs' },
  { cle: 'bmw-i4-40', marque: 'BMW', modele: 'i4', variante: 'eDrive40', capaciteKwh: 80.7, puissanceMaxKw: 205, wltpKm: 590, prise: 'combo_ccs' },
  { cle: 'polestar-2-lr', marque: 'Polestar', modele: '2', variante: 'Long Range', capaciteKwh: 79, puissanceMaxKw: 205, wltpKm: 654, prise: 'combo_ccs' },

  // — SUV et familiales —
  { cle: 'tesla-my-sr', marque: 'Tesla', modele: 'Model Y', variante: 'Propulsion', capaciteKwh: 57.5, puissanceMaxKw: 170, wltpKm: 455, prise: 'combo_ccs' },
  { cle: 'tesla-my-lr', marque: 'Tesla', modele: 'Model Y', variante: 'Grande Autonomie', capaciteKwh: 75, puissanceMaxKw: 250, wltpKm: 600, prise: 'combo_ccs' },
  { cle: 'renault-scenic', marque: 'Renault', modele: 'Scénic E-Tech', variante: 'Grande Autonomie', capaciteKwh: 87, puissanceMaxKw: 150, wltpKm: 625, prise: 'combo_ccs' },
  { cle: 'peugeot-e3008', marque: 'Peugeot', modele: 'e-3008', variante: '73 kWh', capaciteKwh: 73, puissanceMaxKw: 160, wltpKm: 525, prise: 'combo_ccs' },
  { cle: 'vw-id4-77', marque: 'Volkswagen', modele: 'ID.4', variante: 'Pro 77 kWh', capaciteKwh: 77, puissanceMaxKw: 175, wltpKm: 550, prise: 'combo_ccs' },
  { cle: 'skoda-enyaq-82', marque: 'Škoda', modele: 'Enyaq', variante: '85', capaciteKwh: 77, puissanceMaxKw: 175, wltpKm: 570, prise: 'combo_ccs' },
  { cle: 'kia-ev6-77', marque: 'Kia', modele: 'EV6', variante: '77,4 kWh', capaciteKwh: 77.4, puissanceMaxKw: 240, wltpKm: 528, prise: 'combo_ccs' },
  { cle: 'hyundai-ioniq5-77', marque: 'Hyundai', modele: 'Ioniq 5', variante: '77,4 kWh', capaciteKwh: 77.4, puissanceMaxKw: 235, wltpKm: 507, prise: 'combo_ccs' },
  { cle: 'kia-niro-ev', marque: 'Kia', modele: 'Niro EV', capaciteKwh: 64.8, puissanceMaxKw: 80, wltpKm: 460, prise: 'combo_ccs' },
  { cle: 'hyundai-kona-65', marque: 'Hyundai', modele: 'Kona Electric', variante: '65 kWh', capaciteKwh: 65.4, puissanceMaxKw: 102, wltpKm: 514, prise: 'combo_ccs' },
  { cle: 'mg-zs-ev', marque: 'MG', modele: 'ZS EV', variante: 'Long Range', capaciteKwh: 68.3, puissanceMaxKw: 92, wltpKm: 440, prise: 'combo_ccs' },
  { cle: 'citroen-ec4', marque: 'Citroën', modele: 'ë-C4', variante: '50 kWh', capaciteKwh: 46.3, puissanceMaxKw: 100, wltpKm: 357, prise: 'combo_ccs' },
  { cle: 'vinfast-vf8', marque: 'VinFast', modele: 'VF 8', variante: 'Eco', capaciteKwh: 82.4, puissanceMaxKw: 150, wltpKm: 447, prise: 'combo_ccs' },

  // — Utilitaires —
  { cle: 'renault-kangoo-ev', marque: 'Renault', modele: 'Kangoo E-Tech', capaciteKwh: 45, puissanceMaxKw: 80, wltpKm: 285, prise: 'combo_ccs' },
  { cle: 'peugeot-eexpert', marque: 'Peugeot', modele: 'e-Expert', variante: '75 kWh', capaciteKwh: 75, puissanceMaxKw: 100, wltpKm: 350, prise: 'combo_ccs' },
] as const;

/** Le libellé affiché dans la liste : « Renault Mégane E-Tech (EV60) ». */
export function libelleModele(m: ModeleVehicule): string {
  const base = `${m.marque} ${m.modele}`;
  return m.variante ? `${base} (${m.variante})` : base;
}

/** Recherche par clé. `null` — et non un modèle par défaut — quand rien ne
    correspond : proposer une Zoe à qui roule en Kangoo serait pire que rien. */
export function modeleParCle(cle: string): ModeleVehicule | null {
  return CATALOGUE.find((m) => m.cle === cle) ?? null;
}

/**
 * La consommation de référence déduite d'une autonomie et d'une capacité.
 *
 * EN kWh/100 km, la grandeur dont le planificateur se sert. Le calcul est
 * trivial ; ce qui compte est ce qu'il PRÉSUPPOSE — que l'autonomie donnée
 * correspond à la capacité donnée. Avec le WLTP, cela reste une hypothèse de
 * laboratoire, et l'interface doit le dire plutôt que de laisser croire à
 * une mesure.
 */
export function consommationDepuis(capaciteKwh: number, autonomieKm: number): number {
  if (!(capaciteKwh > 0) || !(autonomieKm > 0)) return 0;
  return (capaciteKwh / autonomieKm) * 100;
}

/* CE QUE LE WLTP COÛTE SUR AUTOROUTE. Le cycle d'homologation ne dépasse
   131 km/h que par pointes et comporte beaucoup de ville : à 130 km/h
   soutenus, la consommation réelle dépasse largement la sienne. Les relevés
   d'Armelin sur sa VF 8 en donnent la mesure : 447 km WLTP annoncés, 280 km
   constatés sur autoroute — soit 63 %.

   CE COEFFICIENT N'EST PAS UNE DONNÉE CONSTRUCTEUR, c'est une hypothèse de ce
   projet, et l'interface la présente comme telle. Il ne sert qu'à proposer un
   point de départ moins faux que le WLTP brut ; le premier trajet réellement
   mesuré doit le remplacer. */
export const PART_AUTOROUTE = 0.63;

/** Ce que le catalogue propose de pré-remplir, en kilomètres constatés. */
export function autonomiesProposees(m: ModeleVehicule): {
  ville: number; route: number; autoroute: number;
} {
  return {
    // En ville, la récupération au freinage fait souvent mieux que le WLTP.
    ville: Math.round(m.wltpKm * 1.05),
    route: Math.round(m.wltpKm * 0.85),
    autoroute: Math.round(m.wltpKm * PART_AUTOROUTE),
  };
}
