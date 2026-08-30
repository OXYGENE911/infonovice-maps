import { describe, it, expect } from 'vitest';
import {
  etapeAlAvancement, etatGuidage, distanceEnMots, heureArriveeEstimee,
  ECART_HORS_ROUTE_M, partiAContresens, approcheManoeuvre, type OptionsGuidage,
} from '../src/lib/guidage';
import type { EtapeRoute } from '../src/lib/feuille-de-route';

const etape = (texte: string, distance: number): EtapeRoute =>
  ({ texte, voie: '', distance });

/* Un tracé plein est ~111 km par degré de latitude : ces deux points font donc
   une ligne droite d'environ 111 km, ce qui rend les calculs lisibles. */
const TRACE: [number, number][] = [[2.0, 48.0], [2.0, 49.0]];

const options = (etapes: EtapeRoute[]): OptionsGuidage => ({
  trace: TRACE,
  distanceTotaleM: 111_000,
  dureeTotaleS: 3600,
  etapes,
});

describe('etapeAlAvancement', () => {
  const etapes = [etape('Partez', 1000), etape('Tournez à droite', 500), etape('Arrivée', 200)];

  it('trouve l’étape dont l’intervalle contient l’avancement', () => {
    expect(etapeAlAvancement(etapes, 0)?.index).toBe(0);
    expect(etapeAlAvancement(etapes, 999)?.index).toBe(0);
    expect(etapeAlAvancement(etapes, 1200)?.index).toBe(1);
    expect(etapeAlAvancement(etapes, 1600)?.index).toBe(2);
  });

  /* À LA FRONTIÈRE EXACTE, ON EST DÉJÀ SUR LA SUIVANTE : afficher encore
     « tournez à droite » un mètre après le carrefour serait exactement le
     genre de retard qui fait rater la sortie. */
  it('bascule sur la suivante dès la frontière atteinte', () => {
    expect(etapeAlAvancement(etapes, 1000)?.index).toBe(1);
    expect(etapeAlAvancement(etapes, 1500)?.index).toBe(2);
  });

  it('rend les bornes de l’étape, pour mesurer ce qui reste avant la manœuvre', () => {
    expect(etapeAlAvancement(etapes, 1200)).toEqual({ index: 1, debutM: 1000, finM: 1500 });
  });

  /* AU-DELÀ DE LA DERNIÈRE, L'INSTRUCTION RESTE LA DERNIÈRE. Rendre `null`
     ferait clignoter le bandeau au moment de l'arrivée, quand la position GPS
     dépasse de quelques mètres la fin du tracé. */
  it('reste sur la dernière étape une fois arrivé', () => {
    expect(etapeAlAvancement(etapes, 99_999)?.index).toBe(2);
  });

  it('un avancement négatif vaut le départ, pas une erreur', () => {
    expect(etapeAlAvancement(etapes, -50)?.index).toBe(0);
  });

  it('rend null sans feuille de route, plutôt qu’une étape inventée', () => {
    expect(etapeAlAvancement([], 100)).toBeNull();
  });

  it('supporte une étape de longueur absurde sans boucler', () => {
    const abimees = [etape('A', Number.NaN), etape('B', 300)];
    expect(etapeAlAvancement(abimees, 100)?.index).toBe(1);
  });
});

