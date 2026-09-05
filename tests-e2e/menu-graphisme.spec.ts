import { test, expect } from '@playwright/test';
import { simulerTuiles, simulerCommunes } from './tuiles-simulees';
import { ouvrirMenu } from './volets';

/* LE MENU MOINS « FORMULAIRE » (MENU-GRAPH-1, 06/09/2026). Armelin : « un
   logo de soleil jaune pour le jour et un logo jaune en forme de lune pour la
   nuit […] le logo du chien avec un volant à côté de Découvrir Maps Pro ». Le
   parcours vérifie que les pictos sont LÀ et JAUNES — une couleur se mesure —
   et que le texte, seul porteur du sens, n'a pas bougé. */

test('soleil et lune jaunes sur les thèmes, le chien au volant devant Maps Pro', async ({ page }) => {
  await simulerTuiles(page);
  await simulerCommunes(page);
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await ouvrirMenu(page);
  const choix = page.locator('.reglages-theme-choix');
  await expect(choix).toHaveCount(3);
  await expect(choix.nth(0).locator('svg.picto-theme-auto')).toHaveCount(1);
  await expect(choix.nth(1).locator('svg.picto-soleil')).toHaveCount(1);
  await expect(choix.nth(2).locator('svg.picto-lune')).toHaveCount(1);
  await expect(choix.nth(1)).toContainText('Jour');
  await expect(choix.nth(2)).toContainText('Nuit');
  const couleur = await choix.nth(1).locator('svg.picto-soleil').evaluate((e) => getComputedStyle(e).color);
  expect(couleur, 'le soleil doit être jaune').toBe('rgb(242, 178, 0)');
  const lien = page.locator('.reglages-pro-lien');
  await expect(lien).toContainText('Découvrir Maps Pro');
  await expect(lien.locator('img.reglages-pro-chien')).toHaveAttribute('src', '/icones/volant-48.png');
});
