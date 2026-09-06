import { describe, it, expect } from 'vitest';
import {
  ecart, motRepond, motsUtiles, motsPortes, motsCherches, fusionner, cleTrouvaille,
  bruit, palierDistance, memeLieu, identiteAdresse,
  type Trouvaille,
} from '../src/lib/recherche-multi';
import {
  separerMotsColles, decoupagesNomCommune, communeCorrespond, communeLaPlusProche,
  versCommunes, urlCommune, variantesDecollees, enseigneCanonique,
} from '../src/lib/saisie-recherche';
import { versEtablissements, urlEntreprises, estUneEnseigne } from '../src/lib/recherche-entreprises';
import { versLieuxIgn, urlPoiIgn } from '../src/lib/recherche-poi-ign';
import { urlNomLieu } from '../src/lib/recherche-lieux';

/* LA RECHERCHE MULTI-SOURCES (RECHERCHE-8, 03/09).
 *
 * LE MANDAT. Armelin, la nuit du 03/09 : « ton objectif pour cette nuit est de
 * faire fonctionner la recherche […] je ne veux pas avoir à écrire les mots
 * exacts dans la barre de recherche mais avoir plus de souplesse même si les
 * mots sont incomplets ». Douze requêtes en jeu d'essai.
 *
 * CES TESTS-CI MESURENT LA PARTIE PURE : le découpage de la phrase, la
 * reconnaissance d'une commune, le classement. Le jeu des douze requêtes se
 * rejoue contre les vrais services avec `npx vite-node
 * scripts/essai-douze-requetes.ts` — il n'est PAS en intégration continue, car
 * une CI qui rougit parce qu'Overpass tousse ne dit rien sur le code. */

describe('separerMotsColles', () => {
  it('SÉPARE « FnacDarty », qui ne rendait rien nulle part', () => {
    /* MESURÉ LE 03/09 : « FnacDarty Siège Ivry sur Seine » rend ZÉRO sur les
       six sources. « Fnac Darty Ivry sur Seine » rend le siège, 9 rue des
       Bateaux-Lavoirs. Un espace manquant coûtait la requête entière. */
    expect(separerMotsColles('FnacDarty')).toBe('Fnac Darty');
    expect(separerMotsColles('FnacDarty Siège Ivry')).toBe('Fnac Darty Siège Ivry');
  });

  it('NE COUPE PAS LES SIGLES — INRAE et SNCF restent entiers', () => {
    expect(separerMotsColles('INRAE')).toBe('INRAE');
    expect(separerMotsColles('SNCF Paris')).toBe('SNCF Paris');
  });

  it('« Mc » N’EST PAS UNE COUPE — McDonald’s reste entier (RECHERCHE-11)', () => {
    /* Le commentaire le promettait ; la mesure a dit le contraire :
       « McDonald's » partait vers Overpass en « Mc Donald's », et la clause
       brand ne trouvait rien. Attrapé par le parcours E2E qui regarde ce qui
       PART. « MacDo », lui, se coupe — et le dictionnaire connaît « mac do ». */
    expect(separerMotsColles("McDonald's Chennevières")).toBe("McDonald's Chennevières");
    expect(separerMotsColles('MacDo')).toBe('Mac Do');
    expect(separerMotsColles('FnacDarty')).toBe('Fnac Darty');
  });
});

describe('decoupagesNomCommune', () => {
  it('MET LA COMMUNE EN FIN DE PHRASE, du plus court au plus long', () => {
    const d = decoupagesNomCommune('Castorama Ormesson');
    expect(d[0]).toEqual({ nom: 'Castorama', commune: 'Ormesson' });
  });

  it('SAIT QU’UNE COMMUNE PEUT FAIRE TROIS MOTS', () => {
    const d = decoupagesNomCommune('Fnac Darty Ivry sur Seine');
    expect(d.map((x) => x.commune)).toContain('Ivry sur Seine');
  });

  it('ESSAIE LA PLUS LONGUE D’ABORD — « Ivry sur Seine » avant « Seine »', () => {
    /* VU EN PRODUCTION (RECHERCHE-8c, 03/09) : « FnacDarty Siège Ivry sur
       Seine » faisait reconnaître « Seine » comme commune — elle ouvre
       « Seine-Port » — et l'on partait chercher « Fnac Darty Siège Ivry sur »
       autour de Seine-Port, à 25 km de nulle part. Un nom de commune plus long
       est un signal plus fort : « Ivry sur Seine » ne peut guère être un
       hasard, « Seine » si. */
    const d = decoupagesNomCommune('Fnac Darty Siège Ivry sur Seine');
    const rangIvry = d.findIndex((x) => x.commune === 'Ivry sur Seine');
    const rangSeine = d.findIndex((x) => x.commune === 'Seine');
    expect(rangIvry).toBeGreaterThanOrEqual(0);
    expect(rangSeine).toBeGreaterThanOrEqual(0);
    expect(rangIvry, '« Ivry sur Seine » doit passer avant « Seine »')
      .toBeLessThan(rangSeine);
    /* ET CE QU'IL RESTE À CHERCHER EST LE BON : « Fnac Darty Siège », pas
       « Fnac Darty Siège Ivry sur ». */
    expect(d[rangIvry]?.nom).toBe('Fnac Darty Siège');
  });

  it('NE PREND JAMAIS TOUTE LA PHRASE pour une commune', () => {
    /* Il doit rester un nom à chercher : un découpage qui mange tout ne
       laisserait rien. */
    for (const { nom } of decoupagesNomCommune('Lognes')) expect(nom.length).toBeGreaterThan(0);
    expect(decoupagesNomCommune('Lognes')).toHaveLength(0);
  });
});

