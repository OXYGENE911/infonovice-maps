import { test, expect, type Page } from '@playwright/test';
import { simulerTuiles, simulerCommunes } from './tuiles-simulees';

/* L'AFFECTATION PAR VOIE (AFFECT-1, demande d'Armelin du 30/08).
 *
 * CE QUE CES PARCOURS DÉFENDENT : que le panneau montre ce que CHAQUE voie
 * autorise quand OpenStreetMap le sait, et qu'il retombe proprement sur le
 * conseil de placement quand il ne le sait pas — sans jamais mélanger les
 * deux, puisque l'un est relevé et l'autre déduit. */

const GEOMETRIE = {
  type: 'LineString',
  coordinates: [[2.3522, 48.8566], [2.3560, 48.8500], [2.3600, 48.8400]],
};

async function suivre(
  page: Page,
  o: { lanes?: string; manoeuvre?: string; voies?: string } = {},
): Promise<void> {
  const elements = o.lanes === undefined ? [] : [{
    type: 'way',
    tags: { highway: 'primary', 'turn:lanes': o.lanes },
    geometry: [{ lon: 2.3522, lat: 48.8566 }, { lon: 2.3560, lat: 48.8500 }],
  }];
  await page.route('**overpass.openstreetmap.fr**', (route) => route.fulfill({
    headers: { 'Access-Control-Allow-Origin': '*' },
    contentType: 'application/json', body: JSON.stringify({ elements }),
  }));
  await page.route('**/data.geopf.fr/navigation/itineraire**', (route) => {
    const url = route.request().url();
    if (/resource=bdtopo-pgr/.test(url)) {
      /* LE NOMBRE DE VOIES vient de l'autre source (VOIE-1) : c'est lui qui
         nourrit le repli quand l'affectation manque. */
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(o.voies === undefined ? { portions: [] } : {
          portions: [{ steps: [{
            geometry: { type: 'LineString', coordinates: [[2.3522, 48.8566]] },
            attributes: { nombre_de_voies: o.voies }, instruction: {},
          }] }],
        }),
      });
    }
    if (/getSteps=true/i.test(url)) {
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          geometry: GEOMETRIE, distance: 2_000, duration: 200,
          portions: [{ steps: [
            { instruction: { type: 'depart' }, distance: 400,
              attributes: { name: { cpx_numero: 'D606' } } },
            { instruction: { type: 'turn', modifier: o.manoeuvre ?? 'right' },
              distance: 1_600, attributes: { name: { cpx_numero: 'D606' } } },
          ] }],
        }),
      });
    }
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ geometry: GEOMETRIE, distance: 2_000, duration: 200 }),
    });
  });
  await page.goto('/#iti=2.35220,48.85660;2.36000,48.84000;car');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
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

test('chaque voie porte SES flèches, et celle qui sert reste en clair', async ({ page }) => {
  // Valeur RÉELLE du périphérique parisien, relevée le 30/08.
  await suivre(page, { lanes: 'through|through|through|slight_right', manoeuvre: 'right' });

  const files = page.locator('.bg-file-fleches');
  await expect(files).toHaveCount(4, { timeout: 15_000 });
  await expect(page.locator('.bg-file-fleches[data-conseillee="oui"]')).toHaveCount(1);
  await expect(files.nth(3)).toHaveAttribute('data-conseillee', 'oui');
  // Chaque file dessine ses mouvements : la quatrième en a un, pas zéro.
  await expect(files.nth(3).locator('svg')).toHaveCount(1);
  await expect(page.locator('.bg-chaussee'))
    .toHaveAttribute('aria-label', '4 voies, prenez la 4e en partant de la gauche');
});

test('PLUSIEURS voies peuvent servir — ce que la déduction ne savait pas faire', async ({ page }) => {
  /* C'est tout l'écart avec VOIE-1 : là où l'on déduisait « la plus à
     gauche », le marquage dit « les deux premières ». */
  await suivre(page, { lanes: 'left|left;through|through|through', manoeuvre: 'left' });
  await expect(page.locator('.bg-file-fleches[data-conseillee="oui"]'))
    .toHaveCount(2, { timeout: 15_000 });
  await expect(page.locator('.bg-chaussee'))
    .toHaveAttribute('aria-label', '4 voies, prenez la 1re et 2e en partant de la gauche');
  // La deuxième voie autorise DEUX mouvements : elle porte deux flèches.
  await expect(page.locator('.bg-file-fleches').nth(1).locator('svg')).toHaveCount(2);
});

test('une voie NON PEINTE vaut « tout droit », et seulement pour tout droit', async ({ page }) => {
  /* Valeur réelle : `|||slight_right|slight_right` — trois voies qui
     continuent, deux qui sortent. La règle du marquage français veut qu'une
     voie qui tourne soit fléchée. */
  await suivre(page, { lanes: '|||slight_right|slight_right', manoeuvre: 'straight' });
  await expect(page.locator('.bg-file-fleches')).toHaveCount(5, { timeout: 15_000 });
  await expect(page.locator('.bg-file-fleches[data-conseillee="oui"]')).toHaveCount(3);
});

test('SANS affectation, RIEN NE SE DESSINE — mais le conseil se dit', async ({ page }) => {
  /* Vingt-neuf pour cent des manœuvres seulement portent une affectation
     (mesuré le 30/08) : le repli est le cas le plus fréquent, pas
     l'exception. Depuis TERRAIN-1, ce repli ne se DESSINE plus — les
     rectangles muets n'étaient pas compris au volant — mais il reste DIT,
     pour la voix et le lecteur d'écran. */
  await suivre(page, { voies: '3', manoeuvre: 'right' });
  await expect(page.locator('.bg-chaussee'))
    .toHaveAttribute('aria-label', '3 voies, placez-vous sur la voie de droite',
      { timeout: 15_000 });
  await expect(page.locator('.bg-file-fleches'), 'aucune flèche : rien n’est relevé')
    .toHaveCount(0);
  await expect(page.locator('.bg-chaussee'), 'et rien de muet à l’écran').toBeHidden();
});

test('une affectation qui ne sert PAS la manœuvre ne montre rien', async ({ page }) => {
  /* Le marquage ne dit que « gauche ou tout droit » et l'on tourne à
     droite : montrer ces flèches ferait croire qu'aucune voie ne convient.
     On repasse au conseil de placement — qui se dit, et ne se dessine pas. */
  await suivre(page, { lanes: 'left|through', voies: '2', manoeuvre: 'right' });
  await expect(page.locator('.bg-cartouche')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.bg-file-fleches')).toHaveCount(0);
  await expect(page.locator('.bg-chaussee')).toBeHidden();
});

test('LA REQUÊTE UNIQUE demande aussi l’affectation', async ({ page }) => {
  let corps = '';
  page.on('request', (r) => {
    if (r.url().includes('overpass')) corps = r.postData() ?? '';
  });
  await suivre(page, { lanes: 'through|right', manoeuvre: 'right' });
  await expect(page.locator('.bg-file-fleches')).toHaveCount(2, { timeout: 15_000 });
  const lisible = decodeURIComponent(corps);
  expect(lisible).toContain('turn:lanes');
  expect(lisible, 'les deux sens d’une route bidirectionnelle')
    .toContain('turn:lanes:backward');
});
