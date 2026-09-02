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
 * D'OÙ VIENNENT LES SIX ENTRÉES DU 02/09 (Alpine A390, MG Cyberster, Smart #5,
 * BYD Atto 2, BYD Seal U, BYD Tang) : des fiches techniques d'automobile-propre,
 * relevées ce jour-là. UNE SEULE SOURCE, ET C'EST DÉLIBÉRÉ — la veille, deux
 * sources françaises donnaient 150 kW et 190 kW de charge rapide pour la même
 * A390, et mélanger les provenances aurait produit un catalogue incohérent
 * plutôt qu'imprécis. La fiche retenue distingue capacité BRUTE et UTILE, ce
 * que la plupart des communiqués ne font pas.
 * LE XPENG L03 A SUIVI LE MÊME JOUR : je l'avais écarté faute de savoir à quel
 * véhicule le rattacher, Armelin a donné le configurateur officiel français.
 * Ses quatre versions viennent d'EV Database — la seule base à jour sur un
 * modèle de 2026, et elle distingue « usable » de la capacité brute. Les 193 kW
 * de la Standard Range sont recoupés par le site officiel de XPENG France.
 *
 * LES SEIZE ENTRÉES DU 02/09 AU SOIR (VEHIC-3) sont exactement la liste
 * qu'Armelin avait donnée avec ses liens officiels, et elles viennent d'EV
 * Database — page par page, jamais d'un résumé de moteur de recherche, qui
 * m'avait donné 37,0 kWh là où la fiche dit 37,5. Les capacités sont les
 * capacités UTILES, et l'autonomie est le WLTP « TEL », celui que le
 * constructeur affiche.
 *   - BYD Atto 3 EVO : RECOUPÉ par le communiqué de BYD France lui-même
 *     (510 km, charge à 220 kW sous 800 V). C'est le seul de la fournée dont
 *     les chiffres surprenaient assez pour mériter une seconde source.
 *   - Tesla : les huit versions 2026 portent leur MILLÉSIME DANS LEUR NOM, et
 *     pas seulement dans le champ `annees`. Armelin demandait « Tesla par
 *     année » ; une liste déroulante ne montre que le libellé, donc c'est là
 *     que l'année devait aller. Les entrées antérieures gardent leur nom sans
 *     millésime : je n'ai pas sourcé leurs bornes d'années, et une année
 *     devinée serait pire qu'une absence.
 *
 * CE QUE J'AVAIS REFUSÉ D'AJOUTER, ET CE QUI L'A DÉBLOQUÉ (03/09). Les
 * versions d'entrée du Raval et de l'ID. Polo étaient annoncées par la même
 * base tierce à 50 kW de charge pour l'une et 88 pour l'autre : l'une des deux
 * fiches était fausse, et je ne savais pas laquelle. Armelin a relevé les DEUX
 * CONFIGURATEURS OFFICIELS et tranché — 90 kW pour toutes les ID. Polo, 105
 * pour le Raval Endurance, et des capacités de 38,5 et 51,5 kWh. Les dix
 * versions sont donc entrées : trois Raval (Plus, Endurance, VZ) et sept
 * finitions d'ID. Polo.
 *
 * ET LES MOYENNES DE CHARGE DU RAVAL SE DÉDUISENT DE SA FICHE, sans base
 * tierce : le constructeur annonce 10 → 80 % en 23 à 24 minutes. Sur 38,5 kWh,
 * cela fait 27 kWh en 23 min, soit 70 kW soutenus ; sur 51,5 kWh, 36 kWh en
 * 24 min, soit 90 kW. C'est la même grandeur que celle relevée pour les autres
 * modèles, obtenue par le calcul plutôt que par une lecture.
 *
 * LA PUISSANCE MOYENNE, RELEVÉE LE 02/09 SUR HUIT MODÈLES. Une borne ne tient
 * jamais sa pointe : EV Database publie, à côté d'elle, la puissance MOYENNE
 * d'une session de 10 à 80 %, et l'écart est considérable.
 *
 *   VinFast VF 8 Plus     150 → 105 kW   (0,70)
 *   Tesla Model Y Premium 250 → 125 kW   (0,50)
 *   Tesla Model 3 2026    175 → 110 kW   (0,63)
 *   BYD Atto 3 EVO        220 → 130 kW   (0,59)
 *   DS N°7 74 kWh         160 →  90 kW   (0,56)
 *   Cupra Raval Endurance 105 →  95 kW   (0,90)
 *   VW ID. Polo 52 kWh    105 →  95 kW   (0,90)
 *
 * MÉDIANE 0,63, et une tendance nette : plus la pointe est haute, moins elle
 * se tient. C'est physique — une pointe de 250 kW ne dure que quelques
 * pourcents de charge, une pointe de 105 kW se maintient presque jusqu'à 80 %.
 *
 * LÀ OÙ LE CHAMP EST ABSENT, le planificateur applique sa propre règle et le
 * DIT. Mesuré vaut mieux que modélisé ; modélisé vaut mieux qu'optimiste.
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
  /* LA PUISSANCE MOYENNE D'UNE SESSION 10 → 80 %, en kW (RECHARGE-1, 02/09).
     C'EST ELLE QUI DÉCIDE D'UN TEMPS DE CHARGE, pas la pointe : une borne ne
     tient jamais sa pointe, elle décroît dès les premiers pourcents. Armelin,
     02/09 : « il me dit 23 minutes de recharge… c'est très très optimiste » et
     « quand 16 min de charge sont affichées, j'en fais généralement 5 à 10 de
     plus ».
     ELLE EST RELEVÉE, JAMAIS DÉDUITE : EV Database la publie modèle par
     modèle, et le champ reste ABSENT là où je ne l'ai pas lue — le modèle du
     planificateur prend alors le relais, et il dit qu'il estime. */
  puissanceMoyenneKw?: number;
  /** Bridage BMS de la charge sous 0 °C d'air, en kW — quand un RELEVÉ le
      documente ; jamais deviné. */
  puissanceFroidKw?: number;
  /** Bridage BMS de la charge par batterie très chaude (canicule), en kW. */
  puissanceChaudKw?: number;
  /** Autonomie WLTP en km. Optimiste : voir l'en-tête. */
  wltpKm: number;
  /** Standard de charge rapide de ce modèle. */
  prise: ClePrise;
  /* LES ANNÉES DE LA GÉNÉRATION, quand plusieurs se croisent sous le même
     nom. Armelin, le 27/08/2026 : « un Xpeng G6 2024 n'a pas les mêmes
     caractéristiques que les nouveaux Xpeng G6 2026 » — et c'est vrai :
     batterie, pointe de charge et autonomie changent sans que le nom bouge.
     Le champ n'est REMPLI QUE LÀ OÙ IL EST SOURCÉ : une année devinée serait
     pire qu'une absence. */
  annees?: string;
}

/* La liste couvre les modèles les plus répandus sur les routes françaises,
   plus quelques-uns rares mais demandés. Elle n'a pas vocation à
   l'exhaustivité : un catalogue de six cents lignes serait ingérable à la
   main, et illisible dans une liste déroulante. */
