import { test, expect, type Page } from '@playwright/test';
import { simulerTuiles, simulerCommunes } from './tuiles-simulees';

/* LES RACCOURCIS DE TRAJET — « il n'est pas proposé de sélectionner en départ
 * sa position GPS actuelle, ni son adresse de domicile configuré dans son
 * profil », et « il n'est pas possible de configurer un favori ou l'adresse du
 * travail enregistrée dans son profil » (Armelin, 26/08/2026).
 *
 * Retaper une adresse que l'application connaît déjà est un travail qu'on
 * inflige sans raison — et c'est le premier geste de chaque trajet.
 */

test.beforeEach(async ({ page }) => {
  await simulerTuiles(page);
  await simulerCommunes(page);
});

async function ouvrirItineraire(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await page.locator('.maplibregl-ctrl-top-left summary')
    .filter({ hasText: 'Itinéraire' }).click();
  await expect(page.locator('.vue-accueil')).toBeVisible();
}

test('« Ma position » pose le départ, adresse à l’appui', async ({ page, context }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ longitude: 2.3522, latitude: 48.8566 });
  await page.route('**api-adresse.data.gouv.fr/reverse**', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ features: [{
      geometry: { type: 'Point', coordinates: [2.3522, 48.8566] },
      properties: {
        label: '1 rue de Rivoli, 75001 Paris', type: 'housenumber',
        postcode: '75001', city: 'Paris', context: '75, Paris',
      },
    }] }),
  }));
  await ouvrirItineraire(page);

  await page.getByRole('button', { name: 'Partir de ma position actuelle' }).click();
  /* ON NOMME LE LIEU. « Ma position » suffirait à l'usager, mais une adresse
     lui permet de VÉRIFIER que le GPS ne l'a pas placé ailleurs. */
  await expect(page.locator('[data-role="depart"] input'))
    .toHaveValue(/rue de Rivoli/, { timeout: 20_000 });
});

test('une position refusée le DIT, au lieu d’un bouton qui ne fait rien', async ({ page }) => {
  /* Un bouton qui ne produit rien fait croire l'application cassée — c'est le
     même défaut silencieux que le clic « Itinéraire » sans point de départ. */
  await ouvrirItineraire(page);
  await page.getByRole('button', { name: 'Partir de ma position actuelle' }).click();
  await expect(page.locator('.iti-erreur'))
    .toContainText('Position indisponible', { timeout: 25_000 });
});

test('domicile se propose en un geste, au départ comme à l’arrivée', async ({ page }) => {
  await ouvrirItineraire(page);
  // Rien n'est enregistré : aucun raccourci de lieu, seulement « Ma position ».
  await expect(page.getByRole('button', { name: 'Partir de Domicile' })).toHaveCount(0);

  await page.evaluate(async () => {
    const ouvrir = (): Promise<IDBDatabase> => new Promise((ok, non) => {
      const d = indexedDB.open('infonovice-maps', 2);
      d.onsuccess = () => ok(d.result);
      d.onerror = () => non(d.error);
    });
    const db = await ouvrir();
    await new Promise<void>((ok) => {
      const t = db.transaction('preferences', 'readwrite');
      t.objectStore('preferences').put({
        lon: 2.2945, lat: 48.8584, libelle: '5 avenue Anatole France, Paris',
        defini: '2026-08-27T08:00:00.000Z',
      }, 'repere-domicile');
      t.oncomplete = () => ok();
    });
  });

  /* LE VOLET RELIT SES RACCOURCIS À CHAQUE OUVERTURE : domicile, travail et
     favoris se définissent ailleurs, et une liste figée au démarrage les
     aurait ignorés. On referme et l'on rouvre, comme le ferait l'usager
     revenant du panneau « Mes lieux ». */
  await page.locator('.iti > summary').click();
  await page.locator('.iti > summary').click();

  /* IL PORTE SON DESSIN (ERGO-3, 30/08). Armelin : « les textes Ma position,
     domicile, travail, favoris sont affichés sous forme de texte.
     L'ergonomie fait trop formulaire. » Le mot reste À CÔTÉ du dessin : deux
     icônes seules se confondent, et le nom accessible ne remplace pas ce que
     l'œil cherche. */
  const domicile = page.getByRole('button', { name: 'Partir de Domicile' });
  await expect(domicile.locator('svg.picto-domicile')).toBeVisible();
  await expect(domicile).toContainText('Domicile');
  const toit = await page.evaluate(() => getComputedStyle(
    document.querySelector('.iti-raccourci-domicile .picto-toit')!,
  ).stroke);
  expect(toit, 'la maison est ocre, pas grise').toBe('rgb(196, 116, 26)');

  await domicile.click();
  await expect(page.locator('[data-role="depart"] input'))
    .toHaveValue(/avenue Anatole France/);
  // Et le MÊME lieu se propose en arrivée : on rentre aussi chez soi.
  await expect(page.getByRole('button', { name: 'Aller à Domicile' })).toBeVisible();
});

test('un favori se propose aussi, sans qu’on retape son nom', async ({ page }) => {
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
      t.oncomplete = () => ok();
    });
  });
  await page.locator('.iti > summary').click();
  await page.locator('.iti > summary').click();

  /* DEPUIS LE MANDAT UX DU 28/08, les favoris ne s'étalent plus sous chaque
     champ — la capture d'Armelin montrait le mur qu'ils formaient. Un bouton
     « Favoris » ouvre une boîte dédiée ; deux gestes au lieu d'un, mais un
     volet qui respire. */
  await page.locator('[data-pour="arrivee"]')
    .getByRole('button', { name: 'Choisir un favori comme arrivée' }).click();
  await page.locator('dialog.choix-favori')
    .getByRole('button', { name: /Chez ma sœur/ }).click();
  await expect(page.locator('[data-role="arrivee"] input')).toHaveValue('Chez ma sœur');
  // La boîte s'est refermée d'elle-même : le choix est fait, elle n'a plus rien à dire.
  await expect(page.locator('dialog.choix-favori')).not.toBeVisible();
});
