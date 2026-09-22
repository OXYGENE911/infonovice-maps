import { describe, it, expect } from 'vitest';
import {
  BADGES, MATRICE_BADGES, indexerMatrice, ErreurMatriceBadges,
  type CleBadge, type LigneMatrice, type VerdictBadge,
} from '../src/lib/badges';
import { cleReseau } from '../src/lib/index-bornes';

/* LA MATRICE SE LIT AVEC LA CLÉ DE RÉSEAU, jamais avec la chaîne brute — et
   les tests l'indexent exactement comme la production, sans quoi ils
   valideraient un rapprochement que personne n'exécute. */
const m = indexerMatrice(cleReseau);

describe('la matrice des badges', () => {
  it('porte les 30 opérateurs relevés et les 9 badges décidés', () => {
    expect(MATRICE_BADGES).toHaveLength(30);
    expect(BADGES).toHaveLength(9);
    for (const ligne of MATRICE_BADGES) {
      expect(Object.keys(ligne.verdicts).sort())
        .toEqual(BADGES.map((b) => b.cle).sort());
    }
  });

  /* LE FAIT MESURÉ QU'ON DOIT POUVOIR DIRE AU STAND (§3.4 de la mission) :
     aucun des trente plus gros opérateurs français n'accepte le badge Ionity.
     Cocher Ionity seul rend zéro station — par la donnée, pas par un bogue.
     Ce test verrouille le fait : s'il tombe, c'est la v2 de la matrice qui a
     bougé, et le message du panneau doit être relu avec elle. */
  it('dit « non » à Ionity pour les 30 opérateurs', () => {
    for (const ligne of MATRICE_BADGES) {
      expect(ligne.verdicts.ionity).toBe('non');
    }
  });
});

describe('indexerMatrice', () => {
  /* LA GARDE DE COLLISION. Cinq paires de libellés s'écrasent sur une même
     clé (« LIDL France »/« Lidl France », « Electra »/« ELECTRA »…) et
     portent aujourd'hui le MÊME verdict — vérifié. La v2 de la matrice
     (tâche recP5v279q6llmitl) remplira des colonnes : si elle ne remplit
     qu'une des deux graphies, le verdict retenu dépendrait de l'ORDRE des
     lignes, ce qu'aucun lecteur ne devinerait. On refuse plutôt que de
     choisir en silence. */
  it('refuse deux libellés de même clé aux verdicts divergents', () => {
    const verdicts = (v: Record<string, unknown>) => ({
      ...Object.fromEntries(BADGES.map((b) => [b.cle, 'inconnu'])), ...v,
    }) as LigneMatrice['verdicts'];
    const lignes: LigneMatrice[] = [
      { operateur: 'LIDL France', verdicts: verdicts({ chargemap: 'oui' }) },
      { operateur: 'Lidl France', verdicts: verdicts({ chargemap: 'non' }) },
    ];
    expect(() => indexerMatrice(cleReseau, lignes)).toThrow(ErreurMatriceBadges);
    expect(() => indexerMatrice(cleReseau, lignes)).toThrow(/lidl/i);
  });

  it('accepte deux libellés de même clé aux verdicts identiques', () => {
    expect(() => indexerMatrice(cleReseau)).not.toThrow();
  });
});

describe('verdict', () => {
  it('rend le verdict relevé pour un opérateur connu', () => {
    expect(m.verdict('Electra', 'mobilize')).toBe('oui');
    expect(m.verdict('Electra', 'ionity')).toBe('non');
    expect(m.verdict('Tesla', 'octopus')).toBe('inconnu');
  });

  /* ABSENT DE LA MATRICE N'EST PAS « COMPATIBLE » : la matrice ne couvre que
     trente opérateurs sur les cent quarante du fichier IRVE. Tout le reste
     est inconnu, donc masqué (§3.2). */
  it('rend « inconnu » pour un opérateur absent, ou sans opérateur', () => {
    expect(m.verdict('Réseau de la Creuse', 'chargemap')).toBe('inconnu');
    expect(m.verdict(null, 'chargemap')).toBe('inconnu');
    expect(m.verdict('', 'chargemap')).toBe('inconnu');
  });

  /* LA CASSE ET LA GRAPHIE NE CHANGENT RIEN — c'est tout l'objet de
     `cleReseau`, et la raison pour laquelle la matrice est indexée par elle
     plutôt que par la chaîne du fichier. */
  it('rapproche les graphies d’un même opérateur', () => {
    for (const badge of BADGES.map((b) => b.cle)) {
      expect(m.verdict('LIDL France', badge)).toBe(m.verdict('Lidl France', badge));
      expect(m.verdict('E-Totem', badge)).toBe(m.verdict('E-TOTEM', badge));
      expect(m.verdict('Izivia', badge)).toBe(m.verdict('IZIVIA', badge));
    }
    expect(m.verdict('LIDL France', 'izivia')).toBe('oui');
    expect(m.verdict('Lidl France', 'izivia')).toBe('oui');
  });
});

