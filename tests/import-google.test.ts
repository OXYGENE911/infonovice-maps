import { describe, expect, test } from 'vitest';
import {
  positionDuLien, decouperLigneCsv, lireCsvGoogle, lireGeoJsonGoogle,
  lireExportGoogle, nomDeListe,
} from '../src/lib/import-google';

/* IMPORTER SES FAVORIS GOOGLE MAPS (FAVORIS-3, 31/08).
 *
 * Armelin : « pouvoir exporter et importer ses favoris Google Maps dans
 * Infonovice Maps […] recréer une structure similaire sous forme de liste ».
 *
 * CE QUE CES PARCOURS DÉFENDENT SURTOUT : qu'on ne DEVINE pas. Une entrée dont
 * le lien ne porte pas de coordonnées n'est pas importée — un favori faux est
 * pire qu'un favori manquant, parce qu'on le croit. */

describe('positionDuLien — trois formes connues, et le refus', () => {
  /* `!3d…!4d…` est la position du LIEU : la plus sûre des trois. */
  test('lit la position précise du lieu', () => {
    const p = positionDuLien(
      'https://www.google.com/maps/place/Tour+Eiffel/@48.85,2.29,17z/data=!3d48.8583701!4d2.2944813',
    );
    expect(p).toEqual({ lat: 48.8583701, lon: 2.2944813 });
  });

  test('lit une position explicite en requête', () => {
    expect(positionDuLien('https://maps.google.com/?q=45.7640,4.8357'))
      .toEqual({ lat: 45.764, lon: 4.8357 });
    // Encodée, comme Google l'écrit parfois.
    expect(positionDuLien('https://maps.google.com/?q=45.7640%2C4.8357'))
      .toEqual({ lat: 45.764, lon: 4.8357 });
  });

  /* `@…` est le CENTRE DE LA CARTE, pas forcément le lieu — mais l'écart
     reste faible, et c'est mieux que de perdre l'entrée. */
  test('retombe sur le centre de la carte', () => {
    expect(positionDuLien('https://www.google.com/maps/@43.2965,5.3698,15z'))
      .toEqual({ lat: 43.2965, lon: 5.3698 });
  });

  /* `cid` et `ftid` sont des identifiants internes : les résoudre demanderait
     d'interroger Google, ce que le mandat interdit. */
  test('REFUSE un identifiant que seul Google sait résoudre', () => {
    expect(positionDuLien('https://maps.google.com/?cid=1234567890')).toBeNull();
    expect(positionDuLien('https://www.google.com/maps/place/?ftid=0x47e66:0x123'))
      .toBeNull();
  });

  test('refuse le point nul et les positions impossibles', () => {
    expect(positionDuLien('https://maps.google.com/?q=0,0')).toBeNull();
    expect(positionDuLien('https://maps.google.com/?q=200,900')).toBeNull();
  });

  test('ne se laisse pas piéger par ce qui n’est pas un lien', () => {
    expect(positionDuLien('')).toBeNull();
    expect(positionDuLien(42 as unknown as string)).toBeNull();
  });
});

describe('decouperLigneCsv — les virgules dans les titres', () => {
  /* `split(',')` aurait fait deux colonnes de « Chez Paul, Lyon » : le lien
     serait passé dans la mauvaise, et l'entrée perdue EN SILENCE. */
  test('respecte les guillemets', () => {
    expect(decouperLigneCsv('"Chez Paul, Lyon",Note,https://x'))
      .toEqual(['Chez Paul, Lyon', 'Note', 'https://x']);
  });

  test('rend un guillemet doublé', () => {
    expect(decouperLigneCsv('"Le ""Bistrot""",,https://x'))
      .toEqual(['Le "Bistrot"', '', 'https://x']);
  });

  test('découpe une ligne simple', () => {
    expect(decouperLigneCsv('a,b,c')).toEqual(['a', 'b', 'c']);
  });
});

