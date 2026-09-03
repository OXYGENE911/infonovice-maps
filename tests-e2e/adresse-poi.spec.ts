import { test, expect, type Page } from '@playwright/test';
import { simulerTuiles, simulerCommunes } from './tuiles-simulees';

/* L'ADRESSE POSTALE D'UN LIEU (ADRESSE-POI-1, 03/09).
 *
 * ARMELIN, la nuit du 03/09 : « je constate qu'il y a trop de POI sur
 * lesquels je clique et il n'y a aucune information sur l'adresse du lieu au
 * format texte. Et quand je clic sur "Y aller", le nom commercial du POI
 * s'affiche dans le champ destination et je n'ai toujours aucune idée de
 * l'adresse du lieu. Quand je lance l'itinéraire, ça va bien au bon endroit
 * mais toujours pas de connaissance de l'adresse postale exacte du lieu. »
 *
 * CE QU'IL FAUT SAVOIR AVANT DE CORRIGER : la fiche montrait DÉJÀ une adresse
 * quand OpenStreetMap la déclare — la rubrique « Adresse » de
 * `detail-lieu.ts`. Le manque est donc dans les lieux qui n'ont PAS
 * d'étiquettes `addr:*`, et ils sont le grand nombre. Pour ceux-là, on demande
 * à la BAN. Ces parcours gardent les deux cas, et le fait qu'on ne montre
 * jamais deux adresses pour une. */

const BISTROT_AVEC_ADRESSE = {
  type: 'node', id: 1, lat: 48.8566, lon: 2.3522,
  tags: {
    amenity: 'restaurant', name: 'Le Bistrot',
    'addr:housenumber': '12', 'addr:street': 'rue de la Paix',
    'addr:postcode': '75002', 'addr:city': 'Paris',
  },
};

const BISTROT_SANS_ADRESSE = {
  type: 'node', id: 2, lat: 48.8566, lon: 2.3522,
  tags: { amenity: 'restaurant', name: 'Chez Nini' },
};

async function ouvrirLaFiche(page: Page, options: {
  lieu: unknown; adresseBan?: unknown[] | 'panne';
}): Promise<void> {
  const cors = { 'Access-Control-Allow-Origin': '*' };
  await simulerTuiles(page);
  await simulerCommunes(page);
  await page.route('**overpass.openstreetmap.fr**', (route) => route.fulfill({
    headers: cors, contentType: 'application/json',
    body: JSON.stringify({ elements: [options.lieu] }),
  }));
  await page.route('**/api-adresse.data.gouv.fr/reverse/**', (route) => {
    if (options.adresseBan === 'panne') return route.fulfill({ status: 503, headers: cors, body: '' });
    return route.fulfill({
      headers: cors, contentType: 'application/json',
      body: JSON.stringify({ features: options.adresseBan ?? [] }),
    });
  });
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Filtrer les lieux affichés sur la carte' }).click();
  await page.locator('.poi-famille[data-cle="restaurant"]').click();
  /* LES LIEUX NE SE CHERCHENT QU'AU ZOOM 15 ET AU REPOS : c'est la frugalité
     du filtre (600 ms de repos, 1 500 ms entre deux appels). Sans ce saut, le
     service n'est jamais interrogé et la fiche n'existe pas. */
  await page.evaluate(() => {
    (window as unknown as { __carte: { jumpTo(o: object): void } })
      .__carte.jumpTo({ center: [2.3522, 48.8566], zoom: 15 });
  });
  await expect(page.locator('.poi-filtre-etat')).toContainText('1 lieu', { timeout: 15_000 });
  await page.locator('.poi-bulle').click();
  await page.locator('#carte canvas.maplibregl-canvas').click({
    position: await page.evaluate(() => {
      const c = (window as unknown as { __carte: {
        project(l: [number, number]): { x: number; y: number };
      } }).__carte;
      const p = c.project([2.3522, 48.8566]);
      return { x: Math.round(p.x), y: Math.round(p.y) };
    }),
  });
  await expect(page.locator('.poi-fiche')).toBeVisible({ timeout: 10_000 });
}

