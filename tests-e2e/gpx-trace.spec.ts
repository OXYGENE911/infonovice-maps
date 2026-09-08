import { test, expect, type Page } from '@playwright/test';
import { simulerTuiles, simulerCommunes } from './tuiles-simulees';
import { ouvrirVolet } from './volets';

/* EXPORTER LE TRAJET RÉELLEMENT PARCOURU (HIST-4, 08/09/2026).
 *
 * L'export du trajet CALCULÉ existait depuis longtemps. Celui du trajet
 * PARCOURU, non — alors que c'est celui-là qu'on veut relire ailleurs, parce
 * qu'il porte l'altitude et l'heure de chaque point. Étude CoMaps / OsmAnd du
 * 05/09 : « attendue des randonneurs et des motards ».
 */

const DEPART = Date.UTC(2026, 8, 8, 6, 30, 0);

async function poserUnParcours(page: Page, avecPositions: boolean): Promise<void> {
  await page.evaluate(async ([depart, positions]) => {
    const releves = Array.from({ length: 5 }, (_, i) => ({
      tMs: i * 30_000,
      vitesseMs: 12 + i,
      altitudeM: 30 + i * 4,
      ...(positions ? { lon: 2.35 + i / 500, lat: 48.85 + i / 800 } : {}),
    }));
    const trajet = {
      id: `t-${positions ? 'avec' : 'sans'}`,
      departMs: depart as number,
      titre: positions ? 'Domicile → Travail' : 'Vieux parcours',
      resume: { dureeMs: 1_800_000, distanceM: 21_000, arrets: 0, arretMs: 0 },
      releves,
      arrivee: { lon: 2.36, lat: 48.86, libelle: 'Travail' },
    };
    const d = indexedDB.open('infonovice-maps');
    const db: IDBDatabase = await new Promise((ok, ko) => { d.onsuccess = () => ok(d.result); d.onerror = () => ko(d.error); });
    await new Promise<void>((ok, ko) => {
      const t = db.transaction('preferences', 'readwrite');
      t.objectStore('preferences').put([trajet], 'historique-trajets');
      t.oncomplete = () => ok(); t.onerror = () => ko(t.error);
    });
  }, [DEPART, avecPositions] as [number, boolean]);
}

test.beforeEach(async ({ page }) => {
  await simulerTuiles(page);
  await simulerCommunes(page);
});

test('LE TRACÉ ENREGISTRÉ S’EXPORTE EN GPX, avec son altitude et ses heures', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await poserUnParcours(page, true);
  await page.reload();
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });

  await ouvrirVolet(page, '.hist');
  const ligne = page.locator('.iti-hist-ligne').filter({ hasText: 'Domicile → Travail' });
  await expect(ligne).toHaveCount(1, { timeout: 10_000 });
  await ligne.locator('.iti-hist-case').check();

  const bouton = page.getByRole('button', { name: 'Exporter la trace (GPX)' });
  await expect(bouton).toBeEnabled();
  await expect(bouton).toHaveAttribute('title', /5 points/);

  /* AUCUNE REQUÊTE : le fichier se fabrique sur l'appareil. On coupe le
     réseau pour le prouver, plutôt que de compter des appels. */
  await page.context().setOffline(true);
  const telechargement = page.waitForEvent('download');
  await bouton.click();
  const fichier = await telechargement;
  /* LA FLÈCHE DU TITRE NE PASSE PAS DANS LE NOM DE FICHIER, et c'est voulu :
     un nom de fichier se retape, se cherche et voyage entre systèmes. La date
     y est, elle, pour que trois exports du même trajet ne s'écrasent pas. */
  expect(fichier.suggestedFilename()).toBe('Domicile-Travail-2026-09-08.gpx');

  const flux = await fichier.createReadStream();
  const morceaux: Buffer[] = [];
  for await (const m of flux) morceaux.push(m as Buffer);
  const gpx = Buffer.concat(morceaux).toString('utf-8');

  expect(gpx, 'ce n’est pas un GPX').toContain('<gpx version="1.1"');
  expect(gpx, 'les cinq points relevés doivent y être').toContain('lat="48.85" lon="2.35"');
  expect(gpx, 'sans altitude, un autre outil ne calcule aucun dénivelé').toContain('<ele>30.0</ele>');
  expect(gpx, 'sans heure, aucune vitesse ne se recalcule').toContain('<time>2026-09-08T06:30:00.000Z</time>');
  expect(gpx, 'la deuxième heure est trente secondes plus tard').toContain('<time>2026-09-08T06:30:30.000Z</time>');
});

test('UN PARCOURS SANS POSITIONS ÉTEINT LE BOUTON, et dit pourquoi', async ({ page }) => {
  /* Les parcours enregistrés avant HIST-2 n'ont pas de positions. Livrer un
     fichier vide se prendrait pour une panne ; un bouton éteint qui NOMME la
     raison informe. */
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await poserUnParcours(page, false);
  await page.reload();
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });

  await ouvrirVolet(page, '.hist');
  const ligne = page.locator('.iti-hist-ligne').filter({ hasText: 'Vieux parcours' });
  await expect(ligne).toHaveCount(1, { timeout: 10_000 });
  await ligne.locator('.iti-hist-case').check();

  const bouton = page.getByRole('button', { name: 'Exporter la trace (GPX)' });
  await expect(bouton).toBeDisabled();
  await expect(bouton).toHaveAttribute('title', 'Ce parcours n’a pas gardé de positions');
});
