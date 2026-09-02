import { test, expect, type Page } from '@playwright/test';
import { simulerTuiles, simulerCommunes } from './tuiles-simulees';
import { ouvrirVolet } from './volets';

/* AVERTIR D'UN PASSAGE TROP LIMITÉ (PONT-1, 02/09).
 *
 * Armelin : « ma Vinfast VF8 Plus avec sa batterie de 87,7 kWh pèse 2 520 kg et
 * peut être dangereuse sur certains ponts de France. Par exemple, le pont de
 * fer situé entre Coudret et Germeville en Charente a fait l'objet d'une
 * limitation à 2 tonnes […] cela permettrait au GPS d'éviter de faire passer
 * par des voies interdites au véhicule configuré dans le profil. »
 *
 * ON AVERTIT, ON N'ÉVITE PAS, et la nuance est honnête : le service public
 * d'itinéraire n'accepte aucun paramètre de poids. Ce qu'on peut faire, c'est
 * le DIRE assez tôt pour qu'un conducteur décide lui-même. */

/** Un trajet court plein est, avec un pont limité au tiers du parcours. */
const TRACE: [number, number][] = Array.from({ length: 21 }, (_, i) =>
  [2.3400 + i * 0.0014, 48.8500]);

/** Le décor : corridor qui rend un pont limité, et un récepteur simulé. */
async function suivre(page: Page, o: { masseKg?: number } = {}): Promise<void> {
  await simulerTuiles(page);
  await simulerCommunes(page);
  await page.context().grantPermissions(['geolocation']);
  await page.context().setGeolocation({
    longitude: TRACE[0]![0], latitude: TRACE[0]![1],
  });
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
  /* LE PONT EST SUR LE TRACÉ, au tiers du parcours. Sa valeur — 2 t — est
     celle de l'ouvrage réel qu'Armelin cite. */
  await page.route('**overpass.openstreetmap.fr**', (route) => route.fulfill({
    headers: { 'Access-Control-Allow-Origin': '*' },
    contentType: 'application/json',
    body: JSON.stringify({ elements: [{
      type: 'way', id: 1,
      tags: { maxweight: '2', name: 'Pont de fer' },
      geometry: [
        { lat: 48.8500, lon: 2.3450 },
        { lat: 48.8500, lon: 2.3452 },
      ],
    }] }),
  }));
  await page.route('**/data.geopf.fr/navigation/itineraire**', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      geometry: { type: 'LineString', coordinates: TRACE },
      distance: 2_000, duration: 300,
    }),
  }));
  await page.route('**/www.bison-fute.gouv.fr/**', (route) => route.fulfill({
    contentType: 'application/json', body: '[]',
  }));

  await page.goto(`/#iti=${TRACE[0]![0].toFixed(5)},48.85000;`
    + `${TRACE[20]![0].toFixed(5)},48.85000;car`);
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });

  if (o.masseKg !== undefined) {
    /* LA MASSE EST DÉJÀ UN CHAMP DU PROFIL — elle sert au dénivelé depuis le
       28/08. PONT-1 ne fait que s'en servir une seconde fois. */
    await ouvrirVolet(page, '.vehicule');
    await page.getByLabel('Masse').fill(String(o.masseKg));
    await page.locator('.vue-retour').click();
  }

  await page.getByRole('button', { name: 'Démarrer le suivi' }).click();
  await expect(page.locator('bandeau-guidage')).toBeVisible({ timeout: 15_000 });
}

/** Avance jusqu'au point demandé, en rejouant le fixe. */
async function rouler(page: Page, lon: number): Promise<void> {
  await page.evaluate((x) => {
    (window as unknown as { __pousserFixe: (c: object) => void })
      .__pousserFixe({ longitude: x, latitude: 48.85, speed: 14, heading: 90 });
  }, lon);
}

test('LE PONT TROP ÉTROIT S’ANNONCE, avec sa limite et la masse', async ({ page }) => {
  await suivre(page, { masseKg: 2_520 });

  /* ON AVANCE JUSQU'À MOINS D'UN KILOMÈTRE DU PONT : de quoi s'arrêter ou
     tourner avant l'ouvrage. Le fixe est rejoué — le corridor arrive après le
     démarrage, et l'avertissement attend qu'il soit là. */
  const alerte = page.locator('.bg-alerte');
  await expect.poll(async () => {
    await rouler(page, 2.3420);
    return alerte.textContent();
  }, { timeout: 25_000 }).toContain('Pont de fer');

  await expect(alerte).toContainText('limité à 2 t');
  // LA MASSE EST DITE AUSSI : c'est la comparaison qui décide, pas le chiffre.
  await expect(alerte).toContainText('2,5 t');
});

test('SANS MASSE DÉCLARÉE, L’APPLICATION SE TAIT', async ({ page }) => {
  /* Aucune source publique française ne donne la masse d'un modèle : le
     silence est le défaut, et il est voulu. Alerter au hasard vaudrait moins
     que se taire — un conducteur qui reçoit un avertissement infondé cesse
     d'écouter les suivants. */
  await suivre(page);

  for (const lon of [2.3410, 2.3420, 2.3430]) {
    await rouler(page, lon);
    await page.waitForTimeout(300);
  }
  await expect(page.locator('.bg-alerte')).not.toContainText('Pont de fer');
});
