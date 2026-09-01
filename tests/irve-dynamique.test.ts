import { describe, it, expect } from 'vitest';
import {
  urlReleves, versReleves, resumerReleves, ageEnMots,
  PEREMPTION_OCCUPATION_MS,
} from '../src/lib/irve-dynamique';

/* L'ÉTAT DÉCLARÉ DES POINTS DE CHARGE (IRVE-1, 01/09).
 *
 * Toutes les valeurs ci-dessous sortent de mesures faites le jour même sur
 * `tabular-api.data.gouv.fr` — y compris les formes bizarres : l'horodatage
 * avec un espace au lieu du T, et les stations dont l'identifiant n'a rien à
 * voir avec celui de leurs points. */

/** Une ligne telle que le portail la rend, mot pour mot. */
const LIGNE = {
  __id: 2541,
  id_pdc_itinerance: 'FRIOYE410255',
  etat_pdc: 'en_service',
  occupation_pdc: 'libre',
  horodatage: '2026-08-31 14:00:36.713000+00:00',
  etat_prise_type_2: null,
  etat_prise_type_combo_ccs: 'fonctionnel',
};

const parametre = (url: string, cle: string): string =>
  new URL(url).searchParams.get(cle) ?? '';

describe('urlReleves', () => {
  it('joint sur les identifiants de POINTS, en un seul appel', () => {
    /* UN APPEL PAR POINT AURAIT MULTIPLIÉ PAR QUARANTE la charge posée sur un
       service public pour exactement la même réponse. */
    const u = urlReleves(['FRIOYE410255', 'FRIOYE435954'])!;
    expect(parametre(u, 'id_pdc_itinerance__in'))
      .toBe('FRIOYE410255,FRIOYE435954');
  });

  it('sans point, il n’y a rien à demander', () => {
    expect(urlReleves([])).toBeNull();
    expect(urlReleves(['  '])).toBeNull();
  });

  it('les doublons ne se demandent pas deux fois', () => {
    const u = urlReleves(['A', 'A', 'B'])!;
    expect(parametre(u, 'id_pdc_itinerance__in')).toBe('A,B');
  });

  it('la page demandée fait exactement la taille du lot', () => {
    const u = urlReleves(['A', 'B', 'C'])!;
    expect(parametre(u, 'page_size')).toBe('3');
  });

  it('cent points au plus : le plafond du portail', () => {
    const u = urlReleves(Array.from({ length: 150 }, (_, i) => `P${i}`))!;
    expect(parametre(u, 'id_pdc_itinerance__in').split(',')).toHaveLength(100);
  });
});

describe('versReleves', () => {
  it('décode une ligne réelle du portail', () => {
    const r = versReleves({ data: [LIGNE] });
    expect(r).toHaveLength(1);
    expect(r[0]!.id).toBe('FRIOYE410255');
    expect(r[0]!.etat).toBe('en_service');
    expect(r[0]!.occupation).toBe('libre');
  });

  it('l’horodatage du portail a un ESPACE là où ISO veut un T', () => {
    /* Sans la substitution, le décodage varie d'un navigateur à l'autre — et
       une date illisible vaut un relevé perdu. */
    const r = versReleves({ data: [LIGNE] });
    expect(r[0]!.instant).toBe(Date.parse('2026-08-31T14:00:36.713Z'));
  });

  it('ce qu’on ne reconnaît pas est INCONNU, jamais « en service »', () => {
    /* Un défaut optimiste enverrait quelqu'un vers une borne en panne. */
    const r = versReleves({ data: [{
      id_pdc_itinerance: 'X', etat_pdc: 'bidule', occupation_pdc: null,
      horodatage: null,
    }] });
    expect(r[0]!.etat).toBe('inconnu');
    expect(r[0]!.occupation).toBe('inconnu');
    expect(r[0]!.instant).toBeNull();
  });

  it('une ligne sans identifiant est écartée, pas devinée', () => {
    expect(versReleves({ data: [{ etat_pdc: 'en_service' }] })).toEqual([]);
  });

  it('une réponse informe ne fait pas tomber la fiche', () => {
    expect(versReleves(null)).toEqual([]);
    expect(versReleves({})).toEqual([]);
    expect(versReleves({ data: 'oui' })).toEqual([]);
  });
});

describe('resumerReleves', () => {
  const lot = versReleves({ data: [
    { id_pdc_itinerance: 'A', etat_pdc: 'en_service', occupation_pdc: 'libre',
      horodatage: '2026-08-31 12:47:25+00:00' },
    { id_pdc_itinerance: 'B', etat_pdc: 'hors_service', occupation_pdc: 'inconnu',
      horodatage: '2026-07-15 15:14:05+00:00' },
    { id_pdc_itinerance: 'C', etat_pdc: 'en_service', occupation_pdc: 'occupe',
      horodatage: '2026-08-31 10:25:10+00:00' },
  ] });

  it('compte ce qui se compte', () => {
    const r = resumerReleves(lot);
    expect(r.releves).toBe(3);
    expect(r.horsService).toBe(1);
    expect(r.libres).toBe(1);
    expect(r.occupes).toBe(1);
  });

  it('retient le plus FRAIS et le plus VIEUX', () => {
    /* Le lot mesuré autour du Plessis-Trévise mêlait un relevé de la veille et
       un de six semaines : une moyenne aurait menti sur les deux. */
    const r = resumerReleves(lot);
    expect(r.leFrais).toBe(Date.parse('2026-08-31T12:47:25Z'));
    expect(r.leVieux).toBe(Date.parse('2026-07-15T15:14:05Z'));
  });

  it('sans aucun relevé, on n’invente pas de date', () => {
    const r = resumerReleves([]);
    expect(r.releves).toBe(0);
    expect(r.leFrais).toBeNull();
    expect(r.leVieux).toBeNull();
  });
});

describe('ageEnMots', () => {
  const h = (n: number): number => n * 3600_000;

  it('JAMAIS « à l’instant » : le plus frais mesuré avait neuf heures', () => {
    expect(ageEnMots(0, h(9))).toBe('il y a 9 h');
    expect(ageEnMots(0, h(16))).toBe('il y a 16 h');
  });

  it('la veille se dit « hier », et non « il y a 1 jours »', () => {
    expect(ageEnMots(0, h(30))).toBe('hier');
  });

  it('les semaines et les mois se disent aussi', () => {
    expect(ageEnMots(0, h(24 * 6))).toBe('il y a 6 jours');
    expect(ageEnMots(0, h(24 * 45))).toBe('il y a un mois');
  });
});

describe('PEREMPTION_OCCUPATION_MS', () => {
  it('sept jours — au-delà, on ne montre plus l’occupation du tout', () => {
    /* Mesuré : 45 % des relevés du jeu ont plus d'une semaine. Les afficher,
       même datés, inviterait à les lire comme une place libre. L'état HORS
       SERVICE, lui, survit à ce délai : c'est une panne, pas une place. */
    expect(PEREMPTION_OCCUPATION_MS).toBe(7 * 24 * 3600_000);
  });
});
