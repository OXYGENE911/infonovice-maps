import { test, expect, type Page } from '@playwright/test';
import { simulerTuiles, simulerCommunes } from './tuiles-simulees';
import { allerA, retour } from './planificateur';

/* LE PLANIFICATEUR EN PAGES — refonte du 27/08/2026.
 *
 * Armelin, le 26/08 : « quand on clique dans un menu, au lieu d'afficher la
 * fenêtre en gros plan pour configurer les filtres ou les options, le site
 * déroule seulement un formulaire en cascade et on doit scroller dans la
 * fenêtre pour naviguer dans les options ». Et : « au lieu d'ouvrir une
 * nouvelle page à chaque fois qui soit propre et sans nuisance graphique avec
 * un bouton retour ».
 *
 * IL DÉCRIT UN DÉFAUT DE STRUCTURE, PAS DE DÉCORATION. Cinq volets dépliables
 * dans une colonne de trois cents pixels forment un couloir : une feuille de
 * route de quatre-vingts étapes repoussait la météo hors de l'écran.
 */

const PARIS_LYON = '/#iti=2.35220,48.85660;4.83570,45.76400;car';

test.beforeEach(async ({ page }) => {
  await simulerTuiles(page);
  await simulerCommunes(page);
  await page.route('**/data.geopf.fr/navigation/itineraire**', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      geometry: { type: 'LineString', coordinates: [[2.3522, 48.8566], [4.8357, 45.764]] },
      distance: 465_000, duration: 15_480,
    }),
  }));
});

async function ouvrirTrajet(page: Page): Promise<void> {
  await page.goto(PARIS_LYON);
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.iti-resultat')).toContainText('465 km', { timeout: 15_000 });
}

test('une seule page à l’écran, jamais deux', async ({ page }) => {
  await ouvrirTrajet(page);
  const visibles = async (): Promise<string[]> => page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.vue')]
      .filter((v) => !v.hidden).map((v) => v.dataset['vue'] ?? '?'));

  expect(await visibles()).toEqual(['accueil']);
  await allerA(page, 'feuille');
  expect(await visibles(), 'deux pages ouvertes en même temps').toEqual(['feuille']);
  await allerA(page, 'meteo');
  expect(await visibles()).toEqual(['meteo']);
  await retour(page);
  expect(await visibles()).toEqual(['accueil']);
});

test('chaque page porte son titre, et la flèche ne paraît qu’ailleurs', async ({ page }) => {
  await ouvrirTrajet(page);
  const titre = page.locator('.vue-titre');
  const fleche = page.locator('.vue-retour');

  await expect(titre).toHaveText('Où allez-vous ?');
  await expect(fleche, 'une flèche de retour sur l’accueil ne mène nulle part')
    .toBeHidden();

  await allerA(page, 'recharge');
  await expect(titre).toHaveText('Arrêts de recharge');
  await expect(fleche).toBeVisible();

  await retour(page);
  await expect(titre).toHaveText('Où allez-vous ?');
  await expect(fleche).toBeHidden();
});

test('le menu des détails n’existe qu’avec un trajet', async ({ page }) => {
  /* Proposer « feuille de route » quand rien n'est calculé mènerait à une page
     vide : le menu se montre avec le trajet et disparaît avec lui. */
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await page.locator('.maplibregl-ctrl-top-left summary')
    .filter({ hasText: 'Itinéraire' }).click();
  await expect(page.locator('.iti-menu:not(.iti-menu-toujours)')).toBeHidden();

  /* ALLER DE « / » VERS « /#iti=… » NE RECHARGE PAS LA PAGE : seul le fragment
     change, et le trajet porté par le lien n'est rejoué qu'au démarrage. Le
     rechargement est donc explicite — le piège a déjà coûté un parcours le
     26/08. */
  await page.goto(PARIS_LYON);
  await page.reload();
  await expect(page.locator('.iti-resultat')).toContainText('465 km', { timeout: 15_000 });
  await expect(page.locator('.iti-menu:not(.iti-menu-toujours)')).toBeVisible();

  await page.getByRole('button', { name: 'Effacer le trajet' }).click();
  await expect(page.locator('.iti-menu:not(.iti-menu-toujours)')).toBeHidden();
});

test('effacer depuis une page ramène à l’accueil, jamais sur un cadre vide', async ({ page }) => {
  await ouvrirTrajet(page);
  await allerA(page, 'options');
  await expect(page.locator('.vue-titre')).toHaveText('Options du trajet');

  await retour(page);
  await page.getByRole('button', { name: 'Effacer le trajet' }).click();
  await expect(page.locator('.vue-accueil')).toBeVisible();
  await expect(page.locator('.vue-titre')).toHaveText('Où allez-vous ?');
});

test('« Partager » range GPX et KML derrière un mot que tout le monde comprend', async ({ page }) => {
  /* Armelin, le 26/08 : « les boutons GPX et KML nuisent à l'ergonomie en
     affichant des boutons que peu de gens comprendront. Il est préférable
     d'afficher qu'un unique bouton […] "Partager" ». GPX et KML sont des mots
     de métier ; partager est un geste. */
  await ouvrirTrajet(page);
  // Rien de tout cela ne traîne sur l'accueil.
  await expect(page.locator('.iti-gpx')).toBeHidden();
  await expect(page.locator('.iti-kml')).toBeHidden();
  await expect(page.locator('.iti-lien')).toBeHidden();

  await allerA(page, 'partage');
  await expect(page.getByRole('button', { name: 'Copier le lien du trajet' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Fichier GPX' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Fichier KML' })).toBeVisible();
  // Et l'on dit à quoi chacun sert, plutôt que de laisser trois sigles nus.
  await expect(page.locator('.vue[data-vue="partage"]')).toContainText('GPS de randonnée');
});

test('la position connue sert de départ, sans jamais être demandée d’office', async ({ page, context }) => {
  /* Armelin, décrivant ABRP : « une fois qu'on a mis le champ destination, ça
     calcule automatiquement par rapport à notre position actuelle ».
     ON SE SERT DE CE QU'ON A, ON NE PROVOQUE RIEN : la géolocalisation reste
     un geste de l'usager — contrainte 4 du projet, qui ne se négocie pas pour
     un confort. */
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ longitude: 2.3522, latitude: 48.8566 });
  await page.route('**api-adresse.data.gouv.fr/**', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ features: [{
      geometry: { type: 'Point', coordinates: [4.8357, 45.764] },
      properties: {
        label: 'Place Bellecour, 69002 Lyon', type: 'street',
        postcode: '69002', city: 'Lyon', context: '69, Rhône',
      },
    }] }),
  }));
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await page.locator('.maplibregl-ctrl-top-left summary')
    .filter({ hasText: 'Itinéraire' }).click();

  // Tant que rien ne connaît notre position, le départ reste vide.
  await expect(page.locator('[data-role="depart"] input')).toHaveValue('');

  // L'usager presse « Me localiser » : c'est SON geste.
  await page.getByRole('button', { name: 'Me localiser' }).click();

  // Puis il ne saisit QUE la destination.
  await page.locator('[data-role="arrivee"] input').fill('Bellecour');
  await page.locator('[data-role="arrivee"] [role="option"]').first().click();

  await expect(page.locator('[data-role="depart"] input'),
    'la position connue n’a pas servi de départ')
    .toHaveValue('Ma position', { timeout: 20_000 });
  await expect(page.locator('.iti-resultat')).toContainText('465 km', { timeout: 15_000 });
});
