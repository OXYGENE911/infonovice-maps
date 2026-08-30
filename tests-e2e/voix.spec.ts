import { test, expect, type Page } from '@playwright/test';
import { simulerTuiles, simulerCommunes } from './tuiles-simulees';

/* LE GUIDAGE VOCAL (VOIX-1, demande d'Armelin du 30/08).
 *
 * COMMENT ON MESURE UNE VOIX. On remplace `speechSynthesis` par un mouchard
 * qui NOTE ce qu'on lui demande de dire, avant que la page ne charge. On
 * vérifie donc les phrases RÉELLEMENT prononcées — pas un état interne qui
 * pourrait mentir.
 *
 * CE QUE CES PARCOURS DÉFENDENT : que rien ne se dise sans que l'usager l'ait
 * demandé, que rien ne se répète, et que la voix se taise à l'arrêt. */

const GEOMETRIE = {
  type: 'LineString',
  coordinates: [[2.3522, 48.8566], [2.3560, 48.8500], [2.3600, 48.8400]],
};

/** Le mouchard : il enregistre, il ne parle pas. */
async function espionnerLaVoix(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const dites: string[] = [];
    (window as unknown as { ditesVoix: string[] }).ditesVoix = dites;
    let annulations = 0;
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        getVoices: () => [
          { lang: 'fr-FR', name: 'Locale', localService: true },
          { lang: 'fr-FR', name: 'Serveur', localService: false },
        ],
        speak: (m: { text: string }) => { dites.push(m.text); },
        cancel: () => { annulations += 1; },
        addEventListener: () => {},
        get annulations() { return annulations; },
      },
    });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', {
      configurable: true,
      value: class { text: string; lang = ''; rate = 1; voice: unknown = null;

        constructor(t: string) { this.text = t; } },
    });
  });
}

const dites = (page: Page): Promise<string[]> =>
  page.evaluate(() => (window as unknown as { ditesVoix: string[] }).ditesVoix);

/**
 * Un suivi dont la manœuvre est à `distance` mètres — c'est elle qui décide
 * du palier atteint, donc de ce qui se dit.
 */
async function suivre(page: Page, distance: number): Promise<void> {
  await page.route('**overpass.openstreetmap.fr**', (route) => route.fulfill({
    headers: { 'Access-Control-Allow-Origin': '*' },
    contentType: 'application/json', body: '{"elements":[]}',
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
          geometry: GEOMETRIE, distance: 2_000, duration: 200,
          portions: [{ steps: [
            { instruction: { type: 'depart' }, distance,
              attributes: { name: { cpx_numero: 'D606' } } },
            { instruction: { type: 'turn', modifier: 'right' }, distance: 1_600,
              attributes: { name: { cpx_numero: 'A7' } } },
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
  await page.getByRole('button', { name: 'Afficher les commandes du suivi' }).click();
}

test.beforeEach(async ({ page, context }) => {
  await espionnerLaVoix(page);
  await simulerTuiles(page);
  await simulerCommunes(page);
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ longitude: 2.3522, latitude: 48.8566 });
  await page.route('**/www.bison-fute.gouv.fr/**', (route) => route.fulfill({
    contentType: 'application/json', body: '[]',
  }));
});

test('LA VOIX SE TAIT tant qu’on ne la demande pas', async ({ page }) => {
  /* Une application qui se met à parler toute seule au premier trajet est
     une application qu'on désinstalle. */
  await suivre(page, 400);
  await page.waitForTimeout(1_200);
  expect(await dites(page)).toEqual([]);
});

test('elle RÉPOND en s’allumant — on ne découvre pas au premier virage', async ({ page }) => {
  /* Loin de toute manœuvre, il n'y a rien à annoncer : elle se présente,
     pour qu'on sache qu'elle marche. C'est aussi le geste d'usager qu'exigent
     les navigateurs avant de laisser une page parler. */
  await suivre(page, 8_000);
  await page.getByRole('button', { name: 'Activer le guidage vocal' }).click();
  expect(await dites(page)).toContain('Guidage vocal activé');
  // Le bouton dit son état, et change de dessin.
  await expect(page.getByRole('button', { name: 'Couper le guidage vocal' }))
    .toHaveAttribute('aria-pressed', 'true');
});

test('elle annonce la manœuvre avec sa distance et la route visée', async ({ page }) => {
  /* ANNONCER VAUT MIEUX QUE SE PRÉSENTER : s'il y a une manœuvre à dire, on
     la dit dès l'allumage — c'est une démonstration ET une information. */
  await suivre(page, 400);
  await page.getByRole('button', { name: 'Activer le guidage vocal' }).click();
  await page.waitForTimeout(1_200);
  expect(await dites(page), 'la manœuvre remplace la présentation')
    .not.toContain('Guidage vocal activé');
  const phrases = await dites(page);
  expect(phrases.some((p) => p.startsWith('Dans 400 mètres, tournez à droite'))).toBe(true);
  expect(phrases.some((p) => p.includes('vers A7'))).toBe(true);
});

test('AU MOMENT de la manœuvre, elle dit la manœuvre seule', async ({ page }) => {
  await suivre(page, 40);
  await page.getByRole('button', { name: 'Activer le guidage vocal' }).click();
  await page.waitForTimeout(1_200);
  expect(await dites(page)).toContain('Tournez à droite, vers A7');
});

test('elle NE SE RÉPÈTE PAS : un GPS qu’on coupe ne prévient plus de rien', async ({ page }) => {
  await suivre(page, 400);
  await page.getByRole('button', { name: 'Activer le guidage vocal' }).click();
  await page.waitForTimeout(2_000);
  const phrases = (await dites(page)).filter((p) => p.includes('tournez à droite'));
  expect(phrases, 'un palier ne se dit qu’une fois par manœuvre').toHaveLength(1);
});

test('la COUPER la fait taire, et le choix survit au rechargement', async ({ page }) => {
  await suivre(page, 400);
  await page.getByRole('button', { name: 'Activer le guidage vocal' }).click();
  await page.getByRole('button', { name: 'Couper le guidage vocal' }).click();
  await expect(page.getByRole('button', { name: 'Activer le guidage vocal' }))
    .toHaveAttribute('aria-pressed', 'false');

  /* LE CHOIX EST UNE PRÉFÉRENCE, pas un réglage de session : on ne redemande
     pas à chaque trajet. Elle vit dans IndexedDB, sur l'appareil. */
  await page.reload();
  await suivre(page, 400);
  await expect(page.getByRole('button', { name: 'Activer le guidage vocal' }))
    .toHaveAttribute('aria-pressed', 'false');
});

test('elle se TAIT à l’arrêt du suivi', async ({ page }) => {
  /* Une phrase qui continue après l'arrêt annoncerait un virage qu'on ne
     prend plus. */
  await suivre(page, 400);
  await page.getByRole('button', { name: 'Activer le guidage vocal' }).click();
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: 'Arrêter le suivi' }).click();
  const avant = (await dites(page)).length;
  await page.waitForTimeout(800);
  expect(await dites(page)).toHaveLength(avant);
});
