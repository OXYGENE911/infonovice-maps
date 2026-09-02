import { test, expect } from '@playwright/test';
import { simulerTuiles, simulerCommunes } from './tuiles-simulees';

/* LE TRAJET PLUS DIRECT (ROUTE-1, 02/09).
 *
 * LE TERRAIN. Armelin, premier retour utilisateur : « j'essaye un de mes
 * itinéraires fréquents domicile - parents. Là je ne comprends pas
 * l'itinéraire… qui me fait faire presque 200 km de plus que le trajet des
 * autres GPS. »
 *
 * VÉRIFIÉ, ET CE N'EST PAS NOTRE CALCUL : le service public rend 492 km pour
 * Saumur → Montignac-Lascaux sur ses TROIS moteurs, quand les autres GPS en
 * rendent 345. Il est juste sur autoroute et surestime de moitié le temps sur
 * les nationales — il fuit donc le corridor direct.
 *
 * CES PARCOURS SIMULENT LE SERVICE avec les chiffres RELEVÉS ce jour-là : le
 * détour de 492 km, le « plus court » de 292, et le direct de 318. */

const SAUMUR: [number, number] = [-0.0769, 47.2603];
const MONTIGNAC: [number, number] = [1.1614, 45.0661];

/** Un tracé quelconque entre deux points : seule la distance annoncée compte. */
const trace = (a: [number, number], b: [number, number]): [number, number][] =>
  Array.from({ length: 21 }, (_, i) => [
    a[0] + ((b[0] - a[0]) * i) / 20,
    a[1] + ((b[1] - a[1]) * i) / 20,
  ] as [number, number]);

/**
 * Simule le service d'itinéraire : le détour par défaut, et un trajet direct
 * quand la requête porte des points de passage.
 */
async function simulerService(
  page: import('@playwright/test').Page,
  directM: number,
): Promise<{ appels: string[] }> {
  const appels: string[] = [];
  await page.route('**/data.geopf.fr/navigation/itineraire**', (route) => {
    const url = route.request().url();
    appels.push(url);
    const court = url.includes('optimization=shortest');
    const contraint = url.includes('intermediates=');
    /* TROIS RÉPONSES, TROIS RÔLES : le détour du service (492 km), son
       « plus court » (292 km, dont on tire les relais), et le trajet
       contraint qui en découle (318 km). */
    const distance = contraint ? directM : (court ? 292_000 : 492_000);
    const duration = contraint ? 20_880 : (court ? 25_800 : 16_632);
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({
      geometry: { type: 'LineString', coordinates: trace(SAUMUR, MONTIGNAC) },
      distance, duration,
    }) });
  });
  return { appels };
}

async function calculer(page: import('@playwright/test').Page): Promise<void> {
  /* LE LIEN DE PARTAGE EST LE CHEMIN LE PLUS COURT vers un trajet calculé :
     c'est celui qu'utilisent les parcours de recharge, et il évite de saisir
     deux adresses à la main. */
  await page.goto(`/#iti=${SAUMUR[0].toFixed(5)},${SAUMUR[1].toFixed(5)}`
    + `;${MONTIGNAC[0].toFixed(5)},${MONTIGNAC[1].toFixed(5)};car`);
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.iti-resultat')).toContainText('492 km', { timeout: 20_000 });
}

test.beforeEach(async ({ page }) => {
  await simulerTuiles(page);
  await simulerCommunes(page);
});

test('LE DÉTOUR EST REPÉRÉ, et un trajet plus direct est PROPOSÉ', async ({ page }) => {
  const { appels } = await simulerService(page, 318_000);
  await calculer(page);

  const boite = page.locator('.iti-direct');
  await expect(boite).toBeVisible({ timeout: 20_000 });
  await expect(boite).toContainText('318 km au lieu de 492');

  /* ON DIT AUSSI CE QUE LE SERVICE EN PENSE : il l'estime plus lent, parce
     qu'il surestime les nationales. Cacher cette moitié ferait passer la
     proposition pour gratuite. */
  await expect(boite).toContainText('plus lent');

  /* DEUX REQUÊTES DE PLUS, PAS UNE DE TROP : le « plus court » d'où l'on tire
     les relais, puis le trajet contraint. */
  expect(appels.filter((u) => u.includes('optimization=shortest'))).toHaveLength(1);
  expect(appels.filter((u) => u.includes('intermediates='))).toHaveLength(1);
});

test('RIEN NE CHANGE TANT QU’ON N’A PAS CHOISI', async ({ page }) => {
  await simulerService(page, 318_000);
  await calculer(page);
  await expect(page.locator('.iti-direct')).toBeVisible({ timeout: 20_000 });

  /* LE TRAJET AFFICHÉ EST TOUJOURS CELUI DU SERVICE : proposer n'est pas
     remplacer. Remplacer d'office ferait de nous le juge d'un graphe public. */
  await expect(page.locator('.iti-resultat')).toContainText('492 km');

  await page.getByRole('button', { name: 'Garder le trajet proposé par le service' }).click();
  await expect(page.locator('.iti-direct')).toBeHidden();
  await expect(page.locator('.iti-resultat')).toContainText('492 km');
});

test('« PRENDRE CE TRAJET » L’APPLIQUE, sans repayer une requête', async ({ page }) => {
  const { appels } = await simulerService(page, 318_000);
  await calculer(page);
  await expect(page.locator('.iti-direct')).toBeVisible({ timeout: 20_000 });
  const avant = appels.length;

  await page.getByRole('button', { name: 'Prendre ce trajet' }).click();
  await expect(page.locator('.iti-resultat')).toContainText('318 km');
  await expect(page.locator('.iti-direct')).toBeHidden();

  /* LE TRACÉ ÉTAIT DÉJÀ LÀ, payé par la proposition : l'appliquer ne doit pas
     redemander au service ce qu'on lui a déjà demandé. */
  expect(appels.length, 'une requête de plus pour appliquer un trajet connu')
    .toBe(avant);
});

test('UN GAIN TROP MAIGRE NE SE PROPOSE PAS', async ({ page }) => {
  /* 470 km au lieu de 492 : 22 km, sous le seuil des 25. La proposition
     coûterait deux requêtes ET une décision à l'usager pour rien. */
  await simulerService(page, 470_000);
  await calculer(page);

  /* On laisse le temps aux deux requêtes de revenir avant de conclure. */
  await page.waitForTimeout(1_500);
  await expect(page.locator('.iti-direct')).toBeHidden();
});
