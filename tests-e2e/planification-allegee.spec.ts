import { test, expect, type Page } from '@playwright/test';
import { simulerTuiles, simulerCommunes } from './tuiles-simulees';

/* LA PLANIFICATION ALLÉGÉE — mandat UX du 28/08 (PR UX-3).
 *
 * Trois reproches, tous vérifiés sur le code avant d'y toucher :
 * « le bouton d'effacement apparaît alors qu'aucun trajet n'existe » — il
 * était permanent dans le gabarit ; les favoris s'étalaient jusqu'à six fois
 * sous CHAQUE champ ; et rien ne permettait d'inverser départ et destination
 * alors que rentrer, c'est le même trajet à l'envers.
 */

test.beforeEach(async ({ page }) => {
  await simulerTuiles(page);
  await simulerCommunes(page);
});

/** BAN simulée : « paris » et « lyon » suffisent à tous les scénarios. */
async function simulerBan(page: Page): Promise<void> {
  await page.route('**/api-adresse.data.gouv.fr/search/**', (route) => {
    const q = new URL(route.request().url()).searchParams.get('q') ?? '';
    const [libelle, lon, lat] = q.includes('lyon')
      ? ['Lyon', 4.8357, 45.7640] : ['Paris', 2.3522, 48.8566];
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ features: [{
      geometry: { coordinates: [lon, lat] },
      properties: { label: libelle, type: 'municipality', postcode: '', city: libelle },
    }] }) });
  });
}

async function ouvrirItineraire(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await page.locator('.maplibregl-ctrl-top-left summary')
    .filter({ hasText: 'Itinéraire' }).click();
  await expect(page.locator('.vue-accueil')).toBeVisible();
}

test('« Effacer » et « Inverser » n’apparaissent qu’une fois un point posé', async ({ page }) => {
  await simulerBan(page);
  await ouvrirItineraire(page);

  /* Volet vierge : rien à effacer, rien à inverser — les boutons se taisent.
     C'était le reproche du mandat : un « Effacer le trajet » permanent
     promet un trajet qui n'existe pas. */
  await expect(page.locator('.iti-effacer')).toBeHidden();
  await expect(page.locator('.iti-inverser')).toBeHidden();

  // Un seul point suffit : il y a désormais matière à effacer et à inverser.
  const champs = page.locator('.iti input[type="search"]');
  await champs.nth(1).fill('lyon');
  await page.getByRole('option', { name: 'Lyon' }).first().click();
  await expect(page.locator('.iti-effacer')).toBeVisible();
  await expect(page.locator('.iti-inverser')).toBeVisible();

  // Effacer rend le volet vierge — et les boutons se rangent d'eux-mêmes.
  await page.locator('.iti-effacer').click();
  await expect(page.locator('.iti-effacer')).toBeHidden();
  await expect(page.locator('.iti-inverser')).toBeHidden();
  await expect(champs.nth(1)).toHaveValue('');
});

test('l’inversion échange départ et destination, et recalcule dans l’autre sens', async ({ page }) => {
  await simulerBan(page);
  const urls: string[] = [];
  await page.route('**/data.geopf.fr/navigation/itineraire**', (route) => {
    urls.push(route.request().url());
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({
      geometry: { type: 'LineString', coordinates: [[2.3522, 48.8566], [4.8357, 45.764]] },
      distance: 465_000, duration: 15_480,
    }) });
  });
  await ouvrirItineraire(page);

  const champs = page.locator('.iti input[type="search"]');
  await champs.nth(0).fill('paris');
  await page.getByRole('option', { name: 'Paris' }).first().click();
  await champs.nth(1).fill('lyon');
  await page.getByRole('option', { name: 'Lyon' }).first().click();
  await expect(page.locator('.iti-resultat')).toContainText('465 km', { timeout: 10_000 });

  const avant = urls.length;
  await page.locator('.iti-inverser').click();

  /* LES COORDONNÉES, PAS SEULEMENT LES CHAMPS : un échange qui ne toucherait
     que l'affichage recalculerait le même trajet sous d'autres étiquettes. La
     requête doit partir de Lyon (4.8357) vers Paris (2.3522). */
  await expect.poll(() => urls.length, { timeout: 10_000 }).toBeGreaterThan(avant);
  const derniere = decodeURIComponent(urls[urls.length - 1] ?? '');
  expect(derniere).toContain('start=4.8357,45.764');
  expect(derniere).toContain('end=2.3522,48.8566');
  // Et les champs suivent : chacun porte désormais le lieu de l'autre.
  await expect(champs.nth(0)).toHaveValue('Lyon');
  await expect(champs.nth(1)).toHaveValue('Paris');
});

test('les favoris ne s’étalent plus sous les champs : une boîte dédiée, avec recherche', async ({ page }) => {
  await ouvrirItineraire(page);
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
  await page.locator('.iti > summary').click();
  await page.locator('.iti > summary').click();

  /* AUCUN favori en ligne sous les champs — c'était le mur de boutons de la
     capture d'Armelin. Seul le bouton d'entrée les annonce, nombre à l'appui. */
  await expect(page.locator('.iti-raccourci')
    .filter({ hasText: 'Chez ma sœur' })).toHaveCount(0);
  const entree = page.locator('[data-pour="depart"]')
    .getByRole('button', { name: 'Choisir un favori comme départ' });
  await expect(entree).toContainText('Favoris (2)');

  await entree.click();
  const boite = page.locator('dialog.choix-favori');
  await expect(boite).toBeVisible();
  await expect(boite.locator('.choix-favori-item')).toHaveCount(2);

  // La recherche filtre — c'est toute sa raison d'être quand la liste s'allonge.
  await boite.locator('.choix-favori-recherche').fill('cabane');
  await expect(boite.locator('.choix-favori-item')).toHaveCount(1);

  await boite.getByRole('button', { name: /Cabane du lac/ }).click();
  await expect(page.locator('[data-role="depart"] input')).toHaveValue('Cabane du lac');
  await expect(boite).not.toBeVisible();

  // Échap referme sans rien poser : c'est le contrat d'un <dialog> natif.
  await entree.click();
  await expect(boite).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(boite).not.toBeVisible();
});
