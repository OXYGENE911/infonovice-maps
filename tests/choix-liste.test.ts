import { describe, it, expect } from 'vitest';
import { demanderLaListe, libelleListe, DIT_GARDE } from '../src/carte/choix-liste';
import { LISTES_LIVREES, versListes } from '../src/lib/listes-favoris';

/* CHOISIR SA LISTE EN GARDANT UN LIEU (FAVORIS-4, 03/09).
 *
 * Armelin, deux fois dans le même retour : « on n'a pas la possibilité de
 * choisir directement dans quelle catégorie l'enregistrer » (POI), et « on ne
 * peut pas l'ajouter en favoris dans une liste qu'on aurait créée » (borne).
 *
 * CE FICHIER MESURE LA SEULE PARTIE QU'UN PARCOURS NE PEUT PAS ATTEINDRE : le
 * cas d'une liste unique. Le reste — la rangée, le libellé rendu, l'ajout — se
 * prouve dans `tests-e2e/choix-liste-favoris.spec.ts`, au doigt. */

describe('demanderLaListe', () => {
  it('NE DEMANDE RIEN quand le choix n’existe pas', () => {
    expect(demanderLaListe([])).toBe(false);
    expect(demanderLaListe([LISTES_LIVREES[0]!])).toBe(false);
  });

  it('DEMANDE dès qu’il y a deux listes', () => {
    expect(demanderLaListe(LISTES_LIVREES.slice(0, 2))).toBe(true);
  });

  it('DEMANDE TOUJOURS EN VRAI : les trois livrées sont irréductibles', () => {
    /* CE QUI REND LE GARDE INATTEIGNABLE DEPUIS L'INTERFACE, et il faut que
       cela reste écrit : `versListes` remet les trois listes en tête même
       quand le stockage est vide ou abîmé. Le jour où cette garantie tombe,
       ce test tombe avec elle, et le garde ci-dessus reprend du service. */
    expect(demanderLaListe(versListes(undefined))).toBe(true);
    expect(demanderLaListe(versListes([]))).toBe(true);
    expect(demanderLaListe(versListes('n’importe quoi'))).toBe(true);
  });
});

describe('libelleListe', () => {
  it('MET L’ÉMOJI DEVANT : c’est lui qu’on reconnaît dans une rangée de six', () => {
    expect(libelleListe(LISTES_LIVREES[0]!)).toBe('⭐ Lieux favoris');
    expect(libelleListe(LISTES_LIVREES[1]!)).toBe('🚩 À visiter');
  });

  it('DIT_GARDE reste le début de la phrase de confirmation', () => {
    /* LES PARCOURS CHERCHENT « Ajouté aux favoris » : changer cette constante
       sans changer les parcours ferait passer des tests pour une raison
       fausse. */
    expect(DIT_GARDE).toBe('Ajouté aux favoris');
  });
});
