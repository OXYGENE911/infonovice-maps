import { test, expect, type Page } from '@playwright/test';
import { simulerTuiles, simulerCommunes } from './tuiles-simulees';
import { allerA } from './planificateur';

/* LE PARTAGE DU SYSTÈME — la demande des amis d'Armelin (29/08) : « le même
 * type de partage que sur mobile Android ». C'est navigator.share : la
 * feuille de partage de l'APPAREIL, ses applis puis Copier / Imprimer /
 * Enregistrer. Le navigateur des tests ne l'a pas — on la POSE nous-mêmes
 * et l'on vérifie ce qui lui est confié : c'est le contrat, le reste
 * appartient au système.
 */

const PARIS_LYON = '/#iti=2.35220,48.85660;4.83570,45.76400;car';

test.beforeEach(async ({ page }) => {
  await simulerTuiles(page);
  await simulerCommunes(page);
  await page.route('**/data.geopf.fr/navigation/itineraire**', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      geometry: { type: 'LineString', coordinates: [[2.3522, 48.8566], [4.8357, 45.764]] },
      distance: 390_000, duration: 10_800,
    }),
  }));
});

async function ouvrirPartage(page: Page): Promise<void> {
  await page.goto(PARIS_LYON);
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.iti-resultat')).toContainText('390 km', { timeout: 15_000 });
  await allerA(page, 'partage');
}

/** Pose une feuille de partage FACTICE qui note tout ce qu'on lui confie. */
async function poserFeuilleDePartage(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const notes: { titre?: string; url?: string; fichiers: string[] }[] = [];
    (window as unknown as { __partages: typeof notes }).__partages = notes;
    Object.defineProperty(navigator, 'canShare', {
      value: (d?: { files?: File[] }) => Boolean(d?.files?.length),
    });
    Object.defineProperty(navigator, 'share', {
      value: (d: { title?: string; url?: string; files?: File[] }) => {
        notes.push({ ...(d.title !== undefined && { titre: d.title }),
          ...(d.url !== undefined && { url: d.url }),
          fichiers: (d.files ?? []).map((f) => `${f.name} (${f.type})`) });
        return Promise.resolve();
      },
    });
  });
}

test('« Partager… » confie LE LIEN DU TRAJET à la feuille du système', async ({ page }) => {
  await poserFeuilleDePartage(page);
  await ouvrirPartage(page);

  const bouton = page.getByRole('button', { name: 'Partager…' });
  await expect(bouton).toBeVisible();
  await bouton.click();

  const partages = await page.evaluate(() =>
    (window as unknown as { __partages: { titre?: string; url?: string; fichiers: string[] }[] }).__partages);
  expect(partages).toHaveLength(1);
  // Le lien décrit le trajet calculé — le MÊME que « Copier le lien ».
  expect(partages[0]?.url).toContain('#iti=2.35220,48.85660;4.83570,45.76400');
  expect(partages[0]?.titre).toContain('Itinéraire Infonovice Maps');
  expect(partages[0]?.fichiers).toHaveLength(0);
});

test('le fichier GPX part par la feuille quand l’appareil sait la remplir', async ({ page }) => {
  await poserFeuilleDePartage(page);
  await ouvrirPartage(page);

  let telechargement = false;
  page.on('download', () => { telechargement = true; });
  await page.getByRole('button', { name: 'Fichier GPX' }).click();

  const partages = await page.evaluate(() =>
    (window as unknown as { __partages: { fichiers: string[] }[] }).__partages);
  expect(partages).toHaveLength(1);
  expect(partages[0]?.fichiers).toEqual(['itineraire-infonovice.gpx (application/gpx+xml)']);
  // Et PAS de téléchargement en double : la feuille suffit.
  expect(telechargement).toBe(false);
});

test('sans navigator.share, rien ne change : bouton absent, GPX téléchargé', async ({ page }) => {
  /* Le Chromium des tests n'a PAS navigator.share : c'est l'environnement
     de repli lui-même — un bureau d'hier. Aucun bouton mort à l'écran, et
     le téléchargement d'avant, intact. */
  await ouvrirPartage(page);

  await expect(page.getByRole('button', { name: 'Partager…' })).toBeHidden();
  const attente = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Fichier GPX' }).click();
  expect((await attente).suggestedFilename()).toBe('itineraire-infonovice.gpx');
});
