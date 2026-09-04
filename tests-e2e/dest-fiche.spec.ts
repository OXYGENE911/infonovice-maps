import { test, expect, type Page } from '@playwright/test';
import { simulerTuiles, simulerCommunes } from './tuiles-simulees';

/* LA FICHE DESTINATION, DEUXIÈME TOUR (DEST-2, 04/09).
 *
 * TROIS RETOURS D'ARMELIN SUR LA MÊME FICHE :
 * — « je ne vois aucune adresse apparaître pour ce POI à part le bouton
 *   Y aller » (un restaurant du rail, sans étiquettes addr:*) ;
 * — « je ne peux pas réduire la fenêtre d'information du POI. Je peux la
 *   fermer mais pas la réduire » ;
 * — « un point de géolocalisation bleu apparaît à l'emplacement du POI mais
 *   ne disparaît pas » — la croix RÉDUISAIT sans le dire, et le marqueur
 *   bleu se confondait avec le point de position. */

const REVERSE = {
  features: [{
    geometry: { coordinates: [2.4, 46.605] },
    properties: { label: '3 Rue des Halles 03000 Moulins', type: 'housenumber' },
  }],
};

async function choisirAuRail(page: Page): Promise<void> {
  await simulerTuiles(page);
  await simulerCommunes(page);
  const cors = { 'Access-Control-Allow-Origin': '*' };
  for (const motif of [
    '**/api-adresse.data.gouv.fr/search/**', '**/data.geopf.fr/geocodage/**',
    '**/recherche-entreprises.api.gouv.fr/**', '**/data.education.gouv.fr/**',
  ]) {
    await page.route(motif, (route) => route.fulfill({
      headers: cors, contentType: 'application/json',
      body: JSON.stringify({ features: [], results: [], elements: [] }),
    }));
  }
  await page.route('**/api-adresse.data.gouv.fr/reverse**', (route) => route.fulfill({
    headers: cors, contentType: 'application/json', body: JSON.stringify(REVERSE),
  }));
  /* Un seul lieu, SANS étiquettes d'adresse : le cas Mona Lisa. */
  await page.route('**overpass.openstreetmap.fr**', (route) => route.fulfill({
    headers: cors, contentType: 'application/json',
    body: JSON.stringify({ elements: [
      { type: 'node', id: 1, lat: 46.605, lon: 2.4,
        tags: { amenity: 'restaurant', name: 'Mona Lisa' } },
    ] }),
  }));
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await page.locator('.entete .recherche input').click();
  await page.locator('.entete .recherche-rail').getByRole('button', { name: /Restaurants/ }).click();
  await page.locator('.entete .recherche ul[role="listbox"] li').first().click();
  await expect(page.locator('.fiche-destination .pa-libelle')).toContainText('Mona Lisa');
}

test('L’ADRESSE MANQUANTE SE DEMANDE À LA BAN, et se dit pour ce qu’elle est', async ({ page }) => {
  await choisirAuRail(page);
  /* La fiche dit d'où vient l'adresse : « la plus proche du point » n'est
     pas « l'adresse déclarée du commerce ». */
  await expect(page.locator('.fd-adresse'))
    .toContainText('Adresse la plus proche : 3 Rue des Halles 03000 Moulins');
});

test('LA FICHE DESTINATION PORTE LA RANGÉE DES MODES (RAIL-DISTANCE-ROUTE)', async ({ page }) => {
  /* La mesure du 04/09 a rejeté l'estimation au facteur (rapport
     route/vol d'oiseau de 1,21 à 2,33 sur huit paires) : ici c'est la MÊME
     rangée que la fiche des lieux — du mesuré, une requête par appui. */
  await choisirAuRail(page);
  const fiche = page.locator('.fiche-destination');
  await expect(fiche.getByRole('button', { name: 'Temps de trajet en voiture' })).toBeVisible();
  await expect(fiche.getByRole('button', { name: 'Temps de trajet à pied' })).toBeVisible();
  /* Sans position consentie : pas de promesse, la porte est nommée. */
  await fiche.getByRole('button', { name: 'Temps de trajet en voiture' }).click();
  await expect(page.locator('.poi-fiche-temps-etat')).toContainText('Me localiser');
});

test('RÉDUIRE GARDE LA POIGNÉE, LA CROIX EFFACE TOUT — les deux gestes existent', async ({ page }) => {
  await choisirAuRail(page);

  /* LE MARQUEUR N'EST PLUS BLEU : Armelin le lisait comme « un point de
     géolocalisation ». Le rouge est le pictogramme de la destination. */
  /* Le SVG du marqueur superpose ombre et corps : on cherche l'élément qui
     PORTE la teinte, on ne présume pas de son rang. */
  await expect(page.locator('.maplibregl-marker svg [fill="#D9534F" i]'))
    .not.toHaveCount(0);

  await page.getByRole('button', { name: 'Réduire au marqueur' }).click();
  await expect(page.locator('.fiche-destination')).toHaveCount(0);
  await expect(page.locator('.maplibregl-marker')).toHaveCount(1);

  /* La poignée rouvre la fiche — le geste de DEST-1, conservé. */
  await page.locator('.maplibregl-marker').click();
  await expect(page.locator('.fiche-destination .pa-libelle')).toContainText('Mona Lisa');

  /* La croix, elle, efface fiche ET marqueur : c'est le geste qui manquait —
     « pour le faire disparaître, il faut repartir dans la barre de
     recherche », disait-il. */
  await page.locator('.fiche-destination').locator('..').locator('..')
    .locator('.maplibregl-popup-close-button').click();
  await expect(page.locator('.fiche-destination')).toHaveCount(0);
  await expect(page.locator('.maplibregl-marker')).toHaveCount(0);
});
