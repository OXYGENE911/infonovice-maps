// Le choix des réseaux, la fraîcheur et ce que les producteurs publient —
// les trois endroits où une erreur ne se verrait pas : la carte afficherait
// quand même des points, simplement les mauvais, des points morts, ou des
// libellés que personne ne comprend.
import { describe, expect, it } from 'vitest';
import {
  ageDuFlux, ageVehicule, AVANCE_MAX_S, dessert, FRAICHEUR_MAX_S, nombreDeReseaux,
  nomDeLigne, PAS_GRILLE, PLAFOND_RESEAUX, reseauxDansVue, trierParFraicheur,
  urlFlux, vitesseRenseignee, aLArret, memeVehicule,
} from '../src/lib/transports';
import { RESEAUX_TEMPS_REEL } from '../src/donnees/reseaux-temps-reel';
import type { FluxVehicules, Vehicule } from '../src/lib/gtfs-rt';

const vue = (ouest: number, sud: number, est: number, nord: number) =>
  ({ ouest, sud, est, nord });
/** Une petite vue autour d'un point, comme au zoom 12. */
const autour = (lon: number, lat: number, r = 0.03) =>
  vue(lon - r, lat - r, lon + r, lat + r);

const vehicule = (id: string, horodate: number | null): Vehicule => ({
  id, lon: 5.04, lat: 47.32, cap: null, vitesse: null,
  ligne: null, etiquette: null, horodate,
});
const flux = (horodate: number | null, vehicules: Vehicule[]): FluxVehicules =>
  ({ horodate, vehicules, tronque: false });

const par = (fragment: string) =>
  RESEAUX_TEMPS_REEL.find((r) => r.id.includes(fragment))!;

describe('la table des réseaux', () => {
  it('n’est pas vide et n’a pas de doublon d’identifiant ni de nom', () => {
    expect(RESEAUX_TEMPS_REEL.length).toBeGreaterThan(20);
    const ids = RESEAUX_TEMPS_REEL.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    // Deux entrées homonymes rendaient le résumé illisible : « SNgo!, …,
    // SNgo! ». Le générateur les distingue par leur autorité.
    const noms = RESEAUX_TEMPS_REEL.map((r) => r.nom);
    expect(new Set(noms).size).toBe(noms.length);
  });

  it('porte des emprises cohérentes : ouest < est, sud < nord', () => {
    for (const r of RESEAUX_TEMPS_REEL) {
      const [ouest, sud, est, nord] = r.bbox;
      expect(ouest, r.id).toBeLessThan(est);
      expect(sud, r.id).toBeLessThan(nord);
      expect(Math.abs(ouest), r.id).toBeLessThanOrEqual(180);
      expect(Math.abs(nord), r.id).toBeLessThanOrEqual(90);
    }
  });

  it('porte une couverture non vide et bien formée', () => {
    for (const r of RESEAUX_TEMPS_REEL) {
      expect(r.couverture.length, `${r.id} sans couverture`).toBeGreaterThan(0);
      const lignes = r.couverture.map((b) => b[0]);
      expect(new Set(lignes).size, `${r.id} : lignes en double`).toBe(lignes.length);
      for (const [, cxMin, cxMax] of r.couverture) {
        expect(cxMin, r.id).toBeLessThanOrEqual(cxMax);
      }
    }
  });

  it('résume la couverture par un rectangle à peu près juste', () => {
    /* Le rectangle ne décide plus de rien — il ne sert qu'à relire la table.
       On vérifie donc seulement qu'il ne raconte pas n'importe quoi, à une
       cellule près : l'arrondi au centième de degré et le flottant qui le
       divise ne tombent pas toujours du même côté d'une frontière. */
    const cel = (v: number) => Math.floor(v / PAS_GRILLE);
    for (const r of RESEAUX_TEMPS_REEL) {
      const lignes = r.couverture.map((b) => b[0]);
      expect(Math.min(...lignes), r.id).toBeGreaterThanOrEqual(cel(r.bbox[1]) - 1);
      expect(Math.max(...lignes), r.id).toBeLessThanOrEqual(cel(r.bbox[3]) + 1);
      expect(Math.min(...r.couverture.map((b) => b[1])), r.id)
        .toBeGreaterThanOrEqual(cel(r.bbox[0]) - 1);
      expect(Math.max(...r.couverture.map((b) => b[2])), r.id)
        .toBeLessThanOrEqual(cel(r.bbox[2]) + 1);
    }
  });

  it('compose une URL sur le proxy, seul point d’entrée avec CORS ouvert', () => {
    for (const r of RESEAUX_TEMPS_REEL) {
      expect(urlFlux(r)).toBe(`https://proxy.transport.data.gouv.fr/resource/${r.id}`);
    }
  });
});

