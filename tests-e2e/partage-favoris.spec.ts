import { test, expect, type Page } from '@playwright/test';
import { simulerTuiles, simulerCommunes } from './tuiles-simulees';
import { ouvrirVolet } from './volets';

/* LE PARTAGE DE FAVORIS — la demande d'Armelin du 28/08 : « exporter les
 * favoris si on change de téléphone ou d'ordinateur. Et même un partage. »
 * Le lien voyage de la main à la main (fragment, jamais au serveur), et la
 * réception passe par une CONFIRMATION : un lien cliqué par erreur ne
 * dépose rien dans le stockage de l'usager sans son accord.
 */

test.beforeEach(async ({ page }) => {
  await simulerTuiles(page);
  await simulerCommunes(page);
});

async function semerFavoris(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const ouvrir = (): Promise<IDBDatabase> => new Promise((ok, non) => {
      const d = indexedDB.open('infonovice-maps', 2);
      d.onsuccess = () => ok(d.result);
      d.onerror = () => non(d.error);
    });
    const db = await ouvrir();
    await new Promise<void>((ok) => {
      const t = db.transaction('favoris', 'readwrite');
      t.objectStore('favoris').put({
        id: 'fav-1', nom: 'Chez ma sœur', lon: 4.8357, lat: 45.764,
        cree: '2026-08-27T08:00:00.000Z',
      }, 'fav-1');
      t.objectStore('favoris').put({
        id: 'fav-2', nom: 'Cabane du lac', lon: 5.88, lat: 45.65,
        cree: '2026-08-27T09:00:00.000Z',
      }, 'fav-2');
      t.oncomplete = () => ok();
    });
  });
}

test('« Partager mes favoris » copie un lien qui les porte TOUS — repères exclus', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await semerFavoris(page);
  await ouvrirVolet(page, '.favoris');

  await page.getByRole('button', { name: 'Partager mes favoris' }).click();
  await expect(page.locator('.favoris-etat')).toContainText('Lien copié');
  const lien = await page.evaluate(() => navigator.clipboard.readText());
  expect(lien).toContain('#favs=');
  const frag = decodeURIComponent(lien);
  expect(frag).toContain('Chez ma sœur');
  expect(frag).toContain('Cabane du lac');
  // Les repères ne voyagent JAMAIS par lien : « chez moi » ne se partage
  // pas d'un geste distrait.
  expect(frag).not.toContain('domicile');
});

test('un lien reçu DEMANDE avant d’écrire — puis ajoute, et efface le fragment', async ({ page }) => {
  await page.goto('/#favs=Chez%20ma%20s%C5%93ur~4.83570~45.76400|Cabane%20du%20lac~5.88000~45.65000');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });

  const boite = page.locator('dialog.recevoir-favoris');
  await expect(boite).toBeVisible();
  await expect(boite).toContainText('2 lieux ont été partagés avec vous');
  await expect(boite).toContainText('Chez ma sœur');
  // Le fragment est déjà effacé : recharger ne reposera pas la question.
  expect(new URL(page.url()).hash).toBe('');

  await boite.getByRole('button', { name: 'Ajouter à mes favoris' }).click();
  await expect(boite).not.toBeVisible();

  // Les lieux sont LÀ — le volet Favoris les liste.
  await ouvrirVolet(page, '.favoris');
  await expect(page.locator('.favoris-liste')).toContainText('Chez ma sœur');
  await expect(page.locator('.favoris-liste')).toContainText('Cabane du lac');
  await expect(page.locator('.favoris-etat')).toContainText('2 favoris ajoutés');
});

test('« Ignorer » n’écrit RIEN — c’est tout le sens de la confirmation', async ({ page }) => {
  await page.goto('/#favs=Piege~2.00000~48.00000');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await page.locator('dialog.recevoir-favoris').getByRole('button', { name: 'Ignorer' }).click();

  await ouvrirVolet(page, '.favoris');
  await expect(page.locator('.favoris-liste')).not.toContainText('Piege');
  await expect(page.locator('.favoris-vide')).toBeVisible();
});

test('les lieux DÉJÀ connus ne se doublent pas — la position décide, pas le nom', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await semerFavoris(page);
  // « Chez Julie » est EXACTEMENT la position de « Chez ma sœur » : renommé,
  // un lieu reste le même endroit. « Col du Galibier » est nouveau.
  await page.goto('/#favs=Chez%20Julie~4.83570~45.76400|Col%20du%20Galibier~6.40780~45.06400');
  await page.reload();
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });

  await page.locator('dialog.recevoir-favoris')
    .getByRole('button', { name: 'Ajouter à mes favoris' }).click();
  await ouvrirVolet(page, '.favoris');
  await expect(page.locator('.favoris-etat')).toContainText('1 favori ajouté');
  await expect(page.locator('.favoris-etat')).toContainText('le reste y était déjà');
  await expect(page.locator('.favoris-liste')).toContainText('Col du Galibier');
  await expect(page.locator('.favoris-liste')).not.toContainText('Chez Julie');
});

test('un lien FORGÉ n’ouvre aucune boîte — analyse défensive, comme le trajet', async ({ page }) => {
  await page.goto('/#favs=Piege~200.00000~95.00000');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('dialog.recevoir-favoris')).toHaveCount(0);
});
