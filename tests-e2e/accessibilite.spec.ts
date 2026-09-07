import { test, expect } from '@playwright/test';
import { simulerTuiles, simulerCommunes } from './tuiles-simulees';
import { ouvrirPlanificateur } from './planificateur';

/* LES NOMS ACCESSIBLES DISENT LA FONCTION (AUDIT-1, 06/09/2026). L'audit
   Codex : « les trois combobox visibles portent le même nom accessible » et
   « le nom accessible de la carte indique des boutons de zoom en haut à
   droite alors que les commandes sont en bas à droite ». Un lecteur d'écran
   lit ce qu'on écrit : on écrit la vérité. */

test('la recherche, le départ et l’arrivée ont chacun leur nom ; la carte dit où sont ses commandes', async ({ page }) => {
  await simulerTuiles(page);
  await simulerCommunes(page);
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await ouvrirPlanificateur(page);
  await expect(page.getByRole('combobox', { name: 'Rechercher une adresse en France' })).toHaveCount(1);
  await expect(page.getByRole('combobox', { name: 'Adresse de départ' })).toHaveCount(1);
  await expect(page.getByRole('combobox', { name: 'Adresse d’arrivée' })).toHaveCount(1);
  const carte = await page.locator('#carte').getAttribute('aria-label');
  expect(carte).toContain('en bas à droite');
  expect(carte).not.toContain('Zoomer, Dézoomer');
});

test('LE BOUTON D’INSTALLATION N’ÉCRASE PLUS LE CHAMP DE RECHERCHE (A11Y-CIBLE-1)', async ({ page }) => {
  /* Mesuré par Lighthouse le 07/09, sur son écran de référence de 412 px —
     le seul audit d'accessibilité en échec : « Target has insufficient size
     (22px by 34px, should be at least 24px by 24px) ». Le bouton
     « Installer l'application » ne se contentait pas de serrer le champ, il
     le RECOUVRAIT : champ 123–145, bouton 131–271. La règle qui fait céder
     la marque existait, mais sous 400 px — et le défaut vivait juste
     au-dessus. */
  await page.setViewportSize({ width: 412, height: 823 });
  await simulerTuiles(page);
  await simulerCommunes(page);
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });

  // Le navigateur propose l'installation : c'est le seul moment où le défaut paraît.
  await page.evaluate(() => { window.dispatchEvent(new Event('beforeinstallprompt')); });
  await expect(page.locator('.installer')).toBeVisible();

  const champ = (await page.locator('.entete recherche-adresse input').boundingBox())!;
  const bouton = (await page.locator('.installer').boundingBox())!;
  expect(Math.round(champ.width), `champ large de ${Math.round(champ.width)} px`).toBeGreaterThanOrEqual(24);
  expect(Math.round(champ.height)).toBeGreaterThanOrEqual(24);
  /* ET ILS NE SE TOUCHENT PAS : une cible tactile recouverte est pire qu'une
     petite — le doigt tombe sur le voisin sans que rien ne le dise. */
  expect(Math.round(champ.x + champ.width), 'le bouton recouvre le champ')
    .toBeLessThanOrEqual(Math.round(bouton.x));
});
