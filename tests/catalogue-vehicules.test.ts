import { describe, it, expect } from 'vitest';
import {
  CATALOGUE, libelleModele, libelleDansMarque, parMarque,
  modeleParCle, consommationDepuis, autonomiesProposees, PART_AUTOROUTE,
  chercherModeles
} from '../src/lib/catalogue-vehicules';
import { PRISES } from '../src/lib/poi';

/* CE CATALOGUE EST ÉCRIT À LA MAIN, faute de source publique française donnant
   les capacités de batterie (voir l'en-tête du module). Une liste tenue à la
   main dérive : ces tests sont les garde-fous qui l'empêchent de dériver en
   silence — clés dupliquées, chiffres absurdes, prise inventée. */

describe('la cohérence du catalogue', () => {
  it('les clés sont uniques : une collision écraserait un modèle', () => {
    const cles = CATALOGUE.map((m) => m.cle);
    expect(new Set(cles).size).toBe(cles.length);
  });

  it('les libellés affichés sont distincts, sinon la liste est ambiguë', () => {
    const libelles = CATALOGUE.map(libelleModele);
    expect(new Set(libelles).size).toBe(libelles.length);
  });

  it('chaque modèle porte des valeurs strictement positives', () => {
    for (const m of CATALOGUE) {
      expect(m.capaciteKwh, m.cle).toBeGreaterThan(0);
      expect(m.puissanceMaxKw, m.cle).toBeGreaterThan(0);
      expect(m.wltpKm, m.cle).toBeGreaterThan(0);
    }
  });

  /* LES BORNES SONT LARGES EXPRÈS. Elles n'attestent pas de l'exactitude d'un
     chiffre — aucun test ne le peut — mais elles attrapent la faute de frappe
     qui décale une virgule, et qui produirait un rayon d'action absurde sans
     que rien ne le signale. */
  it('les capacités restent dans le domaine du plausible', () => {
    for (const m of CATALOGUE) {
      expect(m.capaciteKwh, m.cle).toBeGreaterThanOrEqual(15);
      expect(m.capaciteKwh, m.cle).toBeLessThanOrEqual(130);
    }
  });

  it('les puissances de charge aussi', () => {
    for (const m of CATALOGUE) {
      expect(m.puissanceMaxKw, m.cle).toBeGreaterThanOrEqual(20);
      /* 500 ET NON 400 : la borne de vraisemblance datait d'avant les
         batteries 5C sous 800 V — le XPENG G6 restylé pointe réellement à
         451 kW (sources en tête du catalogue, 27/08/2026). Une borne de
         santé se relève quand la réalité la dépasse, elle ne censure pas. */
      expect(m.puissanceMaxKw, m.cle).toBeLessThanOrEqual(500);
    }
  });

  /* UNE CONSOMMATION ABERRANTE EST LE SIGNE D'UNE ERREUR DE SAISIE : sous
     10 kWh/100 km aucune voiture ne roule, au-dessus de 35 aucune ne se vend.
     Ce test croise capacité et autonomie, donc attrape l'incohérence entre
     DEUX champs, qu'un contrôle champ par champ laisserait passer. */
  it('capacité et autonomie s’accordent sur une consommation réaliste', () => {
    for (const m of CATALOGUE) {
      const c = consommationDepuis(m.capaciteKwh, m.wltpKm);
      expect(c, `${m.cle} : ${c.toFixed(1)} kWh/100 km`).toBeGreaterThan(9);
      expect(c, `${m.cle} : ${c.toFixed(1)} kWh/100 km`).toBeLessThan(35);
    }
  });

  it('les prises déclarées existent dans le catalogue des standards', () => {
    for (const m of CATALOGUE) {
      expect(PRISES.some((p) => p.cle === m.prise), m.cle).toBe(true);
    }
  });

  it('le catalogue couvre plusieurs marques, pas une seule', () => {
    expect(new Set(CATALOGUE.map((m) => m.marque)).size).toBeGreaterThan(10);
  });
});

