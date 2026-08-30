import { test, expect, type Page } from '@playwright/test';
import { simulerTuiles, simulerCommunes } from './tuiles-simulees';

/* LE SCHÉMA DE ROND-POINT (ROND-1, demandes d'Armelin des 29 et 30/08).
 *
 * CE QUE CES PARCOURS DÉFENDENT : que le schéma REMPLACE ce que dit le
 * moteur, au lieu de s'y ajouter. Le moteur ignore les giratoires — mesuré
 * sur les deux — et y annonce « tournez à droite » : laissé à l'écran, ce
 * texte contredirait le schéma juste à côté. */

const CENTRE: [number, number] = [2.35, 48.85];
const M_LAT = 111_320;
const M_LON = 111_320 * Math.cos((48.85 * Math.PI) / 180);

function auCap(capDeg: number, distance: number): [number, number] {
  const t = (capDeg * Math.PI) / 180;
  return [
    CENTRE[0] + (distance * Math.sin(t)) / M_LON,
    CENTRE[1] + (distance * Math.cos(t)) / M_LAT,
  ];
}

const ANNEAU = {
  type: 'way', id: 1, tags: { junction: 'roundabout', highway: 'tertiary' },
  geometry: Array.from({ length: 16 }, (_, i) => {
    const p = auCap(i * 22.5, 20);
    return { lon: p[0], lat: p[1] };
  }),
};

function branche(capDeg: number, id: number, sens?: string) {
  const a = auCap(capDeg, 20);
  const b = auCap(capDeg, 60);
  return {
    type: 'way', id,
    tags: { highway: 'secondary', ...(sens === undefined ? {} : { oneway: sens }) },
    geometry: [{ lon: a[0], lat: a[1] }, { lon: b[0], lat: b[1] }],
  };
}

/** Un trajet qui entre au sud du giratoire et ressort au cap demandé. */
function traverser(capSortie: number): [number, number][] {
  const points: [number, number][] = [auCap(180, 600), auCap(180, 90), auCap(180, 40)];
  const cible = ((180 - capSortie) + 360) % 360;
  for (let d = 10; d < cible; d += 10) points.push(auCap((180 - d + 360) % 360, 20));
  points.push(auCap(capSortie, 20), auCap(capSortie, 40),
    auCap(capSortie, 90), auCap(capSortie, 600));
  return points;
}

async function suivre(
  page: Page, capSortie: number,
  o: { sansBranches?: boolean; interditALEst?: boolean } = {},
): Promise<[number, number][]> {
  const coords = traverser(capSortie);
  const geometrie = { type: 'LineString', coordinates: coords };
  const elements = o.sansBranches
    ? [ANNEAU]
    : [ANNEAU, branche(180, 2), branche(270, 3), branche(0, 4),
      /* `oneway=-1` : la branche est numérisée de l'anneau vers l'extérieur
         mais la circulation y ARRIVE — c'est un sens interdit. */
      branche(90, 5, o.interditALEst ? '-1' : undefined)];

  await page.route('**overpass.openstreetmap.fr**', (route) => route.fulfill({
    headers: { 'Access-Control-Allow-Origin': '*' },
    contentType: 'application/json', body: JSON.stringify({ elements }),
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
          geometry: geometrie, distance: 1_300, duration: 120,
          /* CE QUE LE MOTEUR DIT VRAIMENT DANS UN GIRATOIRE — mesuré le
             30/08 sur osrm ET valhalla : « tournez à droite », jamais un
             rond-point. C'est ce texte que le schéma doit remplacer. */
          portions: [{ steps: [
            { instruction: { type: 'depart' }, distance: 560,
              attributes: { name: { cpx_numero: 'D606' } } },
            { instruction: { type: 'turn', modifier: 'right' }, distance: 700,
              attributes: { name: { cpx_numero: 'D606' } } },
          ] }],
        }),
      });
    }
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ geometry: geometrie, distance: 1_300, duration: 120 }),
    });
  });
  const d = coords[0]!;
  const a = coords[coords.length - 1]!;
  await page.goto(`/#iti=${d[0].toFixed(5)},${d[1].toFixed(5)};`
    + `${a[0].toFixed(5)},${a[1].toFixed(5)};car`);
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Démarrer le suivi' }).click();
  await expect(page.locator('.bg-cartouche')).toBeVisible({ timeout: 15_000 });
  return coords;
}

test.beforeEach(async ({ page, context }) => {
  await simulerTuiles(page);
  await simulerCommunes(page);
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({
    longitude: auCap(180, 600)[0], latitude: auCap(180, 600)[1],
  });
  await page.route('**/www.bison-fute.gouv.fr/**', (route) => route.fulfill({
    contentType: 'application/json', body: '[]',
  }));
});

