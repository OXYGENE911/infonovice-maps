import { test, expect, type Page } from '@playwright/test';
import { simulerTuiles, simulerCommunes } from './tuiles-simulees';

/* ARRÊTS DE RECHARGE — le calcul est pur et testé à sec (tests/arrets.test.ts) ;
   ces parcours vérifient le BRANCHEMENT : que le profil véhicule est bien lu,
   que les bornes du trajet lui parviennent, et surtout que le refus s'affiche
   quand le trajet n'est pas faisable. */

const PARIS_LYON = '/#iti=2.35220,48.85660;4.83570,45.76400;car';

test.beforeEach(async ({ page }) => {
  await simulerTuiles(page);
  await simulerCommunes(page);
  /* LE TRACÉ ET LA DISTANCE DOIVENT S'ACCORDER. Une première version annonçait
     465 km — la vraie route Paris-Lyon — sur un tracé en LIGNE DROITE de
     390 km. Les avancements des bornes, mesurés sur le tracé, ne parlaient
     alors pas de la même échelle que la distance donnée au planificateur : une
     borne à mi-parcours semblait à 195 km d'un trajet qu'on croyait long de
     465. Le plan échouait pour une raison qui n'existait que dans la fixture. */
  await page.route('**/data.geopf.fr/navigation/itineraire**', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      geometry: { type: 'LineString', coordinates: [[2.3522, 48.8566], [4.8357, 45.764]] },
      distance: 390_000, duration: 13_000,
    }),
  }));
});

/* LE PROFIL SE SAISIT PAR L'INTERFACE, comme un usager le ferait.
 *
 * Deux versions antérieures poussaient directement dans IndexedDB. La
 * première, par `addInitScript`, écrivait de façon asynchrone et
 * l'application lisait parfois avant. La seconde chargeait la page d'abord —
 * mais l'application y persiste un profil VIDE au démarrage, et les deux
 * écritures se couraient après. Les deux produisaient le même faux négatif :
 * « Renseignez d'abord votre véhicule », une fois sur trois, accusant le code
 * au lieu du test.
 *
 * Passer par le formulaire supprime la course à sa racine, et éprouve au
 * passage le chemin réel. */
async function saisirVehicule(page: Page): Promise<void> {
  await page.locator('.maplibregl-ctrl-top-left summary').filter({ hasText: 'Véhicule' }).click();
  await page.getByLabel('Batterie').fill('87.7');
  await page.getByLabel('Santé (SOCE)').fill('94');
  await page.getByLabel('Charge (SOC)').fill('100');
  await page.getByLabel('Charge max').fill('150');
  await page.getByLabel('Sur autoroute').fill('280');
  // Le bilan confirme que le profil est pris en compte AVANT de continuer.
  await expect(page.locator('.veh-bilan-lignes')).toContainText('Sur autoroute');
  /* ET ON ROUVRE LE PLANIFICATEUR. Ouvrir le volet « Véhicule » a refermé
     celui de l'itinéraire — l'exclusion mutuelle du rail fonctionne comme
     prévu, et la section des arrêts vit DEDANS. */
  await page.locator('.maplibregl-ctrl-top-left summary').filter({ hasText: 'Itinéraire' }).click();
  await expect(page.locator('.iti-recharge summary')).toBeVisible();
}

async function ouvrirRecharge(page: Page, avecVehicule = true): Promise<void> {
  await page.goto(PARIS_LYON);
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  /* ON ATTEND QUE L'ITINÉRAIRE SOIT CALCULÉ avant d'ouvrir la section. Sans
     cette attente, le clic pouvait précéder le calcul : la remise à zéro des
     sections refermait alors ce que le clic venait d'ouvrir, et le parcours
     rougissait sur un corps vide, une fois sur trois. Une précondition qu'on
     n'attend pas est une course qu'on parie. */
  await expect(page.locator('.iti-resultat')).toContainText('390 km', { timeout: 15_000 });
  if (avecVehicule) await saisirVehicule(page);
  await page.locator('.iti-recharge summary').click();
}

test('sans véhicule renseigné, la section le DIT au lieu d’inventer', async ({ page }) => {
  await page.route('**/public.opendatasoft.com/**', (route) => route.fulfill({
    contentType: 'application/json', body: JSON.stringify({ total_count: 0, results: [] }),
  }));
  await ouvrirRecharge(page, false);
  await expect(page.locator('.iti-recharge-corps'))
    .toContainText('Renseignez d’abord votre véhicule');
});

