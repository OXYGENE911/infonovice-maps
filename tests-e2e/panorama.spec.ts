import { test, expect, type Page } from '@playwright/test';
import { simulerTuiles, simulerCommunes, PNG_1PX, PNG_PANORAMA_2X1 } from './tuiles-simulees';

/* PANORAMAS 360 — la ROADMAP portait cette limite depuis la PR #12 : les
   photos Panoramax sont souvent équirectangulaires, et la visionneuse les
   affichait À PLAT, donc très larges et déformées.
   Ces parcours vérifient les deux moitiés : un panorama devient explorable,
   une photo ordinaire ne passe PAS par WebGL. */

async function simulerPanoramax(page: Page, image: Buffer): Promise<void> {
  await page.route('**/api.panoramax.xyz/**', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ features: [{
      id: 'photo-1',
      geometry: { type: 'Point', coordinates: [2.3522, 48.8566] },
      properties: {
        datetime: '2026-05-01T10:00:00Z',
        providers: [{ name: 'IGN', roles: ['producer'] }],
        license: 'CC-BY-SA-4.0',
      },
      assets: {
        sd: { href: 'https://panoramax.openstreetmap.fr/derivates/photo-1/sd.jpg',
          type: 'image/jpeg' },
        thumb: { href: 'https://panoramax.openstreetmap.fr/derivates/photo-1/thumb.jpg',
          type: 'image/jpeg' },
      },
    }] }),
  }));
  /* L'EN-TÊTE CORS EST INDISPENSABLE : sans lui l'image contamine le canevas
     et WebGL refuse de la texturer. Panoramax le renvoie réellement — la
     simulation doit donc le refléter, sinon elle éprouverait une situation
     qui n'existe pas. */
  await page.route('**/panoramax.openstreetmap.fr/**', (route) => route.fulfill({
    contentType: 'image/png',
    headers: { 'Access-Control-Allow-Origin': '*' },
    body: image,
  }));
}

async function ouvrirPhoto(page: Page): Promise<void> {
  await page.goto('/');
  const canevas = page.locator('#carte canvas.maplibregl-canvas');
  await canevas.waitFor({ timeout: 15_000 });
  const cadre = await canevas.boundingBox();
  await page.mouse.move(cadre!.x + cadre!.width / 2, cadre!.y + cadre!.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(700);            // le seuil d'appui long
  await page.mouse.up();
  const bouton = page.getByRole('button', { name: 'Photos de rue' });
  await expect(bouton).toBeEnabled({ timeout: 10_000 });
  await bouton.click();
  await expect(page.getByRole('dialog', { name: 'Photo de rue' })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await simulerTuiles(page);
  await simulerCommunes(page);
});

test('une photo ORDINAIRE reste une image, elle ne passe pas par WebGL', async ({ page }) => {
  /* Le rendu 360 coûte une texture en mémoire vidéo : on ne l'engage que pour
     ce qui est réellement un panorama. */
  await simulerPanoramax(page, PNG_1PX);
  await ouvrirPhoto(page);

  await expect(page.locator('.photo-image')).toBeVisible();
  await expect(page.locator('.photo-360')).toBeHidden();
  await expect(page.locator('.photo-360-aide')).toBeHidden();
});

test('un PANORAMA 2:1 devient explorable, et le dit', async ({ page }) => {
  await simulerPanoramax(page, PNG_PANORAMA_2X1);
  await ouvrirPhoto(page);

  const toile = page.locator('.photo-360');
  await expect(toile, 'le panorama n’a pas remplacé l’image à plat').toBeVisible({
    timeout: 10_000,
  });
  await expect(page.locator('.photo-image')).toBeHidden();
  // L'aide n'est pas décorative : rien n'indique qu'une image se fait glisser.
  await expect(page.locator('.photo-360-aide')).toContainText('glisser');
  // Et il est atteignable AU CLAVIER — le projet exige la navigation complète.
  await expect(toile).toHaveAttribute('tabindex', '0');
  await expect(toile).toHaveAttribute('aria-label', /360/);
});

test('le panorama se laisse explorer sans rien casser', async ({ page }) => {
  await simulerPanoramax(page, PNG_PANORAMA_2X1);
  const erreurs: string[] = [];
  page.on('pageerror', (e) => erreurs.push(e.message));
  await ouvrirPhoto(page);

  const toile = page.locator('.photo-360');
  await expect(toile).toBeVisible({ timeout: 10_000 });
  const cadre = await toile.boundingBox();

  // Glissement à la souris.
  await page.mouse.move(cadre!.x + cadre!.width / 2, cadre!.y + cadre!.height / 2);
  await page.mouse.down();
  await page.mouse.move(cadre!.x + cadre!.width / 2 - 150, cadre!.y + cadre!.height / 2 + 40);
  await page.mouse.up();

  // Puis au clavier.
  await toile.focus();
  for (const touche of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) {
    await page.keyboard.press(touche);
  }

  expect(erreurs, 'le rendu a levé une erreur').toEqual([]);
  await expect(toile).toBeVisible();
});

test('fermer la modale relâche le panorama', async ({ page }) => {
  /* Une texture de panorama pèse plusieurs mégaoctets en mémoire vidéo : une
     modale fermée ne doit rien garder. */
  await simulerPanoramax(page, PNG_PANORAMA_2X1);
  await ouvrirPhoto(page);
  await expect(page.locator('.photo-360')).toBeVisible({ timeout: 10_000 });

  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Photo de rue' })).toBeHidden();
  await expect(page.locator('.photo-360')).toBeHidden();
  await expect(page.locator('.photo-image')).not.toHaveAttribute('src', /./);
});
