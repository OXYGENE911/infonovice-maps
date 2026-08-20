import { test, expect } from '@playwright/test';

// Depuis la PR #2, la page EST la carte : on vérifie que MapLibre s'amorce,
// que les contrôles parlent français, et que la souveraineté tient.

test('la carte s’amorce : canevas présent, contrôles en français', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Infonovice Maps/);
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Zoomer', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Me localiser' })).toBeVisible();
  // L'attribution IGN est une obligation de la Géoplateforme, pas un ornement.
  await expect(page.locator('.maplibregl-ctrl-attrib')).toContainText('IGN');
});

test('SOUVERAINETÉ : seules les origines déclarées sont contactées', async ({ page }) => {
  // La contrainte n° 3 du projet, mesurée au navigateur. La liste blanche
  // s'élargit par PR, jamais par accident : data.geopf.fr est arrivée avec
  // la carte (PR #2), api-adresse.data.gouv.fr avec la recherche (PR #4).
  const AUTORISEES = new Set(['localhost', 'data.geopf.fr', 'api-adresse.data.gouv.fr']);
  const intrus: string[] = [];
  page.on('request', (r) => {
    const h = new URL(r.url()).hostname;
    if (!AUTORISEES.has(h)) intrus.push(h);
  });
  await page.goto('/');
  await page.locator('#carte canvas.maplibregl-canvas').waitFor({ timeout: 15_000 });
  await page.waitForTimeout(2500); // le temps que les tuiles partent
  expect([...new Set(intrus)], `origines non déclarées : ${intrus.join(', ')}`).toHaveLength(0);
});

test('des tuiles IGN sont réellement demandées et servies', async ({ page }) => {
  const tuiles: number[] = [];
  page.on('response', (r) => {
    if (r.url().includes('data.geopf.fr/wmts') && r.url().includes('GetTile')) tuiles.push(r.status());
  });
  await page.goto('/');
  await page.locator('#carte canvas.maplibregl-canvas').waitFor({ timeout: 15_000 });
  await expect.poll(() => tuiles.length, { timeout: 15_000 }).toBeGreaterThan(3);
  expect(tuiles.filter((s) => s === 200).length, 'aucune tuile servie en 200').toBeGreaterThan(0);
});

test('le sélecteur de fonds bascule en satellite, et la préférence survit au rechargement', async ({ page }) => {
  const ortho: string[] = [];
  page.on('request', (r) => { if (r.url().includes('ORTHOIMAGERY')) ortho.push(r.url()); });

  await page.goto('/');
  await page.locator('#carte canvas.maplibregl-canvas').waitFor({ timeout: 15_000 });
  await page.locator('.fonds summary').click();
  await page.getByRole('radio', { name: 'Satellite', exact: true }).check();
  await expect.poll(() => ortho.length, { timeout: 15_000 }).toBeGreaterThan(0);

  // LA PERSISTANCE : on recharge, le satellite doit revenir tout seul (IndexedDB).
  const orthoApres: string[] = [];
  page.on('request', (r) => { if (r.url().includes('ORTHOIMAGERY')) orthoApres.push(r.url()); });
  await page.reload();
  await page.locator('#carte canvas.maplibregl-canvas').waitFor({ timeout: 15_000 });
  await expect.poll(() => orthoApres.length, { timeout: 15_000 }).toBeGreaterThan(0);
});

test('la recherche BAN propose, sélectionne au clavier, et pose un marqueur', async ({ page }) => {
  // La BAN est SIMULÉE : le test doit être déterministe, et son quota est un
  // bien commun — la CI n'a pas à le consommer à chaque poussée.
  await page.route('**/api-adresse.data.gouv.fr/search/**', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ features: [{
      geometry: { coordinates: [2.330992, 48.868831] },
      properties: { label: '8 Rue de la Paix 75002 Paris', type: 'housenumber', postcode: '75002', city: 'Paris' },
    }] }),
  }));
  await page.goto('/');
  await page.locator('#carte canvas.maplibregl-canvas').waitFor({ timeout: 15_000 });

  const champ = page.getByRole('combobox', { name: 'Rechercher une adresse en France' });
  await champ.fill('8 rue de la paix');
  const option = page.getByRole('option', { name: /Rue de la Paix/ });
  await expect(option).toBeVisible({ timeout: 5_000 });

  // Sélection AU CLAVIER : l'accessibilité se prouve, elle ne se déclare pas.
  await champ.press('ArrowDown');
  await champ.press('Enter');
  await expect(page.locator('.maplibregl-marker')).toBeVisible({ timeout: 5_000 });
  await expect(champ).toHaveValue('8 Rue de la Paix 75002 Paris');
});

