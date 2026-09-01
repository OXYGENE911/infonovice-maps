import { test, expect, type Page } from '@playwright/test';
import { simulerTuiles, simulerCommunes } from './tuiles-simulees';
import { allerA, retour } from './planificateur';
import { ouvrirVolet } from './volets';

/* LE MODE « ARRIVÉE RÉELLE » — la dernière décision du §4 (Armelin, 29/08).
 * Deux mensonges corrigés : l'heure d'arrivée du suivi comptait la ROUTE
 * seule (deux arrêts de trente minutes = une heure de mensonge), et le plan
 * relevait la météo de MAINTENANT même pour un départ à 18 h.
 */

const PARIS_LYON = '/#iti=2.35220,48.85660;4.83570,45.76400;car';

/** L'heure « HH:MM » extraite d'un texte, en minutes depuis minuit. */
const minutesDe = (texte: string): number => {
  const m = /vers (?:demain )?(\d{2}):(\d{2})/.exec(texte);
  if (!m) return -1;
  return Number(m[1]) * 60 + Number(m[2]);
};

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
  /* Météo HORAIRE contrastée : douce dans les deux prochaines heures, gel
     au-delà — c'est elle qui prouve que l'heure de DÉPART entre au calcul. */
  await page.route('**/api.open-meteo.com/**', (route) => {
    const base = new Date();
    const heure = (h: number): string => {
      const d = new Date(base.getTime() + h * 3600 * 1000);
      const p = (n: number): string => String(n).padStart(2, '0');
      return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T${p(d.getUTCHours())}:00`;
    };
    const heures = [-1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({
      utc_offset_seconds: 0,
      hourly: {
        time: heures.map(heure),
        temperature_2m: heures.map((h) => (h <= 2 ? 20 : -2)),
        precipitation: heures.map(() => 0),
        weather_code: heures.map(() => 0),
        wind_speed_10m: heures.map(() => 5),
      },
    }) });
  });
  await page.route('**/data.geopf.fr/altimetrie/**', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ elevations: [
      { lon: 2.3522, lat: 48.8566, z: 100, acc: 'Average value' },
      { lon: 4.8357, lat: 45.764, z: 100, acc: 'Average value' },
    ] }),
  }));
  await page.route('**/public.opendatasoft.com/**', (route) => {
    const url = decodeURIComponent(route.request().url());
    if (url.includes('/exports/json')) {
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify([{
        id_station_itinerance: 'FRAIREDEBE', nom_station: 'Aire de Beaune', nom_enseigne: 'Ionity',
        nom_operateur: 'Ionity', condition_acces: 'Accès libre', prise_type_combo_ccs: '1',
        prise_type_chademo: '0', prise_type_2: '0', p: 150, pdc: 8, lon: 3.6, lat: 47.3,
      }]) });
    }
    return route.fulfill({ contentType: 'application/json',
      body: JSON.stringify({ total_count: 0, results: [] }) });
  });
});

async function saisirVehicule(page: Page): Promise<void> {
  await ouvrirVolet(page, '.vehicule');
  await page.getByLabel('Batterie', { exact: true }).fill('87.7');
  await page.getByLabel('Santé (SOCE)').fill('94');
  await page.getByLabel('Charge (SOC)').fill('100');
  await page.getByLabel('Charge max', { exact: true }).fill('150');
  await page.getByLabel('Sur autoroute').fill('280');
  await expect(page.locator('.veh-bilan-lignes')).toContainText('Sur autoroute');
  await retour(page);
}

test('le résumé porte l’heure d’arrivée RÉELLE — et « Départ à » la décale', async ({ page }) => {
  await page.goto(PARIS_LYON);
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  const resultat = page.locator('.iti-resultat');
  await expect(resultat).toContainText('390 km', { timeout: 15_000 });

  // Sans véhicule : l'arrivée = maintenant + la route, à trois minutes près.
  await expect(resultat).toContainText(/arrivée vers/);
  const routeSeule = minutesDe(await resultat.innerText());
  // En heure LOCALE, comme l'affichage — Date.now() nu vivrait en UTC.
  const dans3h = new Date(Date.now() + 180 * 60_000);
  const attendu = dans3h.getHours() * 60 + dans3h.getMinutes();
  expect(Math.abs(routeSeule - attendu)).toBeLessThan(4);

  /* AVEC le plan : l'heure RECULE du temps de charge — c'est l'arrivée
     réelle, pas celle du moteur. */
  await saisirVehicule(page);
  await expect(resultat).toContainText('au total', { timeout: 20_000 });
  const chargeComprise = minutesDe(await resultat.innerText());
  expect((chargeComprise - routeSeule + 1440) % 1440).toBeGreaterThan(10);

  /* « DÉPART À » +4 h : l'arrivée suit, ET la météo du plan est celle du
     départ choisi — gel au-delà de deux heures dans la fixture : la
     consommation monte, le volet le dit. */
  const depart = new Date(Date.now() + 4 * 3600 * 1000);
  const hh = String(depart.getHours()).padStart(2, '0');
  const mm = String(depart.getMinutes()).padStart(2, '0');
  await page.getByLabel('Heure de départ').fill(`${hh}:${mm}`);
  await expect(resultat).toContainText('au total', { timeout: 20_000 });
  // L'arrivée recule de QUATRE HEURES (± quelques minutes de plan d'hiver),
  // modulo minuit — « demain » est déjà porté par le texte.
  await expect.poll(async () => {
    const decale = minutesDe(await resultat.innerText());
    return (decale - chargeComprise + 1440) % 1440;
  }, { timeout: 20_000 }).toBeGreaterThan(235);

  await allerA(page, 'recharge');
  const volet = page.locator('.recharge-pourquoi');
  await volet.locator('summary').click();
  await expect(volet).toContainText('-2 °C au départ');
});

test('en SUIVI, l’heure d’arrivée compte les charges restantes — et le dit', async ({ page, context }) => {
  /* L'ancien affichage comptait la route seule : 18 minutes de charge
     devant soi, 18 minutes de mensonge. L'heure attendue se calcule ICI,
     en heure locale, et doit tomber à quelques minutes près. */
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ longitude: 2.3522, latitude: 48.8566 });
  await page.route('**overpass.openstreetmap.fr**', (route) => route.fulfill({
    headers: { 'Access-Control-Allow-Origin': '*' },
    contentType: 'application/json', body: JSON.stringify({ elements: [] }),
  }));
  await page.route('**/www.bison-fute.gouv.fr/**', (route) => route.fulfill({
    contentType: 'application/json', body: '[]',
  }));
  await page.goto(PARIS_LYON);
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.iti-resultat')).toContainText('390 km', { timeout: 15_000 });
  await saisirVehicule(page);
  await expect(page.locator('.iti-resultat')).toContainText('au total', { timeout: 20_000 });
  // Le plan retient UN arrêt : sa durée est la charge restante attendue.
  await allerA(page, 'recharge');
  const detail = await page.locator('.recharge-liste .recharge-detail').first().innerText();
  const chargeMin = Number(/(\d+) min de charge/.exec(detail)?.[1] ?? 0);
  expect(chargeMin).toBeGreaterThan(5);
  await retour(page);

  await page.getByRole('button', { name: 'Démarrer le suivi' }).click();
  const restant = page.locator('.bg-restant');
  await expect(restant).toContainText('charges comprises', { timeout: 20_000 });
  const arriveeAffichee = minutesDe(await restant.innerText());
  const attenduA = new Date(Date.now() + (10_800 + chargeMin * 60) * 1000);
  const attendu = attenduA.getHours() * 60 + attenduA.getMinutes();
  expect(Math.abs(arriveeAffichee - attendu)).toBeLessThan(5);
});

test('VOIX-2 : l’arrêt de recharge s’annonce à voix haute', async ({ page, context }) => {
  /* Armelin, le 30/08 : « fais les annonces vocales de recharge ». C'est ce
     qui manque le plus en électrique — savoir SANS REGARDER L'ÉCRAN quand on
     s'arrête, où, et pour combien de temps. */
  await page.addInitScript(() => {
    const dites: string[] = [];
    (window as unknown as { ditesVoix: string[] }).ditesVoix = dites;
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        getVoices: () => [{ lang: 'fr-FR', name: 'Locale', localService: true }],
        speak: (m: { text: string }) => { dites.push(m.text); },
        cancel: () => {}, addEventListener: () => {},
      },
    });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', {
      configurable: true,
      value: class { text: string; lang = ''; rate = 1; voice: unknown = null;

        constructor(t: string) { this.text = t; } },
    });
  });
  await context.grantPermissions(['geolocation']);
  /* LA POSITION SE PILOTE DEPUIS LE PARCOURS, dès le premier chargement :
     remplacer `navigator.geolocation` APRÈS le démarrage laisserait le suivi
     abonné à l'ancien objet. */
  await page.addInitScript(() => {
    let rappel: ((p: unknown) => void) | null = null;
    (window as unknown as { __avancer: (f: number) => void }).__avancer = (f) => {
      rappel?.({ coords: {
        longitude: 2.3522 + (4.8357 - 2.3522) * f,
        latitude: 48.8566 + (45.764 - 48.8566) * f,
        accuracy: 5, speed: 30, heading: 150, altitude: null, altitudeAccuracy: null,
      } });
    };
    Object.defineProperty(navigator, 'geolocation', {
      value: {
        watchPosition: (ok: (p: unknown) => void) => { rappel = ok; return 1; },
        clearWatch: () => { rappel = null; },
        getCurrentPosition: (ok: (p: unknown) => void) => { rappel = ok; },
      },
    });
  });
  await page.route('**overpass.openstreetmap.fr**', (route) => route.fulfill({
    headers: { 'Access-Control-Allow-Origin': '*' },
    contentType: 'application/json', body: JSON.stringify({ elements: [] }),
  }));
  await page.route('**/www.bison-fute.gouv.fr/**', (route) => route.fulfill({
    contentType: 'application/json', body: '[]',
  }));
  await page.goto(PARIS_LYON);
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.iti-resultat')).toContainText('390 km', { timeout: 15_000 });
  await saisirVehicule(page);
  await expect(page.locator('.iti-resultat')).toContainText('au total', { timeout: 20_000 });

  await page.getByRole('button', { name: 'Démarrer le suivi' }).click();
  await expect(page.locator('bandeau-guidage')).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Afficher les commandes du suivi' }).click();
  // La voix parle par défaut depuis VOIX-3 : plus rien à allumer.

  /* AU DÉPART, L'ARRÊT EST À DES CENTAINES DE KILOMÈTRES : rien à dire. La
     voix se présente, et c'est tout — la preuve qu'elle ne bavarde pas. */
  await page.waitForTimeout(1_200);
  const phrases = await page.evaluate(() =>
    (window as unknown as { ditesVoix: string[] }).ditesVoix);
  expect(phrases.some((p) => p.startsWith('Arrêt recharge')),
    `annonce prématurée : ${JSON.stringify(phrases)}`).toBe(false);
  /* LA PRÉSENTATION PORTE MAINTENANT SON MODE D'EMPLOI (VOIX-3) : elle dit
     aussi comment couper la voix. On compare donc le DÉBUT, pas la phrase
     entière — l'égalité stricte ne défendait que sa ponctuation. */
  expect(phrases.some((p) => p.startsWith('Guidage vocal activé')),
    'la voix ne s’est pas présentée').toBe(true);

  /* PUIS ON AVANCE LE LONG DU TRAJET, par pas d'un pour cent : quelque part
     entre la moitié et les trois quarts, l'arrêt entre dans les dix
     kilomètres et la voix le dit. On ne CALCULE pas où il tombe — c'est le
     planificateur qui décide, et ce parcours mesure ce qu'il en sort. */
  for (let f = 0.50; f <= 0.80; f += 0.01) {
    await page.evaluate((x) => (window as unknown as { __avancer: (n: number) => void })
      .__avancer(x), f);
    await page.waitForTimeout(60);
  }
  const dites = await page.evaluate(() =>
    (window as unknown as { ditesVoix: string[] }).ditesVoix);
  const recharges = dites.filter((p) => p.startsWith('Arrêt recharge'));
  expect(recharges.length, `aucune annonce de recharge : ${JSON.stringify(dites)}`)
    .toBeGreaterThan(0);
  /* ET PAS DEUX FOIS LE MÊME PALIER : trente et un fixes traversent la
     fenêtre des dix kilomètres, et l'on ne doit l'entendre qu'une fois. */
  const dixKm = recharges.filter((p) => p.includes('kilomètres'));
  expect(new Set(dixKm).size, JSON.stringify(dixKm)).toBe(dixKm.length);
});
