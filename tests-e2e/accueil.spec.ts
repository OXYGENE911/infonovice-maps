import { test, expect } from '@playwright/test';

// Depuis la PR #2, la page EST la carte : on vérifie que MapLibre s'amorce,
// que les contrôles parlent français, et que la souveraineté tient.

test('la carte s’amorce : canevas présent, contrôles en français', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Infonovice Maps/);
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Zoomer', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Me localiser' })).toBeVisible();
  // L'attribution IGN est une obligation de la Géoplateforme, pas un ornement.
  await expect(page.locator('.maplibregl-ctrl-attrib')).toContainText('IGN');
});

test('SOUVERAINETÉ : seules les origines déclarées sont contactées', async ({ page }) => {
  // La contrainte n° 3 du projet, mesurée au navigateur. La liste blanche
  // s'élargit par PR, jamais par accident : data.geopf.fr est arrivée avec
  // la carte (PR #2).
  const AUTORISEES = new Set(['localhost', 'data.geopf.fr']);
  const intrus: string[] = [];
  page.on('request', (r) => {
    const h = new URL(r.url()).hostname;
    if (!AUTORISEES.has(h)) intrus.push(h);
  });
  await page.goto('/');
  await page.locator('#carte canvas.maplibregl-canvas').waitFor({ timeout: 15_000 });
  await page.waitForTimeout(2500); // le temps que les tuiles partent
  expect([...new Set(intrus)], `origines non déclarées : ${intrus.join(', ')}`).toHaveLength(0);
});

test('des tuiles IGN sont réellement demandées et servies', async ({ page }) => {
  const tuiles: number[] = [];
  page.on('response', (r) => {
    if (r.url().includes('data.geopf.fr/wmts') && r.url().includes('GetTile')) tuiles.push(r.status());
  });
  await page.goto('/');
  await page.locator('#carte canvas.maplibregl-canvas').waitFor({ timeout: 15_000 });
  await expect.poll(() => tuiles.length, { timeout: 15_000 }).toBeGreaterThan(3);
  expect(tuiles.filter((s) => s === 200).length, 'aucune tuile servie en 200').toBeGreaterThan(0);
});