/* LA LISTE COUVRE LES MODÈLES VENDUS EN FRANCE, groupés par marque.
   Armelin, le 26/08/2026 : « augmente la liste des constructeurs
   automobiles et augmente le nombre de voitures et regroupe-les par
   marques ». Il manquait notamment XPENG, Mercedes, ZEEKR, les VF 6 et
   VF 8 Plus de VinFast, la gamme ID de Volkswagen et les e-2008/e-5008
   de Peugeot — c'est-à-dire, pour plusieurs d'entre eux, des voitures
   qu'on croise tous les jours.

   ELLE N'A TOUJOURS PAS VOCATION À L'EXHAUSTIVITÉ : un catalogue de six
   cents lignes serait ingérable à la main et illisible dans une liste.
   Mais elle doit couvrir ce qu'on voit sur les routes, et l'ordre
   alphabétique par marque permet d'y retrouver la sienne sans lire tout. */
export const CATALOGUE: readonly ModeleVehicule[] = [
  // — Alpine —
  { cle: 'alpine-a290', marque: 'Alpine', modele: 'A290', capaciteKwh: 52, puissanceMaxKw: 100, wltpKm: 380, prise: 'combo_ccs' },
  { cle: 'alpine-a390', marque: 'Alpine', modele: 'A390', capaciteKwh: 89, puissanceMaxKw: 150, wltpKm: 555, prise: 'combo_ccs' },

  // — Audi —
  { cle: 'audi-q4-45', marque: 'Audi', modele: 'Q4 e-tron', variante: '45', capaciteKwh: 77, puissanceMaxKw: 175, wltpKm: 562, prise: 'combo_ccs' },
  { cle: 'audi-q6-etron', marque: 'Audi', modele: 'Q6 e-tron', capaciteKwh: 94.9, puissanceMaxKw: 260, wltpKm: 625, prise: 'combo_ccs' },
  { cle: 'audi-q8-etron', marque: 'Audi', modele: 'Q8 e-tron', variante: '55', capaciteKwh: 106, puissanceMaxKw: 170, wltpKm: 582, prise: 'combo_ccs' },
  { cle: 'audi-a6-etron', marque: 'Audi', modele: 'A6 e-tron', capaciteKwh: 94.9, puissanceMaxKw: 270, wltpKm: 720, prise: 'combo_ccs' },

  // — BMW —
  { cle: 'bmw-i3-42', marque: 'BMW', modele: 'i3', variante: '120 Ah', capaciteKwh: 37.9, puissanceMaxKw: 50, wltpKm: 310, prise: 'combo_ccs' },
  { cle: 'bmw-ix1', marque: 'BMW', modele: 'iX1', variante: 'xDrive30', capaciteKwh: 64.7, puissanceMaxKw: 130, wltpKm: 440, prise: 'combo_ccs' },
  { cle: 'bmw-ix3', marque: 'BMW', modele: 'iX3', capaciteKwh: 74, puissanceMaxKw: 150, wltpKm: 460, prise: 'combo_ccs' },
  { cle: 'bmw-i4-40', marque: 'BMW', modele: 'i4', variante: 'eDrive40', capaciteKwh: 80.7, puissanceMaxKw: 205, wltpKm: 590, prise: 'combo_ccs' },
  { cle: 'bmw-i5-40', marque: 'BMW', modele: 'i5', variante: 'eDrive40', capaciteKwh: 81.2, puissanceMaxKw: 205, wltpKm: 582, prise: 'combo_ccs' },
  { cle: 'bmw-ix-xdrive50', marque: 'BMW', modele: 'iX', variante: 'xDrive50', capaciteKwh: 105.2, puissanceMaxKw: 195, wltpKm: 630, prise: 'combo_ccs' },

  // — BYD —
  { cle: 'byd-atto2', marque: 'BYD', modele: 'Atto 2', capaciteKwh: 42.4, puissanceMaxKw: 65, wltpKm: 312, prise: 'combo_ccs' },
  { cle: 'byd-dolphin', marque: 'BYD', modele: 'Dolphin', variante: 'Comfort', capaciteKwh: 60.4, puissanceMaxKw: 88, wltpKm: 427, prise: 'combo_ccs' },
  { cle: 'byd-atto3', marque: 'BYD', modele: 'Atto 3', capaciteKwh: 60.4, puissanceMaxKw: 88, wltpKm: 420, prise: 'combo_ccs' },
  { cle: 'byd-seal', marque: 'BYD', modele: 'Seal', variante: 'Design', capaciteKwh: 82.5, puissanceMaxKw: 150, wltpKm: 570, prise: 'combo_ccs' },
  { cle: 'byd-sealion7', marque: 'BYD', modele: 'Sealion 7', capaciteKwh: 82.5, puissanceMaxKw: 150, wltpKm: 502, prise: 'combo_ccs' },
  { cle: 'byd-sealu', marque: 'BYD', modele: 'Seal U', capaciteKwh: 71.8, puissanceMaxKw: 115, wltpKm: 420, prise: 'combo_ccs' },
  { cle: 'byd-tang', marque: 'BYD', modele: 'Tang', capaciteKwh: 108.8, puissanceMaxKw: 170, wltpKm: 530, prise: 'combo_ccs' },
  { cle: 'byd-atto3-evo-rwd', marque: 'BYD', modele: 'Atto 3 EVO', variante: 'Design propulsion', capaciteKwh: 74.8, puissanceMaxKw: 220, wltpKm: 510, puissanceMoyenneKw: 130, prise: 'combo_ccs', annees: '2026' },
  { cle: 'byd-atto3-evo-awd', marque: 'BYD', modele: 'Atto 3 EVO', variante: 'Excellence intégrale', capaciteKwh: 74.8, puissanceMaxKw: 220, wltpKm: 470, puissanceMoyenneKw: 130, prise: 'combo_ccs', annees: '2026' },

  // — Citroën —
  { cle: 'citroen-ec3', marque: 'Citroën', modele: 'ë-C3', capaciteKwh: 44, puissanceMaxKw: 100, wltpKm: 320, prise: 'combo_ccs' },
  { cle: 'citroen-ec3-aircross', marque: 'Citroën', modele: 'ë-C3 Aircross', capaciteKwh: 44, puissanceMaxKw: 100, wltpKm: 300, prise: 'combo_ccs' },
  { cle: 'citroen-ec4', marque: 'Citroën', modele: 'ë-C4', variante: '50 kWh', capaciteKwh: 46.3, puissanceMaxKw: 100, wltpKm: 357, prise: 'combo_ccs' },
  { cle: 'citroen-ec4-54', marque: 'Citroën', modele: 'ë-C4', variante: '54 kWh', capaciteKwh: 50, puissanceMaxKw: 100, wltpKm: 420, prise: 'combo_ccs' },
  { cle: 'citroen-ec5-aircross', marque: 'Citroën', modele: 'ë-C5 Aircross', capaciteKwh: 73, puissanceMaxKw: 160, wltpKm: 520, prise: 'combo_ccs' },

  // — Cupra —
  { cle: 'cupra-born-58', marque: 'Cupra', modele: 'Born', variante: '58 kWh', capaciteKwh: 58, puissanceMaxKw: 120, wltpKm: 420, prise: 'combo_ccs' },
  { cle: 'cupra-born-77', marque: 'Cupra', modele: 'Born', variante: '77 kWh', capaciteKwh: 77, puissanceMaxKw: 170, wltpKm: 548, prise: 'combo_ccs' },
  { cle: 'cupra-tavascan', marque: 'Cupra', modele: 'Tavascan', capaciteKwh: 77, puissanceMaxKw: 135, wltpKm: 549, prise: 'combo_ccs' },
  { cle: 'cupra-raval-plus', marque: 'Cupra', modele: 'Raval', variante: 'Plus 135 ch', capaciteKwh: 38.5, puissanceMaxKw: 90, wltpKm: 328, puissanceMoyenneKw: 70, prise: 'combo_ccs', annees: '2026' },
  { cle: 'cupra-raval-endurance', marque: 'Cupra', modele: 'Raval', variante: 'Endurance 211 ch', capaciteKwh: 51.5, puissanceMaxKw: 105, wltpKm: 446, puissanceMoyenneKw: 90, prise: 'combo_ccs', annees: '2026' },
  { cle: 'cupra-raval-vz', marque: 'Cupra', modele: 'Raval', variante: 'VZ 226 ch', capaciteKwh: 51.5, puissanceMaxKw: 105, wltpKm: 387, puissanceMoyenneKw: 90, prise: 'combo_ccs', annees: '2026' },

  // — Dacia —
  { cle: 'dacia-spring', marque: 'Dacia', modele: 'Spring', capaciteKwh: 26.8, puissanceMaxKw: 30, wltpKm: 225, prise: 'combo_ccs' },

  // — DS —
  { cle: 'ds-n4', marque: 'DS', modele: 'N°4', variante: '54 kWh', capaciteKwh: 50, puissanceMaxKw: 100, wltpKm: 450, prise: 'combo_ccs' },
  { cle: 'ds-n8', marque: 'DS', modele: 'N°8', capaciteKwh: 97.2, puissanceMaxKw: 160, wltpKm: 750, prise: 'combo_ccs' },
  { cle: 'ds-n7-74', marque: 'DS', modele: 'N°7', variante: '74 kWh', capaciteKwh: 73.7, puissanceMaxKw: 160, wltpKm: 543, puissanceMoyenneKw: 90, prise: 'combo_ccs', annees: '2026' },
  { cle: 'ds-n7-97', marque: 'DS', modele: 'N°7', variante: 'Grande autonomie 97 kWh', capaciteKwh: 97.2, puissanceMaxKw: 160, wltpKm: 739, prise: 'combo_ccs', annees: '2026' },
  { cle: 'ds-n7-97-awd', marque: 'DS', modele: 'N°7', variante: 'Grande autonomie intégrale', capaciteKwh: 97.2, puissanceMaxKw: 160, wltpKm: 679, prise: 'combo_ccs', annees: '2026' },
  { cle: 'ds-3-etense', marque: 'DS', modele: 'DS 3', variante: 'E-Tense 54 kWh', capaciteKwh: 50.8, puissanceMaxKw: 107, wltpKm: 404, prise: 'combo_ccs', annees: '2023-2026' },

  // — Fiat —
  { cle: 'fiat-500e-24', marque: 'Fiat', modele: '500e', variante: '24 kWh', capaciteKwh: 21.3, puissanceMaxKw: 50, wltpKm: 190, prise: 'combo_ccs' },
  { cle: 'fiat-500e-42', marque: 'Fiat', modele: '500e', variante: '42 kWh', capaciteKwh: 37.3, puissanceMaxKw: 85, wltpKm: 320, prise: 'combo_ccs' },
  { cle: 'fiat-600e', marque: 'Fiat', modele: '600e', capaciteKwh: 50.8, puissanceMaxKw: 100, wltpKm: 409, prise: 'combo_ccs' },
  { cle: 'fiat-grande-panda', marque: 'Fiat', modele: 'Grande Panda', capaciteKwh: 44, puissanceMaxKw: 100, wltpKm: 320, prise: 'combo_ccs' },

  // — Ford —
  { cle: 'ford-explorer-ev', marque: 'Ford', modele: 'Explorer EV', variante: 'Extended', capaciteKwh: 77, puissanceMaxKw: 135, wltpKm: 602, prise: 'combo_ccs' },
  { cle: 'ford-capri-ev', marque: 'Ford', modele: 'Capri EV', variante: 'Extended', capaciteKwh: 77, puissanceMaxKw: 135, wltpKm: 627, prise: 'combo_ccs' },
  { cle: 'ford-mustang-mache', marque: 'Ford', modele: 'Mustang Mach-E', variante: 'Extended', capaciteKwh: 91, puissanceMaxKw: 150, wltpKm: 600, prise: 'combo_ccs' },

  // — Honda —
  { cle: 'honda-e-ny1', marque: 'Honda', modele: 'e:Ny1', capaciteKwh: 61.9, puissanceMaxKw: 78, wltpKm: 412, prise: 'combo_ccs' },

  // — Hyundai —
  { cle: 'hyundai-inster', marque: 'Hyundai', modele: 'Inster', variante: 'Long Range', capaciteKwh: 49, puissanceMaxKw: 85, wltpKm: 370, prise: 'combo_ccs' },
  { cle: 'hyundai-kona-65', marque: 'Hyundai', modele: 'Kona Electric', variante: '65 kWh', capaciteKwh: 65.4, puissanceMaxKw: 102, wltpKm: 514, prise: 'combo_ccs' },
  { cle: 'hyundai-ioniq5-77', marque: 'Hyundai', modele: 'Ioniq 5', variante: '77,4 kWh', capaciteKwh: 77.4, puissanceMaxKw: 235, wltpKm: 507, prise: 'combo_ccs' },
  { cle: 'hyundai-ioniq5-84', marque: 'Hyundai', modele: 'Ioniq 5', variante: '84 kWh', capaciteKwh: 84, puissanceMaxKw: 257, wltpKm: 570, prise: 'combo_ccs' },
  { cle: 'hyundai-ioniq6', marque: 'Hyundai', modele: 'Ioniq 6', variante: '77,4 kWh', capaciteKwh: 77.4, puissanceMaxKw: 233, wltpKm: 614, prise: 'combo_ccs' },
  { cle: 'hyundai-ioniq9', marque: 'Hyundai', modele: 'Ioniq 9', capaciteKwh: 110.3, puissanceMaxKw: 233, wltpKm: 620, prise: 'combo_ccs' },

  // — Jeep —
  { cle: 'jeep-avenger-ev', marque: 'Jeep', modele: 'Avenger', variante: 'Electric', capaciteKwh: 50.8, puissanceMaxKw: 100, wltpKm: 400, prise: 'combo_ccs' },

  // — Kia —
  { cle: 'kia-ev3-58', marque: 'Kia', modele: 'EV3', variante: '58,3 kWh', capaciteKwh: 58.3, puissanceMaxKw: 100, wltpKm: 436, prise: 'combo_ccs' },
  { cle: 'kia-ev3-81', marque: 'Kia', modele: 'EV3', variante: '81,4 kWh', capaciteKwh: 81.4, puissanceMaxKw: 128, wltpKm: 605, prise: 'combo_ccs' },
  { cle: 'kia-niro-ev', marque: 'Kia', modele: 'Niro EV', capaciteKwh: 64.8, puissanceMaxKw: 80, wltpKm: 460, prise: 'combo_ccs' },
  { cle: 'kia-ev6-77', marque: 'Kia', modele: 'EV6', variante: '77,4 kWh', capaciteKwh: 77.4, puissanceMaxKw: 240, wltpKm: 528, prise: 'combo_ccs' },
  { cle: 'kia-ev6-84', marque: 'Kia', modele: 'EV6', variante: '84 kWh', capaciteKwh: 84, puissanceMaxKw: 258, wltpKm: 582, prise: 'combo_ccs' },
  { cle: 'kia-ev9', marque: 'Kia', modele: 'EV9', variante: '99,8 kWh', capaciteKwh: 99.8, puissanceMaxKw: 233, wltpKm: 563, prise: 'combo_ccs' },

  // — Leapmotor —
  { cle: 'leapmotor-t03', marque: 'Leapmotor', modele: 'T03', capaciteKwh: 37.3, puissanceMaxKw: 48, wltpKm: 265, prise: 'combo_ccs' },
  { cle: 'leapmotor-c10', marque: 'Leapmotor', modele: 'C10', capaciteKwh: 69.9, puissanceMaxKw: 84, wltpKm: 420, prise: 'combo_ccs' },

  // — Mercedes-Benz —
  { cle: 'mercedes-eqa-250', marque: 'Mercedes-Benz', modele: 'EQA', variante: '250+', capaciteKwh: 70.5, puissanceMaxKw: 110, wltpKm: 560, prise: 'combo_ccs' },
  { cle: 'mercedes-eqb-250', marque: 'Mercedes-Benz', modele: 'EQB', variante: '250+', capaciteKwh: 70.5, puissanceMaxKw: 100, wltpKm: 536, prise: 'combo_ccs' },
  { cle: 'mercedes-eqe-350', marque: 'Mercedes-Benz', modele: 'EQE', variante: '350+', capaciteKwh: 89, puissanceMaxKw: 170, wltpKm: 639, prise: 'combo_ccs' },
  { cle: 'mercedes-eqe-suv', marque: 'Mercedes-Benz', modele: 'EQE SUV', variante: '350+', capaciteKwh: 89, puissanceMaxKw: 170, wltpKm: 590, prise: 'combo_ccs' },
  { cle: 'mercedes-eqs-450', marque: 'Mercedes-Benz', modele: 'EQS', variante: '450+', capaciteKwh: 118, puissanceMaxKw: 200, wltpKm: 799, prise: 'combo_ccs' },
  { cle: 'mercedes-eqs-suv', marque: 'Mercedes-Benz', modele: 'EQS SUV', variante: '450 4MATIC', capaciteKwh: 118, puissanceMaxKw: 200, wltpKm: 656, prise: 'combo_ccs' },
  { cle: 'mercedes-cla-ev', marque: 'Mercedes-Benz', modele: 'CLA', variante: 'EQ 250+', capaciteKwh: 85, puissanceMaxKw: 320, wltpKm: 792, prise: 'combo_ccs' },

  // — MG —
  { cle: 'mg-cyberster', marque: 'MG', modele: 'Cyberster', variante: 'Propulsion 340 ch', capaciteKwh: 77, puissanceMaxKw: 144, wltpKm: 507, prise: 'combo_ccs' },
  { cle: 'mg4-51', marque: 'MG', modele: 'MG4', variante: 'Standard 51 kWh', capaciteKwh: 50.8, puissanceMaxKw: 117, wltpKm: 350, prise: 'combo_ccs' },
  { cle: 'mg4-64', marque: 'MG', modele: 'MG4', variante: 'Comfort 64 kWh', capaciteKwh: 61.7, puissanceMaxKw: 140, wltpKm: 435, prise: 'combo_ccs' },
  { cle: 'mg-zs-ev', marque: 'MG', modele: 'ZS EV', variante: 'Long Range', capaciteKwh: 68.3, puissanceMaxKw: 92, wltpKm: 440, prise: 'combo_ccs' },
  { cle: 'mg-mg5', marque: 'MG', modele: 'MG5', variante: 'Long Range', capaciteKwh: 57.4, puissanceMaxKw: 87, wltpKm: 400, prise: 'combo_ccs' },
  { cle: 'mg-s5', marque: 'MG', modele: 'S5 EV', variante: '64 kWh', capaciteKwh: 62, puissanceMaxKw: 139, wltpKm: 480, prise: 'combo_ccs' },

  // — Mini —
  { cle: 'mini-cooper-se', marque: 'Mini', modele: 'Cooper SE', capaciteKwh: 49.2, puissanceMaxKw: 95, wltpKm: 402, prise: 'combo_ccs' },
  { cle: 'mini-countryman-e', marque: 'Mini', modele: 'Countryman E', capaciteKwh: 64.7, puissanceMaxKw: 130, wltpKm: 462, prise: 'combo_ccs' },

  // — Nissan —
  { cle: 'nissan-leaf-40', marque: 'Nissan', modele: 'Leaf', variante: '40 kWh', capaciteKwh: 39, puissanceMaxKw: 46, wltpKm: 270, prise: 'chademo' },
  { cle: 'nissan-leaf-62', marque: 'Nissan', modele: 'Leaf', variante: 'e+ 62 kWh', capaciteKwh: 59, puissanceMaxKw: 100, wltpKm: 385, prise: 'chademo' },
  { cle: 'nissan-ariya-87', marque: 'Nissan', modele: 'Ariya', variante: '87 kWh', capaciteKwh: 87, puissanceMaxKw: 130, wltpKm: 533, prise: 'combo_ccs' },
  { cle: 'nissan-micra-ev', marque: 'Nissan', modele: 'Micra', variante: '52 kWh', capaciteKwh: 52, puissanceMaxKw: 100, wltpKm: 408, prise: 'combo_ccs' },

  // — Opel —
  { cle: 'opel-corsa-e', marque: 'Opel', modele: 'Corsa Electric', capaciteKwh: 46.3, puissanceMaxKw: 100, wltpKm: 357, prise: 'combo_ccs' },
  { cle: 'opel-mokka-e', marque: 'Opel', modele: 'Mokka Electric', capaciteKwh: 50, puissanceMaxKw: 100, wltpKm: 403, prise: 'combo_ccs' },
  { cle: 'opel-astra-e', marque: 'Opel', modele: 'Astra Electric', capaciteKwh: 51, puissanceMaxKw: 100, wltpKm: 418, prise: 'combo_ccs' },
  { cle: 'opel-frontera-e', marque: 'Opel', modele: 'Frontera Electric', capaciteKwh: 44, puissanceMaxKw: 100, wltpKm: 305, prise: 'combo_ccs' },

  // — Peugeot —
  { cle: 'peugeot-e208-50', marque: 'Peugeot', modele: 'e-208', variante: '50 kWh', capaciteKwh: 46.3, puissanceMaxKw: 100, wltpKm: 362, prise: 'combo_ccs' },
  { cle: 'peugeot-e208-51', marque: 'Peugeot', modele: 'e-208', variante: '51 kWh', capaciteKwh: 48.1, puissanceMaxKw: 100, wltpKm: 410, prise: 'combo_ccs' },
  { cle: 'peugeot-e2008-50', marque: 'Peugeot', modele: 'e-2008', variante: '50 kWh', capaciteKwh: 46.3, puissanceMaxKw: 100, wltpKm: 345, prise: 'combo_ccs' },
  { cle: 'peugeot-e2008-54', marque: 'Peugeot', modele: 'e-2008', variante: '54 kWh', capaciteKwh: 51, puissanceMaxKw: 100, wltpKm: 406, prise: 'combo_ccs' },
  { cle: 'peugeot-e308', marque: 'Peugeot', modele: 'e-308', capaciteKwh: 51, puissanceMaxKw: 100, wltpKm: 410, prise: 'combo_ccs' },
  { cle: 'peugeot-e3008-73', marque: 'Peugeot', modele: 'e-3008', variante: '73 kWh', capaciteKwh: 73, puissanceMaxKw: 160, wltpKm: 525, prise: 'combo_ccs' },
  { cle: 'peugeot-e3008-98', marque: 'Peugeot', modele: 'e-3008', variante: '98 kWh', capaciteKwh: 96.9, puissanceMaxKw: 160, wltpKm: 700, prise: 'combo_ccs' },
  { cle: 'peugeot-e5008-73', marque: 'Peugeot', modele: 'e-5008', variante: '73 kWh', capaciteKwh: 73, puissanceMaxKw: 160, wltpKm: 502, prise: 'combo_ccs' },
  { cle: 'peugeot-e5008-98', marque: 'Peugeot', modele: 'e-5008', variante: '98 kWh', capaciteKwh: 96.9, puissanceMaxKw: 160, wltpKm: 668, prise: 'combo_ccs' },
  { cle: 'peugeot-eexpert', marque: 'Peugeot', modele: 'e-Expert', variante: '75 kWh', capaciteKwh: 75, puissanceMaxKw: 100, wltpKm: 350, prise: 'combo_ccs' },

  // — Polestar —
  { cle: 'polestar-2-lr', marque: 'Polestar', modele: '2', variante: 'Long Range', capaciteKwh: 79, puissanceMaxKw: 205, wltpKm: 654, prise: 'combo_ccs' },
  { cle: 'polestar-3', marque: 'Polestar', modele: '3', variante: 'Long Range', capaciteKwh: 107, puissanceMaxKw: 250, wltpKm: 631, prise: 'combo_ccs' },
  { cle: 'polestar-4', marque: 'Polestar', modele: '4', variante: 'Long Range', capaciteKwh: 100, puissanceMaxKw: 200, wltpKm: 620, prise: 'combo_ccs' },

  // — Renault —
  { cle: 'renault-twingo-e', marque: 'Renault', modele: 'Twingo E-Tech', capaciteKwh: 21.3, puissanceMaxKw: 22, wltpKm: 190, prise: 'type_2' },
  { cle: 'renault-zoe-52', marque: 'Renault', modele: 'Zoe', variante: 'R135 52 kWh', capaciteKwh: 52, puissanceMaxKw: 46, wltpKm: 395, prise: 'combo_ccs' },
  { cle: 'renault-5-40', marque: 'Renault', modele: 'R5 E-Tech', variante: '40 kWh', capaciteKwh: 40, puissanceMaxKw: 80, wltpKm: 312, prise: 'combo_ccs' },
  { cle: 'renault-5-52', marque: 'Renault', modele: 'R5 E-Tech', variante: '52 kWh', capaciteKwh: 52, puissanceMaxKw: 100, wltpKm: 410, prise: 'combo_ccs' },
  { cle: 'renault-4-52', marque: 'Renault', modele: 'R4 E-Tech', variante: '52 kWh', capaciteKwh: 52, puissanceMaxKw: 100, wltpKm: 409, prise: 'combo_ccs' },
  { cle: 'renault-megane-60', marque: 'Renault', modele: 'Mégane E-Tech', variante: 'EV60', capaciteKwh: 60, puissanceMaxKw: 130, wltpKm: 470, prise: 'combo_ccs' },
  { cle: 'renault-scenic-87', marque: 'Renault', modele: 'Scénic E-Tech', variante: 'Grande Autonomie', capaciteKwh: 87, puissanceMaxKw: 150, wltpKm: 625, prise: 'combo_ccs' },
  { cle: 'renault-kangoo-ev', marque: 'Renault', modele: 'Kangoo E-Tech', capaciteKwh: 45, puissanceMaxKw: 80, wltpKm: 285, prise: 'combo_ccs' },

  // — Škoda —
  { cle: 'skoda-elroq-60', marque: 'Škoda', modele: 'Elroq', variante: '60', capaciteKwh: 59, puissanceMaxKw: 165, wltpKm: 400, prise: 'combo_ccs' },
  { cle: 'skoda-elroq-85', marque: 'Škoda', modele: 'Elroq', variante: '85', capaciteKwh: 77, puissanceMaxKw: 175, wltpKm: 581, prise: 'combo_ccs' },
  { cle: 'skoda-enyaq-85', marque: 'Škoda', modele: 'Enyaq', variante: '85', capaciteKwh: 77, puissanceMaxKw: 175, wltpKm: 570, prise: 'combo_ccs' },

  // — Smart —
  { cle: 'smart-1', marque: 'Smart', modele: '#1', variante: 'Premium', capaciteKwh: 62, puissanceMaxKw: 150, wltpKm: 440, prise: 'combo_ccs' },
  { cle: 'smart-3', marque: 'Smart', modele: '#3', variante: 'Premium', capaciteKwh: 62, puissanceMaxKw: 150, wltpKm: 455, prise: 'combo_ccs' },
  { cle: 'smart-5', marque: 'Smart', modele: '#5', capaciteKwh: 94, puissanceMaxKw: 400, wltpKm: 590, prise: 'combo_ccs' },

  // — Tesla —
  { cle: 'tesla-m3-sr', marque: 'Tesla', modele: 'Model 3', variante: 'Propulsion', capaciteKwh: 57.5, puissanceMaxKw: 170, wltpKm: 513, prise: 'combo_ccs' },
  { cle: 'tesla-m3-lr', marque: 'Tesla', modele: 'Model 3', variante: 'Grande Autonomie', capaciteKwh: 75, puissanceMaxKw: 250, wltpKm: 629, prise: 'combo_ccs' },
  { cle: 'tesla-my-sr', marque: 'Tesla', modele: 'Model Y', variante: 'Propulsion', capaciteKwh: 57.5, puissanceMaxKw: 170, wltpKm: 455, prise: 'combo_ccs' },
  { cle: 'tesla-my-lr', marque: 'Tesla', modele: 'Model Y', variante: 'Grande Autonomie', capaciteKwh: 75, puissanceMaxKw: 250, wltpKm: 600, prise: 'combo_ccs' },
  { cle: 'tesla-ms-lr', marque: 'Tesla', modele: 'Model S', variante: 'Grande Autonomie', capaciteKwh: 95, puissanceMaxKw: 250, wltpKm: 634, prise: 'combo_ccs' },
  { cle: 'tesla-mx-lr', marque: 'Tesla', modele: 'Model X', variante: 'Grande Autonomie', capaciteKwh: 95, puissanceMaxKw: 250, wltpKm: 576, prise: 'combo_ccs' },
  { cle: 'tesla-m3-rwd-26', marque: 'Tesla', modele: 'Model 3', variante: 'Propulsion 2026', capaciteKwh: 60, puissanceMaxKw: 175, wltpKm: 534, puissanceMoyenneKw: 110, prise: 'combo_ccs', annees: '2025-2026' },
  { cle: 'tesla-m3-premium-rwd-26', marque: 'Tesla', modele: 'Model 3', variante: 'Premium propulsion 2026', capaciteKwh: 79, puissanceMaxKw: 250, wltpKm: 750, prise: 'combo_ccs', annees: '2026' },
  { cle: 'tesla-m3-premium-awd-26', marque: 'Tesla', modele: 'Model 3', variante: 'Premium intégrale 2026', capaciteKwh: 79, puissanceMaxKw: 250, wltpKm: 716, prise: 'combo_ccs', annees: '2026' },
  { cle: 'tesla-my-rwd-26', marque: 'Tesla', modele: 'Model Y', variante: 'Propulsion 2026', capaciteKwh: 60, puissanceMaxKw: 175, wltpKm: 534, prise: 'combo_ccs', annees: '2025-2026' },
  { cle: 'tesla-my-premium-rwd-26', marque: 'Tesla', modele: 'Model Y', variante: 'Premium propulsion 2026', capaciteKwh: 74, puissanceMaxKw: 250, wltpKm: 603, prise: 'combo_ccs', annees: '2026' },
  { cle: 'tesla-my-premium-awd-26', marque: 'Tesla', modele: 'Model Y', variante: 'Premium intégrale 2026', capaciteKwh: 79, puissanceMaxKw: 250, wltpKm: 629, puissanceMoyenneKw: 125, prise: 'combo_ccs', annees: '2025-2026' },
  { cle: 'tesla-ms-plaid-26', marque: 'Tesla', modele: 'Model S', variante: 'Plaid 2026', capaciteKwh: 95, puissanceMaxKw: 250, wltpKm: 611, prise: 'combo_ccs', annees: '2025-2026' },
  { cle: 'tesla-mx-plaid-26', marque: 'Tesla', modele: 'Model X', variante: 'Plaid 2026', capaciteKwh: 95, puissanceMaxKw: 250, wltpKm: 567, prise: 'combo_ccs', annees: '2025-2026' },

  // — Toyota —
  { cle: 'toyota-bz4x', marque: 'Toyota', modele: 'bZ4X', capaciteKwh: 64, puissanceMaxKw: 150, wltpKm: 516, prise: 'combo_ccs' },
  { cle: 'toyota-urban-cruiser', marque: 'Toyota', modele: 'Urban Cruiser', variante: '61 kWh', capaciteKwh: 61, puissanceMaxKw: 67, wltpKm: 430, prise: 'combo_ccs' },

  // — VinFast —
  { cle: 'vinfast-vf6-eco', marque: 'VinFast', modele: 'VF 6', variante: 'Eco', capaciteKwh: 59.6, puissanceMaxKw: 60, wltpKm: 399, prise: 'combo_ccs' },
  { cle: 'vinfast-vf6-plus', marque: 'VinFast', modele: 'VF 6', variante: 'Plus', capaciteKwh: 59.6, puissanceMaxKw: 60, wltpKm: 381, prise: 'combo_ccs' },
  { cle: 'vinfast-vf7-eco', marque: 'VinFast', modele: 'VF 7', variante: 'Eco', capaciteKwh: 70.8, puissanceMaxKw: 100, wltpKm: 450, prise: 'combo_ccs' },
  /* BRIDAGES THERMIQUES DU VF 8 : relevés d'Armelin sur SON véhicule
     (28/08/2026) — « 60 kW à 43 °C de batterie, 30 kW à 45 °C ; sous 0 °C
     je ne dépasse pas 30 kW ». Seuls des RELEVÉS entrent ici. */
  { cle: 'vinfast-vf8', marque: 'VinFast', modele: 'VF 8', variante: 'Eco', capaciteKwh: 82.4, puissanceMaxKw: 150, wltpKm: 447, prise: 'combo_ccs', puissanceFroidKw: 30, puissanceChaudKw: 60 },
  { cle: 'vinfast-vf8-plus', marque: 'VinFast', modele: 'VF 8', variante: 'Plus', capaciteKwh: 87.7, puissanceMaxKw: 150, wltpKm: 457, puissanceMoyenneKw: 105, prise: 'combo_ccs', puissanceFroidKw: 30, puissanceChaudKw: 60 },
  { cle: 'vinfast-vf9', marque: 'VinFast', modele: 'VF 9', variante: 'Eco', capaciteKwh: 123, puissanceMaxKw: 150, wltpKm: 594, prise: 'combo_ccs' },

  // — Volkswagen —
  { cle: 'vw-id3-58', marque: 'Volkswagen', modele: 'ID.3', variante: 'Pro 58 kWh', capaciteKwh: 58, puissanceMaxKw: 120, wltpKm: 425, prise: 'combo_ccs' },
  { cle: 'vw-id3-77', marque: 'Volkswagen', modele: 'ID.3', variante: 'Pro S 77 kWh', capaciteKwh: 77, puissanceMaxKw: 170, wltpKm: 557, prise: 'combo_ccs' },
  { cle: 'vw-id4-52', marque: 'Volkswagen', modele: 'ID.4', variante: 'Pure 52 kWh', capaciteKwh: 52, puissanceMaxKw: 115, wltpKm: 357, prise: 'combo_ccs' },
  { cle: 'vw-id4-77', marque: 'Volkswagen', modele: 'ID.4', variante: 'Pro 77 kWh', capaciteKwh: 77, puissanceMaxKw: 175, wltpKm: 550, prise: 'combo_ccs' },
  { cle: 'vw-id5-77', marque: 'Volkswagen', modele: 'ID.5', variante: 'Pro 77 kWh', capaciteKwh: 77, puissanceMaxKw: 175, wltpKm: 559, prise: 'combo_ccs' },
  { cle: 'vw-id7-77', marque: 'Volkswagen', modele: 'ID.7', variante: 'Pro 77 kWh', capaciteKwh: 77, puissanceMaxKw: 175, wltpKm: 621, prise: 'combo_ccs' },
  { cle: 'vw-id7-86', marque: 'Volkswagen', modele: 'ID.7', variante: 'Pro S 86 kWh', capaciteKwh: 86, puissanceMaxKw: 200, wltpKm: 709, prise: 'combo_ccs' },
  { cle: 'vw-idbuzz-79', marque: 'Volkswagen', modele: 'ID. Buzz', variante: 'Pro 79 kWh', capaciteKwh: 79, puissanceMaxKw: 185, wltpKm: 481, prise: 'combo_ccs' },
  { cle: 'vw-idbuzz-86', marque: 'Volkswagen', modele: 'ID. Buzz', variante: 'LWB 86 kWh', capaciteKwh: 86, puissanceMaxKw: 200, wltpKm: 484, prise: 'combo_ccs' },
  { cle: 'vw-id-polo-trend-37', marque: 'Volkswagen', modele: 'ID. Polo', variante: 'Trend 37 kWh', capaciteKwh: 37.5, puissanceMaxKw: 90, wltpKm: 323, prise: 'combo_ccs', annees: '2026' },
  { cle: 'vw-id-polo-life-37', marque: 'Volkswagen', modele: 'ID. Polo', variante: 'Life 37 kWh', capaciteKwh: 37.5, puissanceMaxKw: 90, wltpKm: 331, prise: 'combo_ccs', annees: '2026' },
  { cle: 'vw-id-polo-style-37', marque: 'Volkswagen', modele: 'ID. Polo', variante: 'Style 37 kWh', capaciteKwh: 37.5, puissanceMaxKw: 90, wltpKm: 330, prise: 'combo_ccs', annees: '2026' },
  { cle: 'vw-id-polo-life-52', marque: 'Volkswagen', modele: 'ID. Polo', variante: 'Life 52 kWh', capaciteKwh: 51.5, puissanceMaxKw: 90, wltpKm: 453, prise: 'combo_ccs', annees: '2026' },
  { cle: 'vw-id-polo-life-edition-52', marque: 'Volkswagen', modele: 'ID. Polo', variante: 'Life Edition 52 kWh', capaciteKwh: 51.5, puissanceMaxKw: 90, wltpKm: 453, prise: 'combo_ccs', annees: '2026' },
  { cle: 'vw-id-polo-style-52', marque: 'Volkswagen', modele: 'ID. Polo', variante: 'Style 52 kWh', capaciteKwh: 51.5, puissanceMaxKw: 90, wltpKm: 452, prise: 'combo_ccs', annees: '2026' },
  { cle: 'vw-id-polo-style-exclusive-52', marque: 'Volkswagen', modele: 'ID. Polo', variante: 'Style Exclusive 52 kWh', capaciteKwh: 51.5, puissanceMaxKw: 90, wltpKm: 442, prise: 'combo_ccs', annees: '2026' },

  // — Volvo —
  { cle: 'volvo-ex30-69', marque: 'Volvo', modele: 'EX30', variante: 'Extended Range', capaciteKwh: 64, puissanceMaxKw: 153, wltpKm: 476, prise: 'combo_ccs' },
  { cle: 'volvo-ex40', marque: 'Volvo', modele: 'EX40', variante: 'Extended Range', capaciteKwh: 78, puissanceMaxKw: 200, wltpKm: 573, prise: 'combo_ccs' },
  { cle: 'volvo-ec40', marque: 'Volvo', modele: 'EC40', variante: 'Extended Range', capaciteKwh: 78, puissanceMaxKw: 200, wltpKm: 573, prise: 'combo_ccs' },
  { cle: 'volvo-ex90', marque: 'Volvo', modele: 'EX90', capaciteKwh: 107, puissanceMaxKw: 250, wltpKm: 614, prise: 'combo_ccs' },

  // — XPENG —
  /* DEUX GÉNÉRATIONS DE G6 SE CROISENT SUR LES ROUTES, et leurs chiffres
     n'ont rien à voir : le restylage 2025 passe à une batterie LFP 5C de
     80,8 kWh sous 800 V, 451 kW en crête (10-80 % en 12 minutes), 525 km
     WLTP. Sources : fiches automobile-propre.com et largus.fr, 27/08/2026. */
  /* LE L03, ARRIVÉ EN CONCESSION EN 2026 (02/09). Je l'avais écarté la veille
     faute de savoir à quel véhicule le rattacher — XPENG ne cataloguait alors
     que des G6, G9, P7 et X9. Armelin a donné le configurateur officiel
     français, qui l'a tranché : c'est un modèle réel, avec quatre versions.
     D'OÙ VIENNENT CES CHIFFRES, ET POURQUOI PAS DE LA MÊME SOURCE QUE LES SIX
     AUTRES. Le modèle est trop récent pour avoir une fiche complète chez
     automobile-propre. Les capacités UTILES et les crêtes de charge viennent
     donc d'EV Database, qui distingue explicitement « usable » de la capacité
     brute — c'est le champ dont ce catalogue a besoin, et la raison même pour
     laquelle je refuse les communiqués.
     ET ELLES SONT RECOUPÉES : les 193 kW de la Standard Range figurent aussi
     sur le site officiel de XPENG France. Les autonomies WLTP sont celles du
     configurateur qu'Armelin a envoyé.
     LES DEUX « ULTRA » PARTAGENT LA BATTERIE DE LA LONG RANGE : leur autonomie
     plus faible vient des jantes de 20 pouces (480 km contre 520) et de la
     transmission intégrale (440 km) — pas d'un pack différent. */
  { cle: 'xpeng-l03-sr', marque: 'XPENG', modele: 'L03', variante: 'RWD Standard Range', annees: 'depuis 2026', capaciteKwh: 57, puissanceMaxKw: 193, wltpKm: 445, prise: 'combo_ccs' },
  { cle: 'xpeng-l03-lr', marque: 'XPENG', modele: 'L03', variante: 'RWD Long Range', annees: 'depuis 2026', capaciteKwh: 69.5, puissanceMaxKw: 236, wltpKm: 520, prise: 'combo_ccs' },
  { cle: 'xpeng-l03-lr-ultra', marque: 'XPENG', modele: 'L03', variante: 'RWD Long Range Ultra', annees: 'depuis 2026', capaciteKwh: 69.5, puissanceMaxKw: 236, wltpKm: 480, prise: 'combo_ccs' },
  { cle: 'xpeng-l03-awd', marque: 'XPENG', modele: 'L03', variante: 'AWD Performance Ultra', annees: 'depuis 2026', capaciteKwh: 69.5, puissanceMaxKw: 236, wltpKm: 440, prise: 'combo_ccs' },
  { cle: 'xpeng-g6-66', marque: 'XPENG', modele: 'G6', variante: 'Standard Range', annees: '2024-2025', capaciteKwh: 66, puissanceMaxKw: 215, wltpKm: 435, prise: 'combo_ccs' },
  { cle: 'xpeng-g6-87', marque: 'XPENG', modele: 'G6', variante: 'Long Range', annees: '2024-2025', capaciteKwh: 87.5, puissanceMaxKw: 280, wltpKm: 570, prise: 'combo_ccs' },
  { cle: 'xpeng-g6-81-2025', marque: 'XPENG', modele: 'G6', variante: 'Long Range restylé', annees: 'depuis 2025', capaciteKwh: 80.8, puissanceMaxKw: 451, wltpKm: 525, prise: 'combo_ccs' },
  { cle: 'xpeng-g9-78', marque: 'XPENG', modele: 'G9', variante: 'Standard Range', capaciteKwh: 78.2, puissanceMaxKw: 300, wltpKm: 460, prise: 'combo_ccs' },
  { cle: 'xpeng-g9-98', marque: 'XPENG', modele: 'G9', variante: 'Long Range', capaciteKwh: 98, puissanceMaxKw: 300, wltpKm: 570, prise: 'combo_ccs' },
  { cle: 'xpeng-p7-plus', marque: 'XPENG', modele: 'P7+', variante: 'Long Range', capaciteKwh: 76.3, puissanceMaxKw: 230, wltpKm: 550, prise: 'combo_ccs' },
  { cle: 'xpeng-x9', marque: 'XPENG', modele: 'X9', variante: 'Long Range', capaciteKwh: 84.5, puissanceMaxKw: 260, wltpKm: 500, prise: 'combo_ccs' },

  // — ZEEKR —
  { cle: 'zeekr-x-66', marque: 'ZEEKR', modele: 'X', variante: 'Long Range', capaciteKwh: 66, puissanceMaxKw: 150, wltpKm: 440, prise: 'combo_ccs' },
  { cle: 'zeekr-001-100', marque: 'ZEEKR', modele: '001', variante: 'Long Range', capaciteKwh: 100, puissanceMaxKw: 200, wltpKm: 620, prise: 'combo_ccs' },
  { cle: 'zeekr-7x-75', marque: 'ZEEKR', modele: '7X', variante: 'Standard', capaciteKwh: 75, puissanceMaxKw: 360, wltpKm: 480, prise: 'combo_ccs' },
  { cle: 'zeekr-7x-100', marque: 'ZEEKR', modele: '7X', variante: 'Long Range', capaciteKwh: 100, puissanceMaxKw: 360, wltpKm: 615, prise: 'combo_ccs' },
  { cle: 'zeekr-7gt', marque: 'ZEEKR', modele: '7 GT', variante: 'Long Range', capaciteKwh: 100, puissanceMaxKw: 360, wltpKm: 610, prise: 'combo_ccs' },
  { cle: 'zeekr-9x', marque: 'ZEEKR', modele: '9X', capaciteKwh: 116, puissanceMaxKw: 400, wltpKm: 630, prise: 'combo_ccs' },
] as const;