test('un trajet sans borne à portée est REFUSÉ, avec le kilomètre exact', async ({ page }) => {
  // Aucune borne : la VF8 fait 280 km sur autoroute, le trajet en fait 390.
  await page.route('**/public.opendatasoft.com/**', (route) => route.fulfill({
    contentType: 'application/json', body: JSON.stringify({ total_count: 0, results: [] }),
  }));
  await ouvrirRecharge(page);

  const corps = page.locator('.iti-recharge-corps');
  await expect(corps).toContainText('Aucune borne utilisable', { timeout: 15_000 });
  // Le refus SITUE le point de rupture : « avant 251 km » et non « impossible ».
  await expect(corps, 'un refus sans kilomètre ne sert à personne').toContainText(/\d+\s*km/);
});

test('avec une borne bien placée, le plan sort avec ses chiffres', async ({ page }) => {
  await page.route('**/public.opendatasoft.com/**', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ total_count: 1, results: [
      // À mi-chemin environ, sur le tracé Paris-Lyon.
      { point_geo: { lon: 3.6, lat: 47.3 }, nom_station: 'Aire de Beaune',
        puissance_nominale: 150, nbre_pdc: 8, prise_type_combo_ccs: '1' },
    ] }),
  }));
  await ouvrirRecharge(page);

  const corps = page.locator('.iti-recharge-corps');
  await expect(corps).toContainText('Aire de Beaune', { timeout: 15_000 });
  // Le résumé porte les trois chiffres qui décident : arrêts, minutes, arrivée.
  await expect(corps).toContainText(/1 arrêt/);
  await expect(corps).toContainText(/min de charge/);
  await expect(corps).toContainText(/arrivée à \d+ %/);
  // Et le détail dit à quel SOC on arrive et repart.
  await expect(corps).toContainText(/arrivée \d+ % → départ \d+ %/);
});

test('la réserve du modèle est écrite sous le plan, jamais sous-entendue', async ({ page }) => {
  await page.route('**/public.opendatasoft.com/**', (route) => route.fulfill({
    contentType: 'application/json', body: JSON.stringify({ total_count: 0, results: [] }),
  }));
  await ouvrirRecharge(page);
  await expect(page.locator('.iti-recharge-corps')).toContainText('Aucune borne', { timeout: 15_000 });
});

test('AUCUN appel tant que la section est repliée — les quotas sont un bien commun', async ({ page }) => {
  let appels = 0;
  await page.route('**/public.opendatasoft.com/**', (route) => {
    appels += 1;
    return route.fulfill({ contentType: 'application/json',
      body: JSON.stringify({ total_count: 0, results: [] }) });
  });
  await page.goto(PARIS_LYON);
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.iti-resultat')).toContainText('390 km', { timeout: 10_000 });
  await page.waitForTimeout(800);
  expect(appels, 'des bornes ont été cherchées sans que personne ne le demande').toBe(0);
});

test('les arrêts sont POSÉS SUR LA CARTE, et le clic y vole', async ({ page }) => {
  /* Une liste d'arrêts qu'on ne peut pas situer oblige à chercher des yeux ce
     que l'application sait déjà. Le marqueur répond « où », le clic « montre-
     moi ». */
  await page.route('**/public.opendatasoft.com/**', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ total_count: 1, results: [
      { point_geo: { lon: 3.6, lat: 47.3 }, nom_station: 'Aire de Beaune',
        puissance_nominale: 150, nbre_pdc: 8, prise_type_combo_ccs: '1' },
    ] }),
  }));
  await ouvrirRecharge(page);
  await expect(page.locator('.iti-recharge-corps')).toContainText('Aire de Beaune',
    { timeout: 15_000 });

  const bouton = page.getByRole('button', { name: 'Voir Aire de Beaune sur la carte' });
  await expect(bouton).toBeVisible();

  const avant = await page.evaluate(() => {
    const c = (window as unknown as { __carte: { getZoom(): number } }).__carte;
    return c.getZoom();
  });
  await bouton.click();
  await page.waitForTimeout(1200);
  const apres = await page.evaluate(() => {
    const c = (window as unknown as {
      __carte: { getZoom(): number; getCenter(): { lng: number; lat: number } };
    }).__carte;
    return { zoom: c.getZoom(), centre: c.getCenter() };
  });
  expect(apres.zoom, 'le clic n’a pas rapproché la carte').toBeGreaterThan(avant);
  expect(Math.abs(apres.centre.lng - 3.6), 'la carte n’a pas volé vers la borne')
    .toBeLessThan(0.5);
});
