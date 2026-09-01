import { describe, it, expect } from 'vitest';
import {
  flouterTrajet, texteDuPartage, nomDuFichier, CONTACT,
  CE_QUI_PART, CE_QUI_RESTE,
} from '../src/lib/partage-trajet';
import type { TrajetEnregistre } from '../src/lib/historique-trajets';

/* CONTRIBUER UN PARCOURS SANS SE LIVRER (PARTAGE-1, 01/09).
 *
 * Armelin : « un bouton dédié pour améliorer l'algorithme en indiquant aux
 * gens qu'on floute les adresses de départ et d'arrivée. D'exposer le fichier
 * à l'utilisateur qui pourra vérifier le contenu avant de nous l'envoyer. »
 *
 * Ces tests défendent la promesse elle-même : ce qui doit disparaître du
 * fichier n'y est plus, et ce qui sert à l'algorithme y reste. */

const TRAJET: TrajetEnregistre = {
  id: 't1756700000000',
  departMs: Date.parse('2026-09-01T07:43:29.517Z'),
  titre: 'Le Plessis-Trévise → 12 rue de la Paix, Paris',
  resume: {
    dureeMs: 2_700_000, vitesseMaxKmh: 131, vitesseMoyenneKmh: 62,
    arrets: 3, arretMs: 240_000,
  },
  releves: [
    { tMs: 0, vitesseMs: 0, altitudeM: 92 },
    { tMs: 30_000, vitesseMs: 12.4, altitudeM: 95 },
  ],
};

describe('flouterTrajet', () => {
  it('LE TITRE DISPARAÎT — c’est lui qui porte les deux adresses', () => {
    const f = flouterTrajet(TRAJET);
    expect(JSON.stringify(f)).not.toContain('Plessis');
    expect(JSON.stringify(f)).not.toContain('rue de la Paix');
    expect(f).not.toHaveProperty('titre');
  });

  it('L’IDENTIFIANT LOCAL DISPARAÎT AUSSI : il est fait de l’instant du départ', () => {
    /* `t1756700000000` rendrait la milliseconde qu'on vient d'arrondir — un
       floutage qu'un autre champ défait n'en est pas un. */
    expect(JSON.stringify(flouterTrajet(TRAJET))).not.toContain('1756700000000');
  });

  it('l’heure du départ est arrondie à l’heure pleine', () => {
    /* À la minute près, deux fichiers d'une même personne se recollent ; à
       l'heure, ils ne disent plus qu'« un matin ». */
    expect(flouterTrajet(TRAJET).departHeure).toBe('2026-09-01T07:00Z');
  });

  it('la DATE reste : sans elle, on ne compare plus août à décembre', () => {
    expect(flouterTrajet(TRAJET).departHeure).toContain('2026-09-01');
  });

  it('ce qui sert à l’algorithme reste entier', () => {
    const f = flouterTrajet(TRAJET);
    expect(f.resume).toEqual(TRAJET.resume);
    expect(f.releves).toEqual(TRAJET.releves);
  });

  it('les relevés ne portent AUCUN point — c’est le jeu qui est ainsi fait', () => {
    /* Ce n'est pas un floutage de ma part : un parcours enregistré n'a jamais
       contenu de coordonnée. Ce test le CONSTATE, pour qu'une évolution qui en
       ajouterait un jour ne passe pas ici sans qu'on s'en aperçoive. */
    for (const r of flouterTrajet(TRAJET).releves) {
      expect(Object.keys(r).sort()).toEqual(['altitudeM', 'tMs', 'vitesseMs']);
    }
  });

  it('le format est versionné', () => {
    expect(flouterTrajet(TRAJET).version).toBe(1);
  });
});

describe('texteDuPartage', () => {
  it('LE FICHIER EST LISIBLE : on ne peut pas vérifier une ligne compacte', () => {
    const t = texteDuPartage([TRAJET]);
    expect(t.split('\n').length).toBeGreaterThan(10);
  });

  it('il dit ce qu’il est, pour qui le relira dans six mois', () => {
    const t = texteDuPartage([TRAJET]);
    expect(t).toContain('Infonovice Maps');
    expect(t).toContain('"adressesRetirees": true');
  });

  it('et aucune adresse n’y survit, même sur plusieurs trajets', () => {
    const t = texteDuPartage([TRAJET, { ...TRAJET, titre: 'Domicile → Travail' }]);
    expect(t).not.toContain('Plessis');
    expect(t).not.toContain('Domicile');
    expect(t).not.toContain('Travail');
  });

  it('c’est du JSON valide', () => {
    expect(() => JSON.parse(texteDuPartage([TRAJET]))).not.toThrow();
  });
});

describe('nomDuFichier', () => {
  it('dit combien de parcours il contient', () => {
    expect(nomDuFichier([TRAJET])).toBe('infonovice-parcours-1.json');
  });
});

describe('ce qu’on annonce', () => {
  it('les deux listes sont écrites, et parlent des adresses', () => {
    /* La promesse doit être LUE avant l'envoi : une annonce vide vaudrait
       moins que pas d'annonce du tout. */
    expect(CE_QUI_PART.length).toBeGreaterThan(2);
    expect(CE_QUI_RESTE.join(' ')).toContain('adresses');
  });

  it('l’adresse de contact n’existe qu’à un seul endroit', () => {
    expect(CONTACT).toBe('contact@infonovice.fr');
  });
});