describe('communeCorrespond', () => {
  it('ACCEPTE CE QUI OUVRE LE NOM, article compris', () => {
    expect(communeCorrespond('Ormesson', 'Ormesson-sur-Marne')).toBe(true);
    expect(communeCorrespond('Plessis-Trévise', 'Le Plessis-Trévise')).toBe(true);
    expect(communeCorrespond('Ivry sur Seine', 'Ivry-sur-Seine')).toBe(true);
    expect(communeCorrespond('Beaucouze', 'Beaucouzé')).toBe(true);
    expect(communeCorrespond('Lognes', 'Lognes')).toBe(true);
  });

  it('REFUSE LES TROIS FAUX POSITIFS QU’ARMELIN AURAIT VUS', () => {
    /* MESURÉ LE 03/09 en rejouant son jeu d'essai à travers le vrai code : la
       BAN reconnaissait « Tremblay-en-France » dans « Stade de France »,
       « Chennevières-lès-Louvres » dans « Musée du Louvre » et « Le
       Lardin-Saint-Lazare » dans « Gare Saint Lazare ». La recherche partait
       alors chercher « Musée du » autour d'un village du Val-d'Oise. */
    expect(communeCorrespond('France', 'Tremblay-en-France')).toBe(false);
    expect(communeCorrespond('Louvre', 'Chennevières-lès-Louvres')).toBe(false);
    expect(communeCorrespond('Lazare', 'Le Lardin-Saint-Lazare')).toBe(false);
  });

  it('N’ACCEPTE PAS UNE AMORCE : « Lo » n’ouvre pas « Lognes »', () => {
    expect(communeCorrespond('Lo', 'Lognes')).toBe(false);
  });
});

describe('communeLaPlusProche', () => {
  const ORMESSON_77 = { lon: 2.6519, lat: 48.2456, nom: 'Ormesson', codePostal: '77167' };
  const ORMESSON_94 = { lon: 2.5366, lat: 48.7848, nom: 'Ormesson-sur-Marne', codePostal: '94490' };

  it('DÉPARTAGE DEUX HOMONYMES par la vue', () => {
    /* « Ormesson » en désigne deux. La BAN rend celle de Seine-et-Marne en
       tête ; l'usager, lui, pensait à celle qu'il a sous les yeux. */
    const chezArmelin = { lon: 2.5762, lat: 48.8101 };
    expect(communeLaPlusProche([ORMESSON_77, ORMESSON_94], chezArmelin)?.codePostal)
      .toBe('94490');
  });

  it('SANS VUE, prend la première — mieux que renoncer', () => {
    expect(communeLaPlusProche([ORMESSON_77, ORMESSON_94], null)?.codePostal).toBe('77167');
    expect(communeLaPlusProche([], null)).toBeNull();
  });
});

describe('motRepond', () => {
  it('ACCEPTE UN MOT INCOMPLET — c’est la demande d’Armelin', () => {
    expect(motRepond('castor', 'castorama')).toBe(true);
    expect(motRepond('disney', 'disneyland')).toBe(true);
  });

  it('ACCEPTE LA FAUTE DE FRAPPE — « Effeil » vaut « Eiffel »', () => {
    /* C'est la requête qu'Armelin a écrite lui-même dans son jeu d'essai. */
    expect(motRepond('effeil', 'eiffel')).toBe(true);
  });

  it('REFUSE CE QUI NE SE RESSEMBLE PAS', () => {
    expect(motRepond('rue', 'lac')).toBe(false);
    expect(motRepond('par', 'paris')).toBe(false);
    expect(motRepond('carrefour', 'castorama')).toBe(false);
  });

  it('ecart est borné — on ne calcule pas ce qui ne changera rien', () => {
    expect(ecart('abc', 'abc')).toBe(0);
    expect(ecart('eiffel', 'effeil')).toBeLessThanOrEqual(2);
    expect(ecart('a', 'abcdefghij')).toBe(4);
  });
});

describe('motsUtiles', () => {
  it('LAISSE TOMBER LES MOTS QUI NE DÉSIGNENT RIEN', () => {
    expect(motsUtiles('Musée du Louvre')).toEqual(['musee', 'louvre']);
    expect(motsUtiles('Fnac Darty Siège Ivry sur Seine'))
      .toEqual(['fnac', 'darty', 'ivry', 'seine']);
  });
});

