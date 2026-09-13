// CE QUE LA SONDE A LE DROIT DE PUBLIER (SONDE-VRAIE-1, 13/09/2026).
//
// La contre-mesure du 13/09 a établi deux fautes du même genre dans la sonde :
// un chiffre juste d'apparence, faux de sens. Ces parcours tiennent la règle
// qui en sort — **une valeur bornée par la fenêtre d'observation ne sort
// JAMAIS sous le nom d'une mesure** — et ils la tiennent sur des fonctions
// PURES, donc sans navigateur et sans dépendre de l'état de la machine. C'est
// délibéré : la garde de charge refuse de mesurer sur ce poste, et si toute la
// logique vivait dans le navigateur, rien de tout cela ne serait éprouvé.
import { describe, it, expect } from 'vitest';
import {
  jugerCalcul, jugerPorte, comparerEmpreintes, exigerFichiersAttendus,
  SCRIPT_OBSERVATEUR,
} from '../scripts/chrono-sonde.mjs';

describe('la durée du calcul d’itinéraire (défaut n° 1 : on mesurait le chargement de la page)', () => {
  it('mesure du geste de lancement jusqu’au plan de recharge écrit — et rien d’autre', () => {
    // UNE DURÉE QU'ON CONNAÎT D'AVANCE : le geste à 1 000 ms, le plan à
    // 4 200 ms. La sonde doit rendre 3 200 — pas 1 000 (le chargement), pas
    // 4 200 (l'origine de la page), pas 2 000 (l'itinéraire seul).
    const v = jugerCalcul({
      armeA: 950,
      departA: 1_000,
      itiPretA: 3_000,
      planPretA: 4_200,
      planLisibleA: 4_400,
      naturePlan: 'plan',
      dernierRegard: 9_000,
      debutObservationA: 400,
      attentes: [],
    });
    expect(v.mesure).toBe(true);
    // LE CRITÈRE EST LE PLAN LISIBLE À L'ÉCRAN (revue Codex du 13/09) : 4 400 −
    // 1 000. Le plan ÉCRIT à 4 200 reste publié, sous son propre nom.
    expect(v.dureeCalculMs).toBe(3_400);
    expect(v.dureeCalculInterneMs).toBe(3_200);
    // Les jalons sortent aussi, NOMMÉS pour ce qu'ils sont : l'itinéraire seul
    // n'est pas le critère, et le confondre avec lui est ce qui a produit un
    // chiffre faux.
    expect(v.dureeItineraireMs).toBe(2_000);
    expect(v.dureeAffichageMs).toBe(3_400);
  });

  it('AUCUNE durée n’est publiée quand le plan n’est jamais arrivé', () => {
    // C'EST LE CŒUR DU DÉFAUT. L'ancienne sonde aurait rendu un nombre —
    // `dernierRegard - depart` — qui grandit avec la patience de l'observateur.
    const v = jugerCalcul({
      armeA: 900, departA: 1_000, itiPretA: 3_000,
      planPretA: null, planLisibleA: null, naturePlan: null,
      dernierRegard: 46_000, debutObservationA: 400, attentes: [],
    });
    expect(v.mesure).toBe(false);
    expect(v.dureeCalculMs).toBeNull();
    expect(v.observeSansPlanMs).toBe(45_000);
    expect(v.motif).toMatch(/AUCUNE durée de calcul n’est publiée/);
    // Le jalon intermédiaire, lui, a bien été vu : on le dit, il n'est pas
    // borné par la fenêtre.
    expect(v.dureeItineraireMs).toBe(2_000);
  });

  it('un chronomètre jamais déclenché ne rend pas zéro, il rend « rien », et il le dit', () => {
    const v = jugerCalcul({
      armeA: 900, departA: null, itiPretA: null, planPretA: null,
      planLisibleA: null, naturePlan: null, dernierRegard: 20_000,
      debutObservationA: 0, attentes: [],
    });
    expect(v.mesure).toBe(false);
    expect(v.dureeCalculMs).toBeNull();
    expect(v.motif).toMatch(/jamais été déclenché/);
  });

  it('un plan ÉCRIT mais jamais lisible à l’écran ne donne AUCUNE durée de critère', () => {
    // REVUE CODEX DU 13/09, CONSTAT SÉRIEUX : `planPretA` se satisfaisait d'un
    // plan rendu dans une vue cachée, et publiait une durée sous le nom du
    // critère. La feuille de relevé mobile mesure jusqu'aux arrêts « affichés
    // et lisibles ». Le jalon interne reste publié, sous son propre nom.
    const v = jugerCalcul({
      departA: 1_000, itiPretA: 3_000, planPretA: 4_000, planLisibleA: null,
      naturePlan: 'plan', dernierRegard: 20_000, debutObservationA: 0, attentes: [],
    });
    expect(v.mesure).toBe(false);
    expect(v.dureeCalculMs).toBeNull();
    expect(v.dureeCalculInterneMs).toBe(3_000);
    expect(v.motif).toMatch(/JAMAIS été lisible à l’écran/);
  });

  it('un refus motivé est une fin de calcul, et il est nommé refus — pas plan', () => {
    // Le calcul a abouti ; sa réponse est « non ». La durée est mesurable, mais
    // lire « plan de recharge » sur un refus tromperait le lecteur du relevé.
    const v = jugerCalcul({
      armeA: 0, departA: 500, itiPretA: 2_000, planPretA: 3_500,
      planLisibleA: 3_500, naturePlan: 'refus', dernierRegard: 10_000,
      debutObservationA: 0, attentes: [],
    });
    expect(v.mesure).toBe(true);
    expect(v.dureeCalculMs).toBe(3_000);
    expect(v.naturePlan).toBe('refus');
    expect(v.motif).toMatch(/refus motivé/);
  });
});

