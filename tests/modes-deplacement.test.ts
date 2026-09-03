import { describe, it, expect } from 'vitest';
import {
  MODES, TOUS_LES_MODES, VITESSE_VELO_KMH,
  profilDe, estDeuxRoues, dureeVelo, dureePour, jetonDe, modeDuJeton, versMode,
} from '../src/lib/modes-deplacement';
import { versFragment, depuisFragment } from '../src/lib/partage-url';

/* LES QUATRE FAÇONS DE PARTIR (MODE-1, 03/09).
 *
 * Armelin : « "Je roule en deux-roue" devrait plutôt se situer dans "Options
 * du trajet" à côté de "Voiture" et "À pieds", et il faudrait ajouter un
 * bouton "Moto" et un bouton "Vélo". »
 *
 * CE QUE LE MOTEUR PUBLIC SAIT FAIRE, REMESURÉ LE 03/09 : il répond
 * « Parameter 'profile' is invalid: value should be one of car,pedestrian »
 * sur les TROIS ressources. Ces tests gardent fermée la porte par laquelle un
 * profil inventé entrerait. */

describe('profilDe', () => {
  it('NE REND QUE CE QUE LE MOTEUR ACCEPTE — car ou pedestrian, jamais autre', () => {
    for (const m of TOUS_LES_MODES) {
      expect(['car', 'pedestrian']).toContain(profilDe(m));
    }
  });

  it('LA MOTO ROULE SUR LE RÉSEAU ROUTIER, le vélo sur le réseau piéton', () => {
    expect(profilDe('voiture')).toBe('car');
    expect(profilDe('moto')).toBe('car');
    expect(profilDe('velo')).toBe('pedestrian');
    expect(profilDe('pied')).toBe('pedestrian');
  });
});

describe('estDeuxRoues', () => {
  it('SEULE LA MOTO allume l’annonce d’interfile', () => {
    /* LE VÉLO N'EST PAS UN DEUX-ROUES AU SENS DU DÉCRET : la remontée
       d'interfile du décret n° 2025-33 vise les deux-roues MOTORISÉS. Annoncer
       ces sections à un cycliste sur une autoroute serait absurde deux fois. */
    expect(estDeuxRoues('moto')).toBe(true);
    expect(estDeuxRoues('velo')).toBe(false);
    expect(estDeuxRoues('voiture')).toBe(false);
    expect(estDeuxRoues('pied')).toBe(false);
  });
});

