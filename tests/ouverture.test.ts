import { describe, it, expect } from 'vitest';
import { etatOuverture, plagesDuJour } from '../src/lib/detail-lieu';

/* L'ÉVALUATEUR PARTIEL HONNÊTE (FICHE-3, 01/09).
 *
 * CE QUE CES PARCOURS DÉFENDENT AVANT TOUT : qu'il se TAISE sur ce qu'il ne
 * sait pas évaluer. Un « ouvert » faux fait faire un détour pour rien. */

/** Un lundi 14 h 30 (le 31/08/2026 est un lundi). */
const lundi1430 = new Date(2026, 7, 31, 14, 30);
const lundi1815 = new Date(2026, 7, 31, 18, 15);
const dimanche11 = new Date(2026, 8, 6, 11, 0);

describe('etatOuverture — les verdicts qu’on sait rendre', () => {
  const simple = 'Mo-Fr 09:00-19:00; Sa 09:00-12:00; Su off';

  it('ouvert, avec l’heure de fermeture', () => {
    expect(etatOuverture(simple, lundi1430))
      .toEqual({ ouvert: true, texte: 'Ouvert — ferme à 19 h 00' });
  });

  /* « FERME BIENTÔT » SOUS L'HEURE PILE — le seuil qu'Armelin nomme :
     « quand il ne restera moins d'une heure pile avant la fermeture ». */
  it('ferme bientôt sous l’heure pile', () => {
    expect(etatOuverture(simple, lundi1815))
      .toEqual({ ouvert: true, texte: 'Ferme bientôt (45 min, à 19 h 00)' });
  });

  it('fermé le dimanche', () => {
    expect(etatOuverture(simple, dimanche11))
      .toEqual({ ouvert: false, texte: 'Fermé' });
  });

  it('fermé entre deux plages, avec la réouverture', () => {
    expect(etatOuverture('Mo-Fr 09:00-12:00,14:00-19:00', new Date(2026, 7, 31, 13, 0)))
      .toEqual({ ouvert: false, texte: 'Fermé — ouvre à 14 h 00' });
  });

  it('ouvert en permanence', () => {
    expect(etatOuverture('24/7', lundi1430)).toEqual({ ouvert: true, texte: 'Ouvert' });
  });

  it('une plage qui déborde minuit reste vraie ce soir', () => {
    expect(etatOuverture('Mo-Su 19:00-01:00', new Date(2026, 7, 31, 23, 30))?.ouvert)
      .toBe(true);
  });
});

describe('etatOuverture — le silence sur ce qu’on ne sait pas', () => {
  /* LE MOINDRE MORCEAU INCONNU FAIT TAIRE LE VERDICT : jours fériés,
     semaines paires, dates, soleil. La fiche affiche alors les horaires
     sans conclure. */
  it.each([
    'Mo-Fr 09:00-19:00; PH off',
    'week 1-53/2 Mo 10:00-12:00',
    'Mo-Fr sunrise-sunset',
    'Dec 24 off',
    'Mo-Fr 09:00-19:00 "sur rendez-vous"',
  ])('se tait sur « %s »', (brut) => {
    expect(etatOuverture(brut, lundi1430)).toBeNull();
  });

  it('se tait sur le vide', () => {
    expect(etatOuverture('', lundi1430)).toBeNull();
    expect(etatOuverture('   ', lundi1430)).toBeNull();
  });
});

describe('plagesDuJour — la grammaire admise', () => {
  it('lit les listes et les intervalles de jours', () => {
    // Mercredi (jour 3) est dans « Mo-Fr » et dans « We ».
    expect(plagesDuJour('Mo,We 09:00-12:00', 3)).toEqual([{ debut: 540, fin: 720 }]);
    expect(plagesDuJour('Mo,We 09:00-12:00', 2)).toEqual([]);
  });

  it('un intervalle qui tourne (Fr-Mo) couvre le dimanche', () => {
    expect(plagesDuJour('Fr-Mo 10:00-18:00', 0)).toEqual([{ debut: 600, fin: 1080 }]);
  });

  it('« off » retire ce que les blocs précédents avaient donné', () => {
    expect(plagesDuJour('Mo-Su 09:00-19:00; Su off', 0)).toEqual([]);
  });
});
