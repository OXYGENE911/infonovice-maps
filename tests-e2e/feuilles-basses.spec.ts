import { test, expect, type Page } from '@playwright/test';
import { simulerTuiles, simulerCommunes } from './tuiles-simulees';

/* LES FEUILLES BASSES — la décision d'Armelin du 28/08 : « commence par les
 * bottom sheets ». Sur téléphone, planificateur et menu s'ancrent en bas et
 * se règlent à la poignée ; sur grand écran, RIEN ne change. Tout se mesure
 * en rectangles, comme le socle mobile de la PR #69.
 */

const VUE = { width: 375, height: 812 };

test.beforeEach(async ({ page }) => {
  await simulerTuiles(page);
  await simulerCommunes(page);
});

async function ouvrirCarte(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
}

/** Tire la poignée d'une feuille de `dy` pixels (négatif = vers le haut). */
async function tirer(page: Page, selecteur: string, dy: number, pas = 12): Promise<void> {
  const poignee = (await page.locator(selecteur).boundingBox())!;
  const x = poignee.x + poignee.width / 2;
  const y = poignee.y + poignee.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + dy, { steps: pas });
  await page.mouse.up();
}

test('sur téléphone, le planificateur est une FEUILLE : ancrée en bas, mi-hauteur, carte visible', async ({ page }) => {
  await page.setViewportSize(VUE);
  await ouvrirCarte(page);
  await page.locator('.iti > summary').click();

  const corps = (await page.locator('.iti-corps').boundingBox())!;
  // Ancrée au bas de l'écran, pleine largeur.
  expect(corps.y + corps.height, 'la feuille ne touche pas le bas').toBeGreaterThan(VUE.height - 2);
  expect(corps.x).toBeLessThanOrEqual(1);
  expect(corps.width).toBeGreaterThan(VUE.width - 3);
  // À mi-hauteur : la carte respire au-dessus — c'était le reproche des
  // captures (le volet couvrait l'écran).
  expect(corps.height).toBeGreaterThan(VUE.height * 0.4);
  expect(corps.height).toBeLessThan(VUE.height * 0.6);
  await expect(page.locator('.feuille-poignee').first()).toBeVisible();
});

test('la poignée RÈGLE la hauteur : plein écran au tirer, fermée au geste franc vers le bas', async ({ page }) => {
  await page.setViewportSize(VUE);
  await ouvrirCarte(page);
  await page.locator('.iti > summary').click();
  await expect(page.locator('.iti .feuille-poignee')).toBeVisible();

  // Tirée vers le HAUT : la feuille s'arrime au plein écran (~88 %), et
  // l'en-tête reste visible — une feuille ne mange jamais tout.
  await tirer(page, '.iti .feuille-poignee', -320);
  await expect.poll(async () => (await page.locator('.iti-corps').boundingBox())!.height)
    .toBeGreaterThan(VUE.height * 0.8);
  const entete = (await page.locator('.entete').boundingBox())!;
  const haut = (await page.locator('.iti-corps').boundingBox())!;
  expect(haut.y, 'la feuille recouvre l’en-tête').toBeGreaterThanOrEqual(entete.y + entete.height - 1);

  // Un geste FRANC vers le bas depuis la poignée : la feuille se ferme.
  await tirer(page, '.iti .feuille-poignee', 640, 3);
  await expect(page.locator('.iti')).not.toHaveAttribute('open', '');
  // Et la prochaine ouverture repart à MI-hauteur : la hauteur ne colle pas.
  await page.locator('.iti > summary').click();
  const rouverte = (await page.locator('.iti-corps').boundingBox())!;
  expect(rouverte.height).toBeLessThan(VUE.height * 0.6);
});

test('le MENU aussi est une feuille — même mécanique, même poignée', async ({ page }) => {
  await page.setViewportSize(VUE);
  await ouvrirCarte(page);
  await page.locator('summary[aria-label="Menu : réglages, couches et lieux"]').click();

  const corps = (await page.locator('.reglages-corps').boundingBox())!;
  expect(corps.y + corps.height).toBeGreaterThan(VUE.height - 2);
  expect(corps.width).toBeGreaterThan(VUE.width - 3);
  await expect(page.locator('.reglages .feuille-poignee')).toBeVisible();
});

test('sur GRAND écran, rien ne change : volets latéraux, poignée absente', async ({ page }) => {
  /* La feuille est un remède au pouce et au petit écran — pas une mode à
     imposer au bureau, où les panneaux latéraux laissent lire la carte. */
  await ouvrirCarte(page);
  await page.locator('.iti > summary').click();
  const corps = (await page.locator('.iti-corps').boundingBox())!;
  // Le volet vit à gauche, PAS ancré au bas de la fenêtre.
  expect(corps.x).toBeGreaterThan(4);
  expect(corps.y + corps.height).toBeLessThan(719);
  await expect(page.locator('.iti .feuille-poignee')).toBeHidden();
});