describe('etatGuidage', () => {
  it('situe la position sur le tracé et dit ce qui reste', () => {
    // À mi-parcours, sur la ligne.
    const e = etatGuidage(options([etape('Tout droit', 111_000)]), { lon: 2.0, lat: 48.5 });
    expect(e.avancementM).toBeGreaterThan(54_000);
    expect(e.avancementM).toBeLessThan(57_000);
    expect(e.restantM).toBeGreaterThan(54_000);
    expect(e.horsRoute).toBe(false);
  });

  /* LA DURÉE RESTANTE EST AU PRORATA DE LA DISTANCE. C'est une approximation
     assumée — le service ne rend qu'un total — et ce test la verrouille pour
     qu'elle ne se transforme pas en calcul obscur. */
  it('répartit la durée totale au prorata de ce qui reste', () => {
    const e = etatGuidage(options([etape('Tout droit', 111_000)]), { lon: 2.0, lat: 48.5 });
    expect(e.restantS).toBeGreaterThan(1700);
    expect(e.restantS).toBeLessThan(1900);
  });

  /* QUITTER LA ROUTE SE DIT, IL NE SE DEVINE PAS. Sans ce drapeau, le bandeau
     continuerait d'annoncer une manœuvre pour une route qu'on ne suit plus —
     ce qui est bien pire que de ne rien annoncer. */
  it('signale la sortie de route au-delà du seuil', () => {
    // Un dixième de degré de longitude à cette latitude ≈ 7 km.
    const e = etatGuidage(options([etape('Tout droit', 111_000)]), { lon: 2.1, lat: 48.5 });
    expect(e.ecartM).toBeGreaterThan(ECART_HORS_ROUTE_M);
    expect(e.horsRoute).toBe(true);
  });

  it('reste sur la route à l’intérieur du seuil', () => {
    // Un millième de degré ≈ 73 m à cette latitude : sous le seuil de 150 m.
    const e = etatGuidage(options([etape('Tout droit', 111_000)]), { lon: 2.001, lat: 48.5 });
    expect(e.horsRoute).toBe(false);
  });

  it('donne l’étape en cours, la manœuvre annoncée, et la distance qui l’en sépare', () => {
    /* `suivante` a changé de sens avec le correctif du 29/08 : c'est
       désormais la manœuvre d'APRÈS celle qu'on annonce, pour préparer un
       enchaînement. Avec deux étapes, il n'y a donc rien après. */
    const e = etatGuidage(
      options([etape('Partez', 55_000), etape('Tournez à gauche', 56_000)]),
      { lon: 2.0, lat: 48.4 },
    );
    expect(e.etape?.texte).toBe('Partez');
    expect(e.manoeuvre?.texte, 'c’est la PROCHAINE manœuvre qu’on annonce')
      .toBe('Tournez à gauche');
    expect(e.suivante).toBeNull();
    expect(e.jusquALaManoeuvreM).toBeGreaterThan(0);
  });

  it('sans feuille de route, rend des distances sans inventer d’instruction', () => {
    const e = etatGuidage(options([]), { lon: 2.0, lat: 48.5 });
    expect(e.etape).toBeNull();
    expect(e.suivante).toBeNull();
    expect(e.restantM).toBeGreaterThan(0);
  });

  it('ne rend jamais un restant négatif, même au-delà de l’arrivée', () => {
    const e = etatGuidage(options([]), { lon: 2.0, lat: 49.0 });
    expect(e.restantM).toBeGreaterThanOrEqual(0);
    expect(e.restantS).toBeGreaterThanOrEqual(0);
  });

  it('supporte une distance totale absurde sans produire NaN', () => {
    const e = etatGuidage(
      { trace: TRACE, distanceTotaleM: 0, dureeTotaleS: 0, etapes: [] },
      { lon: 2.0, lat: 48.5 },
    );
    expect(Number.isFinite(e.restantM)).toBe(true);
    expect(Number.isFinite(e.restantS)).toBe(true);
  });
});

describe('distanceEnMots', () => {
  /* LES PALIERS SONT CALIBRÉS POUR UN REGARD D'UNE DEMI-SECONDE. « Dans
     1 234 m » demande de lire quatre chiffres pour en retenir un. */
  it('dit « maintenant » au pied de la manœuvre', () => {
    expect(distanceEnMots(0)).toBe('maintenant');
    expect(distanceEnMots(19)).toBe('maintenant');
  });

  it('arrondit à la dizaine sous cent mètres, où la précision compte', () => {
    expect(distanceEnMots(64)).toBe('dans 60 m');
    expect(distanceEnMots(97)).toBe('dans 100 m');
  });

  it('arrondit à la cinquantaine jusqu’au kilomètre', () => {
    expect(distanceEnMots(340)).toBe('dans 350 m');
    expect(distanceEnMots(910)).toBe('dans 900 m');
  });

  it('passe au kilomètre décimal au-delà, virgule française', () => {
    expect(distanceEnMots(1234)).toBe('dans 1,2 km');
    expect(distanceEnMots(9990)).toBe('dans 10,0 km');
  });

  it('laisse tomber la décimale au-delà de dix kilomètres', () => {
    expect(distanceEnMots(42_400)).toBe('dans 42 km');
  });

  it('rend une chaîne vide sur une valeur absurde, jamais « dans NaN m »', () => {
    expect(distanceEnMots(Number.NaN)).toBe('');
    expect(distanceEnMots(-10)).toBe('');
  });
});

