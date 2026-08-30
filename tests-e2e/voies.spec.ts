import { test, expect, type Page } from '@playwright/test';
import { simulerTuiles, simulerCommunes } from './tuiles-simulees';

/* LES VOIES ET LE CÔTÉ OÙ SE PLACER (VOIE-1, demandes d'Armelin des 29 et
 * 30/08 : « des flèches pour préciser où se placer sur la chaussée […] fais
 * les flèches de voies avec les deux itinéraires »).
 *
 * CE QUE CES PARCOURS DÉFENDENT : que la chaussée ne paraisse QUE lorsque
 * les quatre conditions sont réunies — une manœuvre qui a un côté, assez
 * proche, sur une chaussée d'au moins deux voies dont on connaît le nombre.
 * Et surtout : que la SECONDE requête soit bien une seconde requête, sur
 * l'autre ressource, et que son échec ne casse rien. */

const GEOMETRIE = {
  type: 'LineString',
  coordinates: [[2.3522, 48.8566], [4.8357, 45.764]],
};

/** La réponse de la ressource riche : des tronçons, aucune instruction. */
function reponseVoies(voies: string, europe = '') {
  return {
    geometry: GEOMETRIE, distance: 390_000, duration: 13_000,
    portions: [{ steps: [
      /* Le premier point de chaque tronçon EST sur le tracé suivi : c'est ce
         que la mesure du 30/08 constate (écart médian nul entre les deux
         moteurs), et c'est ce que la couture exige. */
      { geometry: { type: 'LineString', coordinates: [[2.3522, 48.8566]] },
        attributes: { nombre_de_voies: voies, cpx_numero_route_europeenne: europe },
        distance: 100, instruction: {} },
      { geometry: { type: 'LineString', coordinates: [[2.36, 48.84]] },
        attributes: { nombre_de_voies: voies, cpx_numero_route_europeenne: europe },
        distance: 100, instruction: {} },
    ] }],
  };
}

/**
 * Lance un suivi. `voies` est ce que rend la ressource riche ; `manoeuvre`
 * le modificateur de la manœuvre à venir.
 */
