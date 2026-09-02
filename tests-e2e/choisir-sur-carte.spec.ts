import { test, expect, type Page } from '@playwright/test';
import { simulerTuiles, simulerCommunes } from './tuiles-simulees';
import { ouvrirPlanificateur } from './planificateur';

/* CHOISIR UN POINT SUR LA CARTE (CIBLE-1, 02/09).
 *
 * LE TERRAIN. Armelin, premier retour utilisateur : « ok pour ajouter une
 * adresse en favoris. Par contre comment choisir manuellement, on ne peut pas
 * déplacer le point ? […] dans Google Maps, la fonction s'appelle
 * "Sélectionner sur la carte" : la carte s'affiche avec une croix au milieu et
 * une icône rouge de destination, on peut déplacer la carte mais la croix
 * reste fixe au milieu. Quand on a positionné la croix sur l'emplacement
 * choisi, on peut cliquer sur un unique bouton tout en bas qui s'appelle
 * "Définir". »
 *
 * IL MANQUAIT UNE CHOSE SIMPLE. On savait déjà poser un point par appui long
 * depuis la PR #4 — mais rien ne le proposait depuis le formulaire, donc
 * personne ne le trouvait. Un geste qu'on ne devine pas n'existe pas. */

const PARIS = { lon: 2.3522, lat: 48.8566 };

/** La BAN, simulée : le point visé a une adresse, et on la lit. */
async function simulerBan(page: Page, libelle: string): Promise<{ appels: number }> {
  const compte = { appels: 0 };
  await page.route('**/api-adresse.data.gouv.fr/reverse/**', (route) => {
    compte.appels += 1;
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({
      features: [{
        geometry: { type: 'Point', coordinates: [PARIS.lon, PARIS.lat] },
        properties: { label: libelle, type: 'housenumber', score: 0.9, city: 'Paris' },
      }],
    }) });
  });
  return compte;
}

async function ouvrirCarte(page: Page): Promise<void> {
  await simulerTuiles(page);
  await simulerCommunes(page);
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
}

test('LA MIRE S’OUVRE, LA CROIX EST AU CENTRE, et « Définir » pose le point', async ({ page }) => {
  await ouvrirCarte(page);
  const ban = await simulerBan(page, '10 rue de Rivoli, 75004 Paris');
  await ouvrirPlanificateur(page);

  await page.getByRole('button', { name: 'Choisir la destination sur la carte' }).click();

  /* LE PLANIFICATEUR SE RANGE : sur téléphone il occupe la moitié basse de
     l'écran, et viser à travers un panneau n'est pas viser. */
  await expect(page.locator('details.iti')).not.toHaveAttribute('open', '');

  const mire = page.locator('.cible-mire');
  await expect(mire).toBeVisible();
  await expect(page.locator('.cible-titre'))
    .toHaveText('Amenez la croix sur votre destination');

  /* LA CROIX EST AU CENTRE GÉOMÉTRIQUE DE LA CARTE, celui que `getCenter()`
     rend : si les deux ne coïncidaient pas, on validerait un point qu'on ne
     visait pas. */
  const croix = (await page.locator('.cible-croix').boundingBox())!;
  const canevas = (await page.locator('#carte canvas.maplibregl-canvas').boundingBox())!;
  expect(Math.abs((croix.x + croix.width / 2) - (canevas.x + canevas.width / 2)))
    .toBeLessThan(2);
  expect(Math.abs((croix.y + croix.height / 2) - (canevas.y + canevas.height / 2)))
    .toBeLessThan(2);

  /* L'ADRESSE SE LIT PENDANT QU'ON VISE : savoir CE QU'ON DÉSIGNE avant de
     valider vaut mieux que le découvrir après. */
  await expect(page.locator('.cible-adresse'))
    .toHaveText('10 rue de Rivoli, 75004 Paris', { timeout: 10_000 });

  await page.getByRole('button', { name: 'Définir' }).click();

  await expect(mire).toBeHidden();
  await expect(page.locator('details.iti')).toHaveAttribute('open', '');
  /* LE CHAMP PORTE LE NOM DU LIEU, pas ses coordonnées : « itinéraire vers
     2,3522 ; 48,8566 » ne dit à personne où l'on va. */
  await expect(page.locator('[data-role="arrivee"] recherche-adresse input'))
    .toHaveValue('10 rue de Rivoli, 75004 Paris', { timeout: 10_000 });
  expect(ban.appels, 'la BAN doit être interrogée à la visée ET à la validation')
    .toBeGreaterThanOrEqual(2);
});

