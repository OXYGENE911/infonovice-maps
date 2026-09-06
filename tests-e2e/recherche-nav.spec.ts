import { test, expect, type Page } from '@playwright/test';
import { simulerTuiles, simulerCommunes } from './tuiles-simulees';

/* LA LOUPE DU SUIVI (RECHERCHE-NAV-1, 05/09/2026).
 *
 * Des amis d'Armelin : « en mode navigation, il n'y a pas de bouton rond loupe
 * permettant de chercher une adresse, une borne, une station ou un restaurant
 * et de l'ajouter en étape. » NAV-2 efface l'en-tête en suivi, et la barre de
 * recherche avec ; un bouton rond rouvre la MÊME page plein écran, et le lieu
 * choisi devient une étape : le parcours regarde ce qui PART vers le service
 * d'itinéraire — c'est là que l'étape se prouve. */

const TRACE: [number, number][] = Array.from({ length: 21 }, (_, i) => [2.3400 + i * 0.0014, 48.8500]);
const ETAPE = { lon: 2.3520, lat: 48.8530, libelle: 'Gare de Lyon, 75012 Paris' };

async function suivre(page: Page): Promise<{ itineraires: string[] }> {
  const itineraires: string[] = [];
  await simulerTuiles(page);
  await simulerCommunes(page);
  await page.context().grantPermissions(['geolocation']);
  await page.context().setGeolocation({ longitude: TRACE[0]![0], latitude: TRACE[0]![1] });
  await page.route('**/data.geopf.fr/navigation/itineraire**', (route) => {
    const url = decodeURIComponent(route.request().url());
    if (/resource=bdtopo-pgr/.test(url)) {
      return route.fulfill({ contentType: 'application/json', body: '{"portions":[]}' });
    }
    itineraires.push(url);
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({
      geometry: { type: 'LineString', coordinates: TRACE }, distance: 2_050, duration: 240,
    }) });
  });
  await page.route('**overpass.openstreetmap.fr**', (route) => route.fulfill({
    contentType: 'application/json', body: '{"elements":[]}',
  }));
  await page.route('**/www.bison-fute.gouv.fr/**', (route) => route.fulfill({
    contentType: 'application/json', body: '[]',
  }));
  await page.route('**/api-adresse.data.gouv.fr/search/**', (route) => route.fulfill({
    contentType: 'application/json', body: JSON.stringify({ features: [{
      geometry: { coordinates: [ETAPE.lon, ETAPE.lat] },
      properties: { label: ETAPE.libelle, type: 'street', postcode: '75012', city: 'Paris', name: 'Gare de Lyon' },
    }] }),
  }));
  await page.goto(`/#iti=${TRACE[0]![0]},${TRACE[0]![1]};${TRACE[20]![0]},${TRACE[20]![1]};car`);
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  return { itineraires };
}

test('EN SUIVI, LA LOUPE ROUVRE LA RECHERCHE ET LE LIEU CHOISI DEVIENT UNE ÉTAPE ; hors suivi, pas de loupe', async ({ page }) => {
  const { itineraires } = await suivre(page);
  const loupe = page.locator('.recherche-nav');
  await expect(loupe).toBeHidden();

  await page.getByRole('button', { name: 'Démarrer le suivi' }).click();
  await expect(page.locator('bandeau-guidage')).toBeVisible({ timeout: 15_000 });
  await expect(loupe).toBeVisible();
  // L'en-tête — et sa barre — sont effacés par NAV-2 : c'est ce que la loupe contourne.
  const barre = page.locator('.entete recherche-adresse');
  await expect(barre).toBeHidden();

  const avant = itineraires.length;
  await loupe.click();
  await expect(barre).toHaveClass(/recherche-page/);
  await expect(barre).toBeVisible();
  const champ = barre.locator('input');
  await expect(champ).toBeFocused();
  // LA POSITION EST DÉJÀ CONNUE (RETOURS-0609) : pas de nouvelle invite à se localiser.
  await expect(barre.locator('.recherche-ici')).toBeHidden();
  await champ.fill('gare de lyon');
  const option = barre.locator('[role="option"]').first();
  await expect(option).toContainText('Gare de Lyon', { timeout: 10_000 });
  await option.click();

  // CE QUI PART : une requête d'itinéraire qui porte l'étape choisie.
  await expect.poll(() => itineraires.length, { timeout: 15_000 }).toBeGreaterThan(avant);
  const derniere = itineraires[itineraires.length - 1] ?? '';
  expect(derniere, 'le lieu choisi est devenu une étape du trajet').toContain('intermediates=2.352,48.853');
  // La page s'est refermée, le suivi n'a pas été interrompu.
  await expect(barre).not.toHaveClass(/recherche-page/);
  await expect(barre).toBeHidden();
  await expect(page.locator('body')).toHaveClass(/en-guidage/);
  await expect(page.locator('bandeau-guidage')).toBeVisible();
  await expect(loupe).toBeVisible();
  // BARRE-2 : l'étape ajoutée est le prochain arrêt, dit en vert dans la barre dépliée.
  await expect(page.locator('attente-chien')).toBeHidden({ timeout: 15_000 });
  const deplier = page.getByRole('button', { name: 'Afficher les commandes du suivi' });
  if ((await deplier.getAttribute('aria-expanded')) !== 'true') await deplier.click();
  await expect(page.locator('.bg-prochain')).toContainText('Prochain arrêt — Étape 1', { timeout: 15_000 });

  // À l'arrêt du suivi, la loupe disparaît ; la barre du haut revient.
  await page.locator('.bg-arreter').click();
  await expect(loupe).toBeHidden();
  await expect(barre).toBeVisible();
});
