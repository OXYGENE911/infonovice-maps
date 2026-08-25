import { test, expect, type Page } from '@playwright/test';
import { simulerTuiles, simulerCommunes } from './tuiles-simulees';

/* REPÈRES — domicile et travail. Ce qui compte n'est pas qu'ils s'affichent,
   c'est que « rentrer chez moi » soit UN GESTE : un appui long pour définir,
   un bouton pour y aller. Et qu'ils survivent au rechargement sans qu'aucun
   compte n'ait été créé ni aucun serveur consulté. */

test.beforeEach(async ({ page }) => {
  await simulerTuiles(page);
  await simulerCommunes(page);
  // La BAN est simulée : l'adresse nomme le repère, elle ne doit pas faire
  // dépendre la CI d'un tiers.
  await page.route('**api-adresse.data.gouv.fr**', (route) => route.fulfill({
    contentType: 'application/json',
    /* LA GÉOMÉTRIE EST OBLIGATOIRE : `versResultats` écarte toute entité sans
       coordonnées. Une fausse réponse incomplète passait sans erreur et le
       repère gardait ses coordonnées pour nom — un faux négatif silencieux,
       exactement ce contre quoi une fixture AU FORMAT RÉEL protège. */
    body: JSON.stringify({ features: [{
      geometry: { type: 'Point', coordinates: [2.4, 46.6] },
      properties: { label: '10 Rue de Rivoli 75004 Paris', type: 'housenumber',
        postcode: '75004', city: 'Paris' },
    }] }),
  }));
});

async function ouvrirFavoris(page: Page): Promise<void> {
  await page.locator('.maplibregl-ctrl-top-left summary').filter({ hasText: 'Favoris' }).click();
}

async function appuiLong(page: Page): Promise<void> {
  const carte = page.locator('#carte canvas.maplibregl-canvas');
  const b = await carte.boundingBox();
  await page.mouse.move(b!.x + b!.width / 2, b!.y + b!.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(700);   // le seuil d'appui long est de 500 ms
  await page.mouse.up();
}

test('sans repère défini, l’interface l’apprend au lieu de se taire', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await ouvrirFavoris(page);

  // Une section vide ne dirait rien ; « non défini » enseigne que ça existe.
  await expect(page.locator('.fav-reperes')).toContainText('Domicile — non défini');
  await expect(page.locator('.fav-reperes')).toContainText('Travail — non défini');
  await expect(page.getByRole('button', { name: /Domicile non défini/ })).toBeDisabled();
});

test('un appui long définit le domicile, et il survit au rechargement', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await appuiLong(page);

  const bouton = page.getByRole('button', { name: 'Définir comme domicile' });
  await expect(bouton).toBeVisible();
  // Le bouton naît DÉSACTIVÉ : cliquer pendant le vol de la BAN figerait
  // « chez moi » sous des coordonnées brutes.
  await expect(bouton).toBeEnabled({ timeout: 10_000 });
  await bouton.click();

  /* ON VÉRIFIE L'EFFET, PAS LE LIBELLÉ TRANSITOIRE. Une première version
     attendait le texte « Enregistré ✓ » du bouton : il paraît bien en usage
     réel, mais c'est un état de passage, et l'attendre rendait le parcours
     instable pour rien. Ce qui compte est que le repère EXISTE ensuite. */
  await ouvrirFavoris(page);
  await expect(page.locator('.fav-reperes')).toContainText('Rue de Rivoli');

  await page.reload();
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await ouvrirFavoris(page);
  await expect(page.locator('.fav-reperes'), 'sans compte, sans serveur')
    .toContainText('Rue de Rivoli');
});

test('« Oublier » efface le repère et le dit à voix haute', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await appuiLong(page);
  const definir = page.getByRole('button', { name: 'Définir comme travail' });
  await expect(definir).toBeEnabled({ timeout: 10_000 });
  await definir.click();

  await ouvrirFavoris(page);
  await page.getByRole('button', { name: 'Oublier mon travail' }).click();

  await expect(page.locator('.fav-reperes')).toContainText('Travail — non défini');
  // Le changement est ANNONCÉ : un lecteur d'écran doit l'entendre.
  await expect(page.locator('.favoris-etat')).toContainText('Travail oublié');
});
