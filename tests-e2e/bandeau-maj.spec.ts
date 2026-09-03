import { test, expect, type Page } from '@playwright/test';
import { simulerTuiles, simulerCommunes } from './tuiles-simulees';

/* L'ANNONCE D'UNE NOUVELLE VERSION (MAJ-1, 03/09).
 *
 * ARMELIN, en 1.60 : « j'ai des testeurs qui ne savaient pas qu'il fallait
 * rafraîchir l'application pour la mettre à jour. Comment est-ce possible de
 * leur afficher une popup quelque part pour les prévenir qu'une nouvelle
 * version est disponible ? »
 *
 * CES PARCOURS SIMULENT L'ANNONCE en dépêchant l'événement que main.ts émet
 * quand le service worker voit une version : jouer le VRAI cycle de vie d'un
 * service worker en test demanderait de publier deux builds — c'est le
 * déploiement réel qui prouve cette moitié-là. Ce qu'on garde ici : le
 * bandeau paraît, n'agit jamais seul, et « Plus tard » est une vraie réponse. */

async function ouvrir(page: Page): Promise<void> {
  await simulerTuiles(page);
  await simulerCommunes(page);
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
}

test('LE BANDEAU PARAÎT À L’ANNONCE, et jamais avant', async ({ page }) => {
  await ouvrir(page);
  await expect(page.locator('.maj-bandeau')).toBeHidden();

  await page.evaluate(() => {
    document.dispatchEvent(new CustomEvent('maj-disponible', {
      detail: { appliquer: () => { (window as unknown as { __maj: boolean }).__maj = true; } },
    }));
  });
  const bandeau = page.locator('.maj-bandeau');
  await expect(bandeau).toBeVisible();
  await expect(bandeau).toContainText('nouvelle version');
  // ET RIEN N'A ÉTÉ APPLIQUÉ : l'annonce n'est pas l'action.
  expect(await page.evaluate(() => (window as unknown as { __maj?: boolean }).__maj)).toBeUndefined();
});

test('« METTRE À JOUR » APPLIQUE — c’est l’usager qui choisit le moment', async ({ page }) => {
  await ouvrir(page);
  await page.evaluate(() => {
    document.dispatchEvent(new CustomEvent('maj-disponible', {
      detail: { appliquer: () => { (window as unknown as { __maj: boolean }).__maj = true; } },
    }));
  });
  await page.locator('.maj-oui').click();
  await expect.poll(() => page.evaluate(() =>
    (window as unknown as { __maj?: boolean }).__maj)).toBe(true);
});

test('« PLUS TARD » REFERME, sans revenir hanter la session', async ({ page }) => {
  /* Ces gens conduisent : un bandeau qui reviendrait toutes les minutes
     serait pire que le silence qu'on corrige. La version sera là au prochain
     lancement, et le bouton du menu reste disponible. */
  await ouvrir(page);
  await page.evaluate(() => {
    document.dispatchEvent(new CustomEvent('maj-disponible', { detail: {} }));
  });
  await expect(page.locator('.maj-bandeau')).toBeVisible();
  await page.locator('.maj-tard').click();
  await expect(page.locator('.maj-bandeau')).toBeHidden();
});

test('LE BANDEAU NE RECOUVRE PAS l’attribution IGN — une obligation, pas un goût', async ({ page }) => {
  await ouvrir(page);
  await page.evaluate(() => {
    document.dispatchEvent(new CustomEvent('maj-disponible', { detail: {} }));
  });
  await expect(page.locator('.maj-bandeau')).toBeVisible();
  const chevauche = await page.evaluate(() => {
    const b = document.querySelector('.maj-bandeau')?.getBoundingClientRect();
    const a = document.querySelector('.maplibregl-ctrl-attrib')?.getBoundingClientRect();
    if (!b || !a) return 'introuvable';
    return b.bottom > a.top + 1 && b.top < a.bottom ? 'chevauche' : '';
  });
  expect(chevauche).toBe('');
});