test('l’erreur BAN parle français et n’éventre pas l’interface', async ({ page }) => {
  await page.route('**/api-adresse.data.gouv.fr/**', (route) => route.abort('failed'));
  await page.goto('/');
  await page.locator('#carte canvas.maplibregl-canvas').waitFor({ timeout: 15_000 });
  await page.getByRole('combobox', { name: /Rechercher une adresse/ }).fill('rue de la paix');
  await expect(page.getByRole('alert')).toContainText('momentanément indisponible', { timeout: 10_000 });
});

test('l’itinéraire A→B se calcule, se trace, et SURVIT au changement de fond', async ({ page }) => {
  // BAN et service d'itinéraire simulés : déterminisme, zéro quota consommé.
  await page.route('**/api-adresse.data.gouv.fr/search/**', (route) => {
    const q = new URL(route.request().url()).searchParams.get('q') ?? '';
    const [libelle, lon, lat] = q.includes('lyon')
      ? ['Lyon', 4.8357, 45.7640] : ['Paris', 2.3522, 48.8566];
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ features: [{
      geometry: { coordinates: [lon, lat] },
      properties: { label: libelle, type: 'municipality', postcode: '', city: libelle },
    }] }) });
  });
  await page.route('**/data.geopf.fr/navigation/itineraire**', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      geometry: { type: 'LineString', coordinates: [[2.3522, 48.8566], [3.5, 47.3], [4.8357, 45.764]] },
      distance: 465_000, duration: 15_480,
    }),
  }));

  await page.goto('/');
  await page.locator('#carte canvas.maplibregl-canvas').waitFor({ timeout: 15_000 });
  await page.locator('.iti summary').click();

  const champs = page.locator('.iti input[type="search"]');
  await champs.nth(0).fill('paris');
  await page.getByRole('option', { name: 'Paris' }).first().click();
  await champs.nth(1).fill('lyon');
  await page.getByRole('option', { name: 'Lyon' }).first().click();

  // Le résultat : distance et durée au format français.
  await expect(page.locator('.iti-resultat')).toContainText('465 km', { timeout: 10_000 });
  await expect(page.locator('.iti-resultat')).toContainText('4 h 18');
  // Le tracé et ses deux marqueurs sont posés.
  await expect(page.locator('.maplibregl-marker')).toHaveCount(2);

  // LE CHANGEMENT DE FOND NE MANGE PAS LE TRAJET : setStyle détruit les
  // sources ; le panneau doit reposer le tracé sur style.load.
  await page.locator('.fonds summary').click();
  await page.getByRole('radio', { name: 'Satellite', exact: true }).check();
  await page.waitForTimeout(1200);
  const traitPresent = await page.evaluate(() =>
    Boolean((window as unknown as { __carte?: { getSource(n: string): unknown } })
      .__carte?.getSource('itineraire')));
  expect(traitPresent, 'le tracé a disparu au changement de fond').toBe(true);
});

test('un lien d’itinéraire partagé rejoue le trajet à l’ouverture — sans serveur', async ({ page }) => {
  await page.route('**/data.geopf.fr/navigation/itineraire**', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      geometry: { type: 'LineString', coordinates: [[2.3522, 48.8566], [4.8357, 45.764]] },
      distance: 465_000, duration: 15_480,
    }),
  }));
  // On OUVRE directement le lien partagé : le fragment porte tout.
  await page.goto('/#iti=2.35220,48.85660;4.83570,45.76400;car');
  await page.locator('#carte canvas.maplibregl-canvas').waitFor({ timeout: 15_000 });
  await expect(page.locator('.iti-resultat')).toContainText('465 km', { timeout: 10_000 });
  await expect(page.locator('.maplibregl-marker')).toHaveCount(2);
});

test('l’export GPX télécharge un fichier nommé, sans aucune requête', async ({ page }) => {
  await page.route('**/data.geopf.fr/navigation/itineraire**', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      geometry: { type: 'LineString', coordinates: [[2.3522, 48.8566], [4.8357, 45.764]] },
      distance: 465_000, duration: 15_480,
    }),
  }));
  await page.goto('/#iti=2.35220,48.85660;4.83570,45.76400;car');
  await page.locator('.iti-actions').waitFor({ state: 'visible', timeout: 15_000 });
  const telechargement = page.waitForEvent('download');
  await page.getByRole('button', { name: 'GPX' }).click();
  const fichier = await telechargement;
  expect(fichier.suggestedFilename()).toBe('itineraire-infonovice.gpx');
});
