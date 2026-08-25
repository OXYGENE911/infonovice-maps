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

/* LES ÉCLAIRS DE PUISSANCE — un à trois selon le palier. Les icônes sont
   DESSINÉES au démarrage sur un canevas : aucun binaire au dépôt, mais aussi
   aucune garantie qu'elles existent si le contexte 2D échoue. On vérifie donc
   qu'elles sont bien enregistrées, et que chaque borne porte le bon palier. */
test('les quatre pastilles de puissance sont dessinées et posées', async ({ page }) => {
  await espionnerIrve(page);
  await ouvrirBornes(page);

  const images = await page.evaluate(() => {
    const c = (window as unknown as { __carte: { hasImage(n: string): boolean } }).__carte;
    return ['borne-1', 'borne-2', 'borne-3', 'borne-inconnue'].map((n) => c.hasImage(n));
  });
  expect(images, 'une pastille manquante laisserait des bornes invisibles').toEqual(
    [true, true, true, true]);
});

test('chaque borne porte le palier de SA puissance, frontières comprises', async ({ page }) => {
  // Fixture au format réel, calibrée sur les BORNES des intervalles : 50 kW
  // est « lent », 150 « rapide », 151 « très rapide ». C'est là que se logent
  // les erreurs d'un cran, invisibles à l'œil sur une carte.
  await page.route(IRVE, (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ total_count: 4, results: [
      { point_geo: { lon: 2.35, lat: 48.856 }, nom_station: 'Lente', puissance_nominale: 50 },
      { point_geo: { lon: 2.352, lat: 48.857 }, nom_station: 'Rapide', puissance_nominale: 150 },
      { point_geo: { lon: 2.354, lat: 48.858 }, nom_station: 'Très rapide', puissance_nominale: 151 },
      { point_geo: { lon: 2.356, lat: 48.859 }, nom_station: 'Inconnue' },
    ] }),
  }));
  await ouvrirBornes(page);

  const paliers = await page.evaluate(async () => {
    const c = (window as unknown as {
      __carte: { getSource(id: string): { getData(): unknown } | undefined };
    }).__carte;
    const d = await c.getSource('poi-bornes')?.getData() as GeoJSON.FeatureCollection | undefined;
    return (d?.features ?? []).map((f) => [f.properties?.['nom'], f.properties?.['icone']]);
  });

  expect(paliers).toEqual([
    ['Lente', 'borne-1'],
    ['Rapide', 'borne-2'],
    ['Très rapide', 'borne-3'],
    ['Inconnue', 'borne-inconnue'],
  ]);
});