describe('le classement', () => {
  const t = (libelle: string, source: Trouvaille['source'], contexte = ''): Trouvaille =>
    ({ lon: 2, lat: 48, libelle, contexte, adresse: contexte, source });

  it('CE QU’ON A ÉCRIT PASSE DEVANT CE QU’ON N’A PAS ÉCRIT', () => {
    /* LE DÉFAUT QUE CE TRI FERME, mesuré le 03/09 : « INRAE BEAUCOUZE »
       rendait l'INRAE en SIXIÈME position, derrière « Beaucouzé »,
       « Beaucouzé » encore et « Eglise, Beaucouzé ». L'index des lieux
       répondait sur la COMMUNE — ce qui est juste, et ne sert à rien. */
    const liste = [
      t('Beaucouzé', 'ign'), t('Eglise', 'ign'),
      t('INRAE', 'entreprise', 'BEAUCOUZE 49070'),
    ];
    expect(fusionner(liste, ['inrae'])[0]?.libelle).toBe('INRAE');
  });

  it('L’ADRESSE COMPTE AUTANT QUE LE NOM', () => {
    /* « Carrefour Pincevent » : l'hypermarché s'appelle « CARREFOUR
       HYPERMARCHES » et se trouve au CENTRE COMMERCIAL PINCEVENT. Le mot
       qu'Armelin a écrit est dans l'ADRESSE, et c'est pourtant ce magasin-là
       qu'il désigne. */
    const liste = [
      t('Carrefour', 'ign', 'Saint-Égrève 38120'),
      t('CARREFOUR HYPERMARCHES', 'entreprise', 'CENTRE COMMERCIAL PINCEVENT 94430'),
    ];
    expect(fusionner(liste, ['carrefour', 'pincevent'])[0]?.libelle)
      .toBe('CARREFOUR HYPERMARCHES');
  });

  it('LA DISTANCE SE CLASSE EN KILOMÈTRES, PAS EN DEGRÉS (SEARCH-2, audit du 06/09)', () => {
    /* À 49° N, 0,1° vers l'est fait 7,3 km ; 0,08° vers le nord fait 8,9 km.
       Le tri en degrés bruts préférait le second. */
    const est: Trouvaille = { ...t('Boulangerie', 'ign'), lon: 2.1, lat: 49 };
    const nord: Trouvaille = { ...t('Boulangerie', 'ign'), lon: 2, lat: 49.08 };
    const classes = fusionner([nord, est], ['boulangerie'], 10, { lon: 2, lat: 49 });
    expect(classes[0]).toBe(est);
  });

  it('NE MONTRE PAS DEUX FOIS LE MÊME LIEU', () => {
    const liste = [
      t('Collège Albert Camus', 'ign'), t('Collège Albert Camus', 'entreprise'),
    ];
    expect(fusionner(liste, ['albert'])).toHaveLength(1);
    expect(cleTrouvaille(liste[0] as Trouvaille)).toBe(cleTrouvaille(liste[1] as Trouvaille));
  });

  it('COMPTE LES MOTS PORTÉS, faute de frappe comprise', () => {
    expect(motsPortes(t('Tour Eiffel', 'ign'), ['tour', 'effeil'])).toBe(2);
  });
});

/* RECHERCHE-10 (04/09) : le banc des douze requêtes passait 12/12 en v1.91,
   mais LIRE les rangs disait autre chose — trois sociétés devant trois
   monuments. Un banc qui compte les réussites sans lire les rangs certifie
   une liste que l'usager ne reconnaît pas. */
