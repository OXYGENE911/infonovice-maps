import { describe, it, expect } from 'vitest';
import { rubriquesDe, horairesEnFrancais } from '../src/lib/detail-lieu';

/* LA FICHE D'UN LIEU (LIEUX-1, 31/08).
 *
 * Armelin : « quand on clique sur un POI à l'écran, il y a juste écrit un
 * texte pour indiquer le nom de l'enseigne ou le type de POI, mais ce serait
 * bien d'afficher une fenêtre avec du détail ».
 *
 * CE QUE CES PARCOURS DÉFENDENT SURTOUT : qu'on n'invente RIEN. Une fiche
 * pleine de rubriques vides ferait croire à un lieu mal renseigné alors que
 * c'est la carte qui l'est. */

describe('rubriquesDe — rien n’est inventé', () => {
  it('sans étiquettes, aucune rubrique', () => {
    expect(rubriquesDe({})).toEqual([]);
  });

  it('ignore les étiquettes vides', () => {
    expect(rubriquesDe({ phone: '   ', website: '', 'addr:street': '' })).toEqual([]);
  });

  /* L'ADRESSE SE RECOMPOSE : OSM la range en morceaux, et « 12 rue de la
     Paix, Paris » se lit mieux que trois rubriques séparées. */
  it('recompose l’adresse depuis ses morceaux', () => {
    const r = rubriquesDe({
      'addr:housenumber': '12', 'addr:street': 'rue de la Paix', 'addr:city': 'Paris',
    });
    expect(r[0]).toMatchObject({ cle: 'adresse', valeur: '12 rue de la Paix, Paris' });
  });

  it('se contente de ce qu’il y a', () => {
    expect(rubriquesDe({ 'addr:city': 'Lyon' })[0]?.valeur).toBe('Lyon');
    expect(rubriquesDe({ 'addr:street': 'quai Saint-Antoine' })[0]?.valeur)
      .toBe('quai Saint-Antoine');
  });

  /* LE NUMÉRO SE COMPOSE D'UN DOIGT : en voiture, recopier dix chiffres n'est
     pas une option. */
  it('rend le téléphone appelable, sans abîmer son affichage', () => {
    const r = rubriquesDe({ phone: '+33 1 42 60 30 30' });
    expect(r[0]).toMatchObject({
      valeur: '+33 1 42 60 30 30', lien: 'tel:+33142603030',
    });
  });

  it('accepte aussi la forme « contact: »', () => {
    expect(rubriquesDe({ 'contact:phone': '0142603030' })[0]?.lien)
      .toBe('tel:0142603030');
  });

  it('n’ouvre que des sites en http(s) — jamais un schéma inattendu', () => {
    expect(rubriquesDe({ website: 'https://exemple.fr/carte' })[0]).toMatchObject({
      cle: 'site', valeur: 'exemple.fr/carte', lien: 'https://exemple.fr/carte',
    });
    expect(rubriquesDe({ website: 'javascript:alert(1)' })).toEqual([]);
    expect(rubriquesDe({ website: 'exemple.fr' })).toEqual([]);
  });

  /* L'ACCESSIBILITÉ DÉCIDE D'Y ALLER OU NON : on ne l'affiche que si la carte
     la déclare — « inconnu » ne se dit pas « non ». */
  it.each([['yes', 'oui'], ['limited', 'partiel'], ['no', 'non']])(
    'traduit l’accès fauteuil « %s »', (brut, attendu) => {
      expect(rubriquesDe({ wheelchair: brut })[0]).toMatchObject({
        cle: 'roulant', valeur: attendu,
      });
    },
  );

  it('se tait sur un accès fauteuil non déclaré', () => {
    expect(rubriquesDe({ wheelchair: 'unknown' })).toEqual([]);
    expect(rubriquesDe({})).toEqual([]);
  });

  /* L'ORDRE EST CELUI DE L'USAGE : ce qui décide d'y aller vient d'abord. */
  it('met l’adresse et les horaires avant le reste', () => {
    const cles = rubriquesDe({
      website: 'https://x.fr', phone: '0102030405',
      opening_hours: 'Mo-Fr 09:00-18:00', 'addr:city': 'Nice',
    }).map((r) => r.cle);
    expect(cles).toEqual(['adresse', 'horaires', 'tel', 'site']);
  });
});

describe('horairesEnFrancais — on traduit, on ne conclut pas', () => {
  /* `opening_hours` est un petit langage à lui tout seul. Répondre « ouvert
     maintenant ? » demanderait les jours fériés, les exceptions de dates, les
     semaines paires — et une réponse fausse fait faire un détour pour rien.
     On met en français, l'usager lit et décide. */
  it('traduit les intervalles de jours', () => {
    expect(horairesEnFrancais('Mo-Fr 08:00-19:00'))
      .toBe('du lundi au vendredi de 08 h 00 à 19 h 00');
  });

  it('traduit les jours isolés et les fermetures', () => {
    expect(horairesEnFrancais('Su off')).toBe('dimanche fermé');
    expect(horairesEnFrancais('Sa 09:00-12:00')).toBe('samedi de 09 h 00 à 12 h 00');
  });

  it('sépare les blocs, et lit les doubles plages', () => {
    expect(horairesEnFrancais('Mo-Fr 08:00-12:00,14:00-19:00; Su off'))
      .toBe('du lundi au vendredi de 08 h 00 à 12 h 00 et de 14 h 00 à 19 h 00'
        + ' · dimanche fermé');
  });

  it('dit « ouvert en permanence » plutôt que « 24/7 »', () => {
    expect(horairesEnFrancais('24/7')).toBe('ouvert en permanence');
  });

  it('nomme les jours fériés', () => {
    expect(horairesEnFrancais('PH off')).toBe('jours fériés fermé');
  });

  /* CE QU'ON NE SAIT PAS TRADUIRE RESSORT TEL QUEL, plutôt que d'être caché :
     un horaire exotique reste plus utile qu'un blanc. */
  it('laisse passer ce qu’il ne sait pas traduire', () => {
    expect(horairesEnFrancais('week 1-53/2 Mo 10:00-12:00'))
      .toContain('lundi de 10 h 00 à 12 h 00');
  });

  it('ne rend rien pour une chaîne vide', () => {
    expect(horairesEnFrancais('')).toBe('');
    expect(horairesEnFrancais('  ;  ')).toBe('');
  });
});