describe('lireCsvGoogle', () => {
  const csv = [
    'Titre,Note,URL',
    '"Chez Paul, Lyon",Le meilleur,https://www.google.com/maps/place/x/data=!3d45.7640!4d4.8357',
    // Google entoure de guillemets les URL qui portent une virgule.
    'Tour Eiffel,,"https://maps.google.com/?q=48.8584,2.2945"',
    'Lieu mystère,,https://maps.google.com/?cid=999',
  ].join('\n');

  test('importe ce qu’il sait situer', () => {
    const { lieux } = lireCsvGoogle(csv);
    expect(lieux).toHaveLength(2);
    expect(lieux[0]).toMatchObject({ nom: 'Chez Paul, Lyon', note: 'Le meilleur' });
    expect(lieux[1]?.nom).toBe('Tour Eiffel');
  });

  /* CE QU'ON NE SAIT PAS FAIRE, ON LE DIT : le titre est rendu à l'appelant
     pour qu'il l'affiche, jamais deviné par un géocodage sur le seul nom —
     « Chez Marcel » atterrirait sur un homonyme à trois cents kilomètres. */
  test('rend les titres qu’il n’a pas su situer', () => {
    expect(lireCsvGoogle(csv).sansPosition).toEqual(['Lieu mystère']);
  });

  /* LES EN-TÊTES CHANGENT AVEC LA LANGUE DU COMPTE : on les cherche par nom,
     sans supposer l'ordre des colonnes. */
  test('lit un export anglais, colonnes dans un autre ordre', () => {
    const anglais = [
      'URL,Title,Comment',
      '"https://maps.google.com/?q=48.8584,2.2945",Eiffel Tower,Nice',
    ].join('\n');
    const { lieux } = lireCsvGoogle(anglais);
    expect(lieux[0]).toMatchObject({ nom: 'Eiffel Tower', note: 'Nice' });
  });

  /* UNE LIGNE DÉCALÉE dont le titre vient APRÈS le lien ne donne pas un nom
     de confiance : on la compte, on ne la devine pas. Un favori bien placé et
     mal nommé serait pire qu'une entrée manquante. */
  test('compte les lignes dont il ne sait pas lire le titre', () => {
    const decale = ['URL,Titre',
      'https://maps.google.com/?q=48.8584,2.2945,Tour Eiffel'].join(String.fromCharCode(10));
    const r = lireCsvGoogle(decale);
    expect(r.lieux).toEqual([]);
    expect(r.illisibles).toBe(1);
  });

  test('ne casse pas sur un fichier vide ou sans les bonnes colonnes', () => {
    const vide = { lieux: [], sansPosition: [], illisibles: 0 };
    expect(lireCsvGoogle('')).toEqual(vide);
    expect(lireCsvGoogle('Titre\nx')).toEqual(vide);
    expect(lireCsvGoogle('a,b\n1,2')).toEqual(vide);
  });
});

describe('lireGeoJsonGoogle', () => {
  const geo = {
    type: 'FeatureCollection',
    features: [
      {
        geometry: { coordinates: [2.2945, 48.8584], type: 'Point' },
        properties: { Title: 'Tour Eiffel', Comment: 'À revoir' },
      },
      {
        geometry: { coordinates: [4.8357, 45.764] },
        properties: { Location: { 'Business Name': 'Chez Paul' } },
      },
      // Sans géométrie : on ne devine pas.
      { properties: { Title: 'Sans position' } },
    ],
  };

  test('importe les lieux, et nomme ce qu’il ne situe pas', () => {
    const { lieux, sansPosition } = lireGeoJsonGoogle(geo);
    expect(lieux).toHaveLength(2);
    expect(lieux[0]).toMatchObject({ nom: 'Tour Eiffel', lon: 2.2945, note: 'À revoir' });
    expect(lieux[1]?.nom).toBe('Chez Paul');
    expect(sansPosition).toEqual(['Sans position']);
  });

  test('défensive jusqu’au bout', () => {
    const vide = { lieux: [], sansPosition: [], illisibles: 0 };
    expect(lireGeoJsonGoogle(null)).toEqual(vide);
    expect(lireGeoJsonGoogle({ features: 'non' })).toEqual(vide);
    expect(lireGeoJsonGoogle({ features: [null, 42] })).toEqual(vide);
  });
});

describe('lireExportGoogle — le format se devine au contenu', () => {
  /* PAS À L'EXTENSION : un fichier renommé, un navigateur qui ment sur le
     type, un usager qui change le suffixe — la lecture doit marcher. */
  test('reconnaît un JSON', () => {
    const j = JSON.stringify({
      features: [{
        geometry: { coordinates: [2.2945, 48.8584] }, properties: { Title: 'X' },
      }],
    });
    expect(lireExportGoogle(j).lieux).toHaveLength(1);
  });

  test('reconnaît un CSV', () => {
    expect(lireExportGoogle('Titre,URL\nX,https://maps.google.com/?q=48.8,2.3')
      .lieux).toHaveLength(1);
  });

  test('un JSON abîmé ne fait pas tomber la lecture', () => {
    expect(lireExportGoogle('{ ceci n’est pas du JSON'))
      .toEqual({ lieux: [], sansPosition: [], illisibles: 0 });
  });
});

describe('nomDeListe — le fichier fait la liste', () => {
  /* « Envie d'y aller.csv » devient la liste « Envie d'y aller » : c'est la
     « structure similaire » demandée, et elle ne coûte aucune saisie. */
  test('tire le nom du fichier', () => {
    expect(nomDeListe('Envie d’y aller.csv')).toBe('Envie d’y aller');
    expect(nomDeListe('Lieux_enregistres.json')).toBe('Lieux enregistres');
  });

  test('ne rend jamais un nom vide', () => {
    expect(nomDeListe('.csv')).toBe('Google Maps');
    expect(nomDeListe('')).toBe('Google Maps');
  });

  test('borne la longueur, comme les listes', () => {
    expect(nomDeListe(`${'x'.repeat(200)}.csv`)).toHaveLength(40);
  });
});
