import { describe, it, expect } from 'vitest';
import {
  CATALOGUE, libelleModele, modeleParCle, consommationDepuis,
  autonomiesProposees, PART_AUTOROUTE,
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
      expect(m.puissanceMaxKw, m.cle).toBeLessThanOrEqual(400);
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
