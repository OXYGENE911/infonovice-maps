import { describe, it, expect } from 'vitest';
import {
  normaliserListe, versListes, listesAEcrire, identifiantDe, premiereGrappe,
  LISTES_LIVREES, COULEURS, NOM_MAX,
} from '../src/lib/listes-favoris';

/* LES LISTES DE FAVORIS (FAVORIS-2, 31/08).
 *
 * Armelin : « pouvoir l'enregistrer dans une catégorie custom de ses POI en
 * indiquant soi-même un nom, un émoji et couleur dédiée […] ou en
 * sélectionnant une liste prédéfinie comme sur Google Maps ». */

describe('les trois listes livrées', () => {
  /* UNE APPLICATION QUI S'OUVRE SUR « créez votre première liste » demande un
     travail avant de rendre un service. Celles qu'il cite existent d'emblée. */
  it('sont celles qu’il cite : favoris, à visiter, restaurants', () => {
    expect(LISTES_LIVREES.map((l) => l.id))
      .toEqual(['favoris', 'a-visiter', 'restaurants']);
  });

  it('le drapeau vert est bien vert', () => {
    const aVisiter = LISTES_LIVREES.find((l) => l.id === 'a-visiter')!;
    expect(aVisiter.emoji).toBe('🚩');
    expect(aVisiter.couleur).toBe('#1E9E5A');
  });

  it('elles sont marquées comme livrées — on ne les efface pas à la légère', () => {
    expect(LISTES_LIVREES.every((l) => l.livree === true)).toBe(true);
  });
});

describe('normaliserListe — ce qui est borné, et pourquoi', () => {
  it('accepte une liste bien formée', () => {
    expect(normaliserListe({ nom: 'Bars à vin', emoji: '🍷', couleur: '#6C4FA1' }))
      .toMatchObject({ nom: 'Bars à vin', emoji: '🍷', couleur: '#6C4FA1' });
  });

  /* UN NOM VIDE RENDRAIT UNE LISTE INVISIBLE dans son propre panneau : mieux
     vaut refuser clairement que garder l'infirme. */
  it('refuse une liste sans nom', () => {
    expect(normaliserListe({ nom: '   ', emoji: '🍷' })).toBeNull();
    expect(normaliserListe({})).toBeNull();
    expect(normaliserListe({ nom: 42 })).toBeNull();
  });

  it('borne la longueur du nom', () => {
    const long = normaliserListe({ nom: 'x'.repeat(200) });
    expect(long?.nom).toHaveLength(NOM_MAX);
  });

  /* UN ÉMOJI DE DIX SIGNES CASSERAIT L'ALIGNEMENT des pastilles. On n'en
     garde qu'un — mesuré en GRAPPES, pas en caractères. */
  it('ne garde qu’un seul émoji', () => {
    expect(normaliserListe({ nom: 'Test', emoji: '🍷🍺🥂' })?.emoji).toBe('🍷');
  });

  it('ne coupe pas un émoji composé en deux', () => {
    expect(normaliserListe({ nom: 'Test', emoji: '🇫🇷' })?.emoji).toBe('🇫🇷');
    expect(normaliserListe({ nom: 'Test', emoji: '👍🏽' })?.emoji).toBe('👍🏽');
  });

  it('donne une épingle quand aucun émoji n’est saisi', () => {
    expect(normaliserListe({ nom: 'Test' })?.emoji).toBe('📍');
    expect(normaliserListe({ nom: 'Test', emoji: '  ' })?.emoji).toBe('📍');
  });

  /* UNE COULEUR LIBRE POURRAIT ÊTRE ILLISIBLE sur la carte, ou n'être pas une
     couleur du tout. */
  it('refuse ce qui n’est pas une couleur, et retombe sur la palette', () => {
    expect(normaliserListe({ nom: 'T', couleur: 'rouge' })?.couleur).toBe(COULEURS[0]);
    expect(normaliserListe({ nom: 'T', couleur: '#GGGGGG' })?.couleur).toBe(COULEURS[0]);
    expect(normaliserListe({ nom: 'T', couleur: 'javascript:x' })?.couleur)
      .toBe(COULEURS[0]);
  });

  it('normalise la casse d’une couleur valide', () => {
    expect(normaliserListe({ nom: 'T', couleur: '#a1b2c3' })?.couleur).toBe('#A1B2C3');
  });
});

describe('identifiantDe — lisible six mois plus tard', () => {
  /* UN EXPORT RELU PLUS TARD doit se comprendre sans table de
     correspondance. */
  it('tire une clé lisible du nom', () => {
    expect(identifiantDe('Bars à vin')).toBe('bars-a-vin');
    expect(identifiantDe('À visiter')).toBe('a-visiter');
  });

  it('ne rend jamais une clé vide', () => {
    expect(identifiantDe('🍷🍺')).toMatch(/^liste-/);
    expect(identifiantDe('')).toMatch(/^liste-/);
  });
});

describe('premiereGrappe', () => {
  it('rend la première grappe, ou rien', () => {
    expect(premiereGrappe('abc')).toBe('a');
    expect(premiereGrappe('')).toBe('');
  });
});

describe('versListes — défensive', () => {
  /* LES TROIS LIVRÉES SONT TOUJOURS LÀ, même si le stockage est vide ou
     abîmé : un panneau de favoris vide au premier lancement ne dit pas ce que
     l'application sait faire. */
  it('rend les livrées même sans rien en stockage', () => {
    expect(versListes(undefined).map((l) => l.id))
      .toEqual(['favoris', 'a-visiter', 'restaurants']);
    expect(versListes('n’importe quoi')).toHaveLength(3);
    expect(versListes([null, 42, { nom: '' }])).toHaveLength(3);
  });

  it('ajoute les listes de l’usager après les livrées', () => {
    const l = versListes([{ id: 'bars', nom: 'Bars', emoji: '🍺', couleur: '#2272C4' }]);
    expect(l).toHaveLength(4);
    expect(l[3]).toMatchObject({ id: 'bars', nom: 'Bars' });
  });

  it('ne laisse pas une liste usurper l’identifiant d’une livrée', () => {
    const l = versListes([{ id: 'favoris', nom: 'Pirate', emoji: '💀', couleur: '#000000' }]);
    expect(l).toHaveLength(3);
    expect(l.find((x) => x.id === 'favoris')?.nom).toBe('Lieux favoris');
  });
});

describe('listesAEcrire', () => {
  /* ON NE STOCKE PAS LES LIVRÉES : leur définition vit dans le code, et les
     recopier figerait un libellé qu'on voudra peut-être corriger. */
  it('n’écrit que ce que l’usager a ajouté', () => {
    const toutes = versListes([{ id: 'bars', nom: 'Bars', emoji: '🍺', couleur: '#2272C4' }]);
    const aEcrire = listesAEcrire(toutes);
    expect(aEcrire).toHaveLength(1);
    expect(aEcrire[0]?.id).toBe('bars');
  });
});
