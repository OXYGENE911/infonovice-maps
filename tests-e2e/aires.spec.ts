import { test, expect, type Page } from '@playwright/test';
import { simulerTuiles, simulerCommunes } from './tuiles-simulees';

/* L'AIRE D'AUTOROUTE À VENIR (AIRES-1, 05/09/2026).
 *
 * ARMELIN : « un petit panneau bleu à droite, sous le panneau de direction,
 * indiquant les aires de repos à venir et leurs commodités sous forme de
 * pictogrammes […] qui se dépliera automatiquement quelques kilomètres avant
 * d'arriver sur l'aire et qui se refermerait automatiquement une fois l'aire
 * dépassée […] une flèche Haut ou Bas pour l'aire suivante avec un bouton
 * "Y aller" pour ajouter l'aire en étape. »
 *
 * TOUT EST SIMULÉ : le relevé de corridor rend deux aires (surfaces OSM),
 * dont une de l'autre chaussée qui doit être ÉCARTÉE ; le relevé des
 * commodités rend le semis de nœuds mesuré sur l'A6 (carburant, café, borne
 * avec son réseau). Le parcours regarde ce qui part et ce qui s'affiche. */

/* Trente kilomètres plein est, une aire à 12 km (à droite = au sud), une
   autre à 24 km, et celle de l'autre chaussée en face de la première (au nord). */
const TRACE: [number, number][] = Array.from({ length: 61 }, (_, i) => [3.5 + i * 0.0068, 47.8]);
const AIRE_1 = { lon: 3.5 + 12 * 0.0068, lat: 47.7992 };
const AIRE_2 = { lon: 3.5 + 24 * 0.0068, lat: 47.7992 };
const EN_FACE = { lon: AIRE_1.lon, lat: 47.8008 };

const surface = (id: number, c: { lon: number; lat: number }, tags: Record<string, string>) => ({
  type: 'way', id, tags,
  geometry: [
    { lat: c.lat - 0.0002, lon: c.lon - 0.0006 }, { lat: c.lat - 0.0002, lon: c.lon + 0.0006 },
    { lat: c.lat + 0.0002, lon: c.lon + 0.0006 }, { lat: c.lat + 0.0002, lon: c.lon - 0.0006 },
  ],
});

async function suivre(page: Page): Promise<{ overpass: string[]; itineraires: string[] }> {
  const overpass: string[] = [];
  const itineraires: string[] = [];
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
    itineraires.push(url);
    if (/resource=bdtopo-pgr/.test(url)) {
      return route.fulfill({ contentType: 'application/json', body: '{"portions":[]}' });
    }
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({
      geometry: { type: 'LineString', coordinates: TRACE }, distance: 30_000, duration: 1_000,
    }) });
  });
  await page.route('**overpass.openstreetmap.fr**', (route) => {
    const corps = decodeURIComponent(route.request().postData() ?? route.request().url());
    overpass.push(corps);
    if (/maxspeed/.test(corps)) {
      /* Le corridor : deux aires à droite, une en face (gauche), écartée. */
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ elements: [
        surface(1, AIRE_1, { highway: 'services', name: 'Aire de Venoy-Chablis', operator: 'APRR', toilets: 'yes' }),
        surface(2, AIRE_2, { highway: 'rest_area', name: 'Aire de la Biche' }),
        surface(3, EN_FACE, { highway: 'services', name: 'Aire de Venoy-Soleil Levant', operator: 'APRR' }),
      ] }) });
    }
    if (/charging_station/.test(corps)) {
      /* Les commodités, autour des aires retenues : le semis mesuré sur l'A6. */
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ elements: [
        { type: 'node', id: 10, lat: AIRE_1.lat, lon: AIRE_1.lon + 0.0003, tags: { amenity: 'fuel', brand: 'TotalEnergies' } },
        { type: 'node', id: 11, lat: AIRE_1.lat, lon: AIRE_1.lon + 0.0004, tags: { amenity: 'charging_station', network: 'Corri-dor', operator: 'Sodetrel' } },
        { type: 'node', id: 12, lat: AIRE_1.lat, lon: AIRE_1.lon + 0.0005, tags: { amenity: 'cafe', brand: 'Columbus Café & Co' } },
        { type: 'node', id: 13, lat: AIRE_2.lat, lon: AIRE_2.lon + 0.0003, tags: { leisure: 'picnic_table' } },
      ] }) });
    }
    return route.fulfill({ contentType: 'application/json', body: '{"elements":[]}' });
  });
  /* L'index IRVE national : vide ici — c'est OSM qu'on juge. */
  await page.route('**/public.opendatasoft.com/**', (route) => route.fulfill({
    contentType: 'application/json', body: JSON.stringify({ total_count: 0, results: [] }),
  }));
  await page.route('**/www.bison-fute.gouv.fr/**', (route) => route.fulfill({
    contentType: 'application/json', body: '[]',
  }));
  await page.goto(`/#iti=${TRACE[0]![0]},${TRACE[0]![1]};${TRACE[60]![0]},${TRACE[60]![1]};car`);
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Démarrer le suivi' }).click();
  await expect(page.locator('bandeau-guidage')).toBeVisible({ timeout: 15_000 });
  return { overpass, itineraires };
}

async function rouler(page: Page, lon: number): Promise<void> {
  await page.evaluate((lo) => {
    (window as unknown as { __pousserFixe: (c: object) => void })
      .__pousserFixe({ longitude: lo, latitude: 47.8, speed: 30, heading: 90 });
  }, lon);
  await page.waitForTimeout(700);
}

