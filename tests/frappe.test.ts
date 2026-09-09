import { describe, it, expect } from 'vitest';
import {
  aplatir, motsPorteurs, distanceFrappe, fautesTolerees, motRetrouve,
  reponseACote, toutesACote, MOT_A_COTE,
} from '../src/lib/frappe';

/* LA FAUTE DE FRAPPE (FRAPPE-1, 09/09/2026).
 *
 * Le retour du 04/09 disait « à un caractère près, l'adresse est
 * introuvable ». LA MESURE DIT AUTRE CHOSE — 22 adresses réelles vérifiées
 * auprès du service, 72 variantes d'une faute, dans le mode exact de
 * `chercherAdresses` : 94 % rendent la bonne adresse AU PREMIER RANG.
 *
 * Les chiffres cités dans ces tests sont donc mesurés, et les cas qui suivent
 * sont les VRAIS : ceux que le service a réellement rendus ce jour-là.
 */

describe('la distance compte les fautes comme un doigt les fait', () => {
  it('L’INVERSION DE DEUX LETTRES VAUT UNE FAUTE, et c’est la moitié du sujet : '
    + 'comptée double, elle ferait accuser des réponses justes — dix accusations '
    + 'à tort sur dix, à la première version, étaient exactement cela', () => {
    for (const [faute, juste] of [
      ['carems', 'carmes'], ['aveune', 'avenue'], ['medcein', 'medecin'],
      ['pasetur', 'pasteur'], ['gradne', 'grande'], ['belegs', 'belges'],
      ['kleebr', 'kleber'], ['chaetau', 'chateau'], ['ajcques', 'jacques'],
      ['ohnore', 'honore'],
    ] as const) {
      expect(distanceFrappe(faute, juste, 2), `${faute} / ${juste}`).toBe(1);
    }
  });

  it('les trois autres fautes de frappe valent une, elles aussi', () => {
    expect(distanceFrappe('rivli', 'rivoli', 1)).toBe(1); // suppression
    expect(distanceFrappe('riveli', 'rivoli', 1)).toBe(1); // substitution
    expect(distanceFrappe('rivooli', 'rivoli', 1)).toBe(1); // insertion
  });

  it('deux mots sans rapport restent loin', () => {
    expect(distanceFrappe('kleer', 'heckler', 2)).toBeGreaterThan(2);
    expect(distanceFrappe('chaeau', 'chateaulin', 2)).toBeGreaterThan(2);
  });

  it('LE PLAFOND ARRÊTE LE CALCUL, il ne le corrige pas : la valeur rendue au-delà '
    + 'n’est qu’un « plus grand que », et ce test le fixe pour qu’on ne la lise '
    + 'jamais comme une vraie distance', () => {
    expect(distanceFrappe('abc', 'zzzzzzzzzz', 1)).toBe(2);
    expect(distanceFrappe('abc', 'zzz', 1)).toBe(2);
  });

  it('un mot identique est à zéro, et deux vides aussi', () => {
    expect(distanceFrappe('kleber', 'kleber', 2)).toBe(0);
    expect(distanceFrappe('', '', 1)).toBe(0);
  });

  it('on tolère une faute sur un mot court, deux sur un long — « Vaux » et '
    + '« Vaud » sont deux communes', () => {
    expect(fautesTolerees(4)).toBe(1);
    expect(fautesTolerees(7)).toBe(1);
    expect(fautesTolerees(8)).toBe(2);
  });
});

describe('on ne juge que sur ce qui distingue', () => {
  it('les accents et la ponctuation ne comptent pas — on tape sans, souvent', () => {
    expect(aplatir('Rue du Château-d’Eau')).toBe('rue du chateau d eau');
    expect(aplatir('  Ségur  ')).toBe('segur');
  });

  it('LES MOTS GÉNÉRIQUES SONT ÉCARTÉS : « rue » se retrouve partout et ne prouve '
    + 'rien — les compter ferait passer « Rue Heckler » pour une réponse à '
    + '« Rue Kléer »', () => {
    expect(motsPorteurs('1 Rue du Château 44000 Nantes')).toEqual(['chateau', 'nantes']);
    /* La commune EST un mot porteur : se tromper de ville est une faute comme
       une autre, et c'est même celle qui envoie le plus loin. */
    expect(motsPorteurs('12 Place Bellecour 69002 Lyon')).toEqual(['bellecour', 'lyon']);
  });

  it('LES CHIFFRES AUSSI, et pour une raison différente : le 12 et le 13 sont à '
    + 'une lettre l’un de l’autre et à cent mètres. Une ressemblance ne les '
    + 'rattrape pas', () => {
    expect(motsPorteurs('12 rue de la Paix 75002 Paris')).toEqual(['paix', 'paris']);
  });

  it('une saisie sans aucun mot porteur ne se juge pas', () => {
    expect(motsPorteurs('12')).toEqual([]);
    expect(motsPorteurs('rue de la')).toEqual([]);
    expect(reponseACote('12', '12 Place Carnot 54000 Nancy')).toBe(false);
  });
});

