import { describe, it, expect } from 'vitest';
import {
  urlStationParId, urlStationParLieu, versDetail, grouperPdc, telephone, pmr,
} from '../src/lib/station';

/** Une ligne telle que le portail la rend (forme mesurée le 26/08/2026). */
const ligne = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  nom_station: 'ENGIE Vianeo - Nantes Atlantis',
  adresse_station: 'Rue du Moulin de la Rousselière, 44800 Saint-Herblain',
  nom_enseigne: 'ENGIE Vianeo',
  nom_operateur: 'ENGIE Mobilités',
  nom_amenageur: 'ENGIE',
  telephone_operateur: 'tel:+33-9-69-37-60-09',
  condition_acces: 'Accès libre',
  horaires: '24/7',
  implantation_station: 'Station dédiée à la recharge rapide',
  accessibilite_pmr: 'Réservé PMR',
  paiement_cb: '1',
  paiement_acte: '1',
  reservation: '0',
  station_deux_roues: '0',
  tarification: null,
  gratuit: '0',
  puissance_nominale: 300,
  nbre_pdc: 14,
  id_station_itinerance: 'FRVIAP122243',
  id_pdc_itinerance: 'FRVIAE0001',
  date_maj: '2026-02-23',
  prise_type_combo_ccs: '1',
  prise_type_2: '0',
  prise_type_chademo: '0',
  prise_type_ef: '0',
  ...extra,
});

describe('urlStationParId', () => {
  it('interroge le portail sur l’identifiant d’itinérance', () => {
    const u = new URL(urlStationParId('FRVIAP122243'));
    expect(u.searchParams.get('where')).toBe('id_station_itinerance = "FRVIAP122243"');
  });

  /* LA SYNTAXE DU PORTAIL N'A PAS D'ÉCHAPPEMENT : un guillemet dans la valeur
     couperait la clause en deux, et le service répondrait autre chose que ce
     qu'on croit demander. On le retire, comme dans `poi.ts`. */
  it('retire les guillemets plutôt que de couper la clause en deux', () => {
    expect(new URL(urlStationParId('FR"OR 1=1')).searchParams.get('where'))
      .toBe('id_station_itinerance = "FROR 1=1"');
  });

  it('demande les champs du cartouche, dont le téléphone et l’accès', () => {
    const select = new URL(urlStationParId('X')).searchParams.get('select') ?? '';
    for (const champ of ['telephone_operateur', 'condition_acces', 'horaires',
      'accessibilite_pmr', 'id_pdc_itinerance']) {
      expect(select).toContain(champ);
    }
  });
});

describe('urlStationParLieu', () => {
  it('croise une fenêtre serrée ET le nom', () => {
    const w = new URL(urlStationParLieu(2.5, 48.9, 'Aire de Beaune'))
      .searchParams.get('where') ?? '';
    expect(w).toContain('in_bbox(point_geo,');
    expect(w).toContain('nom_station = "Aire de Beaune"');
    expect(w).toContain(' AND ');
  });

  /* UN RAYON SEUL RAMÈNERAIT LES BORNES DU VOISIN sur un parking partagé ; un
     nom seul échouerait sur les homonymes (« Lidl », « Super U »), qui sont
     légion. La fenêtre doit rester de l'ordre de la cinquantaine de mètres. */
  it('ne s’ouvre que d’une cinquantaine de mètres', () => {
    const w = new URL(urlStationParLieu(2.5, 48.9, 'X')).searchParams.get('where') ?? '';
    const [, sud, ouest, nord, est] = /in_bbox\(point_geo,([\d.-]+),([\d.-]+),([\d.-]+),([\d.-]+)\)/
      .exec(w)!.map(Number);
    expect(nord! - sud!).toBeCloseTo(0.0009, 5);
    expect(est! - ouest!).toBeCloseTo(0.0009, 5);
  });
});

describe('telephone', () => {
  it('retire le préfixe tel: et rend le numéro lisible', () => {
    expect(telephone('tel:+33-9-69-37-60-09')).toBe('+33 9 69 37 60 09');
  });

  it('accepte un numéro déjà propre', () => {
    expect(telephone('0 800 123 456')).toBe('0 800 123 456');
  });

  /* UN CHAMP SANS CHIFFRE N'EST PAS UN NUMÉRO. Le jeu contient des adresses
     e-mail et des « non communiqué » dans cette colonne. */
  it('refuse ce qui ne contient aucun chiffre', () => {
    expect(telephone('non communiqué')).toBeNull();
    expect(telephone('tel:')).toBeNull();
    expect(telephone(null)).toBeNull();
    expect(telephone('   ')).toBeNull();
  });
});

describe('pmr', () => {
  it('garde une accessibilité réellement déclarée', () => {
    expect(pmr('Réservé PMR')).toBe('Réservé PMR');
    expect(pmr('Accessible mais non réservé PMR')).toBe('Accessible mais non réservé PMR');
  });

  /* « ACCESSIBILITÉ INCONNUE » EST LA VALEUR PAR DÉFAUT du jeu — 64 % des
     lignes. L'afficher, c'est remplir une ligne du cartouche pour ne rien dire. */
  it('tait la valeur par défaut plutôt que d’occuper une ligne pour rien', () => {
    expect(pmr('Accessibilité inconnue')).toBeNull();
    expect(pmr('accessibilite inconnue')).toBeNull();
    expect(pmr(null)).toBeNull();
  });
});