describe('libelleModele', () => {
  it('ajoute la variante quand elle existe, et rien sinon', () => {
    expect(libelleModele({
      cle: 'x', marque: 'Renault', modele: 'Zoe', variante: 'R135',
      capaciteKwh: 52, puissanceMaxKw: 46, wltpKm: 395, prise: 'combo_ccs',
    })).toBe('Renault Zoe (R135)');
    expect(libelleModele({
      cle: 'y', marque: 'Dacia', modele: 'Spring',
      capaciteKwh: 26.8, puissanceMaxKw: 30, wltpKm: 225, prise: 'combo_ccs',
    })).toBe('Dacia Spring');
  });
});

describe('modeleParCle', () => {
  it('retrouve un modèle du catalogue', () => {
    expect(modeleParCle('dacia-spring')?.marque).toBe('Dacia');
  });

  /* `null`, ET NON UN MODÈLE PAR DÉFAUT : proposer une Zoe à qui roule en
     Kangoo remplirait le formulaire de chiffres crédibles et faux. */
  it('rend null sur une clé inconnue, sans replier sur un modèle', () => {
    expect(modeleParCle('licorne-2000')).toBeNull();
    expect(modeleParCle('')).toBeNull();
  });
});

describe('consommationDepuis', () => {
  it('convertit capacité et autonomie en kWh/100 km', () => {
    expect(consommationDepuis(50, 400)).toBeCloseTo(12.5, 4);
  });

  it('rend zéro plutôt qu’un infini sur une saisie vide', () => {
    expect(consommationDepuis(50, 0)).toBe(0);
    expect(consommationDepuis(0, 400)).toBe(0);
    expect(consommationDepuis(-5, 400)).toBe(0);
  });
});

describe('autonomiesProposees', () => {
  const vf8 = {
    cle: 'vinfast-vf8', marque: 'VinFast', modele: 'VF 8',
    capaciteKwh: 82.4, puissanceMaxKw: 150, wltpKm: 447, prise: 'combo_ccs' as const,
  };

  /* LE COEFFICIENT AUTOROUTE EST CALIBRÉ SUR UN RELEVÉ RÉEL : la VF 8
     d'Armelin annonce 447 km WLTP et en fait 280 sur autoroute. Ce test
     verrouille l'accord entre l'hypothèse écrite et le chiffre qu'elle
     produit — sans quoi le commentaire et le code pourraient diverger. */
  it('propose une autonoumie autoroutière conforme au relevé qui l’a calibrée', () => {
    expect(autonomiesProposees(vf8).autoroute).toBe(Math.round(447 * PART_AUTOROUTE));
    expect(autonomiesProposees(vf8).autoroute).toBeGreaterThan(270);
    expect(autonomiesProposees(vf8).autoroute).toBeLessThan(290);
  });

  /* L'ORDRE COMPTE : sur autoroute on va moins loin qu'en ville, où la
     récupération au freinage travaille. Un catalogue qui l'inverserait ferait
     planifier des arrêts au mauvais endroit. */
  it('ville > route > autoroute, toujours', () => {
    for (const m of CATALOGUE) {
      const a = autonomiesProposees(m);
      expect(a.ville, m.cle).toBeGreaterThan(a.route);
      expect(a.route, m.cle).toBeGreaterThan(a.autoroute);
    }
  });

  it('rend des kilomètres entiers : un champ de saisie n’affiche pas 314,55', () => {
    for (const m of CATALOGUE.slice(0, 5)) {
      const a = autonomiesProposees(m);
      expect(Number.isInteger(a.ville)).toBe(true);
      expect(Number.isInteger(a.autoroute)).toBe(true);
    }
  });
});


