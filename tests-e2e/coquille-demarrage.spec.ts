import { test, expect } from '@playwright/test';
import { simulerTuiles, simulerCommunes } from './tuiles-simulees';

/* LA COQUILLE D'ATTENTE DE LA BARRE DE RECHERCHE (PERF-1, 04/09).
 *
 * MESURÉ PAR LIGHTHOUSE MOBILE EN PRODUCTION : Performance 52 — la règle du
 * projet exige ≥ 90 — et le plus grand élément peint (LCP) est le texte
 * « Rechercher une adresse… », arrivé à 5,0 s dont 4,3 s de « render
 * delay » : la barre naissait en JavaScript, après tout le bundle. Une
 * coquille inerte, dans le HTML, tient sa place avec la MÊME géométrie ; le
 * composant la retire en se posant.
 *
 * DEUX PROMESSES À GARDER : la coquille existe sans script (c'est tout son
 * sens), et elle a la géométrie exacte de la vraie barre — sinon le
 * remplacement ferait sauter la page (CLS), et l'on aurait troqué un défaut
 * contre un autre. */

test('SANS SCRIPT, la barre d’attente est déjà là — et elle est inerte', async ({ browser }) => {
  const contexte = await browser.newContext({ javaScriptEnabled: false });
  const page = await contexte.newPage();
  await page.goto('/');
  const attente = page.locator('.entete .recherche-attente input');
  await expect(attente).toBeVisible();
  await expect(attente).toHaveAttribute('placeholder', 'Rechercher une adresse…');
  await expect(attente).toBeDisabled();
  await expect(page.locator('.entete .recherche-attente')).toHaveAttribute('aria-hidden', 'true');
  await contexte.close();
});

test('LA VRAIE BARRE PREND EXACTEMENT SA PLACE — jamais deux barres, jamais aucune', async ({ browser }) => {
  /* La géométrie de la coquille se lit SANS script : c'est celle que
     l'usager voit en premier. */
  const inerte = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  const p1 = await inerte.newPage();
  await p1.goto('/');
  const avant = await p1.locator('.entete .recherche-attente input').boundingBox();
  await inerte.close();
  expect(avant).not.toBeNull();

  const vivant = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p2 = await vivant.newPage();
  await simulerTuiles(p2);
  await simulerCommunes(p2);
  await p2.goto('/');
  await expect(p2.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await expect(p2.locator('.entete .recherche-attente')).toHaveCount(0);
  const vraie = p2.locator('.entete recherche-adresse .recherche input');
  await expect(vraie).toHaveCount(1);
  const apres = await vraie.boundingBox();
  expect(apres).not.toBeNull();
  /* Au pixel près : même largeur, même hauteur, même coin. */
  for (const cle of ['x', 'y', 'width', 'height'] as const) {
    expect(Math.abs((apres as DOMRect)[cle] - (avant as DOMRect)[cle]), `${cle} doit coïncider`)
      .toBeLessThanOrEqual(1);
  }
  await vivant.close();
});