test('LA MIRE NE BLOQUE PAS LA CARTE — sans quoi on ne pourrait pas viser', async ({ page }) => {
  await ouvrirCarte(page);
  await simulerBan(page, 'Quelque part');
  await ouvrirPlanificateur(page);
  await page.getByRole('button', { name: 'Choisir le départ sur la carte' }).click();
  await expect(page.locator('.cible-mire')).toBeVisible();

  /* AU CENTRE DE L'ÉCRAN, C'EST LA CARTE QU'ON DOIT TOUCHER, pas le calque :
     `pointer-events: none` est ce qui rend la visée possible. Sans lui, la
     carte ne bougerait plus — et une croix fixe sur une carte fixe ne désigne
     rien. */
  const sousLaCroix = await page.evaluate(() => {
    const r = document.querySelector('#carte')!.getBoundingClientRect();
    const e = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return e?.closest('.cible-mire') !== null ? 'la mire' : (e?.tagName ?? '?');
  });
  expect(sousLaCroix, 'le calque de visée intercepte les gestes de la carte')
    .not.toBe('la mire');
});

test('« ANNULER » NE TOUCHE À RIEN', async ({ page }) => {
  await ouvrirCarte(page);
  await simulerBan(page, '10 rue de Rivoli, 75004 Paris');
  await ouvrirPlanificateur(page);

  await page.getByRole('button', { name: 'Choisir la destination sur la carte' }).click();
  await expect(page.locator('.cible-mire')).toBeVisible();
  await page.getByRole('button', { name: 'Annuler' }).click();

  await expect(page.locator('.cible-mire')).toBeHidden();
  await expect(page.locator('details.iti')).toHaveAttribute('open', '');
  /* LE CHAMP RESTE VIDE : renoncer, c'est renoncer. */
  await expect(page.locator('[data-role="arrivee"] recherche-adresse input'))
    .toHaveValue('');
});

test('SANS ADRESSE, LES COORDONNÉES — jamais un champ vide', async ({ page }) => {
  await ouvrirCarte(page);
  /* EN PLEINE CAMPAGNE LA BAN NE REND RIEN, et un champ vide laisserait croire
     à une panne. Le point, lui, reste parfaitement utilisable. */
  await page.route('**/api-adresse.data.gouv.fr/reverse/**', (route) => route.fulfill({
    contentType: 'application/json', body: JSON.stringify({ features: [] }),
  }));
  await ouvrirPlanificateur(page);
  await page.getByRole('button', { name: 'Choisir la destination sur la carte' }).click();

  await expect(page.locator('.cible-adresse')).not.toHaveText('', { timeout: 10_000 });
  await expect(page.locator('.cible-adresse')).not.toHaveText('Lecture de l’adresse…');

  await page.getByRole('button', { name: 'Définir' }).click();
  /* ON SONDE, ON NE LIT PAS UNE FOIS : « Définir » relit l'adresse avant de
     poser le point, et cette lecture est asynchrone. Un `inputValue()` unique
     attrapait l'instant d'avant. */
  await expect(page.locator('[data-role="arrivee"] recherche-adresse input'),
    'le champ doit porter les coordonnées, pas rester vide')
    .not.toHaveValue('', { timeout: 10_000 });
});
