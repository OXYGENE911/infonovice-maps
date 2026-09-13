import { describe, it, expect } from 'vitest';
import { estIdentifiantBrut, nomLisible, nomsLisibles, voieLisible } from '../src/lib/nom-lisible';

/* LA RÈGLE DE TERRAIN-2 (retour du CEO, 11/09) : jamais d'identifiant brut à
 * l'écran. Elle se teste À SEC, ici, et non dans le rendu — le rendu change,
 * la règle reste. Les trois cas demandés par la tâche sont nommés en toutes
 * lettres : nom lisible, identifiant brut, chaîne vide. */

describe('nomLisible — LE CAS NOMINAL : un nom se montre', () => {
  const noms = [
    'Lyon',
    'Évry',
    'Châtillon-la-Borde',
    'Saint-Étienne-du-Rouvray',
    'Corbeil-Essonnes',
    'Rue du Faubourg-Saint-Antoine',
    'Paris 15e',
    'Aéroport Charles-de-Gaulle',
    // Trois lettres capitales : un sigle qu'on lit sur un panneau, pas un code.
    'CHU',
    'RN7',
    // Un deux-points PRÉCÉDÉ d'un espace n'est pas une clé technique.
    'Marseille : port',
    /* CES DEUX-LÀ VIENNENT DE LA REVUE CODEX, et la règle les effaçait :
       « Impasse des 10000 Martyrs Pinet » existe vraiment, à Eyzin-Pinet
       (38). Un nom en plusieurs mots est une PHRASE, pas un identifiant :
       les nombres qu'un nom de voie porte réellement — une date, un code
       postal, un millésime — n'en font pas une référence technique. */
    'Impasse des 10000 Martyrs Pinet',
    'Rue du 8 Mai 1945',
    'Place du 14 Juillet 1789',
    // « relation » est un mot français : sans chiffres collés, il reste un mot.
    'Rue de la Relation',
  ];
  for (const nom of noms) {
    it(`garde « ${nom} »`, () => {
      expect(estIdentifiantBrut(nom)).toBe(false);
      expect(nomLisible(nom)).toBe(nom);
    });
  }

  it('resserre les espaces sans changer le nom', () => {
    expect(nomLisible('  Lyon   Part-Dieu \n')).toBe('Lyon Part-Dieu');
  });
});

describe('nomLisible — L’IDENTIFIANT BRUT : on se tait', () => {
  const bruts: [string, string][] = [
    ['way/123456789', 'élément OSM avec son numéro'],
    ['node 4821', 'élément OSM, séparé par une espace'],
    ['relation:77', 'élément OSM, séparé par un deux-points'],
    ['w1234567', 'forme courte des exports OSM'],
    ['n48219', 'forme courte, nœud'],
    ['motorway_junction', 'valeur technique OSM — le souligné la trahit'],
    ['traffic_signals', 'valeur technique OSM'],
    ['osm:name', 'clé technique en tête'],
    ['ref=A4', 'clé technique avec égal'],
    ['addr:street', 'clé technique'],
    ['FR75056', 'code d’un seul tenant, capitales et chiffres'],
    ['RD1234', 'code de référence sans espace'],
    ['123456', 'identifiant numérique nu'],
    ['48.8566', 'un nombre n’est pas un nom'],
    ['---', 'aucune lettre'],
    ['yes', 'valeur technique OSM'],
    ['noname', 'dit qu’il n’y a pas de nom — ce n’est pas un nom'],
    ['FIXME', 'note de cartographe'],
    ['Sortie 4821901', 'sept chiffres dans une phrase : plus aucun nom de lieu'],
    ['OSM way 482190', 'élément OSM derrière un préfixe — relevé par la revue Codex'],
    ['OSM node 48219', 'même forme, autre type'],
    ['Bretelle TRONROUT0000000352788241', 'un cleabs BD TOPO glissé derrière un mot'],
  ];
  for (const [brut, pourquoi] of bruts) {
    it(`efface « ${brut} » — ${pourquoi}`, () => {
      expect(estIdentifiantBrut(brut)).toBe(true);
      expect(nomLisible(brut)).toBeNull();
    });
  }
});

