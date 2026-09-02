import { describe, it, expect } from 'vitest';
import {
  estLHeureDunReleve, titreParDefaut, versTrajets, ajouterTrajet,
  comparerTrajets, traceDuTrajet, peutRelancer,
  reliefDesReleves, SEUIL_MARCHE_GPS_M,
  PAS_RELEVE_MS, TRAJETS_GARDES, type TrajetEnregistre,
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
  it('aligne les six lignes du bilan', () => {
    const c = comparerTrajets([trajet('a'), trajet('b')]);
    /* SIX DEPUIS HIST-3 : le dénivelé et la température ont rejoint les
       quatre premières. Ce sont eux qui EXPLIQUENT les écarts que les autres
       lignes montrent — Armelin les nommait dans la même phrase que le
       tracé. */
    expect(c.map((l) => l.libelle)).toEqual([
      'Durée du trajet', 'Vitesse moyenne', 'Vitesse maximale', 'Arrêts',
      'Dénivelé', 'Température',
    ]);
    expect(c[0]?.valeurs).toEqual(['1 h 00', '1 h 00']);
  });

  /* CE QU'ON N'A PAS MESURÉ, ON LE DIT — on n'écrit pas zéro. Un « +0 / −0 m »
     sur un trajet de montagne serait un chiffre faux là où l'absence est
     vraie ; c'est la règle du bilan depuis STATS-1. */
  it('dit « non mesuré » et « non relevée » plutôt que des zéros', () => {
    const c = comparerTrajets([trajet('a')]);
    expect(c[4]?.valeurs[0]).toBe('non mesuré');
    expect(c[5]?.valeurs[0]).toBe('non relevée');
  });

  /* UN DÉNIVELÉ TIRÉ DU RÉCEPTEUR LE DIT : l'altitude GNSS est bruitée de
     plusieurs mètres, et « +340 m (GPS) » ne se lit pas comme « +340 m »
     mesuré sur le modèle altimétrique de l'IGN. */
  it('nomme la provenance quand le dénivelé vient du récepteur', () => {
    const c = comparerTrajets([
      { ...trajet('a'), relief: { monteeM: 340, descenteM: 310, source: 'gps' as const } },
      { ...trajet('b'), relief: { monteeM: 340, descenteM: 310, source: 'ign' as const } },
    ]);
    expect(c[4]?.valeurs[0]).toBe('+340 / −310 m (GPS)');
    expect(c[4]?.valeurs[1]).toBe('+340 / −310 m');
  });

  /* AUCUNE COURONNE SUR CES DEUX LIGNES : monter 400 m n'est ni mieux ni
     moins bien que d'en monter 40, et il ne fait pas « mieux » 20 °C que 5.
     Ce sont des CIRCONSTANCES, pas des performances. */
  it('ne couronne ni le relief ni la température', () => {
    const c = comparerTrajets([
      { ...trajet('a'), temperatureC: 22, relief: { monteeM: 40, descenteM: 40, source: 'ign' as const } },
      { ...trajet('b'), temperatureC: 3, relief: { monteeM: 400, descenteM: 400, source: 'ign' as const } },
    ]);
    expect(c[4]?.meilleur).toBeNull();
    expect(c[5]?.meilleur).toBeNull();
    expect(c[5]?.valeurs).toEqual(['22 °C', '3 °C']);
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

/* LE TRACÉ ET LE RELANCEMENT (HIST-2, 02/09).
 *
 * Armelin, deux remarques du même essai : « l'historique ne conserve pas le
 * tracé […] donc contribuer à l'algorithme envoie trop peu » et « il n'y a
 * aucun moyen de relancer le même trajet depuis l'historique ». Les deux
 * tenaient à la même cause : on gardait des CHIFFRES, jamais un LIEU. */

const base = (sur: Partial<TrajetEnregistre> = {}): TrajetEnregistre => ({
  id: 'x', departMs: 1_700_000_000_000, titre: '→ Lyon', releves: [],
  resume: { dureeMs: 60_000, vitesseMaxKmh: 90, vitesseMoyenneKmh: 70, arrets: 0, arretMs: 0 },
  ...sur,
});

describe('traceDuTrajet', () => {
  it('rend les points dans l’ordre des relevés', () => {
    expect(traceDuTrajet(base({ releves: [
      { tMs: 0, vitesseMs: 10, altitudeM: null, lon: 2.1, lat: 48.1 },
      { tMs: 30_000, vitesseMs: 12, altitudeM: null, lon: 2.2, lat: 48.2 },
    ] }))).toEqual([[2.1, 48.1], [2.2, 48.2]]);
  });

  /* UN TRAJET D'AVANT HIST-2 REND UN TABLEAU VIDE, et c'est la vérité sur ce
     qu'on en sait. Inventer une position à partir de la vitesse serait
     fabriquer une donnée pour un fichier qu'on envoie ensuite à quelqu'un. */
  it('saute les relevés sans position, sans en inventer', () => {
    expect(traceDuTrajet(base({ releves: [
      { tMs: 0, vitesseMs: 10, altitudeM: 42 },
      { tMs: 30_000, vitesseMs: 12, altitudeM: 43, lon: 2.2, lat: 48.2 },
    ] }))).toEqual([[2.2, 48.2]]);
  });
});

describe('peutRelancer', () => {
  it('accepte dès que l’arrivée est connue — le départ ne sert pas', () => {
    expect(peutRelancer(base({ arrivee: { lon: 4.83, lat: 45.76 } }))).toBe(true);
  });

  /* LE DÉPART D'ALORS N'EST PAS UNE CONDITION : relancer « → Travail » depuis
     chez un ami doit marcher, et c'est le cas où l'on en a le plus besoin. */
  it('n’exige pas le départ enregistré', () => {
    expect(peutRelancer(base({ depart: { lon: 2.3, lat: 48.8 } }))).toBe(false);
  });

  it('refuse un parcours gardé avant HIST-2', () => {
    expect(peutRelancer(base())).toBe(false);
  });
});

describe('versTrajets — les extrémités', () => {
  it('relit une arrivée complète, avec son nom', () => {
    const [t] = versTrajets([{ ...base(), arrivee: { lon: 4.83, lat: 45.76, libelle: 'Lyon' } }]);
    expect(t?.arrivee).toEqual({ lon: 4.83, lat: 45.76, libelle: 'Lyon' });
  });

  /* UNE EXTRÉMITÉ À MOITIÉ NE PLACE RIEN : la garder ferait échouer le
     relancement plus tard, loin d'ici, et le bouton aurait promis. */
  it('écarte une extrémité amputée plutôt que de la garder à moitié', () => {
    const [t] = versTrajets([{ ...base(), arrivee: { lon: 4.83 } }]);
    expect(t?.arrivee).toBeUndefined();
    expect(t?.id, 'le trajet lui-même ne doit pas être jeté').toBe('x');
  });

  it('ne fabrique pas d’extrémité pour un trajet qui n’en a pas', () => {
    const [t] = versTrajets([base()]);
    expect(t?.arrivee).toBeUndefined();
    expect(t?.depart).toBeUndefined();
  });

  it('garde le tracé des relevés qui en portent un', () => {
    const [t] = versTrajets([{ ...base(), releves: [
      { tMs: 0, vitesseMs: 10, altitudeM: null, lon: 2.1, lat: 48.1 },
    ] }]);
    expect(traceDuTrajet(t!)).toEqual([[2.1, 48.1]]);
  });
});

/* LE DÉNIVELÉ LU DANS LES RELEVÉS (HIST-3, 02/09).
 *
 * L'ALTITUDE GNSS EST BRUITÉE DE PLUSIEURS MÈTRES, même à l'arrêt. Sommer les
 * écarts bruts sur 360 relevés fabriquerait des centaines de mètres de montée
 * sur un trajet parfaitement plat — un chiffre faux, et convaincant. C'est
 * exactement le genre de donnée qu'il vaut mieux ne pas produire. */

describe('reliefDesReleves', () => {
  const r = (tMs: number, altitudeM: number | null) => ({ tMs, vitesseMs: 10, altitudeM });

  it('compte une vraie montée', () => {
    expect(reliefDesReleves([r(0, 100), r(30_000, 150), r(60_000, 120)]))
      .toEqual({ monteeM: 50, descenteM: 30, source: 'gps' });
  });

  /* LE BRUIT NE COMPTE PAS : trois relevés qui oscillent de deux mètres sur
     un plateau ne font ni montée ni descente. */
  it('ignore les oscillations sous le seuil de bruit', () => {
    expect(reliefDesReleves([r(0, 100), r(30_000, 102), r(60_000, 98), r(90_000, 101)]))
      .toEqual({ monteeM: 0, descenteM: 0, source: 'gps' });
    expect(SEUIL_MARCHE_GPS_M).toBe(5);
  });

  /* QUELQUES ALTITUDES ÉPARSES N'ÉCHANTILLONNENT PAS UN RELIEF : c'est ce qui
     décide d'aller DEMANDER le profil au service d'altimétrie. */
  it('rend null quand moins de la moitié des relevés portent une altitude', () => {
    expect(reliefDesReleves([r(0, 100), r(1, null), r(2, null), r(3, null)])).toBeNull();
  });

  it('rend null quand le récepteur n’a rien donné', () => {
    expect(reliefDesReleves([r(0, null), r(1, null)])).toBeNull();
    expect(reliefDesReleves([])).toBeNull();
  });
});

describe('versTrajets — le relief et la température', () => {
  it('relit un relief complet', () => {
    const [t] = versTrajets([{ ...base(), relief: { monteeM: 340, descenteM: 310, source: 'ign' } }]);
    expect(t?.relief).toEqual({ monteeM: 340, descenteM: 310, source: 'ign' });
  });

  /* UN RELIEF SANS PROVENANCE NE SE GARDE PAS : « 340 m » se lit autrement
     selon qu'il vient d'un récepteur bruité ou du modèle de l'IGN. */
  it('écarte un relief dont la provenance est inconnue', () => {
    const [t] = versTrajets([{ ...base(), relief: { monteeM: 340, descenteM: 310, source: 'devine' } }]);
    expect(t?.relief).toBeUndefined();
  });

  it('relit une température, et n’en invente pas', () => {
    expect(versTrajets([{ ...base(), temperatureC: -3 }])[0]?.temperatureC).toBe(-3);
    expect(versTrajets([base()])[0]?.temperatureC).toBeUndefined();
    expect(versTrajets([{ ...base(), temperatureC: 'froid' }])[0]?.temperatureC).toBeUndefined();
  });
});