describe('le catalogue couvre ce qu’on croise sur les routes', () => {
  /* Armelin, le 26/08/2026 : « augmente la liste des constructeurs automobiles
     et augmente le nombre de voitures et regroupe-les par marques ». Il
     nommait des absents qui ne sont pas des raretés — Fastned lui manquait
     côté bornes, XPENG et Mercedes côté voitures. */
  it('porte au moins cent modèles et trente marques', () => {
    expect(CATALOGUE.length).toBeGreaterThanOrEqual(100);
    expect(new Set(CATALOGUE.map((m) => m.marque)).size).toBeGreaterThanOrEqual(30);
  });

  it('contient les marques nommément demandées', () => {
    const marques = new Set(CATALOGUE.map((m) => m.marque));
    for (const attendue of ['XPENG', 'Mercedes-Benz', 'ZEEKR', 'VinFast',
      'Volkswagen', 'Peugeot']) {
      expect(marques.has(attendue), attendue).toBe(true);
    }
  });

  it('contient les modèles nommément demandés', () => {
    const cles = new Set(CATALOGUE.map((m) => m.cle));
    for (const attendu of ['xpeng-g9-98', 'xpeng-g6-87', 'xpeng-p7-plus',
      'zeekr-7x-100', 'zeekr-7gt', 'zeekr-x-66', 'zeekr-001-100', 'zeekr-9x',
      'vinfast-vf8-plus', 'vinfast-vf6-eco', 'vinfast-vf6-plus',
      'vw-idbuzz-79', 'vw-id4-77', 'vw-id5-77', 'vw-id7-77',
      'peugeot-e3008-73', 'peugeot-e2008-54', 'peugeot-e5008-73']) {
      expect(cles.has(attendu), attendu).toBe(true);
    }
  });

  /* LES SEIZE MODÈLES DEMANDÉS NOMMÉMENT LE 02/09 (VEHIC-3). Armelin avait
     donné les liens des configurateurs ; ce test dit que la liste a été
     honorée en entier, et non aux trois quarts. */
  it('contient les modèles réclamés avec leurs liens officiels', () => {
    const cles = new Set(CATALOGUE.map((m) => m.cle));
    for (const attendu of ['cupra-raval-endurance', 'vw-id-polo-52',
      'ds-n7-74', 'ds-n7-97', 'ds-n7-97-awd', 'ds-3-etense',
      'byd-atto3-evo-rwd', 'byd-atto3-evo-awd',
      'tesla-m3-rwd-26', 'tesla-m3-premium-rwd-26', 'tesla-m3-premium-awd-26',
      'tesla-my-rwd-26', 'tesla-my-premium-rwd-26', 'tesla-my-premium-awd-26',
      'tesla-ms-plaid-26', 'tesla-mx-plaid-26']) {
      expect(cles.has(attendu), attendu).toBe(true);
    }
  });

  /* « TESLA PAR ANNÉE » VEUT DIRE : LISIBLE DANS LA LISTE. Le champ `annees`
     ne s'affiche qu'une fois le modèle appliqué ; au moment de CHOISIR, seul
     le libellé est visible. Une Model 3 2026 qui s'appelle « Propulsion »
     comme celle de 2023 laisserait l'usager choisir au hasard. */
  it('les Tesla 2026 portent leur millésime dans le libellé, pas seulement dans le champ', () => {
    const teslas26 = CATALOGUE.filter((m) => m.marque === 'Tesla' && m.annees?.includes('2026'));
    expect(teslas26.length, 'aucune Tesla 2026 au catalogue').toBeGreaterThanOrEqual(8);
    for (const m of teslas26) {
      expect(m.variante, m.cle).toContain('2026');
    }
  });

  /* LES DEUX COUSINES DE LA PLATE-FORME MEB ENTRY doivent rester d'accord :
     même batterie utile, même pointe de charge. Le jour où l'une des deux
     fiches bougera sans l'autre, c'est ici qu'on l'apprendra — et c'est
     exactement le désaccord qui m'a fait écarter leurs versions 37 kWh. */
  it('le Raval Endurance et l’ID. Polo 52 kWh s’accordent, comme leur plate-forme', () => {
    const raval = modeleParCle('cupra-raval-endurance')!;
    const polo = modeleParCle('vw-id-polo-52')!;
    expect(raval.capaciteKwh).toBe(polo.capaciteKwh);
    expect(raval.puissanceMaxKw).toBe(polo.puissanceMaxKw);
  });

  /* LA VF 8 PLUS PORTE LES CHIFFRES D'ARMELIN, pas les miens : 87,7 kWh et
     457 km, qu'il a donnés lui-même. Une fiche constructeur approximative sur
     LA voiture de l'usager principal serait le pire endroit où se tromper. */
  it('la VF 8 Plus porte les valeurs données par son propriétaire', () => {
    const vf8 = modeleParCle('vinfast-vf8-plus')!;
    expect(vf8.capaciteKwh).toBe(87.7);
    expect(vf8.wltpKm).toBe(457);
  });
});

