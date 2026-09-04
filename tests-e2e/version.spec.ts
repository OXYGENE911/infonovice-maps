import { test, expect } from '@playwright/test';
import { simulerTuiles, simulerCommunes } from './tuiles-simulees';
import { ouvrirVolet } from './volets';

/* SAVOIR CE QU'ON EXÉCUTE (VERSION-1, 02/09).
 *
 * LE TERRAIN. Armelin, après un essai à pied : « je ne sais pas si j'ai la
 * bonne version en cache ». L'application est une PWA : son service worker
 * garde le paquet précédent jusqu'à ce qu'il cède la place, et rien à l'écran
 * ne disait laquelle tournait. Trois de ses retours du jour peuvent
 * s'expliquer par un paquet périmé — sans numéro affiché, ni lui ni moi ne
 * pouvons trancher, et c'est cela qu'on corrige d'abord. */

test('LA VERSION SE LIT, et la mise à jour se force', async ({ page }) => {
  await simulerTuiles(page);
  await simulerCommunes(page);
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });

  /* DANS LE MENU, et non dans la bulle « i » : MapLibre reconstruit sa bulle
     d'attribution à chaque changement de contenu — elle se refermait sous le
     doigt, mesuré par ce parcours avant qu'il ne serve à autre chose. */
  await ouvrirVolet(page, '.reglages');

  const version = page.locator('.reglages-version-mot');
  await expect(version).toBeVisible();
  /* UN VRAI NUMÉRO, PAS UN GABARIT : `__VERSION__` non remplacé aurait donné
     un texte qui se lit très bien et ne dit rien. */
  await expect(version).toHaveText(/^Version \d+\.\d+\.\d+$/);

  await expect(page.getByRole('button', { name: 'Mettre à jour l’application' }))
    .toBeVisible();
  /* ET L'ON DIT CE QU'ON NE TOUCHE PAS : un bouton qui vide « le cache » sans
     préciser laisse craindre pour ses favoris. */
  await expect(page.locator('.reglages-version-note'))
    .toContainText('favoris et votre historique ne sont pas touchés');
});

test('LE BOUTON VIDE VRAIMENT LES CACHES avant de recharger', async ({ page }) => {
  /* UN SIMPLE `reload()` PEUT REVENIR SUR LE MÊME PAQUET : c'est le service
     worker qui sert, et il servira la même chose. Le geste n'a de sens que
     s'il efface d'abord. On le vérifie en semant un cache et en regardant
     s'il disparaît. */
  await simulerTuiles(page);
  await simulerCommunes(page);
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });

  await page.evaluate(async () => {
    const c = await caches.open('temoin-version');
    await c.put('/temoin', new Response('vieux paquet'));
  });
  expect(await page.evaluate(() => caches.has('temoin-version'))).toBe(true);

  await ouvrirVolet(page, '.reglages');
  await page.getByRole('button', { name: 'Mettre à jour l’application' }).click();

  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 20_000 });
  /* LE RECHARGEMENT PEUT TOMBER PENDANT LE SONDAGE (attrapé en CI sous
     charge, deux fois le 04/09) : « Execution context was destroyed ». La
     navigation n'est pas un échec — on repolle sur la page d'après. */
  await expect.poll(() => page.evaluate(() => caches.has('temoin-version'))
    .catch(() => null),
  { timeout: 15_000, message: 'le cache témoin a survécu à la mise à jour' })
    .toBe(false);
});