describe('la règle voit les réponses à côté — les VRAIES, celles du service', () => {
  /* Les quatre échecs mesurés le 09/09, avec les cinq suggestions que le
     service a réellement rendues à chaque fois. */
  const KLEER = [
    '1 Rue Heckler 67000 Strasbourg', 'Rue Geiler 67000 Strasbourg',
    '1 Rue Cuvier 67000 Strasbourg', '1 Rue Herder 67000 Strasbourg',
    '1 Rue de la Doller 67000 Strasbourg',
  ];
  const CHAEAU = [
    '1 Rue de Châteaulin 44000 Nantes', '1 Rue du Coudray 44000 Nantes',
    '1 Rue du Maine 44000 Nantes', '1 Rue Crucy 44000 Nantes',
    '1 Rue des Chambelles 44000 Nantes',
  ];

  it('« Place Kléer » ne trouve rien qui lui ressemble — et les cinq suggestions '
    + 'sont de vraies rues de la bonne ville, ce qui est exactement le piège', () => {
    expect(toutesACote('1 Place Kléer 67000 Strasbourg', KLEER)).toBe(true);
    expect(toutesACote('1 Place Kléeer 67000 Strasbourg', KLEER)).toBe(true);
  });

  it('« Rue du Chaeau » non plus — « Châteaulin » n’est pas « Château »', () => {
    expect(toutesACote('1 Rue du Chaeau 44000 Nantes', CHAEAU)).toBe(true);
    expect(toutesACote('1 Rue du Chaeeau 44000 Nantes', CHAEAU)).toBe(true);
  });

  it('LA RÈGLE SE TAIT QUAND LE SERVICE A BIEN TRAVAILLÉ — c’est le cas des 94 % : '
    + 'la faute est là, mais la réponse est bonne, et une accusation serait un '
    + 'contresens', () => {
    const cas: [string, string][] = [
      ['1 Aveune de Ségur 75007 Paris', '1 Avenue de Ségur 75007 Paris'],
      ['1 Rue des Carems 45000 Orléans', '1 Rue des Carmes 45000 Orléans'],
      ['1 Place Kléebr 67000 Strasbourg', '1 Place Kléber 67000 Strasbourg'],
      ['1 Rue du Châetau 44000 Nantes', '1 Rue du Château 44000 Nantes'],
      ['1 Rue Pasetur 21000 Dijon', '1 Rue Pasteur 21000 Dijon'],
      ['1 Rue Rivli 75001 Paris', '1 Rue de Rivoli 75001 Paris'],
    ];
    for (const [saisie, rendu] of cas) {
      expect(toutesACote(saisie, [rendu]), saisie).toBe(false);
    }
  });

  it('IL SUFFIT D’UNE SUGGESTION JUSTE POUR QU’IL N’Y AIT RIEN À DIRE : l’usager '
    + 'n’a qu’à la choisir', () => {
    expect(toutesACote('1 Place Kléer 67000 Strasbourg',
      [...KLEER.slice(0, 4), '1 Place Kléber 67000 Strasbourg'])).toBe(false);
  });

  it('UNE LISTE VIDE N’EST PAS « À CÔTÉ » : elle est vide, et l’application le dit '
    + 'déjà ailleurs — deux messages pour un même silence feraient un bavardage', () => {
    expect(toutesACote('1 Place Kléer 67000 Strasbourg', [])).toBe(false);
  });
});

describe('la règle reste muette pendant qu’on tape', () => {
  it('LE PRÉFIXE EST UNE CORRESPONDANCE, et c’est ce qui rend la règle utilisable '
    + 'sous autocomplétion : « Bellecou » n’est pas à côté de « Bellecour », il '
    + 'est en avance. Le score du service, lui, tombe à 0,49 sur « 12 Place Be » '
    + '— 13 % des saisies en cours passent sous son seuil', () => {
    const enCours: [string, string][] = [
      ['12 Place Be', '12 Place Bellecour 69002 Lyon'],
      ['12 Place Bellecou', '12 Place Bellecour 69002 Lyon'],
      ['1 Rue du Chateau 44000 Na', '1 Rue du Château 44000 Nantes'],
      ['1 Rue du Chateau 44000 Nant', '1 Rue du Château 44000 Nantes'],
      ['5 Cours Mirab', '5 Cours Mirabeau 13100 Aix-en-Provence'],
      ['6 Place Stanisl', '6 Place Stanislas 54000 Nancy'],
      ['1 Place Kle', '1 Place Kléber 67000 Strasbourg'],
    ];
    for (const [saisie, rendu] of enCours) {
      expect(toutesACote(saisie, [rendu]), saisie).toBe(false);
    }
  });

  it('et elle parle sur ce qui n’est pas une adresse du tout', () => {
    expect(toutesACote('rue qui nexiste pas 75001 Paris',
      ['Rue de Valois 75001 Paris'])).toBe(true);
  });
});

describe('ce qu’on dit', () => {
  it('ON NE DIT PAS « aucun résultat » : il y en a cinq, ils sont sous les yeux, '
    + 'et le nier passerait pour une panne', () => {
    expect(MOT_A_COTE).not.toMatch(/aucun résultat/i);
    expect(MOT_A_COTE).toContain('orthographe');
  });

  it('motRetrouve est la brique, et elle se lit seule', () => {
    expect(motRetrouve('kleber', '1 Place Kléber 67000 Strasbourg')).toBe(true);
    expect(motRetrouve('kleer', '1 Rue Heckler 67000 Strasbourg')).toBe(false);
  });
});
