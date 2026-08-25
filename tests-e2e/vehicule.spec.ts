import { test, expect, type Page } from '@playwright/test';
import { simulerTuiles, simulerCommunes } from './tuiles-simulees';

/* PROFIL DU VÉHICULE ET RAYON D'ACTION — éprouvés avec un véhicule RÉEL, la
   VinFast VF8 d'Armelin et ses relevés du 25/08/2026. Une fiche constructeur
   aurait prouvé que le calcul tourne ; des relevés réels prouvent qu'il
   retrouve le terrain. */

const VF8 = { batterie: '87.7', soce: '94', soc: '100',
  ville: '400', route: '360', autoroute: '280' };

test.beforeEach(async ({ page }) => {
  await simulerTuiles(page);
  await simulerCommunes(page);
});

async function ouvrirVehicule(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await page.locator('.maplibregl-ctrl-top-left summary').filter({ hasText: 'Véhicule' }).click();
}

async function saisirVF8(page: Page): Promise<void> {
  await page.getByLabel('Nom du véhicule').fill('VinFast VF8');
  await page.getByLabel('Batterie').fill(VF8.batterie);
  await page.getByLabel('Santé (SOCE)').fill(VF8.soce);
  await page.getByLabel('Charge (SOC)').fill(VF8.soc);
  await page.getByLabel('En ville').fill(VF8.ville);
  await page.getByLabel('Sur route').fill(VF8.route);
  await page.getByLabel('Sur autoroute').fill(VF8.autoroute);
}

test('sans véhicule saisi, rien n’est promis', async ({ page }) => {
  await ouvrirVehicule(page);
  await expect(page.locator('.veh-bilan'),
    'inventer une « voiture moyenne » afficherait un rayon crédible et faux')
    .toContainText('Renseignez la batterie');
});

test('les relevés réels d’une VF8 redonnent ses autonomies', async ({ page }) => {
  await ouvrirVehicule(page);
  await saisirVF8(page);

  const bilan = page.locator('.veh-bilan-lignes');
  await expect(bilan).toContainText('En ville : 400 km');
  await expect(bilan).toContainText('Sur autoroute : 280 km');
});

test('l’usure de la batterie se dit en KILOMÈTRES, pas en pourcents', async ({ page }) => {
  await ouvrirVehicule(page);
  await saisirVF8(page);

  // « SOCE 94 % » ne dit rien à personne ; « 5,3 kWh perdus, soit 18 km » si.
  const usure = page.locator('.veh-bilan-usure');
  await expect(usure).toContainText('Usure de la batterie');
  await expect(usure).toContainText('kWh perdus');
  await expect(usure).toContainText(/\d+ km d’autoroute/);
});

test('la réserve est écrite sous le bilan, jamais sous-entendue', async ({ page }) => {
  await ouvrirVehicule(page);
  await saisirVF8(page);
  await expect(page.locator('.veh-bilan-reserve')).toContainText('ni le relief');
});

test('les trois anneaux se dessinent, et le plus petit reste visible', async ({ page }) => {
  await ouvrirVehicule(page);
  await saisirVF8(page);
  await page.getByRole('checkbox', { name: 'Afficher mon rayon d’action' }).check();

  /* `getData()` est l'API PUBLIQUE de MapLibre 6 ; `_data` en était le champ
     privé, et un test qui s'appuie sur un champ privé casse à la première
     montée de version — celle de ce matin l'aurait fait. */
  const anneaux = await page.evaluate(async () => {
    const carte = (window as unknown as {
      __carte: { getSource(id: string): { getData(): unknown } | undefined };
    }).__carte;
    const d = await carte.getSource('rayon-action')?.getData() as
      GeoJSON.FeatureCollection | undefined;
    return (d?.features ?? []).map((f) => ({
      cle: f.properties?.['cle'] as string,
      rayon: f.properties?.['rayonKm'] as number,
      sommets: (f.geometry as GeoJSON.Polygon).coordinates[0]?.length ?? 0,
    }));
  });

  expect(anneaux, 'trois régimes, trois anneaux').toHaveLength(3);
  // Du plus grand au plus petit : sinon le petit disparaît sous le grand.
  expect(anneaux.map((a) => a.cle)).toEqual(['ville', 'route', 'autoroute']);
  expect(anneaux[0]!.rayon).toBeGreaterThan(anneaux[2]!.rayon);
  expect(anneaux[0]!.rayon).toBe(400);
  expect(anneaux[2]!.rayon).toBe(280);
  for (const a of anneaux) expect(a.sommets, 'un anneau fermé').toBeGreaterThan(90);
});

test('décocher efface les anneaux — la carte redevient nue', async ({ page }) => {
  await ouvrirVehicule(page);
  await saisirVF8(page);
  const bascule = page.getByRole('checkbox', { name: 'Afficher mon rayon d’action' });
  await bascule.check();
  /* ON ATTEND QUE LES ANNEAUX SOIENT LÀ AVANT DE LES EFFACER. Décocher avant
     que la pose soit finie faisait courir deux `setData` : le test vérifiait
     alors la disparition de quelque chose qui n'était jamais apparu, et
     rougissait une fois sur quatre. Une précondition qu'on n'attend pas est
     une course qu'on parie. */
  await expect.poll(async () => page.evaluate(async () => {
    const carte = (window as unknown as {
      __carte: { getSource(id: string): { getData(): unknown } | undefined };
    }).__carte;
    const d = await carte.getSource('rayon-action')?.getData() as
      GeoJSON.FeatureCollection | undefined;
    return d?.features.length ?? -1;
  }), { message: 'les anneaux ne sont jamais apparus' }).toBe(3);

  await bascule.uncheck();

  /* ON ATTEND que la source se vide : `setData` est asynchrone, et lire trop
     tôt rendait l'ancien jeu — un parcours rouge pour une raison qui n'avait
     rien à voir avec le décochage. */
  await expect.poll(async () => page.evaluate(async () => {
    const carte = (window as unknown as {
      __carte: { getSource(id: string): { getData(): unknown } | undefined };
    }).__carte;
    const d = await carte.getSource('rayon-action')?.getData() as
      GeoJSON.FeatureCollection | undefined;
    return d?.features.length ?? -1;
  }), { message: 'les anneaux n’ont jamais disparu' }).toBe(0);
});

test('le profil survit au rechargement — sans compte, sans serveur', async ({ page }) => {
  await ouvrirVehicule(page);
  await saisirVF8(page);
  await expect(page.locator('.veh-bilan-lignes')).toContainText('400 km');

  await page.reload();
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await page.locator('.maplibregl-ctrl-top-left summary').filter({ hasText: 'Véhicule' }).click();
  await expect(page.getByLabel('Batterie')).toHaveValue(VF8.batterie);
  await expect(page.locator('.veh-bilan-lignes')).toContainText('En ville : 400 km');
});
