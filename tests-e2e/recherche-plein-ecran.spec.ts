import { test, expect, type Page } from '@playwright/test';
import { simulerTuiles, simulerCommunes } from './tuiles-simulees';

/* LA PAGE DE RECHERCHE PLEIN ÉCRAN (RECHERCHE-7, 03/09).
 *
 * LE TERRAIN. Armelin, rapportant ses usagers : « quand on tape une adresse,
 * la recherche s'affiche dans un tout petit rectangle et la complétion
 * d'adresses dépasse de la zone d'affichage, ce qui ne fait pas très pro ni
 * très beau. Sur Google Maps, cela affiche une page de recherche en plein
 * écran pour bénéficier de toute la surface d'affichage. La carte disparaît et
 * on atterrit dans un vrai module de recherche. Quand on tape un début
 * d'adresse, la complétion affiche les 10 autres adresses potentielles avec
 * leur distance par rapport à ma position géographique. »
 *
 * LE DÉBORDEMENT N'ÉTAIT PAS UN DÉFAUT DE STYLE MAIS DE SURFACE : dix
 * suggestions ne tiennent pas sous une barre de quarante pixels posée sur une
 * carte. Ces parcours mesurent donc des RECTANGLES. */

const MOBILE = { width: 412, height: 915 };

/** La BAN, simulée : dix suggestions autour de Paris, comme en vrai. */
async function simulerBan(page: Page): Promise<void> {
  await page.route('**/api-adresse.data.gouv.fr/search/**', (route) => {
    const features = Array.from({ length: 10 }, (_, i) => ({
      geometry: { type: 'Point', coordinates: [2.35 + i * 0.02, 48.85 + i * 0.01] },
      properties: {
        label: `${i + 1} rue de la Paix 7500${i % 10} Paris`,
        type: 'housenumber', score: 0.9 - i * 0.01, city: 'Paris',
        context: '75, Paris, Île-de-France',
      },
    }));
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ features }) });
  });
}

async function ouvrirCarte(page: Page): Promise<void> {
  await simulerTuiles(page);
  await simulerCommunes(page);
  await simulerBan(page);
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
}

/** La barre du haut — celle de l'en-tête, pas celles du planificateur. */
const barre = (page: Page) => page.locator('.entete recherche-adresse');

test('CHERCHER OUVRE UNE PAGE, et la flèche en revient', async ({ page }) => {
  await page.setViewportSize(MOBILE);
  await ouvrirCarte(page);

  const champ = barre(page).locator('input');
  await expect(barre(page)).not.toHaveClass(/recherche-page/);

  await champ.click();
  await expect(barre(page), 'le clic dans le champ n’ouvre pas la page')
    .toHaveClass(/recherche-page/);

  /* LA PAGE OCCUPE L'ÉCRAN : c'est toute la demande — « bénéficier de toute
     la surface d'affichage ». */
  const b = (await barre(page).boundingBox())!;
  expect(b.width).toBeGreaterThanOrEqual(MOBILE.width - 1);
  expect(b.height).toBeGreaterThanOrEqual(MOBILE.height - 1);

  const retour = page.getByRole('button', { name: 'Revenir à la carte' });
  await expect(retour).toBeVisible();
  await retour.click();
  await expect(barre(page)).not.toHaveClass(/recherche-page/);
});

test('LES DIX SUGGESTIONS TIENNENT DANS LA PAGE, aucune ne déborde', async ({ page }) => {
  await page.setViewportSize(MOBILE);
  await ouvrirCarte(page);

  await barre(page).locator('input').fill('rue de la paix');
  const options = barre(page).locator('[role="option"]');
  await expect(options).toHaveCount(10, { timeout: 10_000 });

  /* LE DÉFAUT SIGNALÉ, AU PIXEL : la complétion dépassait de la zone
     d'affichage. Aucune ligne ne doit sortir de l'écran, ni à droite ni en
     bas — la liste défile DANS la page. */
  const liste = (await barre(page).locator('ul[role="listbox"]').boundingBox())!;
  expect(liste.x).toBeGreaterThanOrEqual(-1);
  expect(liste.x + liste.width).toBeLessThanOrEqual(MOBILE.width + 1);
  expect(liste.y + liste.height).toBeLessThanOrEqual(MOBILE.height + 1);

  for (const i of [0, 4, 9]) {
    const o = (await options.nth(i).boundingBox())!;
    expect(o.x + o.width, `la suggestion ${i + 1} déborde à droite`)
      .toBeLessThanOrEqual(MOBILE.width + 1);
  }
});

