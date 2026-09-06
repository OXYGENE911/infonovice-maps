import { test, expect } from '@playwright/test';
import { simulerTuiles, simulerCommunes } from './tuiles-simulees';
import { ouvrirReglagesBornes } from './volets';

/* LE MOT VIVANT DU SEUIL (ZOOM-MOTS-2, 06/09). Armelin : « il est indiqué que
   certaines informations seront visibles qu'à partir d'un zoom 12 ou zoom 15.
   Cela ne veut rien dire, il n'y a aucune indication du niveau de zoom sur la
   carte. » ZOOM-MOTS-1 a réécrit les seuils avec la barre d'échelle ; ce
   parcours vérifie qu'une ligne DIT, avec la barre d'échelle telle qu'elle est
   écrite, de quel côté du seuil on est — et qu'elle change quand on zoome. */

test('la ligne du seuil lit la barre d’échelle et suit le zoom', async ({ page }) => {
  await simulerTuiles(page);
  await simulerCommunes(page);
  await page.route('**/public.opendatasoft.com/**', (route) => {
    if (route.request().url().includes('/exports/json')) {
      return route.fulfill({ contentType: 'application/json', body: '[]' });
    }
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ total_count: 0, results: [] }) });
  });
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await ouvrirReglagesBornes(page);
  await page.getByRole('checkbox', { name: 'Bornes électriques' }).check();

  const ligne = page.locator('.poi-seuil-vue');
  // Vue France (zoom 5,4) : éloignée, et la barre d'échelle est CITÉE telle quelle.
  await expect(ligne).toContainText('Carte éloignée');
  await expect(ligne).toContainText('Rapprochez encore');
  const barre = (await page.locator('.maplibregl-ctrl-scale').textContent())!.trim();
  expect(barre, 'la barre d’échelle doit être écrite').toMatch(/\d+\s?k?m/);
  await expect(ligne).toContainText(`barre d’échelle : ${barre}`);

  // Paris au zoom 13 : rapprochée, la nouvelle barre d'échelle citée.
  await page.evaluate(() => {
    (window as unknown as { __carte: { jumpTo(o: object): void } })
      .__carte.jumpTo({ center: [2.3522, 48.8566], zoom: 13 });
  });
  await expect(ligne).toContainText('Carte rapprochée', { timeout: 5_000 });
  const barre2 = (await page.locator('.maplibregl-ctrl-scale').textContent())!.trim();
  expect(barre2).not.toBe(barre);
  await expect(ligne).toContainText(`barre d’échelle : ${barre2}`);

  // Et retour au large : la ligne redevient « éloignée ».
  await page.evaluate(() => {
    (window as unknown as { __carte: { jumpTo(o: object): void } }).__carte.jumpTo({ zoom: 8 });
  });
  await expect(ligne).toContainText('Carte éloignée', { timeout: 5_000 });
});
