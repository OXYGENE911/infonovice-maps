import { test, expect, type Page } from '@playwright/test';
import { simulerTuiles, simulerCommunes } from './tuiles-simulees';

/* LE CORRIDOR QUI SUIT VRAIMENT LA ROUTE (CORRIDOR-1, 31/08).
 *
 * LE DÉFAUT QUE CES PARCOURS GARDENT FERMÉ. Armelin : « un rond-point où le
 * GPS m'a demandé de tourner à droite au lieu de m'indiquer un schéma de
 * rond-point ». Le détecteur de giratoires était juste — sur les données
 * réelles il trouvait les deux anneaux du trajet. C'est la REQUÊTE qui ne
 * rapportait rien : le tracé était simplifié à un point tous les 300 m, et
 * `around` mesure la distance à la POLYLIGNE. En ville, la corde coupait les
 * virages et sortait la route du couloir.
 *
 * MESURÉ sur son type de trajet (820 m de rue de banlieue) : 4 points, ZÉRO
 * anneau, ZÉRO limite. Après correction : 6 points, CINQ anneaux, UNE limite.
 *
 * ET SUR AUTOROUTE ÇA MARCHAIT — la route y est droite. Le défaut ne se
 * voyait qu'en ville, là où la conduite est la plus exigeante. */

/** Une route en lacets : le cas où une corde de 300 m quitte la chaussée. */
const LACETS: [number, number][] = Array.from({ length: 240 }, (_, i) => [
  2.35 + i * 0.00035,
  48.85 + Math.sin(i / 9) * 0.0016,
]);

/** L'écart maximal d'un point à une polyligne, en mètres. */
function ecartA(p: [number, number], ligne: readonly [number, number][]): number {
  const mLat = 111_320; const mLon = 111_320 * Math.cos((48.85 * Math.PI) / 180);
  let meilleur = Infinity;
  for (let i = 0; i < ligne.length - 1; i += 1) {
    const a = ligne[i]!; const b = ligne[i + 1]!;
    const bx = (b[0] - a[0]) * mLon; const by = (b[1] - a[1]) * mLat;
    const px = (p[0] - a[0]) * mLon; const py = (p[1] - a[1]) * mLat;
    const carre = bx * bx + by * by;
    const t = carre === 0 ? 0 : Math.max(0, Math.min(1, (px * bx + py * by) / carre));
    meilleur = Math.min(meilleur, Math.hypot(px - t * bx, py - t * by));
  }
  return meilleur;
}

/** Les points d'une requête de corridor, relus depuis son corps. */
function pointsDe(corps: string): [number, number][] {
  const m = /around:25,([\d.,]+)\)/.exec(decodeURIComponent(corps));
  if (!m) return [];
  const n = m[1]!.split(',').map(Number);
  const pts: [number, number][] = [];
  for (let i = 0; i + 1 < n.length; i += 2) pts.push([n[i + 1]!, n[i]!]);
  return pts;
}

async function suivre(
  page: Page, o: { corps?: unknown; statut?: number } = {},
): Promise<string[]> {
  const requetes: string[] = [];
  await simulerTuiles(page);
  await simulerCommunes(page);
  await page.route('**overpass.openstreetmap.fr**', (route) => {
    const corps = route.request().postData() ?? route.request().url();
    if (/maxspeed/.test(decodeURIComponent(corps))) requetes.push(corps);
    return route.fulfill({
      headers: { 'Access-Control-Allow-Origin': '*' },
      status: o.statut ?? 200,
      contentType: 'application/json',
      body: JSON.stringify(o.corps ?? { elements: [] }),
    });
  });
  await page.route('**/data.geopf.fr/navigation/itineraire**', (route) => {
    if (/resource=bdtopo-pgr/.test(route.request().url())) {
      return route.fulfill({ contentType: 'application/json', body: '{"portions":[]}' });
    }
    if (/getSteps=true/i.test(route.request().url())) {
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          geometry: { type: 'LineString', coordinates: LACETS },
          distance: 9_000, duration: 700,
          portions: [{ steps: [
            { instruction: { type: 'depart' }, distance: 4_000,
              attributes: { name: { nom_1_gauche: 'RTE DES LACETS' } } },
            { instruction: { type: 'turn', modifier: 'right' }, distance: 5_000,
              attributes: { name: { nom_1_gauche: 'RTE DES LACETS' } } },
          ] }],
        }),
      });
    }
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        geometry: { type: 'LineString', coordinates: LACETS },
        distance: 9_000, duration: 700,
      }),
    });
  });
  await page.route('**/www.bison-fute.gouv.fr/**', (route) => route.fulfill({
    contentType: 'application/json', body: '[]',
  }));
  const d = LACETS[0]!; const a = LACETS[LACETS.length - 1]!;
  await page.goto(`/#iti=${d[0].toFixed(5)},${d[1].toFixed(5)};`
    + `${a[0].toFixed(5)},${a[1].toFixed(5)};car`);
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Démarrer le suivi' }).click();
  await expect(page.locator('.bg-cartouche')).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => requetes.length, { timeout: 20_000 }).toBeGreaterThan(0);
  return requetes;
}

/* L'AVEU DES REPÈRES NE PARAÎT QU'AU DÉPLIAGE depuis BANDEAU-1 (01/09) :
   Armelin l'a demandé après un essai à pied, le cartouche grandissait et
   masquait la frise du trajet. Ce que ces parcours défendent — que l'aveu
   soit bien ARMÉ quand le service tombe — n'a pas changé ; il faut seulement
   ouvrir la barre pour le lire, comme l'usager. */