const ADRESSE_BAN = [{
  geometry: { type: 'Point', coordinates: [2.3522, 48.8566] },
  properties: {
    label: '5 Rue Vivienne 75002 Paris', type: 'housenumber',
    postcode: '75002', city: 'Paris',
  },
}];

test('UN LIEU SANS ÉTIQUETTE D’ADRESSE en reçoit une de la BAN', async ({ page }) => {
  /* C'est le cas qu'Armelin décrit : la majorité des POI d'OpenStreetMap
     n'ont pas d'étiquettes `addr:*`, et la fiche restait muette. */
  await ouvrirLaFiche(page, { lieu: BISTROT_SANS_ADRESSE, adresseBan: ADRESSE_BAN });
  const fiche = page.locator('.poi-fiche');
  await expect(fiche.locator('.poi-fiche-adresse'))
    .toContainText('5 Rue Vivienne 75002 Paris', { timeout: 10_000 });
  /* ET L'ON DIT D'OÙ ELLE VIENT. Ce n'est pas la même chose de lire l'adresse
     DÉCLARÉE d'un commerce et l'adresse la plus proche de son point : la
     seconde peut être celle de l'immeuble d'à côté. */
  await expect(fiche.locator('.poi-fiche-adresse')).toContainText('la plus proche');
});

test('UN LIEU QUI DÉCLARE SON ADRESSE n’en montre PAS deux', async ({ page }) => {
  /* LA FICHE EN AVAIT DÉJÀ UNE, et j'ai failli la doubler : la rubrique
     « Adresse » existe depuis FICHE-2. Deux lignes pour la même chose feraient
     une fiche qui se répète — et donneraient à croire à deux adresses. */
  await ouvrirLaFiche(page, { lieu: BISTROT_AVEC_ADRESSE });
  const fiche = page.locator('.poi-fiche');
  await expect(fiche).toContainText('12 rue de la Paix');
  await expect(fiche.locator('.poi-fiche-adresse')).toHaveCount(0);
});

test('« Y ALLER » PORTE L’ADRESSE dans le champ destination', async ({ page }) => {
  /* « le nom commercial du POI s'affiche dans le champ destination et je n'ai
     toujours aucune idée de l'adresse du lieu ». « Chez Nini » ne se dicte pas
     au téléphone ; « Chez Nini — 5 Rue Vivienne 75002 Paris » se dicte. */
  await ouvrirLaFiche(page, { lieu: BISTROT_SANS_ADRESSE, adresseBan: ADRESSE_BAN });
  // On attend que l'adresse soit arrivée : le libellé la porte.
  await expect(page.locator('.poi-fiche-adresse')).toContainText('Vivienne', { timeout: 10_000 });
  await page.locator('.poi-fiche-aller').click();
  await expect(page.locator('[data-role="arrivee"] input'))
    .toHaveValue(/Chez Nini — 5 Rue Vivienne 75002 Paris/, { timeout: 10_000 });
});

test('SANS RÉPONSE DE LA BAN, la fiche le DIT au lieu d’inventer', async ({ page }) => {
  /* « Ce qui manque manque à la carte » est la règle de ce projet depuis les
     fiches de bornes. Poser une rue voisine ferait croire à l'usager qu'il
     tient l'adresse — et il partirait la chercher. */
  await ouvrirLaFiche(page, { lieu: BISTROT_SANS_ADRESSE, adresseBan: [] });
  await expect(page.locator('.poi-fiche-adresse'))
    .toContainText('inconnue de la Base Adresse Nationale', { timeout: 10_000 });
});

test('UNE PANNE DE LA BAN NE FAIT PAS DIRE « adresse inconnue »', async ({ page }) => {
  /* Une panne n'est pas une absence : c'est la leçon payée deux fois sur
     Overpass, et elle vaut ici aussi. */
  await ouvrirLaFiche(page, { lieu: BISTROT_SANS_ADRESSE, adresseBan: 'panne' });
  const ligne = page.locator('.poi-fiche-adresse');
  await expect(ligne).toContainText('indisponible', { timeout: 10_000 });
  await expect(ligne).not.toContainText('inconnue');
});