describe('le nom exact passe devant le nom qui le contient', () => {
  const t = (
    libelle: string, source: Trouvaille['source'], lon: number, lat: number, contexte = '',
  ): Trouvaille => ({ lon, lat, libelle, contexte, adresse: contexte, source });
  const VUE_FRANCE = { lon: 2.4, lat: 46.6 };

  it('MESURE LE BRUIT : ce que le libellé porte en plus de ce qu’on a écrit', () => {
    expect(bruit(t('Tour Eiffel', 'ign', 0, 0), ['tour', 'effeil'])).toBe(0);
    expect(bruit(t('SCI 43 CLER TOUR EFFEIL', 'entreprise', 0, 0), ['tour', 'effeil'])).toBe(3);
    /* Les vides ne comptent pas, ni la ponctuation : « Gare de Lyon » est
       exactement « gare lyon », et la parenthèse n'est pas un mot. */
    expect(bruit(t('Gare de Lyon', 'ign', 0, 0), ['gare', 'lyon'])).toBe(0);
    expect(bruit(t('Palais Royal (Musée du Louvre)', 'ign', 0, 0), ['musee', 'louvre'])).toBe(2);
    // Sans mot cherché, il n'y a rien à comparer : aucune peine.
    expect(bruit(t('SCI 43 CLER TOUR EFFEIL', 'entreprise', 0, 0), [])).toBe(0);
  });

  it('LES PALIERS DE DISTANCE : ~5 km, ~30 km, ~100 km, ~500 km', () => {
    expect(palierDistance(0)).toBe(0);
    expect(palierDistance(0.01 ** 2)).toBe(0);
    expect(palierDistance(0.2 ** 2)).toBe(1);
    expect(palierDistance(0.5 ** 2)).toBe(2);
    expect(palierDistance(2.3 ** 2)).toBe(3);
    expect(palierDistance(58 ** 2)).toBe(4);
  });

  it('« TOUR EFFEIL » DEPUIS LA VUE FRANCE : la Tour Eiffel, pas la SCI de la rue Cler', () => {
    /* Mesuré en v1.91 : la SCI, à trois cents mètres de la tour, était plus
       PRÈS du centre de la France — de quelques mètres — et passait devant. */
    const liste = [
      t('SCI 43 CLER TOUR EFFEIL', 'entreprise', 2.305, 48.856, '43 RUE CLER 75007 PARIS 7'),
      t('Tour Eiffel', 'ign', 2.2942, 48.8583, 'Paris 75007'),
    ];
    expect(fusionner(liste, ['tour', 'effeil'], 10, VUE_FRANCE).map((l) => l.libelle))
      .toEqual(['Tour Eiffel', 'SCI 43 CLER TOUR EFFEIL']);
  });

  it('« STADE DE FRANCE » DEPUIS PARIS 16e : le stade à 12 km, pas le restaurant à 1 km', () => {
    /* « SOC RESTAURANTS DU STADE FRANC », rue du Commandant-Guilbaud — le Parc
       des Princes. Un kilomètre et douze kilomètres sont deux paliers ; deux
       mots de bruit les compensent. */
    const liste = [
      t('SOC RESTAURANTS DU STADE FRANC', 'entreprise', 2.253, 48.841, '2 RUE DU COMMANDANT GUILBAUD 75016 PARIS'),
      t('Stade de France', 'ign', 2.36, 48.924, 'Saint-Denis 93200'),
    ];
    expect(fusionner(liste, ['stade', 'france'], 10, { lon: 2.25, lat: 48.85 })[0]?.libelle)
      .toBe('Stade de France');
  });

  it('MAIS LA PROXIMITÉ GARDE SON MOT : « gare lyon » depuis Lyon rend la Part-Dieu', () => {
    /* Le nom exact est à Paris ; le bruit ne remonte pas un lieu à 400 km
       devant celui d'à côté. Et Saint-Pierre-et-Miquelon reste à sa place. */
    const liste = [
      t('Gare de Lyon', 'ign', 2.373, 48.844, 'Paris 75012'),
      t('Gare de Lyon-Part-Dieu', 'ign', 4.859, 45.760, 'Lyon 69003'),
    ];
    expect(fusionner(liste, ['gare', 'lyon'], 10, { lon: 4.85, lat: 45.75 })[0]?.libelle)
      .toBe('Gare de Lyon-Part-Dieu');
    expect(fusionner(liste, ['gare', 'lyon'], 10, { lon: 2.35, lat: 48.85 })[0]?.libelle)
      .toBe('Gare de Lyon');
    const aeroports = [
      t('Aéroport', 'ign', -56.179, 46.766),
      t('Aéroport d’Orly', 'ign', 2.379, 48.726),
    ];
    expect(fusionner(aeroports, ['aeroport'], 10, { lon: 2.5762, lat: 48.8101 })[0]?.libelle)
      .toBe('Aéroport d’Orly');
  });

  it('LA COMMUNE ÉCRITE EST LE REPÈRE — « Castorama Ormesson » rend celui de Chennevières, pas celui de Vitry', () => {
    /* Mesuré en v1.91 (coordonnées réelles) : les Castorama de Vitry et
       d'Antony passaient devant celui de Chennevières, voisin d'Ormesson-
       sur-Marne, parce qu'ils sont plus près du CENTRE DE LA FRANCE. Les deux
       Ormesson (77 et 94) servent de repères à la fois : le plus près de l'un
       OU de l'autre gagne. */
    const liste = [
      t('Castorama', 'osm', 2.4395, 48.7792), t('Castorama', 'osm', 2.2250, 48.7751),
      t('Castorama', 'osm', 2.5582, 48.7961),
    ];
    /* Depuis le centre de la France, Chennevières et Vitry sont à 240 km à
       deux cents mètres près : en kilomètres vrais (SEARCH-2, 06/09), Vitry
       est le plus près d'un cheveu — le tri en degrés bruts préférait
       Chennevières. L'un ou l'autre : ce qui compte, c'est qu'un lointain ne
       passe pas devant. */
    expect([2.4395, 2.225]).toContain(fusionner(liste, ['castorama'], 10, VUE_FRANCE)[0]?.lon);
    const ormessons = [{ lon: 2.6519, lat: 48.2456 }, { lon: 2.5366, lat: 48.7848 }];
    expect(fusionner(liste, ['castorama'], 10, ormessons)[0]?.lon).toBe(2.5582);
  });

  it('LES MOTS DE LA COMMUNE NE SONT PAS DU BRUIT — « mairie plessis trevise » rend celle du Plessis', () => {
    /* Mesuré le 04/09 sur le second banc : les mots CHERCHÉS excluent la
       commune (elle situe), mais « Mairie - Le Plessis-Trévise » porte ces
       mots-là parce que l'usager les a ÉCRITS. Comptés comme du bruit, la
       « Mairie » de la commune d'à côté — un mot, bruit zéro — passait devant. */
    const liste = [
      t('Mairie', 'osm', 2.548, 48.776), t('Mairie', 'osm', 2.510, 48.813),
      t('Mairie - Le Plessis-Trévise', 'administration', 2.5721, 48.8110, '94420 Le Plessis-Trévise'),
    ];
    const plessis = { lon: 2.5721, lat: 48.8110 };
    expect(fusionner(liste, ['mairie'], 10, plessis, ['mairie', 'plessis', 'trevise'])[0]?.libelle)
      .toBe('Mairie - Le Plessis-Trévise');
    /* Et « Aéroport Orly » : « Aéroport de Paris-Orly » ne porte qu'un mot
       de trop (Paris), « AEROPORTS DE PARIS (ADP) » en porte deux. */
    const orly = [
      t('AEROPORTS DE PARIS (ADP)', 'entreprise', 2.376, 48.742, '103 AEROGARE SUD 94310 ORLY'),
      t('Aéroport de Paris-Orly', 'ign', 2.366, 48.729),
    ];
    expect(fusionner(orly, ['aeroport'], 10, { lon: 2.39, lat: 48.74 }, ['aeroport', 'orly'])[0]?.libelle)
      .toBe('Aéroport de Paris-Orly');
  });

  it('CE QUI PORTE TOUTE LA PHRASE passe devant ce qui n’en porte qu’une partie — « Mont Saint Michel »', () => {
    /* Mesuré le 04/09 : « Saint-Michel » est reconnue comme commune, il ne
       reste que « Mont » à chercher, et un lieu-dit « Mont » des Pyrénées
       valait autant que ce qui s'appelle Mont-Saint-Michel. Un point de plus
       à qui porte les trois mots. Et la commune SEULE (« Ormesson ») ne
       porte pas la phrase entière : elle reste derrière le Castorama. */
    const ici = { lon: 2.5762, lat: 48.8101 };
    const liste = [
      t('Mont', 'osm', 0.953, 43.315),
      t('Mont Saint-Michel', 'ign', -3.393, 48.397, 'Saint-Servais 22160'),
    ];
    expect(fusionner(liste, ['mont'], 10, ici, ['mont', 'saint', 'michel'])[0]?.libelle)
      .toBe('Mont Saint-Michel');
    const ormesson = [
      t('Ormesson-sur-Marne', 'ign', 2.5366, 48.7848, 'Ormesson-sur-Marne 94490'),
      t('Castorama', 'osm', 2.5582, 48.7961),
    ];
    expect(fusionner(ormesson, ['castorama'], 10, [{ lon: 2.5366, lat: 48.7848 }, ici],
      ['castorama', 'ormesson'])[0]?.libelle).toBe('Castorama');
    /* DANS LE NOM SEUL : l'adresse d'une fiche SIRENE porte toujours la
       commune. Comptée, elle donnait le point à « LAURENT PICARD, avenue
       Ardouin » devant le magasin « Picard », qui n'a pas d'adresse. */
    const picard = [
      t('LAURENT PICARD', 'entreprise', 2.571, 48.812, '7 T AVENUE ARDOUIN 94420 LE PLESSIS-TREVISE'),
      t('Picard', 'osm', 2.573, 48.810),
    ];
    expect(fusionner(picard, ['picard'], 10, [{ lon: 2.5721, lat: 48.811 }, ici],
      ['picard', 'plessis', 'trevise'])[0]?.libelle).toBe('Picard');
  });

  it('DEUX OBJETS OSM DU MÊME LIEU font UNE ligne — deux magasins distincts en font deux', () => {
    /* Le nœud du magasin, son bâtiment, son entrée : trois objets nommés
       pareil à cent mètres, que l'arrondi au millième de degré séparait une
       fois sur deux. */
    const trois = [
      t('Castorama', 'osm', 2.5500, 48.8000), t('Castorama', 'osm', 2.5512, 48.8008),
      t('Castorama', 'osm', 2.5490, 48.7995),
    ];
    expect(fusionner(trois, ['castorama'], 10, VUE_FRANCE)).toHaveLength(1);
    expect(memeLieu(trois[0] as Trouvaille, trois[1] as Trouvaille)).toBe(true);
    const deux = [t('Castorama', 'osm', 2.55, 48.80), t('Castorama', 'osm', 2.58, 48.80)];
    expect(fusionner(deux, ['castorama'], 10, VUE_FRANCE)).toHaveLength(2);
    expect(memeLieu(deux[0] as Trouvaille, deux[1] as Trouvaille)).toBe(false);
  });

  it('DEUX COMMERCES HOMONYMES À DEUX CENTS MÈTRES, chacun à son numéro, font DEUX lignes (SEARCH-1)', () => {
    /* Le scénario de l'audit Codex (06/09) : deux « Carrefour City » à
       2,350/48,850 et 2,353/48,852, deux adresses — l'un disparaissait. */
    const deux = [
      t('Carrefour City', 'entreprise', 2.350, 48.850, '10 RUE DE RIVOLI 75001 PARIS'),
      t('Carrefour City', 'entreprise', 2.353, 48.852, '45 RUE DE RIVOLI 75001 PARIS'),
    ];
    expect(memeLieu(deux[0] as Trouvaille, deux[1] as Trouvaille)).toBe(false);
    expect(fusionner(deux, ['carrefour', 'city'], 10, VUE_FRANCE)).toHaveLength(2);
    // Même numéro, autre voie : deux établissements aussi.
    const autreVoie = t('Carrefour City', 'entreprise', 2.351, 48.851, '10 RUE DE LA PAIX 75002 PARIS');
    expect(memeLieu(deux[0] as Trouvaille, autreVoie)).toBe(false);
  });

  it('LE MÊME MAGASIN VU PAR L’ANNUAIRE ET PAR OSM, adresses écrites autrement, fait UNE ligne', () => {
    const sirene = t('Carrefour City', 'entreprise', 2.3500, 48.8500, '12 RUE DE RIVOLI 75001 PARIS');
    const osm = t('Carrefour City', 'osm', 2.3503, 48.8502, '12 Rue de Rivoli, 75001 Paris');
    expect(memeLieu(sirene, osm)).toBe(true);
    expect(fusionner([sirene, osm], ['carrefour', 'city'], 10, VUE_FRANCE)).toHaveLength(1);
    // Sans numéro d'un côté, les trois cents mètres tranchent encore.
    const sansNumero = t('Carrefour City', 'osm', 2.3503, 48.8502, 'Paris');
    expect(memeLieu(sirene, sansNumero)).toBe(true);
  });
});

