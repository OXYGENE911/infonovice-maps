import { test, expect, type Page } from '@playwright/test';
import { simulerTuiles, simulerCommunes } from './tuiles-simulees';
import { ouvrirVolet } from './volets';

/* LES FAVORIS SUR LA CARTE (MES-POI-1, 04/09).
 *
 * ARMELIN : « lorsqu'on utilise la liste des favoris et qu'on enregistre des
 * POI avec un émoji, ce serait bien de voir apparaître les émojis en
 * question sur la carte. Il faudrait ajouter un filtre "Mes POIs" pour
 * afficher ou masquer ses propres POI. »
 *
 * CES PARCOURS POSENT LE FAVORI COMME L'USAGER — appui long, bouton, choix
 * de liste — puis regardent la CARTE : c'est là que le manque était. */

const ADRESSE = 'Le Bistrot du Coin';

async function ouvrirLaCarte(page: Page): Promise<void> {
  await simulerTuiles(page);
  await simulerCommunes(page);
  await page.route('**api-adresse.data.gouv.fr/reverse**', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ features: [{
      geometry: { coordinates: [2.3522, 48.8566] },
      properties: { label: ADRESSE, type: 'housenumber', postcode: '75001', city: 'Paris' },
    }] }),
  }));
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
}

async function poserUnFavori(page: Page): Promise<void> {
  const canevas = page.locator('#carte canvas.maplibregl-canvas');
  const cadre = await canevas.boundingBox();
  await page.mouse.move(cadre!.x + 200, cadre!.y + 300);
  await page.mouse.down();
  await page.waitForTimeout(700);
  await page.mouse.up();
  await expect(page.locator('.pa-libelle')).toContainText(ADRESSE, { timeout: 10_000 });
  await page.getByRole('button', { name: 'Ajouter aux favoris' }).click();
  await page.locator('.choix-liste').getByRole('button', { name: '⭐ Lieux favoris' }).click();
  await expect(page.getByRole('button', { name: /Ajouté aux favoris/ })).toBeVisible();
}

/** Ce que la couche des favoris porte, lu à la source de la carte. */
function traitsPoses(page: Page): Promise<{ combien: number; image: string | null }> {
  return page.evaluate(() => {
    const carte = (window as unknown as { __carte: {
      getSource(id: string): { serialize(): { data: {
        features: { properties: { image: string } }[];
      } } } | undefined;
    } }).__carte;
    const source = carte.getSource('mes-poi');
    if (!source) return { combien: -1, image: null };
    const traits = source.serialize().data.features;
    return { combien: traits.length, image: traits[0]?.properties.image ?? null };
  });
}

test('LE FAVORI PARAÎT SUR LA CARTE, avec l’émoji de sa liste', async ({ page }) => {
  await ouvrirLaCarte(page);
  await poserUnFavori(page);
  /* La couche existe, le trait porte l'image de SA liste, et l'image est
     bien fabriquée dans la carte — sans elle, MapLibre dessine un trou. */
  await expect.poll(() => traitsPoses(page), { timeout: 10_000 })
    .toEqual({ combien: 1, image: 'mes-poi-favoris' });
  const etat = await page.evaluate(() => {
    const carte = (window as unknown as { __carte: {
      getLayer(id: string): unknown;
      getLayoutProperty(id: string, nom: string): string | undefined;
      hasImage(id: string): boolean;
    } }).__carte;
    return {
      couche: carte.getLayer('mes-poi-points') !== undefined,
      visibilite: carte.getLayoutProperty('mes-poi-points', 'visibility'),
      image: carte.hasImage('mes-poi-favoris'),
    };
  });
  expect(etat.couche, 'la couche des favoris doit exister').toBe(true);
  expect(etat.visibilite, 'et être visible d’emblée — la cacher referait une fonction cachée').toBe('visible');
  expect(etat.image, 'l’émoji doit être peint dans la carte').toBe(true);
});

test('LA PUCE « MES POI » RANGE LES FAVORIS, et le choix survit au rechargement', async ({ page }) => {
  await ouvrirLaCarte(page);
  await poserUnFavori(page);
  await expect.poll(() => traitsPoses(page).then((t) => t.combien)).toBe(1);

  await page.locator('.poi-bulle').click();
  const puce = page.locator('.poi-mes-poi');
  await expect(puce).toHaveAttribute('aria-pressed', 'true');
  await puce.click();
  await expect(puce).toHaveAttribute('aria-pressed', 'false');
  const visibilite = (): Promise<string | undefined> => page.evaluate(() =>
    (window as unknown as { __carte: {
      getLayoutProperty(id: string, nom: string): string | undefined;
    } }).__carte.getLayoutProperty('mes-poi-points', 'visibility'));
  await expect.poll(visibilite).toBe('none');

  /* L'ÉCRITURE EST LANCÉE SANS ÊTRE ATTENDUE (leçon MODE-1) : on guette la
     préférence AVANT de recharger, sinon le rechargement gagne la course
     sur les machines lentes de la CI. */
  await expect.poll(() => page.evaluate(() => new Promise((ok) => {
    const d = indexedDB.open('infonovice-maps');
    d.onsuccess = () => {
      try {
        const r = d.result.transaction('preferences', 'readonly')
          .objectStore('preferences').get('mes-poi-visibles');
        r.onsuccess = () => ok(r.result);
        r.onerror = () => ok('illisible');
      } catch { ok('magasin absent'); }
    };
    d.onerror = () => ok('base illisible');
  })), { timeout: 10_000 }).toBe(false);

  await page.reload();
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await expect.poll(visibilite, { timeout: 10_000 }).toBe('none');
  await page.locator('.poi-bulle').click();
  await expect(page.locator('.poi-mes-poi')).toHaveAttribute('aria-pressed', 'false');
});

test('RETIRER UN FAVORI l’efface de la carte — elle ne ment jamais', async ({ page }) => {
  await ouvrirLaCarte(page);
  await poserUnFavori(page);
  await expect.poll(() => traitsPoses(page).then((t) => t.combien)).toBe(1);

  await ouvrirVolet(page, '.favoris');
  await page.locator('.favori-retirer').first().click();
  await expect.poll(() => traitsPoses(page).then((t) => t.combien), { timeout: 10_000 }).toBe(0);
});
