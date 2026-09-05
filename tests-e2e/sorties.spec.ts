import { test, expect, type Page } from '@playwright/test';
import { simulerTuiles, simulerCommunes } from './tuiles-simulees';

/* LE NUMÉRO DE SORTIE ET LES VILLES DESSERVIES (SORTIE-1, demande d'Armelin
 * du 30/08 : « fais le numéro de sortie et la destination »).
 *
 * CE QUE CES PARCOURS DÉFENDENT : que le panneau annonce ce qu'annonce le
 * panneau réel — un numéro et des villes — et qu'il SE TAISE dès que la
 * donnée manque, ce qui arrive souvent (couverture partielle, mesurée le
 * 30/08 : 18 nœuds numérotés sur 46 relevés). Et qu'Overpass ne soit
 * interrogé QU'UNE FOIS : il est tenu par des bénévoles. */

const GEOMETRIE = {
  type: 'LineString',
  coordinates: [[2.3522, 48.8566], [4.8357, 45.764]],
};

/* LE POINT DE MANŒUVRE : l'étape courante fait 400 m, donc la manœuvre tombe
   à 400 m du départ. Le nœud de sortie doit être POSÉ là — on le place sur la
   trace, à l'avancement correspondant. */
const SUR_LA_TRACE = { lon: 2.3548, lat: 48.8534 };

function reponseOverpass(o: { ref?: string; nom?: string; destination?: string }) {
  const elements: unknown[] = [];
  if (o.ref !== undefined || o.nom !== undefined) {
    elements.push({
      type: 'node', lon: SUR_LA_TRACE.lon, lat: SUR_LA_TRACE.lat,
      tags: {
        highway: 'motorway_junction',
        ...(o.ref === undefined ? {} : { ref: o.ref }),
        ...(o.nom === undefined ? {} : { name: o.nom }),
      },
    });
  }
  if (o.destination !== undefined) {
    elements.push({
      type: 'way',
      tags: { highway: 'motorway_link', destination: o.destination, 'destination:ref': 'A 6a' },
      geometry: [{ lon: SUR_LA_TRACE.lon, lat: SUR_LA_TRACE.lat }],
    });
  }
  return { elements };
}

async function suivre(
  page: Page, o: { ref?: string; nom?: string; destination?: string } = {},
): Promise<void> {
  await page.route('**overpass.openstreetmap.fr**', (route) => route.fulfill({
    headers: { 'Access-Control-Allow-Origin': '*' },
    contentType: 'application/json',
    body: JSON.stringify(reponseOverpass(o)),
  }));
  await page.route('**/data.geopf.fr/navigation/itineraire**', (route) => {
    const url = route.request().url();
    if (/resource=bdtopo-pgr/.test(url)) {
      return route.fulfill({ contentType: 'application/json', body: '{"portions":[]}' });
    }
    if (/getSteps=true/i.test(url)) {
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          geometry: GEOMETRIE, distance: 390_000, duration: 13_000,
          portions: [{ steps: [
            { instruction: { type: 'depart' }, distance: 400,
              attributes: { name: { cpx_numero: 'A6' } } },
            { instruction: { type: 'turn', modifier: 'right' }, distance: 389_600,
              attributes: { name: { cpx_numero: 'A6' } } },
          ] }],
        }),
      });
    }
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ geometry: GEOMETRIE, distance: 390_000, duration: 13_000 }),
    });
  });
  await page.goto('/#iti=2.35220,48.85660;4.83570,45.76400;car');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.iti-resultat')).toContainText('390 km', { timeout: 15_000 });
  await page.getByRole('button', { name: 'Démarrer le suivi' }).click();
  await expect(page.locator('.bg-cartouche')).toBeVisible({ timeout: 15_000 });
}

test.beforeEach(async ({ page, context }) => {
  await simulerTuiles(page);
  await simulerCommunes(page);
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ longitude: 2.3522, latitude: 48.8566 });
  await page.route('**/www.bison-fute.gouv.fr/**', (route) => route.fulfill({
    contentType: 'application/json', body: '[]',
  }));
});

test('le panneau annonce le NUMÉRO de sortie et les villes desservies', async ({ page }) => {
  await suivre(page, { ref: '14', destination: 'Lyon;Évry' });

  await expect(page.locator('.bg-sortie')).toHaveText('Sortie 14', { timeout: 15_000 });
  await expect(page.locator('.bg-destination')).toHaveText('Lyon · Évry');
  /* LU AUTREMENT QUE VU : le point médian ne se dit pas, et « Lyon Évry »
     n'est pas une phrase. */
  await expect(page.locator('.bg-destination')).toHaveAttribute('aria-label', 'vers Lyon, Évry');
  await expect(page.locator('.bg-sortie')).toHaveAttribute('aria-label', 'sortie numéro 14');
});

test('SANS numéro, le panneau se tait — un numéro absent n’est pas un numéro faux', async ({ page }) => {
  /* Mesuré le 30/08 : 18 nœuds numérotés sur 46 relevés. C'est le cas le
     plus fréquent, pas l'exception. */
  await suivre(page, { destination: 'Lyon;Évry' });
  await expect(page.locator('.bg-destination')).toHaveText('Lyon · Évry', { timeout: 15_000 });
  await expect(page.locator('.bg-sortie')).toBeHidden();
});

test('à défaut de villes, le NOM de la sortie fait l’affaire', async ({ page }) => {
  /* « Châtillon-la-Borde » dit où l'on va, même sans liste de villes : mieux
     vaut le nom que le vide. */
  await suivre(page, { ref: '16', nom: 'Châtillon-la-Borde' });
  await expect(page.locator('.bg-sortie')).toHaveText('Sortie 16', { timeout: 15_000 });
  await expect(page.locator('.bg-destination')).toHaveText('Châtillon-la-Borde');
});

test('RIEN dans OpenStreetMap : le panneau reste celui d’avant', async ({ page }) => {
  await suivre(page, {});
  await expect(page.locator('.bg-cartouche')).toContainText('Tournez à droite');
  await expect(page.locator('.bg-sortie')).toBeHidden();
  await expect(page.locator('.bg-destination')).toBeHidden();
});

test('OVERPASS N’EST INTERROGÉ QU’UNE FOIS : il est tenu par des bénévoles', async ({ page }) => {
  const appels: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('overpass')) appels.push(r.url());
  });
  await suivre(page, { ref: '14', destination: 'Lyon' });
  await expect(page.locator('.bg-sortie')).toBeVisible({ timeout: 15_000 });
  expect(appels, 'limites, sorties et destinations tiennent dans un seul appel')
    .toHaveLength(1);
});

test('LA REQUÊTE UNIQUE demande bien les trois relevés', async ({ page }) => {
  let corps = '';
  page.on('request', (r) => {
    if (r.url().includes('overpass')) corps = r.postData() ?? '';
  });
  await suivre(page, { ref: '14' });
  await expect(page.locator('.bg-sortie')).toBeVisible({ timeout: 15_000 });
  const lisible = decodeURIComponent(corps);
  expect(lisible, 'les limites de vitesse').toContain('maxspeed');
  expect(lisible, 'les nœuds de sortie').toContain('motorway_junction');
  expect(lisible, 'les bretelles qui annoncent').toContain('[destination]');
});
