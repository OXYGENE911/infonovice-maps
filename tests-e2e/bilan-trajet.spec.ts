import { test, expect, type Page } from '@playwright/test';
import { simulerTuiles, simulerCommunes } from './tuiles-simulees';

/* LE BILAN D'ARRIVÉE (STATS-1, 01/09).
 *
 * Armelin : « une fenêtre de statistiques à l'arrivée : vitesse max, vitesse
 * moyenne, temps total, temps de charge, nombre d'arrêts ». Ce parcours
 * mesure ce que la fenêtre DIT, et vérifie qu'elle ne coûte aucune requête —
 * tout sort des fixes que le suivi recevait déjà. */

/* LE MÊME DÉCOR QUE PARKING/ARRIVEE-2, ET C'EST VOULU : deux kilomètres
   plein est, destination trois mètres au nord de la fin. Un décor voisin mais
   différent n'atteignait pas l'arrivée, et ce parcours parle du BILAN — pas
   de la détection d'arrivée, qui a déjà le sien. */
const TRACE: [number, number][] = Array.from({ length: 21 }, (_, i) =>
  [2.3400 + i * 0.0014, 48.8500]);
const DEST = { lon: 2.3680, lat: 48.8503 };

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
  await page.goto(`/#iti=${TRACE[0]![0]},${TRACE[0]![1]};${DEST.lon},${DEST.lat};car`);
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Démarrer le suivi' }).click();
  await expect(page.locator('bandeau-guidage')).toBeVisible({ timeout: 15_000 });
}

async function rouler(page: Page, lon: number, vitesse: number): Promise<void> {
  await page.evaluate(([lo, v]) => {
    (window as unknown as { __pousserFixe: (c: object) => void })
      .__pousserFixe({ longitude: lo, latitude: 48.8500, speed: v, heading: 90 });
  }, [lon, vitesse]);
  await page.waitForTimeout(600);
}

test('LE BILAN S’AFFICHE À L’ARRIVÉE — et ne dit que ce qu’il a mesuré', async ({ page }) => {
  await suivre(page);
  const bilan = page.locator('.bg-bilan');
  await expect(bilan, 'un bilan avant l’arrivée serait prématuré').toBeHidden();

  // On roule, dont une pointe à 30 m/s — 108 km/h une fois arrondie.
  await rouler(page, 2.3450, 12);
  await rouler(page, 2.3500, 30);
  await rouler(page, 2.3600, 20);
  // …puis on APPROCHE, comme le parcours d'ARRIVEE-2 : 45 m, puis 14 m.
  await rouler(page, 2.36740, 12);
  await rouler(page, 2.36781, 0);

  await expect(bilan).toBeVisible({ timeout: 10_000 });
  const liste = bilan.locator('.bg-bilan-liste');
  await expect(liste).toContainText('Vitesse maximale');
  await expect(liste).toContainText('108 km/h');
  await expect(liste).toContainText('Durée du trajet');
  /* AUCUN ARRÊT : l'immobilité de la fin dure quelques secondes, pas la
     minute qu'exige un vrai arrêt — un feu rouge n'est pas une pause. */
  await expect(liste).toContainText('aucun');
});

test('LE BILAN SE FERME, ET S’EN VA AVEC LE SUIVI', async ({ page }) => {
  await suivre(page);
  await rouler(page, 2.3500, 15);
  await rouler(page, 2.36740, 12);
  await rouler(page, 2.36781, 0);

  const bilan = page.locator('.bg-bilan');
  await expect(bilan).toBeVisible({ timeout: 10_000 });
  await bilan.getByRole('button', { name: 'Fermer' }).click();
  await expect(bilan).toBeHidden();

  /* ET IL S'EN VA AVEC LE SUIVI. Un bilan qui resterait à l'écran après
     l'arrêt décrirait un trajet qu'on ne fait plus — le même devoir que la
     voix qui se tait et le curseur qui se retire.
     QUE LE PROCHAIN TRAJET REPARTE DE ZÉRO tient à deux gestes du code
     (`arreter` remet l'accumulateur à neuf, `demarrer` referme la fiche) et
     se mesure aux tests unitaires de l'accumulateur : ici, l'usager ne peut
     pas redémarrer sans repasser par le planificateur, et ce parcours
     parlerait alors du planificateur, pas du bilan. */
  await page.getByRole('button', { name: 'Afficher les commandes du suivi' }).click();
  await page.getByRole('button', { name: 'Arrêter le suivi' }).click();
  await expect(page.locator('bandeau-guidage')).toBeHidden();
  await expect(bilan).toBeHidden();
});

test('« ENREGISTRER CE PARCOURS » GARDE, ET SEULEMENT SI ON LE DEMANDE', async ({ page }) => {
  /* STATS-2 (01/09). Armelin : « cela ne doit pas être fait automatiquement,
     mais proposé à l'enregistrement à la fin du parcours au moment du
     récapitulatif ». Un GPS qui archive tout seul devient un carnet de
     déplacements ; un bouton qu'on presse est un consentement. */
  await suivre(page);
  await rouler(page, 2.3450, 12);
  await rouler(page, 2.36740, 12);
  await rouler(page, 2.36781, 0);
  await expect(page.locator('.bg-bilan')).toBeVisible({ timeout: 10_000 });

  const memoire = async (): Promise<string> => page.evaluate(async () =>
    new Promise<string>((res) => {
      const d = indexedDB.open('infonovice-maps', 2);
      d.onsuccess = () => {
        const g = d.result.transaction('preferences').objectStore('preferences')
          .get('historique-trajets');
        g.onsuccess = () => { res(JSON.stringify(g.result ?? [])); };
        g.onerror = () => { res('erreur'); };
      };
      d.onerror = () => { res('erreur'); };
    }));

  /* RIEN N'EST GARDÉ TANT QU'ON N'A PAS DEMANDÉ : c'est tout le contrat. */
  expect(await memoire(), 'rien ne doit être gardé sans un geste').toBe('[]');

  await page.getByRole('button', { name: 'Enregistrer ce parcours' }).click();
  await expect(page.locator('.bg-bilan-garde')).toContainText('enregistré');
  /* ET LE BOUTON SE DÉSARME : un double appui ne fait pas deux entrées. */
  await expect(page.getByRole('button', { name: 'Enregistrer ce parcours' })).toBeDisabled();

  await expect.poll(memoire, { message: 'le parcours n’est pas en mémoire' })
    .toContain('vitesseMaxKmh');
});
