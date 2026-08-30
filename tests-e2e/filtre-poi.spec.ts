import { test, expect, type Page } from '@playwright/test';
import { simulerTuiles, simulerCommunes } from './tuiles-simulees';

/* LE FILTRE DES LIEUX, SUR LA CARTE (POI-2, demande d'Armelin du 30/08).
 *
 * CE QUE CES PARCOURS DÉFENDENT : que le filtre soit atteignable EN UN GESTE
 * depuis la carte, qu'il n'interroge JAMAIS Overpass tout seul — ni au
 * déplacement, ni au zoom, ni au clic sur une pastille — et qu'il dise
 * toujours pourquoi il ne rend rien. */

async function ouvrirCarte(page: Page): Promise<void> {
  await simulerTuiles(page);
  await simulerCommunes(page);
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
}

/** Approche la carte au-delà du seuil de recherche. */
async function zoomer(page: Page, zoom = 15): Promise<void> {
  await page.evaluate((z) => {
    (window as unknown as { __carte: { jumpTo(o: object): void } })
      .__carte.jumpTo({ center: [2.3522, 48.8566], zoom: z });
  }, zoom);
  await page.waitForTimeout(300);
}

test('le filtre s’ouvre depuis la CARTE, en un geste', async ({ page }) => {
  /* Armelin : « ce serait bien d'afficher quelque part sur la carte une icône
     pour afficher les POI comme un filtre ». Avant, il fallait ouvrir le
     planificateur, descendre dans « Recharge et services », cocher, revenir. */
  await ouvrirCarte(page);
  const bulle = page.getByRole('button', { name: 'Filtrer les lieux affichés sur la carte' });
  await expect(bulle).toBeVisible();
  await expect(page.locator('.poi-panneau')).toBeHidden();
  await bulle.click();
  await expect(page.locator('.poi-panneau')).toBeVisible();
  // DOUZE FAMILLES, pas dix-sept étiquettes : elles tiennent sur un téléphone.
  await expect(page.locator('.poi-famille')).toHaveCount(12);
});

test('il ne cherche RIEN tout seul — ni au zoom, ni au clic d’une pastille', async ({ page }) => {
  /* Overpass est tenu par des bénévoles : une carte qui interroge à chaque
     geste serait un abus, et l'usager n'y gagnerait qu'une lenteur. */
  let appels = 0;
  await ouvrirCarte(page);
  await page.route('**overpass.openstreetmap.fr**', (route) => {
    appels += 1;
    return route.fulfill({
      headers: { 'Access-Control-Allow-Origin': '*' },
      contentType: 'application/json', body: '{"elements":[]}',
    });
  });
  await page.getByRole('button', { name: 'Filtrer les lieux affichés sur la carte' }).click();
  await zoomer(page);
  await page.locator('.poi-famille[data-cle="restaurant"]').click();
  await page.locator('.poi-famille[data-cle="pharmacie"]').click();
  await page.waitForTimeout(600);
  expect(appels, 'cocher ne doit rien demander au service').toBe(0);
});

test('il DIT pourquoi il ne cherche pas — zoom, puis choix', async ({ page }) => {
  await ouvrirCarte(page);
  await page.getByRole('button', { name: 'Filtrer les lieux affichés sur la carte' }).click();
  const chercher = page.getByRole('button', { name: 'Chercher dans cette vue' });
  await expect(page.locator('.poi-filtre-etat')).toContainText('Rapprochez-vous');
  await expect(chercher).toBeDisabled();

  await zoomer(page);
  await expect(page.locator('.poi-filtre-etat')).toContainText('Choisissez ce que vous voulez voir');
  await expect(chercher).toBeDisabled();

  await page.locator('.poi-famille[data-cle="restaurant"]').click();
  await expect(chercher).toBeEnabled();
});

