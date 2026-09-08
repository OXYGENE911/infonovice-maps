import { test, expect, type Page } from '@playwright/test';
import { simulerTuiles, simulerCommunes } from './tuiles-simulees';
import { ouvrirMenu } from './volets';
import { ouvrirPlanificateur, allerA } from './planificateur';

/* LE CHIEN AU VOLANT DANS LES DEUX FENÊTRES (LOGO-1, décidé le 08/09/2026).
 *
 * Le point traînait depuis le 03/09 : « où poser le chien AU VOLANT — un
 * dessin en couleurs au milieu des pictos monochromes des menus jurerait ; à
 * décider avec Armelin ». Sa réponse : « je le vois en haut à droite de la
 * fenêtre itinéraire car il y a un espace vide. Je le vois également en haut
 * à droite de la fenêtre Menu, à condition de réduire la taille du bouton
 * Fonds ».
 *
 * CE QUE CE PARCOURS DÉFEND, ce n'est pas la présence d'une image — c'est
 * qu'elle ne COÛTE RIEN : ni hauteur d'en-tête, ni rangée de menu, ni place
 * prise à la croix de fermeture. Une signature qui rogne la carte n'est plus
 * une signature, c'est un encombrement.
 */

async function ouvrirLaCarte(page: Page): Promise<void> {
  await page.setViewportSize({ width: 412, height: 823 });
  await simulerTuiles(page);
  await simulerCommunes(page);
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
}

test('SUR L’ACCUEIL DU PLANIFICATEUR, il occupe le coin laissé libre', async ({ page }) => {
  await ouvrirLaCarte(page);
  await ouvrirPlanificateur(page);

  const chien = page.locator('.vue-chien');
  await expect(chien).toBeVisible();

  const tete = (await page.locator('.vue-tete').boundingBox())!;
  const c = (await chien.boundingBox())!;
  const titre = (await page.locator('.vue-titre').boundingBox())!;

  // À DROITE, et après le titre : c'est le coin qu'Armelin a nommé.
  expect(Math.round(c.x)).toBeGreaterThan(Math.round(titre.x + titre.width) - 1);
  expect(Math.round(c.x + c.width)).toBeLessThanOrEqual(Math.round(tete.x + tete.width));

  /* ET IL NE COÛTE PAS UN PIXEL DE FEUILLE. Mesuré sans lui : 43 px. Une
     image de 36 px l'aurait porté à 59 — seize pixels de carte en moins — si
     elle n'avait pas débordé sur le rembourrage. */
  expect(Math.round(tete.height), 'l’en-tête a grandi pour une décoration').toBeLessThanOrEqual(45);
  expect(Math.round(c.height), 'trop petit pour se distinguer').toBeGreaterThanOrEqual(32);
});

test('SUR UNE PAGE INTERNE, il cède la place à la croix', async ({ page }) => {
  /* La croix revient dès qu'on entre dans une page : deux images dans un
     en-tête de quarante-trois pixels feraient un bandeau chargé. */
  await simulerTuiles(page);
  await simulerCommunes(page);
  await page.route('**/data.geopf.fr/navigation/itineraire**', (route) => {
    if (/resource=bdtopo-pgr/.test(route.request().url())) {
      return route.fulfill({ contentType: 'application/json', body: '{"portions":[]}' });
    }
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ geometry: { type: 'LineString', coordinates: [[2.35, 48.85], [2.66, 48.54]] }, distance: 45_000, duration: 2_700 }),
    });
  });
  await page.route('**overpass**', (r) => r.fulfill({ contentType: 'application/json', body: '{"elements":[]}' }));
  await page.goto('/#iti=2.35,48.85;2.66,48.54;car');
  await page.reload();
  await expect(page.locator('.iti-resultat')).toContainText('km', { timeout: 15_000 });

  await allerA(page, 'partage');
  await expect(page.locator('.vue-chien')).toBeHidden();
  await expect(page.locator('.vue-fermer')).toBeVisible();
});

test('DANS LE MENU, il tient le coin sans coûter une rangée', async ({ page }) => {
  await ouvrirLaCarte(page);
  await ouvrirMenu(page);

  const chien = page.locator('.reglages-chien');
  await expect(chien).toBeVisible();

  const corps = (await page.locator('.reglages-corps').boundingBox())!;
  const c = (await chien.boundingBox())!;
  // EN HAUT À DROITE du corps du menu, à quelques pixels près.
  expect(Math.round(c.y - corps.y), 'il devrait toucher le haut').toBeLessThanOrEqual(4);
  expect(Math.round(corps.x + corps.width - (c.x + c.width)), 'il devrait toucher la droite')
    .toBeLessThanOrEqual(4);

  /* « À CONDITION DE RÉDUIRE LA TAILLE DU BOUTON FONDS » : c'est fait, et
     c'est ce qui lui donne la place. Sans quoi les deux se recouvriraient. */
  const fonds = (await page.locator('.fonds > summary').boundingBox())!;
  expect(Math.round(fonds.x + fonds.width), 'le bouton Fonds passe sous le chien')
    .toBeLessThanOrEqual(Math.round(c.x));

  /* ET LE BUDGET DE HAUTEUR DU MENU TIENT : la mascotte est posée en absolu,
     elle ne pousse aucune rangée. Le garde-fou des feuilles basses veut ce
     corps sous 62 % de l'écran. */
  expect(Math.round(corps.height)).toBeLessThan(Math.round(823 * 0.62));
});
