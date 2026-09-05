import { test, expect } from '@playwright/test';
import { simulerTuiles, simulerCommunes } from './tuiles-simulees';
import { ouvrirMenu } from './volets';

/* LES TROIS PORTES VERS MAPS PRO (PRO-LIENS-1, 05/09/2026).
 *
 * ARMELIN : « un lieu dans le menu indiquant un bouton Maps Pro qui emmène
 * vers la landing page », « pouvoir cliquer sur le logo Infonovice Maps en
 * haut à gauche », et, en fin de trajet, « Le trajet vous a plu ? Débloquez
 * d'autres fonctionnalités » (ce dernier vit dans bilan-trajet.spec).
 *
 * UNE ADRESSE STABLE, /pro.html : la destination réelle peut déménager
 * (hébergement provisoire aujourd'hui, pro.maps.infonovice.fr demain), une
 * seule ligne change, jamais l'application. Et la page se lit SANS script. */

test('LA MARQUE ET LE MENU MÈNENT À /pro.html', async ({ page }) => {
  await simulerTuiles(page);
  await simulerCommunes(page);
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });

  const marque = page.locator('.entete-marque');
  await expect(marque).toBeVisible();
  await expect(marque).toHaveAttribute('href', '/pro.html');
  await expect(marque).toContainText('Infonovice');

  await ouvrirMenu(page);
  /* La ligne vit dans la boîte de la version, tout en bas du menu : une
     section à part faisait déborder la fenêtre sous les polices de la CI. */
  const lien = page.locator('.reglages-pro-lien');
  await expect(lien).toBeVisible();
  await expect(lien).toHaveAttribute('href', '/pro.html');
  await expect(lien).toHaveText('Découvrir Maps Pro');
});

test('LA PASSERELLE /pro.html SE LIT SANS SCRIPT et porte le lien vers le site Pro', async ({ browser }) => {
  const contexte = await browser.newContext({ javaScriptEnabled: false });
  const page = await contexte.newPage();
  const reponse = await page.goto('/pro.html');
  expect(reponse?.status()).toBe(200);
  await expect(page.locator('h1')).toHaveText('Maps Pro');
  const lien = page.locator('.page-action a');
  await expect(lien).toBeVisible();
  await expect(lien).toHaveAttribute('href', /^https:\/\//);
  await expect(page.locator('.page-retour')).toHaveAttribute('href', '/');
  await contexte.close();
});