describe('grouperPdc', () => {
  it('groupe par puissance et par jeu de prises', () => {
    expect(grouperPdc([
      ligne({ id_pdc_itinerance: 'A', puissance_nominale: 300 }),
      ligne({ id_pdc_itinerance: 'B', puissance_nominale: 300 }),
      ligne({
        id_pdc_itinerance: 'C', puissance_nominale: 22,
        prise_type_combo_ccs: '0', prise_type_2: '1',
      }),
    ])).toEqual([
      { puissanceKw: 300, prises: ['combo_ccs'], nombre: 2 },
      { puissanceKw: 22, prises: ['type_2'], nombre: 1 },
    ]);
  });

  /* LE DÉFAUT MESURÉ : une station rendait 28 lignes pour 14 points déclarés.
     Sans dédoublonnage, le cartouche annonçait le double de bornes. */
  it('dédoublonne sur l’identifiant de point de charge', () => {
    const g = grouperPdc([
      ligne({ id_pdc_itinerance: 'A' }),
      ligne({ id_pdc_itinerance: 'A' }),
      ligne({ id_pdc_itinerance: 'A' }),
    ]);
    expect(g[0]?.nombre).toBe(1);
  });

  /* DEUX POINTS ANONYMES SONT COMPTÉS DEUX FOIS, et c'est le bon défaut :
     les confondre effacerait une borne qui existe. */
  it('compte séparément les points sans identifiant', () => {
    expect(grouperPdc([
      ligne({ id_pdc_itinerance: null }),
      ligne({ id_pdc_itinerance: null }),
    ])[0]?.nombre).toBe(2);
  });

  it('du plus puissant au moins puissant', () => {
    expect(grouperPdc([
      ligne({ id_pdc_itinerance: 'A', puissance_nominale: 22 }),
      ligne({ id_pdc_itinerance: 'B', puissance_nominale: 350 }),
      ligne({ id_pdc_itinerance: 'C', puissance_nominale: 50 }),
    ]).map((g) => g.puissanceKw)).toEqual([350, 50, 22]);
  });

  it('écarte les points sans puissance déclarée', () => {
    expect(grouperPdc([ligne({ puissance_nominale: null })])).toEqual([]);
  });
});

describe('versDetail', () => {
  it('décode une station complète', () => {
    const d = versDetail({ results: [ligne()] })!;
    expect(d).toMatchObject({
      nom: 'ENGIE Vianeo - Nantes Atlantis',
      reseau: 'ENGIE Vianeo',
      operateur: 'ENGIE Mobilités',
      telephone: '+33 9 69 37 60 09',
      ouvert: true,
      horaires: '24/7',
      pmr: 'Réservé PMR',
      paiementCb: true,
      reservation: false,
      pdc: 14,
      id: 'FRVIAP122243',
      majLe: '2026-02-23',
    });
  });

  /* ONZE POUR CENT DES STATIONS SONT EN ACCÈS RÉSERVÉ. L'ancienne popup les
     montrait comme les autres, et envoyait l'usager vers une borne où il ne
     pouvait pas brancher. */
  it('distingue l’accès réservé de l’accès libre, et l’inconnu des deux', () => {
    expect(versDetail({ results: [ligne({ condition_acces: 'Accès réservé' })] })?.ouvert)
      .toBe(false);
    expect(versDetail({ results: [ligne({ condition_acces: 'Inconnu' })] })?.ouvert)
      .toBeNull();
  });

  /* LE TÉLÉPHONE MANQUE SOUVENT SUR LA PREMIÈRE LIGNE et figure sur la
     suivante : prendre aveuglément la ligne zéro le perdait. */
  it('prend le premier champ RENSEIGNÉ, pas celui de la première ligne', () => {
    const d = versDetail({
      results: [
        ligne({ telephone_operateur: null, tarification: null }),
        ligne({ id_pdc_itinerance: 'B', telephone_operateur: 'tel:0800000000', tarification: '0,40 €/kWh' }),
      ],
    })!;
    expect(d.telephone).toBe('0800000000');
    expect(d.tarification).toBe('0,40 €/kWh');
  });

  it('rend null quand la station est introuvable', () => {
    expect(versDetail({ results: [] })).toBeNull();
    expect(versDetail({})).toBeNull();
    expect(versDetail(null)).toBeNull();
    expect(versDetail({ results: [null, 'texte'] })).toBeNull();
  });

  it('nomme les stations anonymes plutôt que de rendre un titre vide', () => {
    expect(versDetail({ results: [ligne({ nom_station: null })] })?.nom)
      .toBe('Station de recharge');
  });

  /* LE TARIF N'EST RENSEIGNÉ QUE SUR 24 % DES LIGNES et n'est JAMAIS
     interprété : on rend le texte du producteur tel quel, ou rien. */
  it('rend la tarification telle quelle, sans l’interpréter', () => {
    expect(versDetail({ results: [ligne({ tarification: 'https://belib.paris' })] })
      ?.tarification).toBe('https://belib.paris');
    expect(versDetail({ results: [ligne()] })?.tarification).toBeNull();
  });
});
