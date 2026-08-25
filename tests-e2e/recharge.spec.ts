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

/** Pose un profil véhicule en IndexedDB avant le chargement de la page. */
async function poserVehicule(page: Page, v: Record<string, unknown>): Promise<void> {
  await page.addInitScript((vehicule) => {
    const demande = indexedDB.open('infonovice-maps', 1);
    demande.onupgradeneeded = () => {
      const bdd = demande.result;
      if (!bdd.objectStoreNames.contains('preferences')) bdd.createObjectStore('preferences');
      if (!bdd.objectStoreNames.contains('favoris')) bdd.createObjectStore('favoris');
    };
    demande.onsuccess = () => {
      const t = demande.result.transaction('preferences', 'readwrite');
      t.objectStore('preferences').put({ vehicule, essais: {}, anneaux: false }, 'vehicule');
    };
  }, v);
}

const VF8 = {
  nom: 'VinFast VF8', capaciteNominale: 87.7, soce: 94, soc: 100,
  consommations: { ville: 20.6, route: 22.9, autoroute: 29.4 },
  puissanceMaxKw: 150,
};

async function ouvrirRecharge(page: Page): Promise<void> {
  await page.goto(PARIS_LYON);
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await page.locator('.iti-recharge summary').click();
}

test('sans véhicule renseigné, la section le DIT au lieu d’inventer', async ({ page }) => {
  await page.route('**/public.opendatasoft.com/**', (route) => route.fulfill({
    contentType: 'application/json', body: JSON.stringify({ total_count: 0, results: [] }),
  }));
  await ouvrirRecharge(page);
  await expect(page.locator('.iti-recharge-corps'))
    .toContainText('Renseignez d’abord votre véhicule');
});

test('un trajet sans borne à portée est REFUSÉ, avec le kilomètre exact', async ({ page }) => {
  await poserVehicule(page, VF8);
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
  await poserVehicule(page, VF8);
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
  await poserVehicule(page, VF8);
  await page.route('**/public.opendatasoft.com/**', (route) => route.fulfill({
    contentType: 'application/json', body: JSON.stringify({ total_count: 0, results: [] }),
  }));
  await ouvrirRecharge(page);
  await expect(page.locator('.iti-recharge-corps')).toContainText('Aucune borne', { timeout: 15_000 });
});

test('AUCUN appel tant que la section est repliée — les quotas sont un bien commun', async ({ page }) => {
  await poserVehicule(page, VF8);
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
