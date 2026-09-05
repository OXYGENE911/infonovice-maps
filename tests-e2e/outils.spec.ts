import { test, expect, type Page } from '@playwright/test';
import { simulerTuiles, simulerCommunes } from './tuiles-simulees';
import { ouvrirMenu } from './volets';

/* LE VOLET « OUTILS » REDESSINÉ (OUTILS-2, 06/09/2026).
 *
 * Armelin : « une clé à molette comme icône ; cliquer sur Outils et afficher
 * uniquement des icônes représentant chaque outil ; cliquer sur une icône
 * lance la page en entier » — et la météo « éclatait l'écran » dans le volet.
 * Le parcours vérifie la forme (clé, tuiles, page plein écran qui ne déborde
 * pas de côté) et chaque outil : météo, signal GPS, partage de position. */

const VUE = { width: 390, height: 844 };
const ICI = { longitude: 2.3522, latitude: 48.8566, accuracy: 7 };

async function ouvrirOutils(page: Page): Promise<void> {
  await ouvrirMenu(page);
  await page.locator('.reglages-corps .outils summary').click();
  await expect(page.locator('.outils-tuile')).toHaveCount(4);
}

test.beforeEach(async ({ page, context }) => {
  await page.setViewportSize(VUE);
  await simulerTuiles(page);
  await simulerCommunes(page);
  await context.grantPermissions(['geolocation', 'clipboard-read', 'clipboard-write']);
  await context.setGeolocation(ICI);
  await page.route('**/api-adresse.data.gouv.fr/reverse/**', (route) => route.fulfill({
    contentType: 'application/json', body: JSON.stringify({ features: [{
      geometry: { coordinates: [2.3522, 48.8566] },
      properties: { label: '2 Rue de Rivoli 75004 Paris', type: 'housenumber', postcode: '75004', city: 'Paris' },
    }] }),
  }));
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
});

test('LA CLÉ À MOLETTE OUVRE UNE GRILLE DE TUILES, pas des formulaires ; le menu garde sa hauteur', async ({ page }) => {
  await ouvrirMenu(page);
  const corps = (await page.locator('.reglages-corps').boundingBox())!;
  expect(corps.height, 'le menu a grossi jusqu’à déborder').toBeLessThan(VUE.height * 0.62);
  await expect(page.locator('.reglages-corps .outils summary svg.picto-cle')).toHaveCount(1);
  await page.locator('.reglages-corps .outils summary').click();
  const tuiles = page.locator('.outils-tuile');
  await expect(tuiles).toHaveCount(4);
  await expect(tuiles.nth(0)).toHaveAttribute('data-outil', 'mesure');
  await expect(tuiles.nth(1)).toHaveAttribute('data-outil', 'meteo');
  await expect(tuiles.nth(2)).toHaveAttribute('data-outil', 'signal');
  await expect(tuiles.nth(3)).toHaveAttribute('data-outil', 'partage');
  // Aucun champ ni bulletin dans le volet : les outils vivent dans leur page.
  await expect(page.locator('.reglages-corps .outils input')).toHaveCount(0);
  // Le volet tient dans la fenêtre, sans défilement latéral.
  const large = await page.locator('.reglages-corps').evaluate((e) => e.scrollWidth > e.clientWidth + 1);
  expect(large, 'le volet déborde de côté').toBe(false);
});

