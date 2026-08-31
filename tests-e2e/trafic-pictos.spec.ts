import { test, expect } from '@playwright/test';
import { simulerTuiles, simulerCommunes } from './tuiles-simulees';
import { ouvrirVolet } from './volets';

test('LES ÉVÉNEMENTS PORTENT UN DESSIN, plus un rond de couleur', async ({ page }) => {
  /* PAS DE PETIT VIEWPORT : à 760 px, l'en-tête replié recouvrait le bouton
     Menu sur la machine de CI (polices plus larges), et le clic tombait sur
     le champ de recherche. La mesure ne dépend pas de la taille d'écran. */
  await simulerTuiles(page); await simulerCommunes(page);
  await page.route('**/www.bison-fute.gouv.fr/data/iteration/date.json',
    (r) => r.fulfill({ contentType: 'application/json', body: '[1787353503716]' }));
  await page.route('**/www1.bison-fute.gouv.fr/data/**/evenementsOL6.json',
    (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({
      type: 'FeatureCollection',
      features: [
        { geometry: { type: 'Point', coordinates: [695546.6, 6813337.5] },
          properties: { type: 'ACCIDENT', etat_evenement: 'EFFECTIF', urlcpc: '' } },
        { geometry: { type: 'Point', coordinates: [698146.6, 6813337.5] },
          properties: { type: 'OBSTACLE', etat_evenement: 'EFFECTIF', urlcpc: '' } },
        { geometry: { type: 'Point', coordinates: [700746.6, 6813337.5] },
          properties: { type: 'BOUCHON', etat_evenement: 'EFFECTIF', urlcpc: '' } },
        { geometry: { type: 'Point', coordinates: [703346.6, 6813337.5] },
          properties: { type: 'COUPURE', etat_evenement: 'EFFECTIF', urlcpc: '' } },
        { geometry: { type: 'Point', coordinates: [705946.6, 6813337.5] },
          properties: { type: 'INTEMPERIES', etat_evenement: 'EFFECTIF', urlcpc: '' } },
        { geometry: { type: 'Point', coordinates: [695546.6, 6810737.5] },
          properties: { type: 'RESTRICTION', etat_evenement: 'EFFECTIF', urlcpc: '' } },
        { geometry: { type: 'Point', coordinates: [698146.6, 6810737.5] },
          properties: { type: 'INTERDICTION_PL', etat_evenement: 'EFFECTIF', urlcpc: '' } },
        { geometry: { type: 'Point', coordinates: [700746.6, 6810737.5] },
          properties: { type: 'MESURE_GESTION_TRAFIC', etat_evenement: 'EFFECTIF', urlcpc: '' } },
        { geometry: { type: 'Point', coordinates: [703346.6, 6810737.5] },
          properties: { type: 'INFORMATION', etat_evenement: 'EFFECTIF', urlcpc: '' } },
        { geometry: { type: 'Point', coordinates: [705946.6, 6810737.5] },
          properties: { type: 'TRAVAUX', etat_evenement: 'EFFECTIF', urlcpc: '' } },
      ],
    }) }));
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await ouvrirVolet(page, '.trafic');
  await page.getByRole('checkbox', { name: /Événements routiers/ }).check();
  await expect(page.locator('.trafic-etat')).toContainText('10 événements', { timeout: 15_000 });
  await page.evaluate(() => {
    (window as unknown as { __carte: { jumpTo(o: object): void } })
      .__carte.jumpTo({ center: [2.995, 48.408], zoom: 11 });
  });
  /* TRAFIC-2 (31/08). Armelin : « les accidents sont représentés sous forme
     de rond rouge, ce qui n'est pas visuellement parlant ». Une couleur se
     DÉCODE, un dessin se RECONNAÎT. On vérifie que la couche est passée au
     symbole, que chaque type porte SON image, et que les images sont
     réellement dessinées dans la carte — une clé sans image ferait un trou. */
  /* LE RENDU EST ASYNCHRONE : on interroge la carte quand elle a fini de
     peindre, pas au retour du `jumpTo` — mesurer trop tôt lit une carte
     vide. */
  await expect.poll(() => page.evaluate(() =>
    (window as unknown as { __carte: {
      queryRenderedFeatures(o: object): unknown[];
    } }).__carte.queryRenderedFeatures({ layers: ['trafic-points'] }).length,
  ), { timeout: 15_000 }).toBeGreaterThanOrEqual(10);

  const mesure = await page.evaluate(() => {
    const c = (window as unknown as { __carte: {
      getLayer(id: string): { type?: string } | undefined;
      queryRenderedFeatures(o: object): { properties: Record<string, string> }[];
      hasImage(id: string): boolean;
    } }).__carte;
    const images = [...new Set(c.queryRenderedFeatures({ layers: ['trafic-points'] })
      .map((f) => f.properties['image']))].sort();
    return {
      type: c.getLayer('trafic-points')?.type,
      images,
      toutesDessinees: images.every((i) => i !== undefined && c.hasImage(i)),
    };
  });
  expect(mesure.type, 'la couche doit être un symbole, plus un cercle').toBe('symbol');
  // L'accident et le chantier — les deux qu'il nomme — ont chacun leur dessin.
  expect(mesure.images).toContain('trafic-ACCIDENT');
  expect(mesure.images).toContain('trafic-TRAVAUX');
  expect(mesure.images).toContain('trafic-OBSTACLE');
  expect(new Set(mesure.images).size, 'deux types partagent un dessin')
    .toBeGreaterThanOrEqual(10);
  expect(mesure.toutesDessinees, 'une clé d’image sans image ferait un trou').toBe(true);
});
