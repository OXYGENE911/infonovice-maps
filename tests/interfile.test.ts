import { describe, it, expect } from 'vitest';
import {
  voieEligible, versInterfiles, phraseInterfile,
  VITESSE_VOIE_MIN_KMH, ALLURE_MAX_KMH, ALLURE_FILE_ARRETEE_KMH,
} from '../src/lib/interfile';

/* LA REMONTÉE D'INTERFILE (MOTO-1, 02/09).
 *
 * Armelin : « ajouter un mode Moto avec l'interfile ».
 *
 * CES TESTS DÉFENDENT LE DÉCRET, pas mon idée de l'interfile. Le décret
 * n° 2025-33 du 9 janvier 2025 a généralisé la pratique à toute la France en
 * créant l'article R. 412-11-3 du code de la route : autoroutes et routes à
 * chaussées séparées d'au moins deux voies, limitées à 70 km/h ou plus,
 * trafic bloqué sur toutes les voies, 50 km/h au plus — 30 si une file est à
 * l'arrêt.
 *
 * ET ILS DÉFENDENT SURTOUT LE SILENCE. Se taire à tort coûte une
 * information ; parler à tort envoie quelqu'un entre deux files qui se
 * croisent. La moitié de ce fichier vérifie qu'on se tait. */

/** Un tracé droit vers l'est, ~100 m entre deux points, à la latitude de Paris. */
const trace = (n: number): [number, number][] =>
  Array.from({ length: n }, (_, i) => [2.35 + i * 0.00137, 48.85] as [number, number]);

/** Un chemin OSM qui longe ce tracé, du point `a` au point `b`. */
const chemin = (
  tags: Record<string, unknown>, a = 0, b = 20,
): Record<string, unknown> => ({
  type: 'way',
  tags,
  geometry: Array.from({ length: b - a + 1 },
    (_, i) => ({ lon: 2.35 + (a + i) * 0.00137, lat: 48.85 })),
});

describe('voieEligible', () => {
  it('accepte une autoroute limitée à 110', () => {
    expect(voieEligible({ highway: 'motorway', maxspeed: '110' })).toBe(true);
  });

  /* « À CHAUSSÉES SÉPARÉES […] DOTÉES D'AU MOINS DEUX VOIES CHACUNE ». Le
     terre-plein n'est pas dans OSM ; le sens unique en est le signe le plus
     fiable, puisqu'une chaussée séparée est toujours à sens unique. */
  it('accepte une deux-voies à sens unique limitée à 90', () => {
    expect(voieEligible({
      highway: 'trunk', maxspeed: '90', oneway: 'yes', lanes: '2',
    })).toBe(true);
  });

  /* SOUS 70 KM/H, LE DÉCRET NE S'APPLIQUE PAS — même sur une voie rapide. */
  it('refuse sous le seuil du décret', () => {
    expect(voieEligible({
      highway: 'trunk', maxspeed: '50', oneway: 'yes', lanes: '3',
    })).toBe(false);
    expect(VITESSE_VOIE_MIN_KMH).toBe(70);
  });

  /* UNE ROUTE À DOUBLE SENS N'A PAS DE TERRE-PLEIN : y annoncer l'interfile
     enverrait quelqu'un entre deux files qui se croisent. */
  it('refuse une route à double sens, même large et rapide', () => {
    expect(voieEligible({ highway: 'trunk', maxspeed: '110', lanes: '4' })).toBe(false);
  });

  /* SANS `lanes`, ON NE SAIT PAS COMBIEN DE VOIES — donc on se tait. */
  it('refuse un sens unique dont on ignore le nombre de voies', () => {
    expect(voieEligible({ highway: 'trunk', maxspeed: '110', oneway: 'yes' })).toBe(false);
  });

  it('refuse un sens unique à UNE seule voie', () => {
    expect(voieEligible({
      highway: 'trunk', maxspeed: '90', oneway: 'yes', lanes: '1',
    })).toBe(false);
  });

  /* ON N'Y REMONTE PAS LES FILES, ON S'Y INSÈRE. */
  it('refuse une bretelle d’autoroute', () => {
    expect(voieEligible({ highway: 'motorway_link', maxspeed: '90' })).toBe(false);
  });

  it('refuse une voie sans limitation lisible', () => {
    expect(voieEligible({ highway: 'motorway' })).toBe(false);
    expect(voieEligible({ highway: 'motorway', maxspeed: 'none' })).toBe(false);
  });
});

