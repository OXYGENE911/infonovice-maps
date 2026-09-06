import { test, expect, type Page } from '@playwright/test';
import { simulerTuiles, simulerCommunes } from './tuiles-simulees';

/* LE FOND DE CARTE PENDANT LE SUIVI (FOND-NAV-1, 05/09/2026).
 *
 * Les amis d'Armelin : « en mode navigation, il n'y a pas une petite pastille
 * ronde permettant de gérer les calques/fonds de carte, car cette option
 * n'est disponible que dans le menu, masqué pendant la navigation. » NAV-2
 * efface le menu en suivi ; un bouton rond de la colonne de droite ouvre une
 * feuille où le MÊME sélecteur vient se poser, et le rend au menu en se
 * refermant — une seule vérité sur le fond. */

const TRACE: [number, number][] = Array.from({ length: 21 }, (_, i) => [2.3400 + i * 0.0014, 48.8500]);

async function suivre(page: Page): Promise<void> {
  await simulerTuiles(page);
  await simulerCommunes(page);
  await page.context().grantPermissions(['geolocation']);
  await page.context().setGeolocation({ longitude: TRACE[0]![0], latitude: TRACE[0]![1] });
  await page.route('**/data.geopf.fr/navigation/itineraire**', (route) => {
    if (/resource=bdtopo-pgr/.test(route.request().url())) {
      return route.fulfill({ contentType: 'application/json', body: '{"portions":[]}' });
    }
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({
      geometry: { type: 'LineString', coordinates: TRACE }, distance: 2_050, duration: 240,
    }) });
  });
  await page.route('**overpass.openstreetmap.fr**', (route) => route.fulfill({
    contentType: 'application/json', body: '{"elements":[]}',
  }));
  await page.route('**/www.bison-fute.gouv.fr/**', (route) => route.fulfill({
    contentType: 'application/json', body: '[]',
  }));
  await page.goto(`/#iti=${TRACE[0]![0]},${TRACE[0]![1]};${TRACE[20]![0]},${TRACE[20]![1]};car`);
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
}

test('EN SUIVI, UN BOUTON ROND OUVRE LES FONDS ; hors suivi il n’existe pas, et le sélecteur revient au menu', async ({ page }) => {
  await suivre(page);
  const bouton = page.locator('.fonds-nav');
  // Hors suivi : le menu suffit, le bouton ne prend pas de place.
  await expect(bouton).toBeHidden();
  await expect(page.locator('.reglages-corps .fonds')).toHaveCount(1);

  await page.getByRole('button', { name: 'Démarrer le suivi' }).click();
  await expect(page.locator('bandeau-guidage')).toBeVisible({ timeout: 15_000 });
  await expect(bouton).toBeVisible();
  const feuille = page.locator('.fonds-nav-feuille');
  await expect(feuille).toBeHidden();

  await bouton.click();
  await expect(feuille).toBeVisible();
  await expect(bouton).toHaveAttribute('aria-expanded', 'true');
  // Le sélecteur a DÉMÉNAGÉ, il n'a pas été copié : le menu n'en a plus.
  await expect(feuille.locator('input[name="fond"]')).toHaveCount(3);
  // LA FEUILLE EST À SA TAILLE (RETOURS-0609) : le choix des fonds est dans le flux, rien ne défile dans un timbre-poste.
  const boite = (await feuille.boundingBox())!;
  const choix = (await feuille.locator('details.fonds fieldset').boundingBox())!;
  expect(boite.height, 'la feuille ne contient pas le choix des fonds').toBeGreaterThan(choix.height);
  expect(await feuille.evaluate((e) => e.scrollHeight - e.clientHeight)).toBeLessThan(2);
  await expect(page.locator('.reglages-corps .fonds')).toHaveCount(0);

  // Choisir la photo aérienne change bien le fond de la carte.
  await feuille.locator('label:has(input[value="ortho"])').click();
  await expect.poll(() => page.evaluate(() =>
    (window as unknown as { __carte: { getLayer(id: string): unknown } }).__carte.getLayer('fond-ortho') !== undefined),
  { timeout: 10_000 }).toBe(true);

  await feuille.getByRole('button', { name: 'Fermer' }).click();
  await expect(feuille).toBeHidden();
  await expect(page.locator('.reglages-corps .fonds')).toHaveCount(1);

  // À l'arrêt du suivi, le bouton disparaît, le menu a toujours son sélecteur.
  await bouton.click();
  await expect(feuille).toBeVisible();
  await page.locator('.bg-arreter').click();
  await expect(feuille).toBeHidden();
  await expect(bouton).toBeHidden();
  await expect(page.locator('.reglages-corps .fonds input[value="ortho"]')).toBeChecked();
});
