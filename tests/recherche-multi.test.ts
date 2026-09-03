import { describe, it, expect } from 'vitest';
import {
  ecart, motRepond, motsUtiles, motsPortes, motsCherches, fusionner, cleTrouvaille,
  type Trouvaille,
} from '../src/lib/recherche-multi';
import {
  separerMotsColles, decoupagesNomCommune, communeCorrespond, communeLaPlusProche,
  versCommunes, urlCommune,
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
