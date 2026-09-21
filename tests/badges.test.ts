import { describe, it, expect } from 'vitest';
import {
  BADGES, MATRICE_BADGES, indexerMatrice, ErreurMatriceBadges,
  type CleBadge, type LigneMatrice,
} from '../src/lib/badges';
import { cleReseau } from '../src/lib/index-bornes';

/* LA MATRICE SE LIT AVEC LA CLÉ DE RÉSEAU, jamais avec la chaîne brute — et
   les tests l'indexent exactement comme la production, sans quoi ils
   valideraient un rapprochement que personne n'exécute. */
const m = indexerMatrice(cleReseau);

describe('la matrice des badges', () => {
  it('porte les 30 opérateurs relevés et les 9 badges décidés', () => {
    expect(MATRICE_BADGES).toHaveLength(30);
    expect(BADGES).toHaveLength(9);
    for (const ligne of MATRICE_BADGES) {
      expect(Object.keys(ligne.verdicts).sort())
        .toEqual(BADGES.map((b) => b.cle).sort());
    }
  });

  /* LE FAIT MESURÉ QU'ON DOIT POUVOIR DIRE AU STAND (§3.4 de la mission) :
     aucun des trente plus gros opérateurs français n'accepte le badge Ionity.
     Cocher Ionity seul rend zéro station — par la donnée, pas par un bogue.
     Ce test verrouille le fait : s'il tombe, c'est la v2 de la matrice qui a
     bougé, et le message du panneau doit être relu avec elle. */
  it('dit « non » à Ionity pour les 30 opérateurs', () => {
    for (const ligne of MATRICE_BADGES) {
      expect(ligne.verdicts.ionity).toBe('non');
    }
  });
});

describe('indexerMatrice', () => {
  /* LA GARDE DE COLLISION. Cinq paires de libellés s'écrasent sur une même
     clé (« LIDL France »/« Lidl France », « Electra »/« ELECTRA »…) et
     portent aujourd'hui le MÊME verdict — vérifié. La v2 de la matrice
     (tâche recP5v279q6llmitl) remplira des colonnes : si elle ne remplit
     qu'une des deux graphies, le verdict retenu dépendrait de l'ORDRE des
     lignes, ce qu'aucun lecteur ne devinerait. On refuse plutôt que de
     choisir en silence. */
  it('refuse deux libellés de même clé aux verdicts divergents', () => {
    const verdicts = (v: Record<string, unknown>) => ({
      ...Object.fromEntries(BADGES.map((b) => [b.cle, 'inconnu'])), ...v,
    }) as LigneMatrice['verdicts'];
    const lignes: LigneMatrice[] = [
      { operateur: 'LIDL France', verdicts: verdicts({ chargemap: 'oui' }) },
      { operateur: 'Lidl France', verdicts: verdicts({ chargemap: 'non' }) },
    ];
    expect(() => indexerMatrice(cleReseau, lignes)).toThrow(ErreurMatriceBadges);
    expect(() => indexerMatrice(cleReseau, lignes)).toThrow(/lidl/i);
  });

  it('accepte deux libellés de même clé aux verdicts identiques', () => {
    expect(() => indexerMatrice(cleReseau)).not.toThrow();
  });
});

describe('verdict', () => {
  it('rend le verdict relevé pour un opérateur connu', () => {
    expect(m.verdict('Electra', 'mobilize')).toBe('oui');
    expect(m.verdict('Electra', 'ionity')).toBe('non');
    expect(m.verdict('Tesla', 'octopus')).toBe('inconnu');
  });

  /* ABSENT DE LA MATRICE N'EST PAS « COMPATIBLE » : la matrice ne couvre que
     trente opérateurs sur les cent quarante du fichier IRVE. Tout le reste
     est inconnu, donc masqué (§3.2). */
  it('rend « inconnu » pour un opérateur absent, ou sans opérateur', () => {
    expect(m.verdict('Réseau de la Creuse', 'chargemap')).toBe('inconnu');
    expect(m.verdict(null, 'chargemap')).toBe('inconnu');
    expect(m.verdict('', 'chargemap')).toBe('inconnu');
  });

  /* LA CASSE ET LA GRAPHIE NE CHANGENT RIEN — c'est tout l'objet de
     `cleReseau`, et la raison pour laquelle la matrice est indexée par elle
     plutôt que par la chaîne du fichier. */
  it('rapproche les graphies d’un même opérateur', () => {
    for (const badge of BADGES.map((b) => b.cle)) {
      expect(m.verdict('LIDL France', badge)).toBe(m.verdict('Lidl France', badge));
      expect(m.verdict('E-Totem', badge)).toBe(m.verdict('E-TOTEM', badge));
      expect(m.verdict('Izivia', badge)).toBe(m.verdict('IZIVIA', badge));
    }
    expect(m.verdict('LIDL France', 'izivia')).toBe('oui');
    expect(m.verdict('Lidl France', 'izivia')).toBe('oui');
  });
});

describe('motif', () => {
  const coche = (...b: CleBadge[]): CleBadge[] => b;

  it('sans badge coché, tout passe', () => {
    expect(m.motif('Réseau inconnu au bataillon', [])).toBe('passe');
    expect(m.motif(null, [])).toBe('passe');
  });

  it('un « oui » fait passer', () => {
    expect(m.motif('Electra', coche('mobilize'))).toBe('passe');
  });

  it('un « non » bloque, et le dit', () => {
    expect(m.motif('Electra', coche('ionity'))).toBe('non');
  });

  /* « INCONNU » N'EST PAS COMPATIBLE — ON ÉCHOUE FERMÉ (§3.2). Montrer une
     borne qui refuse le badge du prospect, au stand, c'est le produit qui
     ment devant lui. Montrer moins mais sûr se défend. */
  it('un « inconnu » bloque, au même titre qu’un « non »', () => {
    expect(m.motif('Tesla', coche('octopus'))).toBe('inconnu');
  });

  it('un opérateur absent de la matrice bloque dès qu’un badge est coché', () => {
    expect(m.motif('Bornes de la Creuse', coche('chargemap'))).toBe('inconnu');
    expect(m.motif(null, coche('chargemap'))).toBe('inconnu');
  });

  /* OU ENTRE BADGES : on a l'un OU l'autre dans sa poche, pas les deux à la
     fois. Exiger que tous disent « oui » ne rendrait presque rien. */
  it('OU entre les badges cochés : un seul « oui » suffit', () => {
    expect(m.motif('Electra', coche('ionity', 'mobilize'))).toBe('passe');
    expect(m.motif('Electra', coche('mobilize', 'ionity'))).toBe('passe');
  });

  /* LE MOTIF SERT LES DEUX MESSAGES DU PANNEAU, et il doit donc les
     distinguer : « non » partout autorise « aucun opérateur n'accepte ce
     badge » (§3.4) ; un seul « inconnu » interdit cette phrase, parce que
     l'information manque au lieu d'être négative (§3.3). */
  it('un « inconnu » mêlé à des « non » rend « inconnu », pas « non »', () => {
    // Electra : ionity = non, shell = inconnu.
    expect(m.motif('Electra', coche('ionity', 'shell'))).toBe('inconnu');
    // Electra : ionity = non seul.
    expect(m.motif('Electra', coche('ionity'))).toBe('non');
  });
});