describe('motif', () => {
  const coche = (...b: CleBadge[]): CleBadge[] => b;

  it('sans badge coché, tout passe', () => {
    expect(m.motif('Réseau inconnu au bataillon', [])).toBe('passe');
    expect(m.motif(null, [])).toBe('passe');
  });

  it('un « oui » fait passer', () => {
    expect(m.motif('Electra', coche('mobilize'))).toBe('passe');
  });

  it('un « non » bloque, et le dit', () => {
    expect(m.motif('Electra', coche('ionity'))).toBe('non');
  });

  /* « INCONNU » N'EST PAS COMPATIBLE — ON ÉCHOUE FERMÉ (§3.2). Montrer une
     borne qui refuse le badge du prospect, au stand, c'est le produit qui
     ment devant lui. Montrer moins mais sûr se défend. */
  it('un « inconnu » bloque, au même titre qu’un « non »', () => {
    expect(m.motif('Tesla', coche('octopus'))).toBe('inconnu');
  });

  it('un opérateur absent de la matrice bloque dès qu’un badge est coché', () => {
    expect(m.motif('Bornes de la Creuse', coche('chargemap'))).toBe('inconnu');
    expect(m.motif(null, coche('chargemap'))).toBe('inconnu');
  });

  /* OU ENTRE BADGES : on a l'un OU l'autre dans sa poche, pas les deux à la
     fois. Exiger que tous disent « oui » ne rendrait presque rien. */
  it('OU entre les badges cochés : un seul « oui » suffit', () => {
    expect(m.motif('Electra', coche('ionity', 'mobilize'))).toBe('passe');
    expect(m.motif('Electra', coche('mobilize', 'ionity'))).toBe('passe');
  });

  /* LE MOTIF SERT LES DEUX MESSAGES DU PANNEAU, et il doit donc les
     distinguer : « non » partout autorise « aucun opérateur n'accepte ce
     badge » (§3.4) ; un seul « inconnu » interdit cette phrase, parce que
     l'information manque au lieu d'être négative (§3.3). */
  /* Les deux badges cités sont pris HORS des trois colonnes que la v2 de la
     matrice remplit (C31) : ce test porte sur la logique de `motif`, pas sur
     l'état du relevé, et il ne doit pas rougir le jour où une case se
     remplit. Tesla : ionity = non, octopus = inconnu. */
  it('un « inconnu » mêlé à des « non » rend « inconnu », pas « non »', () => {
    expect(m.motif('Tesla', coche('ionity', 'octopus'))).toBe('inconnu');
    expect(m.motif('Tesla', coche('ionity'))).toBe('non');
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   LES TROIS GARDES DE LA V2 — cycle C31, mission du 22/09/2026.

   La v2 remplit à la main trois colonnes sur trente lignes : quatre-vingt-dix
   caractères posés un par un dans des chaînes qui n'ont ni séparateur ni
   en-tête. Un caractère décalé d'un rang ne casse rien, ne lève rien, et
   déplace SILENCIEUSEMENT le verdict d'un badge sur un autre.

   Ces trois tests ne disent PAS que les verdicts sont vrais — aucun test ne
   peut le dire, seule une source datée le peut, et elles vivent dans le
   handoff du cycle. Ils disent que la forme tient, que le remplissage n'a pas
   débordé de son mandat, et que deux graphies d'un même réseau n'ont pas reçu
   deux réponses différentes.
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Les trente lignes TELLES QU'ELLES ÉTAIENT avant la v2, au sha 7cb5c5d.
 *
 * Recopiées du fichier, pas dérivées de lui : une empreinte calculée depuis
 * `MATRICE_BADGES` suivrait ses modifications et ne verrouillerait rien. Elle
 * se relit à l'œil contre le §3 de la mission, qui la porte au même format.
 */
const EMPREINTE_C30: readonly (readonly [string, string])[] = [
  ['Bouygues Energies & Services', '?????n???'],
  ['IZIVIA', 'o???ono??'],
  ['Power Dot France', 'o??oon???'],
  ['Freshmile | FR*FR1', 'o???onoo?'],
  ['TotalEnergies Charging Services', 'o??oono??'],
  ['GROUPE INDIGO', '?????no??'],
  ['TotalEnergies Marketing France', 'o??oono??'],
  ['EASYCHARGE', '????on???'],
  ['Allego', 'o??oon???'],
  ['LIDL France', 'o???ono??'],
  ['Lidl France', 'o???ono??'],
  ['Tesla', 'o????n???'],
  ['TESLA France SARL', '?????n???'],
  ['QOVOLTIS', '????on???'],
  ['ENGIE Vianeo', 'o???on???'],
  ['Greenflux', '????on???'],
  ['DRIVECO', 'o???on???'],
  ['SPBR1 | FR*EBN', '?????n???'],
  ['Citeos Mobilité Electrique Paris - Cogelum IDF', '?????n???'],
  ['DRIVECO Partner Network', '?????n???'],
  ['E.Leclerc | FR*LE2', '?????n???'],
  ['Load Stations', '????on???'],
  ['Electra', 'oo??on???'],
  ['Izivia', 'o???ono??'],
  ['E-Totem', '????on???'],
  ['ELECTRA', 'oo??on???'],
  ['E-TOTEM', '????on???'],
  ['SPIE CITYNETWORKS', '????on???'],
  ['STATIONS-E', '????on???'],
  ['SPIE CityNetworks', '????on???'],
];

/** Les trois colonnes que la v2 avait mandat de remplir, en rangs 0-based. */
const COLONNES_DU_MANDAT: readonly number[] = [
  0, // Chargemap
  2, // Shell Recharge
  8, // Ulys (Vinci)
];

const LETTRE: Readonly<Record<VerdictBadge, string>> = {
  oui: 'o', non: 'n', inconnu: '?',
};

/** Rend une ligne sous la forme où elle est écrite dans le module. */
const codes = (l: LigneMatrice): string =>
  BADGES.map((b) => LETTRE[l.verdicts[b.cle]] ?? '!').join('');

/** Remplace par « # » les rangs donnés, pour comparer le reste. */
const masquer = (s: string, rangs: readonly number[]): string =>
  [...s].map((c, i) => (rangs.includes(i) ? '#' : c)).join('');

describe('la v2 de la matrice (C31)', () => {
  /* GARDE 1 — LA FORME. Neuf verdicts par ligne, et rien d'autre que les
     trois états prévus. Le garde-fou de `ligne()` refuse déjà au CHARGEMENT
     une longueur fausse ou une lettre hors vocabulaire : ce test verrouille
     le même invariant sur le produit fini, là où un lecteur le cherchera.
     Contre-épreuve : voir le handoff du cycle — `ligne()` n'étant pas
     exportée, on la fait rougir en décalant une vraie ligne du module, ce qui
     empêche le fichier de se charger du tout. */
  it('porte trente lignes de neuf verdicts, et rien que o, n ou ?', () => {
    expect(MATRICE_BADGES).toHaveLength(30);
    for (const l of MATRICE_BADGES) {
      expect(codes(l), l.operateur).toMatch(/^[on?]{9}$/);
    }
  });

  /* GARDE 2 — LE PÉRIMÈTRE. Le CEO a arbitré TROIS colonnes, pas quatre :
     Mobilize (rang 1) reste vide à vingt-huit lignes sur trente et ce n'est
     pas un oubli. Ce test est la preuve mécanique que la v2 n'a pas débordé —
     ni sur Mobilize, ni sur les cinq autres colonnes relevées au C4, dont
     aucun « o » ni « n » posé ne devait être retouché. */
  it('ne change aucune colonne hors des trois du mandat', () => {
    expect(MATRICE_BADGES).toHaveLength(EMPREINTE_C30.length);
    MATRICE_BADGES.forEach((l, i) => {
      const [nom, avant] = EMPREINTE_C30[i]!;
      expect(l.operateur).toBe(nom);
      expect(masquer(codes(l), COLONNES_DU_MANDAT), nom)
        .toBe(masquer(avant, COLONNES_DU_MANDAT));
    });
  });

  /* GARDE 2 bis — ON NE DÉFAIT PAS LE C4. Dans les trois colonnes du mandat
     elles-mêmes, la v2 avait le droit de remplir un « ? », jamais de
     contredire un verdict déjà posé. */
  it('ne retouche, dans ces trois colonnes, que ce qui était inconnu', () => {
    MATRICE_BADGES.forEach((l, i) => {
      const [nom, avant] = EMPREINTE_C30[i]!;
      const apres = codes(l);
      for (const r of COLONNES_DU_MANDAT) {
        if (avant[r] !== '?') {
          expect(apres[r], `${nom}, rang ${r} (posé au C4)`).toBe(avant[r]);
        }
      }
    });
  });

  /* GARDE 3 — LES DOUBLONS. Les graphies du fichier IRVE arrivent en double
     et `cleReseau` les rejoint à l'indexation. Deux graphies d'un même réseau
     qui reçoivent deux verdicts différents, ce n'est pas une nuance : c'est
     une case remplie et sa jumelle oubliée. `indexerMatrice` lève déjà quand
     les deux s'écrasent sur la même clé — mais toutes ne s'y écrasent pas
     (« Tesla » et « TESLA France SARL » ont des clés distinctes), et
     celles-là ne seraient rattrapées par rien. */
  const DOUBLONS: readonly (readonly [string, string])[] = [
    ['LIDL France', 'Lidl France'],
    ['Electra', 'ELECTRA'],
    ['E-Totem', 'E-TOTEM'],
    ['SPIE CITYNETWORKS', 'SPIE CityNetworks'],
    ['IZIVIA', 'Izivia'],
  ];

  it.each(DOUBLONS)('accorde le même verdict à « %s » et « %s »', (a, b) => {
    for (const r of COLONNES_DU_MANDAT) {
      const badge = BADGES[r]!.cle;
      expect(m.verdict(a, badge), `${a} / ${b} · ${badge}`)
        .toBe(m.verdict(b, badge));
    }
  });

  /* LES DEUX PAIRES QUE `cleReseau` NE REJOINT PAS, et que rien ne surveillait.
     `indexerMatrice` ne protège que les graphies qui s'écrasent sur une même
     clé. « Tesla » / « TESLA France SARL » et « DRIVECO » / « DRIVECO Partner
     Network » ont des clés DISTINCTES : leurs lignes peuvent diverger sans que
     rien ne le signale, et elles divergent effectivement.

     CONSTAT DU C31, à porter au chef : « Tesla » dit OUI à Chargemap quand
     « TESLA France SARL » dit « je ne sais pas ». Les deux désignent le même
     réseau ; l'un des deux relevés du C4 est donc incomplet. Le C31 n'avait
     mandat ni de retoucher le « o » posé, ni de remplir le « ? » sans source —
     il laisse donc l'écart en place et le nomme ici plutôt que de le taire.

     Ce qui reste INTERDIT, et que ce test verrouille : la contradiction
     FRANCHE. « oui » ici et « non » là voudrait dire qu'une même carte ouvre
     et n'ouvre pas le même réseau — cela ne se lit pas comme une lacune, cela
     se lit comme une faute de saisie. Un « ? » face à un verdict ferme reste
     permis : c'est une lacune, et le produit sait l'afficher comme telle. */
  const PAIRES_A_CLES_DISTINCTES: readonly (readonly [string, string])[] = [
    ['Tesla', 'TESLA France SARL'],
    ['DRIVECO', 'DRIVECO Partner Network'],
  ];

  it.each(PAIRES_A_CLES_DISTINCTES)(
    'ne fait pas se contredire « %s » et « %s »', (a, b) => {
      for (const r of COLONNES_DU_MANDAT) {
        const badge = BADGES[r]!.cle;
        const paire = [m.verdict(a, badge), m.verdict(b, badge)];
        expect(
          paire.includes('oui') && paire.includes('non'),
          `${a} / ${b} · ${badge} : ${paire.join(' vs ')}`,
        ).toBe(false);
      }
    });

  /* Et la preuve que ces deux paires ont bien des clés distinctes — sans quoi
     la garde ci-dessus serait redondante avec celle d'`indexerMatrice`, et le
     lecteur ne saurait pas laquelle des deux le protège. */
  it('confirme que ces deux paires échappent à la garde de collision', () => {
    for (const [a, b] of PAIRES_A_CLES_DISTINCTES) {
      expect(cleReseau(a), `${a} / ${b}`).not.toBe(cleReseau(b));
    }
  });
});
