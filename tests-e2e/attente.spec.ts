import { test, expect } from '@playwright/test';
import { simulerTuiles, simulerCommunes } from './tuiles-simulees';

/* LE CHIEN DE L'ATTENTE (ATTENTE-1, 06/09/2026). Armelin : « la navigation se
   lance et se fige aussitôt quelques secondes […] on a l'impression que
   l'application a planté ». La feuille de route (IGN) est simulée LENTE : le
   chien doit paraître pendant l'attente et disparaître au départ du suivi. */

const TRACE: [number, number][] = Array.from({ length: 21 }, (_, i) => [2.3400 + i * 0.0014, 48.8500]);

test('LE CHIEN PARAÎT PENDANT LA PRÉPARATION DU SUIVI, et s’efface au départ', async ({ page, context }) => {
  await simulerTuiles(page);
  await simulerCommunes(page);
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ longitude: TRACE[0]![0], latitude: TRACE[0]![1] });
  await page.route('**/data.geopf.fr/navigation/itineraire**', async (route) => {
    const url = route.request().url();
    if (/resource=bdtopo-pgr/.test(url)) {
      return route.fulfill({ contentType: 'application/json', body: '{"portions":[]}' });
    }
    // La feuille de route (getSteps) met deux secondes : c'est ELLE que le chien couvre.
    if (/getSteps=true/.test(url)) await new Promise((ok) => { setTimeout(ok, 2000); });
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({
      geometry: { type: 'LineString', coordinates: TRACE }, distance: 2_050, duration: 240,
    }) });
  });
  await page.route('**overpass.openstreetmap.fr**', (route) => route.fulfill({ contentType: 'application/json', body: '{"elements":[]}' }));
  await page.route('**/www.bison-fute.gouv.fr/**', (route) => route.fulfill({ contentType: 'application/json', body: '[]' }));
  await page.goto(`/#iti=${TRACE[0]![0]},${TRACE[0]![1]};${TRACE[20]![0]},${TRACE[20]![1]};car`);
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.iti-resultat')).toContainText('km', { timeout: 15_000 });

  const chien = page.locator('attente-chien');
  await expect(chien).toBeHidden();
  await page.getByRole('button', { name: 'Démarrer le suivi' }).click();
  await expect(chien).toBeVisible();
  await expect(chien).toContainText('Préparation du suivi');
  await expect(chien.locator('img')).toHaveAttribute('src', '/icones/volant-192.png');
  await expect(page.locator('bandeau-guidage')).toBeVisible({ timeout: 15_000 });
  await expect(chien).toBeHidden();
  // Le mode se lit dans la barre dépliée.
  await page.getByRole('button', { name: 'Afficher les commandes du suivi' }).click();
  await expect(page.locator('.bg-mode')).toHaveText('Mode : Voiture');
});
