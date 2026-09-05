import { test, expect } from '@playwright/test';
import { simulerTuiles, simulerCommunes } from './tuiles-simulees';
import { ouvrirMenu } from './volets';

/* L'OUTIL « MESURER » (MESURE-1, 05/09/2026).
 *
 * Des amis d'Armelin : « des outils dans le menu : mesurer une distance A→B,
 * et un parcours dessiné point à point ». Le parcours pose des points au
 * doigt sur la carte et lit le relevé — et il garde la règle de la maison :
 * « toute fonction cachée à l'utilisateur est une fonction inutilisable »,
 * donc le relevé se voit AVANT le premier point, et le menu n'a pas grossi
 * au point de déborder du téléphone (le garde-fou de feuilles-basses). */

const VUE = { width: 390, height: 844 };

type Fenetre = { __carte: {
  getLayer(id: string): unknown;
  querySourceFeatures(id: string): unknown[];
} };

test('MESURER : le volet du menu lance la mesure, chaque touche pose un point, le relevé cumule à vol d’oiseau', async ({ page }) => {
  await page.setViewportSize(VUE);
  await simulerTuiles(page);
  await simulerCommunes(page);
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });

  await ouvrirMenu(page);
  // LE MENU RESTE UNE FENÊTRE HAUTE COMME SON CONTENU, pas un demi-écran.
  const corps = (await page.locator('.reglages-corps').boundingBox())!;
  test.info().annotations.push({ type: 'menu', description: `${Math.round(corps.height)} px pour ${VUE.height} px d’écran` });
  expect(corps.height, 'le menu a grossi jusqu’à déborder').toBeLessThan(VUE.height * 0.62);

  await page.locator('.reglages-corps .outils summary').click();
  const releve = page.locator('.mesure-releve');
  await expect(releve).toBeHidden();
  await page.locator('.outils-tuile[data-outil="mesure"]').click();

  // LE MENU S'EST REFERMÉ, LE RELEVÉ DIT QUOI FAIRE — avant tout geste.
  await expect(page.locator('body')).toHaveClass(/mesure-active/);
  await expect(page.locator('details.reglages[open]')).toHaveCount(0);
  await expect(releve).toBeVisible();
  await expect(releve).toContainText('Touchez la carte pour poser le premier point');

  await page.mouse.click(120, 430);
  await expect(releve).toContainText('Un point posé');
  await page.mouse.click(270, 430);
  await expect(releve).toContainText(/2 points · \d+(,\d+)? (m|km) à vol d’oiseau/);
  // Le dessin est sur la carte : trait et points, dans la source.
  await expect.poll(() => page.evaluate(() => {
    const c = (window as unknown as Fenetre).__carte;
    return c.getLayer('mesure-trait') !== undefined && c.getLayer('mesure-points') !== undefined
      ? c.querySourceFeatures('mesure').length : -1;
  })).toBeGreaterThan(0);

  await page.mouse.click(200, 530);
  await expect(releve).toContainText(/3 points/);
  await expect(releve).toContainText('dernier segment');
  await page.getByRole('button', { name: 'Annuler le dernier point' }).click();
  await expect(releve).toContainText(/2 points/);
  await page.getByRole('button', { name: 'Effacer' }).click();
  await expect(releve).toContainText('Touchez la carte');
  await expect(page.getByRole('button', { name: 'Effacer' })).toBeDisabled();

  // ÉCHAP TERMINE — le relevé disparaît, le trait aussi, la carte redevient une carte.
  await page.mouse.click(120, 430);
  await expect(releve).toContainText('Un point posé');
  await page.keyboard.press('Escape');
  await expect(releve).toBeHidden();
  await expect(page.locator('body')).not.toHaveClass(/mesure-active/);
  await expect.poll(() => page.evaluate(() =>
    (window as unknown as Fenetre).__carte.querySourceFeatures('mesure').length)).toBe(0);
});
