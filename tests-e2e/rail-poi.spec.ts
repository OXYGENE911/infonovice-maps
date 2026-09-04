import { test, expect, type Page } from '@playwright/test';
import { simulerTuiles, simulerCommunes } from './tuiles-simulees';

/* LE RAIL DES FAMILLES DE LIEUX (RAIL-POI-1, 04/09).
 *
 * ARMELIN : « il faudrait mettre en place un rail coulissant de catégories
 * de POI sous la page de recherche vierge. Genre les restaurants à
 * proximité, les supermarchés, les pharmacies etc. En cliquant dessus on
 * obtient la liste des restaurants à proximité avec leur distance. »
 *
 * LE RAIL NE VIT QUE SUR LA PAGE VIERGE : dès la première lettre, la place
 * revient aux suggestions. Et la liste qu'il produit est LA liste de la
 * barre — mêmes lignes, mêmes distances, même geste pour choisir. */

/* La réponse Overpass, autour du centre de France (2.4, 46.6) — la vue
   par défaut (leçon RECHERCHE-8b). VOLONTAIREMENT dans le désordre : le
   tri par distance doit venir de nous, pas de la chance. Le nœud sans nom
   prouve que les anonymes sont écartés de la liste. */
const LIEUX_OVERPASS = {
  elements: [
    { type: 'node', id: 2, lat: 46.62, lon: 2.4,
      tags: { amenity: 'restaurant', name: 'Chez Momo' } },
    { type: 'node', id: 4, lat: 46.601, lon: 2.4,
      tags: { amenity: 'fast_food' } },
    { type: 'way', id: 3, center: { lat: 46.56, lon: 2.4 },
      tags: { amenity: 'restaurant', name: 'Auberge Lointaine' } },
    { type: 'node', id: 1, lat: 46.605, lon: 2.4,
      tags: { amenity: 'restaurant', name: 'Crêperie du Centre',
        'addr:housenumber': '4', 'addr:street': 'Rue des Halles',
        'addr:postcode': '03000', 'addr:city': 'Moulins' } },
  ],
};

async function ouvrirLaPage(page: Page): Promise<void> {
  await simulerTuiles(page);
  await simulerCommunes(page);
  const cors = { 'Access-Control-Allow-Origin': '*' };
  for (const motif of [
    '**/api-adresse.data.gouv.fr/**', '**/data.geopf.fr/geocodage/**',
    '**/recherche-entreprises.api.gouv.fr/**',
    '**/data.education.gouv.fr/**', '**/api-lannuaire.service-public.fr/**',
  ]) {
    await page.route(motif, (route) => route.fulfill({
      headers: cors, contentType: 'application/json',
      body: JSON.stringify({ features: [], results: [], elements: [] }),
    }));
  }
  await page.route('**overpass.openstreetmap.fr**', (route) => route.fulfill({
    headers: cors, contentType: 'application/json',
    body: JSON.stringify(LIEUX_OVERPASS),
  }));
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await page.locator('.entete .recherche input').click();
}

const rail = (page: Page) => page.locator('.entete .recherche-rail');
const etat = (page: Page) => page.locator('.entete .recherche-rail-etat');
const lignes = (page: Page) => page.locator('.entete .recherche ul[role="listbox"] li');

test('LE RAIL PARAÎT SUR LA PAGE VIERGE, une case par famille — et s’efface dès qu’on tape', async ({ page }) => {
  await ouvrirLaPage(page);
  await expect(rail(page)).toBeVisible();
  /* TOUTES les familles de la carte, dans le même ordre — deux listes de
     catégories qui divergent seraient deux applications. */
  await expect(rail(page).locator('button')).toHaveCount(15);
  await expect(rail(page).locator('button').first()).toContainText('Restaurants');
  /* Le rail COULISSE : quinze cases ne tiennent pas de front, le
     conteneur doit défiler horizontalement sans élargir la page. */
  const defile = await rail(page).locator('ul').evaluate(
    (e) => e.scrollWidth > e.clientWidth && getComputedStyle(e).overflowX === 'auto',
  );
  expect(defile, 'le rail doit défiler horizontalement').toBe(true);

  const champ = page.locator('.entete .recherche input');
  await champ.fill('gare');
  await expect(rail(page)).toBeHidden();
  await champ.fill('');
  await expect(rail(page)).toBeVisible();
});

test('« RESTAURANTS » LISTE LES LIEUX NOMMÉS, du plus proche au plus loin, avec distance et adresse', async ({ page }) => {
  await ouvrirLaPage(page);
  await rail(page).getByRole('button', { name: /Restaurants/ }).click();

  /* Trois lignes : le nœud sans nom est écarté — une ligne qu'aucun nom ne
     porte ne permet de choisir rien. */
  await expect(lignes(page)).toHaveCount(3);
  await expect(lignes(page).nth(0)).toContainText('Crêperie du Centre');
  await expect(lignes(page).nth(1)).toContainText('Chez Momo');
  await expect(lignes(page).nth(2)).toContainText('Auberge Lointaine');
  /* La distance demandée par Armelin — la plus proche est à ~560 m. */
  await expect(lignes(page).nth(0).locator('.distance')).toContainText(/m$/);
  /* L'adresse postale quand OSM la porte (ADRESSE-POI-1 réutilisée). */
  await expect(lignes(page).nth(0)).toContainText('Rue des Halles');
  /* Et la phrase d'état dit le compte ET l'origine de la mesure : une
     distance sans origine ne veut rien dire. */
  await expect(etat(page)).toContainText('3 lieux');
  await expect(etat(page)).toContainText('le centre de la carte');
});

