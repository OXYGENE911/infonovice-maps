import { test, expect, type Page } from '@playwright/test';
import { simulerTuiles, simulerCommunes } from './tuiles-simulees';
import { allerA } from './planificateur';

/* EMPORTER LA CARTE DU TRAJET (COULOIR-1, 08/09/2026).
 *
 * Étude CoMaps / OsmAnd du 05/09, quatrième emprunt : « le service worker sait
 * déjà mettre en cache ; il manque le geste et la jauge ». Ce parcours vérifie
 * les deux, et surtout ce qui se dit AVANT de télécharger : on ne lance pas
 * cinquante mégaoctets sur le forfait de quelqu'un sans l'annoncer.
 */

/* UN TRAJET COURT, PARIS → MELUN : le couloir y fait moins de deux cents
   tuiles, que la simulation sert en quelques secondes. Le compte d'un long
   trajet — 947 tuiles pour Paris–Lyon — est vérifié à sec dans
   tests/couloir.test.ts, où il ne coûte aucune requête. */
const TRACE: [number, number][] = [[2.3522, 48.8566], [2.66, 48.54]];

async function trajetCalcule(page: Page): Promise<void> {
  await simulerTuiles(page);
  await simulerCommunes(page);
  await page.route('**/data.geopf.fr/navigation/itineraire**', (route) => {
    if (/resource=bdtopo-pgr/.test(route.request().url())) {
      return route.fulfill({ contentType: 'application/json', body: '{"portions":[]}' });
    }
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ geometry: { type: 'LineString', coordinates: TRACE }, distance: 45_000, duration: 2_700 }),
    });
  });
  await page.route('**overpass**', (r) => r.fulfill({ contentType: 'application/json', body: '{"elements":[]}' }));
  await page.route('**/www.bison-fute.gouv.fr/**', (r) => r.fulfill({ contentType: 'application/json', body: '[]' }));

  await page.goto(`/#iti=${TRACE[0]![0]},${TRACE[0]![1]};${TRACE[1]![0]},${TRACE[1]![1]};car`);
  await page.reload();
  await expect(page.locator('.iti-resultat')).toContainText('km', { timeout: 15_000 });
  /* LE SERVICE WORKER DOIT TENIR LA PAGE : sans lui, rien ne serait gardé, et
     le bouton le dit au lieu de faire tourner une jauge pour rien. */
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 20_000 });
}

test('LE COÛT EST ANNONCÉ AVANT, et le couloir s’emporte avec sa jauge', async ({ page }) => {
  await trajetCalcule(page);
  await allerA(page, 'partage');

  /* CE QUI SE DIT AVANT : le compte exact et le poids estimé. Paris–Lyon en
     donne un peu plus de neuf cents — le nombre exact dépend du tracé rendu
     par le service, on le LIT plutôt que de le figer, mais on exige qu'il
     soit annoncé et qu'il se retrouve à la fin. */
  const etat = page.locator('.iti-couloir-etat');
  await expect(etat).toContainText(/^\d+ tuiles, environ [\d,]+ Mo\.$/, { timeout: 10_000 });
  const annonce = (await etat.textContent()) ?? '';
  const attendues = Number(/^(\d+) tuiles/.exec(annonce)?.[1]);
  expect(attendues, 'un trajet de 45 km demande plus de cent tuiles').toBeGreaterThan(100);

  const emporter = page.getByRole('button', { name: 'Emporter la carte du trajet' });
  await expect(emporter).toBeEnabled();

  await emporter.click();
  // La jauge paraît, le bouton cède la place à « Arrêter ».
  await expect(page.locator('.iti-couloir-jauge')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Arrêter' })).toBeVisible();

  // Et à la fin, le compte de ce qui est gardé, avec la durée.
  await expect(etat).toContainText(`Couloir emporté : ${attendues} tuiles`, { timeout: 60_000 });
  await expect(etat).toContainText('quatorze jours');
  await expect(page.locator('.iti-couloir-jauge')).toBeHidden();
  await expect(emporter).toBeVisible();
});

test('ARRÊTER COUPE NET, et dit ce qui a été emporté', async ({ page }) => {
  /* Un couloir à moitié emporté vaut mieux que rien : les tuiles déjà gardées
     ne repartiront pas sur le réseau au prochain essai. */
  await trajetCalcule(page);

  /* On ralentit les tuiles pour avoir le temps d'arrêter — sinon la
     simulation répond plus vite que le clic. */
  await page.route('**/data.geopf.fr/wmts**', async (route) => {
    await new Promise((r) => { setTimeout(r, 120); });
    await route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64') });
  });

  await allerA(page, 'partage');
  await page.getByRole('button', { name: 'Emporter la carte du trajet' }).click();
  const arreter = page.getByRole('button', { name: 'Arrêter' });
  await expect(arreter).toBeVisible();
  await expect(page.locator('.iti-couloir-etat')).toContainText(/\d+ sur \d+…/, { timeout: 15_000 });
  await arreter.click();

  const etat = page.locator('.iti-couloir-etat');
  await expect(etat).toContainText('Arrêté', { timeout: 20_000 });
  await expect(etat).toContainText('reprendra');
  await expect(page.getByRole('button', { name: 'Emporter la carte du trajet' })).toBeVisible();
});
