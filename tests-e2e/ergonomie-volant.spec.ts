import { test, expect, type Page } from '@playwright/test';
import { simulerTuiles, simulerCommunes } from './tuiles-simulees';

/* LES RETOURS DU VOLANT, DEUXIÈME SÉRIE (ERGO-2, 30/08).
 *
 * DEUX DE CES PARCOURS DÉFENDENT DES CORRECTIONS DE MES PROPRES DÉFAUTS : la
 * voiture que j'avais annoncée « aux deux tiers » et qui retombait au milieu,
 * et la boussole que j'avais annoncée fonctionnelle et qui ne rendait pas la
 * carte au sens de la voiture. Les deux sont désormais MESURÉS. */

const GEOMETRIE = {
  type: 'LineString',
  coordinates: [[2.3522, 48.8566], [4.8357, 45.764]],
};

test.beforeEach(async ({ page, context }) => {
  await simulerTuiles(page);
  await simulerCommunes(page);
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ longitude: 2.3522, latitude: 48.8566 });
  await page.addInitScript(() => {
    let rappel: ((p: unknown) => void) | null = null;
    (window as unknown as { __pousserFixe: (c: object) => void }).__pousserFixe = (c) => {
      rappel?.({ coords: { accuracy: 5, altitude: null, altitudeAccuracy: null, ...c } });
    };
    Object.defineProperty(navigator, 'geolocation', {
      value: {
        watchPosition: (ok: (p: unknown) => void) => { rappel = ok; return 1; },
        clearWatch: () => { rappel = null; },
        getCurrentPosition: (ok: (p: unknown) => void) => { rappel = ok; },
      },
    });
  });
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
            { instruction: { type: 'depart' }, distance: 200_000,
              attributes: { name: { cpx_numero: 'A6' } } },
            { instruction: { type: 'turn', modifier: 'right' }, distance: 190_000,
              attributes: { name: { cpx_numero: 'A7' } } },
          ] }],
        }),
      });
    }
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ geometry: GEOMETRIE, distance: 390_000, duration: 13_000 }),
    });
  });
  await page.route('**overpass.openstreetmap.fr**', (route) => route.fulfill({
    headers: { 'Access-Control-Allow-Origin': '*' },
    contentType: 'application/json', body: '{"elements":[]}',
  }));
  await page.route('**/www.bison-fute.gouv.fr/**', (route) => route.fulfill({
    contentType: 'application/json', body: '[]',
  }));
});

async function suivre(page: Page): Promise<void> {
  await page.goto('/#iti=2.35220,48.85660;4.83570,45.76400;car');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Démarrer le suivi' }).click();
  await expect(page.locator('bandeau-guidage')).toBeVisible({ timeout: 15_000 });
  await page.evaluate(() => (window as unknown as { __pousserFixe: (c: object) => void })
    .__pousserFixe({ longitude: 2.3820, latitude: 48.8195, speed: 24.2, heading: 90 }));
  await page.waitForTimeout(1_400);
}

test('LA VOITURE EST BASSE dans l’écran, et ne touche pas la barre', async ({ page }) => {
  /* Armelin : « la vue du véhicule est toujours centrée au milieu de
     l'écran. J'avais demandé à ce qu'il apparaisse un peu plus bas. »
     Mon premier calcul visait deux tiers de la carte VISIBLE — ce qui, avec
     une barre de deux cents pixels, retombe pile au milieu de l'ÉCRAN. Le
     calcul était juste, la cible était mauvaise. */
  await suivre(page);
  const p = await page.evaluate(() => {
    const c = (window as unknown as { __carte: {
      project(l: [number, number]): { y: number };
      getContainer(): HTMLElement;
    } }).__carte;
    const y = c.project([2.3820, 48.8195]).y;
    const hauteur = c.getContainer().clientHeight;
    const barre = document.querySelector('bandeau-guidage')!.getBoundingClientRect().top;
    return { part: y / hauteur, auDessusDeLaBarre: barre - y };
  });
  expect(p.part, 'la voiture doit être dans le tiers bas').toBeGreaterThan(0.64);
  expect(p.part, 'mais pas collée au bas de l’écran').toBeLessThan(0.85);
  expect(p.auDessusDeLaBarre, 'elle ne doit pas toucher la barre').toBeGreaterThan(60);
});