describe('la durée de vie de la porte de sortie (défaut n° 2 : un artefact de la fenêtre)', () => {
  it('porte refermée sous nos yeux : la durée de vie est réelle et publiée', () => {
    const v = jugerPorte({
      porteOuverteA: 15_000, porteFermeeA: 23_400,
      dernierRegard: 46_000, debutObservationA: 0,
    });
    expect(v.refermee).toBe(true);
    expect(v.dureeDeVieMs).toBe(8_400);
    expect(v.toujoursOuverteApresMs).toBeNull();
  });

  it('porte JAMAIS refermée : aucune durée de vie, une durée d’observation nommée comme telle', () => {
    // L'ANCIENNE SONDE RENDAIT ICI 31 000 ms SOUS LE NOM « durée de vie ».
    // Elle aurait rendu 61 000 si on avait observé une minute de plus : le
    // chiffre décrivait notre patience, pas le bouton. C'est précisément le
    // cas où le correctif FONCTIONNE — donc celui où la sonde mentait le plus.
    const v = jugerPorte({
      porteOuverteA: 15_000, porteFermeeA: null,
      dernierRegard: 46_000, debutObservationA: 0,
    });
    expect(v.refermee).toBe(false);
    expect(v.dureeDeVieMs).toBeNull();
    expect(v.toujoursOuverteApresMs).toBe(31_000);
    expect(v.motif).toMatch(/TOUJOURS OUVERTE après 31000 ms observées/);
  });

  it('la durée de vie est nulle CHAQUE FOIS que la porte ne s’est pas refermée, quelle que soit la fenêtre', () => {
    // L'INVARIANT, éprouvé sur toute une plage de fenêtres : si le chiffre
    // dépendait de la durée d'observation, cette boucle le montrerait.
    for (const fin of [16_000, 30_000, 46_000, 120_000, 600_000]) {
      const v = jugerPorte({
        porteOuverteA: 15_000, porteFermeeA: null, dernierRegard: fin, debutObservationA: 0,
      });
      expect(v.dureeDeVieMs, `fenêtre de ${fin} ms`).toBeNull();
      expect(v.toujoursOuverteApresMs).toBe(fin - 15_000);
    }
  });

  it('présente mais hors du champ visible : la sonde dit les DEUX, elle n’en déduit pas « pas de porte »', () => {
    // DÉCOUVERT LE 13/09 CONTRE LE VRAI PRODUIT : à 1280 × 720, le bouton
    // « Réessayer » se trouve à y = 732 — sous la ligne de flottaison.
    // `elementFromPoint` y rend `null`, et le prédicat unique d'avant
    // concluait « la porte ne s'est JAMAIS ouverte » alors qu'elle était
    // ouverte et cliquable après un défilement. Deux faits distincts, deux
    // champs distincts.
    const v = jugerPorte({
      porteOuverteA: 15_200, porteFermeeA: null, porteAtteignableA: null,
      dernierRegard: 45_000, debutObservationA: 0,
    });
    expect(v.ouverte).toBe(true);
    expect(v.atteignableSansDefilement).toBe(false);
    expect(v.toujoursOuverteApresMs).toBe(29_800);

    const vue = jugerPorte({
      porteOuverteA: 15_200, porteFermeeA: null, porteAtteignableA: 15_400,
      dernierRegard: 45_000, debutObservationA: 0,
    });
    expect(vue.atteignableSansDefilement).toBe(true);
    expect(vue.atteignableApresMs).toBe(200);
  });

  it('porte jamais ouverte : ce n’est pas une durée de vie de zéro, c’est l’absence de porte', () => {
    const v = jugerPorte({
      porteOuverteA: null, porteFermeeA: null, dernierRegard: 46_000, debutObservationA: 0,
    });
    expect(v.ouverte).toBe(false);
    expect(v.dureeDeVieMs).toBeNull();
    expect(v.motif).toMatch(/JAMAIS ouverte/);
  });
});