test('MÉTÉO : la tuile ouvre une page plein écran, le bulletin s’y pose sans déborder de côté, la flèche revient à la carte', async ({ page }) => {
  await page.route('**/api-adresse.data.gouv.fr/search/**', (route) => route.fulfill({
    contentType: 'application/json', body: JSON.stringify({ features: [{
      geometry: { coordinates: [4.8357, 45.764] },
      properties: { label: 'Lyon', type: 'municipality', postcode: '69000', city: 'Lyon', name: 'Lyon' },
    }] }),
  }));
  const base = new Date(); base.setUTCMinutes(0, 0, 0);
  const iso = (d: Date): string => d.toISOString().slice(0, 13) + ':00';
  const heures = Array.from({ length: 48 }, (_, i) => iso(new Date(base.getTime() + (i - 3) * 3_600_000)));
  await page.route('**/api.open-meteo.com/**', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({
    utc_offset_seconds: 0,
    hourly: { time: heures, temperature_2m: heures.map(() => 18), precipitation: heures.map(() => 0),
      weather_code: heures.map(() => 1), wind_speed_10m: heures.map(() => 10) },
    daily: { time: Array.from({ length: 7 }, (_, i) => new Date(base.getTime() + i * 86_400_000).toISOString().slice(0, 10)),
      weather_code: [1, 2, 3, 0, 0, 61, 2], temperature_2m_max: [24, 21, 22, 26, 27, 23, 22],
      temperature_2m_min: [14, 13, 12, 14, 15, 16, 13], precipitation_sum: [0, 0, 0, 0, 0, 4, 0],
      wind_speed_10m_max: [18, 30, 12, 10, 11, 45, 20] },
  }) }));

  await ouvrirOutils(page);
  await page.locator('.outils-tuile[data-outil="meteo"]').click();
  const pageOutil = page.locator('page-outil');
  await expect(pageOutil).toBeVisible();
  await expect(pageOutil.locator('.page-outil-titre')).toHaveText('Météo d’une ville');
  await expect(page.locator('details.reglages[open]')).toHaveCount(0);
  // Plein écran : la page couvre la fenêtre.
  const boite = (await pageOutil.boundingBox())!;
  expect(boite.width).toBeGreaterThanOrEqual(VUE.width - 1);
  expect(boite.height).toBeGreaterThanOrEqual(VUE.height - 1);

  const champ = pageOutil.locator('outil-meteo input');
  await expect(champ).toBeFocused();
  await champ.fill('lyon');
  const option = pageOutil.locator('outil-meteo [role="option"]').first();
  await expect(option).toContainText('Lyon', { timeout: 10_000 });
  await option.click();
  await expect(pageOutil.locator('.meteo-ville-heures li')).toHaveCount(24);
  await expect(pageOutil.locator('.meteo-ville-jours li')).toHaveCount(7);
  // LE REPROCHE D'ARMELIN : « je dois scroller sur ma droite ». Plus jamais.
  const deborde = await pageOutil.locator('.page-outil-corps').evaluate((e) => e.scrollWidth > e.clientWidth + 1);
  expect(deborde, 'le bulletin déborde de côté').toBe(false);

  await pageOutil.getByRole('button', { name: 'Revenir à la carte' }).click();
  await expect(pageOutil).toBeHidden();
});

test('SIGNAL GPS : la page dit la précision et sa qualité, et ce que le web ne sait pas', async ({ page }) => {
  await ouvrirOutils(page);
  await page.locator('.outils-tuile[data-outil="signal"]').click();
  const pageOutil = page.locator('page-outil');
  await expect(pageOutil.locator('.page-outil-titre')).toHaveText('Signal GPS');
  await expect(pageOutil.locator('.signal-valeurs')).toContainText('± 7 m', { timeout: 15_000 });
  await expect(pageOutil.locator('.signal-valeurs')).toContainText('excellente');
  await expect(pageOutil.locator('.signal-qualite')).toHaveAttribute('data-qualite', 'excellente');
  await expect(pageOutil).toContainText('La liste des satellites');
  await page.keyboard.press('Escape');
  await expect(pageOutil).toBeHidden();
});

test('PARTAGER MA POSITION : le lien #lieu= naît au geste, avec l’adresse, et se copie', async ({ page }) => {
  await ouvrirOutils(page);
  await page.locator('.outils-tuile[data-outil="partage"]').click();
  const pageOutil = page.locator('page-outil');
  await expect(pageOutil.locator('.page-outil-titre')).toHaveText('Partager ma position');
  // Rien n'est demandé avant le geste.
  await expect(pageOutil.locator('.partage-position-resultat')).toBeHidden();
  await pageOutil.getByRole('button', { name: 'Utiliser ma position' }).click();
  const lien = pageOutil.locator('.partage-position-lien');
  await expect(lien).toHaveValue(/#lieu=2\.35220,48\.85660,Ma%20position$/, { timeout: 15_000 });
  await expect(pageOutil.locator('.partage-position-adresse')).toContainText('2 Rue de Rivoli');
  await pageOutil.getByRole('button', { name: 'Copier le lien' }).click();
  await expect(pageOutil.locator('.partage-position-etat')).toContainText('Lien copié');
  const colle = await page.evaluate(() => navigator.clipboard.readText());
  expect(colle).toContain('#lieu=2.35220,48.85660');
});
