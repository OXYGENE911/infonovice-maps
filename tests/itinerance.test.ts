import { describe, expect, it } from 'vitest';
import { enItinerance } from '../src/lib/poi';
import { stationPasseFiltres, type StationRapide } from '../src/lib/index-bornes';

/* L'APPROXIMATION DES BADGES (BADGE-1, décidée par Armelin le 04/09).
   Le schéma IRVE n'a aucun champ e-MSP : on juge sur l'identifiant AFIREV
   d'itinérance — et sur rien d'autre, parce qu'on ne sait rien d'autre. */

describe('enItinerance', () => {
  it('reconnaît un identifiant AFIREV', () => {
    expect(enItinerance('FRIONE4101')).toBe(true);
    expect(enItinerance('  frv2p123  ')).toBe(true);
  });
  it('rejette le vide et les mentions des producteurs pressés', () => {
    expect(enItinerance(null)).toBe(false);
    expect(enItinerance('')).toBe(false);
    expect(enItinerance('Non concerné')).toBe(false);
    expect(enItinerance('NA')).toBe(false);
  });
});

const station = (id: string | null): StationRapide => ({
  lon: 2.35, lat: 48.85, nom: 'Essai', reseau: null, operateur: null,
  puissance: 150, pdc: 2, ouvert: true, prises: ['combo_ccs'], id,
});

describe('stationPasseFiltres — itinérance', () => {
  it('filtre coché : seules les raccordées passent', () => {
    expect(stationPasseFiltres(station('FRIONE4101'), { itinerance: true })).toBe(true);
    expect(stationPasseFiltres(station('Non concerné'), { itinerance: true })).toBe(false);
    expect(stationPasseFiltres(station(null), { itinerance: true })).toBe(false);
  });
  it('filtre absent : tout passe — l’approximation ne s’impose jamais', () => {
    expect(stationPasseFiltres(station(null), {})).toBe(true);
  });
});