test('CHAQUE SUGGESTION DIT SA DISTANCE', async ({ page }) => {
  await page.setViewportSize(MOBILE);
  await ouvrirCarte(page);
  /* ON PLACE LA CARTE : sans position connue, la distance se mesure depuis le
     centre de la carte — et c'est ce que fait l'application tant que
     « Me localiser » n'a pas été pressé. */
  await page.evaluate(() => {
    (window as unknown as { __carte: { jumpTo(o: object): void } })
      .__carte.jumpTo({ center: [2.3522, 48.8566], zoom: 12 });
  });

  await barre(page).locator('input').fill('rue de la paix');
  const options = barre(page).locator('[role="option"]');
  await expect(options).toHaveCount(10, { timeout: 10_000 });

  /* « avec leur distance par rapport à ma position géographique » : chaque
     ligne porte la sienne, en mètres sous le kilomètre. */
  for (const i of [0, 5, 9]) {
    await expect(options.nth(i).locator('.distance'))
      .toHaveText(/^\d+([,.]\d+)?\s(m|km)$/);
  }
  /* ET ELLES CROISSENT : les suggestions simulées s'éloignent une à une du
     centre, la colonne doit le refléter — sinon on afficherait un chiffre
     décoratif. */
  const lire = async (i: number): Promise<number> => {
    const t = await options.nth(i).locator('.distance').textContent();
    const n = Number((t ?? '').replace(/[^\d,.]/g, '').replace(',', '.'));
    return (t ?? '').includes('km') ? n * 1000 : n;
  };
  expect(await lire(9)).toBeGreaterThan(await lire(0));
});

test('ÉCHAP REVIENT À LA CARTE, même sans résultat', async ({ page }) => {
  await page.setViewportSize(MOBILE);
  await ouvrirCarte(page);
  await barre(page).locator('input').click();
  await expect(barre(page)).toHaveClass(/recherche-page/);

  /* C'EST LE CAS LE PLUS FRÉQUENT d'une page ouverte par erreur : on la ferme
     sans avoir rien tapé. Refermer la seule liste laisserait l'usager devant
     un champ vide, sans carte et sans savoir comment revenir. */
  await barre(page).locator('input').press('Escape');
  await expect(barre(page)).not.toHaveClass(/recherche-page/);
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible();
});

test('LES CHAMPS DU PLANIFICATEUR NE PRENNENT PAS L’ÉCRAN', async ({ page }) => {
  await page.setViewportSize(MOBILE);
  await ouvrirCarte(page);
  await page.locator('.iti > summary').click();

  /* ILS VIVENT DÉJÀ DANS UNE FEUILLE qui occupe l'écran : leur en superposer
     une seconde cacherait le trajet qu'on est en train de composer. */
  const depart = page.locator('[data-role="depart"] recherche-adresse');
  await depart.locator('input').click();
  await expect(depart).not.toHaveClass(/recherche-page/);
  await expect(page.locator('body')).not.toHaveClass(/recherche-ouverte/);
});
test('« AUCUN RÉSULTAT » SE LIT DANS LA PAGE, pas après l’avoir quittée', async ({ page }) => {
  /* ARMELIN, en 1.60 : « l'application ne trouve aucun résultat mais je n'ai
     rien d'affiché dans la fenêtre en plein écran de recherche. Quand je
     quitte l'écran de recherche, j'ai le message d'erreur qui s'affiche dans
     un petit rectangle sur la carte. »
     MESURÉ : la note gardait le `position: absolute` du mode barre — en page
     pleine, elle se posait à y = 728 dans une fenêtre de 720. Elle était là,
     écrite, HUIT PIXELS sous le bord. Ce parcours mesure donc sa position,
     pas seulement sa présence : `toBeVisible` de Playwright juge un élément
     hors écran « visible » dès qu'il a une boîte. */
  await page.setViewportSize(MOBILE);
  await ouvrirCarte(page);
  const cors = { 'Access-Control-Allow-Origin': '*' };
  for (const motif of ['**/api-adresse.data.gouv.fr/**', '**/data.geopf.fr/geocodage/**',
    '**/recherche-entreprises.api.gouv.fr/**', '**overpass.openstreetmap.fr**',
    '**/data.education.gouv.fr/**', '**/api-lannuaire.service-public.fr/**']) {
    await page.route(motif, (route) => route.fulfill({
      headers: cors, contentType: 'application/json',
      body: JSON.stringify({ features: [], results: [], elements: [] }),
    }));
  }
  const champ = barre(page).locator('input');
  await champ.click();
  await champ.fill('Fnacdarty');

  const note = barre(page).locator('.recherche-note');
  await expect(note).toBeVisible({ timeout: 10_000 });
  await expect(note).toContainText('Aucune adresse ni lieu');
  await expect(barre(page)).toHaveClass(/recherche-page/);
  const dansLEcran = await note.evaluate((e) => {
    const b = e.getBoundingClientRect();
    return b.top >= 0 && b.bottom <= window.innerHeight && b.height > 0;
  });
  expect(dansLEcran, 'la note doit être DANS l’écran, pas huit pixels dessous').toBe(true);
});