describe('couverture réelle plutôt que rectangle', () => {
  it('ne dessert pas Rennes depuis les Pays de la Loire', () => {
    /* LE DÉFAUT QUE CE TEST EMPÊCHE : le rectangle d'Aléop englobe Rennes,
       à 97 km du car le plus proche — on interrogeait un service public pour
       rien, et le volet annonçait « 3 réseaux » là où un seul roulait. */
    const aleop = par('aleop-pdl');
    const rennes = autour(-1.6800, 48.1100);
    const dansLeRectangle = rennes.ouest >= aleop.bbox[0] && rennes.est <= aleop.bbox[2]
      && rennes.sud >= aleop.bbox[1] && rennes.nord <= aleop.bbox[3];
    expect(dansLeRectangle, 'la prémisse du test a disparu').toBe(true);
    expect(dessert(aleop, rennes)).toBe(false);
  });

  it('dessert bien Le Mans, Nantes et Angers depuis les Pays de la Loire', () => {
    const aleop = par('aleop-pdl');
    expect(dessert(aleop, autour(0.1996, 47.9960)), 'Le Mans').toBe(true);
    expect(dessert(aleop, autour(-1.5536, 47.2184)), 'Nantes').toBe(true);
    expect(dessert(aleop, autour(-0.5632, 47.4784)), 'Angers').toBe(true);
  });

  it('ne dessert pas Fougères depuis l’agrégat normand', () => {
    expect(dessert(par('atoumod'), autour(-1.2050, 48.3520))).toBe(false);
  });

  it('couvre Vernon depuis la navette qui s’y termine', () => {
    // Le générateur ne gardait que la PREMIÈRE zone déclarée : la navette
    // Giverny–Vernon perdait 88 % de son emprise, dont son terminus.
    expect(dessert(par('giverny-vernon'), autour(1.4830, 49.0890))).toBe(true);
  });
});

describe('choix des réseaux pour une vue', () => {
  it('ne retient rien là où aucun réseau ne publie', () => {
    expect(reseauxDansVue(vue(-30, 40, -29, 41))).toEqual([]);
  });

  it('trouve Divia sur Dijon', () => {
    const trouves = reseauxDansVue(autour(5.0415, 47.3220));
    expect(trouves.length).toBeGreaterThan(0);
    expect(trouves[0]!.id).toContain('divia-dijon');
  });

  it('met le réseau LOCAL devant, même quand la vue déborde de son emprise', () => {
    /* Le tri se faisait sur la surface commune avec la vue : à Dieppe, dès
       que la vue dépassait au nord, l'agrégat régional passait devant le
       réseau de la ville — et le rang décide la couleur ET qui est évincé. */
    const dieppe = vue(1.033, 49.897, 1.123, 49.947);
    const ids = reseauxDansVue(dieppe).map((r) => r.id);
    if (ids.some((i) => i.includes('atoumod'))) {
      expect(ids.indexOf(ids.find((i) => i.includes('deepmob'))!))
        .toBeLessThan(ids.indexOf(ids.find((i) => i.includes('atoumod'))!));
    } else {
      expect(ids.some((i) => i.includes('deepmob'))).toBe(true);
    }
  });

  it('ne dépasse jamais le plafond, même quand tout se recouvre', () => {
    const vueFrance = vue(-5, 41, 10, 51);
    expect(nombreDeReseaux(vueFrance)).toBeGreaterThan(PLAFOND_RESEAUX);
    expect(reseauxDansVue(vueFrance)).toHaveLength(PLAFOND_RESEAUX);
  });

  it('écarte un réseau qui ne fait qu’effleurer le bord', () => {
    const r = par('bibus-brest');
    const [ouest, sud] = r.bbox;
    expect(reseauxDansVue(vue(ouest - 1, sud - 0.5, ouest - 0.5, sud - 0.1))
      .some((x) => x.id === r.id)).toBe(false);
  });
});

