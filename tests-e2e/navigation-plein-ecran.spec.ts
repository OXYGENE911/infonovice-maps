import { test, expect, type Page } from '@playwright/test';
import { simulerTuiles, simulerCommunes } from './tuiles-simulees';

/* LE PLEIN ÉCRAN DE NAVIGATION ET LA FLÈCHE À PORTÉE (NAV-2 + FLECHE-1, 05/09).
 *
 * ARMELIN, retours du 04/09 : « il serait préférable de faire apparaître les
 * panneaux de direction tout en haut de l'écran comme dans n'importe quelle
 * application GPS […] La barre de recherche, le menu et le bouton Itinéraire
 * reviendraient à la normale qu'après la fin du trajet » ; et, sur le
 * périphérique : « l'instruction indiquait de tourner à droite dans 4 km
 * […] j'ai cru qu'il fallait tourner ici en voyant la flèche à droite ». */

const TRACE: [number, number][] = Array.from({ length: 21 }, (_, i) => [2.3400 + i * 0.0014, 48.8500]);
const DEST = { lon: TRACE[20]![0], lat: TRACE[20]![1] };

async function suivre(page: Page): Promise<void> {
  await simulerTuiles(page);
  await simulerCommunes(page);
  await page.context().grantPermissions(['geolocation']);
  await page.context().setGeolocation({ longitude: TRACE[0]![0], latitude: TRACE[0]![1] });
  await page.addInitScript(() => {
    let rappel: ((p: unknown) => void) | null = null;
    (window as unknown as { __pousserFixe: (c: object) => void }).__pousserFixe = (c) => {
      rappel?.({ coords: { accuracy: 5, altitude: null, altitudeAccuracy: null, ...c } });
    };
    Object.defineProperty(navigator, 'geolocation', {
      value: {
        watchPosition: (ok: (p: unknown) => void) => { rappel = ok; return 1; },
        clearWatch: () => { rappel = null; },
        getCurrentPosition: (ok: (p: unknown) => void) => { rappel = ok; },
      },
    });
  });
  await page.route('**/data.geopf.fr/navigation/itineraire**', (route) => {
    const url = decodeURIComponent(route.request().url());
    if (/resource=bdtopo-pgr/.test(url)) {
      return route.fulfill({ contentType: 'application/json', body: '{"portions":[]}' });
    }
    /* Une manœuvre unique, à 1 900 m du départ : tourner à droite. */
    const corps: Record<string, unknown> = {
      geometry: { type: 'LineString', coordinates: TRACE }, distance: 2_050, duration: 240,
    };
    if (/getSteps=true/i.test(url)) {
      corps['portions'] = [{ steps: [
        { instruction: { type: 'depart' }, distance: 1_900, attributes: { name: { cpx_numero: 'D1' } } },
        { instruction: { type: 'turn', modifier: 'right' }, distance: 150, attributes: { name: { cpx_numero: 'D2' } } },
      ] }];
    }
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(corps) });
  });
  await page.route('**overpass.openstreetmap.fr**', (route) => route.fulfill({
    contentType: 'application/json', body: '{"elements":[]}',
  }));
  await page.route('**/www.bison-fute.gouv.fr/**', (route) => route.fulfill({
    contentType: 'application/json', body: '[]',
  }));
  await page.goto(`/#iti=${TRACE[0]![0]},${TRACE[0]![1]};${DEST.lon},${DEST.lat};car`);
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Démarrer le suivi' }).click();
  await expect(page.locator('bandeau-guidage')).toBeVisible({ timeout: 15_000 });
}

async function rouler(page: Page, lon: number, lat: number, vitesse = 12): Promise<void> {
  await page.evaluate(([lo, la, v]) => {
    (window as unknown as { __pousserFixe: (c: object) => void })
      .__pousserFixe({ longitude: lo, latitude: la, speed: v, heading: 90 });
  }, [lon, lat, vitesse]);
  await page.waitForTimeout(900);
}

test('EN SUIVI, LE CARTOUCHE PREND LE HAUT DE L’ÉCRAN — en-tête, rail et menu s’effacent, et reviennent à l’arrêt', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await suivre(page);
  await rouler(page, TRACE[1]![0], TRACE[1]![1]);
  await expect(page.locator('.entete')).toBeHidden();
  await expect(page.locator('#carte .maplibregl-ctrl-top-left')).toBeHidden();
  await expect(page.locator('#carte .maplibregl-ctrl-top-right')).toBeHidden();
  const cartouche = page.locator('.bg-cartouche');
  await expect(cartouche).toBeVisible({ timeout: 15_000 });
  const boite = await cartouche.boundingBox();
  expect(boite, 'le cartouche a une boîte').not.toBeNull();
  /* Sous l'encoche et rien d'autre : moins de 24 px du haut sur un écran sans
     encoche. Avant NAV-2, il commençait 58 px sous l'en-tête (≈ 115 px). */
  expect(boite!.y, 'le cartouche doit être tout en haut').toBeLessThanOrEqual(24);
  /* Plus gros : la distance se lit à bout de bras. */
  const taille = await page.locator('.bg-cartouche .bg-distance').evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
  expect(taille).toBeGreaterThanOrEqual(20);

  await page.locator('.bg-arreter').click();
  await expect(page.locator('.entete')).toBeVisible();
  await expect(page.locator('#carte .maplibregl-ctrl-top-right')).toBeVisible();
});

test('LA FLÈCHE DE VIRAGE N’ARRIVE QU’À PORTÉE : tout droit à 1,9 km, à droite à 300 m', async ({ page }) => {
  await suivre(page);
  await rouler(page, TRACE[0]![0], TRACE[0]![1]);
  const instruction = page.locator('.bg-cartouche .bg-instruction');
  const distance = page.locator('.bg-cartouche .bg-distance');
  await expect(instruction).toContainText('Continuez tout droit', { timeout: 15_000 });
  /* La manœuvre à venir est DITE, en seconde ligne, avec sa distance. */
  await expect(distance).toContainText('Tournez à droite');
  await expect(distance).toContainText(/km/);

  /* À 300 m de la manœuvre, à 12 m/s (portée 500 m) : la flèche de virage. */
  await rouler(page, TRACE[16]![0], TRACE[16]![1]);
  await expect(instruction).toContainText('Tournez à droite', { timeout: 15_000 });
  await expect(distance).not.toContainText('Tournez');
});