test('à DROITE, c’est la première sortie — et le schéma remplace le moteur', async ({ page }) => {
  await suivre(page, 90);
  await expect(page.locator('.bg-giratoire')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.bg-instruction')).toHaveText('Prenez la 1re sortie');
  /* LE MOTEUR DISAIT « TOURNEZ À DROITE » : le laisser à l'écran
     contredirait le schéma juste à côté. */
  await expect(page.locator('.bg-instruction')).not.toContainText('Tournez');
  // La flèche de manœuvre cède la place : un seul dessin par manœuvre.
  await expect(page.locator('.bg-cartouche .bg-fleche')).toBeHidden();
});

test('TOUT DROIT, c’est la deuxième — le cas qui trompe', async ({ page }) => {
  await suivre(page, 0);
  await expect(page.locator('.bg-instruction')).toHaveText('Prenez la 2e sortie', { timeout: 15_000 });
});

test('à GAUCHE, c’est la troisième', async ({ page }) => {
  await suivre(page, 270);
  await expect(page.locator('.bg-instruction')).toHaveText('Prenez la 3e sortie', { timeout: 15_000 });
});

test('le schéma est DESSINÉ aux vrais angles, pas choisi dans une bibliothèque', async ({ page }) => {
  await suivre(page, 90);
  const schema = page.locator('.bg-giratoire svg');
  await expect(schema).toBeVisible({ timeout: 15_000 });
  // L'anneau, l'entrée, notre sortie, sa flèche, et les branches qu'on ne prend pas.
  await expect(page.locator('.bg-gir-anneau')).toHaveCount(1);
  await expect(page.locator('.bg-gir-sortie')).toHaveCount(1);
  await expect(page.locator('.bg-gir-fleche')).toHaveCount(1);
  await expect(page.locator('.bg-gir-branche')).toHaveCount(2);
  await expect(page.locator('.bg-gir-rang')).toHaveText('1');

  /* LA PREMIÈRE SORTIE PART À DROITE quand on entre par le bas : c'est ce
     que fait tout conducteur en France. Le premier jet l'envoyait à gauche,
     vu sur capture — d'où cette mesure, qui lit la géométrie du tracé. */
  const x = await page.locator('.bg-gir-sortie').getAttribute('d');
  const abscisses = (x ?? '').match(/[\d.]+/g)?.map(Number) ?? [];
  expect(abscisses[0], 'la sortie part du bord droit de l’anneau').toBeGreaterThan(24);
  expect(abscisses[2], 'et s’en éloigne vers la droite').toBeGreaterThan(abscisses[0]!);
});

test('SANS branches, on dessine mais on ne compte pas', async ({ page }) => {
  /* OpenStreetMap n'a pas toujours toutes les branches. Le schéma reste vrai
     — l'anneau et notre sortie viennent de notre tracé — mais il n'annonce
     pas « la première » quand on ne sait pas compter. */
  await suivre(page, 90, { sansBranches: true });
  await expect(page.locator('.bg-giratoire')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.bg-instruction')).toHaveText('Prenez votre sortie');
  await expect(page.locator('.bg-gir-rang')).toHaveCount(0);
  await expect(page.locator('.bg-gir-sortie')).toHaveCount(1);
});

test('le rang se DIT en toutes lettres, plus long que ce qui s’écrit', async ({ page }) => {
  await suivre(page, 270);
  await expect(page.locator('.bg-giratoire'))
    .toHaveAttribute('aria-label', 'Au rond-point, prenez la 3e sortie', { timeout: 15_000 });
});

test('UNE SORTIE EN SENS INTERDIT NE COMPTE PAS', async ({ page }) => {
  /* ROND-2 (30/08). Armelin, au volant : « je suis entré dans un rond-point
     et le GPS m'a indiqué la deuxième sortie. Le schéma était bon, sauf que
     la première sortie était un sens interdit. Techniquement, le GPS aurait
     dû m'indiquer la première sortie AUTORISÉE. »
     Ici l'est est interdit : en sortant au nord, on prend donc la PREMIÈRE
     sortie praticable, et non la deuxième. */
  await suivre(page, 0, { interditALEst: true });
  await expect(page.locator('.bg-instruction'))
    .toHaveText('Prenez la 1re sortie', { timeout: 15_000 });
  // Et la branche interdite ne se dessine plus non plus.
  await expect(page.locator('.bg-gir-branche')).toHaveCount(1);
});
