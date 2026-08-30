import { describe, it, expect } from 'vitest';
import {
  palierA, phraseAnnonce, distanceDite, MemoireAnnonces, PALIERS,
  traficADire, phraseTrafic, PORTEE_TRAFIC_M, GARDE_MANOEUVRE_M,
} from '../src/lib/annonces';

/* LE GUIDAGE VOCAL (VOIX-1, demande d'Armelin du 30/08).
 *
 * CE QUI SE TESTE ICI EST CE QUI COMPTE : quand on parle, et surtout quand on
 * SE TAIT. Une voix qui répète est une voix qu'on coupe, et un GPS coupé ne
 * prévient plus de rien. */

describe('palierA', () => {
  const etapeLongue = 5_000;

  it('franchit les paliers dans l’ordre, du plus loin au plus près', () => {
    /* LE PALIER EST LE DERNIER FRANCHI, pas le prochain : à quatre cents
       mètres on est encore dans « loin », qu'on a franchi à mille. C'est ce
       qui fait qu'on ne parle qu'UNE fois par palier — la mémoire s'appuie
       dessus. */
    expect(palierA(1_200, etapeLongue)).toBeNull();
    expect(palierA(1_000, etapeLongue)).toBe('loin');
    expect(palierA(400, etapeLongue)).toBe('loin');
    expect(palierA(280, etapeLongue)).toBe('proche');
    expect(palierA(40, etapeLongue)).toBe('maintenant');
  });

  it('dit la VRAIE distance, pas celle du palier', () => {
    /* Si l'on entre dans l'étape à quatre cents mètres — après un recalcul —
       le palier « loin » n'a pas encore été dit : on l'annonce alors avec la
       distance réelle, « dans 400 mètres », et non « dans un kilomètre ». */
    expect(distanceDite(palierA(400, etapeLongue)!, 400)).toBe('dans 400 mètres');
  });

  it('N’ANNONCE PAS UN PALIER PLUS LOIN QUE L’ÉTAPE elle-même', () => {
    /* Dire « dans un kilomètre, tournez à droite » quand l'étape en fait
       trois cents ferait se succéder deux annonces contradictoires. */
    expect(palierA(280, 300)).toBe('proche');
    expect(palierA(900, 300)).toBeNull();
  });

  it('garde TOUJOURS le palier « maintenant », même sur une étape courte', () => {
    // Sur cinquante mètres d'étape, c'est la seule annonce possible — et la
    // plus utile : on y est.
    expect(palierA(30, 50)).toBe('maintenant');
  });

  it('expose ses paliers, du plus loin au plus proche', () => {
    expect(PALIERS.map((p) => p.metres)).toEqual([1_000, 300, 50]);
  });
});

describe('distanceDite', () => {
  it('dit « un kilomètre », pas « 1,0 kilomètre »', () => {
    /* Une voix qui épelle des décimales est fatigante, et la précision est
       fausse : le récepteur a dix mètres d'incertitude. */
    expect(distanceDite('loin', 1_000)).toBe('dans un kilomètre');
    expect(distanceDite('loin', 1_100)).toBe('dans un kilomètre');
    expect(distanceDite('loin', 2_400)).toBe('dans 2 kilomètres');
  });

  it('arrondit les mètres à la centaine', () => {
    expect(distanceDite('proche', 280)).toBe('dans 300 mètres');
  });

  it('ne dit PAS la distance au moment de la manœuvre', () => {
    expect(distanceDite('maintenant', 30)).toBe('');
  });
});

describe('phraseAnnonce', () => {
  it('parle comme un passager : la distance, la manœuvre, puis les précisions', () => {
    expect(phraseAnnonce('proche', 300, {
      manoeuvre: 'slight right', sortie: '14', villes: ['Lyon', 'Évry'],
    })).toBe('Dans 300 mètres, serrez à droite, sortie 14, vers Lyon, Évry');
  });

  it('au moment de la manœuvre, dit la manœuvre seule', () => {
    expect(phraseAnnonce('maintenant', 30, { manoeuvre: 'right' }))
      .toBe('Tournez à droite');
  });

  it('SE TAIT sur « tout droit » : rien ne se joue', () => {
    /* L'annoncer userait l'attention qu'il faudra avoir à la sortie. */
    expect(phraseAnnonce('loin', 1_000, { manoeuvre: 'straight' })).toBe('');
  });

  it('dit le RANG dans un giratoire — où « tout droit » veut dire « la deuxième »', () => {
    expect(phraseAnnonce('proche', 300, { manoeuvre: 'straight', rangGiratoire: 2 }))
      .toBe('Dans 300 mètres, au rond-point, prenez la 2e sortie');
    expect(phraseAnnonce('maintenant', 20, { manoeuvre: 'right', rangGiratoire: 1 }))
      .toBe('Au rond-point, prenez la première sortie');
  });

  it('sait dire un rond-point dont on ignore le rang', () => {
    expect(phraseAnnonce('proche', 300, { manoeuvre: 'rond-point', rangGiratoire: null }))
      .toBe('Dans 300 mètres, au rond-point, prenez votre sortie');
  });

  it('S’ARRÊTE À DEUX VILLES : une voix n’est pas un panneau', () => {
    const p = phraseAnnonce('proche', 300, {
      manoeuvre: 'right', villes: ['Troyes', 'Corbeil-Essonnes', 'Sénart'],
    });
    expect(p).toBe('Dans 300 mètres, tournez à droite, vers Troyes, Corbeil-Essonnes');
  });

  it('se rabat sur le numéro de route quand aucune ville n’est connue', () => {
    expect(phraseAnnonce('maintenant', 10, { manoeuvre: 'right', voie: 'A7' }))
      .toBe('Tournez à droite, vers A7');
  });

  it('annonce l’arrivée', () => {
    expect(phraseAnnonce('maintenant', 10, { manoeuvre: 'arrivee' }))
      .toBe('Vous êtes arrivé');
  });
});

