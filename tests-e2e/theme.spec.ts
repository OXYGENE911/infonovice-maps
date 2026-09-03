import { test, expect, type Page } from '@playwright/test';
import { simulerTuiles, simulerCommunes } from './tuiles-simulees';
import { ouvrirVolet } from './volets';

/* LE THÈME JOUR / NUIT (THEME-1, 03/09).
 *
 * ARMELIN, en 1.60 : « par défaut je suis en carte mode nuit, mais je n'ai
 * pas la possibilité de changer ce paramétrage du navigateur en plein écran
 * de l'application PWA. Est-ce possible d'ajouter dans le menu la possibilité
 * de changer le thème Jour/Nuit ? »
 *
 * CES PARCOURS MESURENT LA COULEUR CALCULÉE, pas la classe : seize blocs
 * sombres du CSS ont été transformés mécaniquement pour apprendre le choix
 * manuel, et c'est le RENDU qui prouve que la transformation tient — une
 * classe posée sur <html> que le CSS ignorerait passerait un test de classe. */

async function ouvrir(page: Page): Promise<void> {
  await simulerTuiles(page);
  await simulerCommunes(page);
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
}

/* NORMALISÉE : Chrome met les couleurs calculées en minuscules, et Vite
   minifie « #FFFFFF » en « #fff » dans la feuille construite. On étend les
   trois chiffres pour comparer une seule graphie. */
const fondDe = (page: Page): Promise<string> => page.evaluate(() => {
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue('--fond').trim().toLowerCase();
  return /^#[0-9a-f]{3}$/.test(v)
    ? `#${[...v.slice(1)].map((c) => c + c).join('')}` : v;
});

async function choisir(page: Page, libelle: string): Promise<void> {
  await ouvrirVolet(page, '.reglages');
  await page.locator('.reglages-theme-choix').filter({ hasText: libelle }).click();
}

test.describe('téléphone réglé en sombre', () => {
  test.use({ colorScheme: 'dark' });

  test('« JOUR » ÉCLAIRCIT TOUT, malgré le téléphone — c’est sa demande', async ({ page }) => {
    await ouvrir(page);
    expect(await fondDe(page), 'le défaut suit le téléphone').toBe('#0e1014');

    await choisir(page, 'Jour');
    /* LA COULEUR CALCULÉE, pas la classe : c'est elle que l'œil reçoit. */
    expect(await fondDe(page)).toBe('#ffffff');
    /* ET LE CANEVAS DE LA CARTE SUIT : son mode nuit est un filtre JS, pas
       une règle CSS — deux décisions séparées finiraient par diverger. */
    await expect(page.locator('.fond-sombre')).toHaveCount(0);
  });

  test('LE CHOIX SURVIT AU RECHARGEMENT — une PWA se rouvre souvent', async ({ page }) => {
    await ouvrir(page);
    await choisir(page, 'Jour');
    expect(await fondDe(page)).toBe('#ffffff');

    /* ON ATTEND QUE L'ÉCRITURE AIT ATTERRI. `garderTheme` lance l'écriture
       SANS l'attendre — le geste ne doit pas dépendre du stockage — et sur la
       machine d'intégration, plus lente, le rechargement la battait : vert en
       local, rouge en CI. C'est mot pour mot la leçon du mode de déplacement
       (MODE-1), repayée ici avant d'être reconnue. */
    await expect.poll(() => page.evaluate(() => new Promise((ok) => {
      const d = indexedDB.open('infonovice-maps');
      d.onsuccess = () => {
        try {
          const r = d.result.transaction('preferences', 'readonly')
            .objectStore('preferences').get('theme');
          r.onsuccess = () => ok(r.result);
          r.onerror = () => ok('illisible');
        } catch { ok('magasin absent'); }
      };
      d.onerror = () => ok('base illisible');
    })), { timeout: 10_000 }).toBe('clair');

    await page.reload();
    await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
    await expect.poll(() => fondDe(page), { timeout: 10_000 }).toBe('#ffffff');
    // Et la coche du menu dit le choix restauré.
    await ouvrirVolet(page, '.reglages');
    await expect(page.locator('.reglages-theme-choix')
      .filter({ hasText: 'Jour' }).locator('input')).toBeChecked();
  });

  test('« AUTO » REND LA MAIN AU TÉLÉPHONE', async ({ page }) => {
    await ouvrir(page);
    await choisir(page, 'Jour');
    expect(await fondDe(page)).toBe('#ffffff');
    await page.locator('.reglages-theme-choix').filter({ hasText: 'Auto' }).click();
    expect(await fondDe(page), 'auto + téléphone sombre = sombre').toBe('#0e1014');
  });
});

test.describe('téléphone réglé en clair', () => {
  test.use({ colorScheme: 'light' });

  test('« NUIT » ASSOMBRIT TOUT, malgré le téléphone', async ({ page }) => {
    await ouvrir(page);
    expect(await fondDe(page)).toBe('#ffffff');

    await choisir(page, 'Nuit');
    expect(await fondDe(page)).toBe('#0e1014');
    /* LES BLOCS ÉPARS SUIVENT AUSSI, pas seulement les jetons : on mesure une
       couleur qui ne vit QUE dans un bloc sombre de carte.css. Le volet des
       réglages est ouvert : son fond doit être celui de la nuit. */
    const fondVolet = await page.locator('.reglages-corps').evaluate((e) =>
      getComputedStyle(e).backgroundColor);
    expect(fondVolet, 'le volet doit suivre le thème forcé').not.toBe('rgb(255, 255, 255)');
    /* ET LE CANEVAS PASSE EN NUIT : le filtre du fond Plan est piloté en JS,
       c'est le maillon qui pouvait diverger du CSS. */
    await expect(page.locator('.fond-sombre')).toHaveCount(1);
  });
});
