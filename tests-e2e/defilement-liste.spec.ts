import { test, expect, type Page } from '@playwright/test';
import { simulerTuiles, simulerCommunes } from './tuiles-simulees';

/* LE DOIGT PEUT DÉFILER LA LISTE (SCROLL-1, 04/09).
 *
 * ARMELIN : « il est impossible de scroller dans cette fenêtre. Quand je
 * touche l'écran ça sélectionne directement la ligne où j'ai appuyé pour
 * tenter de scroller. »
 *
 * CES PARCOURS SONT TACTILES (hasTouch + gestes synthétisés au protocole) :
 * la leçon du clic fantôme tient toujours — un test qui clique à la souris
 * ne prouve RIEN sur le doigt. */

test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

/* Vingt restaurants : de quoi déborder l'écran et devoir défiler. */
const LIEUX = {
  elements: Array.from({ length: 20 }, (_, i) => ({
    type: 'node', id: i + 1, lat: 46.601 + i * 0.001, lon: 2.4,
    tags: { amenity: 'restaurant', name: `Restaurant n°${i + 1}` },
  })),
};

async function listerAuRail(page: Page): Promise<void> {
  await simulerTuiles(page);
  await simulerCommunes(page);
  const cors = { 'Access-Control-Allow-Origin': '*' };
  for (const motif of [
    '**/api-adresse.data.gouv.fr/**', '**/data.geopf.fr/geocodage/**',
    '**/recherche-entreprises.api.gouv.fr/**', '**/data.education.gouv.fr/**',
  ]) {
    await page.route(motif, (route) => route.fulfill({
      headers: cors, contentType: 'application/json',
      body: JSON.stringify({ features: [], results: [], elements: [] }),
    }));
  }
  await page.route('**overpass.openstreetmap.fr**', (route) => route.fulfill({
    headers: cors, contentType: 'application/json', body: JSON.stringify(LIEUX),
  }));
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await page.locator('.entete .recherche input').tap();
  await page.locator('.entete .recherche-rail').getByRole('button', { name: /Restaurants/ }).tap();
  await expect(page.locator('.entete .recherche ul[role="listbox"] li')).toHaveCount(15);
}

test('LE DOIGT QUI DÉFILE NE CHOISIT PAS — et la liste défile vraiment', async ({ page }) => {
  await listerAuRail(page);
  const liste = page.locator('.entete .recherche ul[role="listbox"]');
  const cadre = await liste.boundingBox();

  /* DE VRAIS ÉVÉNEMENTS TOUCH, PAS UN GESTE SYNTHÉTIQUE. Premier essai :
     `Input.synthesizeScrollGesture` — la contre-épreuve a alors PASSÉ avec
     l'ancien code : ce geste-là scrolle sans délivrer de pointerdown à la
     page, il ne prouvait rien. `dispatchTouchEvent` suit le chemin du vrai
     doigt : touchStart → pointerdown, mouvements → défilement natif +
     pointercancel, levé. C'est LUI qui fait échouer l'ancien code. */
  const cdp = await page.context().newCDPSession(page);
  const x = Math.round(cadre!.x + cadre!.width / 2);
  const y0 = Math.round(cadre!.y + cadre!.height / 2);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart', touchPoints: [{ x, y: y0 }],
  });
  for (let k = 1; k <= 8; k += 1) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove', touchPoints: [{ x, y: y0 - k * 30 }],
    });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(300);

  /* Rien n'a été choisi : la page de recherche est toujours là… */
  await expect(page.locator('body')).toHaveClass(/recherche-ouverte/);
  /* …et la liste a réellement défilé. */
  const defile = await liste.evaluate((e) => e.scrollTop);
  expect(defile, 'la liste doit avoir défilé sous le doigt').toBeGreaterThan(0);
});

test('LE TAPOTEMENT, LUI, CHOISIT TOUJOURS', async ({ page }) => {
  await listerAuRail(page);
  await page.locator('.entete .recherche ul[role="listbox"] li').first().tap();
  await expect(page.locator('.entete .recherche input')).toHaveValue('Restaurant n°1');
  await expect(page.locator('body')).not.toHaveClass(/recherche-ouverte/);
});