describe('parMarque', () => {
  it('groupe les modèles sous leur marque, en ordre alphabétique', () => {
    const groupes = parMarque();
    const noms = groupes.map((g) => g.marque);
    expect([...noms].sort((a, b) => a.localeCompare(b, 'fr'))).toEqual(noms);
  });

  it('n’égare aucun modèle en chemin', () => {
    const total = parMarque().reduce((t, g) => t + g.modeles.length, 0);
    expect(total).toBe(CATALOGUE.length);
  });

  it('ne crée pas deux groupes pour une même marque', () => {
    const noms = parMarque().map((g) => g.marque);
    expect(new Set(noms).size).toBe(noms.length);
  });
});

describe('libelleDansMarque', () => {
  /* DANS UN GROUPE DE MARQUE, la répéter serait du bruit : sous « Renault »,
     on lit « Mégane E-Tech (EV60) », pas « Renault Mégane E-Tech (EV60) ». */
  it('omet la marque, que le groupe porte déjà', () => {
    const megane = modeleParCle('renault-megane-60')!;
    expect(libelleDansMarque(megane)).toBe('Mégane E-Tech (EV60)');
    expect(libelleModele(megane)).toBe('Renault Mégane E-Tech (EV60)');
  });

  it('reste lisible pour les modèles sans variante', () => {
    expect(libelleDansMarque(modeleParCle('dacia-spring')!)).toBe('Spring');
  });

  /* ET DEUX MODÈLES D'UNE MÊME MARQUE NE SE CONFONDENT PAS : c'est le seul
     texte qui les distingue dans la liste déroulante. */
  it('distingue les modèles au sein de chaque marque', () => {
    for (const g of parMarque()) {
      const libelles = g.modeles.map(libelleDansMarque);
      expect(new Set(libelles).size, g.marque).toBe(libelles.length);
    }
  });
});

/* LA RECHERCHE DU CATALOGUE (CAT-1, demande d'Armelin du 30/08) : « le choix
 * des véhicules est trop long à scroller […] ajouter une barre de recherche
 * pour un modèle ou une marque spécifique ». Ce qui se teste à sec, c'est la
 * DIFFÉRENCE entre chercher une marque et chercher un modèle. */
describe('chercherModeles', () => {
  it('sans recherche, rend TOUTES les marques, repliées', () => {
    const r = chercherModeles('');
    expect(r.length).toBe(parMarque().length);
    expect(r.every((g) => !g.ouvrir), 'tout doit rester replié').toBe(true);
  });

  it('une MARQUE cherchée rend la marque ENTIÈRE, ouverte', () => {
    /* On tape « vinfast » parce qu'on veut voir ce que VinFast propose :
       n'en montrer qu'un modèle serait répondre à côté. */
    const r = chercherModeles('vinfast');
    expect(r).toHaveLength(1);
    expect(r[0]!.marque).toBe('VinFast');
    expect(r[0]!.ouvrir).toBe(true);
    const tous = parMarque().find((g) => g.marque === 'VinFast')!;
    expect(r[0]!.modeles).toHaveLength(tous.modeles.length);
  });

  it('un MODÈLE cherché ne rend que les modèles qui répondent', () => {
    const r = chercherModeles('vf 8');
    expect(r.length).toBeGreaterThan(0);
    for (const g of r) {
      expect(g.ouvrir).toBe(true);
      for (const m of g.modeles) {
        expect(libelleModele(m).toLowerCase()).toContain('vf 8');
      }
    }
  });

  it('ignore accents et casse — on tape vite, et sans accent', () => {
    const avec = chercherModeles('Mégane');
    const sans = chercherModeles('megane');
    expect(sans.length).toBe(avec.length);
    expect(sans.length).toBeGreaterThan(0);
  });

  it('rend une liste vide quand rien ne correspond, sans lever', () => {
    expect(chercherModeles('zzzz-inexistant')).toEqual([]);
  });
});