describe('identiteAdresse (SEARCH-1)', () => {
  it('lit le numéro et le nom de la voie, quelle que soit l’écriture', () => {
    expect(identiteAdresse('12 RUE DE RIVOLI 75001 PARIS')).toEqual({ numero: '12', voie: 'rivoli' });
    expect(identiteAdresse('12 Rue de Rivoli, 75001 Paris')).toEqual({ numero: '12', voie: 'rivoli' });
    expect(identiteAdresse('3 bis Avenue du Général-Leclerc, 92100 Boulogne')).toEqual({ numero: '3bis', voie: 'leclerc' });
    expect(identiteAdresse('7B BD SAINT MICHEL 75005 PARIS')).toEqual({ numero: '7b', voie: 'michel' });
  });
  it('rend null sans numéro : commune seule, voie seule, vide', () => {
    expect(identiteAdresse('Paris')).toBeNull();
    expect(identiteAdresse('RUE DU BOIS 77185 LOGNES')).toBeNull();
    expect(identiteAdresse('')).toBeNull();
    expect(identiteAdresse('75001 PARIS')).toBeNull();
  });
});

describe('motsCherches', () => {
  it('RETIRE LA COMMUNE des mots qui pèsent au classement', () => {
    const commune = { lon: 0, lat: 0, nom: 'Beaucouzé', codePostal: '49070' };
    expect(motsCherches('INRAE Beaucouzé', commune)).toEqual(['inrae']);
  });

  it('MAIS PAS SI ELLE MANGE TOUTE LA PHRASE', () => {
    const commune = { lon: 0, lat: 0, nom: 'Lognes', codePostal: '77185' };
    expect(motsCherches('Lognes', commune)).toEqual(['lognes']);
  });
});

