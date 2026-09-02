import { describe, it, expect } from 'vitest';
import {
  decalageParis, instantHeureParis, sourcePour, fraisSeulement,
  libellePlaces, SOURCES_LIVE, PEREMPTION_PLACES_MS, type ParkingLive,
} from '../src/lib/parkings-live';

/* LES PLACES LIBRES EN DIRECT (PARK-4, 02/09).
 *
 * Armelin : « certaines villes exposent des API permettant de consulter en
 * live le taux d'occupation […] ce serait bien d'intégrer la disponibilité
 * des parkings en codant les API libres et sans clé d'accès ».
 *
 * TOUT CE QUI SUIT SORT DE MESURES DU 02/09, y compris les pièges. */

const parking = (o: Partial<ParkingLive>): ParkingLive => ({
  nom: 'X', lon: 5.37, lat: 43.295, libres: 10, capacite: 100,
  instant: 0, source: 'Test', ...o,
});

describe('instantHeureParis', () => {
  /* LE PIÈGE, MESURÉ AVANT D'ÉCRIRE LA LIGNE : Aix-Marseille horodate en
     heure LOCALE sans le dire. Son relevé « 2026-09-02 03:15:07 » a été lu
     à 01:22 UTC — deux heures plus TÔT. Pris pour de l'UTC, il tombait dans
     le futur, et la garde de fraîcheur l'aurait laissé passer. */

  it('lit l’été comme UTC+2', () => {
    expect(instantHeureParis('2026-09-02 03:15:07'))
      .toBe(Date.parse('2026-09-02T01:15:07Z'));
  });

  it('et l’hiver comme UTC+1 — un décalage figé se tromperait six mois par an', () => {
    expect(instantHeureParis('2026-01-15 08:30:00'))
      .toBe(Date.parse('2026-01-15T07:30:00Z'));
  });

  it('accepte le T de l’ISO comme l’espace du portail', () => {
    expect(instantHeureParis('2026-09-02T03:15:07'))
      .toBe(instantHeureParis('2026-09-02 03:15:07'));
  });

  it('rend null sur ce qui n’est pas une date', () => {
    expect(instantHeureParis('bientôt')).toBeNull();
    expect(instantHeureParis('')).toBeNull();
  });
});

describe('decalageParis', () => {
  it('vaut deux heures en été, une en hiver', () => {
    expect(decalageParis(Date.parse('2026-07-01T12:00:00Z'))).toBe(2 * 3600_000);
    expect(decalageParis(Date.parse('2026-12-01T12:00:00Z'))).toBe(1 * 3600_000);
  });

  it('passe minuit sans changer de jour', () => {
    /* Le format horaire de `Intl` écrit minuit « 24 » : sans le repli, une
       heure sur vingt-quatre décalait la journée entière. */
    expect(decalageParis(Date.parse('2026-07-01T22:00:00Z'))).toBe(2 * 3600_000);
  });
});

describe('sourcePour', () => {
  it('reconnaît Marseille et Nantes', () => {
    expect(sourcePour({ lon: 5.37, lat: 43.295 })?.cle).toBe('amp');
    expect(sourcePour({ lon: -1.553, lat: 47.2517 })?.cle).toBe('nantes');
  });

  it('et se tait partout ailleurs — on ne dérange pas pour rien', () => {
    /* C'est ce silence qui rend l'appel supplémentaire acceptable : il ne
       part que là où une collectivité publie vraiment. */
    expect(sourcePour({ lon: 2.5722, lat: 48.8103 })).toBeNull();
    expect(sourcePour({ lon: 4.85, lat: 45.75 })).toBeNull();
  });

  it('chaque source dit qui publie — on cite toujours', () => {
    for (const s of SOURCES_LIVE) expect(s.nom.length).toBeGreaterThan(3);
  });
});

describe('fraisSeulement', () => {
  const maintenant = Date.parse('2026-09-02T01:22:00Z');

  it('garde un relevé de dix minutes', () => {
    const p = parking({ instant: maintenant - 10 * 60_000 });
    expect(fraisSeulement([p], maintenant)).toHaveLength(1);
  });

  it('ÉCARTE UN RELEVÉ DE DIX-SEPT MOIS — le cas d’Issy-les-Moulineaux', () => {
    /* Son jeu s'appelle « disponibilité temps réel » ; son dernier relevé
       date du 6 avril 2025 et annonce TOUS les parkings pleins. Un nom de jeu
       ne prouve rien, un horodatage si. */
    const p = parking({ instant: Date.parse('2025-04-06T02:12:00Z'), libres: 0 });
    expect(fraisSeulement([p], maintenant)).toEqual([]);
  });

  it('écarte aussi un relevé DANS LE FUTUR', () => {
    /* C'est la trace du piège d'Aix-Marseille : un horodatage mal lu donne un
       âge négatif, qui passerait une garde écrite naïvement. */
    const p = parking({ instant: maintenant + 3 * 3600_000 });
    expect(fraisSeulement([p], maintenant)).toEqual([]);
  });

  it('une heure : au-delà, un nombre de places ne veut plus rien dire', () => {
    expect(PEREMPTION_PLACES_MS).toBe(3600_000);
  });
});

describe('libellePlaces', () => {
  it('dit les places libres et la capacité', () => {
    expect(libellePlaces(parking({ libres: 56, capacite: 520 })))
      .toBe('56 places libres sur 520');
  });

  it('accorde le singulier', () => {
    expect(libellePlaces(parking({ libres: 1, capacite: 90 })))
      .toBe('1 place libre sur 90');
  });

  it('COMPLET S’ÉCRIT EN TOUTES LETTRES — jamais « 0 place »', () => {
    /* « 0 place libre » se lit comme une donnée ; « complet » se lit comme
       une décision. C'est la seule ligne qui doit décourager d'y aller. */
    expect(libellePlaces(parking({ libres: 0, capacite: 545 })))
      .toBe('complet au dernier relevé');
  });

  it('se passe d’une capacité inconnue', () => {
    expect(libellePlaces(parking({ libres: 12, capacite: 0 })))
      .toBe('12 places libres');
  });
});
