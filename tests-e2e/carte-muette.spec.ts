import { test, expect } from '@playwright/test';
import { simulerTuiles, simulerCommunes } from './tuiles-simulees';

/* LA CARTE QUI SE TAIT SANS PRÉVENIR (RETOUR-0409).
 *
 * Armelin, capture à l'appui : « à la fin d'un trajet, j'ai une page blanche
 * qui s'affiche. Impossible de faire revenir la carte, il faut rafraîchir la
 * fenêtre ». BLANC-1 ne couvrait que la perte de contexte WebGL (canevas
 * noir, événement dédié). Ici le canevas est BLANC, l'interface vit, aucune
 * exception, aucun événement. La cause n'est pas reproduite ; le chien de
 * garde, lui, l'est : un style disparu se dit dans les cinq secondes, avec
 * la porte de sortie. */

test('UN STYLE DISPARU SE DIT DANS LES CINQ SECONDES — et le bandeau se ferme ou recharge', async ({ page }) => {
  await simulerTuiles(page);
  await simulerCommunes(page);
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  const bandeau = page.locator('.carte-muette');
  await expect(bandeau).toBeHidden();
  /* Ce que MapLibre fait à la perte du contexte — `this.style = null`,
     `getStyle()` rend undefined — sans l'événement qui va avec. */
  await page.evaluate(() => {
    (window as unknown as { __carte: { getStyle: () => unknown } }).__carte.getStyle = () => undefined;
  });
  await expect(bandeau).toBeVisible({ timeout: 8_000 });
  await expect(bandeau).toContainText('ne se dessine plus');
  await expect(bandeau.getByRole('button', { name: 'Recharger la carte' })).toBeVisible();
  // Refermable : un réseau lent n'est pas une casse, l'usager tranche.
  await bandeau.getByRole('button', { name: 'Fermer cet avertissement' }).click();
  await expect(bandeau).toBeHidden();
});

test('LE BOUTON RECHARGE LA PAGE', async ({ page }) => {
  await simulerTuiles(page);
  await simulerCommunes(page);
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await page.evaluate(() => {
    (window as unknown as { __carte: { getStyle: () => unknown } }).__carte.getStyle = () => undefined;
  });
  const bouton = page.locator('.carte-muette').getByRole('button', { name: 'Recharger la carte' });
  await expect(bouton).toBeVisible({ timeout: 8_000 });
  const recharge = page.waitForEvent('load');
  await bouton.click();
  await recharge;
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
});