describe('les URL et les lectures défensives', () => {
  it('NE PARTENT PAS SUR DEUX LETTRES', () => {
    expect(urlPoiIgn('ab')).toBeNull();
    expect(urlEntreprises('ab')).toBeNull();
    expect(urlCommune('ab')).toBeNull();
  });

  it('LA BAN N’EST INTERROGÉE QUE SUR LES COMMUNES', () => {
    /* `type=municipality` est ce qui change tout : sans lui, « Ormesson » rend
       « Rue d'Ormesson, Reims » en tête, et la recherche partirait se centrer à
       deux cents kilomètres de ce qu'on visait. */
    expect(urlCommune('Ormesson')).toContain('type=municipality');
  });

  it('UN CODE POSTAL VISE UNE COMMUNE, un faux est ignoré', () => {
    expect(urlEntreprises('castorama', '94430')).toContain('code_postal=94430');
    expect(urlEntreprises('castorama', 'zz')).not.toContain('code_postal');
  });

  it('UNE RÉPONSE ABÎMÉE NE CASSE RIEN', () => {
    for (const brut of [undefined, null, {}, { features: 'non' }, { results: 3 }]) {
      expect(versLieuxIgn(brut)).toEqual([]);
      expect(versCommunes(brut)).toEqual([]);
      expect(versEtablissements(brut)).toEqual([]);
    }
  });

  it('UN LIEU SANS POSITION EST ÉCARTÉ — il décevrait au clic', () => {
    expect(versLieuxIgn({ features: [{ properties: { toponym: 'X' } }] })).toEqual([]);
    expect(versEtablissements({
      results: [{ nom_complet: 'X', matching_etablissements: [{ adresse: 'Y' }] }],
    })).toEqual([]);
  });

  it('LES FORMES JURIDIQUES SONT REPOUSSÉES, pas supprimées', () => {
    /* Personne ne cherche « SCI 43 CLER TOUR EFFEIL » — que l'annuaire rend
       pourtant sur « Tour Effeil ». */
    expect(estUneEnseigne({ lon: 0, lat: 0, nom: 'SCI 43 CLER TOUR EFFEIL', adresse: '', commune: '', codePostal: '' })).toBe(false);
    expect(estUneEnseigne({ lon: 0, lat: 0, nom: 'CASTORAMA', adresse: '', commune: '', codePostal: '' })).toBe(true);
  });

  it('L’ANNUAIRE REND L’ÉTABLISSEMENT, pas le siège', () => {
    /* « Leroy Merlin Lognes » doit rendre le magasin de Lognes, pas le siège
       social à Lezennes — ce que rendait la recherche naïve (mesuré le 03/09). */
    const lus = versEtablissements({
      results: [{
        nom_complet: 'LEROY MERLIN FRANCE',
        matching_etablissements: [
          { longitude: '2.6429', latitude: '48.8345', adresse: 'RUE DU BOIS 77185 LOGNES', libelle_commune: 'LOGNES', code_postal: '77185' },
        ],
      }],
    });
    expect(lus).toHaveLength(1);
    expect(lus[0]?.commune).toBe('LOGNES');
    expect(lus[0]?.adresse).toContain('LOGNES');
  });

  it('LE MÊME MAGASIN N’EST PAS COMPTÉ QUATRE FOIS', () => {
    /* L'annuaire aligne parfois siège, participations et filiales au même
       endroit et sous le même nom. */
    const doubles = Array.from({ length: 4 }, () => ({
      longitude: '2.39', latitude: '48.82', enseigne: 'FNAC DARTY', adresse: 'A', libelle_commune: 'IVRY', code_postal: '94200',
    }));
    expect(versEtablissements({ results: [{ nom_complet: 'X', matching_etablissements: doubles } ] }))
      .toHaveLength(1);
  });
});