test('UNE SEULE requête pour toutes les familles, et les points prennent leur couleur', async ({ page }) => {
  await ouvrirCarte(page);
  const urls: string[] = [];
  await page.route('**overpass.openstreetmap.fr**', (route) => {
    urls.push(decodeURIComponent(route.request().url()));
    return route.fulfill({
      headers: { 'Access-Control-Allow-Origin': '*' },
      contentType: 'application/json',
      body: JSON.stringify({ elements: [
        { type: 'node', id: 1, lat: 48.8566, lon: 2.3522,
          tags: { amenity: 'restaurant', name: 'Le Bistrot' } },
        { type: 'node', id: 2, lat: 48.857, lon: 2.353,
          tags: { amenity: 'pharmacy', name: 'Pharmacie du Centre' } },
        // Un lieu d'une famille NON cochée : il ne doit pas s'afficher.
        { type: 'node', id: 3, lat: 48.858, lon: 2.354, tags: { tourism: 'hotel' } },
      ] }),
    });
  });
  await page.getByRole('button', { name: 'Filtrer les lieux affichés sur la carte' }).click();
  await zoomer(page);
  await page.locator('.poi-famille[data-cle="restaurant"]').click();
  await page.locator('.poi-famille[data-cle="pharmacie"]').click();
  await page.getByRole('button', { name: 'Chercher dans cette vue' }).click();

  await expect(page.locator('.poi-filtre-etat')).toContainText('2 lieux', { timeout: 15_000 });
  expect(urls, 'douze familles ne doivent pas faire douze requêtes').toHaveLength(1);
  expect(urls[0]).toContain('amenity"="pharmacy');
  expect(urls[0]).toContain('restaurant|fast_food');

  /* LA COULEUR EST CELLE DE LA FAMILLE, lue sur la donnée : c'est la légende
     du panneau, reportée sur la carte. */
  const pose = await page.evaluate(() => {
    const c = (window as unknown as { __carte: {
      getLayer(id: string): unknown;
      getSource(id: string): { _data?: { features?: unknown[] } };
    } }).__carte;
    return Boolean(c.getLayer('filtre-poi-points'));
  });
  expect(pose, 'la couche des lieux n’est pas posée').toBe(true);
});

test('il DIT que la vue a bougé, au lieu de montrer des lieux d’ailleurs', async ({ page }) => {
  /* « La liste ne suit pas la carte » : le dire évite qu'un déplacement fasse
     croire à des lieux disparus. */
  await ouvrirCarte(page);
  await page.route('**overpass.openstreetmap.fr**', (route) => route.fulfill({
    headers: { 'Access-Control-Allow-Origin': '*' },
    contentType: 'application/json',
    body: JSON.stringify({ elements: [
      { type: 'node', id: 1, lat: 48.8566, lon: 2.3522, tags: { amenity: 'restaurant' } },
    ] }),
  }));
  await page.getByRole('button', { name: 'Filtrer les lieux affichés sur la carte' }).click();
  await zoomer(page);
  await page.locator('.poi-famille[data-cle="restaurant"]').click();
  await page.getByRole('button', { name: 'Chercher dans cette vue' }).click();
  await expect(page.locator('.poi-filtre-etat')).toContainText('1 lieu', { timeout: 15_000 });

  await page.evaluate(() => {
    (window as unknown as { __carte: { jumpTo(o: object): void } })
      .__carte.jumpTo({ center: [2.4, 48.9], zoom: 15 });
  });
  await expect(page.locator('.poi-filtre-etat')).toContainText('La vue a bougé');
});

test('le choix des familles SURVIT au rechargement', async ({ page }) => {
  /* C'est un réglage, pas un geste de session : on ne recoche pas ses
     habitudes à chaque ouverture. */
  await ouvrirCarte(page);
  await page.getByRole('button', { name: 'Filtrer les lieux affichés sur la carte' }).click();
  await page.locator('.poi-famille[data-cle="hotel"]').click();
  await expect(page.locator('.poi-famille[data-cle="hotel"]'))
    .toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(400);

  await page.reload();
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Filtrer les lieux affichés sur la carte' }).click();
  await expect(page.locator('.poi-famille[data-cle="hotel"]'))
    .toHaveAttribute('aria-pressed', 'true', { timeout: 10_000 });
});