describe('fraîcheur des positions', () => {
  const T = 1_787_400_000;

  it('garde une position récente, écarte une position périmée', () => {
    const tri = trierParFraicheur(flux(T, [
      vehicule('recent', T - 30),
      vehicule('limite', T - FRAICHEUR_MAX_S),
      vehicule('perime', T - FRAICHEUR_MAX_S - 1),
    ]), T);
    expect(tri.frais.map((v) => v.id)).toEqual(['recent', 'limite']);
    expect(tri.perimes).toBe(1);
  });

  it('fait hériter l’horodate de l’en-tête à qui n’en a pas', () => {
    expect(trierParFraicheur(flux(T - 5, [vehicule('a', null)]), T).frais).toHaveLength(1);
    const vieux = trierParFraicheur(flux(T - 3600, [vehicule('a', null)]), T);
    expect(vieux.frais).toHaveLength(0);
    expect(vieux.perimes).toBe(1);
  });

  it('garde ce qui n’est horodaté nulle part, et le COMPTE comme tel', () => {
    const tri = trierParFraicheur(flux(null, [vehicule('a', null)]), T);
    expect(tri.frais).toHaveLength(1);
    expect(tri.sansHorodate).toBe(1);
  });

  it('tolère une horloge en avance, mais pas une heure d’avance', () => {
    /* Relevé le 22/08 : l'en-tête d'Atoumod avançait de 63 s, celui du SETRAM
       de 85 s. Une tolérance d'une minute effaçait donc des réseaux entiers,
       et le volet annonçait « aucun véhicule » alors qu'ils roulaient. */
    expect(trierParFraicheur(flux(T, [vehicule('a', T + 85)]), T).frais).toHaveLength(1);
    expect(trierParFraicheur(flux(T, [vehicule('a', T + AVANCE_MAX_S)]), T).frais).toHaveLength(1);
    const loin = trierParFraicheur(flux(T, [vehicule('a', T + 3600)]), T);
    expect(loin.frais).toHaveLength(0);
    expect(loin.futurs).toBe(1);
  });

  it('dit l’âge du flux, SIGNÉ, et null quand il ne s’horodate pas', () => {
    expect(ageDuFlux(flux(T - 42, []), T)).toBe(42);
    expect(ageDuFlux(flux(null, []), T)).toBeNull();
    // Écraser l'avance à zéro empêchait le volet de signaler l'horloge folle.
    expect(ageDuFlux(flux(T + 90, []), T)).toBe(-90);
  });

  it('donne l’âge d’un véhicule, en retombant sur l’en-tête', () => {
    const f = flux(T - 100, [vehicule('a', T - 20), vehicule('b', null)]);
    expect(ageVehicule(f.vehicules[0]!, f, T)).toBe(20);
    expect(ageVehicule(f.vehicules[1]!, f, T)).toBe(100);
    expect(ageVehicule(vehicule('c', null), flux(null, []), T)).toBeNull();
  });
});

describe('ce que les producteurs publient vraiment', () => {
  it('tire le nom lisible d’un identifiant NeTEx', () => {
    // 102 véhicules sur 416 relevés le 22/08 portaient ces URN.
    expect(nomDeLigne('ATOUMOD003:Line:6xC7:LOC')).toBe('6xC7');
    expect(nomDeLigne('ATOUMOD004:Line:T1:LOC')).toBe('T1');
    expect(nomDeLigne('ATOUMOD006:Line:5:LOC')).toBe('5');
  });

  it('laisse intact un nom déjà lisible', () => {
    for (const l of ['206', '4-T2', '17', 'LIGNE-B', 'P+R', '3_(geo3)']) {
      expect(nomDeLigne(l)).toBe(l);
    }
  });

  it('préfère se taire qu’afficher un identifiant à rallonge', () => {
    expect(nomDeLigne(null)).toBeNull();
    expect(nomDeLigne('')).toBeNull();
    expect(nomDeLigne('  ')).toBeNull();
    expect(nomDeLigne('x'.repeat(60))).toBeNull();
  });

  it('ne dit « à l’arrêt » que si le réseau renseigne vraiment la vitesse', () => {
    /* L'unité publiée est indéchiffrable chez trois réseaux sur neuf (69 m/s
       à Dijon = 248 km/h, absurde pour un tramway) : on n'affiche donc plus
       de chiffre. Zéro, lui, veut dire la même chose dans toutes les unités —
       mais seulement si le producteur remplit le champ. */
    const v = (vitesse: number | null): Vehicule => ({
      id: 'v', lon: 5, lat: 47, cap: null, vitesse, ligne: null, etiquette: null, horodate: null,
    });
    expect(vitesseRenseignee([v(0), v(12)])).toBe(true);
    expect(vitesseRenseignee([v(0), v(0)]), 'tout à zéro : le champ n’est pas rempli').toBe(false);
    expect(vitesseRenseignee([v(null)])).toBe(false);
    expect(vitesseRenseignee([])).toBe(false);
    expect(aLArret(v(0), true)).toBe(true);
    expect(aLArret(v(0), false)).toBe(false);
    expect(aLArret(v(5), true)).toBe(false);
    expect(aLArret(v(null), true)).toBe(false);
  });
});