describe('dureeVelo', () => {
  it('QUINZE KILOMÈTRES FONT UNE HEURE', () => {
    expect(dureeVelo(15_000)).toBeCloseTo(3600, 5);
    expect(VITESSE_VELO_KMH).toBe(15);
  });

  it('UNE DISTANCE ABSURDE NE REND PAS NaN', () => {
    /* Une durée NaN se propagerait jusqu'à l'heure d'arrivée, qui afficherait
       « Invalid Date » — le genre de panne qu'on ne voit qu'en production. */
    expect(dureeVelo(0)).toBe(0);
    expect(dureeVelo(-500)).toBe(0);
    expect(dureeVelo(Number.NaN)).toBe(0);
    expect(dureeVelo(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe('dureePour', () => {
  it('LE VÉLO REFAIT LE TEMPS, les autres gardent celui du moteur', () => {
    /* QUATRE KILOMÈTRES À PIED FONT UNE HEURE, à vélo un quart d'heure : la
       distance vaut — c'est le même chemin — mais pas la durée. */
    expect(dureePour('velo', 4_000, 3600)).toBeCloseTo(960, 0);
    expect(dureePour('pied', 4_000, 3600)).toBe(3600);
    expect(dureePour('voiture', 4_000, 300)).toBe(300);
    expect(dureePour('moto', 4_000, 300)).toBe(300);
  });
});

describe('versMode', () => {
  it('SANS RIEN DE GARDÉ, on part en voiture', () => {
    expect(versMode(undefined)).toBe('voiture');
    expect(versMode(null)).toBe('voiture');
  });

  it('LA CASE « deux-roues » DE MOTO-1 VAUT « Moto » — personne ne perd son réglage', () => {
    /* MOTO-1 (02/09) rangeait ce choix dans « Mon véhicule ». Le déménager
       sans le reprendre aurait effacé en silence le réglage de qui l'avait
       coché — la pire façon de déplacer un bouton. */
    expect(versMode(undefined, true)).toBe('moto');
  });

  it('MAIS UN CHOIX EXPLICITE L’EMPORTE sur l’ancienne case', () => {
    expect(versMode('velo', true)).toBe('velo');
    expect(versMode('pied', true)).toBe('pied');
  });

  it('UNE VALEUR ABÎMÉE NE CASSE RIEN', () => {
    expect(versMode('brouette')).toBe('voiture');
    expect(versMode(42)).toBe('voiture');
    expect(versMode({ mode: 'velo' })).toBe('voiture');
  });
});

describe('le lien de partage porte le mode', () => {
  const A = { lon: 2.3522, lat: 48.8566 };
  const B = { lon: 4.8357, lat: 45.764 };

  it('LES LIENS DÉJÀ PARTAGÉS OUVRENT LE MÊME TRAJET', () => {
    /* C'EST LA PROMESSE QU'ON NE PEUT PAS ROMPRE : un lien envoyé la semaine
       dernière par message doit rouvrir ce qu'il montrait. `car` et
       `pedestrian` gardent donc leur sens, et leur graphie. */
    const ancienVoiture = depuisFragment('#iti=2.35220,48.85660;4.83570,45.76400;car');
    expect(ancienVoiture?.mode).toBe('voiture');
    const ancienPied = depuisFragment('#iti=2.35220,48.85660;4.83570,45.76400;pedestrian');
    expect(ancienPied?.mode).toBe('pied');
    // Et un lien « Voiture » émis aujourd'hui reste identique à l'ancien.
    expect(versFragment({ depart: A, arrivee: B, mode: 'voiture' }))
      .toBe('#iti=2.35220,48.85660;4.83570,45.76400;car');
  });

  it('UN TRAJET À VÉLO NE SE ROUVRE PLUS « À PIED »', () => {
    /* SANS CELA, LE LIEN MENTIRAIT EN SILENCE : le trajet rouvrirait sur le
       même tracé avec une durée quatre fois plus longue, sans que rien ne le
       signale. */
    const lien = versFragment({ depart: A, arrivee: B, mode: 'velo' });
    expect(lien).toContain(';velo');
    expect(depuisFragment(lien)?.mode).toBe('velo');
    const moto = versFragment({ depart: A, arrivee: B, mode: 'moto' });
    expect(depuisFragment(moto)?.mode).toBe('moto');
  });

  it('UN JETON INCONNU INVALIDE TOUT LE FRAGMENT', () => {
    /* Même règle que les évitements : on ne devine pas ce qu'un lien forgé a
       voulu dire. */
    expect(depuisFragment('#iti=2.35220,48.85660;4.83570,45.76400;fusee')).toBeNull();
    expect(depuisFragment('#iti=2.35220,48.85660;4.83570,45.76400;bicycle')).toBeNull();
  });

  it('LES ÉVITEMENTS ET L’OPTIMISATION SURVIVENT au voisinage du mode', () => {
    const lien = versFragment({
      depart: A, arrivee: B, mode: 'moto', eviter: ['autoroute'], optimisation: 'shortest',
    });
    const relu = depuisFragment(lien);
    expect(relu?.mode).toBe('moto');
    expect(relu?.eviter).toEqual(['autoroute']);
    expect(relu?.optimisation).toBe('shortest');
  });
});

describe('les libellés', () => {
  it('SONT CEUX QU’ARMELIN A ÉCRITS', () => {
    expect(MODES.voiture).toBe('Voiture');
    expect(MODES.moto).toBe('Moto');
    expect(MODES.velo).toBe('Vélo');
    expect(MODES.pied).toBe('À pied');
  });

  it('CHAQUE MODE A SON JETON, et ils sont tous distincts', () => {
    const jetons = TOUS_LES_MODES.map(jetonDe);
    expect(new Set(jetons).size).toBe(TOUS_LES_MODES.length);
    for (const m of TOUS_LES_MODES) expect(modeDuJeton(jetonDe(m))).toBe(m);
    expect(modeDuJeton('inconnu')).toBeNull();
  });
});