test('LA PASTILLE PARAÎT, LE PANNEAU S’OUVRE SEUL À 5 km, dit les commodités et le réseau, et se referme une fois l’aire passée', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { overpass } = await suivre(page);
  const pastille = page.locator('.bg-aire-p');
  const feuille = page.locator('.bg-aire');

  // Le corridor a tiré ; la pastille dit la distance de la prochaine aire, fermée.
  await expect.poll(() => overpass.filter((c) => /maxspeed/.test(c)).length, { timeout: 15_000 }).toBeGreaterThan(0);
  await rouler(page, TRACE[1]![0]);
  await expect(pastille).toBeVisible({ timeout: 10_000 });
  await expect(pastille.locator('.bg-aire-p-dist')).toContainText('km');
  await expect(feuille).toBeHidden();
  /* La pastille est sous le cartouche, à droite, sans le recouvrir. */
  const c = await page.locator('.bg-cartouche').boundingBox();
  const p = await pastille.boundingBox();
  expect(p!.y).toBeGreaterThanOrEqual((c?.y ?? 0) + (c?.height ?? 0));
  expect(p!.x + p!.width).toBeLessThanOrEqual(390 - 30);

  // À 4 km de l'aire : elle s'ouvre seule, et dit tout.
  await rouler(page, AIRE_1.lon - 0.055);
  await expect(feuille).toBeVisible({ timeout: 10_000 });
  await expect(feuille.locator('.bg-aire-nom')).toHaveText('Aire de Venoy-Chablis');
  await expect(feuille.locator('.bg-aire-type')).toContainText('Aire de service · APRR');
  await expect(feuille.locator('.bg-aire-ou')).toContainText(/dans 4,\d km · \d+ min/);
  /* Les commodités sont demandées UNE fois, autour des aires retenues — et
     l'aire d'en face n'y est pas. */
  await expect.poll(() => overpass.filter((x) => /charging_station/.test(x)).length, { timeout: 15_000 }).toBe(1);
  const demande = overpass.find((x) => /charging_station/.test(x)) ?? '';
  expect(demande).toContain(`${AIRE_1.lat.toFixed(5)},${AIRE_1.lon.toFixed(5)}`);
  expect(demande).not.toContain(`${EN_FACE.lat.toFixed(5)}`);
  await expect(feuille.locator('.bg-aire-picto[data-cle="carburant"]')).toContainText('TotalEnergies');
  await expect(feuille.locator('.bg-aire-picto[data-cle="cafe"]')).toBeVisible();
  await expect(feuille.locator('.bg-aire-picto[data-cle="toilettes"]')).toBeVisible();
  await expect(feuille.locator('.bg-aire-recharge')).toContainText('Corri-dor');
  await expect(feuille.locator('.bg-aire-rang')).toHaveText('1 / 2');

  // La flèche bas montre la suivante ; l'aire de repos n'a que son pique-nique.
  await feuille.locator('.bg-aire-suiv').click();
  await expect(feuille.locator('.bg-aire-nom')).toHaveText('Aire de la Biche');
  await expect(feuille.locator('.bg-aire-type')).toHaveText('Aire de repos');
  await expect(feuille.locator('.bg-aire-picto[data-cle="pique-nique"]')).toBeVisible();
  await expect(feuille.locator('.bg-aire-recharge')).toContainText('Pas de borne');
  await feuille.locator('.bg-aire-prec').click();
  await expect(feuille.locator('.bg-aire-nom')).toHaveText('Aire de Venoy-Chablis');

  // Refermée à la main : elle ne revient pas pour cette aire.
  await feuille.locator('.bg-aire-fermer').click();
  await expect(feuille).toBeHidden();
  await rouler(page, AIRE_1.lon - 0.02);
  await expect(feuille).toBeHidden();
  // L'aire dépassée : la pastille vise la suivante.
  await rouler(page, AIRE_1.lon + 0.01);
  await expect(pastille.locator('.bg-aire-p-dist')).toContainText(/5,\d km/);
});

test('L’OUVERTURE AUTOMATIQUE SE REFERME SEULE UNE FOIS L’AIRE DÉPASSÉE — et « Y aller » en fait une étape', async ({ page }) => {
  const { itineraires } = await suivre(page);
  const feuille = page.locator('.bg-aire');
  await rouler(page, AIRE_1.lon - 0.05);
  await expect(feuille).toBeVisible({ timeout: 10_000 });
  await rouler(page, AIRE_1.lon + 0.01);
  await expect(feuille).toBeHidden();

  // La suivante s'annonce à son tour, et « Y aller » la passe au planificateur.
  await rouler(page, AIRE_2.lon - 0.04);
  await expect(feuille).toBeVisible({ timeout: 10_000 });
  await expect(feuille.locator('.bg-aire-nom')).toHaveText('Aire de la Biche');
  const avant = itineraires.length;
  await feuille.locator('.bg-aire-aller').click();
  await expect.poll(() => itineraires.length, { timeout: 15_000 }).toBeGreaterThan(avant);
  const derniere = itineraires[itineraires.length - 1] ?? '';
  expect(derniere, 'l’aire est devenue une étape du trajet').toContain(AIRE_2.lon.toFixed(4).slice(0, 5));
  await expect(feuille).toBeHidden();
});
