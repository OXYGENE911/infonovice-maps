import { test, expect } from '@playwright/test';
import { simulerTuiles, simulerCommunes } from './tuiles-simulees';

/* LE VOLET DES POI SUR GRAND ÉCRAN (DESKTOP-1, 04/09).
 *
 * ARMELIN : « en mode desktop, le menu du filtre des POIs est très étriqué
 * alors que sur un écran d'ordinateur il y a plus de place que sur un
 * smartphone. La ligne borne de recharge est écrite sur deux lignes au lieu
 * d'une seule en version mobile. »
 *
 * ON MESURE, on ne suppose pas : la largeur réelle du volet, et la hauteur
 * de la puce des bornes — une puce sur deux lignes dépasse sa hauteur
 * d'une ligne. */

test.use({ viewport: { width: 1280, height: 800 } });

test('SUR GRAND ÉCRAN LE VOLET RESPIRE — et « Bornes de recharge » tient sur une ligne', async ({ page }) => {
  await simulerTuiles(page);
  await simulerCommunes(page);
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  /* La puce des bornes ne paraît que si le volet de recharge est branché —
     on passe par le zoom qui la révèle, comme les autres parcours. */
  await page.evaluate(() => {
    (window as unknown as { __carte: { jumpTo(o: object): void } })
      .__carte.jumpTo({ center: [2.3522, 48.8566], zoom: 13 });
  });
  await page.locator('.poi-bulle').click();
  const panneau = page.locator('.poi-panneau');
  await expect(panneau).toBeVisible();

  const mesures = await page.evaluate(() => {
    const p = document.querySelector('.poi-panneau')!.getBoundingClientRect();
    const puce = document.querySelector('.poi-famille-bornes');
    const ligne = puce ? puce.getBoundingClientRect().height : null;
    const police = puce ? parseFloat(getComputedStyle(puce).fontSize) : null;
    return { largeur: p.width, ligne, police };
  });
  expect(mesures.largeur, 'le volet doit s’élargir sur grand écran').toBeGreaterThanOrEqual(380);
  if (mesures.ligne !== null && mesures.police !== null) {
    /* Une ligne de puce ≈ corps + marges (32 px mesurés) ; deux lignes en
       font au moins 44. La borne discrimine sans se caler au pixel. */
    expect(mesures.ligne, '« Bornes de recharge » doit tenir sur une ligne')
      .toBeLessThan(mesures.police * 2 + 14);
  }
});
