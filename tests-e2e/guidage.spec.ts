import { test, expect, type Page } from '@playwright/test';
import { simulerTuiles, simulerCommunes } from './tuiles-simulees';

/* LE SUIVI D'ITINÉRAIRE — « il n'y a pas de bouton pour démarrer l'itinéraire »
 * (Armelin, 25/08/2026).
 *
 * CE QUE CES PARCOURS DÉFENDENT AVANT TOUT : que l'application n'appelle
 * jamais « navigation » ce qui n'en est pas une. Le bandeau dit qu'il n'a ni
 * voix ni recalcul, et il le dit AVANT qu'on en ait besoin — on ne découvre
 * pas l'absence de recalcul à la sortie d'autoroute.
 */

const PARIS_LYON = '/#iti=2.35220,48.85660;4.83570,45.76400;car';

/** Le tracé simulé : une ligne droite, deux points, et une feuille de route. */
const GEOMETRIE = {
  type: 'LineString',
  coordinates: [[2.3522, 48.8566], [4.8357, 45.764]],
};

test.beforeEach(async ({ page, context }) => {
  await simulerTuiles(page);
  await simulerCommunes(page);
  await page.route('**/data.geopf.fr/navigation/itineraire**', (route) => {
    const url = route.request().url();
    /* LA FEUILLE DE ROUTE ET LE CALCUL PARTAGENT LEUR URL, à un paramètre
       près : c'est le même service, interrogé avec ou sans les instructions.
       Les distinguer est nécessaire, sans quoi le tracé arriverait sans
       géométrie. */
    if (/getSteps=true/i.test(url)) {
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          geometry: GEOMETRIE, distance: 390_000, duration: 13_000,
          /* LA FORME DU SERVICE EST PROFONDE : le nom de la voie vit sous
             `attributes.name.cpx_numero`, pas dans un champ `name` à plat.
             Une fixture à plat rendait des étapes sans voie — et le parcours
             accusait le code d'un défaut qui était dans la simulation. */
          portions: [{ steps: [
            { instruction: { type: 'depart' }, distance: 200_000,
              attributes: { name: { cpx_numero: 'A6' } } },
            { instruction: { type: 'turn', modifier: 'right' }, distance: 190_000,
              attributes: { name: { cpx_numero: 'A7' } } },
          ] }],
        }),
      });
    }
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ geometry: GEOMETRIE, distance: 390_000, duration: 13_000 }),
    });
  });
  // La géolocalisation est un GESTE : on l'autorise, on ne la déclenche pas.
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ longitude: 2.3522, latitude: 48.8566 });
});

async function ouvrirTrajet(page: Page): Promise<void> {
  await page.goto(PARIS_LYON);
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.iti-resultat')).toContainText('390 km', { timeout: 15_000 });
}

test('sans trajet, proposer de le suivre n’aurait aucun sens', async ({ page }) => {
  /* CE TEST EST SÉPARÉ DU SUIVANT, ET CE N'EST PAS UN DÉCOUPAGE DE CONFORT :
     aller de « / » vers « /#iti=… » ne change que le FRAGMENT, donc ne
     recharge pas la page — et le trajet porté par le lien n'est rejoué qu'au
     démarrage. Les deux gestes dans un même parcours mesuraient donc un
     itinéraire qui n'avait jamais été calculé. */
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await page.locator('.maplibregl-ctrl-top-left summary').filter({ hasText: 'Itinéraire' }).click();
  await expect(page.locator('.iti-demarrer')).toBeHidden();
});

test('le bouton « Démarrer » lance le suivi, instructions comprises', async ({ page }) => {
  await ouvrirTrajet(page);
  const demarrer = page.getByRole('button', { name: 'Démarrer le suivi' });
  await expect(demarrer).toBeVisible();

  await demarrer.click();
  const bandeau = page.locator('bandeau-guidage');
  await expect(bandeau).toBeVisible({ timeout: 15_000 });

  // L'instruction vient de la feuille de route, et elle est en FRANÇAIS.
  await expect(bandeau.locator('.bg-instruction')).toContainText('A6', { timeout: 15_000 });
  await expect(bandeau.locator('.bg-restant')).toContainText('restants');
  await expect(bandeau.locator('.bg-restant')).toContainText('arrivée vers');
});