describe('les modèles ajoutés le 02/09', () => {
  /* Armelin en avait listé quinze ; six seulement sont entrés, et c'est
     délibéré : la veille, deux sources françaises donnaient 150 kW et 190 kW
     de charge rapide pour la même Alpine A390. Ces chiffres pilotent la
     planification des arrêts — mieux vaut six modèles sourcés d'une seule
     fiche cohérente que quinze recopiés vite. */
  const cle = (c: string) => CATALOGUE.find((m) => m.cle === c);

  it('les six sont là, avec leurs trois chiffres', () => {
    for (const c of ['alpine-a390', 'mg-cyberster', 'smart-5',
      'byd-atto2', 'byd-sealu', 'byd-tang']) {
      const m = cle(c);
      expect(m, `modèle absent : ${c}`).toBeDefined();
      expect(m!.capaciteKwh).toBeGreaterThan(0);
      expect(m!.puissanceMaxKw).toBeGreaterThan(0);
      expect(m!.wltpKm).toBeGreaterThan(0);
    }
  });

  it('l’A390 porte les chiffres de sa fiche, pas ceux du communiqué', () => {
    /* 150 kW : la fiche technique. Le communiqué de presse annonçait 190 —
       c'est l'écart qui m'a fait renoncer à tout recopier vite. */
    const m = cle('alpine-a390')!;
    expect(m.capaciteKwh).toBe(89);
    expect(m.puissanceMaxKw).toBe(150);
    expect(m.wltpKm).toBe(555);
  });

  it('la Smart #5 porte sa capacité UTILE, pas la brute', () => {
    /* 100 kWh bruts, 94 utilisables. Prendre la brute aurait promis six
       pour cent d'autonomie qui n'existent pas. */
    expect(cle('smart-5')!.capaciteKwh).toBe(94);
  });
});

describe('le XPENG L03 (02/09)', () => {
  /* Je l'avais écarté la veille : XPENG ne cataloguait alors que des G6, G9,
     P7 et X9, et « L03 » ne correspondait à rien que je sache rattacher.
     Armelin a donné le configurateur officiel français — c'est un modèle réel
     de 2026, avec quatre versions. Demander plutôt que deviner a rendu la
     bonne réponse ; inventer aurait rendu la mauvaise. */
  const versions = CATALOGUE.filter((m) => m.modele === 'L03');

  it('ses quatre versions sont là', () => {
    expect(versions.map((m) => m.variante)).toEqual([
      'RWD Standard Range', 'RWD Long Range', 'RWD Long Range Ultra',
      'AWD Performance Ultra',
    ]);
  });

  it('les autonomies sont celles du configurateur officiel', () => {
    expect(versions.map((m) => m.wltpKm)).toEqual([445, 520, 480, 440]);
  });

  it('LES DEUX « ULTRA » PARTAGENT LA BATTERIE DE LA LONG RANGE', () => {
    /* Leur autonomie plus faible vient des jantes de 20 pouces et de la
       transmission intégrale, PAS d'un pack plus petit. Leur donner une
       capacité réduite aurait sous-estimé leur portée à chaque trajet. */
    const grosses = versions.filter((m) => m.variante !== 'RWD Standard Range');
    for (const m of grosses) {
      expect(m.capaciteKwh).toBe(69.5);
      expect(m.puissanceMaxKw).toBe(236);
    }
  });

  it('la Standard Range porte SA crête, recoupée par XPENG France', () => {
    /* 193 kW : EV Database et le site officiel disent la même chose. C'est le
       recoupement qui manquait à l'Alpine A390 la veille. */
    const sr = versions.find((m) => m.variante === 'RWD Standard Range')!;
    expect(sr.capaciteKwh).toBe(57);
    expect(sr.puissanceMaxKw).toBe(193);
  });
});