async function suivre(
  page: Page,
  o: { voies?: string; manoeuvre?: string; voiesEnPanne?: boolean; europe?: string } = {},
): Promise<void> {
  await page.route('**/data.geopf.fr/navigation/itineraire**', (route) => {
    const url = route.request().url();
    /* LES DEUX RESSOURCES SE DISTINGUENT DANS L'URL, et c'est le cœur de la
       fonctionnalité : `bdtopo-pgr` porte les attributs, `bdtopo-osrm` les
       manœuvres. Les confondre rendrait un suivi sans instructions. */
    if (/resource=bdtopo-pgr/.test(url)) {
      if (o.voiesEnPanne) return route.fulfill({ status: 503, body: '{}' });
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(reponseVoies(o.voies ?? '3', o.europe ?? '')),
      });
    }
    if (/getSteps=true/i.test(url)) {
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          geometry: GEOMETRIE, distance: 390_000, duration: 13_000,
          /* L'ÉTAPE COURANTE EST COURTE : la manœuvre suivante tombe ainsi
             sous le seuil de neuf cents mètres, comme à l'approche réelle. */
          portions: [{ steps: [
            { instruction: { type: 'depart' }, distance: 400,
              attributes: { name: { cpx_numero: 'A6' } } },
            { instruction: { type: 'turn', modifier: o.manoeuvre ?? 'right' },
              distance: 389_600, attributes: { name: { cpx_numero: 'A7' } } },
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
  await page.route('**overpass.openstreetmap.fr**', (route) => route.fulfill({
    headers: { 'Access-Control-Allow-Origin': '*' },
    contentType: 'application/json', body: JSON.stringify({ elements: [] }),
  }));
  await page.route('**/www.bison-fute.gouv.fr/**', (route) => route.fulfill({
    contentType: 'application/json', body: '[]',
  }));
});

/* CE QUE VOIE-1 EST DEVENU (TERRAIN-1, 30/08). Armelin, au volant : « j'ai
   eu des panneaux blancs avec des petits rectangles gris et noirs. Je n'ai
   pas du tout compris à quoi ils servaient. » Le conseil de placement ne se
   DESSINE donc plus — un rectangle un peu plus clair ne dit pas « mettez-vous
   à droite ». Il reste DIT : la voix et le lecteur d'écran le portent, là où
   une phrase se comprend sans mode d'emploi. */

test('le conseil de placement ne se dessine plus, mais il se DIT', async ({ page }) => {
  await suivre(page, { voies: '3', manoeuvre: 'right' });
  await expect(page.locator('.bg-chaussee'))
    .toHaveAttribute('aria-label', '3 voies, placez-vous sur la voie de droite',
      { timeout: 15_000 });
  await expect(page.locator('.bg-chaussee'), 'plus de rectangles muets').toBeHidden();
  await expect(page.locator('.bg-file')).toHaveCount(0);
});

test('à gauche, la phrase change de côté', async ({ page }) => {
  await suivre(page, { voies: '4', manoeuvre: 'left' });
  await expect(page.locator('.bg-chaussee'))
    .toHaveAttribute('aria-label', '4 voies, placez-vous sur la voie de gauche',
      { timeout: 15_000 });
});

test('TOUT DROIT : aucune chaussée — une consigne inutile use la confiance', async ({ page }) => {
  await suivre(page, { voies: '3', manoeuvre: 'straight' });
  await expect(page.locator('.bg-chaussee')).toBeHidden();
});

test('UNE SEULE VOIE : rien à conseiller, donc rien à l’écran', async ({ page }) => {
  /* « Serrez à droite » quand il n'existe qu'une voie est du bruit, et du
     bruit qui inquiète. */
  await suivre(page, { voies: '1', manoeuvre: 'right' });
  await expect(page.locator('.bg-chaussee')).toBeHidden();
});

test('LA SECONDE REQUÊTE EN PANNE NE CASSE RIEN : le suivi continue', async ({ page }) => {
  /* Elle coûte seize secondes et deux tiers de méga-octet au service public :
     son échec doit être bénin, jamais fatal. */
  await suivre(page, { voiesEnPanne: true });
  await expect(page.locator('.bg-chaussee')).toBeHidden();
  await expect(page.locator('.bg-instruction')).toContainText('Tournez à droite');
  await expect(page.locator('.bg-cartouche')).toBeVisible();
});

test('LES DEUX RESSOURCES SONT BIEN INTERROGÉES, chacune pour ce qu’elle sait', async ({ page }) => {
  const urls: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/navigation/itineraire')) urls.push(r.url());
  });
  await suivre(page, { voies: '3', manoeuvre: 'right' });
  await expect(page.locator('.bg-cartouche')).toBeVisible({ timeout: 15_000 });

  const pgr = urls.filter((u) => u.includes('resource=bdtopo-pgr'));
  const osrm = urls.filter((u) => u.includes('resource=bdtopo-osrm'));
  expect(osrm.length, 'le guidage reste sur la ressource des manœuvres')
    .toBeGreaterThan(0);
  /* UNE SEULE FOIS : la requête est lourde, et le service public est un bien
     commun. Elle part au démarrage du suivi, pas à chaque fixe GPS. */
  expect(pgr).toHaveLength(1);
  expect(pgr[0]).toContain('waysAttributes=nombre_de_voies');
});

/* LE CARTOUCHE VERT EUROPÉEN (EURO-1, 30/08) — type E41 de l'IISR. La donnée
 * vient de la MÊME requête que les voies. */

test('« E15/E50 » donne DEUX cartouches verts, à côté du rouge', async ({ page }) => {
  await suivre(page, { europe: 'E15/E50' });
  const europe = page.locator('.bg-europe');
  await expect(europe).toBeVisible({ timeout: 15_000 });
  await expect(europe.locator('.bg-ecusson-europe')).toHaveCount(2);
  await expect(europe.locator('.bg-ecusson-europe').first()).toHaveText('E15');
  await expect(europe.locator('.bg-ecusson-europe').nth(1)).toHaveText('E50');

  /* IL S'AJOUTE, IL NE REMPLACE PAS : sur l'A6 on lit « A6 » en rouge ET
     « E15 » en vert, comme sur la route. */
  await expect(page.locator('.bg-ecusson')).toHaveText('A7');
  const vert = await page.evaluate(() =>
    getComputedStyle(document.querySelector('.bg-ecusson-europe')!).backgroundColor);
  expect(vert, 'le cartouche européen est vert, type E41').toBe('rgb(20, 107, 58)');
});

test('SANS numéro européen, aucun cartouche vert — la plupart des routes n’en ont pas', async ({ page }) => {
  await suivre(page, { europe: '' });
  await expect(page.locator('.bg-cartouche')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.bg-europe')).toBeHidden();
});

test('il se DIT en toutes lettres : « E15 » lu caractère par caractère ne s’entend pas', async ({ page }) => {
  await suivre(page, { europe: 'E15' });
  await expect(page.locator('.bg-ecusson-europe'))
    .toHaveAttribute('aria-label', 'route européenne E15');
});
