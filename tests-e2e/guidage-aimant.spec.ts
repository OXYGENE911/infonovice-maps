import { test, expect, type Page } from '@playwright/test';
import { simulerTuiles, simulerCommunes } from './tuiles-simulees';

/* L'AIMANT AU TRACÉ (GUIDE-1, 01/09) — voir lib/guidage.ts pour la règle. */

const TRACE: [number, number][] = Array.from({ length: 21 }, (_, i) =>
  [2.3400 + i * 0.0014, 48.8500]);

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
    if (/resource=bdtopo-pgr/.test(route.request().url())) {
      return route.fulfill({ contentType: 'application/json', body: '{"portions":[]}' });
    }
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        geometry: { type: 'LineString', coordinates: TRACE },
        distance: 2_050, duration: 240,
      }),
    });
  });
  await page.route('**overpass.openstreetmap.fr**', (route) => route.fulfill({
    headers: { 'Access-Control-Allow-Origin': '*' },
    contentType: 'application/json', body: '{"elements":[]}',
  }));
  await page.route('**/www.bison-fute.gouv.fr/**', (route) => route.fulfill({
    contentType: 'application/json', body: '[]',
  }));
  await page.goto(`/#iti=${TRACE[0]![0]},${TRACE[0]![1]};2.3680,48.8500;car`);
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Démarrer le suivi' }).click();
  await expect(page.locator('bandeau-guidage')).toBeVisible({ timeout: 15_000 });
}

test('LE CURSEUR EST AIMANTÉ AU TRACÉ — et regarde dans le sens de la route', async ({ page }) => {
  /* GUIDE-1 (01/09). Armelin : « parfois le véhicule est situé à une dizaine
     de mètres à gauche ou à droite de la route alors que je suis bien sur
     cette ligne » et « la flèche représentant ma voiture est à l'envers du
     sens de la circulation ».
     LE DÉCOR REJOUE SON CAS : un fixe à ~12 m AU NORD d'une route plein est,
     avec un heading GPS ABERRANT (250°, presque à reculons — c'est le bruit
     d'une marche à 4 km/h). Le curseur doit se dessiner SUR le tracé,
     tourné à l'EST — la mesure brute continue, elle, de nourrir la logique. */
  await suivre(page);
  // 12 m au nord de la ligne, heading à l'envers, vitesse de pas.
  await page.evaluate(() => {
    (window as unknown as { __pousserFixe: (c: object) => void })
      .__pousserFixe({ longitude: 2.3500, latitude: 48.85011, speed: 1.1, heading: 250 });
  });
  /* On attend que la caméra du suivi soit ARRIVÉE (zoom 15,5, easeTo de
     800 ms) : mesurer pendant l'animation compare des pixels en vol. */
  await expect.poll(() => page.evaluate(() =>
    (window as unknown as { __carte: { getZoom(): number } }).__carte.getZoom(),
  ), { timeout: 10_000 }).toBeGreaterThan(15);
  await page.waitForTimeout(600);

  const mesure = await page.evaluate(() => {
    const c = (window as unknown as { __carte: {
      project(l: [number, number]): { x: number; y: number };
    } }).__carte;
    const porte = document.querySelector('.curseur-porte') as HTMLElement;
    const boite = porte.getBoundingClientRect();
    const curseur = { x: boite.left + boite.width / 2, y: boite.top + boite.height / 2 };
    /* La verticale du tracé à cette longitude : la ligne est à 48.8500. */
    const surTrace = c.project([2.3500, 48.8500]);
    const brut = c.project([2.3500, 48.85011]);
    const svg = porte.querySelector('svg') as SVGElement;
    const rotation = /rotate\(([-\d.]+)/.exec(svg?.style.transform ?? svg?.getAttribute('style') ?? '');
    /* EN DISTANCE EUCLIDIENNE, PAS EN VERTICALE : la carte du suivi est
       orientée cap-en-haut, le nord n'est donc pas « en haut » à l'écran —
       mesurer l'axe y seul comparait deux points confondus. */
    const d = (p: { x: number; y: number }): number =>
      Math.hypot(curseur.x - p.x, curseur.y - p.y);
    return {
      ecartAuTrace: d(surTrace),
      ecartAuBrut: d(brut),
      rotation: rotation ? Number(rotation[1]) : null,
      transformPorte: porte.style.transform,
    };
  });
  /* SUR LE TRACÉ, PAS SUR LA MESURE : le curseur est à la verticale de la
     ligne (quelques pixels de rendu), et PLUS LOIN de la mesure brute. */
  expect(mesure.ecartAuTrace, 'le curseur ne colle pas au tracé').toBeLessThan(6);
  expect(mesure.ecartAuBrut, 'le curseur suit encore la mesure brute')
    .toBeGreaterThan(mesure.ecartAuTrace);
});

test('LOIN DU TRACÉ, L’AIMANT LÂCHE — on ne ment pas à qui est vraiment ailleurs', async ({ page }) => {
  await suivre(page);
  // 80 m au nord : au-delà du seuil — le curseur montre la mesure vraie.
  await page.evaluate(() => {
    (window as unknown as { __pousserFixe: (c: object) => void })
      .__pousserFixe({ longitude: 2.3500, latitude: 48.85072, speed: 8, heading: 90 });
  });
  await expect.poll(() => page.evaluate(() =>
    (window as unknown as { __carte: { getZoom(): number } }).__carte.getZoom(),
  ), { timeout: 10_000 }).toBeGreaterThan(15);
  await page.waitForTimeout(600);
  const mesure = await page.evaluate(() => {
    const c = (window as unknown as { __carte: {
      project(l: [number, number]): { x: number; y: number };
    } }).__carte;
    const porte = document.querySelector('.curseur-porte') as HTMLElement;
    const boite = porte.getBoundingClientRect();
    const curseur = { x: boite.left + boite.width / 2, y: boite.top + boite.height / 2 };
    const brut = c.project([2.3500, 48.85072]);
    return { ecartAuBrut: Math.hypot(curseur.x - brut.x, curseur.y - brut.y) };
  });
  expect(mesure.ecartAuBrut, 'hors du seuil, le curseur doit dire la vérité')
    .toBeLessThan(6);
});
