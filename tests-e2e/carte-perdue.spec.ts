import { test, expect, type Page } from '@playwright/test';
import { simulerTuiles, simulerCommunes } from './tuiles-simulees';

/* L'ÉCRAN BLANC DE FIN DE TRAJET (BLANC-1, 04/09).
 *
 * ARMELIN : « à la fin du parcours, écran blanc. Obligé de rafraîchir la
 * page pour faire revenir la carte. » L'alerte « carte perdue » existait
 * depuis le 01/09 — mais elle vivait à z-index 5, SOUS l'en-tête (20) et
 * les bandeaux (30) : le canevas mort laissait un écran blanc et le bouton
 * « Recharger » était enterré sous l'interface. Ces parcours MESURENT
 * qu'elle est réellement au-dessus, et que le filet des casses muettes dit
 * ce qui s'est cassé. */

async function ouvrirCarte(page: Page): Promise<void> {
  await simulerTuiles(page);
  await simulerCommunes(page);
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
}

/** Fait perdre le contexte WebGL — ce que fait un téléphone sous pression. */
function perdreLeContexte(page: Page): Promise<void> {
  return page.evaluate(() => {
    const toile = document.querySelector<HTMLCanvasElement>('#carte canvas.maplibregl-canvas')!;
    const gl = (toile.getContext('webgl2') ?? toile.getContext('webgl')) as WebGLRenderingContext;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  });
}

test('LA CARTE PERDUE SE DIT AU-DESSUS DE TOUT — et son bouton se touche', async ({ page }) => {
  await ouvrirCarte(page);
  await perdreLeContexte(page);

  const alerte = page.locator('.carte-perdue');
  await expect(alerte).toBeVisible({ timeout: 10_000 });
  await expect(alerte).toContainText('la carte ne peut plus se dessiner');

  /* AU-DESSUS DE TOUT, MESURÉ : au centre de l'écran ET dans la bande de
     l'en-tête, ce qu'on touche appartient à l'alerte — pas à l'interface
     qu'elle doit recouvrir. C'est le défaut exact : le bouton existait,
     il était recouvert. */
  const dessus = await page.evaluate(() => {
    const au = (x: number, y: number): boolean => {
      const e = document.elementFromPoint(x, y);
      return e !== null && e.closest('.carte-perdue') !== null;
    };
    return {
      centre: au(window.innerWidth / 2, window.innerHeight / 2),
      entete: au(window.innerWidth / 2, 30),
    };
  });
  expect(dessus.centre, 'le centre doit appartenir à l’alerte').toBe(true);
  expect(dessus.entete, 'même la bande de l’en-tête est recouverte').toBe(true);

  const bouton = page.getByRole('button', { name: 'Recharger la carte' });
  await expect(bouton).toBeVisible();
});

test('LE CONTEXTE REND LA MAIN : l’alerte s’efface d’elle-même', async ({ page }) => {
  await ouvrirCarte(page);
  await page.evaluate(() => {
    const toile = document.querySelector<HTMLCanvasElement>('#carte canvas.maplibregl-canvas')!;
    const gl = (toile.getContext('webgl2') ?? toile.getContext('webgl')) as WebGLRenderingContext;
    const ext = gl.getExtension('WEBGL_lose_context')!;
    ext.loseContext();
    setTimeout(() => { ext.restoreContext(); }, 600);
  });
  await expect(page.locator('.carte-perdue')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.carte-perdue')).toBeHidden({ timeout: 15_000 });
});

test('UNE CASSE MUETTE SE DIT — une fois, avec la porte de sortie', async ({ page }) => {
  await ouvrirCarte(page);
  /* Une exception non rattrapée, comme en produirait un défaut réel. */
  await page.evaluate(() => {
    setTimeout(() => { throw new Error('casse simulée'); }, 0);
    setTimeout(() => { throw new Error('seconde casse'); }, 50);
  });
  const bandeau = page.locator('.casse-bandeau');
  await expect(bandeau).toBeVisible({ timeout: 5_000 });
  await expect(bandeau).toHaveCount(1);
  await expect(bandeau).toContainText('Quelque chose s’est cassé');
  await expect(bandeau.getByRole('button', { name: 'Recharger' })).toBeVisible();
  /* Elle se referme — un aveu, pas un harcèlement. */
  await bandeau.getByRole('button', { name: 'Fermer cet avertissement' }).click();
  await expect(bandeau).toHaveCount(0);
});
