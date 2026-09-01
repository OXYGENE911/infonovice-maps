import { describe, it, expect } from 'vitest';
import {
  estLHeureDunReleve, titreParDefaut, versTrajets, ajouterTrajet,
  comparerTrajets, PAS_RELEVE_MS, TRAJETS_GARDES, type TrajetEnregistre,
} from '../src/lib/historique-trajets';

/* L'HISTORIQUE DES TRAJETS (STATS-2, 01/09).
 *
 * LA CONCEPTION EST CELLE D'ARMELIN : « cela ne doit pas être fait
 * automatiquement, mais proposé à l'enregistrement à la fin du parcours ». Un
 * GPS qui archive tout seul devient un carnet de déplacements ; un bouton
 * qu'on presse est un consentement. */

const trajet = (id: string, o: Partial<TrajetEnregistre['resume']> = {},
  departMs = 1_700_000_000_000): TrajetEnregistre => ({
  id, departMs, titre: `Trajet ${id}`, releves: [],
  resume: {
    dureeMs: 3_600_000, vitesseMaxKmh: 130, vitesseMoyenneKmh: 90,
    arrets: 1, arretMs: 600_000, ...o,
  },
});

describe('le rythme des relevés', () => {
  it('prend le premier tout de suite, puis toutes les trente secondes', () => {
    expect(estLHeureDunReleve(null, 0)).toBe(true);
    expect(estLHeureDunReleve(0, 29_000)).toBe(false);
    expect(estLHeureDunReleve(0, PAS_RELEVE_MS)).toBe(true);
  });

  /* TRENTE SECONDES, ET C'EST MESURÉ : 360 points pour trois heures, ~32 Ko en
     JSON. Cinq secondes n'apprendraient rien de plus et pèseraient six fois
     plus. */
  it('le pas reste celui qu’on a chiffré', () => {
    expect(PAS_RELEVE_MS).toBe(30_000);
  });
});

describe('titreParDefaut', () => {
  it('nomme le trajet par ses deux bouts', () => {
    expect(titreParDefaut('12 rue de la Paix, Paris', 'Lyon, Rhône'))
      .toBe('12 rue de la Paix → Lyon');
  });

  it('tronque ce qui est trop long, sans couper au milieu d’un mot du milieu', () => {
    const t = titreParDefaut('Avenue du Général Charles de Gaulle et du Reste', 'Nice');
    expect(t.length).toBeLessThan(40);
    expect(t).toContain('→ Nice');
  });

  it('supporte un bout manquant plutôt que d’inventer', () => {
    expect(titreParDefaut('', 'Lyon')).toBe('→ Lyon');
    expect(titreParDefaut('', '')).toBe('Trajet sans nom');
  });
});

describe('ajouterTrajet', () => {
  it('met le plus récent en tête', () => {
    const l = ajouterTrajet([trajet('a')], trajet('b'));
    expect(l.map((t) => t.id)).toEqual(['b', 'a']);
  });

  it('remplace un même identifiant au lieu de le doubler', () => {
    const l = ajouterTrajet([trajet('a'), trajet('b')], trajet('a'));
    expect(l.map((t) => t.id)).toEqual(['a', 'b']);
  });

  /* UNE LISTE SANS FIN FINIRAIT PAR PESER SUR LE NAVIGATEUR de quelqu'un qui
     ne l'a jamais demandé. */
  it('borne la liste, le plus ancien s’efface', () => {
    let l: TrajetEnregistre[] = [];
    for (let i = 0; i < TRAJETS_GARDES + 5; i += 1) l = ajouterTrajet(l, trajet(`t${i}`));
    expect(l).toHaveLength(TRAJETS_GARDES);
    expect(l[0]?.id).toBe(`t${TRAJETS_GARDES + 4}`);
  });
});

describe('versTrajets — frontière système', () => {
  it('écarte ce qui n’a ni identifiant ni bilan', () => {
    expect(versTrajets([{ titre: 'sans id' }, { id: 'x' }])).toEqual([]);
    expect(versTrajets(null)).toEqual([]);
    expect(versTrajets('oui')).toEqual([]);
  });

  it('relit un trajet écrit par nos soins', () => {
    const t = trajet('a');
    expect(versTrajets(JSON.parse(JSON.stringify([t])))).toEqual([t]);
  });

  it('remplace un titre manquant plutôt que d’afficher « undefined »', () => {
    const [t] = versTrajets([{ id: 'a', departMs: 1, resume: { dureeMs: 10 } }]);
    expect(t?.titre).toBe('Trajet sans nom');
    expect(t?.resume.vitesseMoyenneKmh).toBeNull();
  });
});

describe('comparerTrajets', () => {
  it('aligne les quatre lignes du bilan', () => {
    const c = comparerTrajets([trajet('a'), trajet('b')]);
    expect(c.map((l) => l.libelle)).toEqual([
      'Durée du trajet', 'Vitesse moyenne', 'Vitesse maximale', 'Arrêts',
    ]);
    expect(c[0]?.valeurs).toEqual(['1 h 00', '1 h 00']);
  });

  it('désigne le plus court, et le moins arrêté', () => {
    const c = comparerTrajets([
      trajet('a', { dureeMs: 3_600_000, arretMs: 600_000 }),
      trajet('b', { dureeMs: 3_000_000, arretMs: 300_000 }),
    ]);
    expect(c[0]?.meilleur, 'la durée la plus courte').toBe(1);
    expect(c[3]?.meilleur, 'le moins de temps à l’arrêt').toBe(1);
  });

  /* ROULER PLUS VITE N'EST PAS « MIEUX », et le couronner encouragerait à le
     faire. La colonne existe, elle n'est pas décorée. */
  it('ne couronne JAMAIS la vitesse maximale', () => {
    const c = comparerTrajets([
      trajet('a', { vitesseMaxKmh: 110 }), trajet('b', { vitesseMaxKmh: 160 }),
    ]);
    expect(c[2]?.meilleur).toBeNull();
  });

  it('ne couronne rien avec un seul trajet — comparer exige deux', () => {
    expect(comparerTrajets([trajet('a')]).every((l) => l.meilleur === null)).toBe(true);
    expect(comparerTrajets([])).toEqual([]);
  });

  it('dit « non mesurée » plutôt qu’un zéro trompeur', () => {
    const c = comparerTrajets([trajet('a', { vitesseMoyenneKmh: null })]);
    expect(c[1]?.valeurs[0]).toBe('non mesurée');
  });
});
