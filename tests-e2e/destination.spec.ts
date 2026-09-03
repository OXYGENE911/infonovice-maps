import { test, expect, type Page } from '@playwright/test';
import { simulerTuiles, simulerCommunes } from './tuiles-simulees';

/* LA FICHE DE DESTINATION SE RANGE, ET LA CARTE Y VA (DEST-1, 03/09).
 *
 * DEUX RETOURS D'ARMELIN EN 1.68, une même histoire :
 *
 *   « Je valide une adresse et la carte zoome brièvement et dézoome aussitôt
 *   en restant sur ma position, sans aller sur le lieu sélectionné. Il faut
 *   dézoomer manuellement pour s'apercevoir qu'une fenêtre s'est ouverte
 *   quelque part dans la carte. »
 *
 *   « La fiche apparaît en gros plan et masque la destination. On est obligé
 *   de fermer la fenêtre pour voir la carte et retaper l'adresse pour faire
 *   réapparaître la fiche. On devrait pouvoir réduire la fenêtre au niveau du
 *   pointeur et la faire réapparaître en recliquant sur le point. »
 *
 * LA CAUSE DU PREMIER : le suivi GPS verrouille la caméra, et un `flyTo`
 * programmatique ne casse PAS ce verrou — MapLibre ne le lève que sur un
 * geste de l'usager. Chaque relevé GPS rabattait donc la carte sur la
 * position, et le vol avortait. */

const DEST = { lon: 4.8357, lat: 45.764 };

async function ouvrir(page: Page): Promise<void> {
  await simulerTuiles(page);
  await simulerCommunes(page);
  const cors = { 'Access-Control-Allow-Origin': '*' };
  await page.route('**/api-adresse.data.gouv.fr/search/**', (route) => route.fulfill({
    headers: cors, contentType: 'application/json',
    body: JSON.stringify({ features: [{
      geometry: { coordinates: [DEST.lon, DEST.lat] },
      properties: { label: 'Lyon', type: 'municipality', postcode: '69000', city: 'Lyon', score: 0.95 },
    }] }),
  }));
  for (const motif of ['**/data.geopf.fr/geocodage/**', '**/recherche-entreprises.api.gouv.fr/**',
    '**overpass.openstreetmap.fr**', '**/data.education.gouv.fr/**']) {
    await page.route(motif, (route) => route.fulfill({
      headers: cors, contentType: 'application/json',
      body: JSON.stringify({ features: [], results: [], elements: [] }),
    }));
  }
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
}

async function choisirLyon(page: Page): Promise<void> {
  const champ = page.locator('.entete .recherche input');
  await champ.click();
  await champ.fill('lyon');
  await page.getByRole('option', { name: 'Lyon' }).first().click();
  await expect(page.locator('.fiche-destination')).toBeVisible({ timeout: 10_000 });
}

const centreDe = (page: Page): Promise<{ lon: number; lat: number }> => page.evaluate(() => {
  const c = (window as unknown as { __carte: { getCenter(): { lng: number; lat: number } } })
    .__carte.getCenter();
  return { lon: c.lng, lat: c.lat };
});

test('LA CARTE VA À LA DESTINATION, même le suivi GPS enclenché', async ({ page, context }) => {
  /* LE SCÉNARIO EXACT D'ARMELIN : localisation active, puis une recherche. */
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ longitude: 2.5762, latitude: 48.8101 });
  await ouvrir(page);
  // On enclenche le suivi, comme lui : le bouton de géolocalisation.
  await page.locator('.maplibregl-ctrl-geolocate').click();
  await expect.poll(() => centreDe(page).then((c) => Math.abs(c.lon - 2.5762) < 0.01),
    { timeout: 10_000 }).toBe(true);

  await choisirLyon(page);
  /* LE VOL ABOUTIT ET LE CENTRE Y RESTE. Sans le désarmement du suivi, le
     prochain relevé GPS rabattait la carte sur la position — on vérifie donc
     APRÈS un délai qui laisse le temps à un relevé de passer. */
  await expect.poll(() => centreDe(page).then((c) =>
    Math.abs(c.lon - DEST.lon) < 0.05 && Math.abs(c.lat - DEST.lat) < 0.05),
  { timeout: 10_000 }).toBe(true);
  /* ON FORCE UN NOUVEAU RELEVÉ GPS. La contre-épreuve a montré que sans lui,
     le test passait MÊME SANS le correctif : la géolocalisation simulée ne
     tire qu'une fois, et un verrou qui n'a jamais l'occasion de rabattre la
     carte ne se voit pas. Changer la position simulée fait tirer le GPS —
     c'est exactement le tick qui, chez Armelin, ramenait la carte chez lui. */
  await context.setGeolocation({ longitude: 2.5763, latitude: 48.8102 });
  await page.waitForTimeout(1_500);
  const centre = await centreDe(page);
  expect(Math.abs(centre.lon - DEST.lon), 'le suivi a repris la carte').toBeLessThan(0.05);
});

test('LA FICHE FERMÉE SE ROUVRE EN CLIQUANT LE MARQUEUR', async ({ page }) => {
  await ouvrir(page);
  await choisirLyon(page);

  // On la ferme : la carte se voit, le marqueur reste.
  await page.locator('.maplibregl-popup-close-button').click();
  await expect(page.locator('.fiche-destination')).toHaveCount(0);
  await expect(page.locator('.maplibregl-marker')).toHaveCount(1);

  // Et le marqueur la rouvre — sans retaper l'adresse.
  await page.locator('.maplibregl-marker').click();
  await expect(page.locator('.fiche-destination')).toBeVisible();
  await expect(page.locator('.fiche-destination .pa-libelle')).toHaveText('Lyon');
  // Avec ses gestes intacts : « Y aller » est là.
  await expect(page.locator('.fiche-destination .fd-aller')).toBeVisible();
});

test('LE MARQUEUR SE DIT — un point cliquable muet ne se découvre pas', async ({ page }) => {
  await ouvrir(page);
  await choisirLyon(page);
  const poignee = page.locator('.maplibregl-marker');
  await expect(poignee).toHaveAttribute('role', 'button');
  await expect(poignee).toHaveAttribute('aria-label', /Rouvrir la fiche de Lyon/);
});
