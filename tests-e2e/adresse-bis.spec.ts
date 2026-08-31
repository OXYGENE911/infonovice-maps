import { test, expect } from '@playwright/test';
import { simulerTuiles } from './tuiles-simulees';

/* LES ADRESSES BIS (ADRESSE-2, 01/09).
 *
 * Armelin : « j'habite au 23 BIS Avenue du prophète et je suis obligé de
 * taper 25 pour trouver mon adresse ». MESURÉ sur la BAN le 31/08/2026 : le
 * 23 bis de sa voie n'existe pas dans la base (elle connaît 12bis, 14bis,
 * 20bis et 33bis). Aucune requête ne le trouvera — on replie donc sur le
 * numéro de base, ET ON LE DIT. Le décor ci-dessous rejoue exactement cette
 * base : la voie répond, le 23 bis non, le 23 oui. */

const VOIE = {
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [2.5722, 48.8103] },
  properties: {
    label: 'avenue du prophète 94420 Le Plessis-Trévise',
    type: 'street', postcode: '94420', city: 'Le Plessis-Trévise',
  },
};

const NUMERO_23 = {
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [2.5724, 48.8105] },
  properties: {
    label: '23 avenue du prophète 94420 Le Plessis-Trévise',
    type: 'housenumber', housenumber: '23', postcode: '94420',
    city: 'Le Plessis-Trévise',
  },
};

const NUMERO_12BIS = {
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [2.5719, 48.8101] },
  properties: {
    label: '12bis avenue du prophète 94420 Le Plessis-Trévise',
    type: 'housenumber', housenumber: '12bis', postcode: '94420',
    city: 'Le Plessis-Trévise',
  },
};

/** Les requêtes réellement émises vers la BAN — c'est elles qui comptent. */
async function espionnerBan(page: import('@playwright/test').Page): Promise<string[]> {
  const vues: string[] = [];
  await page.route('**/api-adresse.data.gouv.fr/search/**', (route) => {
    const q = new URL(route.request().url()).searchParams.get('q') ?? '';
    vues.push(q);
    /* LA BASE TELLE QU'ELLE EST : le 12bis existe, le 23bis non — pour lui
       la BAN ne rend que la voie, et c'est tout le défaut du terrain. */
    let features: unknown[] = [VOIE];
    if (/^12bis /.test(q)) features = [NUMERO_12BIS, VOIE];
    else if (/^23 /.test(q)) features = [NUMERO_23, VOIE];
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ type: 'FeatureCollection', features }),
    });
  });
  return vues;
}

async function chercher(page: import('@playwright/test').Page, texte: string): Promise<void> {
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await page.getByRole('combobox', { name: /Rechercher une adresse/ }).first().fill(texte);
}

test.beforeEach(async ({ page }) => { await simulerTuiles(page); });

test('LE 23 BIS ABSENT DE LA BASE REPLIE SUR LE 23 — et le DIT', async ({ page }) => {
  const vues = await espionnerBan(page);
  await chercher(page, '23 bis avenue du prophète');

  /* L'AVEU, EN TOUTES LETTRES : sans lui, l'usager croirait être au 23 bis
     alors qu'on l'a posé au 23 — un mensonge pire que le silence. */
  const aveu = page.locator('.recherche .approche:not([hidden])').first();
  await expect(aveu).toBeVisible({ timeout: 10_000 });
  await expect(aveu).toContainText('23 bis');
  await expect(aveu).toContainText('Base Adresse Nationale');

  // Le numéro replié est proposé EN TÊTE : c'est le plus proche de la demande.
  await expect(page.locator('.recherche [role="option"] .libelle').first())
    .toHaveText('23 avenue du prophète 94420 Le Plessis-Trévise');

  /* DEUX APPELS AU PLUS, ET LA GRAPHIE DE LA BASE D'ABORD : « 23bis »
     (collé, comme la BAN écrit ses numéros), puis le repli « 23 ». */
  expect(vues).toEqual(['23bis avenue du prophète', '23 avenue du prophète']);
});

test('UN BIS QUI EXISTE NE DÉCLENCHE AUCUN REPLI — ni second appel', async ({ page }) => {
  const vues = await espionnerBan(page);
  await chercher(page, '12 bis avenue du prophète');

  await expect(page.locator('.recherche [role="option"] .libelle').first())
    .toHaveText('12bis avenue du prophète 94420 Le Plessis-Trévise', { timeout: 10_000 });
  await expect(page.locator('.recherche .approche:not([hidden])')).toHaveCount(0);
  /* UN SEUL APPEL : les quotas publics sont un bien commun, et le second
     appel ne se justifie que par un numéro introuvable. */
  expect(vues).toEqual(['12bis avenue du prophète']);
});

test('UNE ADRESSE SANS SUFFIXE PART TELLE QUELLE — on ne réécrit pas l’inconnu', async ({ page }) => {
  const vues = await espionnerBan(page);
  await chercher(page, '23 avenue du prophète');
  await expect(page.locator('.recherche [role="option"]').first()).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.recherche .approche:not([hidden])')).toHaveCount(0);
  expect(vues).toEqual(['23 avenue du prophète']);
});
