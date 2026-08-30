import { test, expect, type Page } from '@playwright/test';
import { simulerTuiles, simulerCommunes } from './tuiles-simulees';

/* LA FICHE DE DESTINATION — mandat UX du 28/08 (PR UX-2).
 *
 * Avant elle, choisir une adresse dans la recherche posait un marqueur MUET :
 * pour en faire quelque chose — y aller, la garder — il fallait la retrouver
 * dans le planificateur ou par appui long. La fiche propose les quatre gestes
 * au moment où l'on vient de désigner le lieu.
 */

test.beforeEach(async ({ page }) => {
  await simulerTuiles(page);
  await simulerCommunes(page);
  await page.route('**/api-adresse.data.gouv.fr/search/**', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ features: [{
      geometry: { coordinates: [4.8357, 45.764] },
      properties: { label: 'Lyon', type: 'municipality', postcode: '69000',
        city: 'Lyon', context: '69, Rhône' },
    }] }),
  }));
});

async function choisirLyon(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await page.locator('.entete input[type="search"]').fill('lyon');
  await page.getByRole('option', { name: 'Lyon' }).first().click();
  await expect(page.locator('.fiche-destination')).toBeVisible({ timeout: 5_000 });
}

test('choisir une adresse ouvre sa fiche : les quatre gestes sont là', async ({ page }) => {
  await choisirLyon(page);
  const fiche = page.locator('.fiche-destination');
  // Le lieu est NOMMÉ, contexte à l'appui — on vérifie qu'on parle du bon.
  await expect(fiche.locator('.pa-libelle')).toHaveText('Lyon');
  for (const geste of ['Y aller', 'Ajouter aux favoris', 'Photos de rue',
    'Copier les coordonnées']) {
    await expect(fiche.getByRole('button', { name: geste })).toBeVisible();
  }
});

test('« Y aller » ouvre le planificateur, destination NOMMÉE, départ demandé', async ({ page }) => {
  await choisirLyon(page);
  await page.locator('.fiche-destination .fd-aller').click();

  // La fiche a rempli son office : elle se referme.
  await expect(page.locator('.fiche-destination')).toHaveCount(0);
  // Le volet est OUVERT, la destination porte le nom du lieu.
  await expect(page.locator('.vue-accueil')).toBeVisible();
  await expect(page.locator('[data-role="arrivee"] input')).toHaveValue('Lyon');
  /* Sans position connue, le calcul ne peut pas partir — et il le DIT, en
     proposant le départ, au lieu du silence qui fait croire au cassé. */
  await expect(page.locator('.iti-erreur')).toContainText('Choisissez votre départ');
});

test('« Ajouter aux favoris » garde le lieu sous son nom BAN, sans attente', async ({ page }) => {
  await choisirLyon(page);
  await page.locator('.fiche-destination .pa-favori').click();
  await expect(page.locator('.fiche-destination .pa-favori'))
    .toHaveText('Ajouté aux favoris ✓');

  // Le favori EST là : le planificateur le compte dans son bouton d'entrée.
  await page.locator('.iti > summary').click();
  await expect(page.locator('[data-pour="arrivee"]')
    .getByRole('button', { name: 'Choisir un favori comme arrivée' }))
    .toContainText('Favoris (1)');
});
