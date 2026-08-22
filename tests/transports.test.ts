// Le choix des réseaux et la fraîcheur des positions — les deux endroits où
// une erreur ne se verrait pas : la carte afficherait quand même des points,
// simplement les mauvais, ou des points morts.
import { describe, expect, it } from 'vitest';
import {
  ageDuFlux, FRAICHEUR_MAX_S, nombreDeReseaux, PLAFOND_RESEAUX,
  reseauxDansVue, urlFlux, vehiculesFrais,
} from '../src/lib/transports';
import { RESEAUX_TEMPS_REEL } from '../src/donnees/reseaux-temps-reel';
import type { FluxVehicules, Vehicule } from '../src/lib/gtfs-rt';

const vue = (ouest: number, sud: number, est: number, nord: number) =>
  ({ ouest, sud, est, nord });

const vehicule = (id: string, horodate: number | null): Vehicule => ({
  id, lon: 5.04, lat: 47.32, cap: null, vitesse: null,
  ligne: null, etiquette: null, horodate,
});
const flux = (horodate: number | null, vehicules: Vehicule[]): FluxVehicules =>
  ({ horodate, vehicules, tronque: false });

describe('la table des réseaux', () => {
  it('n’est pas vide et n’a pas de doublon d’identifiant', () => {
    expect(RESEAUX_TEMPS_REEL.length).toBeGreaterThan(20);
    const ids = RESEAUX_TEMPS_REEL.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('porte des emprises cohérentes : ouest < est, sud < nord', () => {
    for (const r of RESEAUX_TEMPS_REEL) {
      const [ouest, sud, est, nord] = r.bbox;
      expect(ouest, r.id).toBeLessThan(est);
      expect(sud, r.id).toBeLessThan(nord);
      expect(Math.abs(ouest), r.id).toBeLessThanOrEqual(180);
      expect(Math.abs(nord), r.id).toBeLessThanOrEqual(90);
    }
  });

  it('ne contient aucune emprise démesurée — signe d’une résolution ratée', () => {
    // La plus large légitime est une région métropolitaine : ~4° sur ~2,5°.
    for (const r of RESEAUX_TEMPS_REEL) {
      const [ouest, sud, est, nord] = r.bbox;
      expect((est - ouest) * (nord - sud), `${r.id} couvre trop`).toBeLessThan(20);
    }
  });

  it('compose une URL sur le proxy, seul point d’entrée avec CORS ouvert', () => {
    for (const r of RESEAUX_TEMPS_REEL) {
      expect(urlFlux(r)).toBe(`https://proxy.transport.data.gouv.fr/resource/${r.id}`);
    }
  });
});

describe('choix des réseaux pour une vue', () => {
  it('ne retient rien là où aucun réseau ne publie', () => {
    // Au milieu de l'Atlantique.
    expect(reseauxDansVue(vue(-30, 40, -29, 41))).toEqual([]);
  });

  it('trouve Divia sur Dijon', () => {
    const trouves = reseauxDansVue(vue(5.00, 47.29, 5.10, 47.35));
    expect(trouves.length).toBeGreaterThan(0);
    expect(trouves[0]!.id).toContain('divia-dijon');
  });

  it('met l’agglomération DEVANT la région qui la contient', () => {
    // Le Mans : le SETRAM local et l'Aléop régional se recouvrent tous deux.
    const trouves = reseauxDansVue(vue(0.16, 47.97, 0.24, 48.02));
    const ids = trouves.map((r) => r.id);
    expect(ids.some((i) => i.includes('setram-lemans'))).toBe(true);
    if (ids.some((i) => i.includes('aleop'))) {
      expect(ids.indexOf(ids.find((i) => i.includes('setram-lemans'))!))
        .toBeLessThan(ids.indexOf(ids.find((i) => i.includes('aleop'))!));
    }
  });

  it('ne dépasse jamais le plafond, même quand tout se recouvre', () => {
    // La France entière : beaucoup de réseaux touchent cette vue.
    const vueFrance = vue(-5, 41, 10, 51);
    expect(nombreDeReseaux(vueFrance)).toBeGreaterThan(PLAFOND_RESEAUX);
    expect(reseauxDansVue(vueFrance)).toHaveLength(PLAFOND_RESEAUX);
  });

  it('écarte un réseau qui ne fait qu’effleurer le bord', () => {
    const r = RESEAUX_TEMPS_REEL.find((x) => x.id.includes('bibus-brest'))!;
    const [ouest, sud] = r.bbox;
    // Une vue collée à l'ouest de l'emprise, sans surface commune.
    expect(reseauxDansVue(vue(ouest - 1, sud, ouest, sud + 0.1))
      .some((x) => x.id === r.id)).toBe(false);
  });
});

describe('fraîcheur des positions', () => {
  const T = 1_787_400_000;

  it('garde une position récente, écarte une position périmée', () => {
    const f = flux(T, [
      vehicule('recent', T - 30),
      vehicule('limite', T - FRAICHEUR_MAX_S),
      vehicule('perime', T - FRAICHEUR_MAX_S - 1),
    ]);
    expect(vehiculesFrais(f, T).map((v) => v.id)).toEqual(['recent', 'limite']);
  });

  it('fait hériter l’horodate de l’en-tête à qui n’en a pas', () => {
    expect(vehiculesFrais(flux(T - 5, [vehicule('a', null)]), T)).toHaveLength(1);
    expect(vehiculesFrais(flux(T - 3600, [vehicule('a', null)]), T)).toHaveLength(0);
  });

  it('garde ce qui n’est horodaté nulle part, plutôt que de le jeter', () => {
    expect(vehiculesFrais(flux(null, [vehicule('a', null)]), T)).toHaveLength(1);
  });

  it('tolère une minute d’avance, pas une heure', () => {
    expect(vehiculesFrais(flux(T, [vehicule('a', T + 30)]), T)).toHaveLength(1);
    expect(vehiculesFrais(flux(T, [vehicule('a', T + 3600)]), T)).toHaveLength(0);
  });

  it('dit l’âge du flux, et null quand il ne s’horodate pas', () => {
    expect(ageDuFlux(flux(T - 42, []), T)).toBe(42);
    expect(ageDuFlux(flux(null, []), T)).toBeNull();
    // Une horodate en avance ne rend pas un âge négatif.
    expect(ageDuFlux(flux(T + 10, []), T)).toBe(0);
  });
});
