import { test, expect } from '@playwright/test';
import { simulerTuiles, simulerCommunes } from './tuiles-simulees';

/* LE PIED DU VOLET RESTE SOUS LES YEUX (ITI-1, 01/09).
 *
 * Armelin : « si je scrolle tout en bas de la fenêtre itinéraire jusqu'à
 * afficher la feuille de route, je suis obligé de scroller à nouveau vers le
 * haut pour retrouver le bouton "Démarrer le suivi", ce qui n'est pas
 * pratique ». Le résumé voyage avec lui : les kilomètres et l'heure d'arrivée
 * sont ce qu'on relit AVANT de partir. */

test('« DÉMARRER LE SUIVI » RESTE À L’ÉCRAN QUAND ON FAIT DÉFILER LE VOLET', async ({ page }) => {
  await simulerTuiles(page);
  await simulerCommunes(page);
  await page.route('**/data.geopf.fr/navigation/itineraire**', (route) => {
    if (/resource=bdtopo-pgr/.test(route.request().url())) {
      return route.fulfill({ contentType: 'application/json', body: '{"portions":[]}' });
    }
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        geometry: { type: 'LineString', coordinates: [[2.3522, 48.8566], [4.8357, 45.764]] },
        distance: 465_000, duration: 15_480,
      }),
    });
  });
  await page.goto('/#iti=2.35220,48.85660;4.83570,45.76400;car');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  const bouton = page.getByRole('button', { name: 'Démarrer le suivi' });
  await expect(bouton).toBeVisible({ timeout: 15_000 });

  /* ON FAIT DÉFILER LE VOLET JUSQU'EN BAS, comme lui : c'est là que le bouton
     disparaissait. On mesure ensuite qu'il est TOUJOURS DANS LA BOÎTE du
     volet — la seule preuve qui vaille, puisque `toBeVisible` reste vrai pour
     un élément simplement sorti du cadre par le défilement. */
  const mesure = await page.evaluate(() => {
    const corps = document.querySelector('.iti-corps') as HTMLElement;
    corps.scrollTop = corps.scrollHeight;
    return new Promise<{ sousLeHaut: number; surLeBas: number;
      defile: boolean; colle: string }>((resoudre) => {
      requestAnimationFrame(() => {
        const b = document.querySelector('.iti-demarrer')!.getBoundingClientRect();
        const c = corps.getBoundingClientRect();
        resoudre({
          /* LES DEUX BORDS, ET C'EST TOUT L'INTÉRÊT. Une première version ne
             regardait que le bas : sans collage, le bouton part par le HAUT
             quand on défile, et l'assertion passait sans rien prouver.
             Mesuré : −416 px sans collage — le test était creux. */
          sousLeHaut: Math.round(b.top - c.top),
          surLeBas: Math.round(c.bottom - b.bottom),
          defile: corps.scrollHeight > corps.clientHeight + 4,
          colle: getComputedStyle(document.querySelector('.iti-pied')!).position,
        });
      });
    });
  });

  /* SANS DÉFILEMENT, LE PARCOURS NE PROUVERAIT RIEN : on vérifie d'abord que
     le volet déborde vraiment (mesuré : 867 px de contenu pour 485 de cadre). */
  expect(mesure.defile, 'le volet doit déborder, sinon ce test est creux').toBe(true);
  expect(mesure.colle, 'le pied doit coller').toBe('sticky');
  expect(mesure.sousLeHaut,
    'le bouton ne doit pas être sorti par le haut').toBeGreaterThanOrEqual(0);
  expect(mesure.surLeBas,
    'ni dépasser sous le volet').toBeGreaterThanOrEqual(0);

  // ET LE RÉSUMÉ AVEC LUI : un bouton qui s'engage sans dire à quoi ne suffit pas.
  await expect(page.locator('.iti-pied .iti-resultat')).toContainText('465 km');
});