describe('MemoireAnnonces', () => {
  it('ne dit pas deux fois le même palier pour la même manœuvre', () => {
    const m = new MemoireAnnonces();
    expect(m.aDire(1_200, 'proche')).toBe(true);
    m.noter(1_200, 'proche');
    expect(m.aDire(1_200, 'proche')).toBe(false);
    // L'autre palier de la MÊME manœuvre reste à dire.
    expect(m.aDire(1_200, 'maintenant')).toBe(true);
  });

  it('distingue deux manœuvres qui portent la même phrase', () => {
    /* Deux virages à droite successifs : la clé est l'avancement, pas le
       texte. Les confondre ferait taire le second. */
    const m = new MemoireAnnonces();
    m.noter(1_200, 'proche');
    expect(m.aDire(2_400, 'proche')).toBe(true);
  });

  it('absorbe le tremblement du récepteur : la clé est arrondie au mètre', () => {
    const m = new MemoireAnnonces();
    m.noter(1_200.4, 'proche');
    expect(m.aDire(1_200.2, 'proche')).toBe(false);
  });

  it('s’oublie au démarrage d’un suivi, ou après un recalcul', () => {
    const m = new MemoireAnnonces();
    m.noter(1_200, 'proche');
    m.vider();
    expect(m.aDire(1_200, 'proche')).toBe(true);
  });
});

/* LE TRAFIC PARLÉ (TRAFIC-1, 30/08). Ce qui se teste ici est la RÈGLE
 * D'INTERRUPTION — la seule chose qui manquait quand la fonctionnalité a été
 * proposée. Une annonce de travaux qui couvre « tournez à droite » est pire
 * qu'une annonce de travaux qui n'existe pas. */

describe('traficADire', () => {
  const evenements = [
    { avancementM: 2_000, libelle: 'Travaux' },
    { avancementM: 9_000, libelle: 'Accident' },
  ];

  it('annonce l’événement qui vient, dans la portée de la voix', () => {
    const t = traficADire(evenements, 0, 5_000);
    expect(t?.libelle).toBe('Travaux');
    expect(t?.distanceM).toBe(2_000);
  });

  it('SE TAIT quand une manœuvre approche — elle passe d’abord', () => {
    /* C'est la règle qui manquait : on n'interrompt pas, on attend. */
    expect(traficADire(evenements, 0, GARDE_MANOEUVRE_M - 1)).toBeNull();
    expect(traficADire(evenements, 0, GARDE_MANOEUVRE_M)).not.toBeNull();
  });

  it('ne parle pas d’un événement trop loin, ni de celui qu’on a passé', () => {
    expect(traficADire(evenements, 0, 5_000, 1_000)).toBeNull();
    // À hauteur des travaux, ils sont derrière — et l'accident encore à 7 km.
    expect(traficADire(evenements, 2_000, 5_000)).toBeNull();
    // Deux kilomètres et demi plus loin, l'accident entre dans la portée.
    expect(traficADire(evenements, 6_500, 5_000)?.libelle).toBe('Accident');
    expect(traficADire([], 0, 5_000)).toBeNull();
  });

  it('porte à trois kilomètres, là où l’écran affiche à dix', () => {
    /* L'œil lit quand il veut, la voix s'impose : elle attend d'être utile. */
    expect(PORTEE_TRAFIC_M).toBe(3_000);
  });
});

describe('phraseTrafic', () => {
  it('dit « signalé » — Bison Futé rapporte des déclarations, pas des mesures', () => {
    expect(phraseTrafic('Travaux', 2_400)).toBe('Travaux signalé dans 2 kilomètres');
    expect(phraseTrafic('Accident', 900)).toBe('Accident signalé dans 900 mètres');
  });

  it('ne fait pas de phrase sans libellé', () => {
    expect(phraseTrafic('', 2_000)).toBe('');
    expect(phraseTrafic('   ', 2_000)).toBe('');
  });
});

describe('MemoireAnnonces, motif trafic', () => {
  it('range le trafic dans la MÊME mémoire, sous son propre motif', () => {
    /* Deux mémoires séparées auraient deux fois les mêmes défauts. */
    const m = new MemoireAnnonces();
    m.noter(2_000, 'trafic');
    expect(m.aDire(2_000, 'trafic')).toBe(false);
    expect(m.aDire(2_000, 'proche'), 'la manœuvre au même point reste à dire').toBe(true);
  });
});
