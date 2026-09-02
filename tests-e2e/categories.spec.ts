import { test, expect } from '@playwright/test';
import { simulerTuiles, simulerCommunes } from './tuiles-simulees';
import { ouvrirVolet } from './volets';

/* LA RECHERCHE PAR CATÉGORIES — mandat UX du 28/08 (PR POI-1) : pharmacies,
 * restaurants… « dans la vue, à la demande ». Ce que ces parcours défendent
 * avant tout : la FRUGALITÉ. Un clic = un appel Overpass ; déplacer la carte
 * n'en refait pas ; sous le zoom 12, on refuse en disant pourquoi.
 */

test.beforeEach(async ({ page }) => {
  await simulerTuiles(page);
  await simulerCommunes(page);
});

test('un clic, un appel — et la carte qui bouge n’en refait PAS', async ({ page }) => {
  const requetes: string[] = [];
  await page.route('**overpass.openstreetmap.fr**', (route) => {
    requetes.push(decodeURIComponent(route.request().url()));
    return route.fulfill({
      headers: { 'Access-Control-Allow-Origin': '*' },
      contentType: 'application/json',
      body: JSON.stringify({ elements: [
        { lat: 48.851, lon: 2.351, tags: { name: 'Pharmacie du Centre' } },
        { center: { lat: 48.852, lon: 2.352 }, tags: { brand: 'Grande Pharmacie' } },
      ] }),
    });
  });
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await page.evaluate(() => {
    (window as unknown as { __carte: { jumpTo(o: object): void } }).__carte
      .jumpTo({ center: [2.3522, 48.8566], zoom: 13 });
  });
  await ouvrirVolet(page, '.poi');

  /* ON DÉSIGNE LA CATÉGORIE « À LA DEMANDE », pas la famille continue de
     l'entonnoir : depuis ERGO-3 (02/09) les deux vivent dans le même
     panneau, et elles portent les mêmes libellés. Ce parcours juge le
     mécanisme « un clic, un appel » — celui du panneau de recharge. */
  const bouton = page.locator('.poi-categorie[data-cle="sante"]');
  await bouton.click();
  const etat = page.locator('.poi-categorie-etat');
  await expect(etat).toContainText('2 dans la vue');
  // Le contrat est ÉCRIT : la liste ne suit pas la carte.
  await expect(etat).toContainText('ne suit pas la carte');
  await expect(bouton).toHaveAttribute('aria-pressed', 'true');
  // L'appel est parti UNE fois, avec le bon filtre et l'emprise Overpass.
  expect(requetes).toHaveLength(1);
  expect(requetes[0]).toContain('pharmacy');
  // LA FAMILLE S'EST ÉLARGIE le 31/08 : le dentiste et le vétérinaire
  // doivent partir dans la MÊME requête, pas dans une de plus.
  expect(requetes[0]).toContain('dentist');
  expect(requetes[0]).toContain('veterinary');

  // Les deux lieux sont posés — le chemin (center) compte comme le nœud.
  const nombre = await page.evaluate(() => {
    const src = (window as unknown as { __carte: {
      getSource(n: string): { serialize(): { data: { features: unknown[] } } } | undefined;
    } }).__carte.getSource('poi-categorie');
    return src ? src.serialize().data.features.length : 0;
  });
  expect(nombre).toBe(2);

  // DÉPLACER LA CARTE NE RAPPELLE PAS LE SERVICE — c'est tout le contrat.
  await page.evaluate(() => {
    (window as unknown as { __carte: { jumpTo(o: object): void } }).__carte
      .jumpTo({ center: [2.40, 48.90], zoom: 13 });
  });
  await page.waitForTimeout(900);
  expect(requetes, 'un déplacement a rappelé Overpass').toHaveLength(1);

  // Recliquer la catégorie ACTIVE efface tout, proprement.
  await bouton.click();
  await expect(bouton).toHaveAttribute('aria-pressed', 'false');
  await expect(etat).toBeEmpty();
  const restant = await page.evaluate(() => Boolean(
    (window as unknown as { __carte: { getSource(n: string): unknown } })
      .__carte.getSource('poi-categorie')));
  expect(restant, 'la source a survécu à l’effacement').toBe(false);
});

test('sous le zoom 12, on REFUSE en disant pourquoi — aucun appel ne part', async ({ page }) => {
  let appels = 0;
  await page.route('**overpass.openstreetmap.fr**', (route) => {
    appels += 1;
    return route.fulfill({
      headers: { 'Access-Control-Allow-Origin': '*' },
      contentType: 'application/json', body: JSON.stringify({ elements: [] }),
    });
  });
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await ouvrirVolet(page, '.poi');

  // La France entière est à l'écran (zoom 5,4) : chercher serait mentir.
  await page.locator('.poi-categorie[data-cle="restaurant"]').click();
  await expect(page.locator('.poi-categorie-etat')).toContainText('Rapprochez-vous');
  expect(appels, 'un appel est parti malgré le refus').toBe(0);
});

test('Overpass saturé : un message français, et l’état repart propre', async ({ page }) => {
  await page.route('**overpass.openstreetmap.fr**', (route) => route.fulfill({
    headers: { 'Access-Control-Allow-Origin': '*' },
    contentType: 'text/html', body: '<html>rate_limited</html>',
  }));
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await page.evaluate(() => {
    (window as unknown as { __carte: { jumpTo(o: object): void } }).__carte
      .jumpTo({ center: [2.3522, 48.8566], zoom: 13 });
  });
  await ouvrirVolet(page, '.poi');

  /* LE NOM DE CETTE CASE A CHANGÉ DEUX FOIS, et le parcours n'y perd rien :
     ce qu'il défend est la phrase d'erreur, pas l'étiquette du bouton.
     « Boulangeries » est entrée dans « Commerces » le 30/08 ; « Pharmacies »
     est devenue « Santé » le 31/08, pour que le dentiste et le vétérinaire
     soient cherchables. */
  /* ON DÉSIGNE LA CATÉGORIE « À LA DEMANDE », pas la famille continue de
     l'entonnoir : depuis ERGO-3 (02/09) les deux vivent dans le même
     panneau, et elles portent les mêmes libellés. Ce parcours juge le
     mécanisme « un clic, un appel » — celui du panneau de recharge. */
  const bouton = page.locator('.poi-categorie[data-cle="sante"]');
  await bouton.click();
  await expect(page.locator('.poi-categorie-etat')).toContainText('saturé');
  // Le bouton n'est plus « actif » sur du vide : on peut réessayer d'un clic.
  await expect(bouton).toHaveAttribute('aria-pressed', 'false');
});