describe('l’empreinte du bundle servi (défaut n° 3 : contrôlée avant le fichier qui compte)', () => {
  const dist = new Map([
    ['/assets/index-CGs6Pw5C.js', 'aaaaaaaaaaaaaaaa'],
    ['/assets/panneau-itineraire-D-eoKchK.js', 'bbbbbbbbbbbbbbbb'],
  ]);

  it('attrape une divergence sur le chunk d’import dynamique, celui qui porte la mesure', () => {
    const servi = new Map([
      ['/assets/index-CGs6Pw5C.js', 'aaaaaaaaaaaaaaaa'],
      // Un seul octet changé dans le panneau d'itinéraire suffit à changer
      // l'empreinte : c'est exactement le bundle périmé qu'on cherche.
      ['/assets/panneau-itineraire-D-eoKchK.js', 'bbbbbbbbbbbbbbbX'],
    ]);
    const r = comparerEmpreintes(servi, dist);
    expect(r.conforme).toBe(false);
    expect(r.divergences).toEqual(['/assets/panneau-itineraire-D-eoKchK.js']);
  });

  it('un fichier servi sans empreinte de référence n’est PAS un fichier vérifié', () => {
    const servi = new Map([['/assets/intrus-XXXX.js', 'cccccccccccccccc']]);
    const r = comparerEmpreintes(servi, dist);
    expect(r.conforme).toBe(false);
    expect(r.inconnus).toEqual(['/assets/intrus-XXXX.js']);
    expect(r.verifies).toEqual([]);
  });

  it('tout conforme : la campagne peut continuer, et on sait ce qui a été vérifié', () => {
    const r = comparerEmpreintes(new Map(dist), dist);
    expect(r.conforme).toBe(true);
    expect(r.verifies).toHaveLength(2);
  });

  it('un contrôle qui n’a jamais vu le fichier qui compte n’est pas un contrôle', () => {
    // LE PIÈGE DU 13/09, EN UNE ASSERTION : tant que le contrôle tournait
    // avant le déclenchement du calcul, la liste des fichiers vus ne contenait
    // PAS `panneau-itineraire`. Un « conforme » sur cette liste-là ne veut rien
    // dire, et la sonde doit donc refuser au lieu de se féliciter.
    const vusAvantDeclenchement = ['/assets/index-CGs6Pw5C.js', '/assets/maplibre-CYtt0gXg.js'];
    const r = exigerFichiersAttendus(vusAvantDeclenchement, ['panneau-itineraire']);
    expect(r.ok).toBe(false);
    expect(r.manquants).toEqual(['panneau-itineraire']);

    const vusApres = [...vusAvantDeclenchement, '/assets/panneau-itineraire-D-eoKchK.js'];
    expect(exigerFichiersAttendus(vusApres, ['panneau-itineraire']).ok).toBe(true);
  });
});

describe('l’observateur de page', () => {
  it('se sérialise en une expression appelable, sans coquille d’échappement', () => {
    // Une version antérieure de la sonde portait son code de page dans un
    // littéral de chaîne : une coquille d'échappement y serait restée
    // invisible jusqu'au premier relevé. Ici c'est une vraie fonction, et ce
    // parcours vérifie que sa sérialisation reste une expression valide.
    expect(SCRIPT_OBSERVATEUR.startsWith('(function')).toBe(true);
    expect(SCRIPT_OBSERVATEUR.endsWith(')()')).toBe(true);
    expect(() => new Function(`return ${SCRIPT_OBSERVATEUR.slice(0, -2)}`)).not.toThrow();
    // Les points d'ancrage du produit, cités une seule fois et donc ici :
    for (const ancre of ['.iti-abandon-reessayer', '.iti-recharge-corps',
      '.recharge-resume', '.recharge-refus', 'attente-chien', '.iti-resultat']) {
      expect(SCRIPT_OBSERVATEUR, `l’observateur doit citer ${ancre}`).toContain(ancre);
    }
  });
});
