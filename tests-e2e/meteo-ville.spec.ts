import { test, expect, type Page } from '@playwright/test';
import { simulerTuiles, simulerCommunes } from './tuiles-simulees';
import { ouvrirMenu } from './volets';

/* LA MÉTÉO D'UNE VILLE (METEO-VILLE-1, 05/09/2026).
 *
 * Des amis d'Armelin : « des outils dans le menu : la météo d'une ville au
 * choix, heure par heure, et sur 7 jours ». Le service est SIMULÉ (jamais
 * d'appel réel dans un parcours : ces quotas sont un bien commun), et le
 * parcours regarde ce qui part — la requête doit demander les journées — et
 * ce qui s'affiche : vingt-quatre heures, sept jours, puis une panne dite en
 * français. */

const LYON = { lon: 4.8357, lat: 45.764 };

function bulletin(): object {
  const base = new Date();
  base.setUTCMinutes(0, 0, 0);
  const iso = (d: Date): string => d.toISOString().slice(0, 13) + ':00';
  const heures = Array.from({ length: 48 }, (_, i) => iso(new Date(base.getTime() + (i - 3) * 3_600_000)));
  const jour = (i: number): string => new Date(base.getTime() + i * 86_400_000).toISOString().slice(0, 10);
  return {
    utc_offset_seconds: 0,
    hourly: {
      time: heures,
      temperature_2m: heures.map((_, i) => 12 + (i % 24) * 0.5),
      precipitation: heures.map((_, i) => (i === 6 ? 2.4 : 0)),
      weather_code: heures.map((_, i) => (i === 6 ? 63 : 1)),
      wind_speed_10m: heures.map(() => 12),
    },
    daily: {
      time: Array.from({ length: 7 }, (_, i) => jour(i)),
      weather_code: [1, 63, 3, 0, 0, 95, 2],
      temperature_2m_max: [24, 21, 22, 26, 27, 23, 22],
      temperature_2m_min: [14, 13, 12, 14, 15, 16, 13],
      precipitation_sum: [0, 4.2, 0, 0, 0, 12.5, 0.1],
      wind_speed_10m_max: [18, 30, 12, 10, 11, 45, 20],
    },
  };
}

async function preparer(page: Page, meteo: { statut: number; corps: object }): Promise<{ appels: string[] }> {
  const appels: string[] = [];
  await simulerTuiles(page);
  await simulerCommunes(page);
  await page.route('**/api-adresse.data.gouv.fr/search/**', (route) => route.fulfill({
    contentType: 'application/json', body: JSON.stringify({ features: [{
      geometry: { coordinates: [LYON.lon, LYON.lat] },
      properties: { label: 'Lyon', type: 'municipality', postcode: '69000', city: 'Lyon', name: 'Lyon' },
    }] }),
  }));
  await page.route('**/api.open-meteo.com/**', (route) => {
    appels.push(route.request().url());
    return route.fulfill({ status: meteo.statut, contentType: 'application/json', body: JSON.stringify(meteo.corps) });
  });
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  return { appels };
}

async function choisirLyon(page: Page): Promise<void> {
  await ouvrirMenu(page);
  await page.locator('.reglages-corps .outils summary').click();
  // OUTILS-2 : la tuile ouvre la page plein écran, le champ y vit.
  await page.locator('.outils-tuile[data-outil="meteo"]').click();
  await expect(page.locator('page-outil')).toBeVisible();
  const champ = page.locator('page-outil outil-meteo input');
  await expect(champ).toBeVisible();
  await champ.fill('lyon');
  const option = page.locator('outil-meteo [role="option"]').first();
  await expect(option).toContainText('Lyon', { timeout: 10_000 });
  await option.click();
}

test('LA VILLE CHOISIE POSE SON BULLETIN : vingt-quatre heures en frise, sept jours en lignes — et la requête demande les journées', async ({ page }) => {
  const { appels } = await preparer(page, { statut: 200, corps: bulletin() });
  await choisirLyon(page);

  const corps = page.locator('.meteo-ville-corps');
  await expect(corps.locator('.meteo-ville-lieu')).toContainText('Météo à Lyon');
  await expect(corps.locator('.meteo-ville-heures li')).toHaveCount(24);
  await expect(corps.locator('.meteo-ville-jours li')).toHaveCount(7);
  await expect(corps.locator('.meteo-ville-jours li').first()).toContainText('aujourd’hui');
  await expect(corps.locator('.meteo-ville-jours li').nth(1)).toContainText('demain');
  await expect(corps.locator('.meteo-ville-jours li').nth(1)).toContainText('13 / 21 °C');
  await expect(corps.locator('.meteo-ville-jours li').nth(1)).toContainText('4,2 mm');
  // La frise commence à l'heure courante : la case passée de trois heures n'y est pas.
  const premiere = await corps.locator('.meteo-ville-heures li .mv-h').first().textContent();
  expect(premiere).toMatch(/^\d{1,2} h$/);

  // CE QUI PART : une seule requête, qui demande les journées sur sept jours.
  expect(appels).toHaveLength(1);
  const u = new URL(appels[0]!);
  expect(u.searchParams.get('daily')).toContain('temperature_2m_min');
  expect(u.searchParams.get('forecast_days')).toBe('7');
  expect(u.searchParams.get('latitude')).toBe('45.7640');
});

test('LA PANNE SE DIT EN FRANÇAIS, à la place du bulletin', async ({ page }) => {
  await preparer(page, { statut: 503, corps: {} });
  await choisirLyon(page);
  await expect(page.locator('.meteo-ville-corps')).toContainText('momentanément indisponible', { timeout: 15_000 });
  await expect(page.locator('.meteo-ville-jours li')).toHaveCount(0);
});