describe('heureArriveeEstimee', () => {
  const t = new Date('2026-08-26T10:00:00Z');

  it('ajoute le restant à l’heure courante', () => {
    expect(heureArriveeEstimee(3600, t)?.toISOString()).toBe('2026-08-26T11:00:00.000Z');
  });

  it('rend null sur une durée absurde plutôt qu’une date de fantaisie', () => {
    expect(heureArriveeEstimee(Number.NaN, t)).toBeNull();
    expect(heureArriveeEstimee(-1, t)).toBeNull();
  });
});

/* LA MANŒUVRE ANNONCÉE — le défaut le plus grave trouvé jusqu'ici, relevé
 * par Armelin au volant le 29/08, captures à l'appui : « le GPS confond sa
 * gauche et sa droite pendant la navigation ». Il ne les confondait pas :
 * il avait UNE MANŒUVRE DE RETARD. Le service rend l'instruction du DÉBUT
 * de chaque étape et la longueur qui SUIT (vérifié sur réponse réelle :
 * `depart` puis 30 m, `turn sharp left` puis 46 m, `turn right` puis
 * 205 m…). Afficher l'étape COURANTE, c'était nommer ce qu'on venait de
 * faire — avec la distance de ce qui arrivait.
 */
describe('etatGuidage — la manœuvre annoncée', () => {
  const etapes = [
    { texte: 'Départ', voie: 'Rue du Départ', distance: 1000 },
    { texte: 'Tournez à droite', voie: 'D606', distance: 500 },
    { texte: 'Tournez à gauche', voie: 'Avenue des Tilleuls', distance: 300 },
    { texte: 'Vous êtes arrivé', voie: '', distance: 0 },
  ];
  // 111 km par degré : l'avancement en mètres se pose en latitude.
  const aM = (m: number): { lon: number; lat: number } =>
    ({ lon: 2.0, lat: 48.0 + m / 111_000 });

  it('annonce CE QUI ARRIVE, jamais ce qu’on vient de faire', () => {
    const e = etatGuidage(options(etapes), aM(300));
    expect(e.etape?.texte, 'l’étape courante reste celle où l’on roule').toBe('Départ');
    expect(e.manoeuvre?.texte, 'la manœuvre annoncée doit être la PROCHAINE')
      .toBe('Tournez à droite');
    // …et la distance est bien celle qui mène à CETTE manœuvre.
    expect(e.jusquALaManoeuvreM).toBeGreaterThan(698);
    expect(e.jusquALaManoeuvreM).toBeLessThan(702);
  });

  it('la voie annoncée est celle où l’on VA, pas celle qu’on quitte', () => {
    const e = etatGuidage(options(etapes), aM(300));
    expect(e.etape?.voie).toBe('Rue du Départ');
    expect(e.manoeuvre?.voie).toBe('D606');
  });

  it('avance d’une manœuvre à l’autre au fil du trajet', () => {
    expect(etatGuidage(options(etapes), aM(1200)).manoeuvre?.texte).toBe('Tournez à gauche');
    expect(etatGuidage(options(etapes), aM(1600)).manoeuvre?.texte).toBe('Vous êtes arrivé');
  });

  it('à la DERNIÈRE étape, il n’y a plus rien après : on garde l’arrivée', () => {
    const e = etatGuidage(options(etapes), aM(99_999));
    expect(e.manoeuvre?.texte).toBe('Vous êtes arrivé');
    expect(e.suivante).toBeNull();
  });

  it('« suivante » sert l’enchaînement : la manœuvre d’APRÈS celle annoncée', () => {
    const e = etatGuidage(options(etapes), aM(300));
    expect(e.suivante?.texte).toBe('Tournez à gauche');
  });

  it('sans feuille de route, aucune manœuvre n’est inventée', () => {
    const e = etatGuidage(options([]), aM(300));
    expect(e.manoeuvre).toBeNull();
    expect(e.etape).toBeNull();
  });
});