/* LES COMMUNES HOMONYMES (RECHERCHE-8b, 03/09).
 *
 * LE DÉFAUT, VU EN PRODUCTION ET PAS EN TEST. Juste après la mise en ligne de
 * la v1.57.0, j'ai tapé « Castorama Ormesson » sur maps.infonovice.fr : aucun
 * Castorama. Mon banc d'essai passait pourtant 12/12 — parce que je lui
 * donnais les coordonnées d'Armelin. L'usager qui ouvre l'application, lui,
 * regarde la France entière.
 *
 * « Ormesson » DÉSIGNE DEUX COMMUNES : Ormesson (77167) et Ormesson-sur-Marne
 * (94490). On départageait « au plus proche de la vue » ; depuis le centre de
 * la France, c'est la mauvaise qui gagne, et le magasin est près de l'autre.
 *
 * ON NE PARIE PLUS : Overpass accepte une union de clauses `around:`, donc on
 * interroge TOUTES les communes candidates en UN SEUL appel — la règle « ne
 * jamais marteler les API publiques » est respectée, et l'ambiguïté cesse
 * d'être un coup de dé. */

describe('urlNomLieu avec plusieurs centres', () => {
  const A = { lon: 2.6519, lat: 48.2456 };
  const B = { lon: 2.5366, lat: 48.7848 };

  it('INTERROGE TOUTES LES COMMUNES en une seule requête', () => {
    const url = urlNomLieu('Castorama', [A, B]);
    expect(url).not.toBeNull();
    const q = decodeURIComponent(url as string);
    expect(q).toContain('48.24560,2.65190');
    expect(q).toContain('48.78480,2.53660');
    // UNE SEULE URL, donc un seul appel : c'est tout l'intérêt de l'union.
    expect(q.split('[out:json]')).toHaveLength(2);
  });

  it('GARDE LE COMPORTEMENT D’AVANT pour un centre unique', () => {
    /* Les appelants qui ne connaissent qu'un point ne doivent rien changer. */
    expect(decodeURIComponent(urlNomLieu('Castorama', A) as string))
      .toBe(decodeURIComponent(urlNomLieu('Castorama', [A]) as string));
  });

  it('SANS AUCUN CENTRE, on ne fabrique pas de requête vide', () => {
    expect(urlNomLieu('Castorama', [])).toBeNull();
  });
});
/* RECHERCHE-9 (04/09) : trois retours d'Armelin en 1.68, trois causes. */