test('le bandeau DIT qu’il n’est pas une navigation guidée', async ({ page }) => {
  /* Une application qui annonce « navigation » et rend un suivi trompe au
     moment précis où l'on ne peut pas regarder l'écran pour vérifier. */
  await ouvrirTrajet(page);
  await page.getByRole('button', { name: 'Démarrer le suivi' }).click();
  const bandeau = page.locator('bandeau-guidage');
  await expect(bandeau).toBeVisible({ timeout: 15_000 });
  await expect(bandeau.locator('.bg-limite')).toContainText('pas navigation guidée');
  await expect(bandeau.locator('.bg-limite')).toContainText('aucun recalcul');
});

test('quitter la route se DIT, l’instruction ne continue pas comme si de rien', async ({ page, context }) => {
  await ouvrirTrajet(page);
  await page.getByRole('button', { name: 'Démarrer le suivi' }).click();
  const bandeau = page.locator('bandeau-guidage');
  await expect(bandeau.locator('.bg-instruction')).toContainText('A6', { timeout: 15_000 });

  // Cinquante kilomètres à l'ouest du tracé : on n'est plus dessus.
  await context.setGeolocation({ longitude: 1.6, latitude: 48.5 });

  await expect(bandeau.locator('.bg-instruction'), 'le suivi a continué à guider hors route')
    .toContainText('quitté l’itinéraire', { timeout: 20_000 });
  await expect(bandeau.locator('.bg-alerte')).toContainText('Recalculez');
});

test('« Arrêter » referme le bandeau et rend son nom au bouton', async ({ page }) => {
  /* Un `watchPosition` oublié viderait la batterie de celui qui est arrivé
     depuis une heure : l'arrêt doit être atteignable et évident. */
  await ouvrirTrajet(page);
  await page.getByRole('button', { name: 'Démarrer le suivi' }).click();
  const bandeau = page.locator('bandeau-guidage');
  await expect(bandeau).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Arrêter le suivi' })).toHaveCount(2);

  /* PRESSER LE BANDEAU NE DOIT PAS REFERMER LE PLANIFICATEUR derrière lui.
     La règle du clic extérieur ne reconnaissait que les volets ; le bandeau
     n'en est pas un, et le panneau se refermait sous le doigt — au point que
     le bouton « Démarrer » disparaissait de l'arbre d'accessibilité. */
  await bandeau.getByRole('button', { name: 'Arrêter le suivi' }).click();
  await expect(bandeau).toBeHidden();
  await expect(page.locator('.iti')).toHaveAttribute('open', '');
  await expect(page.getByRole('button', { name: 'Démarrer le suivi' })).toBeVisible();
});

test('effacer le trajet arrête le suivi — il ne compte pas les kilomètres d’un fantôme', async ({ page }) => {
  await ouvrirTrajet(page);
  await page.getByRole('button', { name: 'Démarrer le suivi' }).click();
  await expect(page.locator('bandeau-guidage')).toBeVisible({ timeout: 15_000 });

  await page.getByRole('button', { name: 'Effacer' }).click();
  await expect(page.locator('bandeau-guidage')).toBeHidden();
  await expect(page.locator('.iti-demarrer')).toBeHidden();
});

test('une feuille de route en panne n’empêche PAS le suivi', async ({ page }) => {
  /* Rouler en sachant ce qui reste vaut mieux que ne rien avoir parce qu'un
     service tiers est tombé. Le bandeau dit alors « Suivez l'itinéraire », ce
     qui est vrai — plutôt qu'une instruction inventée. */
  await page.route('**/data.geopf.fr/navigation/itineraire**', async (route) => {
    if (/getSteps=true/i.test(route.request().url())) {
      return route.fulfill({ status: 500, body: 'panne' });
    }
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ geometry: GEOMETRIE, distance: 390_000, duration: 13_000 }),
    });
  });
  await ouvrirTrajet(page);
  await page.getByRole('button', { name: 'Démarrer le suivi' }).click();

  const bandeau = page.locator('bandeau-guidage');
  await expect(bandeau).toBeVisible({ timeout: 15_000 });
  await expect(bandeau.locator('.bg-instruction'))
    .toContainText('Suivez l’itinéraire', { timeout: 20_000 });
  await expect(bandeau.locator('.bg-restant')).toContainText('restants');
});