test('CHOISIR UNE LIGNE DU RAIL remplit le champ et rend la carte', async ({ page }) => {
  await ouvrirLaPage(page);
  await rail(page).getByRole('button', { name: /Restaurants/ }).click();
  await lignes(page).nth(0).click();
  await expect(page.locator('.entete .recherche input')).toHaveValue('Crêperie du Centre');
  /* La page s'est refermée : la carte est rendue à l'usager. */
  await expect(page.locator('body')).not.toHaveClass(/recherche-ouverte/);
});

test('OVERPASS EN PANNE : une phrase en français, jamais une liste morte', async ({ page }) => {
  await ouvrirLaPage(page);
  await page.route('**overpass.openstreetmap.fr**', (route) => route.fulfill({
    status: 504, contentType: 'text/html', body: '<html>Gateway Timeout</html>',
    headers: { 'Access-Control-Allow-Origin': '*' },
  }));
  await rail(page).getByRole('button', { name: /Restaurants/ }).click();
  await expect(etat(page)).toContainText('indisponible');
});

test('FILTRE-RAIL : « Ouvert maintenant » et les cuisines RÉELLEMENT présentes — et les masqués se disent', async ({ page }) => {
  /* ARMELIN, 04/09 : « filtrer le type de cuisine recherché, Italien,
     Chinois, Français, Burger… et sur les horaires d'ouverture afin de
     n'afficher que les POIs encore ouverts autour de nous ».
     TOUT SE FILTRE EN MÉMOIRE (les étiquettes OSM sont dans la réponse) et
     LES PUCES NAISSENT DES RÉSULTATS : proposer « Italien » sans italien à
     5 km promettrait du vide. L'horloge est FIXÉE : « ouvert » se juge à un
     instant, pas au hasard de l'heure de la CI. */
  await page.clock.install({ time: new Date('2026-09-02T10:00:00') }); // mercredi, 10 h
  await simulerTuiles(page);
  await simulerCommunes(page);
  const cors = { 'Access-Control-Allow-Origin': '*' };
  for (const motif of [
    '**/api-adresse.data.gouv.fr/**', '**/data.geopf.fr/geocodage/**',
    '**/recherche-entreprises.api.gouv.fr/**', '**/data.education.gouv.fr/**', '**/api-lannuaire.service-public.fr/**',
  ]) {
    await page.route(motif, (route) => route.fulfill({
      headers: cors, contentType: 'application/json',
      body: JSON.stringify({ features: [], results: [], elements: [] }),
    }));
  }
  await page.route('**overpass.openstreetmap.fr**', (route) => route.fulfill({
    headers: cors, contentType: 'application/json',
    body: JSON.stringify({ elements: [
      { type: 'node', id: 1, lat: 46.601, lon: 2.4,
        tags: { amenity: 'restaurant', name: 'Trattoria Roma', cuisine: 'italian',
          opening_hours: 'Mo-Su 08:00-23:00' } },
      { type: 'node', id: 2, lat: 46.603, lon: 2.4,
        tags: { amenity: 'restaurant', name: 'Dragon d’Or', cuisine: 'chinese',
          opening_hours: 'Mo-Su 01:00-02:00' } },
      { type: 'node', id: 3, lat: 46.605, lon: 2.4,
        tags: { amenity: 'restaurant', name: 'Chez Momo', cuisine: 'burger' } },
    ] }),
  }));
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await page.locator('.entete .recherche input').click();
  await page.locator('.entete .recherche-rail').getByRole('button', { name: /Restaurants/ }).click();

  const lignes = page.locator('.entete .recherche ul[role="listbox"] li');
  await expect(lignes).toHaveCount(3);
  /* Les puces : « Ouvert maintenant » + les cuisines PRÉSENTES, en français. */
  const filtres = page.locator('.recherche-filtres');
  await expect(filtres.getByRole('button', { name: 'Ouvert maintenant' })).toBeVisible();
  await expect(filtres.getByRole('button', { name: 'Italienne' })).toBeVisible();
  await expect(filtres.getByRole('button', { name: 'Chinoise' })).toBeVisible();

  /* La ligne DIT la cuisine, traduite — la donnée OSM était là. */
  await expect(lignes.filter({ hasText: 'Trattoria Roma' })).toContainText('Italienne');
  await expect(lignes.filter({ hasText: 'Dragon d’Or' })).toContainText('Chinoise');

  /* Cuisine : seul l'italien reste. */
  await filtres.getByRole('button', { name: 'Italienne' }).click();
  await expect(lignes).toHaveCount(1);
  await expect(lignes.first()).toContainText('Trattoria Roma');
  await filtres.getByRole('button', { name: 'Italienne' }).click();
  await expect(lignes).toHaveCount(3);

  /* Ouvert maintenant (mercredi 10 h) : la trattoria l'est ; le Dragon
     (01:00-02:00) est fermé ; Chez Momo n'a pas d'horaires — MASQUÉ AUSSI,
     et l'état LE DIT : un masquage muet passerait pour une absence. */
  await filtres.getByRole('button', { name: 'Ouvert maintenant' }).click();
  await expect(lignes).toHaveCount(1);
  await expect(lignes.first()).toContainText('Trattoria Roma');
  const etat = page.locator('.entete .recherche-rail-etat');
  await expect(etat).toContainText('1 fermé');
  await expect(etat).toContainText('1 sans horaires connus');
  await expect(etat).toContainText('vol d’oiseau');
});
