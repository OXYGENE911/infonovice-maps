import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { simulerTuiles, simulerCommunes } from './tuiles-simulees';
import { ouvrirVolet, ouvrirMenu } from './volets';
import { ouvrirPlanificateur } from './planificateur';

/* LA PAGE « SANS RÉSEAU » DIT-ELLE VRAI ? (SANS-RESEAU-1, 08/09/2026)
 *
 * Une page qui ÉNUMÈRE ce qui marche hors ligne est une promesse écrite. Elle
 * se démode en silence : il suffit qu'une fonction se mette un jour à
 * interroger un service pour que la page mente sans que personne ne s'en
 * aperçoive. Ce parcours coupe le réseau POUR DE BON — `context.setOffline`,
 * pas une route simulée — et vérifie ligne à ligne ce que la page affirme.
 *
 * ON ATTEND QUE LE SERVICE WORKER PRENNE LA MAIN avant de couper : c'est
 * l'état d'un usager qui a déjà ouvert l'application une fois, et c'est le
 * seul état où la promesse a un sens.
 */

async function premiereVisitePuisCoupure(page: Page, context: BrowserContext): Promise<void> {
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await page.waitForFunction(async () => {
    const r = await navigator.serviceWorker?.getRegistration?.();
    return !!r?.active;
  }, null, { timeout: 20_000 });
  await page.reload();
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await context.setOffline(true);
  await page.evaluate(() => { window.dispatchEvent(new Event('offline')); });
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 823 });
  await simulerTuiles(page);
  await simulerCommunes(page);
});

test('CE QUE LA PAGE PROMET EST VRAI : l’application, les favoris, la mesure, le planificateur', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  // Un favori posé pendant qu'il y a du réseau : on doit le retrouver après.
  await page.evaluate(async () => {
    const d = indexedDB.open('infonovice-maps');
    const db: IDBDatabase = await new Promise((ok, ko) => { d.onsuccess = () => ok(d.result); d.onerror = () => ko(d.error); });
    await new Promise<void>((ok, ko) => {
      const t = db.transaction('favoris', 'readwrite');
      t.objectStore('favoris').put({ id: 'sr1', nom: 'Boulangerie du coin', lon: 2.5, lat: 48.8, ajoute: Date.now() }, 'sr1');
      t.oncomplete = () => ok(); t.onerror = () => ko(t.error);
    });
  });
  await premiereVisitePuisCoupure(page, context);

  // « L'APPLICATION SE RELANCE » — la promesse la plus forte de la page.
  await page.reload();
  await expect(page.locator('#carte canvas.maplibregl-canvas'),
    'l’application ne se relance pas sans réseau').toBeVisible({ timeout: 20_000 });

  // « VOS FAVORIS »
  await ouvrirVolet(page, '.favoris');
  await expect(page.locator('.favoris-liste li').filter({ hasText: 'Boulangerie du coin' }))
    .toHaveCount(1, { timeout: 10_000 });

  // « LE PLANIFICATEUR S'OUVRE » — son module est pré-caché, sinon il ne
  // viendrait jamais (il est chargé à la demande depuis PERF-4).
  await page.keyboard.press('Escape');
  await ouvrirPlanificateur(page);
  await expect(page.locator('.iti-corps')).toBeVisible();

  // « L'OUTIL MESURER »
  await page.keyboard.press('Escape');
  await ouvrirMenu(page);
  const outils = page.locator('details.outils');
  if ((await outils.getAttribute('open')) === null) await page.locator('details.outils summary').click();
  await page.locator('.outils-tuile').filter({ hasText: 'Mesurer' }).first().click();
  await expect(page.locator('.mesure-terminer')).toBeVisible();
});

test('LA RECHERCHE NOMME LA VRAIE CAUSE, et ne dit plus « réessayez »', async ({ page, context }) => {
  /* Mesuré réseau coupé : le message s'affichait, mais il invitait à
     réessayer une chose qui ne peut pas marcher. Réessayer dans un tunnel n'a
     jamais ramené la 4G. */
  await premiereVisitePuisCoupure(page, context);

  const champ = page.locator('input[type="search"]:visible, .recherche input:visible').first();
  await champ.click();
  await page.locator('.recherche input:visible').first().fill('boulangerie');

  const erreur = page.locator('.recherche-erreur:visible');
  await expect(erreur).toContainText('hors réseau', { timeout: 15_000 });
  await expect(erreur).not.toContainText('Réessayez');
});

test('LE BANDEAU MÈNE À LA PAGE, ET LA PAGE S’OUVRE SANS RÉSEAU', async ({ page, context }) => {
  await premiereVisitePuisCoupure(page, context);

  const lien = page.locator('.hors-ligne-lien');
  await expect(lien).toBeVisible();
  await expect(lien).toHaveAttribute('href', '/sans-reseau.html');

  await lien.click();
  await expect(page.locator('h1'), 'la page n’est pas pré-cachée')
    .toContainText('réseau', { timeout: 20_000 });
  // Elle dit les deux moitiés : ce qui marche, et ce qui attend.
  await expect(page.locator('h2').filter({ hasText: 'Ce qui marche' })).toHaveCount(1);
  await expect(page.locator('h2').filter({ hasText: 'attend le réseau' })).toHaveCount(1);
  // Et elle ramène à la carte.
  await expect(page.locator('.page-retour')).toHaveAttribute('href', '/');
});