describe('l’île Nulle et le classement par distance', () => {
  const t = (libelle: string, lon: number, lat: number): Trouvaille =>
    ({ lon, lat, libelle, contexte: '', adresse: '', source: 'ign' });

  it('UN latitude:null NE DEVIENT PAS (0,0) — l’aérodrome de Persan à 5442 km', () => {
    /* Vu sur la capture d'Armelin : SIRENE porte latitude:null pour l'ADP de
       Persan, Number(null) vaut 0, et (0,0) est l'île Nulle, golfe de Guinée. */
    expect(versEtablissements({ results: [{
      nom_complet: 'ADP', matching_etablissements: [
        { longitude: null, latitude: null, enseigne: 'ADP', adresse: 'PERSAN' },
        { longitude: '0', latitude: '0', enseigne: 'ADP0', adresse: 'X' },
        { longitude: '2.37', latitude: '48.74', enseigne: 'ORLY', adresse: 'ORLY' },
      ],
    }] }).map((e) => e.nom)).toEqual(['ORLY']);
  });

  it('À MOTS ÉGAUX, LE PLUS PROCHE D’ABORD — Orly avant Saint-Pierre-et-Miquelon', () => {
    /* « Quand on tape "aéroport", les premiers lieux affichés sont à plus de
       5000 km de ma position. » L'« Aéroport » lointain est RÉEL — c'est
       Saint-Pierre-et-Miquelon, la France est grande — mais à mots égaux, il
       n'a rien à faire devant Orly. */
    const repere = { lon: 2.5762, lat: 48.8101 };
    const liste = [
      t('Aéroport', -56.179, 46.766),
      t('Aéroport d’Orly', 2.379, 48.726),
    ];
    expect(fusionner(liste, ['aeroport'], 10, repere)[0]?.libelle).toBe('Aéroport d’Orly');
    // Sans repère, l'ordre d'arrivée tient : on n'invente pas une distance.
    expect(fusionner(liste, ['aeroport'], 10, null)[0]?.libelle).toBe('Aéroport');
  });
});

/* RECHERCHE-11 (04/09) : « McDo Chennevières » rendait ZÉRO. Overpass ne
   répond qu'à l'égalité (brand « McDonald's »), SIRENE ne connaît que
   « MCDONALD'S FRANCE ». Le surnom est ce qu'on tape ; la graphie canonique
   est ce que les sources savent. */
describe('enseigneCanonique — le surnom devient l’enseigne', () => {
  it('traduit les surnoms courants, accents et casse compris', () => {
    expect(enseigneCanonique('McDo Chennevières')).toBe("McDonald's Chennevières");
    expect(enseigneCanonique('mac do Créteil')).toBe("McDonald's Créteil");
    expect(enseigneCanonique('MACDO')).toBe("McDonald's");
    expect(enseigneCanonique('Casto Ormesson')).toBe('Castorama Ormesson');
    expect(enseigneCanonique('Décat Villiers')).toBe('Décathlon Villiers');
    expect(enseigneCanonique('carrouf')).toBe('Carrefour');
    /* Mesuré : « Leclerc Créteil » rend des personnes nommées Leclerc ;
       l'hypermarché s'appelle « E.Leclerc » dans OpenStreetMap. */
    expect(enseigneCanonique('Leclerc Créteil')).toBe('E.Leclerc Créteil');
  });
  it('L’APOSTROPHE EST DROITE — c’est celle qu’Overpass compare', () => {
    expect(enseigneCanonique('mcdo')).toBe("McDonald's");
    expect(enseigneCanonique('mcdo')).not.toContain('’');
  });
  it('ne touche pas une phrase déjà canonique', () => {
    expect(enseigneCanonique("McDonald's Chennevières")).toBe("McDonald's Chennevières");
    expect(enseigneCanonique('Leroy Merlin Lognes')).toBe('Leroy Merlin Lognes');
    expect(enseigneCanonique('E.Leclerc Créteil')).toBe('E.Leclerc Créteil');
    expect(enseigneCanonique('Castorama Ormesson')).toBe('Castorama Ormesson');
  });
  it('EN TÊTE DE PHRASE SEULEMENT : « avenue du Général Leclerc » est une adresse', () => {
    expect(enseigneCanonique('avenue du Général Leclerc')).toBe('avenue du Général Leclerc');
    expect(enseigneCanonique('rue Leroy Créteil')).toBe('rue Leroy Créteil');
    expect(enseigneCanonique('')).toBe('');
  });
});

describe('variantesDecollees — « FNACDARTY » se décolle au dictionnaire', () => {
  it('COUPE APRÈS L’ENSEIGNE CONNUE, même en tout-majuscules', () => {
    /* « "FNACDARTY" renvoie aucun résultat alors que "FNAC DARTY" répond des
       adresses. » Un tout-majuscules collé n'a aucun point de coupe lexical —
       la casse chameau de separerMotsColles n'y peut rien. */
    expect(variantesDecollees('FNACDARTY')).toEqual(['FNAC DARTY']);
    expect(variantesDecollees('CARREFOURMARKET')).toEqual(['CARREFOUR MARKET']);
  });

  it('NE COUPE PAS CE QU’ELLE NE CONNAÎT PAS — pas de chimères', () => {
    expect(variantesDecollees('INRAE')).toEqual([]);
    expect(variantesDecollees('Castorama')).toEqual([]);
    expect(variantesDecollees('fna')).toEqual([]);
  });
});
