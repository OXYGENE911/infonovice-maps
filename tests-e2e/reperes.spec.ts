import { test, expect, type Page } from '@playwright/test';
import { simulerTuiles, simulerCommunes } from './tuiles-simulees';
import { ouvrirVolet } from './volets';

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
  await ouvrirVolet(page, '.favoris');
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

test('un repère se définit DEPUIS LE PANNEAU, pas seulement par appui long', async ({ page }) => {
  /* Un repère grisé sans moyen visible de le renseigner est une impasse : rien
     n'indiquait qu'il fallait presser la carte. Signalé par Armelin. */
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await ouvrirFavoris(page);

  const definir = page.getByRole('button', { name: 'Définir mon domicile au centre de la carte' });
  await expect(definir, 'aucun moyen visible de définir le domicile').toBeVisible();
  await definir.click();

  await expect(page.locator('.fav-reperes')).toContainText('Rue de Rivoli', { timeout: 15_000 });
  await expect(page.locator('.favoris-etat')).toContainText('Domicile enregistré');
});

test('la BAN muette n’empêche PAS d’enregistrer le repère', async ({ page }) => {
  /* L'adresse est un confort, pas une condition : perdre le lieu parce qu'un
     service tiers hésite serait absurde. */
  await page.route('**api-adresse.data.gouv.fr**', (route) => route.abort('failed'));
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await ouvrirFavoris(page);

  await page.getByRole('button', { name: 'Définir mon travail au centre de la carte' }).click();
  // Enregistré sous ses coordonnées, faute d'adresse.
  await expect(page.locator('.fav-reperes')).toContainText(/Travail — \d/, { timeout: 15_000 });
});

test('un repère se définit PAR ADRESSE — le boulot se saisit depuis chez soi', async ({ page }) => {
  /* Le retour d'Armelin du 29/08 : « si on est chez soi pour la première
     utilisation, il n'est pas possible de saisir l'adresse du boulot ; il
     faudrait obligatoirement se rendre sur place et cliquer Définir ici ». */
  await page.route('**/api-adresse.data.gouv.fr/search/**', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ features: [{
      geometry: { coordinates: [2.2945, 48.8584] },
      properties: { label: '5 avenue Anatole France, Paris', type: 'housenumber',
        postcode: '75007', city: 'Paris', context: '75, Paris' },
    }] }),
  }));
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await ouvrirVolet(page, '.favoris');

  await page.getByRole('button', { name: 'Définir mon travail en saisissant une adresse' }).click();
  const saisie = page.locator('.fav-repere-saisie input');
  await saisie.fill('anatole france');
  await page.getByRole('option', { name: /Anatole France/ }).click();

  // Le repère est posé sous son ADRESSE, sans bouger de chez soi.
  await expect(page.locator('.favoris-etat')).toContainText('Travail enregistré');
  await expect(page.locator('.fav-reperes-liste')).toContainText('Anatole France');
  // Et le planificateur le propose aussitôt en raccourci.
  await page.locator('.iti > summary').click();
  await expect(page.getByRole('button', { name: 'Partir de Travail' })).toBeVisible();
});
