import { test, expect, type Page } from '@playwright/test';
import { simulerTuiles, simulerCommunes } from './tuiles-simulees';
import { ouvrirMenu } from './volets';
import { ouvrirPlanificateur, allerA, retour } from './planificateur';

/* LE TEXTE AGRANDI (AUDIT Codex, volet accessibilité — vérifié le 08/09).
 *
 * LE CRITÈRE N'EST PAS UNE OPINION : WCAG 1.4.10 « Reflow » demande que le
 * contenu reste utilisable à 320 px de large — c'est ce que donne un écran de
 * 1280 px zoomé à 400 %, ou un téléphone dont l'usager a grossi le texte —
 * SANS défilement horizontal. Un défilement dans les deux dimensions rend la
 * lecture épuisante pour qui a besoin de ce grossissement.
 *
 * ON MESURE L'ÉCRAN, PAS LA FEUILLE DE STYLE : tout élément VISIBLE dont le
 * bord droit passe la fenêtre est un débordement, quelle que soit la règle qui
 * l'a produit. `checkVisibility` écarte ce qui n'est pas peint — le corps d'un
 * volet fermé garde un rectangle, et l'a d'abord fait croire à un défaut.
 *
 * SIX SURFACES, celles où le contenu est le plus dense : l'accueil, le
 * planificateur ouvert, le menu, un trajet calculé, le plan de recharge, et la
 * barre de suivi — pliée puis dépliée.
 */

const TRACE: [number, number][] = [[2.3522, 48.8566], [4.8357, 45.7640]];

/** Les éléments VISIBLES qui sortent de la fenêtre — PURE côté page. */
async function debordements(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const w = window.innerWidth;
    const sortis = [...document.querySelectorAll<HTMLElement>('body *')]
      .filter((e) => {
        /* LES CALQUES DE LA CARTE NE SONT PAS DE LA MISE EN PAGE : un marqueur
           d'arrivée est ancré à un POINT GÉOGRAPHIQUE, et Lyon est hors de
           l'écran quand on part de Paris — il s'y trouvait à −305 px, ce qui
           est parfaitement juste. On ne juge ici que l'interface. */
        if (e.closest('.maplibregl-marker, .maplibregl-popup, .maplibregl-canvas-container')) return false;
        if (!e.checkVisibility({ contentVisibilityAuto: true, opacityProperty: true, visibilityProperty: true })) return false;
        const r = e.getBoundingClientRect();
        if (r.width < 4 || r.height < 4) return false;
        return r.right > w + 1 || r.left < -1;
      })
      .map((e) => {
        const r = e.getBoundingClientRect();
        return `${e.tagName.toLowerCase()}.${String(e.className).split(' ')[0]} [${Math.round(r.left)}→${Math.round(r.right)} pour ${w}]`;
      });
    if (document.documentElement.scrollWidth > w + 1) {
      sortis.push(`la PAGE défile horizontalement (${document.documentElement.scrollWidth} > ${w})`);
    }
    return [...new Set(sortis)];
  });
}

test.beforeEach(async ({ page, context }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ longitude: 2.3522, latitude: 48.8566 });
  await page.setViewportSize({ width: 320, height: 700 });
  await simulerTuiles(page);
  await simulerCommunes(page);
});

test('À 320 PX, RIEN NE SORT DE L’ÉCRAN : accueil, planificateur, menu', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  expect(await debordements(page), 'accueil').toEqual([]);

  await ouvrirPlanificateur(page);
  expect(await debordements(page), 'planificateur ouvert').toEqual([]);

  await page.keyboard.press('Escape');
  await ouvrirMenu(page);
  expect(await debordements(page), 'menu ouvert').toEqual([]);
});

test('À 320 PX, RIEN NE SORT NON PLUS : trajet, plan de recharge, barre de suivi', async ({ page }) => {
  await page.route('**/data.geopf.fr/navigation/itineraire**', (route) => {
    if (/resource=bdtopo-pgr/.test(route.request().url())) {
      return route.fulfill({ contentType: 'application/json', body: '{"portions":[]}' });
    }
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ geometry: { type: 'LineString', coordinates: TRACE }, distance: 465_000, duration: 16_800 }),
    });
  });
  await page.route('**overpass**', (r) => r.fulfill({ contentType: 'application/json', body: '{"elements":[]}' }));
  await page.route('**/www.bison-fute.gouv.fr/**', (r) => r.fulfill({ contentType: 'application/json', body: '[]' }));

  await page.goto(`/#iti=${TRACE[0]![0]},${TRACE[0]![1]};${TRACE[1]![0]},${TRACE[1]![1]};car`);
  await page.reload();
  await expect(page.locator('.iti-resultat')).toContainText('km', { timeout: 15_000 });
  expect(await debordements(page), 'trajet calculé').toEqual([]);

  await allerA(page, 'recharge');
  await expect(page.locator('.iti-recharge-corps')).toBeVisible({ timeout: 15_000 });
  expect(await debordements(page), 'plan de recharge').toEqual([]);

  await retour(page);
  await page.getByRole('button', { name: 'Démarrer le suivi' }).click();
  await expect(page.locator('.bg-chiffres')).toBeVisible({ timeout: 15_000 });
  expect(await debordements(page), 'barre de suivi pliée').toEqual([]);

  await page.getByRole('button', { name: 'Afficher les commandes du suivi' }).click();
  await expect(page.locator('.bg-mode')).toBeVisible({ timeout: 10_000 });
  expect(await debordements(page), 'barre de suivi dépliée').toEqual([]);
});