describe('versInterfiles', () => {
  it('relève une autoroute qui longe le trajet, avec son numéro', () => {
    const s = versInterfiles(
      { elements: [chemin({ highway: 'motorway', maxspeed: '110', ref: 'A86' })] },
      trace(21),
    );
    expect(s).toHaveLength(1);
    expect(s[0]?.nom).toBe('A86');
    expect(s[0]?.kmh).toBe(110);
    expect(s[0]?.finM - s[0]!.debutM).toBeGreaterThan(1500);
  });

  /* UN PONT QUI PASSE AU-DESSUS n'a qu'un ou deux nœuds près du tracé, sur un
     étalement quasi nul — la même heuristique que les limites de vitesse. */
  it('écarte une voie qui ne fait que croiser le trajet', () => {
    const pont = {
      type: 'way',
      tags: { highway: 'motorway', maxspeed: '110', ref: 'A4' },
      geometry: [{ lon: 2.3555, lat: 48.8480 }, { lon: 2.3555, lat: 48.8500 }],
    };
    expect(versInterfiles({ elements: [pont] }, trace(21))).toEqual([]);
  });

  /* UNE AUTOROUTE EST DÉCOUPÉE EN DIZAINES DE CHEMINS dans OSM. Annoncer
     l'interfile quarante fois sur trente kilomètres serait du bruit, pas une
     information — et le motard cesserait de lire. */
  it('recolle deux tronçons qui se suivent en UNE section', () => {
    const s = versInterfiles({ elements: [
      chemin({ highway: 'motorway', maxspeed: '130', ref: 'A6' }, 0, 10),
      chemin({ highway: 'motorway', maxspeed: '110' }, 10, 20),
    ] }, trace(21));
    expect(s).toHaveLength(1);
    /* LA VITESSE LA PLUS BASSE VAUT pour la section recollée. */
    expect(s[0]?.kmh).toBe(110);
    /* ET LE NOM DU PREMIER TRONÇON, celui qu'on lit sur le panneau en entrant. */
    expect(s[0]?.nom).toBe('A6');
  });

  it('rend une liste vide sur une réponse vide ou illisible', () => {
    expect(versInterfiles({ elements: [] }, trace(21))).toEqual([]);
    expect(versInterfiles(null, trace(21))).toEqual([]);
    expect(versInterfiles({ elements: 'oui' }, trace(21))).toEqual([]);
  });

  it('ignore les voies non éligibles mêlées aux autres', () => {
    const s = versInterfiles({ elements: [
      chemin({ highway: 'residential', maxspeed: '30' }),
      chemin({ highway: 'trunk', maxspeed: '110', lanes: '4' }),
      chemin({ highway: 'motorway', maxspeed: '130', ref: 'A10' }),
    ] }, trace(21));
    expect(s.map((x) => x.nom)).toEqual(['A10']);
  });
});

describe('phraseInterfile', () => {
  const section = { debutM: 0, finM: 4300, nom: 'A86', kmh: 110 };

  it('nomme la voie, la longueur et LES DEUX plafonds', () => {
    const p = phraseInterfile(section);
    expect(p).toContain('A86');
    expect(p).toContain('4.3 km');
    expect(p).toContain(String(ALLURE_MAX_KMH));
    expect(p).toContain(String(ALLURE_FILE_ARRETEE_KMH));
  });

  /* LA CONDITION SANS LAQUELLE RIEN N'EST PERMIS : que le trafic soit bloqué
     sur TOUTES les voies. L'omettre ferait lire « interfile permise » comme
     un droit permanent. */
  it('rappelle que le trafic doit être bloqué', () => {
    expect(phraseInterfile(section)).toMatch(/bloqué sur\s+toutes les voies/);
  });

  /* ELLE NE PROMET AUCUN GAIN DE TEMPS : ce que gagne un motard dépend de son
     allure entre les files, donc d'un choix qui engage sa sécurité. */
  it('ne promet ni minutes gagnées ni heure d’arrivée', () => {
    const p = phraseInterfile(section).toLowerCase();
    expect(p).not.toMatch(/gagn|économis|plus vite|minutes de moins/);
  });

  it('se passe de nom quand OSM n’en donne pas', () => {
    expect(phraseInterfile({ ...section, nom: null })).toContain('Cette section');
  });
});
