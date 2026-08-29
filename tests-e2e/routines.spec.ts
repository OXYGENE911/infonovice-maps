import { test, expect, type Page } from '@playwright/test';
import { simulerTuiles, simulerCommunes } from './tuiles-simulees';
import { ouvrirVolet } from './volets';

/* LES ROUTINES LOCALES — décision d'Armelin du 29/08. Le bon trajet au bon
 * moment : « Au travail » un matin de semaine, l'habitude apprise sinon.
 * L'HORLOGE EST PILOTÉE : ces contrats dépendent de l'heure, un test qui
 * dépendrait de l'heure de la machine mentirait une fois sur deux. */

const MARDI_MATIN = new Date(2026, 7, 25, 8, 15);

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

async function semerTravail(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const ouvrir = (): Promise<IDBDatabase> => new Promise((ok, non) => {
      const d = indexedDB.open('infonovice-maps', 2);
      d.onsuccess = () => ok(d.result);
      d.onerror = () => non(d.error);
    });
    const db = await ouvrir();
    await new Promise<void>((ok) => {
      const t = db.transaction('preferences', 'readwrite');
      t.objectStore('preferences').put({
        lon: 2.2945, lat: 48.8584, libelle: '5 avenue Anatole France, Paris',
        defini: '2026-08-25T07:00:00.000Z',
      }, 'repere-travail');
      t.oncomplete = () => ok();
    });
  });
}

test('un mardi matin, le travail déclaré se propose : « → Au travail », un geste', async ({ page }) => {
  await page.clock.install({ time: MARDI_MATIN });
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await semerTravail(page);

  // Le volet relit ses raccourcis à l'ouverture — on rouvre, comme l'usager.
  await page.locator('.iti > summary').click();
  await page.locator('.iti > summary').click();
  await page.locator('.iti > summary').click();

  const routine = page.getByRole('button', { name: /Au travail — trajet habituel/ });
  await expect(routine).toBeVisible();
  await routine.click();
  // allerVers : destination posée et NOMMÉE, départ demandé en toutes lettres.
  await expect(page.locator('[data-role="arrivee"] input')).toHaveValue('Au travail');
  await expect(page.locator('.iti-erreur')).toContainText('Choisissez votre départ');
});

test('trois trajets font une habitude — visible, proposée, et EFFAÇABLE d’un bouton', async ({ page }) => {
  await page.clock.install({ time: MARDI_MATIN });
  /* Trois rejouages du même lien : trois trajets calculés vers Lyon le
     matin — l'habitude naît. (Un lien partagé est un trajet voulu.) */
  for (let i = 0; i < 3; i += 1) {
    await page.goto('/#iti=2.35220,48.85660;4.83570,45.76400;car');
    await page.reload();
    await expect(page.locator('.iti-resultat')).toContainText('390 km', { timeout: 15_000 });
    /* L'apprentissage est asynchrone : naviguer TOUT DE SUITE couperait
       l'écriture IndexedDB — on attend qu'elle soit visible. */
    await expect.poll(() => page.evaluate(async () => {
      const ouvrir = (): Promise<IDBDatabase> => new Promise((ok, non) => {
        const d = indexedDB.open('infonovice-maps', 2);
        d.onsuccess = () => ok(d.result);
        d.onerror = () => non(d.error);
      });
      const db = await ouvrir();
      return new Promise<number>((ok) => {
        const t = db.transaction('preferences', 'readonly');
        const r = t.objectStore('preferences').get('routines-trajets');
        r.onsuccess = () => {
          const v = r.result as { matin?: number }[] | undefined;
          ok(Array.isArray(v) ? (v[0]?.matin ?? 0) : 0);
        };
      });
    }), { timeout: 10_000 }).toBe(i + 1);
  }

  await page.goto('/');
  await page.reload();
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await page.locator('.iti > summary').click();
  const routine = page.locator('.iti-routine');
  await expect(routine).toHaveCount(1);
  await expect(routine).toContainText('4,8357');

  /* ET TOUT S'OUBLIE D'UN BOUTON — une routine qu'on ne peut ni voir ni
     effacer serait un mouchard. Le volet Favoris compte, puis efface. */
  await ouvrirVolet(page, '.favoris');
  await expect(page.locator('.favoris-habitudes'))
    .toContainText('1 destination retenue sur cet appareil');
  await page.getByRole('button', { name: 'Tout oublier' }).click();
  await expect(page.locator('.favoris-etat')).toContainText('Habitudes de trajet oubliées');
  await expect(page.locator('.favoris-habitudes')).toBeHidden();
});