/**
 * Les marques du catalogue, dans l'ordre alphabétique, avec leurs modèles.
 *
 * POUR QUE LA LISTE SE PARCOURE. Cent trente modèles à plat forment un mur ;
 * groupés sous leur marque, on descend à la sienne et l'on s'arrête. C'est
 * exactement ce que `<optgroup>` sait faire, et cela ne coûte aucun script.
 */
export function parMarque(): { marque: string; modeles: ModeleVehicule[] }[] {
  const groupes = new Map<string, ModeleVehicule[]>();
  for (const m of CATALOGUE) {
    const liste = groupes.get(m.marque) ?? [];
    liste.push(m);
    groupes.set(m.marque, liste);
  }
  return [...groupes.entries()]
    .map(([marque, modeles]) => ({ marque, modeles }))
    .sort((a, b) => a.marque.localeCompare(b.marque, 'fr'));
}

/** Le libellé affiché DANS un groupe de marque : la marque y est déjà dite. */
/** Ce qui distingue le modèle dans sa marque : variante, et années quand
    plusieurs générations se croisent — « G6 (Long Range, 2024-2025) ». */
export function libelleDansMarque(m: ModeleVehicule): string {
  const precisions = [m.variante, m.annees].filter(Boolean).join(', ');
  return precisions ? `${m.modele} (${precisions})` : m.modele;
}