describe('nomLisible — LA CHAÎNE VIDE : une absence, pas un identifiant', () => {
  it('rend null sur la chaîne vide', () => {
    expect(nomLisible('')).toBeNull();
    expect(estIdentifiantBrut('')).toBe(false);
  });

  it('rend null sur une chaîne d’espaces', () => {
    expect(nomLisible('   \n\t ')).toBeNull();
  });

  it('rend null sur null et undefined — les champs manquent, ça arrive', () => {
    expect(nomLisible(null)).toBeNull();
    expect(nomLisible(undefined)).toBeNull();
  });
});

describe('nomsLisibles', () => {
  it('garde la ville et jette l’identifiant qui la suit', () => {
    expect(nomsLisibles(['Lyon', 'way/1234', 'Évry'])).toEqual(['Lyon', 'Évry']);
  });

  it('rend une liste VIDE quand rien n’est lisible — la ligne ne paraîtra pas', () => {
    expect(nomsLisibles(['way/1234', '', null, 'motorway_junction'])).toEqual([]);
  });

  it('garde l’ordre du panneau', () => {
    expect(nomsLisibles(['Troyes', 'Corbeil-Essonnes', 'Sénart', 'Melun']))
      .toEqual(['Troyes', 'Corbeil-Essonnes', 'Sénart', 'Melun']);
  });
});

/* LA DÉSIGNATION DE VOIE — un registre différent de celui des noms de lieu.
 *
 * POURQUOI UNE SECONDE RÈGLE, ET PAS UN ASSOUPLISSEMENT DE LA PREMIÈRE :
 * `nomLisible` juge des NOMS DE LIEU, et dans ce registre « D606 » est bien
 * un code. Mais le champ `voie` du guidage porte une DÉSIGNATION DE ROUTE,
 * et là « D606 » est ce qui est peint sur la tôle. Les deux règles restent
 * donc séparées : aucune assertion de la première n'est affaiblie.
 */
describe('voieLisible — LE NUMÉRO DE ROUTE EST UN NOM', () => {
  const numeros = ['A6', 'A 6', 'A104', 'N7', 'RN7', 'D606', 'RD906', 'D14E', 'D1234'];
  for (const n of numeros) {
    it(`garde « ${n} » — c’est ce qu’on lit sur le panneau`, () => {
      expect(voieLisible(n)).toBe(n);
    });
  }

  const rues = ['Rue de Rivoli', 'Avenue des Champs-Élysées', 'Châtillon-la-Borde'];
  for (const r of rues) {
    it(`garde « ${r} » — un nom de rue reste un nom`, () => {
      expect(voieLisible(r)).toBe(r);
    });
  }
});

describe('voieLisible — L’IDENTIFIANT BRUT SE TAIT, MÊME DÉGUISÉ EN ROUTE', () => {
  const bruts: [string, string][] = [
    ['TRONROUT0000000352788241', 'cleabs de la BD TOPO — la forme vue par le CEO'],
    ['way/123456789', 'élément OSM'],
    ['motorway_junction', 'valeur technique OSM'],
    ['osm:name', 'clé technique'],
    ['FR75056', 'code INSEE d’un seul tenant'],
    /* CELUI-CI EST LE TROU QUE LA SECONDE RÈGLE FERME : `classeRoute` lit
       « N » puis un chiffre et conclut « nationale ». Cinq chiffres : aucune
       route nationale française n’en porte autant. */
    ['n48219', 'forme courte d’un nœud OSM, que classeRoute prenait pour une nationale'],
    ['w1234567', 'forme courte d’un chemin OSM'],
    ['N123456', 'six chiffres derrière une lettre de réseau — ce n’est plus une route'],
  ];
  for (const [brut, pourquoi] of bruts) {
    it(`efface « ${brut} » — ${pourquoi}`, () => {
      expect(voieLisible(brut)).toBeNull();
    });
  }

  it('rend null sur le vide, null et undefined', () => {
    expect(voieLisible('')).toBeNull();
    expect(voieLisible('   ')).toBeNull();
    expect(voieLisible(null)).toBeNull();
    expect(voieLisible(undefined)).toBeNull();
  });
});
