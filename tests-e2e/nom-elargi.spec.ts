import { test, expect } from '@playwright/test';
import { simulerTuiles, simulerCommunes } from './tuiles-simulees';
import { ouvrirVolet } from './volets';

/* CHERCHER UN NOM N'EST PAS SURVOLER LA VUE (BORNES-9, 01/09).
 *
 * Armelin, pour la cinquième fois : « je n'ai toujours pas les bornes
 * McDonald ». MESURÉ dans SON navigateur, sur la production : sa vue au
 * zoom 13 couvre 2,5 km sur 1,9 — et il n'y a réellement AUCUNE borne
 * McDonald dedans (requête au portail : total 0). L'application ne mentait
 * pas ; elle répondait à une question qu'il ne posait pas. À dix kilomètres,
 * il y en a 55. */

test('LE FILTRE PAR NOM CHERCHE PLUS LOIN QUE LA VUE', async ({ page }) => {
  const urls: string[] = [];
  await simulerTuiles(page);
  await simulerCommunes(page);
  await page.route('**/public.opendatasoft.com/**', (route) => {
    const u = decodeURIComponent(route.request().url());
    if (u.includes('/facets') || u.includes('/exports/json')) {
      return route.fulfill({ contentType: 'application/json', body: '[]' });
    }
    urls.push(u);
    /* LA STATION EST À SEPT KILOMÈTRES DU CENTRE : hors de la vue, dans le
       rayon élargi. C'est exactement le cas qu'il décrit. */
    const dedans = /in_bbox\(point_geo,48\.7/.test(u);
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({
      total_count: dedans ? 1 : 0,
      results: dedans ? [{
        point_geo: { lat: 48.7500, lon: 2.5722 },
        nom_station: "IZIVIA FAST - McDonald's - VILLECRESNES",
        nom_enseigne: "McDonald's - Villecresnes", nom_operateur: 'IZIVIA',
        puissance_nominale: 150, nbre_pdc: 4, prise_type_combo_ccs: '1',
        id_station_itinerance: 'FRIZIE1',
      }] : [],
    }) });
  });
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await page.evaluate(() => {
    (window as unknown as { __carte: { jumpTo(o: object): void } })
      .__carte.jumpTo({ center: [2.5722, 48.8103], zoom: 13 });
  });
  await ouvrirVolet(page, '.poi');
  await page.getByRole('checkbox', { name: 'Bornes électriques' }).check();
  await page.getByLabel('Chercher un réseau ou un nom de station').fill('McDonald');

  /* CE QUI PART COMPTE : une emprise ÉLARGIE, et pas seulement la vue. */
  await expect.poll(() => urls.some((u) => /in_bbox\(point_geo,48\.7/.test(u)),
    { message: 'l’emprise n’a pas été élargie', timeout: 10_000 }).toBe(true);

  // ET LA CARTE MONTRE LA STATION TROUVÉE HORS DE LA VUE.
  await expect.poll(() => page.evaluate(() => {
    const s = (window as unknown as { __carte: { getSource(id: string): unknown } })
      .__carte.getSource('poi-bornes') as { _data?: { geojson?: { features?: unknown[] } } };
    return s?._data?.geojson?.features?.length ?? 0;
  }), { timeout: 10_000 }).toBeGreaterThan(0);

  /* ET ON LE DIT : des punaises hors écran sans explication laisseraient
     croire à un bogue de plus. */
  await expect(page.locator('.poi-etat')).toContainText('recherche élargie à 10 km');
});
