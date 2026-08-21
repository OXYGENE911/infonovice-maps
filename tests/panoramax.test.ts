// Photos de rue — analyse STAC défensive et choix de la plus proche, à sec.
// Les fixtures reprennent la FORME RÉELLE de la réponse Panoramax (vérifiée
// le 22/08/2026) : assets hd/sd/thumb, `geovisio:producer`, `license`.
import { describe, expect, test } from 'vitest';
import {
  urlPhotos, versPhotos, plusProche, formaterPrise, ErreurPhotos,
} from '../src/lib/panoramax';

const photo = (id: string, lon: number, lat: number, extra: Record<string, unknown> = {}) => ({
  id,
  geometry: { type: 'Point', coordinates: [lon, lat] },
  properties: {
    datetime: '2015-07-30T17:10:04+00:00',
    license: 'CC-BY-SA-4.0',
    'geovisio:producer': 'Contributeur OSM',
    ...(extra['properties'] as object ?? {}),
  },
  assets: {
    hd: { href: `https://panoramax.openstreetmap.fr/images/${id}.jpg`, type: 'image/jpeg' },
    sd: { href: `https://panoramax.openstreetmap.fr/derivates/${id}/sd.jpg`, type: 'image/jpeg' },
    thumb: { href: `https://panoramax.openstreetmap.fr/derivates/${id}/thumb.jpg`, type: 'image/jpeg' },
    ...(extra['assets'] as object ?? {}),
  },
});

describe('urlPhotos', () => {
  test('construit une bbox carrée autour du point, avec une limite', () => {
    const u = urlPhotos(2.3364, 48.8611);
    expect(u).toContain('api.panoramax.xyz/api/search');
    const bbox = new URL(u).searchParams.get('bbox')!.split(',').map(Number);
    expect(bbox[0]).toBeLessThan(2.3364);
    expect(bbox[2]).toBeGreaterThan(2.3364);
    expect(bbox[1]).toBeLessThan(48.8611);
    expect(bbox[3]).toBeGreaterThan(48.8611);
    expect(new URL(u).searchParams.get('limit')).toBe('12');
  });
});

describe('versPhotos', () => {
  test('lit id, position, image et attribution', () => {
    const p = versPhotos({ features: [photo('abc', 2.3364, 48.8611)] });
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({
      id: 'abc', lon: 2.3364, lat: 48.8611,
      producteur: 'Contributeur OSM', licence: 'CC-BY-SA-4.0',
    });
    expect(p[0]!.image).toContain('/sd.jpg'); // la taille moyenne, pas la HD
  });

  test('se rabat sur la HD quand la taille moyenne manque', () => {
    const brut = photo('def', 2, 48);
    delete (brut.assets as Record<string, unknown>)['sd'];
    const p = versPhotos({ features: [brut] });
    expect(p[0]!.image).toContain('/images/def.jpg');
  });

  test('ÉCARTE une image hébergée ailleurs — la CSP la bloquerait de toute façon', () => {
    const intrus = photo('ghi', 2, 48, {
      assets: { sd: { href: 'https://ailleurs.example/photo.jpg', type: 'image/jpeg' },
        hd: { href: 'https://ailleurs.example/hd.jpg', type: 'image/jpeg' } },
    });
    expect(versPhotos({ features: [intrus] })).toHaveLength(0);
  });

  test('écarte les entrées difformes sans lever', () => {
    const p = versPhotos({ features: [
      photo('ok', 2, 48),
      { id: 'sans-geometrie', assets: {} },
      { id: 'hors-globe', geometry: { type: 'Point', coordinates: [200, 95] }, assets: {} },
      { geometry: { type: 'LineString', coordinates: [] } },
      null,
    ] });
    expect(p).toHaveLength(1);
    expect(p[0]!.id).toBe('ok');
  });

  test('refuse une réponse qui n’est pas une collection, en français', () => {
    expect(() => versPhotos({})).toThrow(ErreurPhotos);
    expect(() => versPhotos({ features: 'non' })).toThrow('exploitables');
  });
});

describe('plusProche', () => {
  test('choisit la photo la plus proche du point demandé', () => {
    const p = versPhotos({ features: [
      photo('loin', 2.35, 48.86), photo('pres', 2.3365, 48.8612),
    ] });
    expect(plusProche(p, 2.3364, 48.8611)?.id).toBe('pres');
  });

  test('rend null quand il n’y a rien', () => {
    expect(plusProche([], 2, 48)).toBeNull();
  });
});

describe('formaterPrise', () => {
  test('rend un mois et une année en français', () => {
    expect(formaterPrise('2015-07-30T17:10:04+00:00')).toMatch(/juillet 2015/);
  });
  test('une date absente ou illisible ne casse pas la légende', () => {
    expect(formaterPrise(null)).toBeNull();
    expect(formaterPrise('pas-une-date')).toBeNull();
  });
});
