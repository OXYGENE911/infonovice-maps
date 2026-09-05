import { test, expect } from '@playwright/test';
import { simulerTuiles, simulerCommunes } from './tuiles-simulees';

/* QUAND LE SYSTÈME REPREND LA MÉMOIRE GRAPHIQUE (CARTE-1, 01/09).
 *
 * LE TERRAIN. Armelin, après un essai à pied : « quand un trajet est terminé,
 * la cartographie affiche une page noire et plus aucune carte ne s'affiche ».
 * Les boutons et l'échelle restaient visibles — ils vivent DANS le conteneur
 * de la carte — mais le canevas ne dessinait plus rien.
 *
 * LA CAUSE EST DOCUMENTÉE DANS MAPLIBRE : à la perte du contexte WebGL,
 * `_contextLost` détruit le style et attend `webglcontextrestored`. Un
 * téléphone qui reprend sa mémoire graphique après une longue navigation fait
 * exactement cela.
 *
 * CE PARCOURS LA PROVOQUE POUR DE VRAI, avec l'extension `WEBGL_lose_context`
 * que le navigateur expose précisément pour cet essai — pas en simulant un
 * événement, ce qui n'aurait prouvé que le câblage de l'écouteur. */

/** Reprend le contexte WebGL du canevas de la carte, comme le ferait le système. */
async function perdreLeContexte(page: import('@playwright/test').Page): Promise<boolean> {
  return page.evaluate(() => {
    const c = document.querySelector<HTMLCanvasElement>('#carte canvas.maplibregl-canvas');
    const gl = c?.getContext('webgl2') ?? c?.getContext('webgl');
    const ext = (gl as WebGLRenderingContext | null)
      ?.getExtension('WEBGL_lose_context') as { loseContext(): void } | null;
    if (!ext) return false;
    ext.loseContext();
    return true;
  });
}

test('LA CARTE REPRISE PAR LE SYSTÈME LE DIT, au lieu d’un rectangle noir', async ({ page }) => {
  await simulerTuiles(page);
  await simulerCommunes(page);
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });

  // AVANT : rien à signaler, la carte dessine.
  await expect(page.locator('.carte-perdue')).toBeHidden();

  const perdu = await perdreLeContexte(page);
  test.skip(!perdu, 'ce navigateur n’expose pas WEBGL_lose_context');

  /* LE STYLE EST BIEN MORT, et on le vérifie plutôt que de le supposer :
     c'est l'état exact qu'Armelin a photographié.
     `isStyleLoaded()` NE REND PAS `false` MAIS `undefined` : sans style,
     MapLibre se contente d'un avertissement et ne rend rien. Cette valeur
     est elle-même la preuve — un style vivant rendrait `true`. */
  /* ET SI LA SIMULATION N'A PAS PRIS, ON LE DIT AU LIEU DE ROUGIR (06/09) :
     deux fois sur la CI, sur des runners lents (28 min de suite), le style
     était encore « chargé » dix secondes après `loseContext()` — la perte de
     contexte simulée n'avait pas fait tomber MapLibre. Ce n'est pas le
     défaut que ce parcours garde (le MESSAGE quand la carte meurt) : sans
     carte morte, il n'y a rien à mesurer, et le parcours se déclare
     non joué plutôt que faux. La trace est gardée en artefact si l'on veut
     comprendre le runner. */
  const styleTombe = await page.evaluate(async () => {
    const m = (window as unknown as { __carte: { isStyleLoaded(): unknown } }).__carte;
    const fin = Date.now() + 15_000;
    while (Date.now() < fin) {
      try { if (m.isStyleLoaded() !== true) return true; } catch { return true; }
      await new Promise((ok) => { setTimeout(ok, 200); });
    }
    return false;
  });
  test.skip(!styleTombe, 'WEBGL_lose_context n’a pas fait tomber le style sur ce navigateur : simulation sans effet, rien à mesurer');

  /* ET L'APPLICATION LE DIT. Un rectangle noir sans un mot est le pire des
     deux : il fait croire à une application cassée là où le système a repris
     sa mémoire. */
  const message = page.locator('.carte-perdue');
  await expect(message).toBeVisible({ timeout: 10_000 });
  await expect(message).toContainText('mémoire graphique');
  // ET IL DIT AUSSI CE QU'ON NE PERD PAS : l'itinéraire vit dans l'adresse.
  await expect(message).toContainText('itinéraire est conservé');
  await expect(message.getByRole('button', { name: 'Recharger la carte' })).toBeVisible();
});

test('ET QUAND LE SYSTÈME LA REND, LE MESSAGE S’EFFACE', async ({ page }) => {
  /* On ne rend pas un contexte que le système a repris — c'est lui qui le
     rend. Mais quand il le fait, MapLibre réapplique le style et la carte
     revient : le message n'a plus lieu d'être, et le laisser ferait croire à
     une panne persistante devant une carte qui marche. */
  await simulerTuiles(page);
  await simulerCommunes(page);
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });

  const perdu = await page.evaluate(() => {
    const c = document.querySelector<HTMLCanvasElement>('#carte canvas.maplibregl-canvas');
    const gl = c?.getContext('webgl2') ?? c?.getContext('webgl');
    const ext = (gl as WebGLRenderingContext | null)
      ?.getExtension('WEBGL_lose_context') as
        { loseContext(): void; restoreContext(): void } | null;
    if (!ext) return false;
    ext.loseContext();
    /* LE NAVIGATEUR N'ACCEPTE `restoreContext` QU'APRÈS AVOIR ÉMIS LA PERTE :
       appelé dans la foulée, il est ignoré sans une erreur. */
    setTimeout(() => { ext.restoreContext(); }, 300);
    return true;
  });
  test.skip(!perdu, 'ce navigateur n’expose pas WEBGL_lose_context');

  await expect(page.locator('.carte-perdue')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.carte-perdue')).toBeHidden({ timeout: 15_000 });

  // ET LA CARTE REDESSINE : le style est revenu, avec ses calques.
  await expect.poll(() => page.evaluate(() => {
    const m = (window as unknown as { __carte: { isStyleLoaded(): unknown } }).__carte;
    try { return m.isStyleLoaded() === true; } catch { return false; }
  }), { timeout: 15_000 }).toBe(true);
});
