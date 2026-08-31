import { test, expect, type Page } from '@playwright/test';
import { simulerTuiles, simulerCommunes } from './tuiles-simulees';

/* LA LIGNE VERTE DE LA PROCHAINE BORNE (GUIDE-3, 01/09).
 *
 * Armelin : « il y avait autrefois une ligne en vert indiquant dans combien
 * de temps on arrive à la prochaine borne de recharge et dans combien de
 * kilomètres. J'aimerais afficher cette information mais PAS EN CONTINU, et
 * qu'elle ne s'affiche que lorsqu'on déploie la barre de navigation. »
 *
 * CE QUE LA MESURE A TROUVÉ EN CHEMIN : trois règles CSS censées ranger ces
 * lignes visaient `bandeau-guidage.bg-compact`, une classe que RIEN ne pose.
 * Du code mort qui donnait l'illusion que la question était traitée. Ce
 * parcours défend le comportement sur l'état RÉEL, `bg-deploye`. */

const TRACE: [number, number][] = Array.from({ length: 21 }, (_, i) =>
  [2.3400 + i * 0.0014, 48.8500]);

async function suivre(page: Page): Promise<void> {
  await simulerTuiles(page);
  await simulerCommunes(page);
  await page.context().grantPermissions(['geolocation']);
  await page.context().setGeolocation({ longitude: TRACE[0]![0], latitude: TRACE[0]![1] });
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
    if (/resource=bdtopo-pgr/.test(route.request().url())) {
      return route.fulfill({ contentType: 'application/json', body: '{"portions":[]}' });
    }
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        geometry: { type: 'LineString', coordinates: TRACE },
        distance: 2_050, duration: 240,
      }),
    });
  });
  await page.route('**overpass.openstreetmap.fr**', (route) => route.fulfill({
    headers: { 'Access-Control-Allow-Origin': '*' },
    contentType: 'application/json', body: '{"elements":[]}',
  }));
  await page.route('**/www.bison-fute.gouv.fr/**', (route) => route.fulfill({
    contentType: 'application/json', body: '[]',
  }));
  await page.goto(`/#iti=${TRACE[0]![0]},${TRACE[0]![1]};2.3680,48.8503;car`);
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Démarrer le suivi' }).click();
  await expect(page.locator('bandeau-guidage')).toBeVisible({ timeout: 15_000 });
}

test('LA LIGNE VERTE NE PARAÎT QU’EN DÉPLIANT LA BARRE', async ({ page }) => {
  await suivre(page);
  /* CE QUI EST MESURÉ ICI EST UNE RÈGLE D'AFFICHAGE, et le parcours le dit :
     on écrit la ligne, puis on regarde si elle se voit. Rejouer un plan de
     recharge complet mêlerait deux questions — le calcul du plan a déjà ses
     propres parcours.
     L'ÉCRITURE ET LA LECTURE TIENNENT DANS LE MÊME GESTE, et c'est ce que le
     premier jet avait manqué : déplier la barre REJOUE le dernier fixe, ce
     qui réécrit la ligne — vide, faute de plan. Le texte injecté avant le
     clic disparaît donc, et le parcours mesurait un élément vide. */
  await page.evaluate(() => {
    (window as unknown as { __pousserFixe: (c: object) => void })
      .__pousserFixe({ longitude: 2.3450, latitude: 48.8500, speed: 12, heading: 90 });
  });
  await page.waitForTimeout(700);

  const PHRASE = 'Recharge : Aire de Beaune (Ionity) dans 1,5 km · 3 min de route';
  const replie = await page.evaluate((phrase) => {
    const l = document.querySelector('.bg-arret') as HTMLElement;
    l.textContent = phrase;
    return getComputedStyle(l).display;
  }, PHRASE);
  /* REPLIÉE, LA BARRE SE TAIT : une barre de conduite dit ce qu'il faut faire
     MAINTENANT. La prochaine borne, on va la CHERCHER. */
  expect(replie, 'la ligne verte ne doit pas s’afficher en continu').toBe('none');

  await page.getByRole('button', { name: 'Afficher les commandes du suivi' }).click();
  const deploye = await page.evaluate((phrase) => {
    const l = document.querySelector('.bg-arret') as HTMLElement;
    l.textContent = phrase;
    return { affichage: getComputedStyle(l).display, texte: l.textContent };
  }, PHRASE);
  expect(deploye.affichage, 'dépliée, elle se montre').not.toBe('none');
  expect(deploye.texte, 'les kilomètres, comme demandé').toContain('km');
  expect(deploye.texte, 'et le temps, comme demandé').toContain('min');
});
