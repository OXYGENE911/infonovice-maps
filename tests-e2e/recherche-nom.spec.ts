import { test, expect } from '@playwright/test';
import { simulerTuiles } from './tuiles-simulees';

/* LA RECHERCHE PAR NOM (RECHERCHE-2, 01/09).
 *
 * Armelin veut chercher « un POI, une école, une entreprise » par son nom.
 * La BAN ne connaît que des ADRESSES : « Lycée Champlain » n'y rend rien et
 * la barre restait muette. OpenStreetMap porte les noms — mais il est
 * bénévole, et ces parcours vérifient la FRUGALITÉ autant que le résultat :
 * on n'appelle qu'en dernier recours, et jamais sur une vue trop large. */

const AUCUNE_ADRESSE = { type: 'FeatureCollection', features: [] };

const LYCEE = {
  type: 'node', id: 42, lat: 48.8570, lon: 2.3530,
  tags: { amenity: 'school', name: 'Lycée Champlain' },
};

async function decor(page: import('@playwright/test').Page): Promise<string[]> {
  const overpass: string[] = [];
  await simulerTuiles(page);
  // La BAN ne trouve rien : c'est le cas qui ouvre la recherche par nom.
  await page.route('**/api-adresse.data.gouv.fr/search/**', (route) => route.fulfill({
    contentType: 'application/json', body: JSON.stringify(AUCUNE_ADRESSE),
  }));
  await page.route('**overpass.openstreetmap.fr**', (route) => {
    overpass.push(decodeURIComponent(route.request().url()));
    return route.fulfill({
      headers: { 'Access-Control-Allow-Origin': '*' },
      contentType: 'application/json',
      body: JSON.stringify({ elements: [LYCEE] }),
    });
  });
  return overpass;
}

/* TROIS BARRES VIVENT DANS LA PAGE — l'accueil, le départ, l'arrivée. Un
   sélecteur global les prend toutes et Playwright refuse net (mode strict) :
   on désigne donc CELLE qu'on remplit, et on lit SA note. */
const barre = (page: import('@playwright/test').Page) =>
  page.locator('recherche-adresse').first();

async function ouvrir(page: import('@playwright/test').Page, zoom: number): Promise<void> {
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await page.evaluate((z) => {
    (window as unknown as { __carte: { jumpTo(o: object): void } })
      .__carte.jumpTo({ center: [2.3522, 48.8566], zoom: z });
  }, zoom);
}

test('UN NOM QUE LA BAN IGNORE SE TROUVE SUR LA CARTE', async ({ page }) => {
  const overpass = await decor(page);
  await ouvrir(page, 15);
  await barre(page).getByRole('combobox').fill('Lycée Champlain');

  await expect(barre(page).locator('[role="option"] .libelle').first())
    .toHaveText('Lycée Champlain', { timeout: 10_000 });
  await expect(barre(page).locator('[role="option"] .contexte').first())
    .toHaveText('Lieu de la carte');

  /* CE QUI PART COMPTE AUTANT QUE CE QUI REVIENT : une recherche par
     SOUS-CHAÎNE, sans égard à la casse, bornée à la vue. */
  expect(overpass).toHaveLength(1);
  expect(overpass[0]).toContain('nwr["name"~"Lycée Champlain",i]');
});

test('SUR UNE VUE TROP LARGE, ON REFUSE — et on dit pourquoi', async ({ page }) => {
  /* LA RÈGLE DE FRUGALITÉ EST UN PARCOURS, pas un commentaire : une
     expression régulière sur le nom à l'échelle d'une région ferait payer à
     un service bénévole le prix d'une base d'entreprises qu'il n'est pas. */
  const overpass = await decor(page);
  await ouvrir(page, 8);
  await barre(page).getByRole('combobox').fill('Lycée Champlain');

  const note = barre(page).locator('.recherche-note');
  await expect(note).toBeVisible({ timeout: 10_000 });
  await expect(note).toContainText('rapprochez-vous de la zone');
  // AUCUN APPEL : le refus se mesure au silence sur le réseau.
  expect(overpass).toHaveLength(0);
});

test('UNE ADRESSE TROUVÉE N’APPELLE PAS LA CARTE — le dernier recours reste le dernier', async ({ page }) => {
  const overpass: string[] = [];
  await simulerTuiles(page);
  await page.route('**/api-adresse.data.gouv.fr/search/**', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ type: 'FeatureCollection', features: [{
      type: 'Feature', geometry: { type: 'Point', coordinates: [2.3522, 48.8566] },
      properties: {
        label: '1 rue de la Paix 75002 Paris', type: 'housenumber',
        housenumber: '1', postcode: '75002', city: 'Paris',
      },
    }] }),
  }));
  await page.route('**overpass.openstreetmap.fr**', (route) => {
    overpass.push(route.request().url());
    return route.fulfill({
      headers: { 'Access-Control-Allow-Origin': '*' },
      contentType: 'application/json', body: '{"elements":[]}',
    });
  });
  await ouvrir(page, 15);
  await barre(page).getByRole('combobox').fill('1 rue de la paix');

  await expect(barre(page).locator('[role="option"] .libelle').first())
    .toHaveText('1 rue de la Paix 75002 Paris', { timeout: 10_000 });
  expect(overpass).toHaveLength(0);
});
