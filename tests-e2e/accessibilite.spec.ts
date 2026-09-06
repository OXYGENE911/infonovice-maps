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