/** Le libellé affiché dans la liste : « Renault Mégane E-Tech (EV60) ». */
export function libelleModele(m: ModeleVehicule): string {
  const base = `${m.marque} ${m.modele}`;
  const precisions = [m.variante, m.annees].filter(Boolean).join(', ');
  return precisions ? `${base} (${precisions})` : base;
}

/** Recherche par clé. `null` — et non un modèle par défaut — quand rien ne
    correspond : proposer une Zoe à qui roule en Kangoo serait pire que rien. */
/** Réduit un texte à sa forme comparable : sans accents, sans casse. */
function reduire(texte: string): string {
  return texte.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/**
 * Les marques et modèles qui répondent à une recherche — PURE.
 *
 * LA DEMANDE (Armelin, 30/08) : « le choix des véhicules est trop long à
 * scroller quand il y a trop de véhicules électriques dans la liste. Il
 * faudrait les replier par marque […] et ajouter une barre de recherche pour
 * un modèle ou une marque spécifique pour aller plus vite. »
 *
 * DEUX FAÇONS DE RÉPONDRE, ET C'EST VOULU. Une recherche qui vise la MARQUE
 * (« renault ») rend la marque entière : on cherchait son constructeur, on
 * veut voir ses modèles. Une recherche qui vise un MODÈLE (« zoe ») ne rend
 * que les modèles qui correspondent — montrer toute la marque noierait la
 * réponse. Une recherche vide rend tout, replié.
 */
export function chercherModeles(
  recherche: string,
): { marque: string; modeles: ModeleVehicule[]; ouvrir: boolean }[] {
  const q = reduire(recherche);
  const groupes = parMarque();
  if (q === '') return groupes.map((g) => ({ ...g, ouvrir: false }));

  const rendu: { marque: string; modeles: ModeleVehicule[]; ouvrir: boolean }[] = [];
  for (const g of groupes) {
    const marqueCorrespond = reduire(g.marque).includes(q);
    const modelesTrouves = g.modeles.filter(
      (m) => reduire(libelleModele(m)).includes(q),
    );
    if (marqueCorrespond) {
      // La marque entière, ouverte : on cherchait un constructeur.
      rendu.push({ marque: g.marque, modeles: g.modeles, ouvrir: true });
    } else if (modelesTrouves.length > 0) {
      rendu.push({ marque: g.marque, modeles: modelesTrouves, ouvrir: true });
    }
  }
  return rendu;
}

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
