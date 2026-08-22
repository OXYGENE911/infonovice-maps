// L'adressage en mots, de bout en bout : de l'appui long sur la carte à la
// recherche d'une adresse dictée. Le répertoire des communes est SIMULÉ, comme
// les tuiles et pour la même raison — la CI ne doit ni dépendre de
// geo.api.gouv.fr, ni le solliciter à chaque poussée. La disponibilité réelle
// du service est prouvée par appels dans docs/apis.md.
import { test, expect } from '@playwright/test';
import { simulerTuiles } from './tuiles-simulees';
import { coder } from '../src/lib/adresse-mots';

const DIJON = { nom: 'Dijon', code: '21231', centre: { type: 'Point', coordinates: [5.0322, 47.3319] } };

test.beforeEach(async ({ page }) => {
  await simulerTuiles(page);
  // Le répertoire des communes : par position ET par nom.
  await page.route('**/geo.api.gouv.fr/communes**', (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.has('lat')) {
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify([DIJON]) });
    }
    const nom = url.searchParams.get('nom') ?? '';
    // Le service rend une recherche APPROCHÉE : on imite le piège en
    // renvoyant aussi une commune voisine que le module doit écarter.
    const reponse = /dijon/i.test(nom)
      ? [DIJON, { nom: 'Fontaine-lès-Dijon', code: '21278', centre: { type: 'Point', coordinates: [5.025, 47.3477] } }]
      : [];
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(reponse) });
  });
  // La BAN, pour que l'appui long affiche une adresse postale sans réseau réel.
  await page.route('**/api-adresse.data.gouv.fr/reverse/**', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [5.0415, 47.322] },
        properties: { label: '3 Rue des Forges 21000 Dijon', city: 'Dijon', postcode: '21000' },
      }],
    }),
  }));
});

test('ADRESSE EN MOTS : l’appui long la donne, et elle se copie', async ({ page }) => {
  await page.goto('/');
  const canevas = page.locator('#carte canvas.maplibregl-canvas');
  await canevas.waitFor({ timeout: 15_000 });
  await page.evaluate(() => {
    (window as unknown as { __carte: { jumpTo(o: object): void } })
      .__carte.jumpTo({ center: [5.0415, 47.322], zoom: 15 });
  });

  const cadre = (await canevas.boundingBox())!;
  await page.mouse.move(cadre.x + 640, cadre.y + 360);
  await page.mouse.down();
  await page.waitForTimeout(700);
  await page.mouse.up();

  const mots = page.locator('.pa-mots');
  await expect(mots).toBeVisible({ timeout: 10_000 });
  // « Dijon-21 XXXX 0000 » — la forme est le contrat du format.
  await expect(mots).toHaveText(/^Dijon-21 [A-Z]{4} \d{4}$/);

  const bouton = page.getByRole('button', { name: 'Copier l’adresse en mots' });
  await expect(bouton).toBeVisible();
});

test('ADRESSE EN MOTS : la recherche la comprend et y vole', async ({ page }) => {
  await page.goto('/');
  await page.locator('#carte canvas.maplibregl-canvas').waitFor({ timeout: 15_000 });

  /* On code un point CONNU avec le module lui-même, puis on redemande cette
     adresse à la recherche : le va-et-vient complet, celui qu'un usager fait
     entre deux téléphones. */
  const saisie = coder(
    { nom: 'Dijon', code: '21231', centre: { lon: 5.0322, lat: 47.3319 } },
    { lon: 5.0415, lat: 47.322 },
  );

  const champ = page.locator('.entete .recherche input');
  await champ.fill(saisie);
  const option = page.locator('.entete .recherche [role="option"]').first();
  await expect(option).toBeVisible({ timeout: 10_000 });
  await expect(option).toContainText('Adresse en mots');
  await option.click();

  /* La carte a volé quelque part dans Dijon, pas ailleurs. On SONDE plutôt
     qu'on ne photographie : `flyTo` est une animation, et lire le centre à
     l'instant du clic rend le point de départ (le centre de la France). */
  await expect.poll(async () => page.evaluate(() => {
    const c = (window as unknown as {
      __carte: { getCenter(): { lng: number; lat: number } };
    }).__carte.getCenter();
    return Math.max(Math.abs(c.lng - 5.04), Math.abs(c.lat - 47.32));
  }), {
    message: 'la carte n’a jamais atteint Dijon',
    timeout: 15_000,
  }).toBeLessThan(0.2);
});

test('ADRESSE EN MOTS : une commune inconnue le DIT, sans deviner', async ({ page }) => {
  await page.goto('/');
  await page.locator('#carte canvas.maplibregl-canvas').waitFor({ timeout: 15_000 });
  const champ = page.locator('.entete .recherche input');
  await champ.fill('Zorglub-99 BAKE 4831');
  const erreur = page.locator('.entete .recherche .recherche-erreur');
  await expect(erreur).toBeVisible({ timeout: 10_000 });
  await expect(erreur).toContainText('Aucune commune');
});

test('ADRESSE EN MOTS : une saisie ordinaire va toujours à la BAN', async ({ page }) => {
  /* Le format ne doit pas capturer ce qui ne lui appartient pas : « rue des
     Forges Dijon » reste une recherche d'adresse. */
  let versBan = 0;
  await page.route('**/api-adresse.data.gouv.fr/search/**', (route) => {
    versBan += 1;
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ type: 'FeatureCollection', features: [] }),
    });
  });
  await page.goto('/');
  await page.locator('#carte canvas.maplibregl-canvas').waitFor({ timeout: 15_000 });
  await page.locator('.entete .recherche input').fill('rue des Forges Dijon');
  await expect.poll(() => versBan, { timeout: 10_000 }).toBeGreaterThan(0);
});