describe('doublons entre agrégats et membres', () => {
  it('marque l’agrégat dans la table — un seul des 44 en est un', () => {
    const agregats = RESEAUX_TEMPS_REEL.filter((r) => r.agregat);
    expect(agregats).toHaveLength(1);
    expect(agregats[0]!.id).toContain('atoumod');
  });

  it('reconnaît un doublon : même identifiant ET même endroit', () => {
    /* MESURÉ LE 22/08 : les agrégats republient leurs membres avec
       l'identifiant NeTEx EXACT — 52 doublons, écart médian nul, 658 m au
       pire. On les reconnaît à ces deux conditions réunies. */
    const a = { ...vehicule('VM:ATOUMOD004:ServiceJourney:597455:LOC', null), lon: 1.15, lat: 49.02 };
    const b = { ...a, lon: 1.1505, lat: 49.0203 };  // ~50 m
    expect(memeVehicule(a, b)).toBe(true);
    const loin = { ...a, lon: 1.16, lat: 49.03 };   // ~1,3 km, encore le même
    expect(memeVehicule(a, loin)).toBe(true);
  });

  it('n’efface PAS deux véhicules distincts qui portent le même numéro', () => {
    /* LE DÉFAUT QUE CE TEST EMPÊCHE : une clé par identifiant seul a effacé
       onze bus réels. Beaucoup de réseaux numérotent « 1, 2, 3 » — un « 3 »
       de Montluçon et un « 3 » de Riom sont deux bus, à 65 km l'un de
       l'autre. Les collisions sans lien commencent à 65 km ; les vrais
       doublons s'arrêtent à 658 m. */
    const montlucon = { ...vehicule('3', null), lon: 2.6050, lat: 46.3400 };
    const riom = { ...vehicule('3', null), lon: 3.1130, lat: 45.8940 };
    expect(memeVehicule(montlucon, riom)).toBe(false);
    // Et même côte à côte : un identifiant NU n'identifie rien hors de son
    // flux, donc on ne s'en sert jamais pour effacer quoi que ce soit.
    const voisin = { ...vehicule('3', null), lon: 2.6051, lat: 46.3401 };
    expect(memeVehicule(montlucon, voisin)).toBe(false);
  });

  it('ne fusionne pas deux relevés éloignés, même identifiant qualifié', () => {
    /* Défense en profondeur : un identifiant qualifié reste un identifiant
       choisi par un producteur, pas une garantie d'unicité mondiale. Deux
       relevés à trois cents kilomètres sont deux véhicules, quoi qu'il
       arrive. */
    const a = { ...vehicule('VM:X:ServiceJourney:1:LOC', null), lon: 1.15, lat: 49.02 };
    const b = { ...a, lon: 5.04, lat: 47.32 };
    expect(memeVehicule(a, b)).toBe(false);
  });

  it('ne confond jamais deux identifiants différents, si proches soient-ils', () => {
    const a = { ...vehicule('4', null), lon: 5.0415, lat: 47.3220 };
    const b = { ...vehicule('5', null), lon: 5.0415, lat: 47.3220 };
    expect(memeVehicule(a, b)).toBe(false);
  });

  it('ignore une entité sans identifiant plutôt que de tout confondre', () => {
    const a = { ...vehicule('', null), lon: 5.0415, lat: 47.3220 };
    const b = { ...vehicule('', null), lon: 5.0415, lat: 47.3220 };
    expect(memeVehicule(a, b)).toBe(false);
  });

  it('garde l’agrégat parmi les candidats — l’écarter coûtait 100 véhicules', () => {
    /* Une écriture précédente le retirait dès qu'un réseau propre effleurait
       la vue. Au Havre, 44 bus roulaient et le volet affichait « aucun
       véhicule », parce qu'un réseau de Honfleur — 2 véhicules, à 20 km —
       touchait la vue par arrondi de grille. */
    const havre = autour(0.1079, 49.4938, 0.055);
    const ids = reseauxDansVue(havre).map((r) => r.id);
    expect(ids.some((i) => i.includes('atoumod')), 'l’agrégat est écarté du Havre').toBe(true);
  });
});
