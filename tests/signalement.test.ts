import { describe, expect, it } from 'vitest';
import { liensSignalement } from '../src/lib/signalement';

/* SENS-1 (05/09) : signaler une erreur de carte à l'endroit exact, sans rien
   envoyer d'office. */
describe('liensSignalement', () => {
  it('centre la note OSM et cartes.gouv.fr sur la position, à cinq décimales', () => {
    const l = liensSignalement(2.41234567, 48.83987654);
    expect(l.osm).toBe('https://www.openstreetmap.org/note/new#map=18/48.83988/2.41235');
    expect(l.ign).toBe('https://cartes.gouv.fr/cartes?c=2.41235,48.83988&z=18');
  });
});
