import { test, expect, type Page } from '@playwright/test';
import { simulerTuiles, simulerCommunes } from './tuiles-simulees';

/* LES PANNEAUX DE DIRECTION (PAN-1, demande d'Armelin du 30/08 : « dans les
 * rectangles annonçant les directions, ce serait bien que les cartouches
 * s'affichent sous forme de vrais panneaux d'autoroute »).
 *
 * CE QUE CES PARCOURS DÉFENDENT : la RÈGLE, pas un goût. L'IISR (relevée le
 * 30/08) dit deux choses qui se mesurent — les panneaux à fond bleu ou vert
 * portent inscriptions ET listels BLANCS, les fonds blancs les portent
 * NOIRS ; et le cartouche de numérotation a sa PROPRE couleur, rouge sur
 * autoroute et nationale (type E42), jaune sur départementale (E43).
 *
 * On mesure donc la couleur CALCULÉE, pas la présence d'une classe : c'est
 * la seule façon de voir qu'une règle a bien été appliquée jusqu'au pixel.
 * (La leçon vient de PIC-1 : un sélecteur cassé laissait la classe en place
 * et la couleur ailleurs — le parcours passait, l'écran mentait.) */

const GEOMETRIE = {
  type: 'LineString',
  coordinates: [[2.3522, 48.8566], [4.8357, 45.764]],
};

const BLEU = 'rgb(11, 78, 162)';
const VERT = 'rgb(20, 107, 58)';
const BLANC = 'rgb(255, 255, 255)';
const NOIR = 'rgb(26, 26, 26)';
const ROUGE_E42 = 'rgb(200, 16, 46)';
const JAUNE_E43 = 'rgb(242, 194, 0)';

/** Un suivi lancé sur une route dont on choisit le numéro. */
async function suivreSur(page: Page, numero: string): Promise<void> {
  await page.route('**/data.geopf.fr/navigation/itineraire**', (route) => {
    const url = route.request().url();
    if (/getSteps=true/i.test(url)) {
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          geometry: GEOMETRIE, distance: 390_000, duration: 13_000,
          /* DEUX ÉTAPES, ET LA MANŒUVRE EST CELLE DE LA SECONDE : le service
             rend l'instruction du DÉBUT d'étape et la longueur qui suit. Le
             panneau annonce donc la voie de la SECONDE — celle où l'on va. */
          portions: [{ steps: [
            { instruction: { type: 'depart' }, distance: 200_000,
              attributes: { name: { cpx_numero: numero } } },
            { instruction: { type: 'turn', modifier: 'right' }, distance: 190_000,
              attributes: { name: { cpx_numero: numero } } },
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

/** La couleur calculée d'un élément — la seule preuve qui vaille. */
async function peinture(page: Page, selecteur: string): Promise<{ fond: string; encre: string }> {
  return page.evaluate((s) => {
    const e = document.querySelector(s)!;
    const style = getComputedStyle(e);
    return { fond: style.backgroundColor, encre: style.color };
  }, selecteur);
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

test('AUTOROUTE : fond bleu, inscriptions blanches, cartouche ROUGE', async ({ page }) => {
  await suivreSur(page, 'A6');
  const panneau = await peinture(page, '.bg-cartouche');
  expect(panneau.fond, 'le fond autoroutier est bleu').toBe(BLEU);
  expect(panneau.encre, 'sur bleu, les inscriptions sont blanches').toBe(BLANC);

  /* LE CARTOUCHE NE PREND PAS LA COULEUR DU PANNEAU : type E42, rouge, sur
     autoroute comme sur nationale. C'est ce qu'on lit sur la route. */
  const cartouche = await peinture(page, '.bg-ecusson');
  expect(cartouche.fond).toBe(ROUGE_E42);
  expect(cartouche.encre).toBe(BLANC);
  await expect(page.locator('.bg-ecusson')).toHaveText('A6');
});

test('NATIONALE : fond vert, inscriptions blanches, cartouche ROUGE aussi', async ({ page }) => {
  await suivreSur(page, 'N7');
  const panneau = await peinture(page, '.bg-cartouche');
  expect(panneau.fond).toBe(VERT);
  expect(panneau.encre).toBe(BLANC);
  // Même type E42 que l'autoroute : le rouge ne distingue pas les deux.
  expect((await peinture(page, '.bg-ecusson')).fond).toBe(ROUGE_E42);
});

test('DÉPARTEMENTALE : fond blanc, encre noire, cartouche JAUNE', async ({ page }) => {
  /* CE PARCOURS ACTE UN CHANGEMENT DE CONVENTION. Armelin avait demandé de
     l'orange le 29/08 ; la signalisation réelle ne connaît pas d'orange —
     une départementale se signale sur fond BLANC et son cartouche est jaune
     (type E43). Le jaune reste donc à l'écran, là où il est réglementaire. */
  await suivreSur(page, 'D606');
  const panneau = await peinture(page, '.bg-cartouche');
  expect(panneau.fond).toBe(BLANC);
  expect(panneau.encre, 'sur fond blanc, tout est noir').toBe(NOIR);

  const cartouche = await peinture(page, '.bg-ecusson');
  expect(cartouche.fond).toBe(JAUNE_E43);
  expect(cartouche.encre, 'le jaune se lit en noir, jamais en blanc').toBe(NOIR);
});

test('VOIE LOCALE : un panneau blanc, et AUCUN cartouche', async ({ page }) => {
  /* Un cartouche vide serait un faux panneau : une rue nommée n'a pas de
     numéro, et l'on n'en invente pas. */
  await suivreSur(page, 'Rue de Rivoli');
  expect((await peinture(page, '.bg-cartouche')).fond).toBe(BLANC);
  await expect(page.locator('.bg-ecusson')).toBeHidden();
});

test('LA FLÈCHE ET LA DISTANCE SONT DES INSCRIPTIONS : même encre', async ({ page }) => {
  /* La règle dit « inscriptions ET listels » — la flèche et la distance en
     sont. Une distance grise sur fond bleu serait illisible autant
     qu'irrégulière. */
  await suivreSur(page, 'A6');
  const fleche = await page.evaluate(() =>
    getComputedStyle(document.querySelector('.bg-cartouche .bg-fleche')!).color);
  const distance = await page.evaluate(() =>
    getComputedStyle(document.querySelector('.bg-cartouche .bg-distance')!).color);
  expect(fleche).toBe(BLANC);
  expect(distance).toBe(BLANC);
});

test('LE PANNEAU GARDE SA COULEUR EN THÈME SOMBRE', async ({ page }) => {
  /* Sur la route, un panneau est rétroréfléchissant : la nuit il est plus
     lumineux, pas moins. Un bleu qui virerait au gris à 21 h ne serait plus
     un panneau — c'est la raison pour laquelle ces couleurs ne suivent PAS
     le thème, seules de toute l'application. */
  await page.emulateMedia({ colorScheme: 'dark' });
  await suivreSur(page, 'A6');
  const panneau = await peinture(page, '.bg-cartouche');
  expect(panneau.fond).toBe(BLEU);
  expect(panneau.encre).toBe(BLANC);
  expect((await peinture(page, '.bg-ecusson')).fond).toBe(ROUGE_E42);
});