/* LE RECALCUL QUI ARRIVE TROP TARD — Armelin, le 29/08, capture à l'appui :
 * « j'ai pu faire le tour d'un rond-point et m'écarter du trajet sans que le
 * recalcul intervienne ». Deux causes, deux remèdes : un seuil d'écart trop
 * indulgent (150 m), et l'aveuglement au demi-tour — on repart en arrière SUR
 * le tracé, l'écart ne voit rien. */
describe('partiAContresens', () => {
  it('constate le recul franc : c’est un demi-tour, pas du bruit', () => {
    expect(partiAContresens(1_000, 1_400)).toBe(true);
  });

  it('reste muet sous la marge — un récepteur tremble de dizaines de mètres', () => {
    expect(partiAContresens(1_390, 1_400)).toBe(false);
    expect(partiAContresens(1_300, 1_400)).toBe(false);
    // Pile à la marge : on ne déclenche pas — l'inégalité est stricte.
    expect(partiAContresens(1_250, 1_400)).toBe(false);
  });

  it('ne dit jamais contresens quand on AVANCE', () => {
    expect(partiAContresens(1_500, 1_400)).toBe(false);
    expect(partiAContresens(0, 0)).toBe(false);
  });
});

describe('ECART_HORS_ROUTE_M', () => {
  it('est descendu à 80 m — 150 laissait prendre une rue entière', () => {
    expect(ECART_HORS_ROUTE_M).toBe(80);
  });

  it('reste au-dessus du tremblement d’un récepteur en rue encaissée', () => {
    /* 30 à 50 m en ville dense : en dessous, on annoncerait « vous avez
       quitté l'itinéraire » à des gens qui roulent droit. */
    expect(ECART_HORS_ROUTE_M).toBeGreaterThan(50);
  });
});

/* LE ZOOM D'APPROCHE (ZOOM-1, demande d'Armelin du 30/08) : « un zoom lors
 * de l'arrivée à une intersection […] pour revenir ensuite à la vue initiale
 * quand l'obstacle est passé ». Ce qui se teste à sec, c'est la DÉCISION —
 * et surtout sa stabilité : un seuil unique ferait battre la carte au rythme
 * du bruit du récepteur. */
describe('approcheManoeuvre', () => {
  it('se rapproche d’un virage, pas d’une ligne droite', () => {
    expect(approcheManoeuvre(200, 'right', false)).toBe(true);
    expect(approcheManoeuvre(200, 'left', false)).toBe(true);
    expect(approcheManoeuvre(200, 'rond-point', false)).toBe(true);
    expect(approcheManoeuvre(200, 'arrivee', false)).toBe(true);
    expect(approcheManoeuvre(200, 'straight', false)).toBe(false);
    expect(approcheManoeuvre(200, null, false)).toBe(false);
  });

  it('N’ENTRE qu’en dessous de 260 m', () => {
    expect(approcheManoeuvre(259, 'right', false)).toBe(true);
    expect(approcheManoeuvre(261, 'right', false)).toBe(false);
  });

  it('NE SORT qu’au-delà de 420 m : c’est l’écart qui empêche le battement', () => {
    // Déjà dedans : on y reste bien au-delà du seuil d'entrée.
    expect(approcheManoeuvre(300, 'right', true)).toBe(true);
    expect(approcheManoeuvre(419, 'right', true)).toBe(true);
    expect(approcheManoeuvre(421, 'right', true)).toBe(false);
  });

  it('un récepteur qui tremble autour du seuil ne fait plus battre la carte', () => {
    /* Sans hystérésis, cette suite alternerait vrai/faux à chaque fixe.
       Avec, elle entre une fois et n'en ressort pas. */
    let dedans = false;
    for (const d of [262, 258, 265, 255, 270, 240, 280, 250]) {
      dedans = approcheManoeuvre(d, 'right', dedans);
    }
    expect(dedans).toBe(true);
  });

  it('refuse une distance absurde plutôt que de zoomer au hasard', () => {
    expect(approcheManoeuvre(Number.NaN, 'right', false)).toBe(false);
    expect(approcheManoeuvre(-10, 'right', false)).toBe(false);
  });
});
