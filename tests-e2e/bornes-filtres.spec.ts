import { test, expect } from '@playwright/test';
import { simulerTuiles, simulerCommunes } from './tuiles-simulees';

/* FILTRES DES BORNES — ce qui compte n'est pas ce que l'interface affiche,
   c'est CE QUI PART DANS LA REQUÊTE. Le portail plafonne à 100
   enregistrements : un filtre appliqué localement trierait un ensemble déjà
   tronqué et montrerait trois bornes CCS là où la zone en compte cinquante.
   Ces parcours lisent donc l'URL réellement émise. */

const IRVE = '**/public.opendatasoft.com/**';

test.beforeEach(async ({ page }) => {
  await simulerTuiles(page);
  await simulerCommunes(page);
});

/** Capture les URL IRVE émises, et répond une collection vide pour ne pas
 *  dépendre du portail — ni le marteler depuis la CI. */
async function espionnerIrve(page: import('@playwright/test').Page): Promise<string[]> {
  const vues: string[] = [];
  await page.route(IRVE, (route) => {
    vues.push(decodeURIComponent(route.request().url()));
    return route.fulfill({ contentType: 'application/json',
      body: JSON.stringify({ total_count: 0, results: [] }) });
  });
  return vues;
}

async function ouvrirBornes(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  /* LES POI NE SE CHARGENT QU'AU ZOOM 12 — frugalité assumée depuis la PR #9.
     Sans ce saut, aucune requête ne part et le parcours mesurerait le vide. */
  await page.evaluate(() => {
    (window as unknown as { __carte: { jumpTo(o: object): void } })
      .__carte.jumpTo({ center: [2.3522, 48.8566], zoom: 13 });
  });
  await page.locator('.maplibregl-ctrl-top-left summary').filter({ hasText: 'Autour' }).click();
  await page.getByRole('checkbox', { name: 'Bornes électriques' }).check();
}

test('les filtres ne paraissent qu’une fois la couche des bornes active', async ({ page }) => {
  await espionnerIrve(page);
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await page.locator('.maplibregl-ctrl-top-left summary').filter({ hasText: 'Autour' }).click();

  const filtres = page.locator('.poi-filtres');
  await expect(filtres, 'des réglages sans objet encombrent').toBeHidden();

  await page.getByRole('checkbox', { name: 'Bornes électriques' }).check();
  await expect(filtres).toBeVisible();
  await expect(page.getByLabel('Puissance minimale des bornes')).toBeVisible();
  for (const nom of ['CCS Combo', 'Type 2', 'CHAdeMO', 'Prise domestique']) {
    await expect(page.getByRole('checkbox', { name: nom })).toBeVisible();
  }
});

test('la puissance choisie PART DANS LA REQUÊTE, elle ne trie pas l’acquis', async ({ page }) => {
  const vues = await espionnerIrve(page);
  await ouvrirBornes(page);

  await page.getByLabel('Puissance minimale des bornes').selectOption('150');
  await expect.poll(() => vues.some((u) => u.includes('puissance_nominale >= 150')),
    { message: 'la puissance n’est pas partie au service' }).toBe(true);
});

test('les connecteurs partent en OU — un véhicule accepte l’un OU l’autre', async ({ page }) => {
  const vues = await espionnerIrve(page);
  await ouvrirBornes(page);

  await page.getByRole('checkbox', { name: 'CCS Combo' }).check();
  await page.getByRole('checkbox', { name: 'CHAdeMO' }).check();

  await expect.poll(() => vues.some((u) =>
    u.includes('prise_type_combo_ccs = "1"') && u.includes('prise_type_chademo = "1"')
    && u.includes('OR')), { message: 'les connecteurs ne sont pas partis en OU' }).toBe(true);
});

test('sans filtre, aucune clause parasite ne part', async ({ page }) => {
  const vues = await espionnerIrve(page);
  await ouvrirBornes(page);

  await expect.poll(() => vues.length).toBeGreaterThan(0);
  const premiere = vues.find((u) => u.includes('mobilityref-france-irve'));
  expect(premiere, 'aucune requête IRVE émise').toBeTruthy();
  expect(premiere).toContain('in_bbox(point_geo');
  expect(premiere, 'une clause vide fausse la requête').not.toContain(' AND ');
});
