// L'adressage en mots — un format doit être RÉVERSIBLE et STABLE, sinon il ne
// vaut rien : une adresse dictée hier doit désigner le même endroit demain.
import { describe, expect, it } from 'vitest';
import {
  analyser, CASES, coder, Commune, decoder, departementDe, ErreurAdresseMots,
  MOTS, PAS_M, PORTEE_M,
} from '../src/lib/adresse-mots';

const DIJON: Commune = { nom: 'Dijon', code: '21231', centre: { lon: 5.0322, lat: 47.3319 } };
const SAINT_DENIS: Commune = {
  nom: 'Saint-Denis', code: '97411', centre: { lon: 55.4504, lat: -20.8823 },
};

/** Distance approchée, suffisante pour juger d'une précision métrique. */
function metres(a: { lon: number; lat: number }, b: { lon: number; lat: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dx = (b.lon - a.lon) * 111_320 * Math.cos(rad(a.lat));
  const dy = (b.lat - a.lat) * 111_320;
  return Math.hypot(dx, dy);
}

describe('le dictionnaire du format', () => {
  it('compte exactement 2 048 mots, tous distincts', () => {
    expect(MOTS).toHaveLength(2048);
    expect(new Set(MOTS).size).toBe(2048);
  });

  it('n’a que des mots de quatre lettres, dicibles', () => {
    for (const m of MOTS) expect(m, m).toMatch(/^[BDFGJKLMNPRSTVXZ][AEIOU][BDFGJKLMNPRSTVXZ][AEIOU]$/);
  });

  it('écarte les suites fâcheuses et les redoublements plats', () => {
    for (const vilain of ['BITE', 'PUTE', 'ZIZI', 'BABA', 'MIMI', 'TOTO']) {
      expect(MOTS.includes(vilain), vilain).toBe(false);
    }
  });

  it('est STABLE : la première et la dernière entrée sont figées', () => {
    /* Le dictionnaire EST le format. S'il bouge, toutes les adresses déjà
       dictées désignent un autre endroit — c'est pourquoi ce test épingle ses
       bornes plutôt que de faire confiance au générateur. */
    expect(MOTS[0]).toBe('BABE');
    expect(MOTS[2047]).toBe('KAZO');
    expect(MOTS[1024]).toBe('FOBE');
  });
});

describe('le département, qui lève les homonymes', () => {
  it('prend deux chiffres en métropole, trois en outre-mer', () => {
    // Mesuré le 22/08 : 1 441 noms de communes sont partagés ; le département
    // ne laisse que 6 collisions, toutes en 97x, que le 3e chiffre tranche.
    expect(departementDe('21231')).toBe('21');
    expect(departementDe('75056')).toBe('75');
    expect(departementDe('97411')).toBe('974');
    expect(departementDe('97105')).toBe('971');
  });
});

describe('coder puis décoder', () => {
  it('retrouve le point à moins de dix mètres', () => {
    const p = { lon: 5.0415, lat: 47.3220 };
    const adresse = coder(DIJON, p);
    const a = analyser(adresse)!;
    expect(a).not.toBeNull();
    expect(metres(p, decoder(DIJON, a))).toBeLessThanOrEqual(PAS_M);
  });

  it('tient sur mille points tirés dans la fenêtre', () => {
    let pire = 0;
    for (let i = 0; i < 1000; i += 1) {
      // Déterministe : une suite simple plutôt qu'un tirage au hasard, pour
      // qu'un échec se rejoue à l'identique.
      const t = (i * 2654435761) % 4294967296;
      const dx = (t % 40000) - 20000;
      // Math.floor plutôt que >> : au-delà de 2^31, le décalage binaire de JS
      // repasse en négatif et le point sortait de la fenêtre (attrapé ici).
      const dy = (Math.floor(t / 256) % 40000) - 20000;
      const p = {
        lon: DIJON.centre.lon + dx / (111_320 * Math.cos((DIJON.centre.lat * Math.PI) / 180)),
        lat: DIJON.centre.lat + dy / 111_320,
      };
      const a = analyser(coder(DIJON, p))!;
      pire = Math.max(pire, metres(p, decoder(DIJON, a)));
    }
    expect(pire).toBeLessThanOrEqual(PAS_M);
  });

  it('fonctionne aussi dans l’hémisphère sud', () => {
    const p = { lon: 55.4600, lat: -20.8900 };
    const a = analyser(coder(SAINT_DENIS, p))!;
    expect(metres(p, decoder(SAINT_DENIS, a))).toBeLessThanOrEqual(PAS_M);
  });

  it('écrit une adresse de la forme attendue', () => {
    expect(coder(DIJON, { lon: 5.0322, lat: 47.3319 }))
      .toMatch(/^Dijon-21 [A-Z]{4} \d{4}$/);
  });
});

describe('ce que le format REFUSE', () => {
  it('refuse un point hors de la fenêtre plutôt que de mentir', () => {
    /* Mesuré : seules une dizaine de communes sur 34 969 sont assez vastes
       pour sortir de ±20,48 km (Maripasoula, 18 743 km², les Terres
       australes). Refuser vaut mieux qu'une adresse fausse. */
    const loin = { lon: DIJON.centre.lon, lat: DIJON.centre.lat + 0.5 };  // ~55 km
    expect(() => coder(DIJON, loin)).toThrow(ErreurAdresseMots);
    expect(() => coder(DIJON, loin)).toThrow(/20.48 km/);
  });

  it('accepte tout juste le bord de la fenêtre', () => {
    const bord = {
      lon: DIJON.centre.lon,
      lat: DIJON.centre.lat + (PORTEE_M - PAS_M) / 111_320,
    };
    expect(() => coder(DIJON, bord)).not.toThrow();
  });

  it('rend null sur une saisie qui n’est pas une adresse', () => {
    for (const t of ['', 'Dijon', 'Dijon-21', 'Dijon-21 BAKO', 'BAKO 4831',
      '47,3220, 5,0415', 'Dijon-21 XYZW 4831', 'Dijon-21 BABE 9999',
      'Dijon-21 BAB 4831', 'Dijon-21 BABEE 4831']) {
      expect(analyser(t), t).toBeNull();
    }
  });
});

describe('la saisie humaine, telle qu’elle arrive vraiment', () => {
  it('accepte les séparateurs qu’on écrit sans y penser', () => {
    const attendu = { commune: 'Dijon', departement: '21', mot: 'BAKE', chiffres: 4831 };
    for (const t of ['Dijon-21 BAKE 4831', 'Dijon 21 BAKE 4831', 'Dijon (21) BAKE 4831',
      '  Dijon-21   bake   4831  ']) {
      expect(analyser(t), t).toEqual(attendu);
    }
  });

  it('accepte les noms de communes tels qu’ils s’écrivent', () => {
    for (const [t, nom] of [
      ['Saint-Étienne-du-Rouvray-76 BAKE 12', 'Saint-Étienne-du-Rouvray'],
      ["L'Île-d'Yeu-85 BAKE 12", "L'Île-d'Yeu"],
      ['Sainte-Anne-971 BAKE 12', 'Sainte-Anne'],
    ] as [string, string][]) {
      expect(analyser(t)?.commune, t).toBe(nom);
    }
  });

  it('accepte des chiffres écrits sans les zéros de tête', () => {
    expect(analyser('Dijon-21 BAKE 7')?.chiffres).toBe(7);
    expect(analyser('Dijon-21 BAKE 0007')?.chiffres).toBe(7);
  });
});

describe('la couverture de la grille', () => {
  it('emploie tout l’espace de codage, sans trou ni collision', () => {
    // 4096 × 4096 cases = 2048 mots × 8192 chiffres : la bijection doit être
    // exacte, sinon deux endroits partageraient une adresse.
    expect(CASES * CASES).toBe(MOTS.length * 8192);
  });

  it('donne des adresses DIFFÉRENTES à deux cases voisines', () => {
    const un = { lon: DIJON.centre.lon, lat: DIJON.centre.lat };
    const deux = { lon: DIJON.centre.lon, lat: DIJON.centre.lat + 11 / 111_320 };
    expect(coder(DIJON, un)).not.toBe(coder(DIJON, deux));
  });
});

describe('la forme écrite', () => {
  /* LA LARGEUR EST FIXE. « BAKE 0005 » et « BAKE 5 » désignent le même point,
     mais seule la première se dicte, se relit et s'aligne sans hésitation.
     L'analyse accepte les deux ; l'écriture n'en produit qu'une. */
  it('écrit TOUJOURS quatre chiffres, zéros de tête compris', () => {
    // Un point choisi pour tomber sur un petit reste : 20 430 m au sud du
    // centre, soit la case (2048, 5) — donc les chiffres « 0005 ».
    const petit = { lon: DIJON.centre.lon, lat: DIJON.centre.lat - 20_430 / 111_320 };
    expect(coder(DIJON, petit)).toMatch(/ \d{4}$/);
    expect(coder(DIJON, petit).endsWith(' 0005')).toBe(true);
  });

  it('garde ces quatre chiffres sur toute la fenêtre', () => {
    for (let m = -20_000; m <= 20_000; m += 137) {
      const p = { lon: DIJON.centre.lon, lat: DIJON.centre.lat + m / 111_320 };
      expect(coder(DIJON, p), `à ${m} m`).toMatch(/^Dijon-21 [A-Z]{4} \d{4}$/);
    }
  });
});

describe('la Corse', () => {
  const AJACCIO: Commune = { nom: 'Ajaccio', code: '2A004', centre: { lon: 8.7369, lat: 41.9264 } };
  const BASTIA: Commune = { nom: 'Bastia', code: '2B033', centre: { lon: 9.4509, lat: 42.7028 } };

  /* 2A et 2B NE SONT PAS DES NOMBRES. Le codage les produisait, l'analyse les
     refusait : 360 communes recevaient une adresse que personne ne pouvait
     relire. C'est le genre de défaut qu'aucun test « français moyen » ne voit. */
  it('code ET relit une adresse corse — l’aller-retour, pas seulement l’aller', () => {
    for (const commune of [AJACCIO, BASTIA]) {
      const p = { lon: commune.centre.lon + 0.01, lat: commune.centre.lat + 0.01 };
      const texte = coder(commune, p);
      const lu = analyser(texte);
      expect(lu, texte).not.toBeNull();
      expect(lu!.departement).toBe(commune.code.slice(0, 2));
      expect(metres(decoder(commune, lu!), p)).toBeLessThan(PAS_M);
    }
  });

  it('accepte le département corse écrit en minuscule', () => {
    expect(analyser('Ajaccio-2a BAKE 0001')?.departement).toBe('2A');
    expect(analyser('Bastia 2b BAKE 0001')?.departement).toBe('2B');
  });

  it('ne prend pas n’importe quelle lettre pour un département', () => {
    for (const faux of ['Ajaccio-2Z BAKE 0001', 'Ajaccio-AA BAKE 0001', 'Ajaccio-A2 BAKE 0001']) {
      expect(analyser(faux), faux).toBeNull();
    }
  });
});