async function deplier(page: Page): Promise<void> {
  await page.locator('.bg-deplier').click();
}

test.beforeEach(async ({ context }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ longitude: LACETS[0]![0], latitude: LACETS[0]![1] });
});

test('LE COULOIR NE QUITTE PLUS LA CHAUSSÉE dans les virages', async ({ page }) => {
  /* C'EST LA GARANTIE QUI MANQUAIT, et le défaut tenait tout entier là :
     `around` mesure la distance à la polyligne fournie. Si elle coupe les
     virages, la route n'est plus dans le couloir et TOUT disparaît — limites,
     sorties, giratoires, affectation par voie — sans un mot. */
  const requetes = await suivre(page);
  const points = pointsDe(requetes[0]!);
  expect(points.length, 'la requête ne porte aucun point').toBeGreaterThan(2);
  const pire = Math.max(...LACETS.map((p) => ecartA(p, points)));
  expect(pire, 'la polyligne interrogée s’écarte de la route').toBeLessThanOrEqual(9);
});

test('UN LONG TRACÉ EST DÉCOUPÉ, jamais demandé d’un bloc', async ({ page }) => {
  /* Une requête trop grosse épuise le budget d'Overpass, qui rend alors un
     tableau vide qu'on prendrait pour « rien le long de cette route ». */
  const requetes = await suivre(page);
  for (const r of requetes) {
    expect(pointsDe(r).length,
      'un paquet dépasse ce qu’Overpass sait traiter').toBeLessThanOrEqual(120);
  }
});

test('UNE EXPIRATION NE SE LIT PAS « route sans repères »', async ({ page }) => {
  /* Overpass qui renonce rend `elements: []` AVEC un `remark`. Sans le lire,
     on affichait une route sans limite ni rond-point — et c'est exactement ce
     qu'Armelin a rencontré. */
  await suivre(page, {
    corps: {
      elements: [],
      remark: 'runtime error: Query timed out in "query" at line 1 after 45 seconds.',
    },
  });
  await deplier(page);
  await expect(page.locator('.bg-reperes')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.bg-reperes')).toContainText('indisponibles');
});

test('LE SUIVI VAUT TOUJOURS SANS LES REPÈRES', async ({ page }) => {
  /* On dit ce qui manque ; on n'interrompt rien. Un GPS qui s'arrête parce
     qu'OpenStreetMap est saturé serait pire que le défaut qu'il signale. */
  await suivre(page, { statut: 504, corps: {} });
  await expect(page.locator('.bg-cartouche')).toBeVisible();
  await deplier(page);
  await expect(page.locator('.bg-reperes')).toBeVisible({ timeout: 20_000 });
});

test('QUAND LE SERVICE EST MORT, ON RENONCE VITE', async ({ page }) => {
  /* LE DÉCOUPAGE A UN REVERS qu'il fallait couvrir : un trajet en dix paquets
     face à un service muet passerait DIX fois le délai d'attente à échouer —
     dix minutes pour apprendre ce qu'on savait au bout de deux. On s'arrête
     après deux échecs de suite.
     ON NE RENONCE PAS AU PREMIER : une requête peut échouer seule, et
     abandonner sur un seul échec priverait le trajet du reste de ses
     repères. */
  const requetes = await suivre(page, { statut: 504, corps: {} });
  await deplier(page);
  await expect(page.locator('.bg-reperes')).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(1_500);
  expect(requetes.length, 'on s’acharne sur un service qui ne répond pas')
    .toBeLessThanOrEqual(2);
});

test('LA LIGNE DU BAS NE TOUCHE PLUS LE BORD DE L’ÉCRAN', async ({ page }) => {
  /* Armelin, 31/08 : « les indications de navigation sont écrites trop bas
     dans la fenêtre de la barre d'état […] les textes sont tellement bas que
     ça touche presque la bordure de mon écran. »
     LE DÉFAUT ÉTAIT DANS UNE RÈGLE TÉLÉPHONE : `.bg { padding: 10px 12px }`
     — un RACCOURCI, qui remettait le bas à dix pixels et effaçait la marge
     d'encoche, précisément sur les appareils qui en ont une. Sur écran large
     la règle ne s'appliquait pas : le défaut ne se voyait que sur téléphone,
     et c'est pourquoi ce parcours mesure à 412 pixels de large. */
  await page.setViewportSize({ width: 412, height: 915 });
  await suivre(page);
  const g = await page.evaluate(() => {
    const bg = document.querySelector('.bg')!.getBoundingClientRect();
    const chiffres = document.querySelector('.bg-chiffres')!.getBoundingClientRect();
    const croix = document.querySelector('.bg-arreter')!.getBoundingClientRect();
    return {
      sousLesChiffres: Math.round(bg.bottom - chiffres.bottom),
      sousLaCroix: Math.round(bg.bottom - croix.bottom),
    };
  });
  expect(g.sousLesChiffres, 'les chiffres frôlent le bas de l’écran')
    .toBeGreaterThanOrEqual(20);
  /* ET LA RANGÉE RESTE ÉQUILIBRÉE : la croix ne doit pas se retrouver seule
     au milieu pendant que les chiffres plongent. */
  expect(Math.abs(g.sousLaCroix - g.sousLesChiffres)).toBeLessThanOrEqual(16);
});