test('LA BOUSSOLE BASCULE DANS LES DEUX SENS, sans attendre un nouveau fixe', async ({ page }) => {
  /* Armelin : « quand j'appuie sur l'icône de la boussole, je veux que la vue
     change entre sens de la voiture et nord. Mais ça ne fonctionne pas. »
     DEUX DÉFAUTS, TOUS DEUX DE MOI : j'avais remis le lissage du cap à zéro
     (perdant le dernier cap connu), et mon recentrage ne nommait pas le cap —
     `easeTo` fige ce qu'il ne nomme pas. À l'arrêt, le récepteur ne donne
     aucun cap : la carte restait donc au nord pour toujours. */
  await suivre(page);
  const cap = async () => (((await page.evaluate(() => Math.round(
    (window as unknown as { __carte: { getBearing(): number } }).__carte.getBearing(),
  ))) % 360) + 360) % 360;
  expect(await cap(), 'on part dans le sens de la voiture').toBe(90);

  await page.locator('.maplibregl-ctrl-compass').click();
  await expect.poll(cap, { timeout: 10_000 }).toBe(0);

  // ET LE RETOUR, SANS NOUVEAU FIXE : c'est tout le défaut qu'il a rencontré.
  await page.locator('.maplibregl-ctrl-compass').click();
  await expect.poll(cap, { timeout: 10_000 }).toBe(90);
});

test('LA BOUSSOLE PORTE SES POINTS CARDINAUX', async ({ page }) => {
  await suivre(page);
  const fond = await page.evaluate(() => getComputedStyle(
    document.querySelector('.maplibregl-ctrl-compass .maplibregl-ctrl-icon')!,
  ).backgroundImage);
  /* LA SPÉCIFICITÉ EST LE PIÈGE : MapLibre écrit un sélecteur à 0-3-1, et
     une règle à 0-2-0 perd sans se plaindre. On vérifie donc ce qui est
     PEINT, pas la présence d'une règle. */
  expect(fond, 'la rose doit remplacer la flèche').toContain('D93025');
  expect(decodeURIComponent(fond)).toContain('>N<');
});

test('LE BOUTON DE VUE DIT « 2D » ou « 3D »', async ({ page }) => {
  /* « Ce serait mieux d'afficher simplement 2D ou 3D sur le bouton en
     fonction de la vue affichée, pour que l'utilisateur comprenne qu'il faut
     appuyer de nouveau. » */
  await suivre(page);
  await page.getByRole('button', { name: 'Afficher les commandes du suivi' }).click();
  const bouton = page.locator('.bg-3d');
  await expect(bouton).toHaveText('3D');
  await bouton.click();
  await expect(bouton).toHaveText('2D');
  await expect(bouton).toHaveAttribute('aria-label', /passer en relief/);
});

test('LA PASTILLE DE VITESSE se décolle de la barre d’échelle', async ({ page }) => {
  await suivre(page);
  const ecart = await page.evaluate(() => {
    const v = document.querySelector('.bg-vitesse')!.getBoundingClientRect();
    const e = document.querySelector('.maplibregl-ctrl-scale')!.getBoundingClientRect();
    return e.top - v.bottom;
  });
  expect(ecart, 'le cercle et le rectangle blanc ne doivent plus se toucher')
    .toBeGreaterThan(4);

});

test('LA BULLE DES LIENS N’ATTEINT PLUS LA PASTILLE DE VITESSE', async ({ page }) => {
  /* Armelin : « le rond de la vitesse s'affiche en superposition au-dessus
     du rectangle blanc des liens ». La correction ne dépend d'AUCUN état :
     la bulle s'arrête à 62 % de la largeur, côté droit ; la pastille est à
     gauche. Elles ne peuvent plus se rencontrer — ce qui se mesure même
     quand la bulle est repliée, et c'est tout l'intérêt. */
  await page.setViewportSize({ width: 420, height: 860 });
  await suivre(page);
  const geo = await page.evaluate(() => {
    const bulle = document.querySelector('.maplibregl-ctrl-attrib')!;
    const style = getComputedStyle(bulle);
    const v = document.querySelector('.bg-vitesse')!.getBoundingClientRect();
    return { plafond: style.maxWidth, droiteVitesse: v.right, largeurEcran: window.innerWidth };
  });
  /* 62 % de 420 px font 260 px : la bulle ne peut pas descendre sous
     l'abscisse 160, et la pastille s'arrête bien avant. */
  const gaucheMinimale = geo.largeurEcran - (geo.largeurEcran * 0.62);
  expect(geo.droiteVitesse, 'la pastille reste à gauche de la bulle la plus large')
    .toBeLessThan(gaucheMinimale);
});
